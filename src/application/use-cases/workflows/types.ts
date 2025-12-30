/**
 * Workflow Use Case Types
 *
 * Shared types for workflow-related use cases.
 *
 * @module application/use-cases/workflows/types
 */

import type { DAGStructure } from "../../../graphrag/types.ts";

// Re-export shared types
export type { UseCaseError, UseCaseResult } from "../shared/types.ts";

/**
 * Workflow state (dynamic - not a fixed enum)
 * Note: "paused" = "awaiting_approval" (same state)
 */
export type WorkflowState = "created" | "running" | "paused" | "complete" | "aborted";

/**
 * Task result for workflow operations
 */
export interface WorkflowTaskResult {
  taskId: string;
  status: "success" | "error" | "failed_safe";
  output: unknown;
}

// ============================================================================
// Execute Workflow
// ============================================================================

/**
 * Request to execute a workflow
 */
export interface ExecuteWorkflowRequest {
  /** Natural language intent describing what to accomplish */
  intent?: string;
  /** Pre-built DAG to execute (alternative to intent) */
  dag?: DAGStructure;
  /** Optional workflow ID (generated if not provided) */
  workflowId?: string;
  /** Enable per-layer validation checkpoints */
  perLayerValidation?: boolean;
  /** Timeout per task in milliseconds */
  taskTimeout?: number;
}

/**
 * Result of workflow execution
 */
export interface ExecuteWorkflowResult {
  workflowId: string;
  state: WorkflowState;
  dag: DAGStructure;
  completedTasks: WorkflowTaskResult[];
  currentLayer: number;
  totalLayers: number;
  /** Pending checkpoint if awaiting approval */
  pendingCheckpoint?: PendingCheckpoint;
}

/**
 * Pending approval checkpoint
 */
export interface PendingCheckpoint {
  checkpointId: string;
  layer: number;
  pendingTasks: string[];
  message: string;
}

// ============================================================================
// Resume Workflow
// ============================================================================

/**
 * Request to resume a paused workflow
 */
export interface ResumeWorkflowRequest {
  workflowId: string;
  reason?: string;
}

/**
 * Result of resuming a workflow
 */
export interface ResumeWorkflowResult extends ExecuteWorkflowResult {}

// ============================================================================
// Abort Workflow
// ============================================================================

/**
 * Request to abort a workflow
 */
export interface AbortWorkflowRequest {
  workflowId: string;
  reason: string;
}

/**
 * Result of aborting a workflow
 */
export interface AbortWorkflowResult {
  workflowId: string;
  reason: string;
  completedLayers: number;
  partialResults: WorkflowTaskResult[];
}

// ============================================================================
// Replan Workflow
// ============================================================================

/**
 * Request to replan a workflow with new requirements
 */
export interface ReplanWorkflowRequest {
  workflowId: string;
  newRequirement: string;
  availableContext?: Record<string, unknown>;
}

/**
 * Result of replanning a workflow
 */
export interface ReplanWorkflowResult {
  workflowId: string;
  newRequirement: string;
  newTasksAdded: number;
  newTaskIds: string[];
  totalTasks: number;
  updatedDag: DAGStructure;
}

// ============================================================================
// Approval Response
// ============================================================================

/**
 * Request to respond to an approval checkpoint
 */
export interface ApprovalResponseRequest {
  workflowId: string;
  checkpointId: string;
  approved: boolean;
  feedback?: string;
}

/**
 * Result of approval response
 */
export interface ApprovalResponseResult {
  workflowId: string;
  checkpointId: string;
  approved: boolean;
  /** If approved, workflow continues */
  continueResult?: ExecuteWorkflowResult;
  /** If rejected, workflow is aborted */
  abortResult?: AbortWorkflowResult;
}
