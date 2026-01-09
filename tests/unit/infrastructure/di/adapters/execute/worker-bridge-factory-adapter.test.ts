/**
 * WorkerBridgeFactoryAdapter Unit Tests
 *
 * Tests for SimpleDAGExecutor's argument resolution logic:
 * - Literal bindings (string, number, boolean, null, object, array)
 * - Reference resolution with task_ prefix mapping
 * - Template literal interpolation
 * - Parameter resolution
 * - Legacy $OUTPUT format backward compatibility
 * - Nested property access with array indexing
 *
 * Phase 3.2: Post-refactoring test consolidation
 *
 * @module tests/unit/infrastructure/di/adapters/execute/worker-bridge-factory-adapter
 */

import { assertEquals, assertExists } from "@std/assert";

// =============================================================================
// Test Utilities - Inline SimpleDAGExecutor Logic for Unit Testing
// =============================================================================

/**
 * Resolve arguments from staticArguments and legacy formats
 *
 * This mirrors the logic in SimpleDAGExecutor.resolveStaticArguments()
 */
function resolveStaticArguments(
  args: Record<string, unknown>,
  staticArgs: Record<string, { type: string; value?: unknown; expression?: string; parameterName?: string }> | undefined,
  previousResults: Map<string, { status: string; output?: unknown }>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  // 1. Resolve from staticArguments (Story 10.5 structured format)
  if (staticArgs) {
    for (const [key, argValue] of Object.entries(staticArgs)) {
      if (argValue.type === "literal") {
        // Literal: value known at static analysis time
        resolved[key] = argValue.value;
      } else if (argValue.type === "reference" && argValue.expression) {
        // Reference: resolve from previous task result
        const resolvedValue = resolveStructuredReference(
          argValue.expression,
          previousResults,
        );
        if (resolvedValue !== undefined) {
          resolved[key] = resolvedValue;
        }
      } else if (argValue.type === "parameter") {
        // Parameter: should have been resolved statically, skip if not in args
        // (parameters are resolved before execution in resolveDAGArguments)
      }
    }
  }

  // 2. Resolve from args (legacy $OUTPUT format + literals)
  for (const [key, value] of Object.entries(args)) {
    // Skip if already resolved from staticArgs
    if (key in resolved) continue;

    if (typeof value === "string" && value.startsWith("$OUTPUT[")) {
      // DEPRECATED: $OUTPUT[task_id] format (kept for backward compatibility)
      const match = value.match(/^\$OUTPUT\[([^\]]+)\](\.(.+))?$/);

      if (match) {
        const taskId = match[1];
        const propertyPath = match[3];
        const result = previousResults.get(taskId);

        if (!result || result.status === "error") {
          continue;
        }

        if (propertyPath) {
          resolved[key] = getNestedProperty(result.output, propertyPath);
        } else {
          resolved[key] = result.output;
        }
      } else {
        resolved[key] = value;
      }
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      // Recursively resolve nested objects
      resolved[key] = resolveStaticArguments(
        value as Record<string, unknown>,
        undefined,
        previousResults,
      );
    } else {
      resolved[key] = value;
    }
  }

  return resolved;
}

/**
 * Resolve a structured reference expression (Story 10.5)
 *
 * Expression format: "nodeId.property.path" or "nodeId[0].property"
 * Task ID mapping: nodeId → "task_nodeId" (prefix added by staticStructureToDag)
 */
function resolveStructuredReference(
  expression: string,
  previousResults: Map<string, { status: string; output?: unknown }>,
): unknown {
  // Handle template literals: `${n1.path}/suffix`
  if (expression.startsWith("`") && expression.endsWith("`")) {
    return resolveTemplateLiteral(expression, previousResults);
  }

  // Parse expression: "n1.content.nested" or "n1[0].value"
  const firstDot = expression.indexOf(".");
  const firstBracket = expression.indexOf("[");

  let nodeId: string;
  let propertyPath: string | undefined;

  if (firstDot === -1 && firstBracket === -1) {
    // Just node ID, no property path: "n1"
    nodeId = expression;
  } else if (firstBracket !== -1 && (firstDot === -1 || firstBracket < firstDot)) {
    // Array access first: "n1[0].value"
    nodeId = expression.substring(0, firstBracket);
    propertyPath = expression.substring(firstBracket);
  } else {
    // Property access first: "n1.content"
    nodeId = expression.substring(0, firstDot);
    propertyPath = expression.substring(firstDot + 1);
  }

  // Map node ID to task ID (staticStructureToDag uses "task_" prefix)
  const taskId = `task_${nodeId}`;
  const result = previousResults.get(taskId);

  if (!result || result.status === "error") {
    return undefined;
  }

  if (!propertyPath) {
    return result.output;
  }

  return getNestedPropertyWithArrays(result.output, propertyPath);
}

