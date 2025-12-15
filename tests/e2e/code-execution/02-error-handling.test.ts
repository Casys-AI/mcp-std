/**
 * E2E Tests: Error Handling
 *
 * Validates comprehensive error handling in code execution:
 * - Syntax errors
 * - Runtime errors
 * - Timeout errors
 * - Memory limit errors
 * - Structured error responses
 *
 * Story 3.8 - AC: #2.4
 */

import { assertEquals, assertExists } from "@std/assert";
import { DenoSandboxExecutor } from "../../../src/sandbox/executor.ts";

Deno.test({
  name: "E2E Error: Syntax error returns structured response",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const executor = new DenoSandboxExecutor();

    const result = await executor.execute(`
      const x = {
        a: 1,
        b: // Missing value
      };
      return x;
    `);

    assertEquals(result.success, false);
    assertExists(result.error);
  },
});

Deno.test({
  name: "E2E Error: Undefined variable returns clear message",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const executor = new DenoSandboxExecutor();

    const result = await executor.execute(`
      return undefinedVariable + 1;
    `);

    assertEquals(result.success, false);
    assertExists(result.error, "Should have error for undefined variable");
  },
});

Deno.test({
  name: "E2E Error: Type error with clear message",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const executor = new DenoSandboxExecutor();

    const result = await executor.execute(`
      const num = 42;
      return num.toUpperCase();
    `);

    assertEquals(result.success, false);
    assertExists(result.error, "Should indicate type error");
  },
});

Deno.test({
  name: "E2E Error: Promise rejection handled",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const executor = new DenoSandboxExecutor();

    const result = await executor.execute(`
      await Promise.reject(new Error("Async failure"));
    `);

    assertEquals(result.success, false);
    assertExists(result.error, "Should capture rejection");
  },
});

Deno.test({
  name: "E2E Error: Thrown error captured",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const executor = new DenoSandboxExecutor();

    const result = await executor.execute(`
      throw new Error("Custom error message");
    `);

    assertEquals(result.success, false);
    assertExists(result.error, "Should capture thrown error");
  },
});

Deno.test({
  name: "E2E Error: Stack overflow handled",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const executor = new DenoSandboxExecutor({
      timeout: 5000,
    });

    const result = await executor.execute(`
      function recurse() {
        return recurse();
      }
      return recurse();
    `);

    assertEquals(result.success, false);
    // Should fail with stack overflow or timeout
    assertExists(result.error);
  },
});

Deno.test({
  name: "E2E Error: Invalid JSON return handled",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const executor = new DenoSandboxExecutor();

    const result = await executor.execute(`
      const circular = {};
      circular.self = circular;
      return circular;
    `);

    // Should handle circular reference gracefully
    assertEquals(result.success, false);
    assertExists(result.error);
  },
});

Deno.test({
  name: "E2E Error: Execution metrics still tracked on error",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const executor = new DenoSandboxExecutor();

    const result = await executor.execute(`
      throw new Error("Test error");
    `);

    assertEquals(result.success, false);
    // Metrics should still be available
    assertExists(result.executionTimeMs);
    assertEquals(result.executionTimeMs >= 0, true);
  },
});
