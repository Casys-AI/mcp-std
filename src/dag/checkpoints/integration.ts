/**
 * Checkpoint Integration Module
 *
 * Provides checkpoint save/restore functionality for fault-tolerant workflow execution.
 * Integrates with CheckpointManager for persistence.
 *
 * @module dag/checkpoints/integration
 */

import type { CheckpointManager } from "../checkpoint-manager.ts";
import type { Checkpoint } from "../types.ts";
import type { WorkflowState } from "../state.ts";
import { getLogger } from "../../telemetry/logger.ts";

const log = getLogger("default");

/**
 * Save a checkpoint after layer completion (Story 2.5-2)
 *
 * Note: This function only persists the checkpoint. Event emission is handled
 * by the caller (ControlledExecutor.saveCheckpoint) to avoid duplicate events.
 *
 * @param checkpointManager - CheckpointManager instance
 * @param workflowId - Workflow identifier
 * @param layerIdx - Completed layer index
 * @param state - Current workflow state
 * @returns Checkpoint ID, empty string if no manager, or null on failure
 */
export async function saveCheckpointAfterLayer(
  checkpointManager: CheckpointManager | null,
  workflowId: string,
  layerIdx: number,
  state: WorkflowState,
): Promise<string | null> {
  if (!checkpointManager) {
    return "";
  }

  try {
    const checkpoint = await checkpointManager.saveCheckpoint(
      workflowId,
      layerIdx,
      state,
    );

    return checkpoint.id;
  } catch (error) {
    // Checkpoint save failure should not stop execution
    log.error(`Checkpoint save failed at layer ${layerIdx}: ${error}`);
    return null;
  }
}

/**
 * Load a checkpoint for resume (Story 2.5-2)
 *
 * @param checkpointManager - CheckpointManager instance
 * @param checkpointId - Checkpoint UUID to load
 * @returns Checkpoint or null if not found
 * @throws Error if CheckpointManager not set
 */
export async function loadCheckpoint(
  checkpointManager: CheckpointManager | null,
  checkpointId: string,
): Promise<Checkpoint | null> {
  if (!checkpointManager) {
    throw new Error(
      "CheckpointManager not set - call setCheckpointManager() first",
    );
  }

  const checkpoint = await checkpointManager.loadCheckpoint(checkpointId);
  if (!checkpoint) {
    throw new Error(`Checkpoint ${checkpointId} not found`);
  }

  log.info(
    `Loaded checkpoint ${checkpointId} for workflow ${checkpoint.workflowId} (layer ${checkpoint.layer})`,
  );

  return checkpoint;
}

/**
 * Calculate completed and remaining layers for resume
 *
 * @param checkpointLayer - Layer index from checkpoint
 * @param totalLayers - Total number of layers
 * @returns Object with completed count and remaining indices
 */
export function calculateResumeProgress(
  checkpointLayer: number,
  totalLayers: number,
): { completedCount: number; remainingStartIdx: number } {
  const completedCount = checkpointLayer + 1; // Layers 0 to checkpoint.layer are done
  const remainingStartIdx = completedCount;

  log.info(
    `Resume progress: ${completedCount} completed, ${totalLayers - completedCount} remaining`,
  );

  return { completedCount, remainingStartIdx };
}
