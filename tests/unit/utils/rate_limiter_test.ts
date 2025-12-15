/**
 * Unit tests for rate limiter
 */

import { assert, assertEquals } from "@std/assert";
import { RateLimiter } from "../../../src/utils/rate-limiter.ts";

Deno.test("RateLimiter - allows requests within limit", async () => {
  const limiter = new RateLimiter(5, 1000); // 5 req/sec

  // First 5 requests should succeed
  for (let i = 0; i < 5; i++) {
    const allowed = await limiter.checkLimit("test-server");
    assertEquals(allowed, true, `Request ${i + 1} should be allowed`);
  }
});

Deno.test("RateLimiter - blocks requests exceeding limit", async () => {
  const limiter = new RateLimiter(5, 1000); // 5 req/sec

  // First 5 requests succeed
  for (let i = 0; i < 5; i++) {
    await limiter.checkLimit("test-server");
  }

  // 6th request should fail
  const allowed = await limiter.checkLimit("test-server");
  assertEquals(allowed, false);
});

Deno.test("RateLimiter - allows requests after window expires", async () => {
  const limiter = new RateLimiter(2, 100); // 2 req per 100ms

  // Use up the limit
  await limiter.checkLimit("test-server");
  await limiter.checkLimit("test-server");

  // 3rd request should fail
  assertEquals(await limiter.checkLimit("test-server"), false);

  // Wait for window to expire
  await new Promise((resolve) => setTimeout(resolve, 150));

  // Should allow requests again
  assertEquals(await limiter.checkLimit("test-server"), true);
});

Deno.test("RateLimiter - tracks separate limits per server", async () => {
  const limiter = new RateLimiter(2, 1000);

  // Max out server1
  await limiter.checkLimit("server1");
  await limiter.checkLimit("server1");

  // server1 should be blocked
  assertEquals(await limiter.checkLimit("server1"), false);

  // server2 should still have capacity
  assertEquals(await limiter.checkLimit("server2"), true);
  assertEquals(await limiter.checkLimit("server2"), true);
});

Deno.test("RateLimiter - waitForSlot waits until slot available", async () => {
  const limiter = new RateLimiter(2, 100);

  // Use up the limit
  await limiter.checkLimit("test-server");
  await limiter.checkLimit("test-server");

  const start = performance.now();

  // This should wait for window to expire
  await limiter.waitForSlot("test-server");

  const elapsed = performance.now() - start;

  // Should have waited approximately 100ms
  assert(elapsed >= 90, `Expected wait >= 90ms, got ${elapsed}ms`);
});

Deno.test("RateLimiter - getCurrentCount returns accurate count", async () => {
  const limiter = new RateLimiter(5, 1000);

  assertEquals(limiter.getCurrentCount("test-server"), 0);

  await limiter.checkLimit("test-server");
  assertEquals(limiter.getCurrentCount("test-server"), 1);

  await limiter.checkLimit("test-server");
  assertEquals(limiter.getCurrentCount("test-server"), 2);
});

Deno.test("RateLimiter - clear resets server limits", async () => {
  const limiter = new RateLimiter(2, 1000);

  await limiter.checkLimit("test-server");
  await limiter.checkLimit("test-server");

  // Should be at limit
  assertEquals(await limiter.checkLimit("test-server"), false);

  // Clear and try again
  limiter.clear("test-server");
  assertEquals(await limiter.checkLimit("test-server"), true);
});
