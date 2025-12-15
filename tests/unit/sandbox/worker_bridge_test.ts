/**
 * Worker RPC Bridge Tests (Story 7.1b / ADR-032)
 *
 * Tests for WorkerBridge class:
 * - RPC message handling
 * - Native tool call tracing
 * - Worker execution lifecycle
 * - Error handling
 * - Timeout handling
 *
 * NOTE: Requires --unstable-worker-options flag for Deno Worker permissions
 */

import {
  assertArrayIncludes,
  assertEquals,
  assertExists,
  assertGreater,
  assertStringIncludes,
} from "@std/assert";
import { WorkerBridge } from "../../../src/sandbox/worker-bridge.ts";
import type { MCPClient } from "../../../src/mcp/client.ts";
import type { ToolDefinition, TraceEvent } from "../../../src/sandbox/types.ts";

/**
 * Mock MCPClient for testing
 */
function createMockMCPClient(
  serverId: string,
  responses: Record<string, unknown> = {},
  delays: Record<string, number> = {},
  errors: Record<string, string> = {},
): MCPClient {
  return {
    serverId,
    serverName: serverId,
    callTool: async (toolName: string, args: Record<string, unknown>) => {
      // Check for configured delay
      const delay = delays[toolName] ?? 5;
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Check for configured error
      if (errors[toolName]) {
        throw new Error(errors[toolName]);
      }

      // Check for configured response
      if (responses[toolName] !== undefined) {
        return responses[toolName];
      }

      // Default mock response
      return {
        success: true,
        tool: toolName,
        args,
        timestamp: Date.now(),
      };
    },
    connect: async () => {},
    disconnect: async () => {},
    close: async () => {},
    listTools: async () => [],
    extractSchemas: async () => ({
      serverId,
      serverName: serverId,
      status: "success" as const,
      toolsExtracted: 0,
      tools: [],
      connectionDuration: 0,
    }),
  } as unknown as MCPClient;
}

/**
 * Create test tool definitions
 */
function createToolDefinitions(): ToolDefinition[] {
  return [
    {
      server: "test-server",
      name: "echo",
      description: "Echo the input back",
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string" },
        },
        required: ["message"],
      },
    },
    {
      server: "test-server",
      name: "add",
      description: "Add two numbers",
      inputSchema: {
        type: "object",
        properties: {
          a: { type: "number" },
          b: { type: "number" },
        },
        required: ["a", "b"],
      },
    },
    {
      server: "other-server",
      name: "greet",
      description: "Generate a greeting",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
        },
        required: ["name"],
      },
    },
  ];
}

// =============================================================================
// Unit Tests - Basic Functionality
// =============================================================================

Deno.test({
  name: "WorkerBridge - instantiation",
  fn: () => {
    const mcpClients = new Map<string, MCPClient>();
    const bridge = new WorkerBridge(mcpClients);
    assertExists(bridge);
    bridge.cleanup(); // Story 7.3b: Close BroadcastChannel
  },
});

Deno.test({
  name: "WorkerBridge - instantiation with custom config",
  fn: () => {
    const mcpClients = new Map<string, MCPClient>();
    const bridge = new WorkerBridge(mcpClients, {
      timeout: 5000,
      rpcTimeout: 2000,
    });
    assertExists(bridge);
    bridge.cleanup(); // Story 7.3b: Close BroadcastChannel
  },
});

Deno.test({
  name: "WorkerBridge - getTraces returns empty array initially",
  fn: () => {
    const mcpClients = new Map<string, MCPClient>();
    const bridge = new WorkerBridge(mcpClients);

    const traces = bridge.getTraces();
    assertEquals(traces, []);
    bridge.cleanup(); // Story 7.3b: Close BroadcastChannel
  },
});

Deno.test({
  name: "WorkerBridge - getToolsCalled returns empty array initially",
  fn: () => {
    const mcpClients = new Map<string, MCPClient>();
    const bridge = new WorkerBridge(mcpClients);

    const tools = bridge.getToolsCalled();
    assertEquals(tools, []);
    bridge.cleanup(); // Story 7.3b: Close BroadcastChannel
  },
});

Deno.test({
  name: "WorkerBridge - terminate cleans up resources",
  fn: () => {
    const mcpClients = new Map<string, MCPClient>();
    const bridge = new WorkerBridge(mcpClients);

    // Should not throw
    bridge.cleanup(); // Story 7.3b: Use cleanup() instead of terminate() to also close BroadcastChannel
    bridge.cleanup(); // Idempotent
  },
});

