/**
 * Adaptive Threshold Learning Manager
 *
 * Learns optimal confidence thresholds based on execution feedback.
 * Adjusts thresholds dynamically to minimize false positives and false negatives.
 *
 * Extended in Epic 4 Phase 1 (Story 4.1c) with PGlite persistence:
 * - Thresholds survive server restarts
 * - Context-based threshold lookup (per ADR-008)
 *
 * @module mcp/adaptive-threshold
 */

import * as log from "@std/log";
import type { ExecutionRecord, SpeculativeMetrics } from "../graphrag/types.ts";
import type { PGliteClient } from "../db/client.ts";
import type { StoredThreshold, ThresholdContext } from "../learning/types.ts";

/**
 * Adaptive threshold configuration
 */
export interface AdaptiveConfig {
  initialExplicitThreshold: number;
  initialSuggestionThreshold: number;
  learningRate: number;
  minThreshold: number;
  maxThreshold: number;
  windowSize: number; // Number of recent executions to consider
}

/**
 * Threshold adjustment result
 */
interface ThresholdAdjustment {
  explicitThreshold?: number;
  suggestionThreshold?: number;
  reason: string;
}

/**
 * Adaptive Threshold Manager
 *
 * Uses sliding window of recent executions to adjust thresholds dynamically.
 * Increases thresholds if too many false positives (failed speculative executions).
 * Decreases thresholds if too many false negatives (successful manual confirmations).
 *
 * Epic 4 Phase 1: Added PGlite persistence for thresholds.
 */
export class AdaptiveThresholdManager {
  private config: AdaptiveConfig;
  private executionHistory: ExecutionRecord[] = [];
  private currentThresholds: {
    explicitThreshold?: number;
    suggestionThreshold?: number;
  } = {};

  // Epic 4 Phase 1: Persistence layer
  private db: PGliteClient | null = null;
  private thresholdCache: Map<string, StoredThreshold> = new Map();
  private currentContextHash: string = "default";

  constructor(config?: Partial<AdaptiveConfig>, db?: PGliteClient) {
    this.config = {
      initialExplicitThreshold: 0.50,
      initialSuggestionThreshold: 0.70,
      learningRate: 0.05,
      minThreshold: 0.40,
      maxThreshold: 0.90,
      windowSize: 50,
      ...config,
    };
    this.db = db ?? null;
  }

  /**
   * Set database client for persistence (can be set after construction)
   */
  setDatabase(db: PGliteClient): void {
    this.db = db;
  }

  /**
   * Load thresholds from database for a specific context
   *
   * @param context - Context for threshold lookup
   * @returns Loaded thresholds or null if not found
   */
  async loadThresholds(context?: ThresholdContext): Promise<StoredThreshold | null> {
    if (!this.db) return null;

    const contextHash = this.hashContext(context || {});
    this.currentContextHash = contextHash;

    // Check cache first
    if (this.thresholdCache.has(contextHash)) {
      const cached = this.thresholdCache.get(contextHash)!;
      this.currentThresholds = {
        suggestionThreshold: cached.suggestionThreshold,
        explicitThreshold: cached.explicitThreshold,
      };
      return cached;
    }

    try {
      const rows = await this.db.query(
        `SELECT context_hash, context_keys, suggestion_threshold, explicit_threshold,
                success_rate, sample_count, created_at, updated_at
         FROM adaptive_thresholds
         WHERE context_hash = $1`,
        [contextHash],
      );

      if (rows.length > 0) {
        const stored = this.deserializeThreshold(rows[0]);
        this.thresholdCache.set(contextHash, stored);
        this.currentThresholds = {
          suggestionThreshold: stored.suggestionThreshold,
          explicitThreshold: stored.explicitThreshold,
        };
        log.info(
          `[AdaptiveThreshold] Loaded thresholds for context ${contextHash}: suggestion=${
            stored.suggestionThreshold.toFixed(2)
          }, explicit=${stored.explicitThreshold.toFixed(2)}`,
        );
        return stored;
      }
    } catch (error) {
      log.error(`[AdaptiveThreshold] Failed to load thresholds: ${error}`);
    }

    return null;
  }

