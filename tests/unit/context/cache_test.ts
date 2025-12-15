/**
 * Tests for SchemaCache (LRU Cache)
 *
 * Coverage: AC6 - Cache hit pour frequently used tools
 */

import { assert, assertEquals } from "@std/assert";
import { SchemaCache } from "../../../src/context/cache.ts";
import type { MCPTool } from "../../../src/mcp/types.ts";

// Helper to create mock schemas
function createMockSchema(name: string): MCPTool {
  return {
    name,
    description: `Mock schema for ${name}`,
    inputSchema: { type: "object", properties: {} },
  };
}

Deno.test("SchemaCache - basic get/set operations", () => {
  const cache = new SchemaCache(10);
  const schema = createMockSchema("test-tool");

  // Initially empty
  assertEquals(cache.get("tool-1"), undefined);

  // Set and get
  cache.set("tool-1", schema);
  assertEquals(cache.get("tool-1"), schema);
});

Deno.test("SchemaCache - cache hit tracking", () => {
  const cache = new SchemaCache(10);
  const schema = createMockSchema("test-tool");

  cache.set("tool-1", schema);

  // First access
  cache.get("tool-1");

  // Second access
  cache.get("tool-1");

  // Third access (miss)
  cache.get("tool-2");

  const stats = cache.getStats();
  assertEquals(stats.hits, 2, "Should have 2 cache hits");
  assertEquals(stats.misses, 1, "Should have 1 cache miss");
  assertEquals(stats.hitRate, 2 / 3, "Hit rate should be 66.67%");
});

Deno.test("SchemaCache - LRU eviction when cache is full", () => {
  const cache = new SchemaCache(3); // Small cache

  // Fill cache to capacity
  cache.set("tool-1", createMockSchema("tool-1"));
  cache.set("tool-2", createMockSchema("tool-2"));
  cache.set("tool-3", createMockSchema("tool-3"));

  assertEquals(cache.getStats().size, 3, "Cache should be full");

  // Access tool-1 to make it recently used
  cache.get("tool-1");

  // Add new tool - should evict tool-2 (least recently used, never accessed)
  cache.set("tool-4", createMockSchema("tool-4"));

  assertEquals(cache.getStats().size, 3, "Cache size should remain at max");
  assert(cache.has("tool-1"), "tool-1 should still be cached (recently accessed)");
  assert(cache.has("tool-3"), "tool-3 should still be cached");
  assert(cache.has("tool-4"), "tool-4 should be cached (just added)");
  assertEquals(cache.get("tool-2"), undefined, "tool-2 should be evicted (LRU)");
});

Deno.test("SchemaCache - update existing entry", () => {
  const cache = new SchemaCache(10);

  const schema1 = createMockSchema("version-1");
  const schema2 = createMockSchema("version-2");

  cache.set("tool-1", schema1);
  assertEquals(cache.get("tool-1"), schema1);

  // Update with new schema
  cache.set("tool-1", schema2);
  assertEquals(cache.get("tool-1"), schema2);

  // Size should not increase
  assertEquals(cache.getStats().size, 1);
});

Deno.test("SchemaCache - clear all entries", () => {
  const cache = new SchemaCache(10);

  cache.set("tool-1", createMockSchema("tool-1"));
  cache.set("tool-2", createMockSchema("tool-2"));

  assertEquals(cache.getStats().size, 2);

  cache.clear();

  assertEquals(cache.getStats().size, 0);
  assertEquals(cache.getStats().hits, 0);
  assertEquals(cache.getStats().misses, 0);
});

Deno.test("SchemaCache - has() method", () => {
  const cache = new SchemaCache(10);

  assertEquals(cache.has("tool-1"), false);

  cache.set("tool-1", createMockSchema("tool-1"));

  assertEquals(cache.has("tool-1"), true);
  assertEquals(cache.has("tool-2"), false);
});

Deno.test("SchemaCache - getTopTools() returns most accessed", () => {
  const cache = new SchemaCache(10);

  cache.set("tool-1", createMockSchema("tool-1"));
  cache.set("tool-2", createMockSchema("tool-2"));
  cache.set("tool-3", createMockSchema("tool-3"));

  // Access tools with different frequencies
  cache.get("tool-1"); // 1 hit
  cache.get("tool-2"); // 1 hit
  cache.get("tool-2"); // 2 hits total
  cache.get("tool-3"); // 1 hit
  cache.get("tool-3"); // 2 hits
  cache.get("tool-3"); // 3 hits total

  const topTools = cache.getTopTools(3);

  assertEquals(topTools.length, 3);
  assertEquals(topTools[0].toolId, "tool-3"); // Most accessed
  assertEquals(topTools[0].hits, 4); // 3 gets + 1 from set
  assertEquals(topTools[1].toolId, "tool-2");
  assertEquals(topTools[1].hits, 3);
  assertEquals(topTools[2].toolId, "tool-1");
  assertEquals(topTools[2].hits, 2);
});

Deno.test("SchemaCache - constructor validates maxSize", () => {
  try {
    new SchemaCache(0);
    throw new Error("Should have thrown");
  } catch (error) {
    assertEquals((error as Error).message, "Cache maxSize must be > 0");
  }

  try {
    new SchemaCache(-5);
    throw new Error("Should have thrown");
  } catch (error) {
    assertEquals((error as Error).message, "Cache maxSize must be > 0");
  }
});

Deno.test("SchemaCache - hit rate calculation edge cases", () => {
  const cache = new SchemaCache(10);

  // No accesses yet
  let stats = cache.getStats();
  assertEquals(stats.hitRate, 0, "Hit rate should be 0 with no accesses");

  // Only misses
  cache.get("nonexistent");
  stats = cache.getStats();
  assertEquals(stats.hitRate, 0, "Hit rate should be 0 with only misses");

  // Mix of hits and misses
  cache.set("tool-1", createMockSchema("tool-1"));
  cache.get("tool-1"); // hit
  cache.get("tool-2"); // miss

  stats = cache.getStats();
  // Total: 1 miss (nonexistent) + 1 hit (tool-1) + 1 miss (tool-2) = 3 accesses
  // Hits: 1
  assertEquals(stats.hits, 1);
  assertEquals(stats.misses, 2);
  assertEquals(stats.hitRate, 1 / 3);
});
