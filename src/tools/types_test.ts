/**
 * Tests for MiniTool types with MCP Apps support
 *
 * @module lib/std/src/tools/types_test
 */

import { assertEquals } from "@std/assert";
import { defineTool, type MiniTool, type MCPToolMeta } from "./types.ts";

Deno.test("defineTool - creates tool without _meta", () => {
  const tool = defineTool(
    "test_tool",
    "Test description",
    "util",
    { type: "object", properties: {} },
    () => "result"
  );

  assertEquals(tool.name, "test_tool");
  assertEquals(tool.description, "Test description");
  assertEquals(tool.category, "util");
  assertEquals(tool._meta, undefined);
});

Deno.test("defineTool - creates tool with _meta.ui", () => {
  const meta: MCPToolMeta = {
    ui: {
      resourceUri: "ui://mcp-std/test-viewer",
      emits: ["select", "filter"],
      accepts: ["setData"],
    },
  };

  const tool = defineTool(
    "test_tool_ui",
    "Test with UI",
    "database",
    { type: "object", properties: {} },
    () => "result",
    meta
  );

  assertEquals(tool.name, "test_tool_ui");
  assertEquals(tool._meta?.ui?.resourceUri, "ui://mcp-std/test-viewer");
  assertEquals(tool._meta?.ui?.emits, ["select", "filter"]);
  assertEquals(tool._meta?.ui?.accepts, ["setData"]);
});

Deno.test("MiniTool interface - accepts _meta property", () => {
  const tool: MiniTool = {
    name: "manual_tool",
    description: "Manually defined",
    category: "json",
    inputSchema: { type: "object" },
    handler: () => null,
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/json-viewer",
        visibility: ["model", "app"],
      },
    },
  };

  assertEquals(tool._meta?.ui?.resourceUri, "ui://mcp-std/json-viewer");
  assertEquals(tool._meta?.ui?.visibility, ["model", "app"]);
});
