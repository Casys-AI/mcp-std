/**
 * TDD Tests for execute() → Worker Unification (Story 10.5 AC13)
 *
 * These tests verify that execute() works correctly when using WorkerBridge
 * instead of subprocess. They mirror the existing executor_test.ts tests
 * but explicitly test the unified (Worker-based) execution path.
 *
 * @see Story 10.5 AC13: Unification execute() → Worker Only
 */

import { assertEquals, assertExists } from "@std/assert";
import { DenoSandboxExecutor } from "../../../src/sandbox/executor.ts";

// Note: These tests use the internal flag `useWorkerForExecute: true` to test
// the Worker-based execute() path before full migration.

Deno.test({
  name: "execute via Worker - simple arithmetic returns correct result",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor({
      useWorkerForExecute: true, // AC13: Use Worker instead of subprocess
    });
    const result = await sandbox.execute("return 1 + 1");

    assertEquals(result.success, true);
    assertEquals(result.result, 2);
    assertExists(result.executionTimeMs);
    assertEquals(typeof result.executionTimeMs, "number");
  },
});

Deno.test({
  name: "execute via Worker - string concatenation",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor({
      useWorkerForExecute: true,
    });
    const result = await sandbox.execute('return "Hello" + " " + "World"');

    assertEquals(result.success, true);
    assertEquals(result.result, "Hello World");
  },
});

Deno.test({
  name: "execute via Worker - returns object",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor({
      useWorkerForExecute: true,
    });
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
  name: "execute via Worker - returns array",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor({
      useWorkerForExecute: true,
    });
    const result = await sandbox.execute("return [1, 2, 3, 4, 5]");

    assertEquals(result.success, true);
    assertEquals(result.result, [1, 2, 3, 4, 5]);
  },
});

Deno.test({
  name: "execute via Worker - async code with await",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor({
      useWorkerForExecute: true,
    });
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
  name: "execute via Worker - context injection works",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor({
      useWorkerForExecute: true,
    });
    const code = `return x * y;`;
    const result = await sandbox.execute(code, { x: 10, y: 20 });

    assertEquals(result.success, true);
    assertEquals(result.result, 200);
  },
});

Deno.test({
  name: "execute via Worker - function definition",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor({
      useWorkerForExecute: true,
    });
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
  name: "execute via Worker - handles syntax error",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor({
      useWorkerForExecute: true,
    });
    const result = await sandbox.execute("return {{{");

    assertEquals(result.success, false);
    assertExists(result.error);
    // Worker may report different error type, but error should exist
    assertExists(result.error.message);
  },
});

Deno.test({
  name: "execute via Worker - handles runtime error",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor({
      useWorkerForExecute: true,
    });
    const result = await sandbox.execute("return undefinedVariable.foo");

    assertEquals(result.success, false);
    assertExists(result.error);
    assertExists(result.error.message);
  },
});

Deno.test({
  name: "execute via Worker - handles thrown error",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor({
      useWorkerForExecute: true,
    });
    const result = await sandbox.execute('throw new Error("Custom error")');

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error.message, "Custom error");
  },
});

Deno.test({
  name: "execute via Worker - returns null",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor({
      useWorkerForExecute: true,
    });
    const result = await sandbox.execute("return null");

    assertEquals(result.success, true);
    assertEquals(result.result, null);
  },
});

Deno.test({
  name: "execute via Worker - undefined becomes null (JSON serialization)",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor({
      useWorkerForExecute: true,
    });
    const result = await sandbox.execute("return undefined");

    assertEquals(result.success, true);
    assertEquals(result.result, null);
  },
});

Deno.test({
  name: "execute via Worker - boolean values",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor({
      useWorkerForExecute: true,
    });

    const trueResult = await sandbox.execute("return true");
    assertEquals(trueResult.success, true);
    assertEquals(trueResult.result, true);

    const falseResult = await sandbox.execute("return false");
    assertEquals(falseResult.success, true);
    assertEquals(falseResult.result, false);
  },
});

Deno.test({
  name: "execute via Worker - execution time measurement",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor({
      useWorkerForExecute: true,
    });
    const result = await sandbox.execute("return 42");

    assertExists(result.executionTimeMs);
    assertEquals(typeof result.executionTimeMs, "number");
    // Worker should be faster than subprocess (~5ms vs ~50ms)
    assertEquals(result.executionTimeMs < 500, true);
  },
});

Deno.test({
  name: "execute via Worker - REPL-style pure expression auto-return",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor({
      useWorkerForExecute: true,
    });
    // Pure expression without explicit return - should auto-return
    const result = await sandbox.execute("1 + 1");

    assertEquals(result.success, true);
    assertEquals(result.result, 2);
  },
});

Deno.test({
  name: "execute via Worker - permissionSet parameter is accepted (metadata only)",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor({
      useWorkerForExecute: true,
    });
    // permissionSet is now metadata-only (Worker always uses "none")
    // but the API should accept it without error
    const result = await sandbox.execute("return 42", {}, "readonly");

    assertEquals(result.success, true);
    assertEquals(result.result, 42);
  },
});

// Performance comparison test (informational)
Deno.test({
  name: "execute via Worker - performance benchmark (vs subprocess)",
  fn: async () => {
    const workerSandbox = new DenoSandboxExecutor({
      useWorkerForExecute: true,
    });
    const subprocessSandbox = new DenoSandboxExecutor({
      useWorkerForExecute: false,
    });

    // Warmup
    await workerSandbox.execute("return 1");
    await subprocessSandbox.execute("return 1");

    // Benchmark 5 runs each
    const workerTimes: number[] = [];
    const subprocessTimes: number[] = [];

    for (let i = 0; i < 5; i++) {
      const workerResult = await workerSandbox.execute("return 42");
      workerTimes.push(workerResult.executionTimeMs);

      const subprocessResult = await subprocessSandbox.execute("return 42");
      subprocessTimes.push(subprocessResult.executionTimeMs);
    }

    const avgWorker = workerTimes.reduce((a, b) => a + b, 0) / workerTimes.length;
    const avgSubprocess = subprocessTimes.reduce((a, b) => a + b, 0) / subprocessTimes.length;

    console.log(`Worker avg: ${avgWorker.toFixed(2)}ms`);
    console.log(`Subprocess avg: ${avgSubprocess.toFixed(2)}ms`);
    console.log(`Speedup: ${(avgSubprocess / avgWorker).toFixed(2)}x`);

    // Worker should generally be faster, but we don't fail if not
    // (environment variations possible)
    assertExists(avgWorker);
    assertExists(avgSubprocess);
  },
});
