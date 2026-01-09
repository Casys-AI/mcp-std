/**
 * Worker Bridge Factory Adapter
 *
 * Adapts createToolExecutorViaWorker and cleanupWorkerBridgeExecutor
 * to IWorkerBridgeFactory interface.
 *
 * Phase 3.1: Execute Handler → Use Cases refactoring
 *
 * @module infrastructure/di/adapters/execute/worker-bridge-factory-adapter
 */

import type { MCPClientBase } from "../../../../mcp/types.ts";
import type { CapabilityStore } from "../../../../capabilities/capability-store.ts";
import type { CapabilityRegistry } from "../../../../capabilities/capability-registry.ts";
import type { GraphRAGEngine } from "../../../../graphrag/graph-engine.ts";
import {
  createToolExecutorViaWorker,
  cleanupWorkerBridgeExecutor,
  type ExecutorContext,
} from "../../../../dag/execution/workerbridge-executor.ts";
import type { ControlledExecutor } from "../../../../dag/controlled-executor.ts";

/**
 * DAG executor interface (simplified for use case)
 */
export interface IDAGExecutor {
  execute(dag: { tasks: unknown[] }): Promise<{
    results: Array<{
      taskId: string;
      status: string;
      output?: unknown;
      error?: string;
      executionTimeMs?: number;
    }>;
    failedTasks: number;
    errors: Array<{ taskId: string; error: string }>;
    parallelizationLayers: number;
  }>;
  setWorkerBridge?(bridge: unknown): void;
  setToolDefinitions?(defs: unknown[]): void;
  setCheckpointManager?(db: unknown, enabled: boolean): void;
  setLearningDependencies?(capabilityStore: unknown, graphEngine: unknown): void;
  calculateSpeedup?(results: unknown): number;
}

/**
 * Worker bridge context for cleanup
 */
export interface WorkerBridgeContext {
  bridge: unknown;
  traces: unknown[];
}

/**
 * IWorkerBridgeFactory interface (matches ExecuteDirectUseCase dependency)
 */
export interface IWorkerBridgeFactory {
  create(config: { toolDefinitions?: unknown[] }): [IDAGExecutor, WorkerBridgeContext];
  cleanup(context: WorkerBridgeContext): void;
}

/**
 * Dependencies for WorkerBridgeFactoryAdapter
 */
export interface WorkerBridgeFactoryAdapterDeps {
  mcpClients: Map<string, MCPClientBase>;
  capabilityStore?: CapabilityStore;
  capabilityRegistry?: CapabilityRegistry;
  graphRAG?: GraphRAGEngine;
  /** Factory to create ControlledExecutor instances */
  createExecutor?: () => ControlledExecutor;
  /** Execution timeout in ms (default: 30000) */
  timeout?: number;
}

/**
 * Adapts WorkerBridge factory functions to IWorkerBridgeFactory interface
 */
export class WorkerBridgeFactoryAdapter implements IWorkerBridgeFactory {
  constructor(private readonly deps: WorkerBridgeFactoryAdapterDeps) {}

  /**
   * Create a DAG executor with worker bridge
   */
  create(config: { toolDefinitions?: unknown[] }): [IDAGExecutor, WorkerBridgeContext] {
    // Create tool executor and context via WorkerBridge
    const [toolExecutor, executorContext] = createToolExecutorViaWorker({
      mcpClients: this.deps.mcpClients,
      toolDefinitions: config.toolDefinitions as Array<{
        server: string;
        name: string;
        description: string;
        inputSchema: Record<string, unknown>;
      }>,
      capabilityStore: this.deps.capabilityStore,
      capabilityRegistry: this.deps.capabilityRegistry,
      graphRAG: this.deps.graphRAG,
      timeout: this.deps.timeout ?? 30000,
    });

    // Create or get executor instance
    const executor = this.createExecutorInstance(toolExecutor, executorContext);

    return [
      executor,
      {
        bridge: executorContext.bridge,
        traces: executorContext.traces,
      },
    ];
  }

  /**
   * Cleanup worker bridge context
   */
  cleanup(context: WorkerBridgeContext): void {
    cleanupWorkerBridgeExecutor(context as ExecutorContext);
  }

  /**
   * Create executor instance with tool executor
   */
  private createExecutorInstance(
    toolExecutor: (tool: string, args: Record<string, unknown>) => Promise<unknown>,
    context: ExecutorContext,
  ): IDAGExecutor {
    // If custom factory provided, use it
    if (this.deps.createExecutor) {
      const executor = this.deps.createExecutor();
      executor.setWorkerBridge?.(context.bridge);
      return executor as unknown as IDAGExecutor;
    }

    // Create a simple executor wrapper
    return new SimpleDAGExecutor(toolExecutor, context);
  }
}