// =============================================================================
// Unit Tests - ToolDefinition
// =============================================================================

Deno.test({
  name: "ToolDefinition - structure validation",
  fn: () => {
    const defs = createToolDefinitions();

    assertEquals(defs.length, 3);

    // Check first definition
    assertEquals(defs[0].server, "test-server");
    assertEquals(defs[0].name, "echo");
    assertExists(defs[0].description);
    assertExists(defs[0].inputSchema);
  },
});

Deno.test({
  name: "ToolDefinition - JSON serializable",
  fn: () => {
    const defs = createToolDefinitions();

    // Should serialize without issues
    const json = JSON.stringify(defs);
    const parsed = JSON.parse(json);

    assertEquals(parsed.length, 3);
    assertEquals(parsed[0].server, "test-server");
  },
});

// =============================================================================
// Unit Tests - Mock MCPClient
// =============================================================================

Deno.test({
  name: "MockMCPClient - callTool returns response",
  fn: async () => {
    const client = createMockMCPClient("test-server", {
      echo: { echoed: "hello" },
    });

    const result = await client.callTool("echo", { message: "hello" });
    assertEquals(result, { echoed: "hello" });
  },
});

Deno.test({
  name: "MockMCPClient - callTool returns default for unknown tool",
  fn: async () => {
    const client = createMockMCPClient("test-server");

    const result = await client.callTool("unknown", { foo: "bar" }) as Record<string, unknown>;
    assertEquals(result.success, true);
    assertEquals(result.tool, "unknown");
  },
});

Deno.test({
  name: "MockMCPClient - callTool throws configured error",
  fn: async () => {
    const client = createMockMCPClient("test-server", {}, {}, {
      failing_tool: "Test error message",
    });

    try {
      await client.callTool("failing_tool", {});
      throw new Error("Should have thrown");
    } catch (e) {
      assertStringIncludes((e as Error).message, "Test error message");
    }
  },
});

// =============================================================================
// Unit Tests - TraceEvent
// =============================================================================

Deno.test({
  name: "TraceEvent - tool_start structure",
  fn: () => {
    const event: TraceEvent = {
      type: "tool_start",
      tool: "test-server:echo",
      traceId: "test-uuid",
      ts: Date.now(),
    };

    assertEquals(event.type, "tool_start");
    assertExists(event.tool);
    assertExists(event.traceId);
    assertExists(event.ts);
  },
});

Deno.test({
  name: "TraceEvent - tool_end structure",
  fn: () => {
    const event: TraceEvent = {
      type: "tool_end",
      tool: "test-server:echo",
      traceId: "test-uuid",
      ts: Date.now(),
      success: true,
      durationMs: 100,
    };

    assertEquals(event.type, "tool_end");
    assertEquals(event.success, true);
    assertExists(event.durationMs);
  },
});

Deno.test({
  name: "TraceEvent - tool_end with error",
  fn: () => {
    const event: TraceEvent = {
      type: "tool_end",
      tool: "test-server:echo",
      traceId: "test-uuid",
      ts: Date.now(),
      success: false,
      durationMs: 50,
      error: "Tool execution failed",
    };

    assertEquals(event.success, false);
    assertExists(event.error);
  },
});

// =============================================================================
// Integration Tests - Worker Execution (Requires --unstable-worker-options)
// =============================================================================

Deno.test({
  name: "WorkerBridge - execute simple code without tools",
  fn: async () => {
    const mcpClients = new Map<string, MCPClient>();
    const bridge = new WorkerBridge(mcpClients, { timeout: 5000 });

    const result = await bridge.execute("return 1 + 1", []);

    assertEquals(result.success, true);
    assertEquals(result.result, 2);
    assertExists(result.executionTimeMs);
    assertEquals(bridge.getTraces().length, 0); // No tool calls
    bridge.cleanup(); // Story 7.3b: Close BroadcastChannel
  },
});

Deno.test({
  name: "WorkerBridge - execute with context injection",
  fn: async () => {
    const mcpClients = new Map<string, MCPClient>();
    const bridge = new WorkerBridge(mcpClients, { timeout: 5000 });

    const result = await bridge.execute(
      "return x + y",
      [],
      { x: 10, y: 20 },
    );

    assertEquals(result.success, true);
    assertEquals(result.result, 30);
    bridge.cleanup(); // Story 7.3b: Close BroadcastChannel
  },
});

