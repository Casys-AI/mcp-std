/**
 * Speculation Manager
 *
 * Manages speculation triggering decisions based on confidence thresholds
 * and integrates with AdaptiveThresholdManager for dynamic threshold learning.
 *
 * Story 3.5-1: DAG Suggester & Speculative Execution
 *
 * @module speculation/speculation-manager
 */

import * as log from "@std/log";
import type { AdaptiveThresholdManager } from "../../mcp/adaptive-threshold.ts";
import type { GraphRAGEngine } from "../../graphrag/graph-engine.ts";
import type { PredictedNode, SpeculationConfig, SpeculationMetrics } from "../../graphrag/types.ts";

/**
 * Default speculation configuration (ADR-006)
 */
export const DEFAULT_SPECULATION_CONFIG: SpeculationConfig = {
  enabled: true,
  confidenceThreshold: 0.70, // AC #4: >0.70 for speculation
  maxConcurrent: 3,
};

/**
 * Speculation outcome for feedback loop
 */
export interface SpeculationOutcome {
  predictionId: string;
  toolId: string;
  wasCorrect: boolean;
  executionTimeMs: number;
  confidence: number;
}

/**
 * Speculation Manager
 *
 * Coordinates speculation decisions with:
 * - AdaptiveThresholdManager for dynamic thresholds (AC #6 READ)
 * - GraphRAGEngine for pattern reinforcement (AC #6 WRITE)
 * - Metrics tracking for hit/miss rates (AC #7)
 */
export class SpeculationManager {
  private config: SpeculationConfig;
  private thresholdManager: AdaptiveThresholdManager | null = null;
  private graphEngine: GraphRAGEngine | null = null;

  // Metrics tracking
  private totalSpeculations = 0;
  private totalHits = 0;
  private totalMisses = 0;
  private totalSavedMs = 0;
  private totalWastedMs = 0;

  constructor(config?: Partial<SpeculationConfig>) {
    this.config = {
      ...DEFAULT_SPECULATION_CONFIG,
      ...config,
    };
  }

  /**
   * Set AdaptiveThresholdManager for dynamic threshold learning (AC #6)
   *
   * @param thresholdManager - AdaptiveThresholdManager instance
   */
  setThresholdManager(thresholdManager: AdaptiveThresholdManager): void {
    this.thresholdManager = thresholdManager;
    log.debug("[SpeculationManager] ThresholdManager configured");
  }

  /**
   * Set GraphRAGEngine for pattern reinforcement (AC #6)
   *
   * @param graphEngine - GraphRAGEngine instance
   */
  setGraphEngine(graphEngine: GraphRAGEngine): void {
    this.graphEngine = graphEngine;
    log.debug("[SpeculationManager] GraphEngine configured");
  }

  /**
   * Get current speculation threshold (AC #4, #6)
   *
   * Reads from AdaptiveThresholdManager if available, otherwise uses config.
   *
   * @returns Current speculation confidence threshold
   */
  getSpeculationThreshold(): number {
    if (this.thresholdManager) {
      const thresholds = this.thresholdManager.getThresholds();
      // Use suggestion threshold as speculation threshold (they're correlated)
      return thresholds.suggestionThreshold ?? this.config.confidenceThreshold;
    }
    return this.config.confidenceThreshold;
  }

  /**
   * Check if speculation should be triggered for a prediction (AC #4)
   *
   * @param prediction - Predicted node with confidence
   * @returns true if speculation should be triggered
   */
  shouldSpeculate(prediction: PredictedNode): boolean {
    if (!this.config.enabled) {
      return false;
    }

    const threshold = this.getSpeculationThreshold();
    const shouldTrigger = prediction.confidence >= threshold;

    log.debug(
      `[SpeculationManager] shouldSpeculate(${prediction.toolId}): confidence=${
        prediction.confidence.toFixed(2)
      }, threshold=${threshold.toFixed(2)}, result=${shouldTrigger}`,
    );

    return shouldTrigger;
  }

  /**
   * Filter predictions that meet speculation threshold (AC #4)
   *
   * @param predictions - Array of predictions
   * @returns Filtered predictions meeting threshold (up to max_concurrent)
   */
  filterForSpeculation(predictions: PredictedNode[]): PredictedNode[] {
    const threshold = this.getSpeculationThreshold();

    return predictions
      .filter((p) => p.confidence >= threshold)
      .slice(0, this.config.maxConcurrent);
  }

