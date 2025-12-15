/**
 * Unit tests for Cache Invalidation Logic
 *
 * Tests tool version tracking and cache invalidation scenarios
 */

import { assertEquals, assertExists } from "@std/assert";
import { CodeExecutionCache, generateCacheKey } from "../../../src/sandbox/cache.ts";
import { DenoSandboxExecutor } from "../../../src/sandbox/executor.ts";
import type { CacheEntry } from "../../../src/sandbox/cache.ts";
import type { ExecutionResult } from "../../../src/sandbox/types.ts";

/**
 * Helper: Create test cache entry with tool versions
 */
function createCacheEntry(toolVersions: Record<string, string>): CacheEntry {
  const now = Date.now();
  const result: ExecutionResult = {
    success: true,
    result: { value: 42 },
    executionTimeMs: 100,
  };

  return {
    code: "return 1 + 1",
    context: {},
    result,
    toolVersions,
    timestamp: now,
    expiresAt: now + 300000, // 5 minutes
    hitCount: 0,
  };
}

Deno.test("Cache invalidation - invalidate single tool", () => {
  const cache = new CodeExecutionCache({
    enabled: true,
    maxEntries: 100,
    ttlSeconds: 300,
    persistence: false,
  });

  // Add entries with different tool combinations
  cache.set("key1", createCacheEntry({ github: "v1.0.0" }));
  cache.set("key2", createCacheEntry({ slack: "v2.0.0" }));
  cache.set("key3", createCacheEntry({ github: "v1.0.0", slack: "v2.0.0" }));

  // Invalidate github
  const invalidated = cache.invalidate("github");
  assertEquals(invalidated, 2); // key1 and key3

  // Check which entries remain
  assertEquals(cache.get("key1"), null); // Invalidated
  assertExists(cache.get("key2")); // Still exists
  assertEquals(cache.get("key3"), null); // Invalidated
});

Deno.test("Cache invalidation - invalidate nonexistent tool", () => {
  const cache = new CodeExecutionCache({
    enabled: true,
    maxEntries: 100,
    ttlSeconds: 300,
    persistence: false,
  });

  cache.set("key1", createCacheEntry({ github: "v1.0.0" }));
  cache.set("key2", createCacheEntry({ slack: "v2.0.0" }));

  // Invalidate tool that doesn't exist
  const invalidated = cache.invalidate("nonexistent");
  assertEquals(invalidated, 0); // No entries invalidated

  // All entries should still exist
  assertExists(cache.get("key1"));
  assertExists(cache.get("key2"));
});

Deno.test("Cache invalidation - invalidate all entries with specific tool", () => {
  const cache = new CodeExecutionCache({
    enabled: true,
    maxEntries: 100,
    ttlSeconds: 300,
    persistence: false,
  });

  // Add 5 entries, all using github
  for (let i = 1; i <= 5; i++) {
    cache.set(`key${i}`, createCacheEntry({ github: "v1.0.0" }));
  }

  // Invalidate github
  const invalidated = cache.invalidate("github");
  assertEquals(invalidated, 5);

  // All entries should be gone
  for (let i = 1; i <= 5; i++) {
    assertEquals(cache.get(`key${i}`), null);
  }
});

Deno.test("Cache invalidation - multiple invalidations", () => {
  const cache = new CodeExecutionCache({
    enabled: true,
    maxEntries: 100,
    ttlSeconds: 300,
    persistence: false,
  });

  cache.set("key1", createCacheEntry({ github: "v1.0.0" }));
  cache.set("key2", createCacheEntry({ slack: "v2.0.0" }));
  cache.set("key3", createCacheEntry({ notion: "v3.0.0" }));

  // Invalidate multiple tools
  const invalidated1 = cache.invalidate("github");
  const invalidated2 = cache.invalidate("slack");

  assertEquals(invalidated1, 1);
  assertEquals(invalidated2, 1);

  // Only notion entry should remain
  assertEquals(cache.get("key1"), null);
  assertEquals(cache.get("key2"), null);
  assertExists(cache.get("key3"));
});

