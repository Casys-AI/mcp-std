/**
 * Prediction and Speculation Types
 *
 * Types for speculative execution and prediction features (Story 3.5-1).
 *
 * @module graphrag/types/prediction
 */

import type { JsonValue } from "../../capabilities/types.ts";

/**
 * Predicted next node for speculative execution (Story 3.5-1, Story 7.4)
 *
 * Represents a tool or capability that is likely to be requested next based on:
 * - Historical co-occurrence patterns
 * - Community membership (Louvain)
 * - Learned capabilities (Story 7.4)
 * - Agent hints and learned patterns
 *
 * Note: "adamic-adar" source removed per ADR-038 (dilutes signal for passive suggestion).
 */
export interface PredictedNode {
  toolId: string;
  confidence: number;
  reasoning: string;
  /**
   * Prediction source (Story 7.4 - ADR-038)
   *
   * - community: Same Louvain community as completed task
   * - co-occurrence: Historical edge weight (observed co-usage)
   * - capability: Learned capability matching context tools (Story 7.4)
   * - hint: Agent-provided hint for bootstrap
   * - learned: Pattern learned from execution history
   */
  source: "community" | "co-occurrence" | "capability" | "hint" | "learned";
  wasCorrect?: boolean; // Set after validation
  /**
   * Capability ID if source is "capability" (Story 7.4)
   */
  capabilityId?: string;
  /**
   * Inferred arguments for speculative execution
   *
   * Populated from previous task results using ProvidesEdge field mappings.
   * When set, enables real speculative execution instead of placeholder preparation.
   */
  arguments?: Record<string, unknown>;
}

/**
 * Configuration for speculative execution (Story 3.5-1)
 */
export interface SpeculationConfig {
  enabled: boolean;
  confidenceThreshold: number; // Default: 0.70
  maxConcurrent: number; // Default: 3
}

/**
 * Cached result from speculative execution (Story 3.5-1)
 */
export interface SpeculationCache {
  predictionId: string;
  toolId: string;
  result: JsonValue;
  confidence: number;
  timestamp: number;
  executionTimeMs: number;
}

/**
 * Speculation metrics for monitoring (Story 3.5-1)
 */
export interface SpeculationMetrics {
  hitRate: number;
  netBenefitMs: number;
  falsePositiveRate: number;
  totalSpeculations: number;
  totalHits: number;
  totalMisses: number;
}

/**
 * Learned pattern from execution history (Story 3.5-1)
 */
export interface LearnedPattern {
  fromTool: string;
  toTool: string;
  successRate: number;
  observationCount: number;
  avgConfidence: number;
  source: "user" | "learned";
}

/**
 * Workflow state for prediction (Story 3.5-1)
 */
export interface WorkflowPredictionState {
  workflowId: string;
  currentLayer: number;
  completedTasks: CompletedTask[];
  context?: Record<string, unknown>;
}

/**
 * Completed task for prediction context (Story 3.5-1)
 */
export interface CompletedTask {
  taskId: string;
  tool: string;
  status: "success" | "error" | "failed_safe";
  executionTimeMs?: number;
}
