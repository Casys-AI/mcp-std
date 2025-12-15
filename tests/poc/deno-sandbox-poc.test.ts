/**
 * POC Test: Deno Sandbox Executor
 *
 * Validates:
 * 1. Basic code execution
 * 2. Permission isolation
 * 3. Timeout enforcement
 * 4. Error handling
 * 5. Async code support
 */

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { DenoSandboxExecutor } from "./deno-sandbox-executor.ts";

Deno.test("POC: Basic code execution - simple return", async () => {
  const executor = new DenoSandboxExecutor();

  const result = await executor.execute(`
    return 1 + 1;
  `);

  console.log("Result:", result);

  assert(result.success, "Execution should succeed");
  assertEquals(result.result, 2, "Should return 2");
  assert(result.executionTimeMs < 1000, "Should complete quickly");
});

Deno.test("POC: Basic code execution - object return", async () => {
  const executor = new DenoSandboxExecutor();

  const result = await executor.execute(`
    return {
      message: "Hello from sandbox",
      timestamp: Date.now(),
      nested: { value: 42 }
    };
  `);

  console.log("Result:", result);

  assert(result.success, "Execution should succeed");
  assert(result.result, "Should have result");
  assertEquals((result.result as any).message, "Hello from sandbox");
  assertEquals((result.result as any).nested.value, 42);
});

Deno.test("POC: Async code execution", async () => {
  const executor = new DenoSandboxExecutor();

  const result = await executor.execute(`
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 100));
    return "async complete";
  `);

  console.log("Result:", result);

  assert(result.success, "Async execution should succeed");
  assertEquals(result.result, "async complete");
});

Deno.test("POC: Permission isolation - filesystem access denied", async () => {
  const executor = new DenoSandboxExecutor();

  const result = await executor.execute(`
    // Attempt to read /etc/passwd (should fail)
    const content = await Deno.readTextFile("/etc/passwd");
    return content;
  `);

  console.log("Result:", result);

  assert(!result.success, "Execution should fail");
  assert(result.error, "Should have error");
  assertEquals(result.error.type, "PermissionError", "Should be PermissionError");
  assertStringIncludes(
    result.error.message.toLowerCase(),
    "permission",
    "Error message should mention permission",
  );
});

Deno.test("POC: Permission isolation - network access denied", async () => {
  const executor = new DenoSandboxExecutor();

  const result = await executor.execute(`
    // Attempt to fetch from network (should fail)
    const response = await fetch("https://example.com");
    return response.status;
  `);

  console.log("Result:", result);

  assert(!result.success, "Execution should fail");
  assert(result.error, "Should have error");
  assertEquals(result.error.type, "PermissionError", "Should be PermissionError");
});

Deno.test("POC: Timeout enforcement", async () => {
  const executor = new DenoSandboxExecutor({
    timeout: 1000, // 1 second timeout
  });

  const result = await executor.execute(`
    // Infinite loop (should timeout)
    while (true) {
      // Wait a bit to avoid tight loop
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return "never reached";
  `);

  console.log("Result:", result);

  assert(!result.success, "Execution should fail due to timeout");
  assert(result.error, "Should have error");
  assertEquals(result.error.type, "TimeoutError", "Should be TimeoutError");
  assertStringIncludes(result.error.message, "timeout", "Error should mention timeout");
  assertStringIncludes(result.error.message, "1000", "Error should mention timeout value");
});

Deno.test("POC: Syntax error handling", async () => {
  const executor = new DenoSandboxExecutor();

  const result = await executor.execute(`
    // Syntax error - missing closing brace
    const obj = {
      value: 42
    // Missing }
    return obj;
  `);

  console.log("Result:", result);

  assert(!result.success, "Execution should fail");
  assert(result.error, "Should have error");
  assertEquals(result.error.type, "SyntaxError", "Should be SyntaxError");
});

Deno.test("POC: Runtime error handling", async () => {
  const executor = new DenoSandboxExecutor();

  const result = await executor.execute(`
    // Runtime error - undefined reference
    const obj = null;
    return obj.property; // Will throw
  `);

  console.log("Result:", result);

  assert(!result.success, "Execution should fail");
  assert(result.error, "Should have error");
  assertEquals(result.error.type, "RuntimeError", "Should be RuntimeError");
  assert(result.error.stack, "Should have stack trace");
});

Deno.test("POC: Allowed read path access", async () => {
  // Create a temp file for testing
  const tempDir = await Deno.makeTempDir();
  const testFile = `${tempDir}/test.txt`;
  await Deno.writeTextFile(testFile, "Hello from file");

  try {
    const executor = new DenoSandboxExecutor({
      allowedReadPaths: [tempDir],
    });

    const result = await executor.execute(`
      const content = await Deno.readTextFile("${testFile}");
      return content;
    `);

    console.log("Result:", result);

    assert(result.success, "Should succeed with allowed path");
    assertEquals(result.result, "Hello from file");
  } finally {
    // Cleanup
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("POC: Performance - startup and execution time", async () => {
  const executor = new DenoSandboxExecutor();

  const startTime = performance.now();

  const result = await executor.execute(`
    return "fast";
  `);

  const totalTime = performance.now() - startTime;

  console.log("Performance metrics:");
  console.log(`  Total time: ${totalTime.toFixed(2)}ms`);
  console.log(`  Execution time: ${result.executionTimeMs.toFixed(2)}ms`);

  assert(result.success, "Execution should succeed");

  // Performance targets from Story 3.1:
  // - Sandbox startup: <100ms
  // - Execution overhead: <50ms
  // - Total for simple code: <150ms
  //
  // Note: First run might be slower due to Deno compilation
  // These are aspirational targets for POC
  console.log(`\n  Target: Total <150ms (aspirational)`);
  console.log(`  Actual: ${totalTime.toFixed(2)}ms`);

  // Don't fail test on performance - just log
  if (totalTime > 150) {
    console.warn("  ⚠️  Performance target not met (expected for POC)");
  } else {
    console.log("  ✅ Performance target met!");
  }
});

Deno.test("POC: Complex computation", async () => {
  const executor = new DenoSandboxExecutor();

  const result = await executor.execute(`
    // Fibonacci calculation
    function fib(n) {
      if (n <= 1) return n;
      return fib(n - 1) + fib(n - 2);
    }

    const result = fib(10);
    return { fibonacci_10: result };
  `);

  console.log("Result:", result);

  assert(result.success, "Execution should succeed");
  assertEquals((result.result as any).fibonacci_10, 55);
});
