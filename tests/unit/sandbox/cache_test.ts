/**
 * Unit tests for Code Execution Cache
 *
 * Tests cache operations: get/set, LRU eviction, TTL expiration, invalidation
 */

import { assertEquals, assertExists } from "@std/assert";
import { CodeExecutionCache } from "../../../src/sandbox/cache.ts";
import type { CacheConfig, CacheEntry } from "../../../src/sandbox/cache.ts";
import type { ExecutionResult } from "../../../src/sandbox/types.ts";

/**
 * Helper: Create test execution result
 */
function createTestResult(executionTimeMs = 100): ExecutionResult {
  return {
    success: true,
    result: { value: 42 },
    executionTimeMs,
  };
}

/**
 * Helper: Create test cache entry
 */
function createTestEntry(ttlSeconds = 300): CacheEntry {
  const now = Date.now();
  return {
    code: "return 1 + 1",
    context: {},
    result: createTestResult(),
    toolVersions: {},
    timestamp: now,
    expiresAt: now + (ttlSeconds * 1000),
    hitCount: 0,
  };
}

Deno.test("CodeExecutionCache - basic get/set operations", () => {
  const config: CacheConfig = {
    enabled: true,
    maxEntries: 100,
    ttlSeconds: 300,
    persistence: false,
  };

  const cache = new CodeExecutionCache(config);

  // Initially empty
  assertEquals(cache.get("key1"), null);

  // Set entry
  const entry = createTestEntry();
  cache.set("key1", entry);

  // Get entry (cache hit)
  const retrieved = cache.get("key1");
  assertExists(retrieved);
  assertEquals(retrieved.code, entry.code);
  assertEquals(retrieved.result.result, { value: 42 });
  assertEquals(retrieved.hitCount, 1); // First hit increments counter
});

Deno.test("CodeExecutionCache - cache miss increments misses counter", () => {
  const cache = new CodeExecutionCache({
    enabled: true,
    maxEntries: 100,
    ttlSeconds: 300,
    persistence: false,
  });

  // Cache miss
  assertEquals(cache.get("nonexistent"), null);

  // Check stats
  const stats = cache.getStats();
  assertEquals(stats.hits, 0);
  assertEquals(stats.misses, 1);
  assertEquals(stats.hitRate, 0);
});

Deno.test("CodeExecutionCache - cache hit increments hits counter", () => {
  const cache = new CodeExecutionCache({
    enabled: true,
    maxEntries: 100,
    ttlSeconds: 300,
    persistence: false,
  });

  const entry = createTestEntry();
  cache.set("key1", entry);

  // Cache hit
  cache.get("key1");
  cache.get("key1");

  // Check stats
  const stats = cache.getStats();
  assertEquals(stats.hits, 2);
  assertEquals(stats.misses, 0);
  assertEquals(stats.hitRate, 1.0);
});

Deno.test("CodeExecutionCache - TTL expiration", async () => {
  const cache = new CodeExecutionCache({
    enabled: true,
    maxEntries: 100,
    ttlSeconds: 1, // 1 second TTL
    persistence: false,
  });

  const entry = createTestEntry(1); // Expires in 1 second
  cache.set("key1", entry);

  // Immediate get succeeds
  assertExists(cache.get("key1"));

  // Wait for expiration
  await new Promise((resolve) => setTimeout(resolve, 1100));

  // Entry should be expired and return null
  assertEquals(cache.get("key1"), null);

  // Stats should show a miss
  const stats = cache.getStats();
  assertEquals(stats.hits, 1); // First get before expiration
  assertEquals(stats.misses, 1); // Second get after expiration
  assertEquals(stats.evictions, 1); // Expired entry counts as eviction
});