  /**
   * Record speculation outcome for adaptive learning (AC #6 WRITE)
   *
   * Updates:
   * - AdaptiveThresholdManager with hit/miss
   * - GraphRAGEngine to reinforce successful patterns
   * - Internal metrics
   *
   * @param outcome - Speculation outcome
   * @param fromToolId - Source tool (for pattern reinforcement)
   */
  async recordOutcome(outcome: SpeculationOutcome, fromToolId?: string): Promise<void> {
    this.totalSpeculations++;

    if (outcome.wasCorrect) {
      this.totalHits++;
      this.totalSavedMs += outcome.executionTimeMs;

      // Feed success to threshold manager
      if (this.thresholdManager) {
        this.thresholdManager.recordExecution({
          confidence: outcome.confidence,
          mode: "speculative",
          success: true,
          executionTime: outcome.executionTimeMs,
          timestamp: Date.now(),
        });
      }

      // Reinforce pattern in GraphRAG (AC #6: hint feedback reinforces patterns)
      if (this.graphEngine && fromToolId) {
        await this.reinforcePattern(fromToolId, outcome.toolId);
      }

      log.info(
        `[SpeculationManager] HIT: ${outcome.toolId} (confidence=${
          outcome.confidence.toFixed(2)
        }, saved=${outcome.executionTimeMs}ms)`,
      );
    } else {
      this.totalMisses++;
      this.totalWastedMs += outcome.executionTimeMs;

      // Feed failure to threshold manager
      if (this.thresholdManager) {
        this.thresholdManager.recordExecution({
          confidence: outcome.confidence,
          mode: "speculative",
          success: false,
          executionTime: outcome.executionTimeMs,
          timestamp: Date.now(),
        });
      }

      log.info(
        `[SpeculationManager] MISS: ${outcome.toolId} (confidence=${
          outcome.confidence.toFixed(2)
        }, wasted=${outcome.executionTimeMs}ms)`,
      );
    }
  }

  /**
   * Reinforce pattern in GraphRAG when speculation succeeds (AC #6)
   *
   * Strengthens edge weight between fromTool and toTool.
   * Story 3.5-2: Actual persistence via graphEngine.addEdge()
   *
   * @param fromToolId - Source tool
   * @param toToolId - Target tool (correctly predicted)
   */
  private async reinforcePattern(fromToolId: string, toToolId: string): Promise<void> {
    if (!this.graphEngine) return;

    try {
      const currentEdge = this.graphEngine.getEdgeData(fromToolId, toToolId);

      if (currentEdge) {
        // Boost existing edge weight (up to 0.95 max)
        const newWeight = Math.min(currentEdge.weight * 1.05, 0.95);
        const newCount = currentEdge.count + 1;

        log.debug(
          `[SpeculationManager] Reinforcing edge ${fromToolId} -> ${toToolId}: ${
            currentEdge.weight.toFixed(2)
          } -> ${newWeight.toFixed(2)} (count: ${newCount})`,
        );

        // Persist the reinforced edge via GraphRAGEngine
        await this.graphEngine.addEdge(fromToolId, toToolId, {
          weight: newWeight,
          count: newCount,
          source: "learned",
        });
      } else {
        // Create new edge for learned pattern
        log.debug(
          `[SpeculationManager] New pattern learned: ${fromToolId} -> ${toToolId}`,
        );

        // Start with initial weight of 0.5 for new learned patterns
        await this.graphEngine.addEdge(fromToolId, toToolId, {
          weight: 0.5,
          count: 1,
          source: "learned",
        });
      }
    } catch (error) {
      log.error(`[SpeculationManager] Failed to reinforce pattern: ${error}`);
    }
  }

  /**
   * Get current speculation metrics (AC #7)
   *
   * @returns Speculation metrics for monitoring
   */
  getMetrics(): SpeculationMetrics {
    const hitRate = this.totalSpeculations > 0 ? this.totalHits / this.totalSpeculations : 0;

    const falsePositiveRate = this.totalSpeculations > 0
      ? this.totalMisses / this.totalSpeculations
      : 0;

    const netBenefitMs = this.totalSavedMs - this.totalWastedMs;

    return {
      hitRate: hitRate,
      netBenefitMs: netBenefitMs,
      falsePositiveRate: falsePositiveRate,
      totalSpeculations: this.totalSpeculations,
      totalHits: this.totalHits,
      totalMisses: this.totalMisses,
    };
  }

  /**
   * Reset metrics (for testing)
   */
  resetMetrics(): void {
    this.totalSpeculations = 0;
    this.totalHits = 0;
    this.totalMisses = 0;
    this.totalSavedMs = 0;
    this.totalWastedMs = 0;
  }

  /**
   * Update configuration
   *
   * @param config - Partial configuration to merge
   */
  updateConfig(config: Partial<SpeculationConfig>): void {
    this.config = { ...this.config, ...config };
    log.debug(`[SpeculationManager] Config updated: ${JSON.stringify(this.config)}`);
  }

  /**
   * Get current configuration
   */
  getConfig(): SpeculationConfig {
    return { ...this.config };
  }

  /**
   * Check if speculation is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }
}
