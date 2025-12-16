/**
 * MCP Gateway Server
 *
 * Exposes Casys PML functionality via MCP protocol (stdio transport)
 * Compatible with Claude Code and other MCP clients.
 *
 * Implements MCP methods:
 * - tools/list: Returns relevant tools (with semantic search)
 * - tools/call: Executes single tool or workflow
 * - prompts/get: Optional prompt retrieval
 *
 * @module mcp/gateway-server
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  type CallToolRequest,
  CallToolRequestSchema,
  type GetPromptRequest,
  GetPromptRequestSchema,
  type ListToolsRequest,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as log from "@std/log";
import type { PGliteClient } from "../db/client.ts";
import type { VectorSearch } from "../vector/search.ts";
import type { GraphRAGEngine } from "../graphrag/graph-engine.ts";
import type { DAGSuggester } from "../graphrag/dag-suggester.ts";
import type { ParallelExecutor } from "../dag/executor.ts";
import { GatewayHandler } from "./gateway-handler.ts";
import type { CodeExecutionRequest, CodeExecutionResponse, MCPClientBase, MCPTool } from "./types.ts";
import type { DAGStructure } from "../graphrag/types.ts";
import { HealthChecker } from "../health/health-checker.ts";
import { DenoSandboxExecutor, type WorkerExecutionConfig } from "../sandbox/executor.ts";
import { ContextBuilder } from "../sandbox/context-builder.ts";
// TraceEvent imported from sandbox/types.ts is now used via executeWithTools result
import { addBreadcrumb, captureError, startTransaction } from "../telemetry/sentry.ts";
import type { CapabilityStore } from "../capabilities/capability-store.ts";
import type { AdaptiveThresholdManager } from "./adaptive-threshold.ts";
import { hashCode } from "../capabilities/hash.ts";
import { CapabilityDataService } from "../capabilities/mod.ts";
import { CapabilityCodeGenerator } from "../capabilities/code-generator.ts";
// Story 2.5-4: MCP Control Tools & Per-Layer Validation
import {
  deleteWorkflowDAG,
  extendWorkflowDAGExpiration,
  getWorkflowDAG,
  saveWorkflowDAG,
  updateWorkflowDAG,
} from "./workflow-dag-store.ts";
import { ControlledExecutor } from "../dag/controlled-executor.ts";
import { CheckpointManager } from "../dag/checkpoint-manager.ts";
import type { ExecutionEvent, TaskResult } from "../dag/types.ts";
import { EventsStreamManager } from "../server/events-stream.ts";
import { logAuthMode, validateAuthConfig, validateRequest } from "../lib/auth.ts";
import { RateLimiter } from "../utils/rate-limiter.ts";
import { getRateLimitKey } from "../lib/rate-limiter-helpers.ts";

/**
 * MCP JSON-RPC error codes
 */
const MCPErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

// ============================================
// Story 7.1b: Native Tracing via Worker RPC Bridge
// ============================================
// The parseTraces() function from Story 7.1 has been removed.
// Tracing is now handled natively in WorkerBridge (src/sandbox/worker-bridge.ts).
// See ADR-032 for details on the Worker RPC Bridge architecture.

/**
 * MCP Gateway Server Configuration
 */
export interface GatewayServerConfig {
  name?: string;
  version?: string;
  enableSpeculative?: boolean;
  defaultToolLimit?: number;
  piiProtection?: {
    enabled: boolean;
    types?: Array<"email" | "phone" | "credit_card" | "ssn" | "api_key">;
    detokenizeOutput?: boolean;
  };
  cacheConfig?: {
    enabled: boolean;
    maxEntries?: number;
    ttlSeconds?: number;
    persistence?: boolean;
  };
}

/**
 * MCP Gateway Server
 *
 * Transparent gateway that exposes Casys PML as a single MCP server.
 * Claude Code sees all tools from all MCP servers + workflow execution capability.
 */
/**
 * Active workflow state for per-layer validation (Story 2.5-4)
 */
interface ActiveWorkflow {
  workflowId: string;
  executor: ControlledExecutor;
  generator: AsyncGenerator<ExecutionEvent, import("../dag/state.ts").WorkflowState, void>;
  dag: DAGStructure;
  currentLayer: number;
  totalLayers: number;
  layerResults: TaskResult[];
  status: "running" | "paused" | "complete" | "aborted" | "awaiting_approval";
  createdAt: Date;
  lastActivityAt: Date;
  latestCheckpointId: string | null;
}

export class PMLGatewayServer {
  private server: Server;
  private gatewayHandler: GatewayHandler;
  private healthChecker: HealthChecker;
  private config: Required<GatewayServerConfig>;
  private contextBuilder: ContextBuilder;
  private toolSchemaCache: Map<string, string> = new Map(); // serverId:toolName → schema hash
  private httpServer: Deno.HttpServer | null = null; // HTTP server for SSE transport (ADR-014)
  private activeWorkflows: Map<string, ActiveWorkflow> = new Map(); // Story 2.5-4
  private checkpointManager: CheckpointManager | null = null; // Story 2.5-4
  private eventsStream: EventsStreamManager | null = null; // Story 6.1: Real-time graph events
  private capabilityDataService: CapabilityDataService; // Story 8.1: Capability Data API

  constructor(
    // @ts-ignore: db kept for future use (direct queries)
    private db: PGliteClient,
    private vectorSearch: VectorSearch,
    private graphEngine: GraphRAGEngine,
    private dagSuggester: DAGSuggester,
    // @ts-ignore: executor kept for API backward compatibility
    private _executor: ParallelExecutor,
    private mcpClients: Map<string, MCPClientBase>,
    // Optional for backward compatibility, but required for Story 7.3a features
    private capabilityStore?: CapabilityStore,
    private adaptiveThresholdManager?: AdaptiveThresholdManager,
    config?: GatewayServerConfig,
  ) {
    // Merge config with defaults
    this.config = {
      name: config?.name ?? "mcp-gateway",
      version: config?.version ?? "1.0.0",
      enableSpeculative: config?.enableSpeculative ?? true,
      defaultToolLimit: config?.defaultToolLimit ?? 10,
      piiProtection: config?.piiProtection ?? {
        enabled: true,
        types: ["email", "phone", "credit_card", "ssn", "api_key"],
        detokenizeOutput: false,
      },
      cacheConfig: config?.cacheConfig ?? {
        enabled: true,
        maxEntries: 100,
        ttlSeconds: 300,
        persistence: false,
      },
    };

    // Initialize MCP Server
    this.server = new Server(
      {
        name: this.config.name,
        title: "PML Gateway - Describe what you want, I find the tools and execute. Use execute_dag with 'intent' to get started.",
        version: this.config.version,
      },
      {
        capabilities: {
          tools: {},
          prompts: {},
        },
      },
    );

    // Initialize Gateway Handler (ADR-030: pass mcpClients for real execution)
    this.gatewayHandler = new GatewayHandler(
      this.graphEngine,
      this.dagSuggester,
      this.mcpClients, // ADR-030: enable real tool execution
      {
        enableSpeculative: this.config.enableSpeculative,
      },
    );

    // Initialize Health Checker
    this.healthChecker = new HealthChecker(this.mcpClients);

    // Initialize Context Builder for tool injection (Story 3.4)
    // Sandbox executors are created per-request with custom config
    this.contextBuilder = new ContextBuilder(this.vectorSearch, this.mcpClients);

    // Initialize CheckpointManager for per-layer validation (Story 2.5-4)
    this.checkpointManager = new CheckpointManager(this.db, true);

    // Initialize CapabilityDataService for API endpoints (Story 8.1)
    this.capabilityDataService = new CapabilityDataService(this.db, this.graphEngine);
    // Story 8.2: Wire DAGSuggester for capability PageRank access
    this.capabilityDataService.setDAGSuggester(this.dagSuggester);

    this.setupHandlers();
  }

