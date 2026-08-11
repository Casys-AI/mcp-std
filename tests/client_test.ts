/**
 * Tests for MiniToolsClient with MCP Apps support
 *
 * @module lib/std/src/client_test
 */

import { assertEquals, assertThrows } from "@std/assert";
import { MiniToolsClient } from "../src/client.ts";
import { getCategories, getToolsByCategory } from "../src/tools/mod.ts";

Deno.test("toMCPFormat - includes _meta for tools with UI", () => {
  const client = new MiniToolsClient({ categories: ["database"] });
  const mcpTools = client.toMCPFormat();

  // Find psql_query which has _meta.ui defined
  const psqlTool = mcpTools.find((t) => t.name === "psql_query");

  assertEquals(psqlTool !== undefined, true);
  assertEquals(psqlTool?._meta?.ui?.resourceUri, "ui://mcp-std/table-viewer");
  assertEquals(psqlTool?._meta?.ui?.emits?.includes("filter"), true);
  assertEquals(psqlTool?._meta?.ui?.accepts?.includes("setData"), true);
});

Deno.test("toMCPFormat - omits _meta for tools without UI", () => {
  const client = new MiniToolsClient({ categories: ["math"] });
  const mcpTools = client.toMCPFormat();

  // Math tools don't have UI defined
  const sumTool = mcpTools.find((t) => t.name === "math_sum");

  if (sumTool) {
    assertEquals(sumTool._meta, undefined);
  }
});

Deno.test("toMCPFormat - backward compatible structure", () => {
  const client = new MiniToolsClient({ categories: ["json"] });
  const mcpTools = client.toMCPFormat();

  // Verify standard MCP format fields are present
  for (const tool of mcpTools) {
    assertEquals(typeof tool.name, "string");
    assertEquals(typeof tool.description, "string");
    assertEquals(typeof tool.inputSchema, "object");
  }
});

Deno.test("categories - trims and deduplicates requested names", () => {
  const normalized = new MiniToolsClient({ categories: [" text ", "text"] });
  const expected = new MiniToolsClient({ categories: ["text"] });

  assertEquals(
    normalized.listTools().map((tool) => tool.name),
    expected.listTools().map((tool) => tool.name),
  );
});

Deno.test("categories - rejects unknown names", () => {
  assertThrows(
    () => new MiniToolsClient({ categories: ["not-a-category"] }),
    RangeError,
    "Unknown categories: not-a-category",
  );
});

Deno.test("categories - exposes the legacy system aggregate", () => {
  const systemTools = getToolsByCategory("system");

  assertEquals(getCategories().includes("system"), true);
  assertEquals(systemTools.length > 0, true);
  assertEquals(systemTools.every((tool) => tool.category === "system"), true);
});

Deno.test("categories - overlapping selections expose each tool once", () => {
  const tools = new MiniToolsClient({ categories: ["system", "docker"] })
    .listTools();

  assertEquals(tools.length, new Set(tools.map((tool) => tool.name)).size);
});