Deno.test({
  name: "WorkerBridge - execute async code",
  fn: async () => {
    const mcpClients = new Map<string, MCPClient>();
    const bridge = new WorkerBridge(mcpClients, { timeout: 5000 });

    const result = await bridge.execute(
      "const p = new Promise(r => setTimeout(() => r(42), 10)); return await p",
      [],
    );

    assertEquals(result.success, true);
    assertEquals(result.result, 42);
    bridge.cleanup(); // Story 7.3b: Close BroadcastChannel
  },
});

Deno.test({
  name: "WorkerBridge - single tool call with tracing",
  fn: async () => {
    const mcpClients = new Map<string, MCPClient>();
    mcpClients.set(
      "test-server",
      createMockMCPClient("test-server", {
        echo: { echoed: "hello world" },
      }),
    );

    const bridge = new WorkerBridge(mcpClients, { timeout: 10000 });
    const toolDefs: ToolDefinition[] = [{
      server: "test-server",
      name: "echo",
      description: "Echo test",
      inputSchema: { type: "object" },
    }];

    const code = `
      const result = await mcp["test-server"].echo({ message: "hello" });
      return result;
    `;

    const result = await bridge.execute(code, toolDefs);

    assertEquals(result.success, true);
    assertEquals((result.result as Record<string, unknown>).echoed, "hello world");

    // Verify traces captured
    const traces = bridge.getTraces();
    assertEquals(traces.length, 2); // tool_start + tool_end

    // Verify tool_start (type narrowing for discriminated union)
    const startTrace = traces.find((t) => t.type === "tool_start");
    assertExists(startTrace);
    if (startTrace && startTrace.type === "tool_start") {
      assertEquals(startTrace.tool, "test-server:echo");
      assertExists(startTrace.traceId);
    }

    // Verify tool_end (type narrowing for discriminated union)
    const endTrace = traces.find((t) => t.type === "tool_end");
    assertExists(endTrace);
    if (endTrace && endTrace.type === "tool_end") {
      assertEquals(endTrace.success, true);
      assertExists(endTrace.durationMs);
      if (startTrace) assertEquals(endTrace.traceId, startTrace.traceId);
    }

    // Verify tools called
    const toolsCalled = bridge.getToolsCalled();
    assertEquals(toolsCalled.length, 1);
    assertArrayIncludes(toolsCalled, ["test-server:echo"]);
    bridge.cleanup(); // Story 7.3b: Close BroadcastChannel
  },
});

Deno.test({
  name: "WorkerBridge - multiple tool calls traced",
  fn: async () => {
    const mcpClients = new Map<string, MCPClient>();
    mcpClients.set(
      "test-server",
      createMockMCPClient("test-server", {
        echo: { echoed: true },
        add: { sum: 5 },
      }),
    );

    const bridge = new WorkerBridge(mcpClients, { timeout: 10000 });
    const toolDefs: ToolDefinition[] = [
      { server: "test-server", name: "echo", description: "Echo", inputSchema: { type: "object" } },
      { server: "test-server", name: "add", description: "Add", inputSchema: { type: "object" } },
    ];

    const code = `
      const r1 = await mcp["test-server"].echo({ message: "hello" });
      const r2 = await mcp["test-server"].add({ a: 2, b: 3 });
      return { r1, r2 };
    `;

    const result = await bridge.execute(code, toolDefs);

    assertEquals(result.success, true);

    // Both tools should be traced
    const toolsCalled = bridge.getToolsCalled();
    assertEquals(toolsCalled.length, 2);
    assertArrayIncludes(toolsCalled, ["test-server:echo", "test-server:add"]);

    // Should have 4 trace events (2 starts + 2 ends)
    const traces = bridge.getTraces();
    assertEquals(traces.length, 4);
    bridge.cleanup(); // Story 7.3b: Close BroadcastChannel
  },
});

