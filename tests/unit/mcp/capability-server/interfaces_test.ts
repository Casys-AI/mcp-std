/**
 * Tests for Capability MCP Server interfaces and utilities
 *
 * Story 13.3: CapabilityMCPServer + Gateway
 */

import { assertEquals, assertNotEquals } from "@std/assert";
import { parseToolName, toMCPToolName } from "../../../../src/mcp/capability-server/interfaces.ts";

Deno.test("parseToolName - valid format returns components", () => {
  const result = parseToolName("mcp__code__analyze");

  assertNotEquals(result, null);
  assertEquals(result?.namespace, "code");
  assertEquals(result?.action, "analyze");
});

Deno.test("parseToolName - namespace with underscores", () => {
  const result = parseToolName("mcp__my_namespace__my_action");

  assertNotEquals(result, null);
  assertEquals(result?.namespace, "my_namespace");
  assertEquals(result?.action, "my_action");
});

Deno.test("parseToolName - namespace with numbers", () => {
  const result = parseToolName("mcp__code2__analyze3");

  assertNotEquals(result, null);
  assertEquals(result?.namespace, "code2");
  assertEquals(result?.action, "analyze3");
});

Deno.test("parseToolName - invalid format returns null", () => {
  // Missing prefix
  assertEquals(parseToolName("code__analyze"), null);

  // Single underscore separator
  assertEquals(parseToolName("mcp_code_analyze"), null);

  // Missing action
  assertEquals(parseToolName("mcp__code"), null);

  // Empty namespace
  assertEquals(parseToolName("mcp____analyze"), null);

  // Uppercase (not allowed)
  assertEquals(parseToolName("mcp__Code__Analyze"), null);

  // Dashes (not allowed in our format)
  assertEquals(parseToolName("mcp__code-test__analyze"), null);
});

Deno.test("parseToolName - edge cases", () => {
  // Empty string
  assertEquals(parseToolName(""), null);

  // Just prefix
  assertEquals(parseToolName("mcp__"), null);

  // Random string
  assertEquals(parseToolName("hello_world"), null);
});

Deno.test("toMCPToolName - generates correct format", () => {
  const result = toMCPToolName("code", "analyze");
  assertEquals(result, "mcp__code__analyze");
});

Deno.test("toMCPToolName - handles underscores in names", () => {
  const result = toMCPToolName("my_namespace", "my_action");
  assertEquals(result, "mcp__my_namespace__my_action");
});

Deno.test("toMCPToolName - roundtrip with parseToolName", () => {
  const namespace = "data";
  const action = "transform";

  const toolName = toMCPToolName(namespace, action);
  const parsed = parseToolName(toolName);

  assertNotEquals(parsed, null);
  assertEquals(parsed?.namespace, namespace);
  assertEquals(parsed?.action, action);
});

Deno.test("toMCPToolName - multiple roundtrips", () => {
  const cases = [
    { namespace: "code", action: "analyze" },
    { namespace: "data", action: "transform" },
    { namespace: "file_utils", action: "read_file" },
    { namespace: "api123", action: "call456" },
  ];

  for (const { namespace, action } of cases) {
    const toolName = toMCPToolName(namespace, action);
    const parsed = parseToolName(toolName);

    assertNotEquals(parsed, null, `Failed for ${namespace}:${action}`);
    assertEquals(parsed?.namespace, namespace);
    assertEquals(parsed?.action, action);
  }
});
