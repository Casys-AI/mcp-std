/**
 * OpenTelemetry Integration (Native Deno Support)
 *
 * Uses Deno's built-in OTEL support (Deno 2.2+).
 * Enable with: OTEL_DENO=true deno run --unstable-otel ...
 *
 * @module telemetry/otel
 */

import { trace, type Span, type Tracer, SpanStatusCode } from "@opentelemetry/api";

// Tracer instance for algorithm decisions
let algorithmTracer: Tracer | null = null;

/**
 * Get or create the algorithm tracer
 */
export function getAlgorithmTracer(): Tracer {
  if (!algorithmTracer) {
    algorithmTracer = trace.getTracer("pml.algorithms", "1.0.0");
  }
  return algorithmTracer;
}

/**
 * Algorithm decision attributes for OTEL spans
 */
export interface AlgorithmSpanAttributes {
  "algorithm.name": string;
  "algorithm.mode": string;
  "algorithm.intent": string;
  "algorithm.target_type": string;
  "algorithm.final_score": number;
  "algorithm.threshold": number;
  "algorithm.decision": string;
  "algorithm.target_id"?: string;
  [key: string]: string | number | boolean | undefined;
}

/**
 * Create a span for algorithm decision tracing
 *
 * @example
 * ```typescript
 * const span = startAlgorithmSpan("SHGAT", {
 *   "algorithm.name": "SHGAT",
 *   "algorithm.mode": "passive_suggestion",
 *   "algorithm.intent": "read a file",
 *   "algorithm.target_type": "capability",
 *   "algorithm.final_score": 0.85,
 *   "algorithm.threshold": 0.7,
 *   "algorithm.decision": "accepted",
 * });
 * // ... do work ...
 * span.end();
 * ```
 */
export function startAlgorithmSpan(
  name: string,
  attributes: AlgorithmSpanAttributes,
): Span {
  const tracer = getAlgorithmTracer();
  const span = tracer.startSpan(`algorithm.${name}`, { attributes });
  return span;
}

/**
 * Record algorithm decision as a span (fire-and-forget)
 *
 * Uses startActiveSpan to properly link the span to the current trace context.
 * This ensures algorithm spans appear as children of the HTTP request span
 * and are correctly exported to Jaeger/OTLP.
 */
export function recordAlgorithmDecision(
  name: string,
  attributes: AlgorithmSpanAttributes,
  success: boolean = true,
): void {
  const tracer = getAlgorithmTracer();
  tracer.startActiveSpan(`algorithm.${name}`, { attributes }, (span) => {
    span.setStatus({
      code: success ? SpanStatusCode.OK : SpanStatusCode.ERROR,
    });
    span.end();
  });
}

/**
 * Check if OTEL is enabled (via OTEL_DENO env var)
 */
export function isOtelEnabled(): boolean {
  try {
    return Deno.env.get("OTEL_DENO") === "true";
  } catch {
    return false;
  }
}
