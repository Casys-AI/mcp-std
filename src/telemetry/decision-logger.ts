/**
 * Decision Logger - Clean Architecture Adapter
 *
 * Provides an abstract interface for algorithm decision logging.
 * Uses EventBus-centric architecture: emits events that subscribers handle.
 *
 * Subscribers:
 * - AlgorithmDBSubscriber: writes to Postgres
 * - AlgorithmOTELSubscriber: emits OTEL spans
 * - MetricsCollector: updates counters (via wildcard subscription)
 *
 * @module telemetry/decision-logger
 */

import { eventBus } from "../events/mod.ts";
import type { AlgorithmDecisionPayload } from "../events/types.ts";
import { isPureOperation } from "../capabilities/pure-operations.ts";

// ============================================================================
// Abstract Interface (Port)
// ============================================================================

/**
 * Algorithm decision data (domain-agnostic)
 *
 * This interface is intentionally loose to decouple use-cases
 * from infrastructure-specific types.
 */
export interface AlgorithmDecision {
  /** Algorithm name (e.g., "SHGAT", "DRDSP") */
  algorithm: string;
  /** Algorithm mode (e.g., "passive_suggestion", "active_search") */
  mode: "active_search" | "passive_suggestion";
  /** Target type (e.g., "tool", "capability") */
  targetType: "tool" | "capability";
  /** User intent (truncated) */
  intent: string;
  /** User ID for multi-tenant isolation */
  userId?: string;
  /** Final computed score */
  finalScore: number;
  /** Threshold used for decision */
  threshold: number;
  /** Decision outcome */
  decision: "accepted" | "rejected" | "rejected_by_threshold" | "filtered_by_reliability";
  /** Optional target ID */
  targetId?: string;
  /** Optional target name */
  targetName?: string;
  /** Optional correlation ID for tracing */
  correlationId?: string;
  /** Optional context hash */
  contextHash?: string;
  /** Additional signals (algorithm-specific) */
  signals?: {
    semanticScore?: number;
    graphScore?: number;
    successRate?: number;
    pagerank?: number;
    graphDensity?: number;
    spectralClusterMatch?: boolean;
    adamicAdar?: number;
    localAlpha?: number;
    alphaAlgorithm?: string;
    coldStart?: boolean;
    numHeads?: number;
    avgHeadScore?: number;
    headScores?: number[];
    headWeights?: number[];
    recursiveContribution?: number;
    featureContribSemantic?: number;
    featureContribStructure?: number;
    featureContribTemporal?: number;
    featureContribReliability?: number;
    targetSuccessRate?: number;
    targetUsageCount?: number;
    reliabilityMult?: number;
    pathFound?: boolean;
    pathLength?: number;
    pathWeight?: number;
  };
  /** Algorithm parameters used */
  params?: {
    alpha?: number;
    reliabilityFactor?: number;
    structuralBoost?: number;
  };
}

/**
 * Decision logger interface (Port)
 *
 * Use-cases depend on this abstraction, not concrete implementations.
 */
export interface IDecisionLogger {
  /**
   * Log an algorithm decision
   * @param decision - The decision data
   * @returns Trace ID for follow-up (feedback updates)
   */
  logDecision(decision: AlgorithmDecision): string;
}

// ============================================================================
// Concrete Implementation (Adapter)
// ============================================================================

/**
 * Telemetry Adapter - EventBus-centric implementation
 *
 * Implements IDecisionLogger by emitting events to EventBus.
 * Subscribers handle persistence (DB) and observability (OTEL).
 */
export class TelemetryAdapter implements IDecisionLogger {
  private userId: string | null = null;

  /**
   * Set user ID for multi-tenant trace isolation (Story 9.8)
   */
  setUserId(userId: string | null): void {
    this.userId = userId;
  }

  /**
   * Log algorithm decision by emitting event
   *
   * Returns traceId immediately (sync) - subscribers handle async work.
   */
  logDecision(decision: AlgorithmDecision): string {
    const traceId = crypto.randomUUID();

    // Auto-detect pure flag from targetId if not explicitly set
    const pure = decision.targetId ? isPureOperation(decision.targetId) : undefined;

    // Build full payload (use decision.userId or fallback to instance userId)
    const payload: AlgorithmDecisionPayload = {
      traceId,
      userId: decision.userId ?? this.userId ?? undefined,
      correlationId: decision.correlationId,
      algorithmName: decision.algorithm,
      algorithmMode: decision.mode,
      targetType: decision.targetType,
      intent: decision.intent?.substring(0, 200),
      contextHash: decision.contextHash,
      signals: {
        graphDensity: decision.signals?.graphDensity ?? 0,
        spectralClusterMatch: decision.signals?.spectralClusterMatch ?? false,
        semanticScore: decision.signals?.semanticScore,
        graphScore: decision.signals?.graphScore,
        successRate: decision.signals?.successRate,
        pagerank: decision.signals?.pagerank,
        adamicAdar: decision.signals?.adamicAdar,
        localAlpha: decision.signals?.localAlpha,
        alphaAlgorithm: decision.signals?.alphaAlgorithm,
        coldStart: decision.signals?.coldStart,
        numHeads: decision.signals?.numHeads,
        avgHeadScore: decision.signals?.avgHeadScore,
        headScores: decision.signals?.headScores,
        headWeights: decision.signals?.headWeights,
        recursiveContribution: decision.signals?.recursiveContribution,
        featureContribSemantic: decision.signals?.featureContribSemantic,
        featureContribStructure: decision.signals?.featureContribStructure,
        featureContribTemporal: decision.signals?.featureContribTemporal,
        featureContribReliability: decision.signals?.featureContribReliability,
        targetId: decision.targetId,
        targetName: decision.targetName,
        targetSuccessRate: decision.signals?.targetSuccessRate,
        targetUsageCount: decision.signals?.targetUsageCount,
        reliabilityMult: decision.signals?.reliabilityMult,
        pathFound: decision.signals?.pathFound,
        pathLength: decision.signals?.pathLength,
        pathWeight: decision.signals?.pathWeight,
        pure,
      },
      params: {
        alpha: decision.params?.alpha ?? 0,
        reliabilityFactor: decision.params?.reliabilityFactor ?? 1.0,
        structuralBoost: decision.params?.structuralBoost ?? 0,
      },
      finalScore: decision.finalScore,
      thresholdUsed: decision.threshold,
      decision: decision.decision,
    };

    // Emit event - subscribers handle the rest
    eventBus.emit({
      type: "algorithm.decision",
      source: "telemetry-adapter",
      payload,
    });

    return traceId;
  }
}

/**
 * No-op decision logger for testing
 */
export class NoOpDecisionLogger implements IDecisionLogger {
  logDecision(_decision: AlgorithmDecision): string {
    return crypto.randomUUID();
  }
}

// ============================================================================
// Singleton instance
// ============================================================================

let _adapter: TelemetryAdapter | null = null;

/**
 * Get the singleton TelemetryAdapter instance
 */
export function getTelemetryAdapter(): TelemetryAdapter {
  if (!_adapter) {
    _adapter = new TelemetryAdapter();
  }
  return _adapter;
}
