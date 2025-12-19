/**
 * MCP Gateway Handler with Speculative Execution
 *
 * Orchestrates workflow execution with three modes:
 * 1. explicit_required: Low confidence, ask user
 * 2. suggestion: Medium confidence, show DAG suggestion
 * 3. speculative_execution: High confidence, execute and present results
 *
 * @module mcp/gateway-handler
 */

import * as log from "@std/log";
import type { DAGSuggester } from "../graphrag/dag-suggester.ts";
import type { GraphRAGEngine } from "../graphrag/graph-engine.ts";
import type {
  DAGStructure,
  ExecutionMode,
  ExecutionResult,
  Task,
  WorkflowIntent,
} from "../graphrag/types.ts";
import type { JsonValue } from "../capabilities/types.ts";
import { AdaptiveThresholdManager } from "./adaptive-threshold.ts";
import type { MCPClientBase } from "./types.ts";

/**
 * Safety check configuration
 */
interface SafetyCheck {
  toolPattern: RegExp;
  requiresConfirmation: boolean;
  reason: string;
}

/**
 * Execution mode for tool calls (ADR-030)
 * - "real": Execute tools via MCP clients (production)
 * - "dry_run": Simulate execution without side effects
 */
export type ToolExecutionMode = "real" | "dry_run";

/**
 * Gateway configuration
 */
interface GatewayConfig {
  explicitThreshold: number; // Below this: explicit_required
  suggestionThreshold: number; // Below this: suggestion, above: speculative
  enableSpeculative: boolean;
  safetyChecks: SafetyCheck[];
  executionMode: ToolExecutionMode; // ADR-030: real vs dry_run
}

/**
 * Default safety checks for dangerous operations
 */
const DEFAULT_SAFETY_CHECKS: SafetyCheck[] = [
  {
    toolPattern: /delete|remove|drop|truncate/i,
    requiresConfirmation: true,
    reason: "Destructive operation detected",
  },
  {
    toolPattern: /exec|execute|shell|command/i,
    requiresConfirmation: true,
    reason: "Shell execution detected",
  },
];

/**
 * MCP Gateway Handler
 *
 * Intelligent gateway that decides execution mode based on confidence,
 * implements safety checks, and supports speculative execution.
 *
 * ADR-030: Now supports real tool execution via MCPClients.
 */
export class GatewayHandler {
  private config: GatewayConfig;
  private adaptiveManager: AdaptiveThresholdManager;

  constructor(
    private graphEngine: GraphRAGEngine,
    private dagSuggester: DAGSuggester,
    private mcpClients: Map<string, MCPClientBase>, // ADR-030: MCP clients for real execution
    config?: Partial<GatewayConfig>,
  ) {
    this.config = {
      explicitThreshold: 0.50,
      suggestionThreshold: 0.70,
      enableSpeculative: true,
      safetyChecks: DEFAULT_SAFETY_CHECKS,
      executionMode: "real", // ADR-030: default to real execution
      ...config,
    };

    this.adaptiveManager = new AdaptiveThresholdManager();
  }