/**
 * Simple DAG executor that wraps a tool executor
 *
 * Executes tasks sequentially for simplicity. For parallel execution,
 * use ControlledExecutor via createExecutor factory.
 */
class SimpleDAGExecutor implements IDAGExecutor {
  constructor(
    private readonly toolExecutor: (tool: string, args: Record<string, unknown>) => Promise<unknown>,
    _context: ExecutorContext, // Keep reference for potential future use
  ) {}

  async execute(dag: { tasks: unknown[] }): Promise<{
    results: Array<{
      taskId: string;
      status: string;
      output?: unknown;
      error?: string;
      executionTimeMs?: number;
    }>;
    successfulTasks: number;
    failedTasks: number;
    errors: Array<{ taskId: string; error: string }>;
    parallelizationLayers: number;
  }> {
    const results: Array<{
      taskId: string;
      status: string;
      output?: unknown;
      error?: string;
      executionTimeMs?: number;
    }> = [];
    const errors: Array<{ taskId: string; error: string }> = [];
    let failedTasks = 0;
    let successfulTasks = 0;

    const tasks = dag.tasks as Array<{
      id: string;
      tool?: string;
      arguments?: Record<string, unknown>;
      staticArguments?: Record<string, { type: string; value?: unknown; expression?: string }>;
    }>;

    // Track results for reference resolution
    const previousResults = new Map<string, { status: string; output?: unknown }>();

    // Execute tasks sequentially (respecting dependencies handled externally)
    for (const task of tasks) {
      const startTime = performance.now();

      try {
        if (!task.tool) {
          results.push({
            taskId: task.id,
            status: "skipped",
            executionTimeMs: 0,
          });
          continue;
        }

        // Resolve arguments from staticArguments (Phase 3.2 fix)
        const resolvedArgs = this.resolveStaticArguments(
          task.arguments ?? {},
          task.staticArguments,
          previousResults,
        );

        const output = await this.toolExecutor(task.tool, resolvedArgs);
        successfulTasks++;
        previousResults.set(task.id, { status: "success", output });
        results.push({
          taskId: task.id,
          status: "success",
          output,
          executionTimeMs: performance.now() - startTime,
        });
      } catch (error) {
        failedTasks++;
        const errorMsg = error instanceof Error ? error.message : String(error);
        previousResults.set(task.id, { status: "error" });
        errors.push({ taskId: task.id, error: errorMsg });
        results.push({
          taskId: task.id,
          status: "error",
          error: errorMsg,
          executionTimeMs: performance.now() - startTime,
        });
      }
    }

    return {
      results,
      successfulTasks,
      failedTasks,
      errors,
      parallelizationLayers: 1, // Sequential execution = 1 layer
    };
  }

  /**
   * Resolve arguments from staticArguments and legacy formats
   *
   * Ported from ParallelExecutor.resolveArguments() (Phase 3.2 fix)
   * Handles:
   * - literal: value known at static analysis time
   * - reference: resolve from previous task output (with task_ prefix mapping)
   * - parameter: should have been resolved statically
   * - Legacy $OUTPUT[task_id] format for backward compatibility
   */
  private resolveStaticArguments(
    args: Record<string, unknown>,
    staticArgs: Record<string, { type: string; value?: unknown; expression?: string }> | undefined,
    previousResults: Map<string, { status: string; output?: unknown }>,
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};

    // 1. Resolve from staticArguments (Story 10.5 structured format)
    if (staticArgs) {
      for (const [key, argValue] of Object.entries(staticArgs)) {
        if (argValue.type === "literal") {
          // Literal: value known at static analysis time
          resolved[key] = argValue.value;
        } else if (argValue.type === "reference" && argValue.expression) {
          // Reference: resolve from previous task result
          const resolvedValue = this.resolveStructuredReference(
            argValue.expression,
            previousResults,
          );
          if (resolvedValue !== undefined) {
            resolved[key] = resolvedValue;
          }
        } else if (argValue.type === "parameter") {
          // Parameter: should have been resolved statically, skip if not in args
          // (parameters are resolved before execution in resolveDAGArguments)
        }
      }
    }

