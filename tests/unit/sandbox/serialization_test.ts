/**
 * Result Serialization Tests
 *
 * Tests that the sandbox properly handles result serialization:
 * - JSON-compatible types (primitives, objects, arrays)
 * - Non-serializable types (functions, symbols, undefined)
 * - Edge cases (circular references, large objects)
 * - Type coercion during serialization
 *
 * These tests validate AC #7
 */

import { assertEquals, assertExists } from "@std/assert";
import { DenoSandboxExecutor } from "../../../src/sandbox/executor.ts";

Deno.test({
  name: "Serialization - number types",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();

    // Integer
    let result = await sandbox.execute("return 42");
    assertEquals(result.success, true);
    assertEquals(result.result, 42);

    // Float
    result = await sandbox.execute("return 3.14159");
    assertEquals(result.success, true);
    assertEquals(result.result, 3.14159);

    // Negative
    result = await sandbox.execute("return -100");
    assertEquals(result.success, true);
    assertEquals(result.result, -100);

    // Zero
    result = await sandbox.execute("return 0");
    assertEquals(result.success, true);
    assertEquals(result.result, 0);
  },
});

Deno.test({
  name: "Serialization - string types",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();

    // Simple string
    let result = await sandbox.execute('return "hello"');
    assertEquals(result.success, true);
    assertEquals(result.result, "hello");

    // Empty string
    result = await sandbox.execute('return ""');
    assertEquals(result.success, true);
    assertEquals(result.result, "");

    // String with special characters
    result = await sandbox.execute('return "Hello\\nWorld\\t!"');
    assertEquals(result.success, true);
    assertEquals(result.result, "Hello\nWorld\t!");

    // Unicode string
    result = await sandbox.execute('return "Hello 世界 🌍"');
    assertEquals(result.success, true);
    assertEquals(result.result, "Hello 世界 🌍");
  },
});

Deno.test({
  name: "Serialization - boolean types",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();

    let result = await sandbox.execute("return true");
    assertEquals(result.success, true);
    assertEquals(result.result, true);

    result = await sandbox.execute("return false");
    assertEquals(result.success, true);
    assertEquals(result.result, false);
  },
});

Deno.test({
  name: "Serialization - null and undefined",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();

    // null serializes as null
    let result = await sandbox.execute("return null");
    assertEquals(result.success, true);
    assertEquals(result.result, null);

    // undefined becomes null in JSON
    result = await sandbox.execute("return undefined");
    assertEquals(result.success, true);
    assertEquals(result.result, null);
  },
});

Deno.test({
  name: "Serialization - arrays",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();

    // Simple array
    let result = await sandbox.execute("return [1, 2, 3, 4, 5]");
    assertEquals(result.success, true);
    assertEquals(result.result, [1, 2, 3, 4, 5]);

    // Empty array
    result = await sandbox.execute("return []");
    assertEquals(result.success, true);
    assertEquals(result.result, []);

    // Mixed types
    result = await sandbox.execute('return [1, "two", true, null, { key: "value" }]');
    assertEquals(result.success, true);
    assertEquals(result.result, [1, "two", true, null, { key: "value" }]);

    // Nested arrays
    result = await sandbox.execute("return [[1, 2], [3, 4], [5, 6]]");
    assertEquals(result.success, true);
    assertEquals(result.result, [[1, 2], [3, 4], [5, 6]]);
  },
});

Deno.test({
  name: "Serialization - objects",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();

    // Simple object
    let result = await sandbox.execute('return { name: "Alice", age: 30 }');
    assertEquals(result.success, true);
    assertEquals(result.result, { name: "Alice", age: 30 });

    // Empty object
    result = await sandbox.execute("return {}");
    assertEquals(result.success, true);
    assertEquals(result.result, {});

    // Nested objects
    result = await sandbox.execute(
      'return { user: { name: "Bob", address: { city: "NYC" } } }',
    );
    assertEquals(result.success, true);
    assertEquals(result.result, {
      user: { name: "Bob", address: { city: "NYC" } },
    });
  },
});

Deno.test({
  name: "Serialization - complex nested structures",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();
    const code = `
      return {
        id: 1,
        name: "Test",
        tags: ["tag1", "tag2", "tag3"],
        metadata: {
          created: "2024-01-01",
          author: {
            name: "Alice",
            roles: ["admin", "user"]
          }
        },
        items: [
          { id: 1, value: 100 },
          { id: 2, value: 200 }
        ]
      };
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, true);
    assertExists(result.result);
    const data = result.result as Record<string, unknown>;
    assertEquals(data.id, 1);
    assertEquals(data.name, "Test");
    assertEquals(Array.isArray(data.tags), true);
  },
});

Deno.test({
  name: "Serialization - large array",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();
    const code = `
      const arr = [];
      for (let i = 0; i < 10000; i++) {
        arr.push(i);
      }
      return arr;
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, true);
    assertEquals(Array.isArray(result.result), true);
    assertEquals((result.result as unknown[]).length, 10000);
  },
});

