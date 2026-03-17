/**
 * Tests for MiniToolsClient with MCP Apps support
 *
 * @module lib/std/src/client_test
 */

import { assertEquals } from "@std/assert";
import { MiniToolsClient } from "./client.ts";

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
