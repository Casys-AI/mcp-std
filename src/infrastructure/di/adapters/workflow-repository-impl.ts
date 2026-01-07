/**
 * Workflow Repository Implementation
 *
 * In-memory implementation of IWorkflowRepository.
 * Stores workflow state with optional persistence via CheckpointManager.
 *
 * Phase 3.2: DI Container Expansion
 *
 * @module infrastructure/di/adapters/workflow-repository-impl
 */

import { WorkflowRepository } from "../container.ts";
import type {
  CreateWorkflowInput,
  UpdateWorkflowInput,
  WorkflowState,
  WorkflowStatus,
} from "../../../domain/interfaces/workflow-repository.ts";
import type { DAGStructure } from "../../../graphrag/types.ts";

/**
 * In-memory implementation of workflow repository.
 *
 * Provides workflow state management with Map storage.
 * Can be extended with persistence via CheckpointManager.
 */
export class WorkflowRepositoryImpl extends WorkflowRepository {
  private readonly workflows = new Map<string, WorkflowState>();

  /**
   * Create a new workflow
   */
  create = async (input: CreateWorkflowInput): Promise<WorkflowState> => {
    const workflowId = input.workflowId ?? crypto.randomUUID();
    const now = new Date();

    const state: WorkflowState = {
      workflowId,
      status: "created",
      intent: input.intent,
      dag: input.dag,
      currentLayer: 0,
      totalLayers: this.countTasks(input.dag),
      results: [],
      createdAt: now,
      updatedAt: now,
      learningContext: input.learningContext,
    };

    this.workflows.set(workflowId, state);
    return state;
  };

  /**
   * Get workflow by ID
   */
  get = async (workflowId: string): Promise<WorkflowState | null> => {
    return this.workflows.get(workflowId) ?? null;
  };

  /**
   * Update workflow state
   */
  update = async (workflowId: string, input: UpdateWorkflowInput): Promise<WorkflowState> => {
    const existing = this.workflows.get(workflowId);
    if (!existing) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const updated: WorkflowState = {
      ...existing,
      ...(input.status !== undefined && { status: input.status }),
      ...(input.currentLayer !== undefined && { currentLayer: input.currentLayer }),
      ...(input.results !== undefined && { results: input.results }),
      ...(input.latestCheckpointId !== undefined && { latestCheckpointId: input.latestCheckpointId }),
      updatedAt: new Date(),
    };

    this.workflows.set(workflowId, updated);
    return updated;
  };

  /**
   * Delete a workflow
   */
  delete = async (workflowId: string): Promise<void> => {
    this.workflows.delete(workflowId);
  };

  /**
   * List active workflows (running or paused)
   */
  listActive = async (): Promise<WorkflowState[]> => {
    const activeStatuses: WorkflowStatus[] = ["created", "running", "paused", "awaiting_approval"];
    return Array.from(this.workflows.values())
      .filter((w) => activeStatuses.includes(w.status));
  };

  /**
   * Get workflows awaiting approval
   */
  listAwaitingApproval = async (): Promise<WorkflowState[]> => {
    return Array.from(this.workflows.values())
      .filter((w) => w.status === "awaiting_approval");
  };

  /**
   * Count tasks in a DAG structure
   */
  private countTasks(dag?: DAGStructure): number {
    if (!dag) return 0;
    return dag.tasks?.length ?? 0;
  }

  /** Get all workflows (for debugging) */
  getAll(): Map<string, WorkflowState> {
    return new Map(this.workflows);
  }

  /** Clear all workflows (for testing) */
  clear(): void {
    this.workflows.clear();
  }
}
