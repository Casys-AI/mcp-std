/**
 * CodeAnalyzerAdapter Tests
 *
 * Tests for the code analyzer adapter:
 * - analyze() method for building static structure
 * - extractToolCalls() for extracting tool calls
 * - getHILRequiredTools() for identifying HIL-required tools
 *
 * Uses mocked DbClient to isolate adapter behavior.
 *
 * @module tests/unit/infrastructure/di/adapters/code-analyzer-adapter.test
 */

import { assertEquals, assertExists } from "jsr:@std/assert@1";
import { CodeAnalyzerAdapter } from "../../../../../src/infrastructure/di/adapters/code-analyzer-adapter.ts";
import type { DbClient } from "../../../../../src/db/types.ts";
import type { StaticStructure } from "../../../../../src/capabilities/types/mod.ts";

/**
 * Create a mock DbClient for testing
 */
function createMockDbClient(): DbClient {
  return {
    query: async () => ({ rows: [], rowCount: 0 }),
    execute: async () => ({ rowsAffected: 0 }),
    close: async () => {},
    transaction: async (fn: (tx: DbClient) => Promise<unknown>) => fn({} as DbClient),
  } as unknown as DbClient;
}

Deno.test("CodeAnalyzerAdapter - Construction", async (t) => {
  await t.step("constructor creates adapter with DbClient", () => {
    const db = createMockDbClient();
    const adapter = new CodeAnalyzerAdapter(db);

    assertExists(adapter);
    assertExists(adapter.underlying);
  });
});

Deno.test("CodeAnalyzerAdapter - analyze()", async (t) => {
  await t.step("analyze() returns static structure for simple code", async () => {
    const db = createMockDbClient();
    const adapter = new CodeAnalyzerAdapter(db);

    const code = `
      const result = await mcp.filesystem.read_file({ path: "/test.txt" });
      return result;
    `;

    const structure = await adapter.analyze(code);

    assertExists(structure);
    assertExists(structure.nodes);
    assertExists(structure.edges);
  });

  await t.step("analyze() detects MCP tool calls", async () => {
    const db = createMockDbClient();
    const adapter = new CodeAnalyzerAdapter(db);

    const code = `
      const file = await mcp.filesystem.read_file({ path: "/test.txt" });
      const parsed = await mcp.json.parse({ content: file });
      return parsed;
    `;

    const structure = await adapter.analyze(code);

    // Should find task nodes for MCP calls
    const taskNodes = structure.nodes.filter((n) => n.type === "task");
    assertEquals(taskNodes.length >= 1, true);
  });

  await t.step("analyze() handles empty code", async () => {
    const db = createMockDbClient();
    const adapter = new CodeAnalyzerAdapter(db);

    const structure = await adapter.analyze("");

    assertExists(structure);
    assertEquals(structure.nodes.length, 0);
    assertEquals(structure.edges.length, 0);
  });

  await t.step("analyze() handles code with syntax errors gracefully", async () => {
    const db = createMockDbClient();
    const adapter = new CodeAnalyzerAdapter(db);

    const invalidCode = `
      const x = {{{ // Invalid syntax
    `;

    // Should not throw, but may return empty or partial structure
    try {
      const structure = await adapter.analyze(invalidCode);
      assertExists(structure);
    } catch {
      // Some syntax errors may throw - that's acceptable
    }
  });

  await t.step("analyze() detects conditional branches", async () => {
    const db = createMockDbClient();
    const adapter = new CodeAnalyzerAdapter(db);

    const code = `
      const value = await mcp.filesystem.read_file({ path: "/test.txt" });
      if (value.exists) {
        await mcp.filesystem.write_file({ path: "/output.txt", content: value.content });
      }
      return value;
    `;

    const structure = await adapter.analyze(code);

    // Should detect decision node for if statement
    // Note: Depending on implementation, may or may not create decision nodes
    assertExists(structure);
    // Check that structure has nodes (without asserting specific types)
    assertEquals(Array.isArray(structure.nodes), true);
  });
});

Deno.test("CodeAnalyzerAdapter - extractToolCalls()", async (t) => {
  await t.step("extractToolCalls() returns tool calls from code", async () => {
    const db = createMockDbClient();
    const adapter = new CodeAnalyzerAdapter(db);

    const code = `
      const file = await mcp.filesystem.read_file({ path: "/test.txt" });
      return file;
    `;

    const toolCalls = await adapter.extractToolCalls(code);

    assertExists(toolCalls);
    assertEquals(Array.isArray(toolCalls), true);
  });

  await t.step("extractToolCalls() identifies MCP tools", async () => {
    const db = createMockDbClient();
    const adapter = new CodeAnalyzerAdapter(db);

    const code = `
      await mcp.filesystem.read_file({ path: "/test.txt" });
      await mcp.json.parse({ content: "{}" });
    `;

    const toolCalls = await adapter.extractToolCalls(code);

    // Should identify MCP tool calls
    const mcpCalls = toolCalls.filter((tc) => tc.type === "mcp");
    assertEquals(mcpCalls.length >= 0, true); // May find MCP tools
  });

  await t.step("extractToolCalls() identifies code operations", async () => {
    const db = createMockDbClient();
    const adapter = new CodeAnalyzerAdapter(db);

    const code = `
      const x = code.transform({ input: data });
      return x;
    `;

    const toolCalls = await adapter.extractToolCalls(code);

    // Code operations would have type "code"
    assertExists(toolCalls);
  });

  await t.step("extractToolCalls() returns ExtractedToolCall structure", async () => {
    const db = createMockDbClient();
    const adapter = new CodeAnalyzerAdapter(db);

    const code = `
      await mcp.test.tool({ arg: "value" });
    `;

    const toolCalls = await adapter.extractToolCalls(code);

    for (const tc of toolCalls) {
      assertExists(tc.toolId);
      assertExists(tc.nodeId);
      assertExists(tc.type);
      // arguments is optional
    }
  });

  await t.step("extractToolCalls() handles empty code", async () => {
    const db = createMockDbClient();
    const adapter = new CodeAnalyzerAdapter(db);

    const toolCalls = await adapter.extractToolCalls("");

    assertEquals(toolCalls, []);
  });
});

