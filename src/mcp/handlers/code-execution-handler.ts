/**
 * Code Execution Handler
 *
 * Handles pml:execute_code MCP tool requests with sandbox execution,
 * tool discovery, and capability learning.
 *
 * @module mcp/handlers/code-execution-handler
 */

import * as log from "@std/log";
import type { GraphRAGEngine } from "../../graphrag/graph-engine.ts";
import type { VectorSearch } from "../../vector/search.ts";
import type { CapabilityStore } from "../../capabilities/capability-store.ts";
import type { AdaptiveThresholdManager } from "../adaptive-threshold.ts";
import type { MCPClientBase, CodeExecutionRequest, CodeExecutionResponse } from "../types.ts";
import type { MCPToolResponse, MCPErrorResponse, ResolvedGatewayConfig } from "../server/types.ts";
import { ServerDefaults } from "../server/constants.ts";
import { formatMCPToolError } from "../server/responses.ts";
import { DenoSandboxExecutor, type WorkerExecutionConfig } from "../../sandbox/executor.ts";
import { ContextBuilder } from "../../sandbox/context-builder.ts";
import { CapabilityCodeGenerator } from "../../capabilities/code-generator.ts";
import { hashCode } from "../../capabilities/hash.ts";

/**
 * Dependencies required for code execution handler
 */
export interface CodeExecutionDependencies {
  vectorSearch: VectorSearch;
  graphEngine: GraphRAGEngine;
  mcpClients: Map<string, MCPClientBase>;
  capabilityStore?: CapabilityStore;
  adaptiveThresholdManager?: AdaptiveThresholdManager;
  config: ResolvedGatewayConfig;
  contextBuilder: ContextBuilder;
  toolSchemaCache: Map<string, string>;
}

/**
 * Handle code execution request (Story 3.4)
 *
 * Supports two modes:
 * 1. Intent-based: Natural language → vector search → tool injection → execute
 * 2. Explicit: Direct code execution with provided context
 *
 * @param args - Code execution arguments
 * @param deps - Handler dependencies
 * @returns Execution result with metrics
 */