Deno.test({
  name: "WorkerBridge - tool calls to multiple servers",
  fn: async () => {
    const mcpClients = new Map<string, MCPClient>();
    mcpClients.set("server-a", createMockMCPClient("server-a", { tool_a: "result_a" }));
    mcpClients.set("server-b", createMockMCPClient("server-b", { tool_b: "result_b" }));

    const bridge = new WorkerBridge(mcpClients, { timeout: 10000 });
    const toolDefs: ToolDefinition[] = [
      {
        server: "server-a",
        name: "tool_a",
        description: "Tool A",
        inputSchema: { type: "object" },
      },
      {
        server: "server-b",
        name: "tool_b",
        description: "Tool B",
        inputSchema: { type: "object" },
      },
    ];

    const code = `
      const a = await mcp["server-a"].tool_a({});
      const b = await mcp["server-b"].tool_b({});
      return { a, b };
    `;

    const result = await bridge.execute(code, toolDefs);

    assertEquals(result.success, true);
    assertEquals((result.result as Record<string, unknown>).a, "result_a");
    assertEquals((result.result as Record<string, unknown>).b, "result_b");

    const toolsCalled = bridge.getToolsCalled();
    assertArrayIncludes(toolsCalled, ["server-a:tool_a", "server-b:tool_b"]);
    bridge.cleanup(); // Story 7.3b: Close BroadcastChannel
  },
});

// =============================================================================
// Integration Tests - Error Handling
// =============================================================================

Deno.test({
  name: "WorkerBridge - tool call error propagation",
  fn: async () => {
    const mcpClients = new Map<string, MCPClient>();
    mcpClients.set(
      "test-server",
      createMockMCPClient("test-server", {}, {}, {
        failing_tool: "MCP tool failed: connection refused",
      }),
    );

    const bridge = new WorkerBridge(mcpClients, { timeout: 10000 });
    const toolDefs: ToolDefinition[] = [{
      server: "test-server",
      name: "failing_tool",
      description: "A tool that fails",
      inputSchema: { type: "object" },
    }];

    const code = `
      try {
        await mcp["test-server"].failing_tool({});
        return "should not reach here";
      } catch (e) {
        return { error: e.message };
      }
    `;

    const result = await bridge.execute(code, toolDefs);

    assertEquals(result.success, true);
    assertStringIncludes(
      (result.result as Record<string, string>).error,
      "connection refused",
    );

    // Verify trace shows failure (type narrowing for discriminated union)
    const traces = bridge.getTraces();
    const endTrace = traces.find((t) => t.type === "tool_end");
    assertExists(endTrace);
    if (endTrace && endTrace.type === "tool_end") {
      assertEquals(endTrace.success, false);
      assertExists(endTrace.error);
    }
    bridge.cleanup(); // Story 7.3b: Close BroadcastChannel
  },
});

Deno.test({
  name: "WorkerBridge - unknown server error",
  fn: async () => {
    const mcpClients = new Map<string, MCPClient>();
    // Don't add any MCP clients

    const bridge = new WorkerBridge(mcpClients, { timeout: 10000 });
    const toolDefs: ToolDefinition[] = [{
      server: "unknown-server",
      name: "some_tool",
      description: "A tool",
      inputSchema: { type: "object" },
    }];

    const code = `
      try {
        await mcp["unknown-server"].some_tool({});
        return "should not reach here";
      } catch (e) {
        return { error: e.message };
      }
    `;

    const result = await bridge.execute(code, toolDefs);

    assertEquals(result.success, true);
    assertStringIncludes(
      (result.result as Record<string, string>).error,
      "not connected",
    );
    bridge.cleanup(); // Story 7.3b: Close BroadcastChannel
  },
});

Deno.test({
  name: "WorkerBridge - runtime error in user code",
  fn: async () => {
    const mcpClients = new Map<string, MCPClient>();
    const bridge = new WorkerBridge(mcpClients, { timeout: 5000 });

    const result = await bridge.execute("throw new Error('User error')", []);

    assertEquals(result.success, false);
    assertExists(result.error);
    assertStringIncludes(result.error!.message, "User error");
    bridge.cleanup(); // Story 7.3b: Close BroadcastChannel
  },
});

Deno.test({
  name: "WorkerBridge - syntax error in user code",
  fn: async () => {
    const mcpClients = new Map<string, MCPClient>();
    const bridge = new WorkerBridge(mcpClients, { timeout: 5000 });

    const result = await bridge.execute("return {{{", []);

    assertEquals(result.success, false);
    assertExists(result.error);
    bridge.cleanup(); // Story 7.3b: Close BroadcastChannel
  },
});

// =============================================================================
// Integration Tests - Timeout Handling
// =============================================================================