/**
 * Resolve template literal expressions like `${n1.path}/suffix`
 */
function resolveTemplateLiteral(
  expression: string,
  previousResults: Map<string, { status: string; output?: unknown }>,
): string {
  const inner = expression.slice(1, -1);
  return inner.replace(/\$\{([^}]+)\}/g, (_match, expr: string) => {
    const resolved = resolveStructuredReference(expr.trim(), previousResults);
    return resolved !== undefined ? String(resolved) : "";
  });
}

/**
 * Get nested property supporting both dot notation and array access
 */
function getNestedPropertyWithArrays(obj: unknown, path: string): unknown {
  const segments = path.split(/\.|(?=\[)/).filter((s) => s !== "");
  let current: unknown = obj;

  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }

    // Handle array access [0], [1], etc.
    if (segment.startsWith("[") && segment.endsWith("]")) {
      const indexStr = segment.slice(1, -1);
      const index = parseInt(indexStr, 10);
      if (isNaN(index) || !Array.isArray(current)) {
        return undefined;
      }
      current = current[index];
    } else {
      if (typeof current !== "object") {
        return undefined;
      }
      current = (current as Record<string, unknown>)[segment];
    }
  }

  return current;
}

/**
 * Get nested property from object using dot notation
 */
function getNestedProperty(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

// =============================================================================
// Literal Bindings Tests
// =============================================================================

Deno.test({
  name: "resolveStaticArguments - resolves string literals",
  fn() {
    const staticArgs = {
      path: { type: "literal", value: "/tmp/config.json" },
      mode: { type: "literal", value: "read" },
    };

    const resolved = resolveStaticArguments({}, staticArgs, new Map());

    assertEquals(resolved.path, "/tmp/config.json");
    assertEquals(resolved.mode, "read");
  },
});

Deno.test({
  name: "resolveStaticArguments - resolves number literals",
  fn() {
    const staticArgs = {
      timeout: { type: "literal", value: 5000 },
      retries: { type: "literal", value: 3 },
      ratio: { type: "literal", value: 0.85 },
    };

    const resolved = resolveStaticArguments({}, staticArgs, new Map());

    assertEquals(resolved.timeout, 5000);
    assertEquals(resolved.retries, 3);
    assertEquals(resolved.ratio, 0.85);
  },
});

Deno.test({
  name: "resolveStaticArguments - resolves boolean literals",
  fn() {
    const staticArgs = {
      verbose: { type: "literal", value: true },
      dryRun: { type: "literal", value: false },
    };

    const resolved = resolveStaticArguments({}, staticArgs, new Map());

    assertEquals(resolved.verbose, true);
    assertEquals(resolved.dryRun, false);
  },
});

Deno.test({
  name: "resolveStaticArguments - resolves null literal",
  fn() {
    const staticArgs = {
      defaultValue: { type: "literal", value: null },
    };

    const resolved = resolveStaticArguments({}, staticArgs, new Map());

    assertEquals(resolved.defaultValue, null);
  },
});

Deno.test({
  name: "resolveStaticArguments - resolves object literals",
  fn() {
    const staticArgs = {
      config: {
        type: "literal",
        value: { host: "localhost", port: 5432, ssl: true },
      },
    };

    const resolved = resolveStaticArguments({}, staticArgs, new Map());

    assertExists(resolved.config);
    const config = resolved.config as Record<string, unknown>;
    assertEquals(config.host, "localhost");
    assertEquals(config.port, 5432);
    assertEquals(config.ssl, true);
  },
});

Deno.test({
  name: "resolveStaticArguments - resolves array literals",
  fn() {
    const staticArgs = {
      ids: { type: "literal", value: [1, 2, 3, 4, 5] },
      tags: { type: "literal", value: ["dev", "test", "prod"] },
    };

    const resolved = resolveStaticArguments({}, staticArgs, new Map());

    assertEquals(resolved.ids, [1, 2, 3, 4, 5]);
    assertEquals(resolved.tags, ["dev", "test", "prod"]);
  },
});

// =============================================================================
// Reference Resolution Tests
// =============================================================================

Deno.test({
  name: "resolveStaticArguments - resolves simple reference (n1 → task_n1)",
  fn() {
    const staticArgs = {
      content: { type: "reference", expression: "n1" },
    };

    const previousResults = new Map([
      ["task_n1", { status: "success", output: "file content here" }],
    ]);

    const resolved = resolveStaticArguments({}, staticArgs, previousResults);

    assertEquals(resolved.content, "file content here");
  },
});

Deno.test({
  name: "resolveStaticArguments - resolves property path reference (n1.content)",
  fn() {
    const staticArgs = {
      data: { type: "reference", expression: "n1.content" },
    };

    const previousResults = new Map([
      ["task_n1", { status: "success", output: { content: "nested value", meta: { id: 123 } } }],
    ]);

    const resolved = resolveStaticArguments({}, staticArgs, previousResults);

    assertEquals(resolved.data, "nested value");
  },
});

Deno.test({
  name: "resolveStaticArguments - resolves deep nested reference (n1.data.user.name)",
  fn() {
    const staticArgs = {
      userName: { type: "reference", expression: "n1.data.user.name" },
    };

    const previousResults = new Map([
      ["task_n1", {
        status: "success",
        output: { data: { user: { name: "Alice", email: "alice@example.com" } } },
      }],
    ]);

    const resolved = resolveStaticArguments({}, staticArgs, previousResults);

    assertEquals(resolved.userName, "Alice");
  },
});

Deno.test({
  name: "resolveStaticArguments - resolves array index reference (n1.items[0])",
  fn() {
    const staticArgs = {
      firstItem: { type: "reference", expression: "n1.items[0]" },
      secondItem: { type: "reference", expression: "n1.items[1]" },
    };

    const previousResults = new Map([
      ["task_n1", { status: "success", output: { items: ["first", "second", "third"] } }],
    ]);

    const resolved = resolveStaticArguments({}, staticArgs, previousResults);

    assertEquals(resolved.firstItem, "first");
    assertEquals(resolved.secondItem, "second");
  },
});

Deno.test({
  name: "resolveStaticArguments - resolves array index with property (n1.users[0].name)",
  fn() {
    const staticArgs = {
      firstName: { type: "reference", expression: "n1.users[0].name" },
      secondEmail: { type: "reference", expression: "n1.users[1].email" },
    };

    const previousResults = new Map([
      ["task_n1", {
        status: "success",
        output: {
          users: [
            { name: "Alice", email: "alice@test.com" },
            { name: "Bob", email: "bob@test.com" },
          ],
        },
      }],
    ]);

    const resolved = resolveStaticArguments({}, staticArgs, previousResults);

    assertEquals(resolved.firstName, "Alice");
    assertEquals(resolved.secondEmail, "bob@test.com");
  },
});

Deno.test({
  name: "resolveStaticArguments - returns undefined for missing task",
  fn() {
    const staticArgs = {
      data: { type: "reference", expression: "n99.content" },
    };

    const previousResults = new Map([
      ["task_n1", { status: "success", output: { content: "exists" } }],
    ]);

    const resolved = resolveStaticArguments({}, staticArgs, previousResults);

    assertEquals("data" in resolved, false);
  },
});

Deno.test({
  name: "resolveStaticArguments - returns undefined for failed task reference",
  fn() {
    const staticArgs = {
      data: { type: "reference", expression: "n1.content" },
    };

    const previousResults = new Map([
      ["task_n1", { status: "error", output: undefined }],
    ]);

    const resolved = resolveStaticArguments({}, staticArgs, previousResults);

    assertEquals("data" in resolved, false);
  },
});

// =============================================================================
// Template Literal Tests
// =============================================================================

Deno.test({
  name: "resolveStaticArguments - resolves simple template literal",
  fn() {
    const staticArgs = {
      path: { type: "reference", expression: "`${n1.dir}/output.json`" },
    };

    const previousResults = new Map([
      ["task_n1", { status: "success", output: { dir: "/home/user/data" } }],
    ]);

    const resolved = resolveStaticArguments({}, staticArgs, previousResults);

    assertEquals(resolved.path, "/home/user/data/output.json");
  },
});

Deno.test({
  name: "resolveStaticArguments - resolves template with multiple interpolations",
  fn() {
    const staticArgs = {
      url: { type: "reference", expression: "`${n1.protocol}://${n1.host}:${n1.port}/api`" },
    };

    const previousResults = new Map([
      ["task_n1", { status: "success", output: { protocol: "https", host: "api.example.com", port: 443 } }],
    ]);

    const resolved = resolveStaticArguments({}, staticArgs, previousResults);

    assertEquals(resolved.url, "https://api.example.com:443/api");
  },
});

Deno.test({
  name: "resolveStaticArguments - handles missing interpolation gracefully",
  fn() {
    const staticArgs = {
      path: { type: "reference", expression: "`${n1.dir}/${n2.filename}`" },
    };

    const previousResults = new Map([
      ["task_n1", { status: "success", output: { dir: "/data" } }],
      // n2 is missing
    ]);

    const resolved = resolveStaticArguments({}, staticArgs, previousResults);

    // Missing interpolations become empty strings
    assertEquals(resolved.path, "/data/");
  },
});

// =============================================================================
// Legacy $OUTPUT Format Tests (Backward Compatibility)
// =============================================================================

Deno.test({
  name: "resolveStaticArguments - resolves legacy $OUTPUT[task_id] format",
  fn() {
    const args = {
      content: "$OUTPUT[task_n1]",
    };

    const previousResults = new Map([
      ["task_n1", { status: "success", output: "legacy output value" }],
    ]);

    const resolved = resolveStaticArguments(args, undefined, previousResults);

    assertEquals(resolved.content, "legacy output value");
  },
});

Deno.test({
  name: "resolveStaticArguments - resolves legacy $OUTPUT with property path",
  fn() {
    const args = {
      data: "$OUTPUT[task_n1].data.value",
    };

    const previousResults = new Map([
      ["task_n1", { status: "success", output: { data: { value: 42 } } }],
    ]);

    const resolved = resolveStaticArguments(args, undefined, previousResults);

    assertEquals(resolved.data, 42);
  },
});

Deno.test({
  name: "resolveStaticArguments - legacy format skips missing task",
  fn() {
    const args = {
      valid: "static value",
      invalid: "$OUTPUT[nonexistent]",
    };

    const resolved = resolveStaticArguments(args, undefined, new Map());

    assertEquals(resolved.valid, "static value");
    assertEquals("invalid" in resolved, false);
  },
});

// =============================================================================
// Mixed Arguments Tests
// =============================================================================

Deno.test({
  name: "resolveStaticArguments - resolves mixed literal, reference, and parameter",
  fn() {
    const staticArgs = {
      path: { type: "literal", value: "/config.json" },
      content: { type: "reference", expression: "n1.data" },
      format: { type: "parameter", parameterName: "outputFormat" },
    };

    const previousResults = new Map([
      ["task_n1", { status: "success", output: { data: "file content" } }],
    ]);

    const resolved = resolveStaticArguments({}, staticArgs, previousResults);

    assertEquals(resolved.path, "/config.json");
    assertEquals(resolved.content, "file content");
    // Parameter is skipped (should be resolved before execution)
    assertEquals("format" in resolved, false);
  },
});

Deno.test({
  name: "resolveStaticArguments - staticArgs takes precedence over args",
  fn() {
    const args = {
      path: "from-args",
    };

    const staticArgs = {
      path: { type: "literal", value: "from-staticArgs" },
    };

    const resolved = resolveStaticArguments(args, staticArgs, new Map());

    assertEquals(resolved.path, "from-staticArgs");
  },
});

Deno.test({
  name: "resolveStaticArguments - resolves nested objects in args",
  fn() {
    const args = {
      config: {
        nested: {
          value: "deep",
        },
      },
    };

    const resolved = resolveStaticArguments(args, undefined, new Map());

    assertExists(resolved.config);
    const config = resolved.config as Record<string, unknown>;
    assertExists(config.nested);
    const nested = config.nested as Record<string, unknown>;
    assertEquals(nested.value, "deep");
  },
});

// =============================================================================
// Edge Cases
// =============================================================================

Deno.test({
  name: "resolveStaticArguments - handles empty staticArgs",
  fn() {
    const resolved = resolveStaticArguments({}, {}, new Map());
    assertEquals(resolved, {});
  },
});

Deno.test({
  name: "resolveStaticArguments - handles undefined staticArgs",
  fn() {
    const args = { key: "value" };
    const resolved = resolveStaticArguments(args, undefined, new Map());
    assertEquals(resolved.key, "value");
  },
});

Deno.test({
  name: "resolveStaticArguments - preserves arrays in args",
  fn() {
    const args = {
      items: [1, 2, 3],
    };

    const resolved = resolveStaticArguments(args, undefined, new Map());

    assertEquals(resolved.items, [1, 2, 3]);
  },
});

Deno.test({
  name: "getNestedPropertyWithArrays - handles complex paths",
  fn() {
    const obj = {
      data: {
        users: [
          { profile: { name: "Alice" } },
          { profile: { name: "Bob" } },
        ],
      },
    };

    assertEquals(getNestedPropertyWithArrays(obj, "data.users[0].profile.name"), "Alice");
    assertEquals(getNestedPropertyWithArrays(obj, "data.users[1].profile.name"), "Bob");
  },
});

Deno.test({
  name: "getNestedPropertyWithArrays - returns undefined for invalid path",
  fn() {
    const obj = { data: { value: 42 } };

    assertEquals(getNestedPropertyWithArrays(obj, "data.nonexistent.path"), undefined);
    assertEquals(getNestedPropertyWithArrays(obj, "data[0]"), undefined);
  },
});