export async function handleExecuteCode(
  args: unknown,
  deps: CodeExecutionDependencies,
): Promise<MCPToolResponse | MCPErrorResponse> {
  try {
    const request = args as CodeExecutionRequest;

    // Validate required parameters
    if (!request.code || typeof request.code !== "string") {
      return formatMCPToolError(
        "Missing or invalid required parameter: 'code' must be a non-empty string",
      );
    }

    // Validate code size (max 100KB)
    const codeSizeBytes = new TextEncoder().encode(request.code).length;
    if (codeSizeBytes > ServerDefaults.maxCodeSizeBytes) {
      return formatMCPToolError(
        `Code size exceeds maximum: ${codeSizeBytes} bytes (max: ${ServerDefaults.maxCodeSizeBytes})`,
      );
    }

    log.info("Executing code in sandbox", {
      intent: request.intent ? `"${request.intent.substring(0, 50)}..."` : "none",
      contextKeys: request.context ? Object.keys(request.context) : [],
      codeSize: codeSizeBytes,
    });

    // Build execution context (for non-tool variables)
    // Story 8.3: Include intent in context for capability learning
    const executionContext = {
      ...request.context,
      intent: request.intent,
    };

    // Configure sandbox
    const sandboxConfig = request.sandbox_config || {};
    const executor = new DenoSandboxExecutor({
      timeout: sandboxConfig.timeout ?? 30000,
      memoryLimit: sandboxConfig.memoryLimit ?? 512,
      allowedReadPaths: sandboxConfig.allowedReadPaths ?? [],
      piiProtection: deps.config.piiProtection,
      cacheConfig: deps.config.cacheConfig,
      // Story 8.3: Enable capability learning from code execution
      capabilityStore: deps.capabilityStore,
      graphRAG: deps.graphEngine,
    });

    // Set tool versions for cache key generation (Story 3.7)
    const toolVersions = buildToolVersionsMap(deps.toolSchemaCache);
    executor.setToolVersions(toolVersions);

    // Story 7.1b: Use Worker RPC Bridge for tool execution with native tracing
    let toolDefinitions: import("../../sandbox/types.ts").ToolDefinition[] = [];
    let toolsCalled: string[] = [];
    let matchedCapabilities: Array<{
      capability: import("../../capabilities/types.ts").Capability;
      semanticScore: number;
    }> = [];

    // Capability context for injection (Story 8.3)
    let capabilityContext: string | undefined;

    // Intent-based mode: discover tools AND existing capabilities
    if (request.intent) {
      log.debug("Intent-based mode: discovering relevant tools and capabilities");

      // 1. Search for existing capabilities (Story 8.3: capability reuse)
      if (deps.capabilityStore) {
        try {
          matchedCapabilities = await deps.capabilityStore.searchByIntent(request.intent, 3, 0.7);
          if (matchedCapabilities.length > 0) {
            log.info(`Found ${matchedCapabilities.length} matching capabilities for intent`, {
              topMatch: matchedCapabilities[0].capability.name,
              topScore: matchedCapabilities[0].semanticScore.toFixed(2),
            });

            // Generate capability context for sandbox injection
            const codeGenerator = new CapabilityCodeGenerator();
            const capabilities = matchedCapabilities.map((mc) => mc.capability);
            capabilityContext = codeGenerator.buildCapabilitiesObject(capabilities);

            log.info("[execute_code] Capability context generated", {
              capabilitiesInjected: matchedCapabilities.length,
              capabilityNames: matchedCapabilities.map((c) => c.capability.name),
              contextCodeLength: capabilityContext.length,
            });
          }
        } catch (capError) {
          log.warn(`Capability search failed: ${capError}`);
        }
      }

      // 2. Use hybrid search for tools (ADR-022)
      const hybridResults = await deps.graphEngine.searchToolsHybrid(
        deps.vectorSearch,
        request.intent,
        10,
        [],
        false,
      );

      if (hybridResults.length > 0) {
        log.debug(`Found ${hybridResults.length} relevant tools via hybrid search`);

        // Convert HybridSearchResult to SearchResult format for buildToolDefinitions
        const toolResults = hybridResults.map((hr) => ({
          toolId: hr.toolId,
          serverId: hr.serverId,
          toolName: hr.toolName,
          score: hr.finalScore,
          schema: {
            name: hr.toolName,
            description: hr.description,
            inputSchema: (hr.schema?.inputSchema || {}) as Record<string, unknown>,
          },
        }));

        // Build tool definitions for Worker RPC bridge
        toolDefinitions = deps.contextBuilder.buildToolDefinitions(toolResults);
      } else {
        log.warn("No relevant tools found for intent via hybrid search");
      }
    }

    // Execute code using Worker RPC bridge (Story 7.1b)
    const startTime = performance.now();
    const workerConfig: WorkerExecutionConfig = {
      toolDefinitions,
      mcpClients: deps.mcpClients,
    };

    const result = await executor.executeWithTools(
      request.code,
      workerConfig,
      executionContext,
      capabilityContext,
    );
    const executionTimeMs = performance.now() - startTime;

    // Handle capability feedback (Story 7.3a / AC6)
    if (deps.capabilityStore && deps.adaptiveThresholdManager && result.success) {
      await recordCapabilityFeedback(
        request,
        executionTimeMs,
        deps.capabilityStore,
        deps.adaptiveThresholdManager,
      );
    }

    // Handle execution failure
    if (!result.success) {
      const error = result.error!;
      return formatMCPToolError(
        `Code execution failed: ${error.type} - ${error.message}`,
        {
          error_type: error.type,
          error_message: error.message,
          stack: error.stack,
          executionTimeMs: executionTimeMs,
        },
      );
    }

    // Story 7.1b: Process native traces
    let trackedToolsCount = 0;
    if (result.toolsCalled && result.toolsCalled.length > 0) {
      toolsCalled = result.toolsCalled;
      log.info(`[Story 7.1b] Tracked ${toolsCalled.length} tool calls via native tracing`, {
        tools: toolsCalled,
      });

      // Build WorkflowExecution from traced tool calls
      const tracedDAG = {
        tasks: toolsCalled.map((tool, index) => ({
          id: `traced_${index}`,
          tool,
          arguments: {},
          dependsOn: index > 0 ? [`traced_${index - 1}`] : [],
        })),
      };

      // Update GraphRAG with execution data
      await deps.graphEngine.updateFromExecution({
        executionId: crypto.randomUUID(),
        executedAt: new Date(),
        intentText: request.intent ?? "code_execution",
        dagStructure: tracedDAG,
        success: true,
        executionTimeMs: executionTimeMs,
      });

      trackedToolsCount = toolsCalled.length;
    }

    // Log native trace stats
    if (result.traces && result.traces.length > 0) {
      log.debug(`[Story 7.1b] Captured ${result.traces.length} native trace events`);
    }

    // ADR-043: Extract failed tools from traces
    const toolFailures: Array<{ tool: string; error: string }> = [];
    if (result.traces) {
      for (const trace of result.traces) {
        if (trace.type === "tool_end" && !trace.success && "tool" in trace) {
          const toolTrace = trace as { tool: string; error?: string };
          toolFailures.push({
            tool: toolTrace.tool,
            error: toolTrace.error ?? "Unknown error",
          });
        }
      }
      if (toolFailures.length > 0) {
        log.warn(`[ADR-043] ${toolFailures.length} tool(s) failed during execution`, {
          failedTools: toolFailures.map((f) => f.tool),
        });
      }
    }

    // Calculate output size
    const outputSizeBytes = new TextEncoder().encode(
      JSON.stringify(result.result),
    ).length;

    // Build response
    const response: CodeExecutionResponse = {
      result: result.result,
      logs: [],
      metrics: {
        executionTimeMs: result.executionTimeMs,
        inputSizeBytes: codeSizeBytes,
        outputSizeBytes,
      },
      state: executionContext,
      matched_capabilities: matchedCapabilities.length > 0
        ? matchedCapabilities.map((mc) => ({
          id: mc.capability.id,
          name: mc.capability.name ?? null,
          code_snippet: mc.capability.codeSnippet,
          semantic_score: mc.semanticScore,
          success_rate: mc.capability.successRate,
          usage_count: mc.capability.usageCount,
        }))
        : undefined,
      tool_failures: toolFailures.length > 0 ? toolFailures : undefined,
    };

    log.info("Code execution succeeded", {
      executionTimeMs: response.metrics.executionTimeMs.toFixed(2),
      outputSize: outputSizeBytes,
      trackedTools: trackedToolsCount,
      matchedCapabilities: matchedCapabilities.length,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error) {
    log.error(`execute_code error: ${error}`);
    return formatMCPToolError(
      `Code execution failed: ${(error as Error).message}`,
    );
  }
}

/**
 * Record capability feedback for adaptive learning (Story 7.3a)
 */
async function recordCapabilityFeedback(
  request: CodeExecutionRequest,
  executionTimeMs: number,
  capabilityStore: CapabilityStore,
  adaptiveThresholdManager: AdaptiveThresholdManager,
): Promise<void> {
  try {
    const codeHash = await hashCode(request.code);
    const capability = await capabilityStore.findByCodeHash(codeHash);

    if (capability) {
      // Update usage stats
      await capabilityStore.updateUsage(codeHash, true, executionTimeMs);

      // Record execution for adaptive learning
      const confidence = capability.successRate;

      adaptiveThresholdManager.recordExecution({
        mode: "speculative",
        confidence: confidence,
        success: true,
        executionTime: executionTimeMs,
        timestamp: Date.now(),
      });

      log.info(`[Story 7.3a] Capability feedback recorded`, { id: capability.id });
    }
  } catch (err) {
    log.warn(`[Story 7.3a] Failed to record capability feedback: ${err}`);
  }
}

/**
 * Build tool versions map for cache key generation (Story 3.7)
 */
function buildToolVersionsMap(toolSchemaCache: Map<string, string>): Record<string, string> {
  const versions: Record<string, string> = {};
  for (const [toolKey, schemaHash] of toolSchemaCache.entries()) {
    versions[toolKey] = schemaHash;
  }
  return versions;
}
