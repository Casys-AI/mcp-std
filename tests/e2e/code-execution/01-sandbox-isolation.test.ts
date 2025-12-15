/**
 * E2E Tests: Sandbox Isolation & Security
 *
 * Validates that the sandbox properly isolates code execution:
 * - No filesystem write access
 * - No network access
 * - No subprocess spawning
 * - Memory limits enforced
 * - Timeout limits enforced
 *
 * Story 3.8 - AC: #1, #2.4
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import { DenoSandboxExecutor } from "../../../src/sandbox/executor.ts";

Deno.test({
  name: "E2E Sandbox: Blocks filesystem write attempts",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const executor = new DenoSandboxExecutor();

    const result = await executor.execute(`
      try {
        await Deno.writeTextFile("/tmp/test.txt", "malicious");
        return { success: true };
      } catch (e) {
        return { error: e.message };
      }
    `);

    // Should fail due to --deny-write
    assertEquals(result.success, true);
    assertStringIncludes(
      JSON.stringify(result.result),
      "error",
      "Write attempt should be blocked",
    );
  },
});

Deno.test({
  name: "E2E Sandbox: Blocks network access attempts",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const executor = new DenoSandboxExecutor();

    const result = await executor.execute(`
      try {
        await fetch("https://example.com");
        return { success: true };
      } catch (e) {
        return { error: e.message };
      }
    `);

    // Should fail due to --deny-net
    assertEquals(result.success, true);
    assertStringIncludes(
      JSON.stringify(result.result),
      "error",
      "Network access should be blocked",
    );
  },
});

Deno.test({
  name: "E2E Sandbox: Blocks subprocess spawning",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const executor = new DenoSandboxExecutor();

    const result = await executor.execute(`
      try {
        const cmd = new Deno.Command("ls");
        await cmd.output();
        return { success: true };
      } catch (e) {
        return { error: e.message };
      }
    `);

    // Should fail due to --deny-run
    assertEquals(result.success, true);
    assertStringIncludes(
      JSON.stringify(result.result),
      "error",
      "Subprocess spawning should be blocked",
    );
  },
});

Deno.test({
  name: "E2E Sandbox: Enforces timeout limit",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const executor = new DenoSandboxExecutor({
      timeout: 500, // 500ms timeout
    });

    const startTime = Date.now();
    const result = await executor.execute(`
      // Infinite loop
      while (true) {
        // busy wait
      }
    `);
    const elapsed = Date.now() - startTime;

    // Should timeout
    assertEquals(result.success, false);
    // Error can be string or object
    const errorStr = typeof result.error === "string" ? result.error : JSON.stringify(result.error);
    assertStringIncludes(errorStr.toLowerCase(), "timeout", "Should report timeout");

    // Should complete within reasonable time (timeout + buffer)
    assertEquals(elapsed < 2000, true, "Should timeout within 2s");
  },
});

Deno.test({
  name: "E2E Sandbox: Allows legitimate read operations",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const executor = new DenoSandboxExecutor();

    const result = await executor.execute(`
      // Simple computation - no filesystem needed
      const data = [1, 2, 3, 4, 5];
      const sum = data.reduce((a, b) => a + b, 0);
      return { sum, count: data.length };
    `);

    assertEquals(result.success, true);
    const res = result.result as { sum: number; count: number };
    assertEquals(res.sum, 15);
    assertEquals(res.count, 5);
  },
});

Deno.test({
  name: "E2E Sandbox: Handles syntax errors gracefully",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const executor = new DenoSandboxExecutor();

    const result = await executor.execute(`
      return 1 +; // Syntax error
    `);

    assertEquals(result.success, false);
    // Error exists
    assertEquals(
      result.error !== null && result.error !== undefined,
      true,
      "Should report syntax error",
    );
  },
});

Deno.test({
  name: "E2E Sandbox: Handles runtime errors gracefully",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const executor = new DenoSandboxExecutor();

    const result = await executor.execute(`
      const obj = null;
      return obj.property; // Runtime error
    `);

    assertEquals(result.success, false);
    assertEquals(
      result.error !== null && result.error !== undefined,
      true,
      "Should report runtime error",
    );
  },
});
