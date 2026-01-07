/**
 * Speculation Integration Module
 *
 * Integrates speculative execution with DAG workflow execution.
 * Handles prediction, caching, and validation of speculative results.
 *
 * @module dag/speculation/integration
 */

import type { DAGSuggester } from "../../graphrag/dag-suggester.ts";
import type {
  CompletedTask,
  SpeculationCache,
  SpeculationConfig,
  SpeculationMetrics,
} from "../../graphrag/types.ts";
import { SpeculativeExecutor } from "./speculative-executor.ts";
import {
  DEFAULT_SPECULATION_CONFIG,
  SpeculationManager,
} from "./speculation-manager.ts";
import { getLogger } from "../../telemetry/logger.ts";

const log = getLogger("default");

/**
 * Speculation integration state
 */
export interface SpeculationState {
  executor: SpeculativeExecutor | null;
  manager: SpeculationManager | null;
  config: SpeculationConfig;
  lastCompletedTool: string | null;
}

/**
 * Create initial speculation state
 */
export function createSpeculationState(): SpeculationState {
  return {
    executor: null,
    manager: null,
    config: { ...DEFAULT_SPECULATION_CONFIG },
    lastCompletedTool: null,
  };
}

/**
 * Enable speculative execution (Story 3.5-1)
 *
 * Configures speculation with optional custom settings.
 *
 * @param state - Current speculation state
 * @param dagSuggester - DAGSuggester for predictions
 * @param config - Optional speculation configuration
 * @returns Updated speculation state
 */
export function enableSpeculation(
  state: SpeculationState,
  dagSuggester: DAGSuggester | null,
  config?: Partial<SpeculationConfig>,
): SpeculationState {
  const newConfig = {
    ...DEFAULT_SPECULATION_CONFIG,
    ...config,
  };

  // Initialize executor if not already done
  let executor = state.executor;
  if (!executor) {
    executor = new SpeculativeExecutor({
      maxConcurrent: newConfig.maxConcurrent,
    });
  }

  // Initialize manager if not already done
  let manager = state.manager;
  if (!manager) {
    manager = new SpeculationManager(newConfig);
  }

  // Connect components
  executor.setSpeculationManager(manager);

  // Connect to GraphRAG if DAGSuggester is available
  if (dagSuggester) {
    manager.setGraphEngine(dagSuggester.getGraphEngine());
  }

  log.info("[SpeculationIntegration] Speculation enabled", {
    threshold: newConfig.confidenceThreshold,
    maxConcurrent: newConfig.maxConcurrent,
  });

  return {
    executor,
    manager,
    config: newConfig,
    lastCompletedTool: state.lastCompletedTool,
  };
}

/**
 * Disable speculative execution
 *
 * @param state - Current speculation state
 * @returns Updated speculation state (disabled)
 */
export function disableSpeculation(state: SpeculationState): SpeculationState {
  if (state.executor) {
    state.executor.destroy();
  }

  log.info("[SpeculationIntegration] Speculation disabled");

  return {
    executor: null,
    manager: null,
    config: { ...state.config, enabled: false },
    lastCompletedTool: null,
  };
}

/**
 * Callback type for capturing speculation start events
 */
export type SpeculationCaptureCallback = (
  workflowId: string,
  toolId: string,
  confidence: number,
  reasoning: string,
) => void;

/**
 * Start speculative execution for predicted tasks (Story 3.5-1 Task 4.1)
 *
 * Called internally before each layer to predict and speculatively execute
 * likely next tools.
 *
 * @param state - Current speculation state
 * @param dagSuggester - DAGSuggester for predictions
 * @param completedTasks - Tasks completed so far
 * @param context - Execution context
 * @param workflowId - Current workflow ID
 * @param captureCallback - Callback to capture speculation events
 */
export async function startSpeculativeExecution(
  state: SpeculationState,
  dagSuggester: DAGSuggester | null,
  completedTasks: CompletedTask[],
  context: Record<string, unknown>,
  workflowId: string,
  captureCallback?: SpeculationCaptureCallback,
): Promise<void> {
  if (!state.config.enabled || !dagSuggester || !state.executor) {
    return;
  }

  try {
    const startTime = performance.now();

    // Get predictions from DAGSuggester
    const predictions = await dagSuggester.predictNextNodes(null, completedTasks);

    if (predictions.length === 0) {
      log.debug("[SpeculationIntegration] No predictions for speculation");
      return;
    }

    // Filter predictions that meet threshold
    const toSpeculate = state.manager
      ? state.manager.filterForSpeculation(predictions)
      : predictions.filter((p) => p.confidence >= state.config.confidenceThreshold);

    if (toSpeculate.length === 0) {
      log.debug("[SpeculationIntegration] No predictions meet speculation threshold");
      return;
    }

    // Capture speculation start events for metrics
    if (captureCallback) {
      for (const prediction of toSpeculate) {
        captureCallback(
          workflowId,
          prediction.toolId,
          prediction.confidence,
          prediction.reasoning,
        );
      }
    }

    // Start speculative execution (non-blocking)
    await state.executor.startSpeculations(toSpeculate, context);

    const elapsedMs = performance.now() - startTime;
    log.info(
      `[SpeculationIntegration] Started ${toSpeculate.length} speculations (${
        elapsedMs.toFixed(1)
      }ms)`,
    );
  } catch (error) {
    log.error(`[SpeculationIntegration] Speculation start failed: ${error}`);
    // Non-critical: Continue with normal execution
  }
}

/**
 * Check speculation cache for a tool (Story 3.5-1 Task 4.4)
 *
 * @param state - Current speculation state
 * @param toolId - Tool to check
 * @returns Cached result or null
 */
export function checkSpeculativeCache(
  state: SpeculationState,
  toolId: string,
): SpeculationCache | null {
  if (!state.executor) {
    return null;
  }

  return state.executor.checkCache(toolId);
}

/**
 * Validate and consume speculation result (Story 3.5-1 Task 4.5)
 *
 * @param state - Current speculation state
 * @param toolId - Tool being executed
 * @returns Cached result if speculation was correct, null otherwise
 */
export async function consumeSpeculation(
  state: SpeculationState,
  toolId: string,
): Promise<SpeculationCache | null> {
  if (!state.executor) {
    return null;
  }

  return await state.executor.validateAndConsume(
    toolId,
    state.lastCompletedTool ?? undefined,
  );
}

/**
 * Get speculation metrics (Story 3.5-1)
 *
 * @param state - Current speculation state
 * @returns Current speculation metrics or null if not enabled
 */
export function getSpeculationMetrics(state: SpeculationState): SpeculationMetrics | null {
  if (!state.manager) {
    return null;
  }
  return state.manager.getMetrics();
}

/**
 * Update last completed tool for pattern reinforcement
 *
 * @param state - Current speculation state
 * @param toolId - Completed tool ID
 * @returns Updated speculation state
 */
export function updateLastCompletedTool(
  state: SpeculationState,
  toolId: string,
): SpeculationState {
  return {
    ...state,
    lastCompletedTool: toolId,
  };
}
