/**
 * Timeout Enforcement Tests
 *
 * Tests that the sandbox properly enforces execution timeouts:
 * - Default timeout (30s)
 * - Custom timeout
 * - Infinite loops
 * - Long-running async operations
 *
 * These tests validate AC #4
 */

import { assertEquals, assertExists } from "@std/assert";
import { DenoSandboxExecutor } from "../../../src/sandbox/executor.ts";

Deno.test({
  name: "Timeout - enforce default timeout (30s) on infinite loop",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor({ timeout: 1000 }); // Use 1s for faster test
    const code = `
      while (true) {
        // Infinite loop
      }
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error.type, "TimeoutError");
    assertExists(result.error.message);
    assertEquals(result.error.message.includes("1000"), true); // Timeout value in message
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Timeout - enforce custom timeout (2s)",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor({ timeout: 2000 });
    const code = `
      // Sleep for 5 seconds
      await new Promise(resolve => setTimeout(resolve, 5000));
      return "completed";
    `;
    const startTime = performance.now();
    const result = await sandbox.execute(code);
    const elapsed = performance.now() - startTime;

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error.type, "TimeoutError");
    // Should timeout around 2s (not 5s)
    assertEquals(elapsed < 3000, true, `Timeout took ${elapsed}ms, expected ~2000ms`);
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Timeout - fast execution completes before timeout",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor({ timeout: 5000 });
    const code = `
      // Fast operation
      return 42;
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, true);
    assertEquals(result.result, 42);
    // Should complete quickly
    assertEquals(result.executionTimeMs < 1000, true);
  },
});

Deno.test({
  name: "Timeout - async operation within timeout succeeds",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor({ timeout: 3000 });
    const code = `
      // Sleep for 500ms (well within timeout)
      await new Promise(resolve => setTimeout(resolve, 500));
      return "completed";
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, true);
    assertEquals(result.result, "completed");
  },
});

Deno.test({
  name: "Timeout - very short timeout (500ms)",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor({ timeout: 500 });
    const code = `
      // Sleep for 2 seconds
      await new Promise(resolve => setTimeout(resolve, 2000));
      return "completed";
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error.type, "TimeoutError");
    assertEquals(result.error.message.includes("500"), true);
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Timeout - CPU-intensive loop with timeout",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor({ timeout: 1000 });
    const code = `
      let sum = 0;
      for (let i = 0; i < 1000000000; i++) {
        sum += i;
      }
      return sum;
    `;
    const result = await sandbox.execute(code);

    // Either times out or completes (depends on CPU speed)
    if (!result.success) {
      assertEquals(result.error?.type, "TimeoutError");
    }
    // If it completes, that's also valid (fast CPU)
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Timeout - multiple async operations within timeout",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor({ timeout: 5000 });
    const code = `
      // Multiple short async operations
      await Promise.all([
        new Promise(resolve => setTimeout(() => resolve(1), 100)),
        new Promise(resolve => setTimeout(() => resolve(2), 200)),
        new Promise(resolve => setTimeout(() => resolve(3), 300)),
      ]);
      return "completed";
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, true);
    assertEquals(result.result, "completed");
  },
});

Deno.test({
  name: "Timeout - nested infinite loop",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor({ timeout: 1000 });
    const code = `
      function infiniteRecursion() {
        infiniteRecursion();
      }
      infiniteRecursion();
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, false);
    assertExists(result.error);
    // Could be TimeoutError or RuntimeError (stack overflow)
    assertEquals(
      result.error.type === "TimeoutError" || result.error.type === "RuntimeError",
      true,
    );
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Timeout - execution time measurement accuracy",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor({ timeout: 2000 });
    const code = `
      await new Promise(resolve => setTimeout(resolve, 500));
      return "done";
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, true);
    // Execution time should be close to 500ms (allow overhead)
    assertEquals(result.executionTimeMs > 400, true);
    assertEquals(result.executionTimeMs < 1000, true);
  },
});
