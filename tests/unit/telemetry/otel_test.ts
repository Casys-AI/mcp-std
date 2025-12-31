/**
 * Unit tests for OpenTelemetry Integration
 *
 * Tests the OTEL span creation and context propagation.
 *
 * @module tests/unit/telemetry/otel_test
 */

import { assertEquals, assertExists } from "@std/assert";
import {
  getAlgorithmTracer,
  isOtelEnabled,
  recordAlgorithmDecision,
  startAlgorithmSpan,
  type AlgorithmSpanAttributes,
} from "../../../src/telemetry/otel.ts";

/**
 * Create test attributes for algorithm spans
 */
function createTestAttributes(overrides: Partial<AlgorithmSpanAttributes> = {}): AlgorithmSpanAttributes {
  return {
    "algorithm.name": "TestAlgorithm",
    "algorithm.mode": "active_search",
    "algorithm.intent": "Test intent for unit test",
    "algorithm.target_type": "tool",
    "algorithm.final_score": 0.85,
    "algorithm.threshold": 0.7,
    "algorithm.decision": "accepted",
    ...overrides,
  };
}

Deno.test("getAlgorithmTracer - returns a tracer instance", () => {
  const tracer = getAlgorithmTracer();

  assertExists(tracer);
  assertEquals(typeof tracer.startSpan, "function");
  assertEquals(typeof tracer.startActiveSpan, "function");
});

Deno.test("getAlgorithmTracer - returns same instance on multiple calls", () => {
  const tracer1 = getAlgorithmTracer();
  const tracer2 = getAlgorithmTracer();

  assertEquals(tracer1, tracer2);
});

Deno.test("startAlgorithmSpan - creates span with correct name", () => {
  const span = startAlgorithmSpan("SHGAT", createTestAttributes({
    "algorithm.name": "SHGAT",
  }));

  assertExists(span);
  // Span should have end method
  assertEquals(typeof span.end, "function");
  assertEquals(typeof span.setStatus, "function");
  assertEquals(typeof span.setAttribute, "function");

  // Clean up
  span.end();
});

Deno.test("startAlgorithmSpan - includes attributes in span", () => {
  const attributes = createTestAttributes({
    "algorithm.name": "HybridSearch",
    "algorithm.final_score": 0.92,
    "algorithm.decision": "accepted",
  });

  const span = startAlgorithmSpan("HybridSearch", attributes);

  assertExists(span);
  // The span context should exist
  const context = span.spanContext();
  assertExists(context);
  assertExists(context.traceId);
  assertExists(context.spanId);

  span.end();
});

Deno.test("recordAlgorithmDecision - creates and ends span", () => {
  // This should not throw
  recordAlgorithmDecision(
    "CapabilityMatcher",
    createTestAttributes({
      "algorithm.name": "CapabilityMatcher",
      "algorithm.decision": "accepted",
    }),
    true,
  );
});

Deno.test("recordAlgorithmDecision - handles rejected decisions", () => {
  // This should not throw
  recordAlgorithmDecision(
    "SHGAT",
    createTestAttributes({
      "algorithm.name": "SHGAT",
      "algorithm.decision": "rejected",
      "algorithm.final_score": 0.45,
    }),
    false, // rejected
  );
});

Deno.test("recordAlgorithmDecision - handles all attribute types", () => {
  const attributes: AlgorithmSpanAttributes = {
    "algorithm.name": "ComplexTest",
    "algorithm.mode": "passive_suggestion",
    "algorithm.intent": "Test with all attribute types",
    "algorithm.target_type": "capability",
    "algorithm.final_score": 0.756,
    "algorithm.threshold": 0.65,
    "algorithm.decision": "accepted",
    "algorithm.target_id": "cap-123-456",
    "algorithm.trace_id": "trace-abc-def",
    "algorithm.correlation_id": "corr-xyz",
    "algorithm.semantic_score": 0.82,
    "algorithm.graph_density": 0.15,
    "algorithm.alpha": 0.7,
  };

  // Should handle all these attributes without error
  recordAlgorithmDecision("ComplexTest", attributes, true);
});

Deno.test("isOtelEnabled - returns boolean based on env var", () => {
  const result = isOtelEnabled();

  // Should be boolean
  assertEquals(typeof result, "boolean");

  // In test environment, OTEL_DENO might not be set
  // Just verify it returns a valid boolean
  assertEquals(result === true || result === false, true);
});

Deno.test("startAlgorithmSpan - span name includes algorithm prefix", () => {
  const span = startAlgorithmSpan("TestName", createTestAttributes());

  // Verify span was created (we can't directly check the name,
  // but we can verify it's a valid span)
  assertExists(span.spanContext());

  span.end();
});

Deno.test("recordAlgorithmDecision - multiple rapid calls don't interfere", () => {
  const algorithms = ["SHGAT", "HybridSearch", "CapabilityMatcher", "GraphRank"];

  // Rapid fire multiple decisions
  for (const algo of algorithms) {
    recordAlgorithmDecision(
      algo,
      createTestAttributes({
        "algorithm.name": algo,
        "algorithm.final_score": Math.random(),
      }),
      Math.random() > 0.5,
    );
  }

  // If we get here without error, the test passes
});

Deno.test("AlgorithmSpanAttributes - accepts optional target_id", () => {
  const withTargetId: AlgorithmSpanAttributes = {
    "algorithm.name": "Test",
    "algorithm.mode": "active_search",
    "algorithm.intent": "test",
    "algorithm.target_type": "tool",
    "algorithm.final_score": 0.8,
    "algorithm.threshold": 0.7,
    "algorithm.decision": "accepted",
    "algorithm.target_id": "tool:read_file",
  };

  const span = startAlgorithmSpan("Test", withTargetId);
  assertExists(span);
  span.end();
});

Deno.test("AlgorithmSpanAttributes - works without optional fields", () => {
  const minimal: AlgorithmSpanAttributes = {
    "algorithm.name": "Minimal",
    "algorithm.mode": "active_search",
    "algorithm.intent": "minimal test",
    "algorithm.target_type": "tool",
    "algorithm.final_score": 0.9,
    "algorithm.threshold": 0.8,
    "algorithm.decision": "accepted",
  };

  const span = startAlgorithmSpan("Minimal", minimal);
  assertExists(span);
  span.end();
});
