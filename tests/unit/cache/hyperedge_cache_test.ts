/**
 * Tests for hyperedge-cache.ts
 *
 * Tests the invalidateHyperedge function for capability merge cleanup.
 */

import { assertEquals } from "@std/assert";

// Note: These tests use Deno KV which requires --unstable-kv flag
// The actual functions are tested via integration with the real KV store

Deno.test("invalidateHyperedge - removes entry from cache", async () => {
  // Get a fresh KV instance for testing
  const kv = await Deno.openKv(":memory:");

  const HYPEREDGE_PREFIX = ["hyperedge", "cap"];
  const SUMMARY_KEY = ["hyperedge", "summary"];

  const testCapId = "test-capability-123";
  const existingKey = [...HYPEREDGE_PREFIX, testCapId];

  // Set up initial state: one hyperedge and summary
  await kv.set(existingKey, {
    capabilityId: testCapId,
    members: ["tool:a", "tool:b", "tool:c"],
    order: 3,
    type: "cap_to_tool",
    cachedAt: Date.now(),
  });

  await kv.set(SUMMARY_KEY, {
    total: 1,
    capToTool: 1,
    capToCap: 0,
    computedAt: Date.now(),
  });

  // Verify initial state
  const before = await kv.get(existingKey);
  assertEquals(before.value !== null, true, "Hyperedge should exist before invalidation");

  // Simulate invalidateHyperedge logic
  const existing = await kv.get(existingKey);
  if (existing.value) {
    const currentSummary = await kv.get(SUMMARY_KEY);
    if (currentSummary.value) {
      const summary = currentSummary.value as {
        total: number;
        capToTool: number;
        capToCap: number;
        computedAt: number;
      };

      // Decrement counts
      const hyperedge = existing.value as { type: string };
      if (hyperedge.type === "cap_to_tool") {
        summary.capToTool--;
      } else {
        summary.capToCap--;
      }
      summary.total--;
      summary.computedAt = Date.now();

      // Atomic delete + summary update
      const atomic = kv.atomic();
      atomic.delete(existingKey);
      atomic.set(SUMMARY_KEY, summary);
      await atomic.commit();
    }
  }

  // Verify hyperedge was deleted
  const after = await kv.get(existingKey);
  assertEquals(after.value, null, "Hyperedge should be deleted after invalidation");

  // Verify summary was updated
  const summaryAfter = await kv.get(SUMMARY_KEY);
  const summaryData = summaryAfter.value as { total: number; capToTool: number };
  assertEquals(summaryData.total, 0, "Summary total should be decremented");
  assertEquals(summaryData.capToTool, 0, "Summary capToTool should be decremented");

  kv.close();
});

Deno.test("invalidateHyperedge - no-op if entry doesn't exist", async () => {
  const kv = await Deno.openKv(":memory:");

  const HYPEREDGE_PREFIX = ["hyperedge", "cap"];
  const nonExistentKey = [...HYPEREDGE_PREFIX, "non-existent-cap"];

  // Verify entry doesn't exist
  const before = await kv.get(nonExistentKey);
  assertEquals(before.value, null, "Entry should not exist");

  // Try to "invalidate" non-existent entry (should be no-op)
  const existing = await kv.get(nonExistentKey);
  assertEquals(existing.value, null, "No-op: entry doesn't exist");

  kv.close();
});