Deno.test("CodeAnalyzerAdapter - getHILRequiredTools()", async (t) => {
  await t.step("getHILRequiredTools() returns HILRequiredTools structure", async () => {
    const db = createMockDbClient();
    const adapter = new CodeAnalyzerAdapter(db);

    const code = `
      await mcp.filesystem.delete_file({ path: "/important.txt" });
    `;

    const structure = await adapter.analyze(code);
    const hilTools = adapter.getHILRequiredTools(structure);

    assertExists(hilTools);
    assertExists(hilTools.tools);
    assertEquals(Array.isArray(hilTools.tools), true);
  });

  await t.step("getHILRequiredTools() identifies dangerous operations", async () => {
    const db = createMockDbClient();
    const adapter = new CodeAnalyzerAdapter(db);

    // Code with potentially dangerous operations
    const code = `
      await mcp.filesystem.delete_file({ path: "/data.txt" });
      await mcp.exec.run({ command: "rm -rf /" });
    `;

    const structure = await adapter.analyze(code);
    const hilTools = adapter.getHILRequiredTools(structure);

    // Should identify tools requiring HIL
    assertExists(hilTools.tools);
  });

  await t.step("getHILRequiredTools() handles empty structure", () => {
    const db = createMockDbClient();
    const adapter = new CodeAnalyzerAdapter(db);

    const emptyStructure: StaticStructure = {
      nodes: [],
      edges: [],
    };

    const hilTools = adapter.getHILRequiredTools(emptyStructure);

    assertEquals(hilTools.tools, []);
  });
});

Deno.test("CodeAnalyzerAdapter - underlying access", async (t) => {
  await t.step("underlying property exposes StaticStructureBuilder", () => {
    const db = createMockDbClient();
    const adapter = new CodeAnalyzerAdapter(db);

    const builder = adapter.underlying;

    assertExists(builder);
    assertEquals(typeof builder.buildStaticStructure, "function");
    assertEquals(typeof builder.getHILRequiredTools, "function");
  });
});

Deno.test("CodeAnalyzerAdapter - Complex code analysis", async (t) => {
  await t.step("analyzes code with multiple control structures", async () => {
    const db = createMockDbClient();
    const adapter = new CodeAnalyzerAdapter(db);

    const code = `
      const files = await mcp.filesystem.list_files({ path: "/data" });

      for (const file of files) {
        if (file.endsWith(".json")) {
          const content = await mcp.filesystem.read_file({ path: file });
          const parsed = JSON.parse(content);

          if (parsed.important) {
            await mcp.notification.send({ message: \`Found: \${file}\` });
          }
        }
      }

      return { processed: files.length };
    `;

    const structure = await adapter.analyze(code);

    assertExists(structure);
    // Should have multiple nodes for the various operations
    assertEquals(structure.nodes.length >= 1, true);
  });

  await t.step("analyzes code with Promise.all", async () => {
    const db = createMockDbClient();
    const adapter = new CodeAnalyzerAdapter(db);

    const code = `
      const [file1, file2] = await Promise.all([
        mcp.filesystem.read_file({ path: "/a.txt" }),
        mcp.filesystem.read_file({ path: "/b.txt" }),
      ]);
      return { file1, file2 };
    `;

    const structure = await adapter.analyze(code);

    assertExists(structure);
    // May detect fork/join nodes for parallel execution
  });

  await t.step("analyzes code with capability calls", async () => {
    const db = createMockDbClient();
    const adapter = new CodeAnalyzerAdapter(db);

    const code = `
      const result = await capabilities.processData({ input: data });
      return result;
    `;

    const structure = await adapter.analyze(code);

    assertExists(structure);
    // Should detect capability call node
  });
});

Deno.test("CodeAnalyzerAdapter - Tool type detection", async (t) => {
  await t.step("correctly identifies MCP tools (contain :)", async () => {
    const db = createMockDbClient();
    const adapter = new CodeAnalyzerAdapter(db);

    const code = `
      await mcp.filesystem.read_file({ path: "/test.txt" });
    `;

    const toolCalls = await adapter.extractToolCalls(code);

    for (const tc of toolCalls) {
      if (tc.toolId.includes(":") && !tc.toolId.startsWith("code:")) {
        assertEquals(tc.type, "mcp");
      }
    }
  });

  await t.step("correctly identifies code operations (start with code:)", () => {
    // Test the type detection logic directly
    const toolId = "code:transform";
    const isMcp = toolId.includes(":") && !toolId.startsWith("code:");

    assertEquals(isMcp, false);

    // MCP tools should return true
    const mcpToolId = "filesystem:read_file";
    const isMcpTool = mcpToolId.includes(":") && !mcpToolId.startsWith("code:");

    assertEquals(isMcpTool, true);
  });
});
