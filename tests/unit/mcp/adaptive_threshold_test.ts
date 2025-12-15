/**
 * Unit tests for AdaptiveThresholdManager
 *
 * Tests adaptive threshold learning functionality
 */

import { assert, assertEquals } from "@std/assert";
import { AdaptiveThresholdManager } from "../../../src/mcp/adaptive-threshold.ts";

Deno.test("AdaptiveThresholdManager - initializes with default thresholds", () => {
  const manager = new AdaptiveThresholdManager();

  const thresholds = manager.getThresholds();
  assertEquals(thresholds.explicitThreshold, 0.50);
  assertEquals(thresholds.suggestionThreshold, 0.70);
});

Deno.test("AdaptiveThresholdManager - initializes with custom thresholds", () => {
  const manager = new AdaptiveThresholdManager({
    initialExplicitThreshold: 0.60,
    initialSuggestionThreshold: 0.80,
  });

  const thresholds = manager.getThresholds();
  assertEquals(thresholds.explicitThreshold, 0.60);
  assertEquals(thresholds.suggestionThreshold, 0.80);
});

Deno.test("AdaptiveThresholdManager - records execution history", () => {
  const manager = new AdaptiveThresholdManager();

  manager.recordExecution({
    confidence: 0.75,
    mode: "speculative",
    success: true,
    timestamp: Date.now(),
  });

  const metrics = manager.getMetrics();
  assertEquals(metrics.totalSpeculativeAttempts, 1);
  assertEquals(metrics.successfulExecutions, 1);
  assertEquals(metrics.failedExecutions, 0);
});

Deno.test("AdaptiveThresholdManager - increases threshold after false positives", () => {
  const manager = new AdaptiveThresholdManager({
    initialSuggestionThreshold: 0.70,
    windowSize: 30,
  });

  const initialThresholds = manager.getThresholds();

  // Simulate 20 failed speculative executions (false positives)
  for (let i = 0; i < 20; i++) {
    manager.recordExecution({
      confidence: 0.75,
      mode: "speculative",
      success: false,
      timestamp: Date.now(),
    });
  }

  const adjustedThresholds = manager.getThresholds();

  // Threshold should increase after many false positives
  assert(
    adjustedThresholds.suggestionThreshold! > initialThresholds.suggestionThreshold!,
    "Threshold should increase after false positives",
  );
});

Deno.test("AdaptiveThresholdManager - decreases threshold after false negatives", () => {
  const manager = new AdaptiveThresholdManager({
    initialSuggestionThreshold: 0.70,
    windowSize: 30,
  });

  const initialThresholds = manager.getThresholds();

  // Simulate 20 successful manual confirmations with high confidence (false negatives)
  for (let i = 0; i < 20; i++) {
    manager.recordExecution({
      confidence: 0.68,
      mode: "suggestion",
      success: true,
      userAccepted: true,
      timestamp: Date.now(),
    });
  }

  const adjustedThresholds = manager.getThresholds();

  // Threshold should decrease after many false negatives
  assert(
    adjustedThresholds.suggestionThreshold! < initialThresholds.suggestionThreshold!,
    "Threshold should decrease after false negatives",
  );
});

Deno.test("AdaptiveThresholdManager - respects min and max thresholds", () => {
  const manager = new AdaptiveThresholdManager({
    initialSuggestionThreshold: 0.70,
    minThreshold: 0.40,
    maxThreshold: 0.90,
    windowSize: 30,
  });

  // Simulate extreme false positives
  for (let i = 0; i < 100; i++) {
    manager.recordExecution({
      confidence: 0.75,
      mode: "speculative",
      success: false,
      timestamp: Date.now(),
    });
  }

  const thresholds = manager.getThresholds();
  assert(thresholds.suggestionThreshold! <= 0.90, "Should not exceed max threshold");
});

Deno.test("AdaptiveThresholdManager - calculates accurate metrics", () => {
  const manager = new AdaptiveThresholdManager();

  // Record some executions
  manager.recordExecution({
    confidence: 0.75,
    mode: "speculative",
    success: true,
    executionTime: 50,
    timestamp: Date.now(),
  });

  manager.recordExecution({
    confidence: 0.80,
    mode: "speculative",
    success: false,
    executionTime: 30,
    timestamp: Date.now(),
  });

  const metrics = manager.getMetrics();

  assertEquals(metrics.totalSpeculativeAttempts, 2);
  assertEquals(metrics.successfulExecutions, 1);
  assertEquals(metrics.failedExecutions, 1);
  assertEquals(metrics.avgExecutionTime, 40);
  assertEquals(metrics.avgConfidence, 0.775);
  assert(metrics.savedLatency > 0);
  assert(metrics.wastedComputeCost > 0);
});

Deno.test("AdaptiveThresholdManager - reset clears history", () => {
  const manager = new AdaptiveThresholdManager();

  manager.recordExecution({
    confidence: 0.75,
    mode: "speculative",
    success: true,
    timestamp: Date.now(),
  });

  manager.reset();

  const metrics = manager.getMetrics();
  assertEquals(metrics.totalSpeculativeAttempts, 0);
});