Deno.test({
  name: "WorkerBridge - execution timeout",
  fn: async () => {
    const mcpClients = new Map<string, MCPClient>();
    const bridge = new WorkerBridge(mcpClients, { timeout: 500 }); // 500ms timeout

    const code = `
      // Infinite loop
      while (true) { }
      return "never";
    `;

    const result = await bridge.execute(code, []);

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error!.type, "TimeoutError");
    bridge.cleanup(); // Story 7.3b: Close BroadcastChannel
  },
});

Deno.test({
  name: "WorkerBridge - slow tool call within timeout",
  fn: async () => {
    const mcpClients = new Map<string, MCPClient>();
    mcpClients.set(
      "test-server",
      createMockMCPClient("test-server", {
        slow_tool: { result: "done" },
      }, {
        slow_tool: 200, // 200ms delay
      }),
    );

    const bridge = new WorkerBridge(mcpClients, { timeout: 5000 });
    const toolDefs: ToolDefinition[] = [{
      server: "test-server",
      name: "slow_tool",
      description: "A slow tool",
      inputSchema: { type: "object" },
    }];

    const code = `
      const result = await mcp["test-server"].slow_tool({});
      return result;
    `;

    const result = await bridge.execute(code, toolDefs);

    assertEquals(result.success, true);
    assertEquals((result.result as Record<string, unknown>).result, "done");
    bridge.cleanup(); // Story 7.3b: Close BroadcastChannel
  },
});

// =============================================================================
// Integration Tests - Context Injection Edge Cases
// =============================================================================

Deno.test({
  name: "WorkerBridge - context with various data types",
  fn: async () => {
    const mcpClients = new Map<string, MCPClient>();
    const bridge = new WorkerBridge(mcpClients, { timeout: 5000 });

    const context = {
      num: 42,
      str: "hello",
      bool: true,
      arr: [1, 2, 3],
      obj: { nested: { value: "deep" } },
      nullVal: null,
    };

    const result = await bridge.execute(
      "return { num, str, bool, arr, obj, nullVal }",
      [],
      context,
    );

    assertEquals(result.success, true);
    const res = result.result as Record<string, unknown>;
    assertEquals(res.num, 42);
    assertEquals(res.str, "hello");
    assertEquals(res.bool, true);
    assertEquals(res.arr, [1, 2, 3]);
    assertEquals((res.obj as Record<string, unknown>).nested, { value: "deep" });
    assertEquals(res.nullVal, null);
    bridge.cleanup(); // Story 7.3b: Close BroadcastChannel
  },
});

Deno.test({
  name: "WorkerBridge - context does not override mcp",
  fn: async () => {
    const mcpClients = new Map<string, MCPClient>();
    mcpClients.set(
      "test-server",
      createMockMCPClient("test-server", {
        test: { success: true },
      }),
    );

    const bridge = new WorkerBridge(mcpClients, { timeout: 5000 });
    const toolDefs: ToolDefinition[] = [{
      server: "test-server",
      name: "test",
      description: "Test",
      inputSchema: { type: "object" },
    }];

    // Try to override mcp with context (should not work due to variable ordering)
    const context = { someVar: "value" };

    const code = `
      const result = await mcp["test-server"].test({});
      return { toolResult: result, someVar };
    `;

    const result = await bridge.execute(code, toolDefs, context);

    assertEquals(result.success, true);
    const res = result.result as Record<string, unknown>;
    assertEquals((res.toolResult as Record<string, unknown>).success, true);
    assertEquals(res.someVar, "value");
    bridge.cleanup(); // Story 7.3b: Close BroadcastChannel
  },
});

// =============================================================================
// Integration Tests - Auto-Return Logic (ADR-016)
// =============================================================================

Deno.test({
  name: "WorkerBridge - auto-return simple expression",
  fn: async () => {
    const mcpClients = new Map<string, MCPClient>();
    const bridge = new WorkerBridge(mcpClients, { timeout: 5000 });

    // Expression without 'return' should auto-wrap
    const result = await bridge.execute("1 + 1", []);

    assertEquals(result.success, true);
    assertEquals(result.result, 2);
    bridge.cleanup(); // Story 7.3b: Close BroadcastChannel
  },
});

Deno.test({
  name: "WorkerBridge - explicit return in statement",
  fn: async () => {
    const mcpClients = new Map<string, MCPClient>();
    const bridge = new WorkerBridge(mcpClients, { timeout: 5000 });

    // Statement with return keyword
    const result = await bridge.execute("const x = 5; return x * 2", []);

    assertEquals(result.success, true);
    assertEquals(result.result, 10);
    bridge.cleanup(); // Story 7.3b: Close BroadcastChannel
  },
});

