/**
 * Speculation Module
 *
 * Provides speculative execution of predicted tools in isolated sandboxes.
 * Integrates with DAG workflow execution for predictive performance optimization.
 *
 * Story 3.5-1: DAG Suggester & Speculative Execution
 * Story 3.5-2: Confidence-Based Speculation & Rollback
 *
 * @module dag/speculation
 */

// Core speculation management
export {
  DEFAULT_SPECULATION_CONFIG,
  SpeculationManager,
  type SpeculationOutcome,
} from "./speculation-manager.ts";

// Speculative executor with sandbox isolation
export {
  SpeculativeExecutor,
  type SpeculativeExecutorConfig,
} from "./speculative-executor.ts";

// Integration with DAG execution
export {
  checkSpeculativeCache,
  consumeSpeculation,
  createSpeculationState,
  disableSpeculation,
  enableSpeculation,
  getSpeculationMetrics,
  startSpeculativeExecution,
  updateLastCompletedTool,
  type SpeculationCaptureCallback,
  type SpeculationState,
} from "./integration.ts";