  /**
   * Setup MCP protocol handlers
   */
  private setupHandlers(): void {
    // Handler: tools/list
    this.server.setRequestHandler(
      ListToolsRequestSchema,
      async (request: ListToolsRequest) => await this.handleListTools(request),
    );

    // Handler: tools/call
    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request: CallToolRequest) => await this.handleCallTool(request),
    );

    // Handler: prompts/get (optional)
    this.server.setRequestHandler(
      GetPromptRequestSchema,
      async (request: GetPromptRequest) => await this.handleGetPrompt(request),
    );

    log.info("MCP handlers registered: tools/list, tools/call, prompts/get");
  }

  /**
   * Handler: tools/list
   *
   * Returns relevant tools based on optional query context.
   * Uses semantic search when query provided, otherwise returns all tools (with warning).
   *
   * @param request - MCP request with optional params.query
   * @returns List of available tools
   */
  private handleListTools(
    request: unknown,
  ): Promise<
    | { tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> }
    | {
      error: { code: number; message: string; data?: unknown };
    }
  > {
    const transaction = startTransaction("mcp.tools.list", "mcp");
    try {
      const params = (request as { params?: { query?: string } }).params;
      const query = params?.query;

      transaction.setData("has_query", !!query);
      if (query) {
        transaction.setData("query_length", query.length);
      }

      addBreadcrumb("mcp", "Processing tools/list request", { query });

      // ADR-013: Only expose meta-tools to minimize context usage
      // Tool discovery happens via execute_workflow with intent parameter
      // Underlying tools are accessed internally via DAGSuggester + vector search
      log.info(`list_tools: returning meta-tools only (ADR-013)`);
      if (query) {
        log.debug(`Query "${query}" ignored - use execute_dag with intent instead`);
      }

      // Add special DAG execution tool (renamed from execute_workflow - Story 2.5-4)
      const executeDagTool: MCPTool = {
        name: "pml:execute_dag",
        description: `Execute a multi-tool DAG workflow. TWO MODES:

1. INTENT MODE (recommended): Just describe what you want → system auto-discovers tools, builds DAG, executes.
   Example: intent="Read config.json, extract version, create GitHub issue with it"

2. EXPLICIT MODE: Define exact workflow with tasks and dependencies.

The system has access to ALL MCP tools (filesystem, github, fetch, databases, etc). Just ask!`,
        inputSchema: {
          type: "object",
          properties: {
            intent: {
              type: "string",
              description:
                "RECOMMENDED: Just describe your goal in natural language. System auto-discovers tools and builds the workflow. Example: 'Read package.json and list all dependencies'",
            },
            workflow: {
              type: "object",
              description:
                "ADVANCED: Explicit DAG with tasks array and dependencies. Use only if you need precise control.",
            },
          },
          // Note: Both fields optional, but at least one should be provided
          // Claude API doesn't support oneOf at root level, so we document the constraint in description
        },
      };

      // Add search_tools (Spike: search-tools-graph-traversal)
      const searchToolsTool: MCPTool = {
        name: "pml:search_tools",
        description: `Discover available MCP tools via semantic search. Use this to explore what's possible before using execute_dag.

Returns tool names, descriptions, and input schemas. Useful for:
- "What tools can read files?" → filesystem:read_file, filesystem:read_multiple_files...
- "How do I interact with GitHub?" → github:create_issue, github:search_repositories...

Tip: Set include_related=true to see tools often used together (from learned patterns).`,
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "What do you want to do? Example: 'read JSON files', 'interact with GitHub', 'make HTTP requests'",
            },
            limit: {
              type: "number",
              description: "How many tools to return (default: 5)",
            },
            include_related: {
              type: "boolean",
              description: "Also show tools frequently used together with the matches (from usage patterns)",
            },
            context_tools: {
              type: "array",
              items: { type: "string" },
              description: "Tools you're already using - boosts related tools in results",
            },
          },
          required: ["query"],
        },
      };

      // Add search_capabilities tool (Story 7.3a)
      const searchCapabilitiesTool: MCPTool = {
        name: "pml:search_capabilities",
        description: `Search for PROVEN code patterns that worked before. Capabilities are learned from successful executions.

Returns reusable code snippets with success rates. Example:
- intent="create GitHub issue from file" → Returns code that reads file + creates issue (95% success rate)

Use this when you want to reuse existing patterns instead of building from scratch. The returned code can be executed directly via execute_code.`,
        inputSchema: {
          type: "object",
          properties: {
            intent: {
              type: "string",
              description: "What do you want to accomplish? System finds similar past successes.",
            },
            include_suggestions: {
              type: "boolean",
              description: "Also show related capabilities (similar tools or patterns)",
            },
          },
          required: ["intent"],
        },
      };

      // Add code execution tool (Story 3.4)
      const executeCodeTool: MCPTool = {
        name: "pml:execute_code",
        description: `Execute TypeScript/JavaScript code in a secure Deno sandbox with MCP tools auto-injected.

KEY FEATURE: If you provide 'intent', the system auto-discovers relevant MCP tools and injects them as 'mcp.serverName.toolName()' functions.

Example:
  intent: "read a file and parse JSON"
  code: \`
    const content = await mcp.filesystem.read_file({ path: "config.json" });
    return JSON.parse(content);
  \`

The sandbox has access to: Deno APIs, fetch, all discovered MCP tools. Simple expressions auto-return; multi-statement code needs explicit 'return'.`,
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "TypeScript code to run. MCP tools available as mcp.server.tool(). Example: await mcp.filesystem.read_file({path: 'x.json'})",
            },
            intent: {
              type: "string",
              description:
                "RECOMMENDED: Describe what you're doing → system injects relevant MCP tools automatically. Example: 'read files and call GitHub API'",
            },
            context: {
              type: "object",
              description: "Custom data to inject into sandbox as 'context' variable",
            },
            sandbox_config: {
              type: "object",
              description: "Optional: timeout (ms), memoryLimit (MB), allowedReadPaths",
              properties: {
                timeout: {
                  type: "number",
                  description: "Max execution time in ms (default: 30000)",
                },
                memoryLimit: {
                  type: "number",
                  description: "Max heap memory in MB (default: 512)",
                },
                allowedReadPaths: {
                  type: "array",
                  items: { type: "string" },
                  description: "Extra file paths the sandbox can read",
                },
              },
            },
          },
          required: ["code"],
        },
      };

      // Story 2.5-4: Control tools for per-layer validation (ADR-020)
      const continueTool: MCPTool = {
        name: "pml:continue",
        description:
          "Resume a paused DAG workflow. Used when execute_dag returns 'layer_complete' status (per-layer validation mode). Call this to proceed to the next layer after reviewing results.",
        inputSchema: {
          type: "object",
          properties: {
            workflow_id: {
              type: "string",
              description: "The workflow_id returned by execute_dag",
            },
            reason: {
              type: "string",
              description: "Why you're continuing (optional, for logging)",
            },
          },
          required: ["workflow_id"],
        },
      };

      const abortTool: MCPTool = {
        name: "pml:abort",
        description:
          "Stop a running DAG workflow immediately. Use when you detect issues in intermediate results and want to cancel remaining tasks.",
        inputSchema: {
          type: "object",
          properties: {
            workflow_id: {
              type: "string",
              description: "The workflow_id to stop",
            },
            reason: {
              type: "string",
              description: "Why you're aborting (required for audit trail)",
            },
          },
          required: ["workflow_id", "reason"],
        },
      };

      const replanTool: MCPTool = {
        name: "pml:replan",
        description: `Modify a running DAG to add new tasks based on discovered context.

Example: DAG finds XML files unexpectedly → replan to add XML parser task.

The system uses GraphRAG to find appropriate tools for the new requirement and inserts them into the workflow.`,
        inputSchema: {
          type: "object",
          properties: {
            workflow_id: {
              type: "string",
              description: "The workflow_id to modify",
            },
            new_requirement: {
              type: "string",
              description: "What new capability is needed? Example: 'parse the XML files we found'",
            },
            available_context: {
              type: "object",
              description: "Data from previous tasks that informs the replan (e.g., {files: ['a.xml', 'b.xml']})",
            },
          },
          required: ["workflow_id", "new_requirement"],
        },
      };

      const approvalResponseTool: MCPTool = {
        name: "pml:approval_response",
        description:
          "Respond to a Human-in-the-Loop checkpoint. Some DAG tasks require explicit approval before execution (e.g., destructive operations, external API calls). Use this to approve or reject.",
        inputSchema: {
          type: "object",
          properties: {
            workflow_id: {
              type: "string",
              description: "The workflow_id waiting for approval",
            },
            checkpoint_id: {
              type: "string",
              description: "The specific checkpoint_id from the approval request",
            },
            approved: {
              type: "boolean",
              description: "true = proceed with the operation, false = skip/cancel it",
            },
            feedback: {
              type: "string",
              description: "Optional message explaining your decision",
            },
          },
          required: ["workflow_id", "checkpoint_id", "approved"],
        },
      };

      // ADR-013: Only return meta-tools (no underlying tools)
      const result = {
        tools: [
          executeDagTool,
          searchToolsTool,
          searchCapabilitiesTool,
          executeCodeTool,
          continueTool,
          abortTool,
          replanTool,
          approvalResponseTool,
        ].map((schema) => ({
          name: schema.name,
          description: schema.description,
          inputSchema: schema.inputSchema,
        })),
      };
      transaction.setData("tools_returned", 7);

      transaction.finish();
      return Promise.resolve(result);
    } catch (error) {
      log.error(`list_tools error: ${error}`);
      captureError(error as Error, {
        operation: "tools/list",
        handler: "handleListTools",
      });
      transaction.finish();
      return Promise.resolve(this.formatMCPError(
        MCPErrorCodes.INTERNAL_ERROR,
        `Failed to list tools: ${(error as Error).message}`,
      ));
    }
  }

  /**
   * Handler: tools/call
   *
   * Supports both single tool execution and workflow execution.
   * - Single tool: Proxies to underlying MCP server (e.g., "filesystem:read")
   * - DAG execution: Executes via Casys PML DAG engine ("pml:execute_dag")
   * - Control tools: continue, abort, replan_dag, approval_response (Story 2.5-4)
   *
   * @param request - MCP request with params.name and params.arguments
   * @returns Tool execution result
   */
  private async handleCallTool(
    request: unknown,
    userId?: string, // Story 9.5: Multi-tenant isolation
  ): Promise<
    { content: Array<{ type: string; text: string }> } | {
      error: { code: number; message: string; data?: unknown };
    }
  > {
    const transaction = startTransaction("mcp.tools.call", "mcp");
    try {
      const params = (request as { params?: { name?: string; arguments?: unknown } }).params;

      if (!params?.name) {
        transaction.finish();
        return this.formatMCPError(
          MCPErrorCodes.INVALID_PARAMS,
          "Missing required parameter: 'name'",
        );
      }

      const { name, arguments: args } = params;

      transaction.setTag("tool", name);
      transaction.setData("has_arguments", !!args);
      addBreadcrumb("mcp", "Processing tools/call request", { tool: name });

      log.info(`call_tool: ${name}`);

      // Check if this is a DAG execution request (renamed from execute_workflow)
      if (name === "pml:execute_dag") {
        const result = await this.handleWorkflowExecution(args, userId);
        transaction.finish();
        return result;
      }

      // Story 2.5-4: Control tools for per-layer validation
      if (name === "pml:continue") {
        const result = await this.handleContinue(args);
        transaction.finish();
        return result;
      }

      if (name === "pml:abort") {
        const result = await this.handleAbort(args);
        transaction.finish();
        return result;
      }

      if (name === "pml:replan") {
        const result = await this.handleReplan(args);
        transaction.finish();
        return result;
      }

      if (name === "pml:approval_response") {
        const result = await this.handleApprovalResponse(args);
        transaction.finish();
        return result;
      }

      // Check if this is a code execution request (Story 3.4)
      if (name === "pml:execute_code") {
        const result = await this.handleExecuteCode(args);
        transaction.finish();
        return result;
      }

      // Check if this is a search_tools request (Spike: search-tools-graph-traversal)
      if (name === "pml:search_tools") {
        const result = await this.handleSearchTools(args);
        transaction.finish();
        return result;
      }

      // Check if this is a search_capabilities request (Story 7.3a)
      if (name === "pml:search_capabilities") {
        const result = await this.handleSearchCapabilities(args);
        transaction.finish();
        return result;
      }

      // Single tool execution (proxy to underlying MCP server)
      const [serverId, ...toolNameParts] = name.split(":");
      const toolName = toolNameParts.join(":"); // Handle tools with ':' in name

      transaction.setTag("server", serverId);

      const client = this.mcpClients.get(serverId);

      if (!client) {
        transaction.finish();
        return this.formatMCPError(
          MCPErrorCodes.INVALID_PARAMS,
          `Unknown MCP server: ${serverId}`,
          { available_servers: Array.from(this.mcpClients.keys()) },
        );
      }

      // Proxy tool call to underlying server
      const result = await client.callTool(toolName, args as Record<string, unknown>);

      transaction.finish();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      log.error(`call_tool error: ${error}`);
      captureError(error as Error, {
        operation: "tools/call",
        handler: "handleCallTool",
      });
      transaction.finish();
      return this.formatMCPError(
        MCPErrorCodes.INTERNAL_ERROR,
        `Tool execution failed: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Handle workflow execution
   *
   * Supports three modes:
   * 1. Intent-based: Natural language → DAG suggestion
   * 2. Explicit: DAG structure → Execute
   * 3. Per-layer validation: Execute with pauses between layers (Story 2.5-4)
   *
   * @param args - Workflow arguments (intent or workflow, optional config)
   * @returns Execution result, suggestion, or layer_complete status
   */
  private async handleWorkflowExecution(
    args: unknown,
    userId?: string, // Story 9.5: Multi-tenant isolation
  ): Promise<
    { content: Array<{ type: string; text: string }> } | {
      error: { code: number; message: string; data?: unknown };
    }
  > {
    const workflowArgs = args as {
      intent?: string;
      workflow?: DAGStructure;
      config?: { per_layer_validation?: boolean };
    };
    const perLayerValidation = workflowArgs.config?.per_layer_validation === true;

    // Case 1: Explicit workflow provided
    if (workflowArgs.workflow) {
      log.info(`Executing explicit workflow (per_layer_validation: ${perLayerValidation})`);

      // Normalize tasks: ensure dependsOn is always an array (API boundary validation)
      // Root tasks without dependencies may omit dependsOn field
      const normalizedWorkflow: DAGStructure = {
        ...workflowArgs.workflow,
        tasks: workflowArgs.workflow.tasks.map((task) => ({
          ...task,
          dependsOn: task.dependsOn ?? [],
        })),
      };

      // Story 2.5-4: Per-layer validation mode
      if (perLayerValidation) {
        return await this.executeWithPerLayerValidation(
          normalizedWorkflow,
          workflowArgs.intent ?? "explicit_workflow",
          userId, // Story 9.5: Multi-tenant isolation
        );
      }

      // Standard execution (no validation pauses)
      // Use ControlledExecutor for task type routing (code_execution, capability tasks)
      const controlledExecutor = new ControlledExecutor(
        async (tool, args) => {
          // Route to underlying MCP servers
          const [serverId, ...toolNameParts] = tool.split(":");
          const toolName = toolNameParts.join(":");
          const client = this.mcpClients.get(serverId);
          if (!client) {
            throw new Error(`Unknown MCP server: ${serverId}`);
          }
          return await client.callTool(toolName, args);
        },
        {
          taskTimeout: 30000,
          userId: userId ?? "local",
          // Story 2.5-3: Enable HIL for tasks with sideEffects flag
          hil: { enabled: true, approval_required: "critical_only" },
        },
      );

      controlledExecutor.setDAGSuggester(this.dagSuggester);
      // Wire learning dependencies (Task 3: for eager learning and trace collection)
      controlledExecutor.setLearningDependencies(this.capabilityStore, this.graphEngine);

      const result = await controlledExecutor.execute(normalizedWorkflow);

      // Update graph with execution data (learning loop)
      await this.graphEngine.updateFromExecution({
        executionId: crypto.randomUUID(),
        executedAt: new Date(),
        intentText: workflowArgs.intent ?? "",
        dagStructure: normalizedWorkflow,
        success: result.errors.length === 0,
        executionTimeMs: result.executionTimeMs,
        userId: userId ?? "local", // Story 9.5: Multi-tenant isolation
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "completed",
                results: result.results,
                executionTimeMs: result.executionTimeMs,
                parallelization_layers: result.parallelizationLayers,
                errors: result.errors,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    // Case 2: Intent-based (GraphRAG suggestion)
    if (workflowArgs.intent) {
      log.info(
        `Processing workflow intent: "${workflowArgs.intent}" (per_layer_validation: ${perLayerValidation})`,
      );

      const executionMode = await this.gatewayHandler.processIntent({
        text: workflowArgs.intent,
      });

      if (executionMode.mode === "explicit_required") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  mode: "explicit_required",
                  message: executionMode.explanation ||
                    "Low confidence - please provide explicit workflow",
                  confidence: executionMode.confidence,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (executionMode.mode === "suggestion") {
        // Story 2.5-4: If per_layer_validation enabled, execute the suggested DAG
        if (perLayerValidation && executionMode.dagStructure) {
          return await this.executeWithPerLayerValidation(
            executionMode.dagStructure,
            workflowArgs.intent,
            userId, // Story 9.5: Multi-tenant isolation
          );
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  mode: "suggestion",
                  suggested_dag: executionMode.dagStructure,
                  confidence: executionMode.confidence,
                  explanation: executionMode.explanation,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (executionMode.mode === "speculative_execution") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  mode: "speculative_execution",
                  results: executionMode.results,
                  confidence: executionMode.confidence,
                  executionTimeMs: executionMode.executionTimeMs,
                },
                null,
                2,
              ),
            },
          ],
        };
      }
    }

    // Neither intent nor workflow provided
    return this.formatMCPError(
      MCPErrorCodes.INVALID_PARAMS,
      "Either 'intent' or 'workflow' must be provided",
      { received: Object.keys(workflowArgs) },
    );
  }

  /**
   * Execute workflow with per-layer validation (Story 2.5-4)
   *
   * Starts DAG execution and pauses after first layer, returning
   * layer_complete status with workflow_id for continuation.
   *
   * @param dag - DAG structure to execute
   * @param intent - Original intent text
   * @returns layer_complete status or complete status
   */
  private async executeWithPerLayerValidation(
    dag: DAGStructure,
    intent: string,
    userId?: string, // Story 9.5: Multi-tenant isolation
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const workflowId = crypto.randomUUID();

    // Save DAG to database for stateless continuation
    await saveWorkflowDAG(this.db, workflowId, dag, intent);

    // Create ControlledExecutor for this workflow
    const controlledExecutor = new ControlledExecutor(
      async (tool, args) => {
        // Route to underlying MCP servers
        const [serverId, ...toolNameParts] = tool.split(":");
        const toolName = toolNameParts.join(":");
        const client = this.mcpClients.get(serverId);
        if (!client) {
          throw new Error(`Unknown MCP server: ${serverId}`);
        }
        return await client.callTool(toolName, args);
      },
      {
        taskTimeout: 30000,
        userId: userId ?? "local", // Story 9.5: Multi-tenant isolation
        // Story 2.5-3: Enable HIL for tasks with sideEffects flag
        hil: { enabled: true, approval_required: "critical_only" },
      },
    );

    // Configure checkpointing
    controlledExecutor.setCheckpointManager(this.db, true);
    controlledExecutor.setDAGSuggester(this.dagSuggester);
    // Wire learning dependencies (for eager learning and trace collection)
    controlledExecutor.setLearningDependencies(this.capabilityStore, this.graphEngine);

    // Start streaming execution
    const generator = controlledExecutor.executeStream(dag, workflowId);

    // Collect events until first layer completes
    const layerResults: TaskResult[] = [];
    let currentLayer = 0;
    let totalLayers = 0;
    let latestCheckpointId: string | null = null;

    for await (const event of generator) {
      if (event.type === "workflow_start") {
        totalLayers = event.totalLayers ?? 0;
      }

      if (event.type === "task_complete" || event.type === "task_error") {
        layerResults.push({
          taskId: event.taskId ?? "",
          status: event.type === "task_complete" ? "success" : "error",
          output: event.type === "task_complete"
            ? { executionTimeMs: event.executionTimeMs }
            : undefined,
          error: event.type === "task_error" ? event.error : undefined,
        });
      }

      // Story 2.5-3 HIL Fix: Handle decision_required events
      if (event.type === "decision_required") {
        // Store active workflow state for continuation after approval
        const activeWorkflow: ActiveWorkflow = {
          workflowId,
          executor: controlledExecutor,
          generator,
          dag,
          currentLayer,
          totalLayers,
          layerResults: [...layerResults],
          status: "awaiting_approval",
          createdAt: new Date(),
          lastActivityAt: new Date(),
          latestCheckpointId: event.checkpointId ?? null,
        };
        this.activeWorkflows.set(workflowId, activeWorkflow);

        // Return approval_required status to client
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "approval_required",
                  workflow_id: workflowId,
                  checkpoint_id: event.checkpointId,
                  decision_type: event.decisionType,
                  description: event.description,
                  context: event.context,
                  options: ["approve", "reject"],
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (event.type === "checkpoint") {
        latestCheckpointId = event.checkpointId ?? null;
        currentLayer = event.layerIndex ?? 0;

        // Pause after first layer completes (layer 0)
        // Store active workflow state for continuation
        const activeWorkflow: ActiveWorkflow = {
          workflowId,
          executor: controlledExecutor,
          generator,
          dag,
          currentLayer,
          totalLayers,
          layerResults: [...layerResults],
          status: "paused",
          createdAt: new Date(),
          lastActivityAt: new Date(),
          latestCheckpointId,
        };
        this.activeWorkflows.set(workflowId, activeWorkflow);

        // Return layer_complete status
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "layer_complete",
                  workflow_id: workflowId,
                  checkpoint_id: latestCheckpointId,
                  layer_index: currentLayer,
                  total_layers: totalLayers,
                  layer_results: layerResults,
                  next_layer_preview: currentLayer + 1 < totalLayers
                    ? { layer_index: currentLayer + 1 }
                    : null,
                  options: ["continue", "replan", "abort"],
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (event.type === "workflow_complete") {
        // Workflow completed in first layer (single layer DAG)
        await deleteWorkflowDAG(this.db, workflowId);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "complete",
                  workflow_id: workflowId,
                  total_time_ms: event.totalTimeMs,
                  successful_tasks: event.successfulTasks,
                  failed_tasks: event.failedTasks,
                  results: layerResults,
                },
                null,
                2,
              ),
            },
          ],
        };
      }
    }

    // Should not reach here
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ status: "complete", workflow_id: workflowId }),
        },
      ],
    };
  }

  /**
   * Handle search_tools request (Story 5.2 / ADR-022: Refactored)
   *
   * Delegates to GraphRAGEngine.searchToolsHybrid() for centralized hybrid search logic.
   * Combines semantic search with graph-based recommendations:
   * 1. Semantic search for query-matching tools
   * 2. Adaptive alpha: more semantic weight when graph is sparse
   * 3. Optional related tools via Adamic-Adar / neighbors
   *
   * @param args - Search arguments (query, limit, include_related, context_tools)
   * @returns Search results with scores
   */
  private async handleSearchTools(
    args: unknown,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const params = args as {
      query?: string;
      limit?: number;
      include_related?: boolean;
      context_tools?: string[];
    };

    // Validate query
    if (!params.query || typeof params.query !== "string") {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "Missing required parameter: 'query'",
          }),
        }],
      };
    }

    const query = params.query;
    const limit = params.limit || 10;
    const includeRelated = params.include_related || false;
    const contextTools = params.context_tools || [];

    log.info(`search_tools: query="${query}", limit=${limit}, include_related=${includeRelated}`);

    // ADR-022: Delegate to centralized hybrid search in GraphRAGEngine
    const hybridResults = await this.graphEngine.searchToolsHybrid(
      this.vectorSearch,
      query,
      limit,
      contextTools,
      includeRelated,
    );

    if (hybridResults.length === 0) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            tools: [],
            message: "No tools found matching your query",
          }),
        }],
      };
    }

    // Map to MCP response format (snake_case for external API)
    const results = hybridResults.map((result) => ({
      tool_id: result.toolId,
      server_id: result.serverId,
      description: result.description,
      semantic_score: result.semanticScore,
      graph_score: result.graphScore,
      final_score: result.finalScore,
      related_tools: result.relatedTools?.map((rt) => ({
        tool_id: rt.toolId,
        relation: rt.relation,
        score: rt.score,
      })) || [],
    }));

    // Get meta info from graph engine
    const edgeCount = this.graphEngine.getEdgeCount();
    const nodeCount = this.graphEngine.getStats().nodeCount;
    const maxPossibleEdges = nodeCount * (nodeCount - 1);
    const density = maxPossibleEdges > 0 ? edgeCount / maxPossibleEdges : 0;
    const alpha = Math.max(0.5, 1.0 - density * 2);

    log.info(
      `search_tools: found ${results.length} results (alpha=${
        alpha.toFixed(2)
      }, edges=${edgeCount})`,
    );

    return {
      content: [{
        type: "text",
        text: JSON.stringify(
          {
            tools: results,
            meta: {
              query,
              alpha: Math.round(alpha * 100) / 100,
              edge_count: edgeCount,
            },
          },
          null,
          2,
        ),
      }],
    };
  }

  /**
   * Handle search_capabilities request (Story 7.3a)
   *
   * Delegates to DAGSuggester.searchCapabilities() for capability matching.
   * Matches capabilities using semantic similarity * reliability score.
   *
   * @param args - Search arguments (intent, include_suggestions)
   * @returns Capability matches formatted for Claude
   */
  private async handleSearchCapabilities(
    args: unknown,
  ): Promise<
    | { content: Array<{ type: string; text: string }> }
    | { error: { code: number; message: string; data?: unknown } }
  > {
    const transaction = startTransaction("mcp.capabilities.search", "mcp");
    try {
      const params = args as {
        intent?: string;
        include_suggestions?: boolean;
      };

      if (!params.intent || typeof params.intent !== "string") {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: "Missing required parameter: 'intent'",
            }),
          }],
        };
      }

      const intent = params.intent;
      transaction.setData("intent", intent);
      addBreadcrumb("mcp", "Processing search_capabilities request", { intent });

      log.info(`search_capabilities: "${intent}"`);

      // 1. Search for capability match via DAGSuggester
      // Note: DAGSuggester orchestrates the CapabilityMatcher
      const match = await this.dagSuggester.searchCapabilities(intent);

      // 2. Format response (AC5)
      const response = {
        capabilities: match
          ? [{
            id: match.capability.id,
            name: match.capability.name,
            description: match.capability.description,
            code_snippet: match.capability.codeSnippet,
            parameters_schema: match.parametersSchema,
            success_rate: match.capability.successRate,
            usage_count: match.capability.usageCount,
            score: match.score, // Final score (Semantic * Reliability)
            semantic_score: match.semanticScore,
          }]
          : [],
        suggestions: [], // To be implemented in Story 7.4 (Strategic Discovery)
        threshold_used: match?.thresholdUsed ?? 0,
        total_found: match ? 1 : 0,
      };

      transaction.finish();
      return {
        content: [{
          type: "text",
          text: JSON.stringify(response, null, 2),
        }],
      };
    } catch (error) {
      log.error(`search_capabilities error: ${error}`);
      captureError(error as Error, {
        operation: "capabilities/search",
        handler: "handleSearchCapabilities",
      });
      transaction.finish();
      return this.formatMCPError(
        MCPErrorCodes.INTERNAL_ERROR,
        `Capability search failed: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Handle code execution (Story 3.4)
   *
   * Supports two modes:
   * 1. Intent-based: Natural language → vector search → tool injection → execute
   * 2. Explicit: Direct code execution with provided context
   *
   * @param args - Code execution arguments
   * @returns Execution result with metrics
   */
  private async handleExecuteCode(
    args: unknown,
  ): Promise<
    { content: Array<{ type: string; text: string }> } | {
      error: { code: number; message: string; data?: unknown };
    }
  > {
    try {
      const request = args as CodeExecutionRequest;

      // Validate required parameters
      if (!request.code || typeof request.code !== "string") {
        return this.formatMCPError(
          MCPErrorCodes.INVALID_PARAMS,
          "Missing or invalid required parameter: 'code' must be a non-empty string",
        );
      }

      // Validate code size (max 100KB)
      const codeSizeBytes = new TextEncoder().encode(request.code).length;
      if (codeSizeBytes > 100 * 1024) {
        return this.formatMCPError(
          MCPErrorCodes.INVALID_PARAMS,
          `Code size exceeds maximum: ${codeSizeBytes} bytes (max: 102400)`,
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
        piiProtection: this.config.piiProtection,
        cacheConfig: this.config.cacheConfig,
        // Story 8.3: Enable capability learning from code execution
        capabilityStore: this.capabilityStore,
        graphRAG: this.graphEngine,
      });

      // Set tool versions for cache key generation (Story 3.7)
      const toolVersions = this.buildToolVersionsMap();
      executor.setToolVersions(toolVersions);

      // Story 7.1b: Use Worker RPC Bridge for tool execution with native tracing
      let toolDefinitions: import("../sandbox/types.ts").ToolDefinition[] = [];
      let toolsCalled: string[] = [];
      let matchedCapabilities: Array<{ capability: import("../capabilities/types.ts").Capability; semanticScore: number }> = [];

      // Capability context for injection (Story 8.3: capability injection)
      let capabilityContext: string | undefined;

      // Intent-based mode: discover tools AND existing capabilities
      if (request.intent) {
        log.debug("Intent-based mode: discovering relevant tools and capabilities");

        // 1. Search for existing capabilities (Story 8.3: capability reuse)
        if (this.capabilityStore) {
          try {
            matchedCapabilities = await this.capabilityStore.searchByIntent(request.intent, 3, 0.7);
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

        // 2. Use hybrid search for tools (ADR-022: consistent with search_tools)
        // This handles cold-start gracefully with adaptive alpha
        const hybridResults = await this.graphEngine.searchToolsHybrid(
          this.vectorSearch,
          request.intent,
          10, // top-10 candidates
          [], // no context tools
          false, // no related tools needed
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

          // Build tool definitions for Worker RPC bridge (Story 7.1b)
          toolDefinitions = this.contextBuilder.buildToolDefinitions(toolResults);
        } else {
          log.warn("No relevant tools found for intent via hybrid search");
        }
      }

      // Execute code using Worker RPC bridge (Story 7.1b: native tracing)
      const startTime = performance.now();
      const workerConfig: WorkerExecutionConfig = {
        toolDefinitions,
        mcpClients: this.mcpClients,
      };

      const result = await executor.executeWithTools(
        request.code,
        workerConfig,
        executionContext,
        capabilityContext,
      );
      const executionTimeMs = performance.now() - startTime;

      // Handle capability feedback (Story 7.3a / AC6)
      if (this.capabilityStore && this.adaptiveThresholdManager && result.success) {
        try {
          // Identify if executed code matches a known capability
          const codeHash = await hashCode(request.code);
          const capability = await this.capabilityStore.findByCodeHash(codeHash);

          if (capability) {
            // Update usage stats
            await this.capabilityStore.updateUsage(codeHash, true, executionTimeMs);

            // Record execution for adaptive learning
            // Use intent similarity if available, otherwise fallback to success rate
            let confidence = capability.successRate;
            if (request.intent) {
              // Re-calculate similarity would be expensive here without vector search results
              // Just use successRate as a proxy for "confidence in this capability"
              // Or if we had the match result passed in, we'd use that.
              // For now, successRate is a reasonable proxy for established capabilities.
            }

            this.adaptiveThresholdManager.recordExecution({
              mode: "speculative", // Treat user execution of capability as "speculative" confirmation?
              // Actually, if user runs it, it's "manual" or "explicit".
              // But AC6 says "mode: speculative".
              // If we treat it as speculative, we confirm the system's "suggestion" (the search result).
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

      // Handle execution failure
      if (!result.success) {
        const error = result.error!;
        return this.formatMCPError(
          MCPErrorCodes.INTERNAL_ERROR,
          `Code execution failed: ${error.type} - ${error.message}`,
          {
            error_type: error.type,
            error_message: error.message,
            stack: error.stack,
            executionTimeMs: executionTimeMs,
          },
        );
      }

      // Story 7.1b: Use native traces from Worker RPC bridge (replaces stdout parsing)
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
            dependsOn: index > 0 ? [`traced_${index - 1}`] : [], // Sequential dependency assumption
          })),
        };

        // Update GraphRAG with execution data
        await this.graphEngine.updateFromExecution({
          executionId: crypto.randomUUID(),
          executedAt: new Date(),
          intentText: request.intent ?? "code_execution",
          dagStructure: tracedDAG,
          success: true,
          executionTimeMs: executionTimeMs,
        });

        trackedToolsCount = toolsCalled.length;
      }

      // Log native trace stats (Story 7.1b)
      if (result.traces && result.traces.length > 0) {
        log.debug(`[Story 7.1b] Captured ${result.traces.length} native trace events`);
      }

      // ADR-043: Extract failed tools from traces to surface to agent
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

      // Build response (Story 7.1b: traces are kept internal, not exposed to user)
      const response: CodeExecutionResponse = {
        result: result.result,
        logs: [], // TODO: Capture console logs in future enhancement
        metrics: {
          executionTimeMs: result.executionTimeMs,
          inputSizeBytes: codeSizeBytes,
          outputSizeBytes,
        },
        state: executionContext, // Return context for checkpoint compatibility
        // Story 8.3: Include matched capabilities in response
        matched_capabilities: matchedCapabilities.length > 0
          ? matchedCapabilities.map((mc) => ({
            id: mc.capability.id,
            name: mc.capability.name ?? null, // Convert undefined to null for type compatibility
            code_snippet: mc.capability.codeSnippet,
            semantic_score: mc.semanticScore,
            success_rate: mc.capability.successRate,
            usage_count: mc.capability.usageCount,
          }))
          : undefined,
        // ADR-043: Surface tool failures to agent even when code "succeeds" (try/catch)
        tool_failures: toolFailures.length > 0 ? toolFailures : undefined,
      };

      log.info("Code execution succeeded", {
        executionTimeMs: response.metrics.executionTimeMs.toFixed(2),
        outputSize: outputSizeBytes,
        trackedTools: trackedToolsCount, // Story 7.1b: native tracing
        matchedCapabilities: matchedCapabilities.length, // Story 8.3: capability injection
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
      return this.formatMCPError(
        MCPErrorCodes.INTERNAL_ERROR,
        `Code execution failed: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Handle continue command (Story 2.5-4)
   *
   * Continues a paused workflow to the next layer.
   * Uses in-memory activeWorkflows if available, otherwise loads from DB.
   *
   * @param args - Continue arguments (workflow_id, reason?)
   * @returns Next layer results or completion status
   */
  private async handleContinue(
    args: unknown,
  ): Promise<
    { content: Array<{ type: string; text: string }> } | {
      error: { code: number; message: string; data?: unknown };
    }
  > {
    const params = args as { workflow_id?: string; reason?: string };

    if (!params.workflow_id) {
      return this.formatMCPError(
        MCPErrorCodes.INVALID_PARAMS,
        "Missing required parameter: 'workflow_id'",
      );
    }

    log.info(
      `handleContinue: workflow_id=${params.workflow_id}, reason=${params.reason || "none"}`,
    );

    // Check in-memory workflows first
    const activeWorkflow = this.activeWorkflows.get(params.workflow_id);

    if (activeWorkflow) {
      // Resume from in-memory state
      return await this.continueFromActiveWorkflow(activeWorkflow, params.reason);
    }

    // Fallback: Load from database (workflow was lost from memory, e.g., restart)
    const dag = await getWorkflowDAG(this.db, params.workflow_id);
    if (!dag) {
      return this.formatMCPError(
        MCPErrorCodes.INVALID_PARAMS,
        `Workflow ${params.workflow_id} not found or expired`,
        { workflow_id: params.workflow_id },
      );
    }

    // Load latest checkpoint
    if (!this.checkpointManager) {
      return this.formatMCPError(
        MCPErrorCodes.INTERNAL_ERROR,
        "CheckpointManager not initialized",
      );
    }

    const latestCheckpoint = await this.checkpointManager.getLatestCheckpoint(params.workflow_id);
    if (!latestCheckpoint) {
      return this.formatMCPError(
        MCPErrorCodes.INVALID_PARAMS,
        `No checkpoints found for workflow ${params.workflow_id}`,
      );
    }

    // Create new executor and resume from checkpoint
    const controlledExecutor = new ControlledExecutor(
      async (tool, toolArgs) => {
        const [serverId, ...toolNameParts] = tool.split(":");
        const toolName = toolNameParts.join(":");
        const client = this.mcpClients.get(serverId);
        if (!client) {
          throw new Error(`Unknown MCP server: ${serverId}`);
        }
        return await client.callTool(toolName, toolArgs);
      },
      {
        taskTimeout: 30000,
        // Story 2.5-3: Enable HIL for tasks with sideEffects flag
        hil: { enabled: true, approval_required: "critical_only" },
      },
    );

    controlledExecutor.setCheckpointManager(this.db, true);
    controlledExecutor.setDAGSuggester(this.dagSuggester);
    // Wire learning dependencies (for eager learning and trace collection)
    controlledExecutor.setLearningDependencies(this.capabilityStore, this.graphEngine);

    // Resume from checkpoint
    const generator = controlledExecutor.resumeFromCheckpoint(dag, latestCheckpoint.id);

    // Process events until next checkpoint or completion
    return await this.processGeneratorUntilPause(
      params.workflow_id,
      controlledExecutor,
      generator,
      dag,
      latestCheckpoint.layer + 1,
    );
  }

  /**
   * Continue workflow from active in-memory state
   */
  private async continueFromActiveWorkflow(
    workflow: ActiveWorkflow,
    reason?: string,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    log.debug(`Continuing workflow ${workflow.workflowId} from layer ${workflow.currentLayer}`);

    // Enqueue continue command to executor
    workflow.executor.enqueueCommand({
      type: "continue",
      reason: reason || "external_agent_continue",
    });

    workflow.status = "running";
    workflow.lastActivityAt = new Date();

    // Extend DAG TTL
    await extendWorkflowDAGExpiration(this.db, workflow.workflowId);

    // Process events until next checkpoint or completion
    return await this.processGeneratorUntilPause(
      workflow.workflowId,
      workflow.executor,
      workflow.generator,
      workflow.dag,
      workflow.currentLayer + 1,
    );
  }

  /**
   * Process generator events until next pause point or completion
   */
  private async processGeneratorUntilPause(
    workflowId: string,
    executor: ControlledExecutor,
    generator: AsyncGenerator<ExecutionEvent, import("../dag/state.ts").WorkflowState, void>,
    dag: DAGStructure,
    expectedLayer: number,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const layerResults: TaskResult[] = [];
    let currentLayer = expectedLayer;
    let totalLayers = 0;
    let latestCheckpointId: string | null = null;

    for await (const event of generator) {
      if (event.type === "workflow_start") {
        totalLayers = event.totalLayers ?? 0;
      }

      if (event.type === "task_complete" || event.type === "task_error") {
        layerResults.push({
          taskId: event.taskId ?? "",
          status: event.type === "task_complete" ? "success" : "error",
          output: event.type === "task_complete"
            ? { executionTimeMs: event.executionTimeMs }
            : undefined,
          error: event.type === "task_error" ? event.error : undefined,
        });
      }

      // Story 2.5-3 HIL Fix: Handle decision_required events
      if (event.type === "decision_required") {
        // Store active workflow state for continuation after approval
        const activeWorkflow: ActiveWorkflow = {
          workflowId,
          executor,
          generator,
          dag,
          currentLayer,
          totalLayers,
          layerResults: [...layerResults],
          status: "awaiting_approval",
          createdAt: this.activeWorkflows.get(workflowId)?.createdAt ?? new Date(),
          lastActivityAt: new Date(),
          latestCheckpointId: event.checkpointId ?? null,
        };
        this.activeWorkflows.set(workflowId, activeWorkflow);

        // Return approval_required status to client
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "approval_required",
                  workflow_id: workflowId,
                  checkpoint_id: event.checkpointId,
                  decision_type: event.decisionType,
                  description: event.description,
                  context: event.context,
                  options: ["approve", "reject"],
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (event.type === "checkpoint") {
        latestCheckpointId = event.checkpointId ?? null;
        currentLayer = event.layerIndex ?? currentLayer;

        // Update active workflow state
        const activeWorkflow: ActiveWorkflow = {
          workflowId,
          executor,
          generator,
          dag,
          currentLayer,
          totalLayers,
          layerResults: [...layerResults],
          status: "paused",
          createdAt: this.activeWorkflows.get(workflowId)?.createdAt ?? new Date(),
          lastActivityAt: new Date(),
          latestCheckpointId,
        };
        this.activeWorkflows.set(workflowId, activeWorkflow);

        // Return layer_complete status
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "layer_complete",
                  workflow_id: workflowId,
                  checkpoint_id: latestCheckpointId,
                  layer_index: currentLayer,
                  total_layers: totalLayers,
                  layer_results: layerResults,
                  options: ["continue", "replan", "abort"],
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (event.type === "workflow_complete") {
        // Workflow completed - clean up
        this.activeWorkflows.delete(workflowId);
        await deleteWorkflowDAG(this.db, workflowId);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "complete",
                  workflow_id: workflowId,
                  total_time_ms: event.totalTimeMs,
                  successful_tasks: event.successfulTasks,
                  failed_tasks: event.failedTasks,
                  results: layerResults,
                },
                null,
                2,
              ),
            },
          ],
        };
      }
    }

    // Generator exhausted without workflow_complete (unexpected)
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ status: "complete", workflow_id: workflowId }),
        },
      ],
    };
  }

  /**
   * Handle abort command (Story 2.5-4)
   *
   * Aborts a running or paused workflow, cleaning up resources.
   *
   * @param args - Abort arguments (workflow_id, reason)
   * @returns Abort confirmation with partial results
   */
  private async handleAbort(
    args: unknown,
  ): Promise<
    { content: Array<{ type: string; text: string }> } | {
      error: { code: number; message: string; data?: unknown };
    }
  > {
    const params = args as { workflow_id?: string; reason?: string };

    if (!params.workflow_id) {
      return this.formatMCPError(
        MCPErrorCodes.INVALID_PARAMS,
        "Missing required parameter: 'workflow_id'",
      );
    }

    if (!params.reason) {
      return this.formatMCPError(
        MCPErrorCodes.INVALID_PARAMS,
        "Missing required parameter: 'reason'",
      );
    }

    log.info(`handleAbort: workflow_id=${params.workflow_id}, reason=${params.reason}`);

    // Check if workflow exists
    const activeWorkflow = this.activeWorkflows.get(params.workflow_id);
    const dag = await getWorkflowDAG(this.db, params.workflow_id);

    if (!activeWorkflow && !dag) {
      return this.formatMCPError(
        MCPErrorCodes.INVALID_PARAMS,
        `Workflow ${params.workflow_id} not found or expired`,
        { workflow_id: params.workflow_id },
      );
    }

    // Send abort command if workflow is active
    if (activeWorkflow) {
      activeWorkflow.executor.enqueueCommand({
        type: "abort",
        reason: params.reason,
      });
      activeWorkflow.status = "aborted";
    }

    // Collect partial results
    const partialResults = activeWorkflow?.layerResults ?? [];
    const completedLayers = activeWorkflow?.currentLayer ?? 0;

    // Clean up resources
    this.activeWorkflows.delete(params.workflow_id);
    await deleteWorkflowDAG(this.db, params.workflow_id);

    log.info(`Workflow ${params.workflow_id} aborted: ${params.reason}`);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              status: "aborted",
              workflow_id: params.workflow_id,
              reason: params.reason,
              completed_layers: completedLayers,
              partial_results: partialResults,
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  /**
   * Handle replan command (Story 2.5-4)
   *
   * Replans a workflow by adding new tasks via GraphRAG.
   *
   * @param args - Replan arguments (workflow_id, new_requirement, available_context?)
   * @returns Updated DAG with new tasks
   */
  private async handleReplan(
    args: unknown,
  ): Promise<
    { content: Array<{ type: string; text: string }> } | {
      error: { code: number; message: string; data?: unknown };
    }
  > {
    const params = args as {
      workflow_id?: string;
      new_requirement?: string;
      available_context?: Record<string, unknown>;
    };

    if (!params.workflow_id) {
      return this.formatMCPError(
        MCPErrorCodes.INVALID_PARAMS,
        "Missing required parameter: 'workflow_id'",
      );
    }

    if (!params.new_requirement) {
      return this.formatMCPError(
        MCPErrorCodes.INVALID_PARAMS,
        "Missing required parameter: 'new_requirement'",
      );
    }

    log.info(
      `handleReplan: workflow_id=${params.workflow_id}, new_requirement=${params.new_requirement}`,
    );

    // Get current DAG
    const currentDag = await getWorkflowDAG(this.db, params.workflow_id);
    if (!currentDag) {
      return this.formatMCPError(
        MCPErrorCodes.INVALID_PARAMS,
        `Workflow ${params.workflow_id} not found or expired`,
        { workflow_id: params.workflow_id },
      );
    }

    // Get active workflow state
    const activeWorkflow = this.activeWorkflows.get(params.workflow_id);
    const completedTasks = activeWorkflow?.layerResults ?? [];

    // Replan via DAGSuggester/GraphRAG
    try {
      const augmentedDAG = await this.dagSuggester.replanDAG(currentDag, {
        completedTasks: completedTasks.map((t) => ({
          taskId: t.taskId,
          status: t.status,
          output: t.output,
        })),
        newRequirement: params.new_requirement,
        availableContext: params.available_context ?? {},
      });

      // Calculate new tasks added
      const newTasksCount = augmentedDAG.tasks.length - currentDag.tasks.length;
      const newTaskIds = augmentedDAG.tasks
        .filter((t) => !currentDag.tasks.some((ct) => ct.id === t.id))
        .map((t) => t.id);

      // Update DAG in database
      await updateWorkflowDAG(this.db, params.workflow_id, augmentedDAG);

      // Update active workflow if exists
      if (activeWorkflow) {
        activeWorkflow.dag = augmentedDAG;
        activeWorkflow.lastActivityAt = new Date();

        // Send replan command to executor
        activeWorkflow.executor.enqueueCommand({
          type: "replan_dag",
          new_requirement: params.new_requirement,
          available_context: params.available_context ?? {},
        });
      }

      log.info(`Workflow ${params.workflow_id} replanned: ${newTasksCount} new tasks`);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "replanned",
                workflow_id: params.workflow_id,
                new_requirement: params.new_requirement,
                new_tasks_count: newTasksCount,
                new_task_ids: newTaskIds,
                total_tasks: augmentedDAG.tasks.length,
                options: ["continue", "abort"],
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      log.error(`Replan failed: ${error}`);
      return this.formatMCPError(
        MCPErrorCodes.INTERNAL_ERROR,
        `Replanning failed: ${error instanceof Error ? error.message : String(error)}`,
        { workflow_id: params.workflow_id },
      );
    }
  }

  /**
   * Handle approval_response command (Story 2.5-4)
   *
   * Responds to a HIL approval checkpoint, continuing or rejecting the workflow.
   *
   * @param args - Approval arguments (workflow_id, checkpoint_id, approved, feedback?)
   * @returns Approval confirmation or next layer results
   */
  private async handleApprovalResponse(
    args: unknown,
  ): Promise<
    { content: Array<{ type: string; text: string }> } | {
      error: { code: number; message: string; data?: unknown };
    }
  > {
    const params = args as {
      workflow_id?: string;
      checkpoint_id?: string;
      approved?: boolean;
      feedback?: string;
    };

    if (!params.workflow_id) {
      return this.formatMCPError(
        MCPErrorCodes.INVALID_PARAMS,
        "Missing required parameter: 'workflow_id'",
      );
    }

    if (!params.checkpoint_id) {
      return this.formatMCPError(
        MCPErrorCodes.INVALID_PARAMS,
        "Missing required parameter: 'checkpoint_id'",
      );
    }

    if (params.approved === undefined) {
      return this.formatMCPError(
        MCPErrorCodes.INVALID_PARAMS,
        "Missing required parameter: 'approved'",
      );
    }

    log.info(
      `handleApprovalResponse: workflow_id=${params.workflow_id}, checkpoint_id=${params.checkpoint_id}, approved=${params.approved}`,
    );

    // Get active workflow
    const activeWorkflow = this.activeWorkflows.get(params.workflow_id);

    if (!activeWorkflow) {
      // Check if workflow exists in DB
      const dag = await getWorkflowDAG(this.db, params.workflow_id);
      if (!dag) {
        return this.formatMCPError(
          MCPErrorCodes.INVALID_PARAMS,
          `Workflow ${params.workflow_id} not found or expired`,
          { workflow_id: params.workflow_id },
        );
      }

      // Workflow exists but not active - it needs to be resumed
      return this.formatMCPError(
        MCPErrorCodes.INVALID_PARAMS,
        `Workflow ${params.workflow_id} is not active. Use 'continue' to resume.`,
        { workflow_id: params.workflow_id },
      );
    }

    // Send approval command to executor
    activeWorkflow.executor.enqueueCommand({
      type: "approval_response",
      checkpoint_id: params.checkpoint_id,
      approved: params.approved,
      feedback: params.feedback,
    });

    if (!params.approved) {
      // Rejected - abort workflow
      activeWorkflow.status = "aborted";

      const partialResults = activeWorkflow.layerResults;
      const completedLayers = activeWorkflow.currentLayer;

      // Clean up
      this.activeWorkflows.delete(params.workflow_id);
      await deleteWorkflowDAG(this.db, params.workflow_id);

      log.info(`Workflow ${params.workflow_id} rejected at checkpoint ${params.checkpoint_id}`);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "rejected",
                workflow_id: params.workflow_id,
                checkpoint_id: params.checkpoint_id,
                feedback: params.feedback,
                completed_layers: completedLayers,
                partial_results: partialResults,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    // Approved - continue execution
    activeWorkflow.status = "running";
    activeWorkflow.lastActivityAt = new Date();

    // Extend TTL
    await extendWorkflowDAGExpiration(this.db, params.workflow_id);

    log.info(`Workflow ${params.workflow_id} approved at checkpoint ${params.checkpoint_id}`);

    // Continue to next layer
    return await this.processGeneratorUntilPause(
      params.workflow_id,
      activeWorkflow.executor,
      activeWorkflow.generator,
      activeWorkflow.dag,
      activeWorkflow.currentLayer + 1,
    );
  }

  /**
   * Handler: prompts/get
   *
   * Optional handler for retrieving pre-defined prompts.
   * Currently returns empty list (can be extended later).
   *
   * @param request - MCP request
   * @returns Empty prompts list
   */
  private handleGetPrompt(_request: unknown): Promise<{ prompts: Array<unknown> }> {
    log.debug("prompts/get called (not implemented)");
    return Promise.resolve({
      prompts: [],
    });
  }

  /**
   * Generate hash of tool schema for change detection
   *
   * @param schema - Tool input schema object
   * @returns Hash string
   */
  private hashToolSchema(schema: unknown): string {
    const str = JSON.stringify(schema);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Track tool usage for cache invalidation (Story 3.7)
   *
   * Called by executor when a tool is invoked. Retrieves schema from DB
   * and tracks changes for cache invalidation.
   *
   * @param toolKey - Tool identifier (serverId:toolName)
   */
  public async trackToolUsage(toolKey: string): Promise<void> {
    try {
      const [serverId, ...toolNameParts] = toolKey.split(":");
      const toolName = toolNameParts.join(":");

      const rows = await this.db.query(
        `SELECT input_schema FROM tool_schema WHERE server_id = $1 AND name = $2`,
        [serverId, toolName],
      );

      if (rows.length > 0) {
        const schema = rows[0].input_schema;
        this.trackToolSchemaInternal(toolKey, schema);
      }
    } catch (error) {
      log.debug(`Failed to track tool schema for ${toolKey}: ${error}`);
    }
  }

  /**
   * Internal: Track tool schema for cache invalidation
   *
   * @param toolKey - Tool identifier (serverId:toolName)
   * @param schema - Tool input schema
   */
  private trackToolSchemaInternal(toolKey: string, schema: unknown): void {
    const schemaHash = this.hashToolSchema(schema);
    const previousHash = this.toolSchemaCache.get(toolKey);

    if (previousHash && previousHash !== schemaHash) {
      log.info(`Tool schema changed: ${toolKey}, cache will be invalidated`);
    }

    this.toolSchemaCache.set(toolKey, schemaHash);
  }

  /**
   * Build tool versions map for cache key generation (Story 3.7)
   *
   * @returns Map of tool names to version hashes
   */
  private buildToolVersionsMap(): Record<string, string> {
    const versions: Record<string, string> = {};
    for (const [toolKey, schemaHash] of this.toolSchemaCache.entries()) {
      versions[toolKey] = schemaHash;
    }
    return versions;
  }

  /**
   * Format MCP-compliant error response
   *
   * @param code - JSON-RPC error code
   * @param message - Error message
   * @param data - Optional error data
   * @returns Error response object
   */
  private formatMCPError(
    code: number,
    message: string,
    data?: unknown,
  ): { error: { code: number; message: string; data?: unknown } } {
    const error: { code: number; message: string; data?: unknown } = {
      code,
      message,
    };
    if (data !== undefined) {
      error.data = data;
    }
    return { error };
  }

  /**
   * Start gateway server with stdio transport
   *
   * Connects to stdio streams and begins listening for MCP requests.
   * Runs indefinitely until process is killed.
   */
  async start(): Promise<void> {
    // Run initial health check
    await this.healthChecker.initialHealthCheck();

    // Start periodic health checks
    this.healthChecker.startPeriodicChecks();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    log.info("✓ Casys PML MCP gateway started (stdio mode)");
    log.info(`  Server: ${this.config.name} v${this.config.version}`);
    log.info(`  Connected MCP servers: ${this.mcpClients.size}`);
    log.info("  Claude Code can now connect to cai");
  }

  /**
   * Start gateway server with HTTP transport (ADR-014)
   *
   * Creates an HTTP server that accepts JSON-RPC requests via POST /message
   * and provides health checks via GET /health.
   *
   * @param port - Port number to listen on
   */
  async startHttp(port: number): Promise<void> {
    // Run initial health check
    await this.healthChecker.initialHealthCheck();

    // Start periodic health checks
    this.healthChecker.startPeriodicChecks();

    // Initialize events stream manager (Story 6.1, Story 6.5: uses EventBus)
    this.eventsStream = new EventsStreamManager();
    log.info(`✓ EventsStreamManager initialized with EventBus`);

    // Story 9.3: Log auth mode at startup (AC #5)
    logAuthMode("API Server");

    // SECURITY: Validate auth config - fails in production without auth
    validateAuthConfig("API Server");

    // Story 9.5: Rate limiters per endpoint (cloud mode only)
    const RATE_LIMITERS = {
      mcp: new RateLimiter(100, 60000), // 100 req/min for MCP gateway
      api: new RateLimiter(200, 60000), // 200 req/min for API routes (graph, executions)
    };

    // CORS headers for Fresh dashboard (runs on different port)
    // Prod: https://DOMAIN, Dev: http://localhost:FRESH_PORT
    const getAllowedOrigin = (): string => {
      const domain = Deno.env.get("DOMAIN");
      if (domain) return `https://${domain}`;
      const dashboardPort = Deno.env.get("FRESH_PORT") || "8081";
      return `http://localhost:${dashboardPort}`;
    };
    const allowedOrigin = getAllowedOrigin();
    const corsHeaders = {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-api-key",
    };
    log.info(`✓ CORS configured for origin: ${allowedOrigin}`);

    // Create HTTP server
    this.httpServer = Deno.serve({ port }, async (req) => {
      const url = new URL(req.url);

      // Handle CORS preflight
      if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }

      // Story 9.3: Auth validation for protected routes
      const PUBLIC_ROUTES = ["/health"];
      let authResult = null;
      if (!PUBLIC_ROUTES.includes(url.pathname)) {
        authResult = await validateRequest(req);
        if (!authResult) {
          return new Response(
            JSON.stringify({
              error: "Unauthorized",
              message: "Valid API key required",
            }),
            {
              status: 401,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            },
          );
        }

        // Story 9.5: Rate limiting per user_id (cloud mode) or IP/shared (local mode)
        const clientIp = req.headers.get("x-forwarded-for") ||
          req.headers.get("cf-connecting-ip") ||
          "unknown";
        const rateLimitKey = getRateLimitKey(authResult, clientIp);

        // Select rate limiter based on endpoint
        let limiter: RateLimiter | null = null;
        if (url.pathname === "/mcp") {
          limiter = RATE_LIMITERS.mcp;
        } else if (url.pathname.startsWith("/api/")) {
          limiter = RATE_LIMITERS.api;
        }
        // No limiter for /health and /events/stream

        // Check rate limit
        if (limiter && !(await limiter.checkLimit(rateLimitKey))) {
          log.warn(`Rate limit exceeded for ${rateLimitKey} on ${url.pathname}`);
          return new Response(
            JSON.stringify({
              error: "Rate limit exceeded",
              message: "Too many requests. Please try again later.",
              retryAfter: 60,
            }),
            {
              status: 429,
              headers: {
                "Content-Type": "application/json",
                "Retry-After": "60",
                ...corsHeaders,
              },
            },
          );
        }
      }

      // MCP Streamable HTTP endpoint (for Claude Code HTTP transport)
      // Spec: https://modelcontextprotocol.io/specification/2025-03-26/basic/transports
      if (url.pathname === "/mcp") {
        // POST: Client-to-server JSON-RPC messages
        if (req.method === "POST") {
          try {
            const body = await req.json();
            const response = await this.handleJsonRpcRequest(body, authResult?.user_id);
            return new Response(JSON.stringify(response), {
              headers: {
                "Content-Type": "application/json",
                ...corsHeaders,
              },
            });
          } catch (error) {
            return new Response(
              JSON.stringify({ error: `Invalid request: ${error}` }),
              { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
            );
          }
        }
        // GET: Server-to-client SSE stream
        if (req.method === "GET") {
          if (!this.eventsStream) {
            return new Response(
              JSON.stringify({ error: "Events stream not initialized" }),
              { status: 503, headers: { "Content-Type": "application/json", ...corsHeaders } },
            );
          }
          return this.eventsStream.handleRequest(req);
        }
        // Method not allowed
        return new Response(null, { status: 405, headers: corsHeaders });
      }

      // Health check endpoint
      if (url.pathname === "/health" && req.method === "GET") {
        return new Response(JSON.stringify({ status: "ok" }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Server-Sent Events stream for graph events (Story 6.1)
      if (url.pathname === "/events/stream" && req.method === "GET") {
        if (!this.eventsStream) {
          return new Response(
            JSON.stringify({ error: "Events stream not initialized" }),
            { status: 503, headers: { "Content-Type": "application/json" } },
          );
        }
        return this.eventsStream.handleRequest(req);
      }

      // Dashboard redirect to Fresh (Story 6.2 migrated to Fresh)
      if (url.pathname === "/dashboard" && req.method === "GET") {
        return new Response(null, {
          status: 302,
          headers: { "Location": "http://localhost:8080/dashboard" },
        });
      }

      // Graph snapshot API (Story 6.2)
      if (url.pathname === "/api/graph/snapshot" && req.method === "GET") {
        try {
          const snapshot = this.graphEngine.getGraphSnapshot();
          return new Response(JSON.stringify(snapshot), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        } catch (error) {
          return new Response(
            JSON.stringify({ error: `Failed to get graph snapshot: ${error}` }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        }
      }

      // Path Finding API (Story 6.4 AC4)
      if (url.pathname === "/api/graph/path" && req.method === "GET") {
        try {
          const from = url.searchParams.get("from") || "";
          const to = url.searchParams.get("to") || "";

          if (!from || !to) {
            return new Response(
              JSON.stringify({ error: "Missing required parameters: 'from' and 'to'" }),
              { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
            );
          }

          const path = this.graphEngine.findShortestPath(from, to);
          return new Response(
            JSON.stringify({
              path: path || [],
              total_hops: path ? path.length - 1 : -1,
              from,
              to,
            }),
            { headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        } catch (error) {
          return new Response(
            JSON.stringify({ error: `Path finding failed: ${error}` }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        }
      }

      // Related Tools API (Story 6.4 AC6 - Adamic-Adar)
      if (url.pathname === "/api/graph/related" && req.method === "GET") {
        try {
          const toolId = url.searchParams.get("tool_id") || "";
          const limit = parseInt(url.searchParams.get("limit") || "5", 10);

          if (!toolId) {
            return new Response(
              JSON.stringify({ error: "Missing required parameter: 'tool_id'" }),
              { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
            );
          }

          const related = this.graphEngine.computeAdamicAdar(toolId, limit);

          // Enrich with server info and edge data
          const enrichedRelated = related.map((r) => {
            const edgeData = this.graphEngine.getEdgeData(toolId, r.toolId) ||
              this.graphEngine.getEdgeData(r.toolId, toolId);

            // Extract server and name from tool_id
            let server = "unknown";
            let name = r.toolId;
            if (r.toolId.includes(":")) {
              const colonIndex = r.toolId.indexOf(":");
              server = r.toolId.substring(0, colonIndex);
              name = r.toolId.substring(colonIndex + 1);
            }

            return {
              tool_id: r.toolId,
              name,
              server,
              adamic_adar_score: Math.round(r.score * 1000) / 1000,
              edge_confidence: edgeData?.weight ?? null,
            };
          });

          return new Response(
            JSON.stringify({
              tool_id: toolId,
              related: enrichedRelated,
            }),
            { headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        } catch (error) {
          return new Response(
            JSON.stringify({ error: `Related tools lookup failed: ${error}` }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        }
      }

      // Search Tools API (Story 6.4 AC10)
      if (url.pathname === "/api/tools/search" && req.method === "GET") {
        try {
          const q = url.searchParams.get("q") || "";
          const limit = parseInt(url.searchParams.get("limit") || "10", 10);

          if (q.length < 2) {
            return new Response(
              JSON.stringify({ results: [], total: 0 }),
              { headers: { "Content-Type": "application/json", ...corsHeaders } },
            );
          }

          const results = this.graphEngine.searchToolsForAutocomplete(q, limit);
          return new Response(
            JSON.stringify({ results, total: results.length }),
            { headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        } catch (error) {
          return new Response(
            JSON.stringify({ error: `Search failed: ${error}` }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        }
      }

      // Capabilities API (Story 8.1)
      if (url.pathname === "/api/capabilities" && req.method === "GET") {
        try {
          // Parse and validate query parameters
          const filters: import("../capabilities/types.ts").CapabilityFilters = {};

          const communityIdParam = url.searchParams.get("community_id");
          if (communityIdParam) {
            const communityId = parseInt(communityIdParam, 10);
            if (!isNaN(communityId)) {
              filters.communityId = communityId;
            }
          }

          const minSuccessRateParam = url.searchParams.get("min_success_rate");
          if (minSuccessRateParam) {
            const minSuccessRate = parseFloat(minSuccessRateParam);
            if (!isNaN(minSuccessRate)) {
              // Fix #20: Validate minSuccessRate range
              if (minSuccessRate < 0 || minSuccessRate > 1) {
                return new Response(
                  JSON.stringify({ error: "min_success_rate must be between 0 and 1" }),
                  { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
                );
              }
              filters.minSuccessRate = minSuccessRate;
            }
          }

          const minUsageParam = url.searchParams.get("min_usage");
          if (minUsageParam) {
            const minUsage = parseInt(minUsageParam, 10);
            if (!isNaN(minUsage)) {
              // Fix #20: Validate minUsage >= 0
              if (minUsage < 0) {
                return new Response(
                  JSON.stringify({ error: "min_usage must be >= 0" }),
                  { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
                );
              }
              filters.minUsage = minUsage;
            }
          }

          const limitParam = url.searchParams.get("limit");
          if (limitParam) {
            let limit = parseInt(limitParam, 10);
            if (!isNaN(limit)) {
              limit = Math.min(limit, 100); // Cap at 100
              filters.limit = limit;
            }
          }

          const offsetParam = url.searchParams.get("offset");
          if (offsetParam) {
            const offset = parseInt(offsetParam, 10);
            if (!isNaN(offset)) {
              // Fix #20: Validate offset >= 0
              if (offset < 0) {
                return new Response(
                  JSON.stringify({ error: "offset must be >= 0" }),
                  { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
                );
              }
              filters.offset = offset;
            }
          }

          const sortParam = url.searchParams.get("sort");
          if (
            sortParam === "usage_count" || sortParam === "success_rate" ||
            sortParam === "last_used" || sortParam === "created_at"
          ) {
            // Map snake_case to camelCase for internal use
            const sortMap: Record<string, "usageCount" | "successRate" | "lastUsed" | "createdAt"> =
              {
                usage_count: "usageCount",
                success_rate: "successRate",
                last_used: "lastUsed",
                created_at: "createdAt",
              };
            filters.sort = sortMap[sortParam];
          }

          const orderParam = url.searchParams.get("order");
          if (orderParam === "asc" || orderParam === "desc") {
            filters.order = orderParam;
          }

          // Call service
          const result = await this.capabilityDataService.listCapabilities(filters);

          // Map camelCase to snake_case for external API
          // Tech-spec AC 8: Include dependencies_count for each capability
          const capabilitiesWithDeps = await Promise.all(
            result.capabilities.map(async (cap) => {
              const depsCount = this.capabilityStore
                ? await this.capabilityStore.getDependenciesCount(cap.id)
                : 0;
              return {
                id: cap.id,
                name: cap.name,
                description: cap.description,
                code_snippet: cap.codeSnippet,
                tools_used: cap.toolsUsed,
                success_rate: cap.successRate,
                usage_count: cap.usageCount,
                avg_duration_ms: cap.avgDurationMs,
                community_id: cap.communityId,
                intent_preview: cap.intentPreview,
                created_at: cap.createdAt,
                last_used: cap.lastUsed,
                source: cap.source,
                dependencies_count: depsCount,
              };
            }),
          );

          const response = {
            capabilities: capabilitiesWithDeps,
            total: result.total,
            limit: result.limit,
            offset: result.offset,
          };

          return new Response(JSON.stringify(response), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        } catch (error) {
          return new Response(
            JSON.stringify({ error: `Failed to list capabilities: ${error}` }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        }
      }

      // Tech-spec: GET /api/capabilities/:id/dependencies - Get capability dependencies
      const capDepMatch = url.pathname.match(/^\/api\/capabilities\/([\w-]+)\/dependencies$/);
      if (capDepMatch && req.method === "GET") {
        try {
          if (!this.capabilityStore) {
            return new Response(
              JSON.stringify({ error: "Capability store not initialized" }),
              { status: 503, headers: { "Content-Type": "application/json", ...corsHeaders } },
            );
          }

          const capabilityId = capDepMatch[1];
          const directionParam = url.searchParams.get("direction") || "both";

          // Validate direction
          if (!["from", "to", "both"].includes(directionParam)) {
            return new Response(
              JSON.stringify({ error: "direction must be 'from', 'to', or 'both'" }),
              { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
            );
          }

          const deps = await this.capabilityStore.getDependencies(
            capabilityId,
            directionParam as "from" | "to" | "both",
          );

          const response = {
            capability_id: capabilityId,
            dependencies: deps.map((d) => ({
              from_capability_id: d.fromCapabilityId,
              to_capability_id: d.toCapabilityId,
              observed_count: d.observedCount,
              confidence_score: d.confidenceScore,
              edge_type: d.edgeType,
              edge_source: d.edgeSource,
              created_at: d.createdAt.toISOString(),
              last_observed: d.lastObserved.toISOString(),
            })),
            total: deps.length,
          };

          return new Response(JSON.stringify(response), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        } catch (error) {
          return new Response(
            JSON.stringify({ error: `Failed to get dependencies: ${error}` }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        }
      }

      // Tech-spec: POST /api/capabilities/:id/dependencies - Create dependency
      if (capDepMatch && req.method === "POST") {
        try {
          if (!this.capabilityStore) {
            return new Response(
              JSON.stringify({ error: "Capability store not initialized" }),
              { status: 503, headers: { "Content-Type": "application/json", ...corsHeaders } },
            );
          }

          const fromCapabilityId = capDepMatch[1];
          const body = await req.json();

          // Validate required fields
          if (!body.to_capability_id || !body.edge_type) {
            return new Response(
              JSON.stringify({ error: "Missing required fields: to_capability_id, edge_type" }),
              { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
            );
          }

          // Validate edge_type
          const validEdgeTypes = ["contains", "sequence", "dependency", "alternative"];
          if (!validEdgeTypes.includes(body.edge_type)) {
            return new Response(
              JSON.stringify({
                error: `Invalid edge_type. Must be one of: ${validEdgeTypes.join(", ")}`,
              }),
              { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
            );
          }

          const dep = await this.capabilityStore.addDependency({
            fromCapabilityId,
            toCapabilityId: body.to_capability_id,
            edgeType: body.edge_type,
            edgeSource: body.edge_source || "template",
          });

          const response = {
            created: true,
            dependency: {
              from_capability_id: dep.fromCapabilityId,
              to_capability_id: dep.toCapabilityId,
              observed_count: dep.observedCount,
              confidence_score: dep.confidenceScore,
              edge_type: dep.edgeType,
              edge_source: dep.edgeSource,
              created_at: dep.createdAt.toISOString(),
              last_observed: dep.lastObserved.toISOString(),
            },
          };

          return new Response(JSON.stringify(response), {
            status: 201,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        } catch (error) {
          return new Response(
            JSON.stringify({ error: `Failed to create dependency: ${error}` }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        }
      }

      // Tech-spec: DELETE /api/capabilities/:from/dependencies/:to - Remove dependency
      const capDepDeleteMatch = url.pathname.match(
        /^\/api\/capabilities\/([\w-]+)\/dependencies\/([\w-]+)$/,
      );
      if (capDepDeleteMatch && req.method === "DELETE") {
        try {
          if (!this.capabilityStore) {
            return new Response(
              JSON.stringify({ error: "Capability store not initialized" }),
              { status: 503, headers: { "Content-Type": "application/json", ...corsHeaders } },
            );
          }

          const fromCapabilityId = capDepDeleteMatch[1];
          const toCapabilityId = capDepDeleteMatch[2];

          await this.capabilityStore.removeDependency(fromCapabilityId, toCapabilityId);

          return new Response(JSON.stringify({ deleted: true }), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        } catch (error) {
          return new Response(
            JSON.stringify({ error: `Failed to delete dependency: ${error}` }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        }
      }

      // Hypergraph API (Story 8.1)
      if (url.pathname === "/api/graph/hypergraph" && req.method === "GET") {
        try {
          // Parse query parameters
          const options: import("../capabilities/types.ts").HypergraphOptions = {};

          const includeToolsParam = url.searchParams.get("include_tools");
          if (includeToolsParam !== null) {
            options.includeTools = includeToolsParam === "true";
          }

          const minSuccessRateParam = url.searchParams.get("min_success_rate");
          if (minSuccessRateParam) {
            const minSuccessRate = parseFloat(minSuccessRateParam);
            if (!isNaN(minSuccessRate)) {
              // Fix #20: Validate minSuccessRate range
              if (minSuccessRate < 0 || minSuccessRate > 1) {
                return new Response(
                  JSON.stringify({ error: "min_success_rate must be between 0 and 1" }),
                  { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
                );
              }
              options.minSuccessRate = minSuccessRate;
            }
          }

          const minUsageParam = url.searchParams.get("min_usage");
          if (minUsageParam) {
            const minUsage = parseInt(minUsageParam, 10);
            if (!isNaN(minUsage)) {
              // Fix #20: Validate minUsage >= 0
              if (minUsage < 0) {
                return new Response(
                  JSON.stringify({ error: "min_usage must be >= 0" }),
                  { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
                );
              }
              options.minUsage = minUsage;
            }
          }

          // Call service
          const result = await this.capabilityDataService.buildHypergraphData(options);

          // Map camelCase to snake_case for external API
          const mapNodeData = (node: import("../capabilities/types.ts").GraphNode) => {
            if (node.data.type === "capability") {
              const capNode = node as import("../capabilities/types.ts").CapabilityNode;
              return {
                data: {
                  id: node.data.id,
                  type: node.data.type,
                  label: node.data.label,
                  code_snippet: node.data.codeSnippet,
                  success_rate: node.data.successRate,
                  usage_count: node.data.usageCount,
                  tools_count: node.data.toolsCount,
                  tools_used: capNode.data.toolsUsed, // Unique tools (deduplicated)
                  // Transform toolInvocations to snake_case for API consistency
                  tool_invocations: capNode.data.toolInvocations?.map((inv) => ({
                    id: inv.id,
                    tool: inv.tool,
                    ts: inv.ts,
                    duration_ms: inv.durationMs,
                    sequence_index: inv.sequenceIndex,
                  }))
                },
              };
            } else if (node.data.type === "tool_invocation") {
              // Tool invocation nodes (individual calls with timestamps)
              const invNode = node as import("../capabilities/types.ts").ToolInvocationNode;
              return {
                data: {
                  id: invNode.data.id,
                  parent: invNode.data.parent,
                  type: invNode.data.type,
                  tool: invNode.data.tool,
                  server: invNode.data.server,
                  label: invNode.data.label,
                  ts: invNode.data.ts,
                  duration_ms: invNode.data.durationMs,
                  sequence_index: invNode.data.sequenceIndex,
                },
              };
            } else {
              // Tool nodes
              return {
                data: {
                  id: node.data.id,
                  parent: node.data.parent,
                  parents: node.data.parents, // Story 8.3: Multi-parent array for hypergraph
                  type: node.data.type,
                  server: node.data.server,
                  label: node.data.label,
                  pagerank: node.data.pagerank,
                  degree: node.data.degree,
                  community_id: node.data.communityId, // Louvain community for clustering
                },
              };
            }
          };

          const mapEdgeData = (edge: import("../capabilities/types.ts").GraphEdge) => {
            if (edge.data.edgeType === "capability_link") {
              return {
                data: {
                  id: edge.data.id,
                  source: edge.data.source,
                  target: edge.data.target,
                  shared_tools: edge.data.sharedTools,
                  edge_type: edge.data.edgeType,
                  edge_source: edge.data.edgeSource,
                },
              };
            } else if (edge.data.edgeType === "sequence") {
              // Sequence edges (tool invocation order with parallelism detection)
              const seqEdge = edge as import("../capabilities/types.ts").SequenceEdge;
              return {
                data: {
                  id: seqEdge.data.id,
                  source: seqEdge.data.source,
                  target: seqEdge.data.target,
                  edge_type: seqEdge.data.edgeType,
                  time_delta_ms: seqEdge.data.timeDeltaMs,
                  is_parallel: seqEdge.data.isParallel,
                },
              };
            } else {
              return {
                data: {
                  id: edge.data.id,
                  source: edge.data.source,
                  target: edge.data.target,
                  edge_type: edge.data.edgeType,
                  edge_source: edge.data.edgeSource,
                  observed_count: edge.data.observedCount,
                },
              };
            }
          };

          const response = {
            nodes: result.nodes.map(mapNodeData),
            edges: result.edges.map(mapEdgeData),
            capability_zones: result.capabilityZones || [], // Story 8.3: Hull zones for D3 visualization
            capabilities_count: result.capabilitiesCount,
            tools_count: result.toolsCount,
            metadata: {
              generated_at: result.metadata.generatedAt,
              version: result.metadata.version,
            },
          };

          return new Response(JSON.stringify(response), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        } catch (error) {
          return new Response(
            JSON.stringify({ error: `Failed to build hypergraph: ${error}` }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        }
      }

      // Metrics API (Story 6.3)
      if (url.pathname === "/api/metrics" && req.method === "GET") {
        try {
          const range = url.searchParams.get("range") || "24h";
          // Validate range parameter
          if (range !== "1h" && range !== "24h" && range !== "7d") {
            return new Response(
              JSON.stringify({
                error: `Invalid range parameter: ${range}. Must be one of: 1h, 24h, 7d`,
              }),
              { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
            );
          }
          const metrics = await this.graphEngine.getMetrics(range as "1h" | "24h" | "7d");
          return new Response(JSON.stringify(metrics), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        } catch (error) {
          return new Response(
            JSON.stringify({ error: `Failed to get metrics: ${error}` }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        }
      }

      // JSON-RPC message endpoint
      if (url.pathname === "/message" && req.method === "POST") {
        try {
          const body = await req.json();
          const response = await this.handleJsonRpcRequest(body, authResult?.user_id);
          return new Response(JSON.stringify(response), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32700, message: `Parse error: ${error}` },
              id: null,
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      }

      return new Response("Not Found", { status: 404 });
    });

    log.info(`✓ Casys PML MCP gateway started (HTTP mode on port ${port})`);
    log.info(`  Server: ${this.config.name} v${this.config.version}`);
    log.info(`  Connected MCP servers: ${this.mcpClients.size}`);
    log.info(
      `  Endpoints: GET /health, GET /events/stream, GET /dashboard, GET /api/graph/snapshot, GET /api/graph/hypergraph, GET /api/capabilities, GET /api/metrics, POST /message`,
    );
  }

  /**
   * Handle a JSON-RPC request directly (for HTTP transport)
   */
  private async handleJsonRpcRequest(
    request: {
      jsonrpc: string;
      id: number | string;
      method: string;
      params?: Record<string, unknown>;
    },
    userId?: string, // Story 9.5: Multi-tenant isolation
  ): Promise<Record<string, unknown>> {
    const { id, method, params } = request;

    try {
      // MCP initialize handshake
      if (method === "initialize") {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: { listChanged: true },
            },
            serverInfo: {
              name: this.config.name || "mcp-gateway",
              title: "PML Gateway - Describe what you want, I find the tools and execute. Use execute_dag with 'intent' to get started.",
              version: this.config.version || "1.0.0",
            },
          },
        };
      }

      // MCP initialized notification (no response needed but we ack it)
      if (method === "notifications/initialized") {
        return { jsonrpc: "2.0", id, result: {} };
      }

      if (method === "tools/list") {
        const result = await this.handleListTools({ params });
        return { jsonrpc: "2.0", id, result };
      }

      if (method === "tools/call") {
        const result = await this.handleCallTool({ params }, userId);
        return { jsonrpc: "2.0", id, result };
      }

      return {
        jsonrpc: "2.0",
        id,
        error: { code: MCPErrorCodes.METHOD_NOT_FOUND, message: `Method not found: ${method}` },
      };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: MCPErrorCodes.INTERNAL_ERROR, message: `${error}` },
      };
    }
  }

  /**
   * Graceful shutdown
   */
  async stop(): Promise<void> {
    log.info("Shutting down Casys PML gateway...");

    // Stop health checks
    this.healthChecker.stopPeriodicChecks();

    // Close events stream (Story 6.1)
    if (this.eventsStream) {
      this.eventsStream.close();
      this.eventsStream = null;
    }

    // Close HTTP server if running (ADR-014)
    if (this.httpServer) {
      await this.httpServer.shutdown();
      this.httpServer = null;
    }

    // Close all MCP client connections
    for (const [serverId, client] of this.mcpClients.entries()) {
      try {
        await client.disconnect();
        log.debug(`Disconnected from ${serverId}`);
      } catch (error) {
        log.error(`Error disconnecting from ${serverId}: ${error}`);
      }
    }

    // Close server transport
    await this.server.close();

    log.info("✓ Gateway stopped");
  }
}
