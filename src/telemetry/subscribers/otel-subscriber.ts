/**
 * Algorithm OTEL Subscriber
 *
 * Subscribes to algorithm.decision events and emits OTEL spans.
 * Fires when OTEL is enabled (OTEL_DENO=true).
 *
 * @module telemetry/subscribers/otel-subscriber
 */

import type { AlgorithmDecisionPayload, EventHandler } from "../../events/types.ts";
import { eventBus } from "../../events/mod.ts";
import { isOtelEnabled, recordAlgorithmDecision } from "../otel.ts";
import { getLogger } from "../logger.ts";

const logger = getLogger("default");

/**
 * AlgorithmOTELSubscriber - Emits OTEL spans for algorithm decisions
 *
 * Only active when OTEL_DENO=true.
 * Extracts key attributes for Jaeger spanmetrics.
 */
export class AlgorithmOTELSubscriber {
  private unsubscribe: (() => void) | null = null;
  private enabled: boolean = false;

  /**
   * Start subscribing to algorithm.decision events
   */
  start(): void {
    this.enabled = isOtelEnabled();

    if (!this.enabled) {
      logger.warn("AlgorithmOTELSubscriber: OTEL not enabled (OTEL_DENO != 'true'), spans will NOT be exported");
      return;
    }

    const handler: EventHandler<"algorithm.decision"> = (event) => {
      this.handleDecision(event.payload as AlgorithmDecisionPayload);
    };
    this.unsubscribe = eventBus.on("algorithm.decision", handler);

    logger.info("AlgorithmOTELSubscriber started - spans will be exported to OTLP endpoint");
  }

  /**
   * Stop subscribing
   */
  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    logger.info("AlgorithmOTELSubscriber stopped");
  }

  /**
   * Handle incoming algorithm.decision event
   */
  private handleDecision(payload: AlgorithmDecisionPayload): void {
    // Map decision to accepted/rejected for OTEL
    const decision = payload.decision === "accepted" ? "accepted" : "rejected";

    // Emit OTEL span with key attributes
    // These attributes are extracted by Jaeger spanmetrics
    recordAlgorithmDecision(
      payload.algorithmName ?? "unknown",
      {
        "algorithm.name": payload.algorithmName ?? "unknown",
        "algorithm.mode": payload.algorithmMode,
        "algorithm.intent": payload.intent?.substring(0, 200) ?? "",
        "algorithm.target_type": payload.targetType,
        "algorithm.final_score": payload.finalScore,
        "algorithm.threshold": payload.thresholdUsed,
        "algorithm.decision": decision,
        "algorithm.target_id": payload.signals.targetId,
        // Additional attributes for richer metrics
        "algorithm.trace_id": payload.traceId,
        "algorithm.correlation_id": payload.correlationId ?? "",
        "algorithm.semantic_score": payload.signals.semanticScore ?? 0,
        "algorithm.graph_density": payload.signals.graphDensity,
        "algorithm.alpha": payload.params.alpha,
      },
      payload.decision === "accepted",
    );

    logger.info("OTEL span emitted for algorithm decision", {
      spanName: `algorithm.${payload.algorithmName ?? "unknown"}`,
      algorithm: payload.algorithmName,
      decision,
      targetType: payload.targetType,
      score: payload.finalScore,
    });
  }

  /**
   * Check if OTEL subscriber is active
   */
  isActive(): boolean {
    return this.enabled && this.unsubscribe !== null;
  }
}