Deno.test("DenoSandboxExecutor - setToolVersions updates tool tracking", () => {
  const executor = new DenoSandboxExecutor({
    cacheConfig: {
      enabled: true,
      maxEntries: 100,
      ttlSeconds: 300,
      persistence: false,
    },
  });

  // Update tool versions
  const toolVersions = {
    github: "v1.0.0",
    slack: "v2.0.0",
    notion: "v3.0.0",
  };

  executor.setToolVersions(toolVersions);

  // No direct way to verify, but method should not throw
  assertEquals(typeof executor.setToolVersions, "function");
});

Deno.test("DenoSandboxExecutor - invalidateToolCache", () => {
  const executor = new DenoSandboxExecutor({
    cacheConfig: {
      enabled: true,
      maxEntries: 100,
      ttlSeconds: 300,
      persistence: false,
    },
  });

  // Initially, invalidating should return 0 (no cached entries)
  const invalidated = executor.invalidateToolCache("github");
  assertEquals(invalidated, 0);
});

Deno.test("DenoSandboxExecutor - invalidateToolCache when cache disabled", () => {
  const executor = new DenoSandboxExecutor({
    cacheConfig: {
      enabled: false, // Cache disabled
      maxEntries: 100,
      ttlSeconds: 300,
      persistence: false,
    },
  });

  // Should return 0 when cache is disabled
  const invalidated = executor.invalidateToolCache("github");
  assertEquals(invalidated, 0);
});

Deno.test("DenoSandboxExecutor - getCacheStats when cache enabled", () => {
  const executor = new DenoSandboxExecutor({
    cacheConfig: {
      enabled: true,
      maxEntries: 100,
      ttlSeconds: 300,
      persistence: false,
    },
  });

  const stats = executor.getCacheStats();
  assertExists(stats);
  assertEquals(stats.hits, 0);
  assertEquals(stats.misses, 0);
  assertEquals(stats.currentEntries, 0);
});

Deno.test("DenoSandboxExecutor - getCacheStats when cache disabled", () => {
  const executor = new DenoSandboxExecutor({
    cacheConfig: {
      enabled: false,
      maxEntries: 100,
      ttlSeconds: 300,
      persistence: false,
    },
  });

  const stats = executor.getCacheStats();
  assertEquals(stats, null); // No stats when cache is disabled
});

Deno.test("DenoSandboxExecutor - clearCache", () => {
  const executor = new DenoSandboxExecutor({
    cacheConfig: {
      enabled: true,
      maxEntries: 100,
      ttlSeconds: 300,
      persistence: false,
    },
  });

  // Clear should not throw
  executor.clearCache();

  const stats = executor.getCacheStats();
  assertExists(stats);
  assertEquals(stats.currentEntries, 0);
});

Deno.test("Cache invalidation - tool version change scenario", () => {
  const cache = new CodeExecutionCache({
    enabled: true,
    maxEntries: 100,
    ttlSeconds: 300,
    persistence: false,
  });

  const code = "return github.listRepos()";
  const context = {};
  const toolVersionsV1 = { github: "v1.0.0" };
  const toolVersionsV2 = { github: "v2.0.0" };

  // Execute with v1.0.0
  const keyV1 = generateCacheKey(code, context, toolVersionsV1);
  cache.set(keyV1, createCacheEntry(toolVersionsV1));

  // Verify cached
  assertExists(cache.get(keyV1));

  // Tool version changes to v2.0.0 - invalidate old cache
  cache.invalidate("github");

  // Old cache should be gone
  assertEquals(cache.get(keyV1), null);

  // New execution with v2.0.0 creates new cache key
  const keyV2 = generateCacheKey(code, context, toolVersionsV2);
  cache.set(keyV2, createCacheEntry(toolVersionsV2));

  // New cache exists
  assertExists(cache.get(keyV2));

  // Keys should be different (tool version changed)
  assertEquals(keyV1 === keyV2, false);
});