  /**
   * Process workflow intent and decide execution mode
   *
   * @param intent - Workflow intent with natural language description
   * @returns Execution mode with appropriate response
   */
  async processIntent(intent: WorkflowIntent): Promise<ExecutionMode> {
    const startTime = performance.now();

    try {
      // 1. Get DAG suggestion
      const suggestion = await this.dagSuggester.suggestDAG(intent);

      if (!suggestion) {
        return {
          mode: "explicit_required",
          confidence: 0,
          explanation:
            "Unable to understand intent. Please be more specific or provide tool names explicitly.",
        };
      }

      // 2. Get adaptive thresholds
      const adaptiveThresholds = this.adaptiveManager.getThresholds();
      const explicitThreshold = adaptiveThresholds.explicitThreshold ??
        this.config.explicitThreshold;
      const suggestionThreshold = adaptiveThresholds.suggestionThreshold ??
        this.config.suggestionThreshold;

      // 3. Apply safety checks
      const safetyResult = this.applySafetyChecks(suggestion.dagStructure);
      if (!safetyResult.safe) {
        return {
          mode: "explicit_required",
          confidence: suggestion.confidence,
          dagStructure: suggestion.dagStructure,
          warning: safetyResult.reason,
          explanation:
            `Safety check failed: ${safetyResult.reason}. Please confirm this operation.`,
        };
      }

      // 4. Decide mode based on confidence
      if (suggestion.confidence < explicitThreshold) {
        // Low confidence: Ask user (ADR-026: may include cold start warning)
        return {
          mode: "explicit_required",
          confidence: suggestion.confidence,
          dagStructure: suggestion.dagStructure,
          explanation: `Low confidence (${
            (suggestion.confidence * 100).toFixed(0)
          }%). ${suggestion.rationale}`,
          note: "Please review and confirm the suggested tools.",
          warning: suggestion.warning, // ADR-026: Include cold start warning if present
        };
      } else if (suggestion.confidence < suggestionThreshold) {
        // Medium confidence: Show suggestion
        return {
          mode: "suggestion",
          confidence: suggestion.confidence,
          dagStructure: suggestion.dagStructure,
          explanation: suggestion.rationale,
          dependencyPaths: suggestion.dependencyPaths, // Harmonized: camelCase convention
          note: "Review the suggested DAG and approve to execute.",
        };
      } else if (this.config.enableSpeculative) {
        // High confidence: Speculative execution
        log.info(
          `Speculative execution triggered (confidence: ${suggestion.confidence.toFixed(2)})`,
        );

        const results = await this.executeDAG(suggestion.dagStructure);
        const executionTime = performance.now() - startTime;

        // Record execution for adaptive learning
        const success = results.every((r) => r.success);
        this.adaptiveManager.recordExecution({
          confidence: suggestion.confidence,
          mode: "speculative",
          success,
          executionTime,
          timestamp: Date.now(),
        });

        return {
          mode: "speculative_execution",
          confidence: suggestion.confidence,
          dagStructure: suggestion.dagStructure,
          results,
          explanation: suggestion.rationale,
          executionTimeMs: executionTime,
          dagUsed: suggestion.dagStructure,
        };
      } else {
        // Speculative disabled: fallback to suggestion
        return {
          mode: "suggestion",
          confidence: suggestion.confidence,
          dagStructure: suggestion.dagStructure,
          explanation: suggestion.rationale,
          note: "Speculative execution is disabled. Review and approve to execute.",
        };
      }
    } catch (error) {
      log.error(`Gateway processing failed: ${error}`);
      return {
        mode: "explicit_required",
        confidence: 0,
        error: `Internal error: ${error}`,
      };
    }
  }

  /**
   * Apply safety checks to DAG structure
   *
   * @param dag - DAG structure to check
   * @returns Safety check result
   */
  private applySafetyChecks(dag: DAGStructure): { safe: boolean; reason?: string } {
    for (const task of dag.tasks) {
      for (const check of this.config.safetyChecks) {
        if (check.toolPattern.test(task.tool) && check.requiresConfirmation) {
          return {
            safe: false,
            reason: `${check.reason}: ${task.tool}`,
          };
        }
      }
    }

    return { safe: true };
  }

