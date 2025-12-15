/**
 * Unit tests for Cache Key Generation
 *
 * Tests hash generation, context normalization, and key stability
 */

import { assertEquals, assertNotEquals } from "@std/assert";
import { generateCacheKey } from "../../../src/sandbox/cache.ts";

Deno.test("generateCacheKey - same inputs produce same key", () => {
  const code = "return 1 + 1";
  const context = { a: 1, b: 2 };
  const toolVersions = { github: "v1.0.0" };

  const key1 = generateCacheKey(code, context, toolVersions);
  const key2 = generateCacheKey(code, context, toolVersions);

  assertEquals(key1, key2);
});

Deno.test("generateCacheKey - different code produces different key", () => {
  const context = { a: 1 };
  const toolVersions = { github: "v1.0.0" };

  const key1 = generateCacheKey("return 1 + 1", context, toolVersions);
  const key2 = generateCacheKey("return 2 + 2", context, toolVersions);

  assertNotEquals(key1, key2);
});

Deno.test("generateCacheKey - different context produces different key", () => {
  const code = "return a + b";
  const toolVersions = { github: "v1.0.0" };

  const key1 = generateCacheKey(code, { a: 1, b: 2 }, toolVersions);
  const key2 = generateCacheKey(code, { a: 3, b: 4 }, toolVersions);

  assertNotEquals(key1, key2);
});

Deno.test("generateCacheKey - different tool versions produce different key", () => {
  const code = "return 1 + 1";
  const context = { a: 1 };

  const key1 = generateCacheKey(code, context, { github: "v1.0.0" });
  const key2 = generateCacheKey(code, context, { github: "v2.0.0" });

  assertNotEquals(key1, key2);
});

Deno.test("generateCacheKey - context key order doesn't matter (stable hash)", () => {
  const code = "return a + b + c";
  const toolVersions = { github: "v1.0.0" };

  // Same values, different key order
  const key1 = generateCacheKey(code, { a: 1, b: 2, c: 3 }, toolVersions);
  const key2 = generateCacheKey(code, { c: 3, a: 1, b: 2 }, toolVersions);
  const key3 = generateCacheKey(code, { b: 2, c: 3, a: 1 }, toolVersions);

  // All keys should be identical (order-independent)
  assertEquals(key1, key2);
  assertEquals(key2, key3);
});

Deno.test("generateCacheKey - empty context produces valid key", () => {
  const code = "return 42";
  const toolVersions = { github: "v1.0.0" };

  const key = generateCacheKey(code, {}, toolVersions);

  // Key should be a non-empty string
  assertEquals(typeof key, "string");
  assertEquals(key.length > 0, true);
});

Deno.test("generateCacheKey - empty tool versions produces valid key", () => {
  const code = "return 42";
  const context = { a: 1 };

  const key = generateCacheKey(code, context, {});

  // Key should be a non-empty string
  assertEquals(typeof key, "string");
  assertEquals(key.length > 0, true);
});

Deno.test("generateCacheKey - nested context objects are normalized", () => {
  const code = "return nested.value";
  const toolVersions = { github: "v1.0.0" };

  const key1 = generateCacheKey(
    code,
    { nested: { b: 2, a: 1 } },
    toolVersions,
  );
  const key2 = generateCacheKey(
    code,
    { nested: { a: 1, b: 2 } },
    toolVersions,
  );

  // Nested object keys should also be sorted
  assertEquals(key1, key2);
});

Deno.test("generateCacheKey - complex nested context stability", () => {
  const code = "return data";
  const toolVersions = { github: "v1.0.0" };

  const context1 = {
    users: [{ name: "Alice", age: 30 }],
    config: { nested: { z: 3, y: 2, x: 1 } },
    simple: 42,
  };

  const context2 = {
    simple: 42,
    config: { nested: { x: 1, y: 2, z: 3 } },
    users: [{ name: "Alice", age: 30 }],
  };

  const key1 = generateCacheKey(code, context1, toolVersions);
  const key2 = generateCacheKey(code, context2, toolVersions);

  // Should produce same key despite different ordering
  assertEquals(key1, key2);
});

Deno.test("generateCacheKey - special characters in code", () => {
  const context = { a: 1 };
  const toolVersions = { github: "v1.0.0" };

  const code1 = "return 'hello\\nworld'";
  const code2 = "return 'hello\nworld'";

  const key1 = generateCacheKey(code1, context, toolVersions);
  const key2 = generateCacheKey(code2, context, toolVersions);

  // Different strings should produce different keys
  assertNotEquals(key1, key2);
});

Deno.test("generateCacheKey - context with null and undefined", () => {
  const code = "return x";
  const toolVersions = { github: "v1.0.0" };

  const key1 = generateCacheKey(code, { x: null }, toolVersions);
  const key2 = generateCacheKey(code, { x: undefined }, toolVersions);

  // null and undefined are different values
  assertNotEquals(key1, key2);
});

Deno.test("generateCacheKey - key format (three hashes separated by underscores)", () => {
  const code = "return 1 + 1";
  const context = { a: 1 };
  const toolVersions = { github: "v1.0.0" };

  const key = generateCacheKey(code, context, toolVersions);

  // Key should be in format: hash_hash_hash
  const parts = key.split("_");
  assertEquals(parts.length, 3);

  // Each part should be a hex string
  for (const part of parts) {
    assertEquals(/^[0-9a-f]+$/.test(part), true);
  }
});

Deno.test("generateCacheKey - performance (should be fast)", () => {
  const code = "return " + "x + ".repeat(100) + "42";
  const context = Object.fromEntries(
    Array.from({ length: 50 }, (_, i) => [`key${i}`, i]),
  );
  const toolVersions = Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [`tool${i}`, `v${i}.0.0`]),
  );

  const startTime = performance.now();
  const key = generateCacheKey(code, context, toolVersions);
  const elapsedMs = performance.now() - startTime;

  // Key generation should be fast (<5ms even for complex inputs)
  assertEquals(elapsedMs < 5, true, `Key generation took ${elapsedMs}ms (expected <5ms)`);
  assertEquals(typeof key, "string");
  assertEquals(key.length > 0, true);
});
