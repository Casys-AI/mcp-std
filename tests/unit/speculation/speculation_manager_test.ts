/**
 * Speculation Manager Tests
 *
 * Story 3.5-1: DAG Suggester & Speculative Execution
 * Tests for AC #4, #6, #7
 *
 * @module tests/unit/speculation/speculation_manager_test
 */

import { assertEquals, assertExists } from "@std/assert";
import {
  DEFAULT_SPECULATION_CONFIG,
  SpeculationManager,
} from "../../../src/dag/speculation/speculation-manager.ts";
import type { PredictedNode } from "../../../src/graphrag/types.ts";

// Helper to create a fresh manager
function createManager(): SpeculationManager {
  return new SpeculationManager();
}

// === shouldSpeculate tests ===

Deno.test("SpeculationManager: shouldSpeculate returns true when confidence meets threshold (AC #4)", () => {
  const manager = createManager();
  const prediction: PredictedNode = {
    toolId: "tool_a",
    confidence: 0.75,
    reasoning: "Test prediction",
    source: "co-occurrence",
  };

  const result = manager.shouldSpeculate(prediction);
  assertEquals(result, true);
});

Deno.test("SpeculationManager: shouldSpeculate returns false when confidence below threshold (AC #4)", () => {
  const manager = createManager();
  const prediction: PredictedNode = {
    toolId: "tool_a",
    confidence: 0.60,
    reasoning: "Test prediction",
    source: "co-occurrence",
  };

  const result = manager.shouldSpeculate(prediction);
  assertEquals(result, false);
});

Deno.test("SpeculationManager: uses default threshold of 0.70", () => {
  assertEquals(DEFAULT_SPECULATION_CONFIG.confidenceThreshold, 0.70);
});

Deno.test("SpeculationManager: shouldSpeculate returns false when speculation disabled", () => {
  const manager = createManager();
  manager.updateConfig({ enabled: false });

  const prediction: PredictedNode = {
    toolId: "tool_a",
    confidence: 0.90,
    reasoning: "Test prediction",
    source: "co-occurrence",
  };

  const result = manager.shouldSpeculate(prediction);
  assertEquals(result, false);
});

// === filterForSpeculation tests ===

Deno.test("SpeculationManager: filterForSpeculation filters predictions meeting threshold", () => {
  const manager = createManager();
  const predictions: PredictedNode[] = [
    { toolId: "tool_a", confidence: 0.80, reasoning: "Test", source: "co-occurrence" },
    { toolId: "tool_b", confidence: 0.65, reasoning: "Test", source: "community" },
    { toolId: "tool_c", confidence: 0.75, reasoning: "Test", source: "learned" },
    { toolId: "tool_d", confidence: 0.50, reasoning: "Test", source: "hint" },
  ];

  const filtered = manager.filterForSpeculation(predictions);

  assertEquals(filtered.length, 2);
  assertEquals(filtered[0].toolId, "tool_a");
  assertEquals(filtered[1].toolId, "tool_c");
});

Deno.test("SpeculationManager: filterForSpeculation respects max_concurrent limit", () => {
  const manager = createManager();
  manager.updateConfig({ maxConcurrent: 2 });

  const predictions: PredictedNode[] = [
    { toolId: "tool_a", confidence: 0.90, reasoning: "Test", source: "co-occurrence" },
    { toolId: "tool_b", confidence: 0.85, reasoning: "Test", source: "community" },
    { toolId: "tool_c", confidence: 0.80, reasoning: "Test", source: "learned" },
    { toolId: "tool_d", confidence: 0.75, reasoning: "Test", source: "hint" },
  ];

  const filtered = manager.filterForSpeculation(predictions);

  assertEquals(filtered.length, 2);
});

// === recordOutcome tests ===

Deno.test("SpeculationManager: recordOutcome tracks hit metrics (AC #7)", async () => {
  const manager = createManager();
  await manager.recordOutcome({
    predictionId: "pred_1",
    toolId: "tool_a",
    wasCorrect: true,
    executionTimeMs: 100,
    confidence: 0.80,
  });

  const metrics = manager.getMetrics();
  assertEquals(metrics.totalHits, 1);
  assertEquals(metrics.totalMisses, 0);
  assertEquals(metrics.totalSpeculations, 1);
  assertEquals(metrics.hitRate, 1.0);
});

Deno.test("SpeculationManager: recordOutcome tracks miss metrics (AC #7)", async () => {
  const manager = createManager();
  await manager.recordOutcome({
    predictionId: "pred_1",
    toolId: "tool_a",
    wasCorrect: false,
    executionTimeMs: 100,
    confidence: 0.80,
  });

  const metrics = manager.getMetrics();
  assertEquals(metrics.totalHits, 0);
  assertEquals(metrics.totalMisses, 1);
  assertEquals(metrics.totalSpeculations, 1);
  assertEquals(metrics.falsePositiveRate, 1.0);
});

Deno.test("SpeculationManager: recordOutcome calculates net benefit correctly (AC #7)", async () => {
  const manager = createManager();

  // Hit: saves 200ms
  await manager.recordOutcome({
    predictionId: "pred_1",
    toolId: "tool_a",
    wasCorrect: true,
    executionTimeMs: 200,
    confidence: 0.80,
  });

  // Miss: wastes 100ms
  await manager.recordOutcome({
    predictionId: "pred_2",
    toolId: "tool_b",
    wasCorrect: false,
    executionTimeMs: 100,
    confidence: 0.75,
  });

  const metrics = manager.getMetrics();
  assertEquals(metrics.netBenefitMs, 100); // 200 - 100
});

// === getMetrics tests ===

Deno.test("SpeculationManager: getMetrics returns valid metrics structure (AC #7)", () => {
  const manager = createManager();
  const metrics = manager.getMetrics();

  assertExists(metrics.hitRate);
  assertExists(metrics.netBenefitMs);
  assertExists(metrics.falsePositiveRate);
  assertExists(metrics.totalSpeculations);
  assertExists(metrics.totalHits);
  assertExists(metrics.totalMisses);
});

Deno.test("SpeculationManager: getMetrics returns zero metrics when no speculations", () => {
  const manager = createManager();
  const metrics = manager.getMetrics();

  assertEquals(metrics.hitRate, 0);
  assertEquals(metrics.netBenefitMs, 0);
  assertEquals(metrics.falsePositiveRate, 0);
  assertEquals(metrics.totalSpeculations, 0);
});

// === resetMetrics tests ===

Deno.test("SpeculationManager: resetMetrics resets all metrics to zero", async () => {
  const manager = createManager();

  await manager.recordOutcome({
    predictionId: "pred_1",
    toolId: "tool_a",
    wasCorrect: true,
    executionTimeMs: 100,
    confidence: 0.80,
  });

  manager.resetMetrics();

  const metrics = manager.getMetrics();
  assertEquals(metrics.totalSpeculations, 0);
  assertEquals(metrics.totalHits, 0);
  assertEquals(metrics.totalMisses, 0);
});

// === getSpeculationThreshold tests ===

Deno.test("SpeculationManager: getSpeculationThreshold returns configured threshold", () => {
  const manager = createManager();
  assertEquals(manager.getSpeculationThreshold(), 0.70);
});

Deno.test("SpeculationManager: getSpeculationThreshold returns custom threshold after update", () => {
  const manager = createManager();
  manager.updateConfig({ confidenceThreshold: 0.80 });
  assertEquals(manager.getSpeculationThreshold(), 0.80);
});
