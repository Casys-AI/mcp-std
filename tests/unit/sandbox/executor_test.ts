/**
 * Core Sandbox Executor Tests
 *
 * Tests basic functionality of the DenoSandboxExecutor:
 * - Module instantiation and configuration
 * - Simple code execution
 * - Async code execution
 * - Basic error handling
 * - Result serialization
 */

import { assertEquals, assertExists } from "@std/assert";
import { DenoSandboxExecutor } from "../../../src/sandbox/executor.ts";

Deno.test({
  name: "DenoSandboxExecutor - instantiation with default config",
  fn: () => {
    const sandbox = new DenoSandboxExecutor();
    assertExists(sandbox);
  },
});

Deno.test({
  name: "DenoSandboxExecutor - instantiation with custom config",
  fn: () => {
    const sandbox = new DenoSandboxExecutor({
      timeout: 5000,
      memoryLimit: 256,
      allowedReadPaths: ["/tmp"],
    });
    assertExists(sandbox);
  },
});

Deno.test({
  name: "DenoSandboxExecutor - execute simple arithmetic",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();
    const result = await sandbox.execute("return 1 + 1");

    assertEquals(result.success, true);
    assertEquals(result.result, 2);
    assertExists(result.executionTimeMs);
    assertEquals(typeof result.executionTimeMs, "number");
  },
});

Deno.test({
  name: "DenoSandboxExecutor - execute string concatenation",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();
    const result = await sandbox.execute('return "Hello" + " " + "World"');

    assertEquals(result.success, true);
    assertEquals(result.result, "Hello World");
  },
});

Deno.test({
  name: "DenoSandboxExecutor - execute with return object",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();
    const result = await sandbox.execute(
      'return { foo: "bar", count: 42, nested: { value: true } }',
    );

    assertEquals(result.success, true);
    assertEquals(result.result, {
      foo: "bar",
      count: 42,
      nested: { value: true },
    });
  },
});

Deno.test({
  name: "DenoSandboxExecutor - execute with array return",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();
    const result = await sandbox.execute("return [1, 2, 3, 4, 5]");

    assertEquals(result.success, true);
    assertEquals(result.result, [1, 2, 3, 4, 5]);
  },
});

Deno.test({
  name: "DenoSandboxExecutor - execute async code with await",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();
    const code = `
      const promise = new Promise(resolve => setTimeout(() => resolve(42), 10));
      return await promise;
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, true);
    assertEquals(result.result, 42);
  },
});

Deno.test({
  name: "DenoSandboxExecutor - execute code with variables",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();
    const code = `
      const x = 10;
      const y = 20;
      return x * y;
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, true);
    assertEquals(result.result, 200);
  },
});

Deno.test({
  name: "DenoSandboxExecutor - execute code with function definition",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();
    const code = `
      function factorial(n) {
        if (n <= 1) return 1;
        return n * factorial(n - 1);
      }
      return factorial(5);
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, true);
    assertEquals(result.result, 120);
  },
});

Deno.test({
  name: "DenoSandboxExecutor - handle syntax error",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();
    const result = await sandbox.execute("return {{{"); // Invalid syntax

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error.type, "SyntaxError");
    assertExists(result.error.message);
  },
});

Deno.test({
  name: "DenoSandboxExecutor - handle runtime error",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();
    const result = await sandbox.execute("return undefinedVariable.foo");

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error.type, "RuntimeError");
    assertExists(result.error.message);
  },
});

Deno.test({
  name: "DenoSandboxExecutor - handle thrown error",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();
    const result = await sandbox.execute('throw new Error("Custom error")');

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error.type, "RuntimeError");
    assertEquals(result.error.message, "Custom error");
  },
});

Deno.test({
  name: "DenoSandboxExecutor - return null",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();
    const result = await sandbox.execute("return null");

    assertEquals(result.success, true);
    assertEquals(result.result, null);
  },
});

Deno.test({
  name: "DenoSandboxExecutor - return undefined becomes null (JSON serialization)",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();
    const result = await sandbox.execute("return undefined");

    assertEquals(result.success, true);
    // undefined becomes null in JSON
    assertEquals(result.result, null);
  },
});

Deno.test({
  name: "DenoSandboxExecutor - return boolean values",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();

    const trueResult = await sandbox.execute("return true");
    assertEquals(trueResult.success, true);
    assertEquals(trueResult.result, true);

    const falseResult = await sandbox.execute("return false");
    assertEquals(falseResult.success, true);
    assertEquals(falseResult.result, false);
  },
});

Deno.test({
  name: "DenoSandboxExecutor - execution time measurement",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();
    const result = await sandbox.execute("return 42");

    assertExists(result.executionTimeMs);
    assertEquals(typeof result.executionTimeMs, "number");
    // Should be relatively fast (< 500ms for simple operation)
    assertEquals(result.executionTimeMs < 500, true);
  },
});
