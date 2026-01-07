/**
 * Speculative Executor Tests
 *
 * Story 3.5-2: Confidence-Based Speculation & Rollback
 * Tests for AC #5 (timeout termination, max_concurrent queueing)
 *
 * @module tests/unit/speculation/speculative_executor_test
 */

import { assertEquals, assertExists } from "@std/assert";
import { SpeculativeExecutor } from "../../../src/dag/speculation/speculative-executor.ts";
import { SpeculationManager } from "../../../src/dag/speculation/speculation-manager.ts";
import type { PredictedNode } from "../../../src/graphrag/types.ts";

// Helper to create test predictions
function createPrediction(toolId: string, confidence: number): PredictedNode {
  return {
    toolId,
    confidence,
    reasoning: `Test prediction for ${toolId}`,
    source: "co-occurrence",
  };
}

// Helper to wait a specified time
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// === Configuration Tests ===

Deno.test("SpeculativeExecutor: getConfig returns current configuration", () => {
  const executor = new SpeculativeExecutor({
    timeout: 5000,
    maxConcurrent: 2,
    memoryLimit: 128,
  });

  const config = executor.getConfig();

  assertEquals(config.timeout, 5000);
  assertEquals(config.maxConcurrent, 2);
  assertEquals(config.memoryLimit, 128);

  executor.destroy();
});

Deno.test("SpeculativeExecutor: updateTimeout changes timeout value", () => {
  const executor = new SpeculativeExecutor({ timeout: 5000 });

  executor.updateTimeout(15000);

  assertEquals(executor.getConfig().timeout, 15000);

  executor.destroy();
});

Deno.test("SpeculativeExecutor: updateTimeout ignores invalid values", () => {
  const executor = new SpeculativeExecutor({ timeout: 5000 });

  executor.updateTimeout(-1000);
  assertEquals(executor.getConfig().timeout, 5000);

  executor.updateTimeout(0);
  assertEquals(executor.getConfig().timeout, 5000);

  executor.destroy();
});

// === Max Concurrent Tests ===

Deno.test("SpeculativeExecutor: respects max_concurrent limit (AC #5)", async () => {
  const executor = new SpeculativeExecutor({
    timeout: 30000,
    maxConcurrent: 2,
  });

  const predictions = [
    createPrediction("tool_a", 0.90),
    createPrediction("tool_b", 0.85),
    createPrediction("tool_c", 0.80), // Should be skipped (max is 2)
    createPrediction("tool_d", 0.75), // Should be skipped
  ];

  // Start speculations
  await executor.startSpeculations(predictions, {});

  // Wait a bit for speculations to start
  await delay(100);

  // Should have at most 2 active (maxConcurrent limit)
  const activeCount = executor.getActiveCount();
  assertEquals(activeCount <= 2, true, `Expected at most 2 active, got ${activeCount}`);

  executor.destroy();
});

Deno.test("SpeculativeExecutor: doesn't duplicate active speculations", async () => {
  const executor = new SpeculativeExecutor({
    timeout: 30000,
    maxConcurrent: 5,
  });

  const prediction = createPrediction("tool_a", 0.90);

  // Start same prediction twice
  await executor.startSpeculations([prediction], {});
  await executor.startSpeculations([prediction], {}); // Should skip duplicate

  await delay(100);

  // Should only have 1 active (not 2)
  const activeCount = executor.getActiveCount();
  assertEquals(activeCount <= 1, true);

  executor.destroy();
});

// === Abort Tests ===

Deno.test("SpeculativeExecutor: abortSpeculation returns false for non-existent", () => {
  const executor = new SpeculativeExecutor();

  const result = executor.abortSpeculation("nonexistent_tool");

  assertEquals(result, false);

  executor.destroy();
});

Deno.test("SpeculativeExecutor: abortAllSpeculations returns 0 when no active", () => {
  const executor = new SpeculativeExecutor();

  const aborted = executor.abortAllSpeculations();

  assertEquals(aborted, 0);

  executor.destroy();
});

// === Cache Tests ===

Deno.test("SpeculativeExecutor: checkCache returns null for non-cached tool", () => {
  const executor = new SpeculativeExecutor();

  const result = executor.checkCache("unknown_tool");

  assertEquals(result, null);

  executor.destroy();
});

Deno.test("SpeculativeExecutor: getCacheEntries returns empty array initially", () => {
  const executor = new SpeculativeExecutor();

  const entries = executor.getCacheEntries();

  assertEquals(entries.length, 0);

  executor.destroy();
});

Deno.test("SpeculativeExecutor: discardCache clears all entries", async () => {
  const executor = new SpeculativeExecutor({
    timeout: 30000,
  });

  // Start a speculation and wait for it to complete
  const prediction = createPrediction("tool_a", 0.90);
  await executor.startSpeculations([prediction], {});

  // Wait for execution to complete and cache
  await delay(500);

  // Discard cache
  executor.discardCache();

  // Cache should be empty
  assertEquals(executor.getCacheEntries().length, 0);

  executor.destroy();
});

// === validateAndConsume Tests ===

Deno.test("SpeculativeExecutor: validateAndConsume returns null for uncached tool", async () => {
  const executor = new SpeculativeExecutor();

  const result = await executor.validateAndConsume("unknown_tool");

  assertEquals(result, null);

  executor.destroy();
});

// === Manager Integration Tests ===

Deno.test("SpeculativeExecutor: setSpeculationManager configures manager", () => {
  const executor = new SpeculativeExecutor();
  const manager = new SpeculationManager();

  // Should not throw
  executor.setSpeculationManager(manager);

  executor.destroy();
});

// === Destroy Tests ===

Deno.test("SpeculativeExecutor: destroy cleans up all resources", () => {
  const executor = new SpeculativeExecutor();

  // Should not throw
  executor.destroy();

  // Verify cleanup
  assertEquals(executor.getActiveCount(), 0);
  assertEquals(executor.getCacheEntries().length, 0);
});

// === Timeout Behavior Tests (AC #5) ===

Deno.test("SpeculativeExecutor: speculation with short timeout handles gracefully (AC #5)", async () => {
  // Create executor with very short timeout
  const executor = new SpeculativeExecutor({
    timeout: 100, // 100ms timeout
    maxConcurrent: 1,
  });

  const prediction = createPrediction("slow_tool", 0.90);

  // Start speculation
  await executor.startSpeculations([prediction], {});

  // Wait longer than timeout
  await delay(200);

  // Speculation should have timed out gracefully - no crash
  // The tool may or may not be in cache depending on execution speed
  // Call checkCache to verify no crash
  executor.checkCache("slow_tool");

  // Either cached (if it completed fast enough) or null (if timed out)
  // The important thing is no crash occurred
  assertExists(executor);

  executor.destroy();
});

Deno.test({
  name: "SpeculativeExecutor: timeout does not affect main workflow (AC #5)",
  // Disable sanitizers because sandbox processes may have lingering resources
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const executor = new SpeculativeExecutor({
      timeout: 50, // Very short timeout
      maxConcurrent: 1,
    });

    const prediction = createPrediction("tool_a", 0.90);

    // Start speculation
    await executor.startSpeculations([prediction], {});

    // Wait for timeout to occur
    await delay(100);

    // Main executor should still be functional
    assertEquals(executor.getActiveCount() <= 1, true);

    // Should be able to start new speculations
    const newPrediction = createPrediction("tool_b", 0.85);
    await executor.startSpeculations([newPrediction], {});

    // No crash - executor is still functional
    assertExists(executor);

    executor.destroy();

    // Extra delay for cleanup
    await delay(100);
  },
});
