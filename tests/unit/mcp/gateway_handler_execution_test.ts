/**
 * Unit Tests: ADR-030 - Gateway Real Execution
 *
 * Tests the GatewayHandler real execution vs dry_run modes.
 *
 * @module tests/unit/mcp/gateway_handler_execution_test
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import { GatewayHandler, type ToolExecutionMode } from "../../../src/mcp/gateway-handler.ts";
import type { DAGSuggester } from "../../../src/graphrag/dag-suggester.ts";
import type { GraphRAGEngine } from "../../../src/graphrag/graph-engine.ts";
import type { MCPClient } from "../../../src/mcp/client.ts";

// ============================================
// Mock Classes
// ============================================

class MockGraphEngine {
  async searchToolsHybrid() {
    return [];
  }
}

class MockDAGSuggester {
  async suggestDAG() {
    return null;
  }
}

class MockMCPClient {
  readonly serverId: string;
  readonly serverName: string;
  public callCount = 0;
  public lastToolCalled: string | null = null;
  public lastArgs: Record<string, unknown> | null = null;

  constructor(serverId: string) {
    this.serverId = serverId;
    this.serverName = serverId;
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    this.callCount++;
    this.lastToolCalled = toolName;
    this.lastArgs = args;
    return {
      success: true,
      tool: `${this.serverId}:${toolName}`,
      result: `Real execution of ${toolName}`,
    };
  }
}

// ============================================
// Helper to create GatewayHandler with mocks
// ============================================

function createHandler(
  mcpClients: Map<string, MCPClient>,
  executionMode: ToolExecutionMode = "real",
): GatewayHandler {
  return new GatewayHandler(
    new MockGraphEngine() as unknown as GraphRAGEngine,
    new MockDAGSuggester() as unknown as DAGSuggester,
    mcpClients,
    { executionMode },
  );
}

// ============================================
// Tests: Real Execution Mode (ADR-030)
// ============================================

Deno.test("ADR-030: executeToolReal - calls MCP client with correct args", async () => {
  const mockClient = new MockMCPClient("filesystem");
  const clients = new Map<string, MCPClient>([
    ["filesystem", mockClient as unknown as MCPClient],
  ]);

  const handler = createHandler(clients, "real");

  // Access private method via any cast for testing
  const executeToolReal = (handler as any).executeToolReal.bind(handler);

  const task = {
    id: "task_1",
    tool: "filesystem:read_file",
    arguments: { path: "/test.txt" },
    dependsOn: [],
  };

  const result = await executeToolReal(task);

  // Verify MCP client was called
  assertEquals(mockClient.callCount, 1);
  assertEquals(mockClient.lastToolCalled, "read_file");
  assertEquals(mockClient.lastArgs, { path: "/test.txt" });

  // Verify result
  assertEquals((result as any).success, true);
  assertStringIncludes((result as any).result, "Real execution");
});

Deno.test("ADR-030: executeToolReal - handles mcp__server__tool format", async () => {
  const mockClient = new MockMCPClient("playwright");
  const clients = new Map<string, MCPClient>([
    ["playwright", mockClient as unknown as MCPClient],
  ]);

  const handler = createHandler(clients, "real");
  const executeToolReal = (handler as any).executeToolReal.bind(handler);

  const task = {
    id: "task_1",
    tool: "mcp__playwright__browser_navigate",
    arguments: { url: "https://example.com" },
    dependsOn: [],
  };

  await executeToolReal(task);

  assertEquals(mockClient.callCount, 1);
  assertEquals(mockClient.lastToolCalled, "browser_navigate");
  assertEquals(mockClient.lastArgs, { url: "https://example.com" });
});

Deno.test("ADR-030: executeToolReal - throws on missing server", async () => {
  const clients = new Map<string, MCPClient>(); // Empty

  const handler = createHandler(clients, "real");
  const executeToolReal = (handler as any).executeToolReal.bind(handler);

  const task = {
    id: "task_1",
    tool: "unknown:some_tool",
    arguments: {},
    dependsOn: [],
  };

  let error: Error | null = null;
  try {
    await executeToolReal(task);
  } catch (e) {
    error = e as Error;
  }

  assertEquals(error !== null, true);
  assertStringIncludes(error!.message, 'MCP server "unknown" not connected');
});

Deno.test("ADR-030: executeToolReal - throws on invalid tool format", async () => {
  const clients = new Map<string, MCPClient>();

  const handler = createHandler(clients, "real");
  const executeToolReal = (handler as any).executeToolReal.bind(handler);

  const task = {
    id: "task_1",
    tool: "invalid_format_no_separator",
    arguments: {},
    dependsOn: [],
  };

  let error: Error | null = null;
  try {
    await executeToolReal(task);
  } catch (e) {
    error = e as Error;
  }

  assertEquals(error !== null, true);
  assertStringIncludes(error!.message, "Invalid tool format");
});

// ============================================
// Tests: Dry Run Mode (ADR-030)
// ============================================

Deno.test("ADR-030: dry_run mode - does NOT call MCP client", async () => {
  const mockClient = new MockMCPClient("filesystem");
  const clients = new Map<string, MCPClient>([
    ["filesystem", mockClient as unknown as MCPClient],
  ]);

  const handler = createHandler(clients, "dry_run");
  const executeTask = (handler as any).executeTask.bind(handler);

  const task = {
    id: "task_1",
    tool: "filesystem:read_file",
    arguments: { path: "/test.txt" },
    dependsOn: [],
  };

  const result = await executeTask(task);

  // MCP client should NOT be called
  assertEquals(mockClient.callCount, 0);

  // Result should be simulated
  assertEquals((result as any)._dry_run, true);
  assertEquals((result as any).status, "completed");
  assertStringIncludes((result as any).output, "Simulated execution");
});

Deno.test("ADR-030: real mode - DOES call MCP client", async () => {
  const mockClient = new MockMCPClient("filesystem");
  const clients = new Map<string, MCPClient>([
    ["filesystem", mockClient as unknown as MCPClient],
  ]);

  const handler = createHandler(clients, "real");
  const executeTask = (handler as any).executeTask.bind(handler);

  const task = {
    id: "task_1",
    tool: "filesystem:read_file",
    arguments: { path: "/test.txt" },
    dependsOn: [],
  };

  const result = await executeTask(task);

  // MCP client SHOULD be called
  assertEquals(mockClient.callCount, 1);

  // Result should be real
  assertEquals((result as any).success, true);
  assertEquals((result as any)._dry_run, undefined);
});

// ============================================
// Tests: executeTask routing
// ============================================

Deno.test("ADR-030: executeTask routes based on executionMode config", async () => {
  const mockClient = new MockMCPClient("test");
  const clients = new Map<string, MCPClient>([
    ["test", mockClient as unknown as MCPClient],
  ]);

  const task = {
    id: "task_1",
    tool: "test:some_tool",
    arguments: {},
    dependsOn: [],
  };

  // Test dry_run
  const dryHandler = createHandler(clients, "dry_run");
  const dryResult = await (dryHandler as any).executeTask(task);
  assertEquals((dryResult as any)._dry_run, true);
  assertEquals(mockClient.callCount, 0);

  // Test real
  const realHandler = createHandler(clients, "real");
  const realResult = await (realHandler as any).executeTask(task);
  assertEquals((realResult as any)._dry_run, undefined);
  assertEquals(mockClient.callCount, 1);
});

// ============================================
// Tests: Default config
// ============================================

Deno.test("ADR-030: default executionMode is 'real'", () => {
  const clients = new Map<string, MCPClient>();
  const handler = createHandler(clients); // No explicit mode

  // Access config
  const config = (handler as any).config;
  assertEquals(config.executionMode, "real");
});
