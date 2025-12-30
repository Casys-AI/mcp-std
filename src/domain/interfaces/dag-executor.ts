/**
 * DAG Executor Interface
 *
 * Defines the contract for DAG workflow execution.
 * Implementations: ControlledExecutor
 *
 * Phase 2.1: Foundation for DI with diod
 *
 * @module domain/interfaces/dag-executor
 */

import type { JsonValue } from "../../capabilities/types/mod.ts";
import type { DAGStructure, Task } from "../../graphrag/types.ts";

// Re-export for consumers
export type { DAGStructure, Task as DAGTask };

/**
 * Context for DAG execution
 */
export interface ExecutionContext {
  /** Initial input values */
  inputs?: Record<string, JsonValue>;
  /** Timeout in milliseconds */
  timeout?: number;
  /** User ID for multi-tenancy */
  userId?: string;
  /** Parent trace ID for hierarchical execution */
  parentTraceId?: string;
}

/**
 * Result of DAG execution
 */
export interface DAGExecutionResult {
  /** Workflow ID for tracking */
  workflowId: string;
  /** Whether execution completed successfully */
  success: boolean;
  /** Task results by task ID */
  results: Record<string, TaskResult>;
  /** Total execution duration */
  durationMs: number;
  /** Error message if failed */
  error?: string;
  /** Execution trace ID */
  traceId?: string;
}

/**
 * Result of a single task
 */
export interface TaskResult {
  taskId: string;
  success: boolean;
  output?: JsonValue;
  error?: string;
  durationMs: number;
}

/**
 * State update for workflow
 */
export interface StateUpdate {
  workflowId: string;
  status?: "running" | "paused" | "completed" | "failed";
  currentTask?: string;
  results?: Record<string, TaskResult>;
}

/**
 * Command for workflow control
 */
export interface Command {
  type: "continue" | "abort" | "retry" | "skip";
  workflowId: string;
  taskId?: string;
  data?: Record<string, JsonValue>;
}

/**
 * Interface for DAG workflow execution
 *
 * This interface abstracts the execution engine,
 * supporting different execution strategies and
 * easy mocking in tests.
 */
export interface IDAGExecutor {
  /**
   * Execute a DAG workflow
   */
  execute(dag: DAGStructure, context?: ExecutionContext): Promise<DAGExecutionResult>;

  /**
   * Resume a paused workflow
   */
  resume(workflowId: string): Promise<DAGExecutionResult>;

  /**
   * Abort a running workflow
   */
  abort(workflowId: string, reason?: string): Promise<void>;

  /**
   * Get current workflow state
   */
  getState(): Readonly<{
    workflowId: string;
    status: string;
    currentTask?: string;
  }> | null;

  /**
   * Enqueue a command for the executor
   */
  enqueueCommand(command: Command): void;

  /**
   * Update workflow state
   */
  updateState(update: StateUpdate): void;
}
