/**
 * Capability Code Generator Tests (Story 7.3b)
 *
 * Tests for CapabilityCodeGenerator:
 * - Code sanitization (blocks dangerous patterns)
 * - Inline function generation with tracing
 * - Capability object building
 * - Depth tracking for cycle detection
 * - Name normalization
 */

import {
  assertEquals,
  assertExists,
  assertMatch,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import { CapabilityCodeGenerator } from "../../../src/capabilities/code-generator.ts";
import type { Capability } from "../../../src/capabilities/types.ts";

/**
 * Create a mock capability for testing
 */
function createMockCapability(overrides: Partial<Capability> = {}): Capability {
  return {
    id: overrides.id || "test-cap-" + crypto.randomUUID().slice(0, 8),
    name: overrides.name || "Test Capability",
    description: overrides.description || "A test capability",
    codeSnippet: overrides.codeSnippet || "return args.value * 2;",
    codeHash: overrides.codeHash || "test-hash",
    intentEmbedding: overrides.intentEmbedding || new Float32Array(1024),
    cacheConfig: overrides.cacheConfig || { ttl_ms: 3600000, cacheable: true },
    usageCount: overrides.usageCount || 1,
    successCount: overrides.successCount || 1,
    successRate: overrides.successRate || 1.0,
    avgDurationMs: overrides.avgDurationMs || 100,
    createdAt: overrides.createdAt || new Date(),
    lastUsed: overrides.lastUsed || new Date(),
    source: overrides.source || "emergent",
  };
}

// =============================================================================
// Unit Tests - Instantiation
// =============================================================================

Deno.test({
  name: "CapabilityCodeGenerator - instantiation",
  fn: () => {
    const generator = new CapabilityCodeGenerator();
    assertExists(generator);
  },
});

// =============================================================================
// Unit Tests - Code Sanitization (AC#10)
// =============================================================================

Deno.test({
  name: "CapabilityCodeGenerator - blocks eval()",
  fn: () => {
    const generator = new CapabilityCodeGenerator();
    const capability = createMockCapability({
      codeSnippet: "eval('malicious code')",
    });

    assertThrows(
      () => generator.generateInlineCode(capability),
      Error,
      "eval",
    );
  },
});

Deno.test({
  name: "CapabilityCodeGenerator - blocks Function constructor",
  fn: () => {
    const generator = new CapabilityCodeGenerator();
    const capability = createMockCapability({
      codeSnippet: "new Function('return this')()",
    });

    assertThrows(
      () => generator.generateInlineCode(capability),
      Error,
      "Function constructor",
    );
  },
});

Deno.test({
  name: "CapabilityCodeGenerator - blocks dynamic import",
  fn: () => {
    const generator = new CapabilityCodeGenerator();
    const capability = createMockCapability({
      codeSnippet: "await import('malicious-module')",
    });

    assertThrows(
      () => generator.generateInlineCode(capability),
      Error,
      "import",
    );
  },
});

Deno.test({
  name: "CapabilityCodeGenerator - blocks static import",
  fn: () => {
    const generator = new CapabilityCodeGenerator();
    const capability = createMockCapability({
      codeSnippet: "import fs from 'fs'",
    });

    assertThrows(
      () => generator.generateInlineCode(capability),
      Error,
      "import",
    );
  },
});

Deno.test({
  name: "CapabilityCodeGenerator - blocks require()",
  fn: () => {
    const generator = new CapabilityCodeGenerator();
    const capability = createMockCapability({
      codeSnippet: "require('child_process')",
    });

    assertThrows(
      () => generator.generateInlineCode(capability),
      Error,
      "require",
    );
  },
});

Deno.test({
  name: "CapabilityCodeGenerator - blocks __proto__",
  fn: () => {
    const generator = new CapabilityCodeGenerator();
    const capability = createMockCapability({
      codeSnippet: "obj.__proto__ = evil",
    });

    assertThrows(
      () => generator.generateInlineCode(capability),
      Error,
      "prototype",
    );
  },
});

Deno.test({
  name: "CapabilityCodeGenerator - blocks Deno namespace",
  fn: () => {
    const generator = new CapabilityCodeGenerator();
    const capability = createMockCapability({
      codeSnippet: "Deno.readFile('/etc/passwd')",
    });

    assertThrows(
      () => generator.generateInlineCode(capability),
      Error,
      "Deno",
    );
  },
});

Deno.test({
  name: "CapabilityCodeGenerator - blocks self reference",
  fn: () => {
    const generator = new CapabilityCodeGenerator();
    const capability = createMockCapability({
      codeSnippet: "self.postMessage('escape')",
    });

    assertThrows(
      () => generator.generateInlineCode(capability),
      Error,
      "self",
    );
  },
});

Deno.test({
  name: "CapabilityCodeGenerator - allows safe code",
  fn: () => {
    const generator = new CapabilityCodeGenerator();
    const capability = createMockCapability({
      codeSnippet: `
        const result = await mcp.filesystem.read_file({ path: args.path });
        return result;
      `,
    });

    // Should not throw
    const code = generator.generateInlineCode(capability);
    assertExists(code);
  },
});

// =============================================================================
// Unit Tests - Inline Function Generation (AC#1)
// =============================================================================

Deno.test({
  name: "CapabilityCodeGenerator - generates async function",
  fn: () => {
    const generator = new CapabilityCodeGenerator();
    const capability = createMockCapability({
      codeSnippet: "return args.value * 2;",
    });

    const code = generator.generateInlineCode(capability);

    // Should start with async arrow function
    assertMatch(code.trim(), /^async \(args\) =>/);
  },
});

Deno.test({
  name: "CapabilityCodeGenerator - includes depth check",
  fn: () => {
    const generator = new CapabilityCodeGenerator();
    const capability = createMockCapability();

    const code = generator.generateInlineCode(capability);

    // Should include depth check
    assertStringIncludes(code, "__capabilityDepth");
    assertStringIncludes(code, ">= 3"); // MAX_DEPTH
    assertStringIncludes(code, "Capability depth exceeded");
  },
});

Deno.test({
  name: "CapabilityCodeGenerator - includes __trace calls (AC#3)",
  fn: () => {
    const generator = new CapabilityCodeGenerator();
    const capability = createMockCapability({
      id: "cap-123",
      name: "test_cap",
    });

    const code = generator.generateInlineCode(capability);

    // Should include trace calls
    assertStringIncludes(code, "__trace(");
    assertStringIncludes(code, '"capability_start"');
    assertStringIncludes(code, '"capability_end"');
    assertStringIncludes(code, "cap-123"); // capability_id
  },
});

Deno.test({
  name: "CapabilityCodeGenerator - includes try/catch for error tracing",
  fn: () => {
    const generator = new CapabilityCodeGenerator();
    const capability = createMockCapability();

    const code = generator.generateInlineCode(capability);

    assertStringIncludes(code, "try {");
    assertStringIncludes(code, "catch (e)");
    assertStringIncludes(code, "throw e");
  },
});

Deno.test({
  name: "CapabilityCodeGenerator - includes finally for depth restoration",
  fn: () => {
    const generator = new CapabilityCodeGenerator();
    const capability = createMockCapability();

    const code = generator.generateInlineCode(capability);

    assertStringIncludes(code, "finally {");
    assertStringIncludes(code, "__capabilityDepth = __depth");
  },
});

// =============================================================================
// Unit Tests - Capabilities Object Building (AC#2)
// =============================================================================

Deno.test({
  name: "CapabilityCodeGenerator - builds empty capabilities object",
  fn: () => {
    const generator = new CapabilityCodeGenerator();

    const code = generator.buildCapabilitiesObject([]);

    assertStringIncludes(code, "let __capabilityDepth = 0;");
    assertStringIncludes(code, "const capabilities = {};");
  },
});

Deno.test({
  name: "CapabilityCodeGenerator - builds single capability object",
  fn: () => {
    const generator = new CapabilityCodeGenerator();
    const capability = createMockCapability({
      name: "doubleValue",
      codeSnippet: "return args.value * 2;",
    });

    const code = generator.buildCapabilitiesObject([capability]);

    assertStringIncludes(code, "let __capabilityDepth = 0;");
    assertStringIncludes(code, "const capabilities = {");
    assertStringIncludes(code, "doubleValue:");
    assertStringIncludes(code, "async (args) =>");
  },
});

Deno.test({
  name: "CapabilityCodeGenerator - builds multiple capabilities object",
  fn: () => {
    const generator = new CapabilityCodeGenerator();
    const cap1 = createMockCapability({
      id: "cap-1",
      name: "capOne",
      codeSnippet: "return 1;",
    });
    const cap2 = createMockCapability({
      id: "cap-2",
      name: "capTwo",
      codeSnippet: "return 2;",
    });

    const code = generator.buildCapabilitiesObject([cap1, cap2]);

    assertStringIncludes(code, "capOne:");
    assertStringIncludes(code, "capTwo:");
  },
});

// =============================================================================
// Unit Tests - Name Normalization
// =============================================================================

Deno.test({
  name: "CapabilityCodeGenerator - normalizes special characters",
  fn: () => {
    const generator = new CapabilityCodeGenerator();
    const capability = createMockCapability({
      name: "run-tests (async)",
      codeSnippet: "return true;",
    });

    const code = generator.buildCapabilitiesObject([capability]);

    // Should replace special chars with underscores
    assertStringIncludes(code, "run_tests__async_:");
  },
});

Deno.test({
  name: "CapabilityCodeGenerator - handles numeric prefix",
  fn: () => {
    const generator = new CapabilityCodeGenerator();
    const capability = createMockCapability({
      name: "123test",
      codeSnippet: "return true;",
    });

    const code = generator.buildCapabilitiesObject([capability]);

    // Should prefix with underscore if starts with number
    assertStringIncludes(code, "_123test:");
  },
});

Deno.test({
  name: "CapabilityCodeGenerator - handles name collisions",
  fn: () => {
    const generator = new CapabilityCodeGenerator();
    const cap1 = createMockCapability({
      id: "id-aaaa",
      name: "test",
      codeSnippet: "return 1;",
    });
    const cap2 = createMockCapability({
      id: "id-bbbb",
      name: "test", // Same name, different ID
      codeSnippet: "return 2;",
    });

    const code = generator.buildCapabilitiesObject([cap1, cap2]);

    // First should be "test", second should have suffix
    assertStringIncludes(code, "test:");
    assertStringIncludes(code, "test_bbbb:"); // Last 4 chars of ID
  },
});

Deno.test({
  name: "CapabilityCodeGenerator - uses ID if no name",
  fn: () => {
    const generator = new CapabilityCodeGenerator();
    const capability = createMockCapability({
      id: "uuid-1234-5678",
      name: "", // Empty name
      codeSnippet: "return true;",
    });

    const code = generator.buildCapabilitiesObject([capability]);

    // Should use part of ID as fallback
    assertMatch(code, /cap_|uuid/);
  },
});

// =============================================================================
// Unit Tests - Reset
// =============================================================================

Deno.test({
  name: "CapabilityCodeGenerator - reset clears used names",
  fn: () => {
    const generator = new CapabilityCodeGenerator();
    const cap = createMockCapability({
      name: "test",
      codeSnippet: "return true;",
    });

    // First build
    generator.buildCapabilitiesObject([cap]);

    // Reset
    generator.reset();

    // Second build - should not have collision handling from first build
    const code2 = generator.buildCapabilitiesObject([cap]);

    // Should just be "test", not "test_xxxx"
    assertStringIncludes(code2, "test:");
  },
});

// =============================================================================
// Integration Tests - Complete Flow
// =============================================================================

Deno.test({
  name: "CapabilityCodeGenerator - generates executable code structure",
  fn: () => {
    const generator = new CapabilityCodeGenerator();
    const capability = createMockCapability({
      id: "cap-deploy",
      name: "deployToProduction",
      codeSnippet: `
        const tests = await mcp.jest.run({});
        if (!tests.success) throw new Error("Tests failed");
        const deploy = await mcp.kubernetes.deploy({ env: "prod" });
        return deploy;
      `,
    });

    const code = generator.buildCapabilitiesObject([capability]);

    // Verify complete structure
    assertStringIncludes(code, "let __capabilityDepth = 0;");
    assertStringIncludes(code, "const capabilities = {");
    assertStringIncludes(code, "deployToProduction:");
    assertStringIncludes(code, "async (args) =>");
    assertStringIncludes(code, "__trace(");
    assertStringIncludes(code, "mcp.jest.run");
    assertStringIncludes(code, "mcp.kubernetes.deploy");
    assertStringIncludes(code, "};"); // Close object
  },
});

Deno.test({
  name: "CapabilityCodeGenerator - generated code is valid JavaScript",
  fn: async () => {
    const generator = new CapabilityCodeGenerator();
    const capability = createMockCapability({
      name: "simpleAdd",
      codeSnippet: "return args.a + args.b;",
    });

    const code = generator.buildCapabilitiesObject([capability]);

    // Create mock __trace function
    const __trace = (_e: unknown) => {};

    // Build complete function with mock dependencies
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const testFn = new AsyncFunction(
      "__trace",
      `
      ${code}
      return capabilities.simpleAdd({ a: 5, b: 3 });
    `,
    );

    // Should execute without syntax errors
    const result = await testFn(__trace);
    assertEquals(result, 8);
  },
});

// =============================================================================
// Story 7.3b Specific Tests
// =============================================================================

Deno.test({
  name: "Story 7.3b - capability context includes depth tracking",
  fn: () => {
    const generator = new CapabilityCodeGenerator();
    const capability = createMockCapability({
      name: "nestedCap",
      codeSnippet: "return await capabilities.innerCap({});",
    });

    const code = generator.buildCapabilitiesObject([capability]);

    // Depth tracking variable should be at module level
    assertMatch(code, /^let __capabilityDepth = 0;/);

    // Each capability should check and increment depth
    assertStringIncludes(code, "const __depth = (__capabilityDepth || 0)");
    assertStringIncludes(code, "__capabilityDepth = __depth + 1");
  },
});

Deno.test({
  name: "Story 7.3b - trace events include capability_id",
  fn: () => {
    const generator = new CapabilityCodeGenerator();
    const capability = createMockCapability({
      id: "unique-cap-id-123",
      name: "tracedCap",
      codeSnippet: "return true;",
    });

    const code = generator.generateInlineCode(capability);

    // Both start and end traces should include capability_id
    assertStringIncludes(code, 'capabilityId: "unique-cap-id-123"');
  },
});