    // 2. Resolve from args (legacy $OUTPUT format + literals)
    for (const [key, value] of Object.entries(args)) {
      // Skip if already resolved from staticArgs
      if (key in resolved) continue;

      if (typeof value === "string" && value.startsWith("$OUTPUT[")) {
        // DEPRECATED: $OUTPUT[task_id] format (kept for backward compatibility)
        const match = value.match(/^\$OUTPUT\[([^\]]+)\](\.(.+))?$/);

        if (match) {
          const taskId = match[1];
          const propertyPath = match[3];
          const result = previousResults.get(taskId);

          if (!result) {
            console.warn(`[WorkerBridgeExecutor] Reference to undefined task output: ${taskId}`);
            continue;
          }

          if (result.status === "error") {
            console.warn(`[WorkerBridgeExecutor] Reference to failed task output: ${taskId}`);
            continue;
          }

          if (propertyPath) {
            resolved[key] = this.getNestedProperty(result.output, propertyPath);
          } else {
            resolved[key] = result.output;
          }
        } else {
          resolved[key] = value;
        }
      } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        // Recursively resolve nested objects
        resolved[key] = this.resolveStaticArguments(
          value as Record<string, unknown>,
          undefined,
          previousResults,
        );
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  /**
   * Resolve a structured reference expression (Story 10.5)
   *
   * Expression format: "nodeId.property.path" or "nodeId[0].property"
   * Task ID mapping: nodeId → "task_nodeId" (prefix added by staticStructureToDag)
   */
  private resolveStructuredReference(
    expression: string,
    previousResults: Map<string, { status: string; output?: unknown }>,
  ): unknown {
    // Handle template literals: `${n1.path}/suffix`
    if (expression.startsWith("`") && expression.endsWith("`")) {
      return this.resolveTemplateLiteral(expression, previousResults);
    }

    // Parse expression: "n1.content.nested" or "n1[0].value"
    const firstDot = expression.indexOf(".");
    const firstBracket = expression.indexOf("[");

    let nodeId: string;
    let propertyPath: string | undefined;

    if (firstDot === -1 && firstBracket === -1) {
      // Just node ID, no property path: "n1"
      nodeId = expression;
    } else if (firstBracket !== -1 && (firstDot === -1 || firstBracket < firstDot)) {
      // Array access first: "n1[0].value"
      nodeId = expression.substring(0, firstBracket);
      propertyPath = expression.substring(firstBracket);
    } else {
      // Property access first: "n1.content"
      nodeId = expression.substring(0, firstDot);
      propertyPath = expression.substring(firstDot + 1);
    }

    // Map node ID to task ID (staticStructureToDag uses "task_" prefix)
    const taskId = `task_${nodeId}`;
    const result = previousResults.get(taskId);

    if (!result) {
      console.warn(`[WorkerBridgeExecutor] Reference to unknown task: ${taskId} (from expression: ${expression})`);
      return undefined;
    }

    if (result.status === "error") {
      console.warn(`[WorkerBridgeExecutor] Reference to failed task: ${taskId}`);
      return undefined;
    }

    if (!propertyPath) {
      return result.output;
    }

    return this.getNestedPropertyWithArrays(result.output, propertyPath);
  }

  /**
   * Resolve template literal expressions like `${n1.path}/suffix`
   */
  private resolveTemplateLiteral(
    expression: string,
    previousResults: Map<string, { status: string; output?: unknown }>,
  ): string {
    const inner = expression.slice(1, -1);
    return inner.replace(/\$\{([^}]+)\}/g, (_match, expr: string) => {
      const resolved = this.resolveStructuredReference(expr.trim(), previousResults);
      return resolved !== undefined ? String(resolved) : "";
    });
  }

  /**
   * Get nested property supporting both dot notation and array access
   */
  private getNestedPropertyWithArrays(obj: unknown, path: string): unknown {
    const segments = path.split(/\.|\[|\]/).filter((s) => s !== "");
    let current: unknown = obj;

    for (const segment of segments) {
      if (current === null || current === undefined) {
        return undefined;
      }

      if (Array.isArray(current)) {
        const index = parseInt(segment, 10);
        if (isNaN(index)) {
          return undefined;
        }
        current = current[index];
      } else if (typeof current === "object") {
        current = (current as Record<string, unknown>)[segment];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * Get nested property from object using dot notation
   */
  private getNestedProperty(obj: unknown, path: string): unknown {
    const parts = path.split(".");
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  setWorkerBridge(bridge: unknown): void {
    // Bridge is set via constructor
    void bridge;
  }

  setToolDefinitions(defs: unknown[]): void {
    // Tool definitions handled by WorkerBridge
    void defs;
  }

  setCheckpointManager(_db: unknown, _enabled: boolean): void {
    // Not implemented in simple executor
  }

  setLearningDependencies(_capabilityStore: unknown, _graphEngine: unknown): void {
    // Not implemented in simple executor
  }

  calculateSpeedup(_results: unknown): number {
    return 1; // No parallelization in simple executor
  }
}