Deno.test("CodeExecutionCache - LRU eviction when max entries exceeded", () => {
  const cache = new CodeExecutionCache({
    enabled: true,
    maxEntries: 3, // Small cache for testing
    ttlSeconds: 300,
    persistence: false,
  });

  // Add 3 entries (fill cache)
  cache.set("key1", createTestEntry());
  cache.set("key2", createTestEntry());
  cache.set("key3", createTestEntry());

  // All entries should exist
  assertExists(cache.get("key1"));
  assertExists(cache.get("key2"));
  assertExists(cache.get("key3"));

  // Add 4th entry - should evict LRU (key1, since we just accessed key2 and key3)
  cache.set("key4", createTestEntry());

  // key1 should be evicted
  assertEquals(cache.get("key1"), null);

  // Others should still exist
  assertExists(cache.get("key2"));
  assertExists(cache.get("key3"));
  assertExists(cache.get("key4"));

  // Check stats
  const stats = cache.getStats();
  assertEquals(stats.currentEntries, 3); // Max capacity
  assertEquals(stats.evictions, 1); // One LRU eviction
});

Deno.test("CodeExecutionCache - invalidate by tool name", () => {
  const cache = new CodeExecutionCache({
    enabled: true,
    maxEntries: 100,
    ttlSeconds: 300,
    persistence: false,
  });

  // Add entries with different tool versions
  const entry1 = createTestEntry();
  entry1.toolVersions = { github: "v1.0.0" };

  const entry2 = createTestEntry();
  entry2.toolVersions = { slack: "v2.0.0" };

  const entry3 = createTestEntry();
  entry3.toolVersions = { github: "v1.0.0", slack: "v2.0.0" };

  cache.set("key1", entry1);
  cache.set("key2", entry2);
  cache.set("key3", entry3);

  // Invalidate github tool
  const invalidated = cache.invalidate("github");
  assertEquals(invalidated, 2); // key1 and key3 use github

  // key1 and key3 should be gone
  assertEquals(cache.get("key1"), null);
  assertEquals(cache.get("key3"), null);

  // key2 should still exist (uses slack only)
  assertExists(cache.get("key2"));
});

Deno.test("CodeExecutionCache - clear all entries", () => {
  const cache = new CodeExecutionCache({
    enabled: true,
    maxEntries: 100,
    ttlSeconds: 300,
    persistence: false,
  });

  // Add entries
  cache.set("key1", createTestEntry());
  cache.set("key2", createTestEntry());
  cache.set("key3", createTestEntry());

  // Verify entries exist
  assertExists(cache.get("key1"));
  assertExists(cache.get("key2"));
  assertExists(cache.get("key3"));

  // Clear cache
  cache.clear();

  // All entries should be gone
  assertEquals(cache.get("key1"), null);
  assertEquals(cache.get("key2"), null);
  assertEquals(cache.get("key3"), null);

  // Stats should be reset
  const stats = cache.getStats();
  assertEquals(stats.hits, 0);
  assertEquals(stats.misses, 3);
  assertEquals(stats.currentEntries, 0);
});

Deno.test("CodeExecutionCache - disabled cache always returns null", () => {
  const cache = new CodeExecutionCache({
    enabled: false, // Cache disabled
    maxEntries: 100,
    ttlSeconds: 300,
    persistence: false,
  });

  const entry = createTestEntry();
  cache.set("key1", entry);

  // Should always return null when disabled
  assertEquals(cache.get("key1"), null);
});

Deno.test("CodeExecutionCache - hit rate calculation", () => {
  const cache = new CodeExecutionCache({
    enabled: true,
    maxEntries: 100,
    ttlSeconds: 300,
    persistence: false,
  });

  const entry = createTestEntry();
  cache.set("key1", entry);

  // 3 hits, 2 misses = 60% hit rate
  cache.get("key1"); // hit
  cache.get("key1"); // hit
  cache.get("key1"); // hit
  cache.get("key2"); // miss
  cache.get("key3"); // miss

  const stats = cache.getStats();
  assertEquals(stats.hits, 3);
  assertEquals(stats.misses, 2);
  assertEquals(stats.hitRate, 0.6); // 3/(3+2) = 0.6 = 60%
});

Deno.test("CodeExecutionCache - latency saved tracking", () => {
  const cache = new CodeExecutionCache({
    enabled: true,
    maxEntries: 100,
    ttlSeconds: 300,
    persistence: false,
  });

  // Create entry with custom execution time
  const now = Date.now();
  const entry: CacheEntry = {
    code: "return 1 + 1",
    context: {},
    result: createTestResult(2340), // Original execution took 2340ms
    toolVersions: {},
    timestamp: now,
    expiresAt: now + 300000,
    hitCount: 0,
  };
  cache.set("key1", entry);

  // Hit the cache twice
  cache.get("key1");
  cache.get("key1");

  const stats = cache.getStats();
  assertEquals(stats.hits, 2);
  assertEquals(stats.totalSavedMs, 2340 * 2); // 2 hits * 2340ms each
  assertEquals(stats.avgLatencySavedMs, 2340); // Average: 4680 / 2
});