  /**
   * Execute DAG speculatively
   *
   * Executes tasks via MCP clients (real mode) or simulates execution (dry_run mode).
   * Respects dependency order and handles task failures gracefully.
   *
   * @param dag - DAG structure to execute
   * @returns Array of execution results
   */
  private async executeDAG(dag: DAGStructure): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];

    // Execute tasks in dependency order
    const executedTasks = new Set<string>();

    for (const task of dag.tasks) {
      // Wait for dependencies
      const depsReady = task.dependsOn.every((dep) => executedTasks.has(dep));
      if (!depsReady) {
        results.push({
          taskId: task.id,
          tool: task.tool,
          success: false,
          error: "Dependency not ready",
          executionTime: 0,
        });
        continue;
      }

      // Execute task (real or dry_run based on config - ADR-030)
      const startTime = performance.now();
      try {
        const result = await this.executeTask(task);
        const executionTime = performance.now() - startTime;

        results.push({
          taskId: task.id,
          tool: task.tool,
          success: true,
          result: result as JsonValue,
          executionTime,
        });

        executedTasks.add(task.id);
      } catch (error) {
        results.push({
          taskId: task.id,
          tool: task.tool,
          success: false,
          error: String(error),
          executionTime: performance.now() - startTime,
        });
      }
    }

    return results;
  }

  /**
   * Execute a task (routes to real or simulated based on config)
   *
   * ADR-030: Supports both real execution and dry_run mode.
   *
   * @param task - Task to execute
   * @returns Execution result
   */
  private async executeTask(task: Task): Promise<unknown> {
    if (this.config.executionMode === "dry_run") {
      return this.simulateToolExecution(task);
    }
    return this.executeToolReal(task);
  }

  /**
   * Execute tool via MCP client (ADR-030)
   *
   * Tracing is automatically handled by wrapMCPClient() from Story 7.1.
   *
   * @param task - Task to execute
   * @returns Real execution result from MCP server
   */
  private async executeToolReal(task: Task): Promise<unknown> {
    // Parse tool ID: "serverId:toolName" or "mcp__serverId__toolName"
    let serverId: string;
    let toolName: string;

    if (task.tool.includes(":")) {
      [serverId, toolName] = task.tool.split(":", 2);
    } else if (task.tool.includes("__")) {
      // Format: mcp__server__tool
      const parts = task.tool.split("__");
      if (parts.length >= 3) {
        serverId = parts[1];
        toolName = parts.slice(2).join("__");
      } else {
        throw new Error(`Invalid tool format: ${task.tool}`);
      }
    } else {
      throw new Error(
        `Invalid tool format: ${task.tool} (expected server:tool or mcp__server__tool)`,
      );
    }

    const client = this.mcpClients.get(serverId);
    if (!client) {
      const available = Array.from(this.mcpClients.keys()).join(", ");
      throw new Error(`MCP server "${serverId}" not connected. Available: ${available || "none"}`);
    }

    log.debug(`[ADR-030] Executing real tool: ${serverId}:${toolName}`, {
      arguments: Object.keys(task.arguments || {}),
    });

    // Call the real MCP tool (tracing handled by wrapMCPClient - Story 7.1)
    const result = await client.callTool(toolName, task.arguments || {});

    log.debug(`[ADR-030] Tool execution completed: ${serverId}:${toolName}`);

    return result;
  }

  /**
   * Simulate tool execution (dry_run mode)
   *
   * Used for dry-run/preview without side effects.
   * ADR-031 will enhance this with cached results and schema-based mocks.
   *
   * @param task - Task to simulate
   * @returns Simulated result
   */
  private async simulateToolExecution(task: Task): Promise<unknown> {
    // Simulate async execution
    await new Promise((resolve) => setTimeout(resolve, 10));
    return {
      taskId: task.id,
      tool: task.tool,
      status: "completed",
      output: `Simulated execution of ${task.tool}`,
      _dry_run: true,
    };
  }

  /**
   * Record user feedback on suggestion
   *
   * @param confidence - Confidence of the suggestion
   * @param accepted - Whether user accepted the suggestion
   */
  recordUserFeedback(confidence: number, accepted: boolean): void {
    this.adaptiveManager.recordExecution({
      confidence,
      mode: "suggestion",
      success: true,
      userAccepted: accepted,
      timestamp: Date.now(),
    });
  }

  /**
   * Get current adaptive thresholds
   *
   * @returns Current thresholds
   */
  getAdaptiveThresholds(): { explicitThreshold: number; suggestionThreshold: number } {
    const thresholds = this.adaptiveManager.getThresholds();
    return {
      explicitThreshold: thresholds.explicitThreshold ?? this.config.explicitThreshold,
      suggestionThreshold: thresholds.suggestionThreshold ?? this.config.suggestionThreshold,
    };
  }

  /**
   * Get speculative execution metrics
   *
   * @returns Metrics
   */
  getMetrics() {
    return this.adaptiveManager.getMetrics();
  }

  /**
   * Get graph statistics
   *
   * @returns Current graph statistics
   */
  getGraphStats() {
    return this.graphEngine.getStats();
  }
}
