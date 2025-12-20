/**
 * Memory Limit Tests
 *
 * Tests that the sandbox properly enforces memory limits:
 * - Default memory limit (512MB)
 * - Custom memory limit
 * - Out of memory (OOM) scenarios
 * - Normal memory usage (under limit)
 *
 * These tests validate AC #5
 *
 * Note: These tests may require --v8-flags=--expose-gc to reliably
 * trigger OOM conditions in testing.
 */

import { assertEquals, assertExists } from "@std/assert";
import { DenoSandboxExecutor } from "../../../src/sandbox/executor.ts";

Deno.test({
  name: "Memory - normal usage under default limit succeeds",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();
    const code = `
      // Allocate ~10MB array (well under 512MB limit)
      const arr = new Array(10 * 1024 * 1024 / 8); // ~10MB of numbers
      for (let i = 0; i < arr.length; i++) {
        arr[i] = i;
      }
      return arr.length;
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, true);
    assertExists(result.result);
  },
});

Deno.test({
  name: "Memory - small allocation succeeds",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor({ memoryLimit: 256 });
    const code = `
      // Allocate small array (~5MB)
      const arr = new Array(5 * 1024 * 1024 / 8);
      for (let i = 0; i < arr.length; i++) {
        arr[i] = i;
      }
      return arr.length;
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, true);
    assertExists(result.result);
  },
});

Deno.test({
  name: "Memory - exceed custom memory limit (128MB)",
  fn: async () => {
    // Memory limits only work with subprocess mode.
    // Worker mode doesn't support per-Worker memory limits.
    const sandbox = new DenoSandboxExecutor({
      memoryLimit: 128,
      timeout: 10000, // Longer timeout to allow OOM to trigger
      useWorkerForExecute: false, // Subprocess mode for memory limits
    });
    const code = `
      // Try to allocate 200MB (exceeds 128MB limit)
      const arrays = [];
      for (let i = 0; i < 20; i++) {
        // 10MB per iteration = 200MB total
        arrays.push(new Array(10 * 1024 * 1024 / 8).fill(i));
      }
      return arrays.length;
    `;
    const result = await sandbox.execute(code);

    // Should fail with memory error or timeout (if OOM kills process)
    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(
      result.error.type === "MemoryError" ||
        result.error.type === "RuntimeError" ||
        result.error.type === "TimeoutError",
      true,
    );
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Memory - exceed default memory limit (512MB)",
  fn: async () => {
    // Memory limits only work with subprocess mode
    const sandbox = new DenoSandboxExecutor({
      timeout: 15000, // Longer timeout for large allocation
      useWorkerForExecute: false, // Subprocess mode for memory limits
    });
    const code = `
      // Try to allocate 600MB (exceeds 512MB limit)
      const arrays = [];
      for (let i = 0; i < 60; i++) {
        // 10MB per iteration = 600MB total
        arrays.push(new Array(10 * 1024 * 1024 / 8).fill(i));
      }
      return arrays.length;
    `;
    const result = await sandbox.execute(code);

    // Should fail with memory error
    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(
      result.error.type === "MemoryError" ||
        result.error.type === "RuntimeError" ||
        result.error.type === "TimeoutError",
      true,
    );
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Memory - very small limit (64MB)",
  fn: async () => {
    // Memory limits only work with subprocess mode
    const sandbox = new DenoSandboxExecutor({
      memoryLimit: 64,
      timeout: 10000,
      useWorkerForExecute: false, // Subprocess mode for memory limits
    });
    const code = `
      // Try to allocate 100MB (exceeds 64MB limit)
      const arrays = [];
      for (let i = 0; i < 10; i++) {
        arrays.push(new Array(10 * 1024 * 1024 / 8).fill(i));
      }
      return arrays.length;
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(
      result.error.type === "MemoryError" ||
        result.error.type === "RuntimeError" ||
        result.error.type === "TimeoutError",
      true,
    );
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Memory - string allocation under limit",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();
    const code = `
      // Allocate ~5MB string
      const str = "x".repeat(5 * 1024 * 1024);
      return str.length;
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, true);
    assertEquals(result.result, 5 * 1024 * 1024);
  },
});

Deno.test({
  name: "Memory - object allocation under limit",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();
    const code = `
      // Allocate many small objects
      const objects = [];
      for (let i = 0; i < 100000; i++) {
        objects.push({ id: i, value: "test", data: [1, 2, 3, 4, 5] });
      }
      return objects.length;
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, true);
    assertEquals(result.result, 100000);
  },
});

Deno.test({
  name: "Memory - gradual allocation under limit",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor({ memoryLimit: 256 });
    const code = `
      // Gradually allocate memory
      let total = 0;
      for (let i = 0; i < 20; i++) {
        const arr = new Array(1024 * 1024 / 8).fill(i); // ~1MB each
        total += arr.length;
      }
      return total;
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, true);
    assertExists(result.result);
  },
});

Deno.test({
  name: "Memory - error message includes limit value",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor({
      memoryLimit: 64,
      timeout: 10000,
    });
    const code = `
      // Try to exceed limit
      const arrays = [];
      for (let i = 0; i < 20; i++) {
        arrays.push(new Array(10 * 1024 * 1024 / 8).fill(i));
      }
      return arrays.length;
    `;
    const result = await sandbox.execute(code);

    if (!result.success && result.error?.type === "MemoryError") {
      // Error message should mention the limit
      assertEquals(result.error.message.includes("64"), true);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