Deno.test("CodeExecutionCache - large dataset stress test (101 entries)", () => {
  const cache = new CodeExecutionCache({
    enabled: true,
    maxEntries: 100,
    ttlSeconds: 300,
    persistence: false,
  });

  // Add 101 entries - should trigger LRU eviction
  for (let i = 1; i <= 101; i++) {
    const entry = createTestEntry();
    cache.set(`key${i}`, entry);
  }

  // First entry should be evicted (LRU)
  assertEquals(cache.get("key1"), null);

  // Last 100 should exist
  for (let i = 2; i <= 101; i++) {
    assertExists(cache.get(`key${i}`), `key${i} should exist`);
  }

  // Stats should show exactly 100 entries
  const stats = cache.getStats();
  assertEquals(stats.currentEntries, 100);
  assertEquals(stats.evictions, 1); // One LRU eviction
});

Deno.test("CodeExecutionCache - rapid sequential access pattern", () => {
  const cache = new CodeExecutionCache({
    enabled: true,
    maxEntries: 100,
    ttlSeconds: 300,
    persistence: false,
  });

  // Simulate rapid sequential access (like a hot loop)
  const entry = createTestEntry();
  cache.set("hotkey", entry);

  // Access 1000 times rapidly
  for (let i = 0; i < 1000; i++) {
    const result = cache.get("hotkey");
    assertExists(result, "Hot key should always be accessible");
  }

  // Stats should show 1000 hits, 0 misses
  const stats = cache.getStats();
  assertEquals(stats.hits, 1000);
  assertEquals(stats.misses, 0);
  assertEquals(stats.hitRate, 1.0); // 100% hit rate
});

Deno.test("CodeExecutionCache - interleaved access pattern (LRU ordering)", () => {
  const cache = new CodeExecutionCache({
    enabled: true,
    maxEntries: 3,
    ttlSeconds: 300,
    persistence: false,
  });

  // Add 3 entries
  cache.set("key1", createTestEntry());
  cache.set("key2", createTestEntry());
  cache.set("key3", createTestEntry());

  // Access in pattern: key1, key2, key1, key2 (key3 becomes LRU)
  cache.get("key1");
  cache.get("key2");
  cache.get("key1");
  cache.get("key2");

  // Add 4th entry - should evict key3 (least recently used)
  cache.set("key4", createTestEntry());

  // Verify key3 was evicted
  assertEquals(cache.get("key3"), null);

  // Others should still exist
  assertExists(cache.get("key1"));
  assertExists(cache.get("key2"));
  assertExists(cache.get("key4"));
});

Deno.test("CodeExecutionCache - large context object stability", () => {
  const cache = new CodeExecutionCache({
    enabled: true,
    maxEntries: 100,
    ttlSeconds: 300,
    persistence: false,
  });

  // Create entry with large nested context
  const now = Date.now();
  const largeContext = {
    data: Array.from({ length: 100 }, (_, i) => ({
      id: i,
      name: `Item ${i}`,
      metadata: {
        created: now,
        tags: ["tag1", "tag2", "tag3"],
        nested: { deep: { value: i * 2 } },
      },
    })),
    config: {
      settings: { a: 1, b: 2, c: 3, d: 4, e: 5 },
      flags: { feature1: true, feature2: false },
    },
  };

  const entry: CacheEntry = {
    code: "return data.length",
    context: largeContext,
    result: createTestResult(),
    toolVersions: {},
    timestamp: now,
    expiresAt: now + 300000,
    hitCount: 0,
  };

  cache.set("large", entry);

  // Retrieve and verify
  const retrieved = cache.get("large");
  assertExists(retrieved);
  assertEquals(retrieved.context, largeContext);
  assertEquals((retrieved.context as any).data.length, 100);
});