  /**
   * Save current thresholds to database
   *
   * @param context - Context for threshold storage
   */
  async saveThresholds(context?: ThresholdContext): Promise<void> {
    if (!this.db) return;

    const contextHash = context ? this.hashContext(context) : this.currentContextHash;
    const contextKeys = context || {};
    const thresholds = this.getThresholds();

    // Calculate success rate from recent history
    const speculativeExecs = this.executionHistory.filter((e) => e.mode === "speculative");
    const successRate = speculativeExecs.length > 0
      ? speculativeExecs.filter((e) => e.success).length / speculativeExecs.length
      : null;

    try {
      // Use query instead of exec for parameterized inserts (PGlite limitation)
      await this.db.query(
        `INSERT INTO adaptive_thresholds
           (context_hash, context_keys, suggestion_threshold, explicit_threshold, success_rate, sample_count, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (context_hash) DO UPDATE SET
           suggestion_threshold = $3,
           explicit_threshold = $4,
           success_rate = $5,
           sample_count = adaptive_thresholds.sample_count + $6,
           updated_at = NOW()`,
        [
          contextHash,
          JSON.stringify(contextKeys),
          thresholds.suggestionThreshold,
          thresholds.explicitThreshold,
          successRate,
          this.executionHistory.length,
        ],
      );

      // Update cache
      const stored: StoredThreshold = {
        contextHash,
        contextKeys,
        suggestionThreshold: thresholds.suggestionThreshold!,
        explicitThreshold: thresholds.explicitThreshold!,
        successRate,
        sampleCount: this.executionHistory.length,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.thresholdCache.set(contextHash, stored);

      log.debug(`[AdaptiveThreshold] Saved thresholds for context ${contextHash}`);
    } catch (error) {
      log.error(`[AdaptiveThreshold] Failed to save thresholds: ${error}`);
    }
  }

  /**
   * Get all stored thresholds (for monitoring/debugging)
   */
  async getAllStoredThresholds(): Promise<StoredThreshold[]> {
    if (!this.db) return [];

    try {
      const rows = await this.db.query(
        `SELECT context_hash, context_keys, suggestion_threshold, explicit_threshold,
                success_rate, sample_count, created_at, updated_at
         FROM adaptive_thresholds
         ORDER BY updated_at DESC`,
      );

      return rows.map((row) => this.deserializeThreshold(row));
    } catch (error) {
      log.error(`[AdaptiveThreshold] Failed to get all thresholds: ${error}`);
      return [];
    }
  }

  /**
   * Hash context for database lookup (matches EpisodicMemoryStore format)
   */
  private hashContext(context: ThresholdContext): string {
    const keys = ["workflowType", "domain", "complexity"];
    return keys
      .map((k) => `${k}:${context[k] ?? "default"}`)
      .join("|");
  }

  /**
   * Deserialize database row to StoredThreshold
   */
  private deserializeThreshold(row: Record<string, unknown>): StoredThreshold {
    return {
      contextHash: row.context_hash as string,
      contextKeys: typeof row.context_keys === "string"
        ? JSON.parse(row.context_keys)
        : row.context_keys as Record<string, unknown>,
      suggestionThreshold: Number(row.suggestion_threshold),
      explicitThreshold: Number(row.explicit_threshold),
      successRate: row.success_rate !== null ? Number(row.success_rate) : null,
      sampleCount: Number(row.sample_count),
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  /**
   * Record execution result for adaptive learning
   *
   * @param record - Execution record with confidence, mode, and outcome
   */
  recordExecution(record: ExecutionRecord): void {
    this.executionHistory.push(record);

    // Keep only recent executions (sliding window)
    if (this.executionHistory.length > this.config.windowSize) {
      this.executionHistory.shift();
    }

    // Adjust thresholds every 10 executions
    if (this.executionHistory.length % 10 === 0 && this.executionHistory.length >= 20) {
      this.adjustThresholds();
    }
  }

  /**
   * Adjust thresholds based on execution history
   *
   * Strategy:
   * - False positive (FP): Speculative execution failed → Increase threshold
   * - False negative (FN): Manual confirmation succeeded with high confidence → Decrease threshold
   * - True positive (TP): Speculative execution succeeded → Maintain threshold
   * - True negative (TN): Low confidence correctly required manual input → Maintain threshold
   */
  private adjustThresholds(): void {
    const recentExecutions = this.executionHistory.slice(-20);
    if (recentExecutions.length < 20) return;

    // Calculate metrics
    const speculativeExecs = recentExecutions.filter((e) => e.mode === "speculative");
    const suggestionExecs = recentExecutions.filter((e) => e.mode === "suggestion");

    // False positives: Speculative executions that failed
    const falsePositives = speculativeExecs.filter((e) => !e.success).length;
    const falsePositiveRate = speculativeExecs.length > 0
      ? falsePositives / speculativeExecs.length
      : 0;

    // False negatives: Suggestions with high confidence that user accepted
    const falseNegatives = suggestionExecs.filter(
      (e) => e.userAccepted && e.confidence >= (this.config.initialSuggestionThreshold - 0.1),
    ).length;
    const falseNegativeRate = suggestionExecs.length > 0
      ? falseNegatives / suggestionExecs.length
      : 0;

    // Adjustment logic
    const adjustment: ThresholdAdjustment = { reason: "" };

    if (falsePositiveRate > 0.2) {
      // Too many failed speculative executions → Increase threshold
      const increase = this.config.learningRate * falsePositiveRate;
      const newThreshold = Math.min(
        (this.currentThresholds.suggestionThreshold ?? this.config.initialSuggestionThreshold) +
          increase,
        this.config.maxThreshold,
      );

      adjustment.suggestionThreshold = newThreshold;
      adjustment.reason = `High false positive rate (${
        (falsePositiveRate * 100).toFixed(0)
      }%) → Increased threshold to ${newThreshold.toFixed(2)}`;
    } else if (falseNegativeRate > 0.3) {
      // Too many unnecessary manual confirmations → Decrease threshold
      const decrease = this.config.learningRate * falseNegativeRate;
      const newThreshold = Math.max(
        (this.currentThresholds.suggestionThreshold ?? this.config.initialSuggestionThreshold) -
          decrease,
        this.config.minThreshold,
      );

      adjustment.suggestionThreshold = newThreshold;
      adjustment.reason = `High false negative rate (${
        (falseNegativeRate * 100).toFixed(0)
      }%) → Decreased threshold to ${newThreshold.toFixed(2)}`;
    }

    // Apply adjustment
    if (adjustment.suggestionThreshold) {
      this.currentThresholds.suggestionThreshold = adjustment.suggestionThreshold;
      log.info(`Adaptive threshold adjustment: ${adjustment.reason}`);

      // Epic 4 Phase 1: Persist adjustment to database
      this.saveThresholds().catch((err) =>
        log.error(`[AdaptiveThreshold] Failed to persist adjustment: ${err}`)
      );
    }
  }

  /**
   * Get current thresholds (adaptive or default)
   *
   * @returns Current thresholds
   */
  getThresholds(): { explicitThreshold?: number; suggestionThreshold?: number } {
    return {
      explicitThreshold: this.currentThresholds.explicitThreshold ??
        this.config.initialExplicitThreshold,
      suggestionThreshold: this.currentThresholds.suggestionThreshold ??
        this.config.initialSuggestionThreshold,
    };
  }

  /**
   * Get speculative execution metrics
   *
   * @returns Metrics for monitoring and debugging
   */
  getMetrics(): SpeculativeMetrics {
    const speculativeExecs = this.executionHistory.filter((e) => e.mode === "speculative");

    const successfulExecutions = speculativeExecs.filter((e) => e.success).length;
    const failedExecutions = speculativeExecs.filter((e) => !e.success).length;

    const avgExecutionTime = speculativeExecs.length > 0
      ? speculativeExecs.reduce((sum, e) => sum + (e.executionTime || 0), 0) /
        speculativeExecs.length
      : 0;

    const avgConfidence = speculativeExecs.length > 0
      ? speculativeExecs.reduce((sum, e) => sum + e.confidence, 0) / speculativeExecs.length
      : 0;

    // Wasted compute: Failed executions
    const wastedComputeCost = failedExecutions * avgExecutionTime;

    // Saved latency: Successful speculative executions (no user wait time)
    const savedLatency = successfulExecutions * 2000; // Assume 2s saved per speculative execution

    return {
      totalSpeculativeAttempts: speculativeExecs.length,
      successfulExecutions,
      failedExecutions,
      avgExecutionTime,
      avgConfidence,
      wastedComputeCost,
      savedLatency,
    };
  }

  /**
   * Reset adaptive learning (for testing)
   */
  reset(): void {
    this.executionHistory = [];
    this.currentThresholds = {};
  }
}