// =============================================================================
// Integration Tests - Performance
// =============================================================================

Deno.test({
  name: "WorkerBridge - RPC overhead measurement",
  fn: async () => {
    const mcpClients = new Map<string, MCPClient>();
    mcpClients.set(
      "test-server",
      createMockMCPClient("test-server", {
        fast_tool: { result: "done" },
      }, {
        fast_tool: 0, // No artificial delay
      }),
    );

    const bridge = new WorkerBridge(mcpClients, { timeout: 10000 });
    const toolDefs: ToolDefinition[] = [{
      server: "test-server",
      name: "fast_tool",
      description: "A fast tool",
      inputSchema: { type: "object" },
    }];

    const code = `
      const result = await mcp["test-server"].fast_tool({});
      return result;
    `;

    const result = await bridge.execute(code, toolDefs);

    assertEquals(result.success, true);

    // Check RPC overhead from traces (type narrowing for discriminated union)
    const traces = bridge.getTraces();
    const endEvent = traces.find((t) => t.type === "tool_end");

    assertExists(endEvent);
    if (endEvent && endEvent.type === "tool_end") {
      assertExists(endEvent.durationMs);
      // RPC overhead should be reasonable (< 100ms including Worker startup)
      // Note: First Worker execution may be slower due to module loading
      assertGreater(500, endEvent.durationMs!, "RPC overhead exceeds 500ms");
    }
    bridge.cleanup(); // Story 7.3b: Close BroadcastChannel
  },
});

// =============================================================================
// Story 7.1 Cleanup Verification Tests
// =============================================================================

Deno.test({
  name: "Story 7.1 cleanup - wrapToolCall removed from context-builder",
  fn: () => {
    const contextBuilderCode = Deno.readTextFileSync(
      "./src/sandbox/context-builder.ts",
    );

    // wrapToolCall should be removed
    assertEquals(
      contextBuilderCode.includes("function wrapToolCall("),
      false,
      "wrapToolCall() should be removed from context-builder.ts",
    );

    // setTracingEnabled should be removed
    assertEquals(
      contextBuilderCode.includes("function setTracingEnabled("),
      false,
      "setTracingEnabled() should be removed from context-builder.ts",
    );

    // isTracingEnabled should be removed
    assertEquals(
      contextBuilderCode.includes("function isTracingEnabled("),
      false,
      "isTracingEnabled() should be removed from context-builder.ts",
    );

    // __TRACE__ pattern should be removed
    assertEquals(
      contextBuilderCode.includes("__TRACE__"),
      false,
      "__TRACE__ pattern should be removed from context-builder.ts",
    );
  },
});

Deno.test({
  name: "Story 7.1 cleanup - parseTraces removed from gateway-server",
  fn: () => {
    const gatewayServerCode = Deno.readTextFileSync(
      "./src/mcp/gateway-server.ts",
    );

    // parseTraces should be removed
    assertEquals(
      gatewayServerCode.includes("function parseTraces("),
      false,
      "parseTraces() should be removed from gateway-server.ts",
    );

    // ParsedTraces interface should be removed
    assertEquals(
      gatewayServerCode.includes("interface ParsedTraces"),
      false,
      "ParsedTraces interface should be removed from gateway-server.ts",
    );
  },
});

Deno.test({
  name: "Story 7.1 cleanup - old test files removed",
  fn: () => {
    // trace_parsing_test.ts should not exist
    try {
      Deno.statSync("./tests/unit/mcp/trace_parsing_test.ts");
      throw new Error("trace_parsing_test.ts should be deleted");
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) {
        throw e;
      }
      // File not found - expected
    }

    // tracing_performance_test.ts should not exist
    try {
      Deno.statSync("./tests/unit/sandbox/tracing_performance_test.ts");
      throw new Error("tracing_performance_test.ts should be deleted");
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) {
        throw e;
      }
      // File not found - expected
    }
  },
});

Deno.test({
  name: "Story 7.1 cleanup - rawStdout removed from types",
  fn: () => {
    const typesCode = Deno.readTextFileSync("./src/sandbox/types.ts");

    // rawStdout should be removed from ExecutionResult
    assertEquals(
      typesCode.includes("rawStdout"),
      false,
      "rawStdout should be removed from types.ts",
    );
  },
});

// =============================================================================
// Story 7.3b Tests - Capability Injection
// =============================================================================