Deno.test({
  name: "Serialization - large object",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();
    const code = `
      const obj = {};
      for (let i = 0; i < 1000; i++) {
        obj["key" + i] = { value: i, data: "test" };
      }
      return obj;
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, true);
    assertExists(result.result);
    const obj = result.result as Record<string, unknown>;
    assertEquals(Object.keys(obj).length, 1000);
  },
});

Deno.test({
  name: "Serialization - functions are not serializable (should be omitted)",
  fn: async () => {
    // JSON serialization behavior (subprocess mode)
    // Worker uses structured clone which throws on functions
    const sandbox = new DenoSandboxExecutor({ useWorkerForExecute: false });
    const code = `
      return {
        name: "test",
        func: function() { return 42; },
        value: 100
      };
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, true);
    const obj = result.result as Record<string, unknown>;
    assertEquals(obj.name, "test");
    assertEquals(obj.value, 100);
    // Function should be omitted in JSON serialization
    assertEquals(obj.func, undefined);
  },
});

Deno.test({
  name: "Serialization - symbols are not serializable (should be omitted)",
  fn: async () => {
    const sandbox = new DenoSandboxExecutor();
    const code = `
      const sym = Symbol("test");
      return {
        name: "test",
        [sym]: "symbol value",
        value: 100
      };
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, true);
    const obj = result.result as Record<string, unknown>;
    assertEquals(obj.name, "test");
    assertEquals(obj.value, 100);
    // Symbol key should be omitted
    assertEquals(Object.keys(obj).length, 2); // Only 'name' and 'value'
  },
});

Deno.test({
  name: "Serialization - Date objects become ISO strings",
  fn: async () => {
    // JSON serialization behavior (subprocess mode)
    // Worker uses structured clone which preserves Date objects
    const sandbox = new DenoSandboxExecutor({ useWorkerForExecute: false });
    const code = `
      return {
        date: new Date("2024-01-01T00:00:00.000Z")
      };
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, true);
    const obj = result.result as Record<string, unknown>;
    // Date becomes ISO string in JSON
    assertEquals(obj.date, "2024-01-01T00:00:00.000Z");
  },
});

Deno.test({
  name: "Serialization - RegExp becomes empty object",
  fn: async () => {
    // JSON serialization behavior (subprocess mode)
    const sandbox = new DenoSandboxExecutor({ useWorkerForExecute: false });
    const code = `
      return {
        pattern: /test/gi,
        value: "test"
      };
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, true);
    const obj = result.result as Record<string, unknown>;
    // RegExp becomes {} in JSON
    assertEquals(obj.pattern, {});
    assertEquals(obj.value, "test");
  },
});

Deno.test({
  name: "Serialization - NaN and Infinity become null",
  fn: async () => {
    // JSON serialization behavior (subprocess mode)
    const sandbox = new DenoSandboxExecutor({ useWorkerForExecute: false });
    const code = `
      return {
        nan: NaN,
        infinity: Infinity,
        negInfinity: -Infinity,
        normal: 42
      };
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, true);
    const obj = result.result as Record<string, unknown>;
    // NaN and Infinity become null in JSON
    assertEquals(obj.nan, null);
    assertEquals(obj.infinity, null);
    assertEquals(obj.negInfinity, null);
    assertEquals(obj.normal, 42);
  },
});

Deno.test({
  name: "Serialization - array with undefined elements",
  fn: async () => {
    // JSON serialization behavior (subprocess mode)
    const sandbox = new DenoSandboxExecutor({ useWorkerForExecute: false });
    const code = `
      return [1, undefined, 3, null, 5];
    `;
    const result = await sandbox.execute(code);

    assertEquals(result.success, true);
    // undefined becomes null in JSON arrays
    assertEquals(result.result, [1, null, 3, null, 5]);
  },
});

Deno.test({
  name: "Serialization - circular reference should fail gracefully",
  fn: async () => {
    // JSON serialization behavior (subprocess mode)
    // Worker uses structured clone which handles circular refs differently
    const sandbox = new DenoSandboxExecutor({ useWorkerForExecute: false });
    const code = `
      const obj = { name: "test" };
      obj.self = obj; // Circular reference
      return obj;
    `;
    const result = await sandbox.execute(code);

    // Should fail with RuntimeError (JSON.stringify throws on circular refs)
    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error.type, "RuntimeError");
  },
});
