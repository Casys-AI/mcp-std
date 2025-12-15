/**
 * KV Singleton Tests
 *
 * Tests for src/server/auth/kv.ts
 * Verifies singleton pattern works correctly.
 *
 * @module tests/unit/server/auth/kv_test
 */

import { assertEquals, assertExists } from "@std/assert";
import { closeKv, getKv } from "../../../../src/server/auth/kv.ts";

Deno.test("getKv - returns same instance on multiple calls", async () => {
  try {
    const kv1 = await getKv();
    const kv2 = await getKv();

    assertExists(kv1, "First KV instance should exist");
    assertExists(kv2, "Second KV instance should exist");

    // Same instance should be returned (singleton)
    assertEquals(kv1, kv2, "Should return same KV instance");
  } finally {
    await closeKv();
  }
});

Deno.test("closeKv - allows reopening", async () => {
  try {
    const kv1 = await getKv();
    assertExists(kv1);

    await closeKv();

    const kv2 = await getKv();
    assertExists(kv2, "Should be able to get new KV after close");
  } finally {
    await closeKv();
  }
});

Deno.test("getKv - can perform basic operations", async () => {
  try {
    const kv = await getKv();

    // Test set/get
    await kv.set(["test", "kv_singleton_test"], "test_value");
    const result = await kv.get<string>(["test", "kv_singleton_test"]);

    assertEquals(result.value, "test_value");

    // Cleanup
    await kv.delete(["test", "kv_singleton_test"]);
  } finally {
    await closeKv();
  }
});
