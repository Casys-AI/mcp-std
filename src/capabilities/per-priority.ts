/**
 * PER Priority - Prioritized Experience Replay for TD Learning (Story 11.3)
 *
 * Implements TD Error calculation and PER priority assignment for execution traces.
 * Part of the TD + PER + SHGAT architecture (style DQN/Rainbow).
 *
 * Flow:
 * 1. Execution completes → trace created
 * 2. calculateTDError() → predicted - actual
 * 3. priority = |tdError| → stored with trace
 * 4. Story 11.6: SHGAT samples by priority for training
 *
 * @module capabilities/per-priority
 */

import type { SHGAT } from "../graphrag/algorithms/shgat.ts";
import type { ExecutionTraceStore, SaveTraceInput } from "./execution-trace-store.ts";
import type { ExecutionTrace } from "./types.ts";
import { getLogger } from "../telemetry/logger.ts";

const logger = getLogger("default");

// ============================================================================
// Constants
// ============================================================================

/**
 * Default priority for cold start (SHGAT not yet trained)
 *
 * 0.5 = neutral priority, neither high nor low.
 * Used when SHGAT cannot make a meaningful prediction.
 */
export const COLD_START_PRIORITY = 0.5;

/**
 * Minimum priority to avoid zero-priority traces
 * Ensures all traces have some chance of being sampled
 */
export const MIN_PRIORITY = 0.01;

/**
 * Maximum priority (capped to avoid extreme outliers)
 */
export const MAX_PRIORITY = 1.0;

// ============================================================================
// Types
// ============================================================================

/**
 * Interface for vector search to generate embeddings
 */
export interface EmbeddingProvider {
  getEmbedding(text: string): Promise<number[]>;
}

/**
 * Result of TD Error calculation
 */