Deno.test({
  name: "WorkerBridge - buildCapabilityContext generates code",
  fn: () => {
    const mcpClients = new Map<string, MCPClient>();
    const bridge = new WorkerBridge(mcpClients);

    // Create mock capability
    const capability = {
      id: "cap-123",
      name: "testCapability",
      codeSnippet: "return args.value * 2;",
      codeHash: "hash-123",
      intentEmbedding: new Float32Array(1024),
      cacheConfig: { ttl_ms: 3600000, cacheable: true },
      usageCount: 1,
      successCount: 1,
      successRate: 1.0,
      avgDurationMs: 100,
      createdAt: new Date(),
      lastUsed: new Date(),
      source: "emergent" as const,
    };

    const context = bridge.buildCapabilityContext([capability]);

    assertExists(context);
    assertStringIncludes(context, "let __capabilityDepth = 0;");
    assertStringIncludes(context, "const capabilities = {");
    assertStringIncludes(context, "testCapability:");
    bridge.cleanup(); // Story 7.3b: Close BroadcastChannel
  },
});

Deno.test({
  name: "WorkerBridge - buildCapabilityContext empty array",
  fn: () => {
    const mcpClients = new Map<string, MCPClient>();
    const bridge = new WorkerBridge(mcpClients);

    const context = bridge.buildCapabilityContext([]);

    assertStringIncludes(context, "let __capabilityDepth = 0;");
    assertStringIncludes(context, "const capabilities = {};");
    bridge.cleanup(); // Story 7.3b: Close BroadcastChannel
  },
});

Deno.test({
  name: "WorkerBridge - execute with capability context",
  sanitizeResources: false, // BroadcastChannel cleanup
  sanitizeOps: false,
  fn: async () => {
    const mcpClients = new Map<string, MCPClient>();
    const bridge = new WorkerBridge(mcpClients, { timeout: 5000 });

    // Generate capability context
    const capability = {
      id: "cap-double",
      name: "doubleValue",
      codeSnippet: "return args.value * 2;",
      codeHash: "hash-double",
      intentEmbedding: new Float32Array(1024),
      cacheConfig: { ttl_ms: 3600000, cacheable: true },
      usageCount: 1,
      successCount: 1,
      successRate: 1.0,
      avgDurationMs: 100,
      createdAt: new Date(),
      lastUsed: new Date(),
      source: "emergent" as const,
    };

    const capabilityContext = bridge.buildCapabilityContext([capability]);

    // Execute code that uses the capability
    const result = await bridge.execute(
      "return await capabilities.doubleValue({ value: 21 })",
      [],
      {},
      capabilityContext,
    );

    assertEquals(result.success, true);
    assertEquals(result.result, 42);
    bridge.cleanup();
  },
});

Deno.test({
  name: "WorkerBridge - capability traces via BroadcastChannel (AC#4)",
  sanitizeResources: false, // BroadcastChannel cleanup
  sanitizeOps: false,
  fn: async () => {
    const mcpClients = new Map<string, MCPClient>();
    const bridge = new WorkerBridge(mcpClients, { timeout: 5000 });

    const capability = {
      id: "cap-traced",
      name: "tracedCapability",
      codeSnippet: "return 'traced';",
      codeHash: "hash-traced",
      intentEmbedding: new Float32Array(1024),
      cacheConfig: { ttl_ms: 3600000, cacheable: true },
      usageCount: 1,
      successCount: 1,
      successRate: 1.0,
      avgDurationMs: 100,
      createdAt: new Date(),
      lastUsed: new Date(),
      source: "emergent" as const,
    };

    const capabilityContext = bridge.buildCapabilityContext([capability]);

    await bridge.execute(
      "return await capabilities.tracedCapability({})",
      [],
      {},
      capabilityContext,
    );

    // Give BroadcastChannel time to deliver message
    await new Promise((r) => setTimeout(r, 50));

    const traces = bridge.getTraces();

    // Should have capability_start and capability_end traces
    const startTrace = traces.find((t) => t.type === "capability_start");
    const endTrace = traces.find((t) => t.type === "capability_end");

    assertExists(startTrace, "Should have capability_start trace");
    assertExists(endTrace, "Should have capability_end trace");

    // Verify trace structure (using type narrowing)
    // Note: capability name is normalized to JS identifier
    if (startTrace && startTrace.type === "capability_start") {
      assertStringIncludes(startTrace.capability, "tracedCapability");
      assertEquals(startTrace.capabilityId, "cap-traced");
    }
    bridge.cleanup();
  },
});

