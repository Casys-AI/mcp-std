/**
 * Speculation Module
 *
 * Story 3.5-1: DAG Suggester & Speculative Execution
 * Story 3.5-2: Confidence-Based Speculation & Rollback
 *
 * This module provides speculative execution capabilities:
 * - SpeculationManager: Manages speculation triggers and feedback loops
 * - SpeculativeExecutor: Executes predictions in isolated sandboxes
 * - SpeculationConfigLoader: Loads and validates YAML configuration
 *
 * @module speculation
 */

// Core components
export { DEFAULT_SPECULATION_CONFIG, SpeculationManager } from "./speculation-manager.ts";
export type { SpeculationOutcome } from "./speculation-manager.ts";

export { SpeculativeExecutor } from "./speculative-executor.ts";
export type { SpeculativeExecutorConfig } from "./speculative-executor.ts";

// Config loader (Story 3.5-2)
export {
  ConfigValidationError,
  DEFAULT_FILE_CONFIG,
  DEFAULT_SPECULATION_CONFIG_PATH,
  loadSpeculationConfig,
  saveSpeculationConfig,
  toSpeculationConfig,
} from "./speculation-config-loader.ts";
export type { SpeculationFileConfig } from "./speculation-config-loader.ts";

// Re-export types from graphrag for convenience
export type {
  CompletedTask,
  PredictedNode,
  SpeculationCache,
  SpeculationConfig,
  SpeculationMetrics,
  WorkflowPredictionState,
} from "../graphrag/types.ts";
