/**
 * Unit tests for timeout utility
 */

import { assert, assertRejects } from "@std/assert";
import { withTimeout } from "../../../src/utils/timeout.ts";
import { TimeoutError } from "../../../src/errors/error-types.ts";

Deno.test("withTimeout - operation completes within timeout", async () => {
  const fastOperation = Promise.resolve("success");

  const result = await withTimeout(fastOperation, 1000, "fast-op");

  assert(result === "success");
});

Deno.test("withTimeout - operation exceeds timeout", async () => {
  const slowOperation = new Promise((resolve) => setTimeout(() => resolve("too late"), 200));

  await assertRejects(
    async () => {
      await withTimeout(slowOperation, 100, "slow-op");
    },
    TimeoutError,
    "timed out after 100ms",
  );

  // Wait for the slow operation's timer to complete to avoid leak warning
  await new Promise((resolve) => setTimeout(resolve, 150));
});

Deno.test("withTimeout - operation throws error before timeout", async () => {
  const failingOperation = Promise.reject(new Error("Operation failed"));

  await assertRejects(
    async () => {
      await withTimeout(failingOperation, 1000, "failing-op");
    },
    Error,
    "Operation failed",
  );
});

Deno.test("withTimeout - timeout error has correct properties", async () => {
  const slowOperation = new Promise((resolve) => setTimeout(resolve, 200));

  try {
    await withTimeout(slowOperation, 100, "test-operation");
    assert(false, "Should have thrown TimeoutError");
  } catch (error) {
    assert(error instanceof TimeoutError);
    assert(error.operation === "test-operation");
    assert(error.timeoutMs === 100);
  }

  // Wait for the slow operation's timer to complete to avoid leak warning
  await new Promise((resolve) => setTimeout(resolve, 150));
});