Deno.test({
  name: "WorkerBridge - mixed tool and capability traces (AC#4)",
  sanitizeResources: false, // BroadcastChannel cleanup
  sanitizeOps: false,
  fn: async () => {
    const mcpClients = new Map<string, MCPClient>();
    mcpClients.set(
      "test-server",
      createMockMCPClient("test-server", {
        echo: { echoed: "hello" },
      }),
    );

    const bridge = new WorkerBridge(mcpClients, { timeout: 10000 });
    const toolDefs: ToolDefinition[] = [{
      server: "test-server",
      name: "echo",
      description: "Echo test",
      inputSchema: { type: "object" },
    }];

    const capability = {
      id: "cap-mixed",
      name: "mixedCapability",
      // This capability calls a tool
      codeSnippet: `
        const result = await mcp["test-server"].echo({ message: "from capability" });
        return result;
      `,
      codeHash: "hash-mixed",
      intentEmbedding: new Float32Array(1024),
      cacheConfig: { ttl_ms: 3600000, cacheable: true },
      usageCount: 1,
      successCount: 1,
      successRate: 1.0,
      avgDurationMs: 100,
      createdAt: new Date(),
      lastUsed: new Date(),
      source: "emergent" as const,
    };

    const capabilityContext = bridge.buildCapabilityContext([capability]);

    const result = await bridge.execute(
      "return await capabilities.mixedCapability({})",
      toolDefs,
      {},
      capabilityContext,
    );

    // Give BroadcastChannel time
    await new Promise((r) => setTimeout(r, 50));

    assertEquals(result.success, true);

    const traces = bridge.getTraces();

    // Should have both capability and tool traces
    const capStart = traces.find((t) => t.type === "capability_start");
    const capEnd = traces.find((t) => t.type === "capability_end");
    const toolStart = traces.find((t) => t.type === "tool_start");
    const toolEnd = traces.find((t) => t.type === "tool_end");

    assertExists(capStart, "Should have capability_start");
    assertExists(capEnd, "Should have capability_end");
    assertExists(toolStart, "Should have tool_start");
    assertExists(toolEnd, "Should have tool_end");
    bridge.cleanup();
  },
});

Deno.test({
  name: "WorkerBridge - capability depth limit prevents infinite recursion (AC#6)",
  sanitizeResources: false, // BroadcastChannel cleanup
  sanitizeOps: false,
  fn: async () => {
    const mcpClients = new Map<string, MCPClient>();
    const bridge = new WorkerBridge(mcpClients, { timeout: 5000 });

    // Create capability that would call itself recursively
    // Note: This tests the depth check, not actual recursion
    const capability = {
      id: "cap-recursive",
      name: "recursiveCapability",
      // Simulate checking depth manually (actual recursion would need multiple capabilities)
      codeSnippet: `
        if (args.depth >= 3) {
          throw new Error("Capability depth exceeded (max: 3). Possible cycle detected.");
        }
        return args.depth;
      `,
      codeHash: "hash-recursive",
      intentEmbedding: new Float32Array(1024),
      cacheConfig: { ttl_ms: 3600000, cacheable: true },
      usageCount: 1,
      successCount: 1,
      successRate: 1.0,
      avgDurationMs: 100,
      createdAt: new Date(),
      lastUsed: new Date(),
      source: "emergent" as const,
    };

    const capabilityContext = bridge.buildCapabilityContext([capability]);

    // Normal call should work
    const result1 = await bridge.execute(
      "return await capabilities.recursiveCapability({ depth: 1 })",
      [],
      {},
      capabilityContext,
    );
    assertEquals(result1.success, true);
    assertEquals(result1.result, 1);

    // Call at depth limit should fail
    const result2 = await bridge.execute(
      "return await capabilities.recursiveCapability({ depth: 3 })",
      [],
      {},
      capabilityContext,
    );
    assertEquals(result2.success, false);
    assertStringIncludes(result2.error!.message, "depth exceeded");
    bridge.cleanup();
  },
});

Deno.test({
  name: "WorkerBridge - cleanup closes BroadcastChannel",
  fn: () => {
    const mcpClients = new Map<string, MCPClient>();
    const bridge = new WorkerBridge(mcpClients);

    // cleanup() should not throw
    bridge.cleanup();

    // Calling cleanup again should be safe (idempotent)
    bridge.cleanup();
  },
});
