/**
 * Simple POC test for Deno Sandbox
 */

import { DenoSandboxExecutor } from "./deno-sandbox-executor.ts";

console.log("=== Testing Deno Sandbox POC ===\n");

// Test 1: Basic execution
console.log("Test 1: Basic execution");
const executor = new DenoSandboxExecutor();
const result1 = await executor.execute(`
  return 1 + 1;
`);
console.log("Result:", result1);
console.log("Success:", result1.success === true && result1.result === 2 ? "✅" : "❌");
console.log();

// Test 2: Async code
console.log("Test 2: Async code");
const result2 = await executor.execute(`
  await new Promise(resolve => setTimeout(resolve, 50));
  return "async done";
`);
console.log("Result:", result2);
console.log("Success:", result2.success === true && result2.result === "async done" ? "✅" : "❌");
console.log();

// Test 3: Permission denied (should fail)
console.log("Test 3: Permission isolation - read /etc/passwd");
const result3 = await executor.execute(`
  const content = await Deno.readTextFile("/etc/passwd");
  return content;
`);
console.log("Result:", result3);
console.log(
  "Success:",
  result3.success === false && result3.error?.type === "PermissionError" ? "✅" : "❌",
);
console.log();

// Test 4: Network access denied
console.log("Test 4: Permission isolation - network");
const result4 = await executor.execute(`
  const response = await fetch("https://example.com");
  return response.status;
`);
console.log("Result:", result4);
console.log(
  "Success:",
  result4.success === false && result4.error?.type === "PermissionError" ? "✅" : "❌",
);
console.log();

console.log("=== All tests completed ===");