export interface TDErrorResult {
  /** TD Error value: actual - predicted */
  tdError: number;
  /** Absolute TD Error used as PER priority */
  priority: number;
  /** SHGAT's prediction for the path */
  predicted: number;
  /** Actual outcome (1.0 = success, 0.0 = failure) */
  actual: number;
  /** Whether this was a cold start (SHGAT not trained) */
  isColdStart: boolean;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Calculate TD Error for a trace
 *
 * TD Error = actual - predicted
 * Priority = |TD Error|
 *
 * High priority = surprising outcome (SHGAT was wrong)
 * Low priority = expected outcome (SHGAT was right)
 *
 * @param shgat - SHGAT instance for prediction
 * @param embeddingProvider - Provider to generate intent embedding
 * @param trace - Execution trace with intentText and executedPath
 * @returns TD Error result with priority
 *
 * @example
 * ```typescript
 * const result = await calculateTDError(shgat, vectorSearch, trace);
 * // result.priority = 0.9 → SHGAT predicted 0.9, actual was 0.0 (failure)
 * // This trace is very surprising and should be prioritized for learning
 * ```
 */
export async function calculateTDError(
  shgat: SHGAT,
  embeddingProvider: EmbeddingProvider,
  trace: Pick<ExecutionTrace, "intentText" | "executedPath" | "success">,
): Promise<TDErrorResult> {
  const actual = trace.success ? 1.0 : 0.0;

  // Check if SHGAT has any nodes registered (cold start detection)
  const hasNodes = shgat.getCapabilityCount() > 0 || shgat.getToolCount() > 0;
  if (!hasNodes) {
    logger.debug("[PER] Cold start: no nodes in SHGAT", {
      success: trace.success,
    });
    return {
      tdError: 0,
      priority: COLD_START_PRIORITY,
      predicted: COLD_START_PRIORITY,
      actual,
      isColdStart: true,
    };
  }

  // Generate embedding for intent
  const intentText = trace.intentText ?? "";
  const intentEmbedding = await embeddingProvider.getEmbedding(intentText);

  // Get SHGAT prediction for the path
  const executedPath = trace.executedPath ?? [];
  const predicted = shgat.predictPathSuccess(intentEmbedding, executedPath);

  // Calculate TD Error
  const tdError = actual - predicted;
  const priority = Math.min(MAX_PRIORITY, Math.max(MIN_PRIORITY, Math.abs(tdError)));

  logger.debug("[PER] TD Error calculated", {
    intentText: intentText.slice(0, 50),
    pathLength: executedPath.length,
    predicted,
    actual,
    tdError,
    priority,
  });

  return {
    tdError,
    priority,
    predicted,
    actual,
    isColdStart: false,
  };
}

/**
 * Store a trace with PER priority
 *
 * Calculates TD Error and stores the trace with priority for PER sampling.
 *
 * @param traceStore - ExecutionTraceStore instance
 * @param shgat - SHGAT instance for prediction
 * @param embeddingProvider - Provider to generate intent embedding
 * @param trace - Trace data to store (without id)
 * @returns Saved trace with priority
 *
 * @example
 * ```typescript
 * const savedTrace = await storeTraceWithPriority(
 *   traceStore,
 *   shgat,
 *   vectorSearch,
 *   {
 *     capabilityId: "cap-123",
 *     intentText: "read file and send to slack",
 *     executedPath: ["filesystem:read", "slack:send"],
 *     success: true,
 *     durationMs: 150,
 *     decisions: [],
 *     taskResults: [],
 *   }
 * );
 * // savedTrace.priority will be set based on TD Error
 * ```
 */
export async function storeTraceWithPriority(
  traceStore: ExecutionTraceStore,
  shgat: SHGAT,
  embeddingProvider: EmbeddingProvider,
  trace: Omit<SaveTraceInput, "priority">,
): Promise<ExecutionTrace> {
  // Calculate TD Error and priority
  const { priority, tdError, predicted, isColdStart } = await calculateTDError(
    shgat,
    embeddingProvider,
    trace,
  );

  // Store trace with priority
  const savedTrace = await traceStore.saveTrace({
    ...trace,
    priority,
  });

  logger.info("[PER] Trace stored with priority", {
    traceId: savedTrace.id,
    capabilityId: savedTrace.capabilityId,
    success: savedTrace.success,
    priority,
    tdError,
    predicted,
    isColdStart,
  });

  return savedTrace;
}

/**
 * Update priority for an existing trace after SHGAT training
 *
 * Called by Story 11.6 after SHGAT batch training to recalculate
 * priorities based on updated model predictions.
 *
 * @param traceStore - ExecutionTraceStore instance
 * @param shgat - Updated SHGAT instance
 * @param embeddingProvider - Provider to generate intent embedding
 * @param trace - Existing trace to update
 * @returns true if priority was updated, false if skipped (unchanged)
 */
export async function updateTracePriority(
  traceStore: ExecutionTraceStore,
  shgat: SHGAT,
  embeddingProvider: EmbeddingProvider,
  trace: ExecutionTrace,
): Promise<boolean> {
  const { priority, tdError } = await calculateTDError(shgat, embeddingProvider, trace);

  // Only update if priority changed significantly
  const priorityDiff = Math.abs(priority - trace.priority);
  if (priorityDiff < 0.05) {
    logger.debug("[PER] Priority unchanged, skipping update", {
      traceId: trace.id,
      oldPriority: trace.priority,
      newPriority: priority,
    });
    return false;
  }

  await traceStore.updatePriority(trace.id, priority);

  logger.debug("[PER] Trace priority updated", {
    traceId: trace.id,
    oldPriority: trace.priority,
    newPriority: priority,
    tdError,
  });

  return true;
}

/**
 * Batch update priorities for multiple traces
 *
 * Used after SHGAT training to refresh priorities for recent traces.
 *
 * @param traceStore - ExecutionTraceStore instance
 * @param shgat - Updated SHGAT instance
 * @param embeddingProvider - Provider to generate intent embedding
 * @param traces - Traces to update
 * @returns Number of traces updated
 */
export async function batchUpdatePriorities(
  traceStore: ExecutionTraceStore,
  shgat: SHGAT,
  embeddingProvider: EmbeddingProvider,
  traces: ExecutionTrace[],
): Promise<number> {
  let updated = 0;
  let skipped = 0;

  for (const trace of traces) {
    try {
      const wasUpdated = await updateTracePriority(traceStore, shgat, embeddingProvider, trace);
      if (wasUpdated) {
        updated++;
      } else {
        skipped++;
      }
    } catch (error) {
      logger.warn("[PER] Failed to update trace priority", {
        traceId: trace.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info("[PER] Batch priority update completed", {
    total: traces.length,
    updated,
    skipped,
  });

  return updated;
}

/**
 * Update trace priorities directly from pre-computed TD errors
 *
 * More efficient than batchUpdatePriorities() as it doesn't recalculate
 * TD errors via SHGAT forward pass.
 *
 * Used after trainBatch() which already computed TD errors during training.
 *
 * @param traceStore - ExecutionTraceStore instance
 * @param traces - Traces that were trained on
 * @param tdErrorsPerTrace - Map of trace ID → max |TD error| from training
 * @returns Number of traces updated
 */
export async function batchUpdatePrioritiesFromTDErrors(
  traceStore: ExecutionTraceStore,
  traces: ExecutionTrace[],
  tdErrorsPerTrace: Map<string, number>,
): Promise<number> {
  let updated = 0;

  for (const trace of traces) {
    const tdError = tdErrorsPerTrace.get(trace.id);
    if (tdError === undefined) continue;

    // Priority = |TD error| clamped to [MIN_PRIORITY, MAX_PRIORITY]
    const priority = Math.max(MIN_PRIORITY, Math.min(MAX_PRIORITY, Math.abs(tdError)));

    try {
      await traceStore.updatePriority(trace.id, priority);
      updated++;
    } catch (error) {
      logger.warn("[PER] Failed to update trace priority from TD error", {
        traceId: trace.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.debug("[PER] Batch priority update from TD errors completed", {
    total: traces.length,
    updated,
  });

  return updated;
}
