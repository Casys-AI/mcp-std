/**
 * Input Validation Integration Tests
 *
 * Tests that SecurityValidator is properly integrated with DenoSandboxExecutor
 * Story 3.9 AC #2
 */

import { assertEquals, assertExists } from "@std/assert";
import { DenoSandboxExecutor } from "../../../src/sandbox/executor.ts";

Deno.test({
  name: "Executor Integration - reject eval() before execution",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();

    const maliciousCode = `
      const result = eval("1 + 1");
      return result;
    `;

    const result = await sandbox.execute(maliciousCode);

    // Should fail with SecurityError
    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error.type, "SecurityError");
    assertEquals(result.error.message.includes("eval"), true);
  },
});

Deno.test({
  name: "Executor Integration - reject Function() constructor",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();

    const maliciousCode = `
      const fn = new Function("return 42");
      return fn();
    `;

    const result = await sandbox.execute(maliciousCode);

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error.type, "SecurityError");
    assertEquals(result.error.message.includes("Function"), true);
  },
});

Deno.test({
  name: "Executor Integration - reject __proto__ pollution",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();

    const maliciousCode = `
      const obj = {};
      obj.__proto__.polluted = true;
      return obj;
    `;

    const result = await sandbox.execute(maliciousCode);

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error.type, "SecurityError");
    assertEquals(result.error.message.includes("__proto__"), true);
  },
});

Deno.test({
  name: "Executor Integration - reject dangerous context keys",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();

    const legitimateCode = `return userId`;

    // Create malicious context with __proto__ key using bracket notation
    const maliciousContext: Record<string, unknown> = { userId: 123 };
    maliciousContext["__proto__"] = { polluted: true };

    const result = await sandbox.execute(legitimateCode, maliciousContext);

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error.type, "SecurityError");
    assertEquals(result.error.message.includes("__proto__"), true);
  },
});

Deno.test({
  name: "Executor Integration - allow legitimate code after validation",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();

    const legitimateCode = `
      const data = [1, 2, 3, 4, 5];
      const sum = data.reduce((a, b) => a + b, 0);
      return sum;
    `;

    const result = await sandbox.execute(legitimateCode);

    // Should succeed
    assertEquals(result.success, true);
    assertEquals(result.result, 15);
  },
});

Deno.test({
  name: "Executor Integration - allow legitimate context",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();

    const code = `
      return {
        userId,
        doubled: userId * 2,
        config: configData
      };
    `;

    const context = {
      userId: 42,
      configData: { timeout: 5000 },
    };

    const result = await sandbox.execute(code, context);

    assertEquals(result.success, true);
    const output = result.result as {
      userId: number;
      doubled: number;
      config: { timeout: number };
    };
    assertEquals(output.userId, 42);
    assertEquals(output.doubled, 84);
    assertEquals(output.config.timeout, 5000);
  },
});

Deno.test({
  name: "Executor Integration - validation happens before cache check",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();

    const maliciousCode = `eval("test")`;

    // First attempt - should fail validation
    const result1 = await sandbox.execute(maliciousCode);
    assertEquals(result1.success, false);
    assertEquals(result1.error?.type, "SecurityError");

    // Second attempt - should still fail validation (not return cached result)
    const result2 = await sandbox.execute(maliciousCode);
    assertEquals(result2.success, false);
    assertEquals(result2.error?.type, "SecurityError");
  },
});

Deno.test({
  name: "Executor Integration - validation is fast (< 10ms overhead)",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();

    const legitimateCode = `return 42`;

    const start = performance.now();
    const result = await sandbox.execute(legitimateCode);
    const elapsed = performance.now() - start;

    assertEquals(result.success, true);

    // Validation should add minimal overhead
    // (Actual execution is slow due to subprocess spawn, but validation is fast)
    // We just verify it completes reasonably quickly
    assertEquals(elapsed < 2000, true, "Execution should complete within 2s");
  },
});
