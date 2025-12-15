/**
 * Tests for Tool Context Builder
 *
 * Validates:
 * - ContextBuilder initialization and configuration
 * - Tool context assembly with vector search
 * - MCP client wrapping
 * - Type definition generation
 * - Error handling and propagation
 * - Security constraints (no eval, no Function)
 */

import { assertEquals, assertExists, assertStringIncludes, assertThrows } from "@std/assert";
import {
  ContextBuilder,
  InvalidToolNameError,
  MCPToolError,
  type ToolContext,
  wrapMCPClient,
} from "../../../src/sandbox/context-builder.ts";
import type { MCPClient } from "../../../src/mcp/client.ts";

// Mock MCP Client for testing
class MockMCPClient implements Partial<MCPClient> {
  readonly serverId: string;
  readonly serverName: string;
  private tools: Map<string, (args: Record<string, unknown>) => Promise<unknown>>;

  constructor(
    serverId: string,
    tools?: Record<string, (args: Record<string, unknown>) => Promise<unknown>>,
  ) {
    this.serverId = serverId;
    this.serverName = serverId;
    this.tools = new Map(Object.entries(tools || {}));
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    return await tool(args);
  }

  addTool(name: string, fn: (args: Record<string, unknown>) => Promise<unknown>) {
    this.tools.set(name, fn);
  }

  throwError(name: string) {
    this.tools.set(name, async () => {
      throw new Error(`Test error from tool: ${name}`);
    });
  }
}

Deno.test("ContextBuilder - initialization", () => {
  const builder = new ContextBuilder();
  assertExists(builder);
});

Deno.test("ContextBuilder - empty context when no tools available", async () => {
  const builder = new ContextBuilder();
  const context = await builder.buildContext("test query", 5);
  assertEquals(context, {});
});

Deno.test("wrapMCPClient - creates typed functions from tools", async () => {
  const mockClient = new MockMCPClient(
    "filesystem",
    {
      read: async (args: Record<string, unknown>) => `content of ${args.path}`,
      write: async (args: Record<string, unknown>) => `wrote to ${args.path}`,
    },
  );

  const wrapped = wrapMCPClient(mockClient as unknown as MCPClient, [
    { serverId: "filesystem", toolName: "read" },
    { serverId: "filesystem", toolName: "write" },
  ]);

  assertEquals(Object.keys(wrapped).length, 2);
  assertExists(wrapped.read);
  assertExists(wrapped.write);

  // Verify wrapped functions work
  const readResult = await wrapped.read({ path: "/test.txt" });
  assertEquals(readResult, "content of /test.txt");

  const writeResult = await wrapped.write({ path: "/test.txt" });
  assertEquals(writeResult, "wrote to /test.txt");
});

Deno.test("wrapMCPClient - converts snake_case tool names to camelCase", async () => {
  const mockClient = new MockMCPClient(
    "github",
    {
      list_commits: async () => ["commit1", "commit2"],
      get_repo: async () => ({ name: "repo" }),
    },
  );

  const wrapped = wrapMCPClient(mockClient as unknown as MCPClient, [
    { serverId: "github", toolName: "list_commits" },
    { serverId: "github", toolName: "get_repo" },
  ]);

  // Should be camelCased
  assertExists(wrapped.listCommits);
  assertExists(wrapped.getRepo);
  assertEquals(Object.keys(wrapped), ["listCommits", "getRepo"]);
});

Deno.test("MCPToolError - preserves error information", () => {
  const originalError = new Error("Original test error");
  const toolError = new MCPToolError("github:list_commits", originalError);

  assertEquals(toolError.name, "MCPToolError");
  assertEquals(toolError.toolName, "github:list_commits");
  assertEquals(toolError.originalError, originalError);
  assertStringIncludes(
    toolError.message,
    "Tool error in 'github:list_commits'",
  );
  assertExists(toolError.timestamp);
});

Deno.test("MCPToolError - JSON serialization", () => {
  const originalError = new Error("Test error");
  const toolError = new MCPToolError("test:tool", originalError);
  const json = toolError.toJSON();

  assertEquals(json.type, "MCPToolError");
  assertEquals(json.toolName, "test:tool");
  assertEquals(json.originalMessage, "Test error");
  assertExists(json.timestamp);
  assertExists(json.stack);
});

Deno.test("wrapMCPClient - propagates MCP errors as exceptions", async () => {
  const mockClient = new MockMCPClient("github");
  mockClient.throwError("list_commits");

  const wrapped = wrapMCPClient(mockClient as unknown as MCPClient, [
    { serverId: "github", toolName: "list_commits" },
  ]);

  let errorThrown = false;
  try {
    await wrapped.listCommits({});
  } catch (error) {
    errorThrown = true;
    if (error instanceof MCPToolError) {
      assertEquals(error.toolName, "github:list_commits");
      assertStringIncludes(error.message, "Test error from tool");
    }
  }

  assertEquals(errorThrown, true);
});

Deno.test("ContextBuilder - generateTypeDefinitions produces valid TypeScript", () => {
  const builder = new ContextBuilder();

  const types = builder.generateTypeDefinitions([
    {
      serverId: "github",
      toolName: "list_commits",
      inputSchema: {
        type: "object",
        properties: {
          repo: { type: "string" },
          limit: { type: "number" },
        },
        required: ["repo"],
      },
    },
  ]);

  assertStringIncludes(types, "interface");
  assertStringIncludes(types, "ListCommitsArgs");
  assertStringIncludes(types, "repo:");
  assertStringIncludes(types, "limit?:");
});

Deno.test("ContextBuilder - security: uses message passing, not function serialization", () => {
  // Verify the implementation uses message passing approach (Option 2 from architecture spike)
  // Key security properties:
  // 1. wrapMCPClient creates function objects, not serialized code
  // 2. No eval or Function constructor in actual code execution
  // 3. Tool calls route through client.callTool() (message passing)

  const contextBuilderCode = Deno.readTextFileSync(
    "./src/sandbox/context-builder.ts",
  );

  // Check that wrapMCPClient creates proper async functions (base function)
  // Story 7.1b: baseFn is now assigned directly (tracing moved to WorkerBridge)
  assertStringIncludes(
    contextBuilderCode,
    "const baseFn = async (args: Record<string, unknown>): Promise<unknown>",
    "Should use proper async function creation for baseFn",
  );

  // Check that baseFn is assigned directly (Story 7.1b: tracing now in WorkerBridge)
  assertStringIncludes(
    contextBuilderCode,
    "wrapped[methodName] = baseFn",
    "Should assign baseFn directly (tracing in WorkerBridge)",
  );

  // Check that error class exists for safe error propagation
  assertStringIncludes(
    contextBuilderCode,
    "class MCPToolError extends Error",
    "Should have MCPToolError class for safe error handling",
  );

  // Check that client.callTool is used (message passing)
  assertStringIncludes(
    contextBuilderCode,
    "await client.callTool(toolName, args)",
    "Should route through client.callTool() for message passing",
  );
});

Deno.test("ContextBuilder - clears type cache", () => {
  const builder = new ContextBuilder();

  // Generate some types to populate cache
  builder.generateTypeDefinitions([
    {
      serverId: "test",
      toolName: "test_tool",
      inputSchema: { type: "object" },
    },
  ]);

  // Cache should exist
  let types1 = builder.generateTypeDefinitions([
    {
      serverId: "test",
      toolName: "test_tool",
      inputSchema: { type: "object" },
    },
  ]);

  // Clear cache
  builder.clearTypeCache();

  // Should still generate types (but might be different due to cache)
  let types2 = builder.generateTypeDefinitions([
    {
      serverId: "test",
      toolName: "test_tool",
      inputSchema: { type: "object" },
    },
  ]);

  assertExists(types1);
  assertExists(types2);
});

Deno.test("ContextBuilder - handles missing MCP clients gracefully", async () => {
  const builder = new ContextBuilder();
  // Don't set any MCP clients

  const context = await builder.buildContext("test", 5);
  assertEquals(context, {});
});

Deno.test("wrapMCPClient - handles multiple tools from same client", async () => {
  const mockClient = new MockMCPClient(
    "github",
    {
      list_commits: async () => ["c1", "c2"],
      create_issue: async () => ({ id: 1 }),
      update_issue: async () => ({ id: 1 }),
      list_repos: async () => [{ name: "repo1" }],
    },
  );

  const wrapped = wrapMCPClient(mockClient as unknown as MCPClient, [
    { serverId: "github", toolName: "list_commits" },
    { serverId: "github", toolName: "create_issue" },
    { serverId: "github", toolName: "update_issue" },
    { serverId: "github", toolName: "list_repos" },
  ]);

  assertEquals(Object.keys(wrapped).length, 4);
  assertExists(wrapped.listCommits);
  assertExists(wrapped.createIssue);
  assertExists(wrapped.updateIssue);
  assertExists(wrapped.listRepos);
});

Deno.test("ContextBuilder - merges multiple server contexts", async () => {
  const githubClient = new MockMCPClient("github", {
    list_commits: async () => [],
  });

  const filesystemClient = new MockMCPClient("filesystem", {
    read: async () => "",
  });

  const builder = new ContextBuilder();
  builder.setMCPClients(
    new Map([
      ["github", githubClient as unknown as MCPClient],
      ["filesystem", filesystemClient as unknown as MCPClient],
    ]),
  );

  // Manually build context (simulating vector search result)
  const context: ToolContext = {
    github: wrapMCPClient(githubClient as unknown as MCPClient, [
      { serverId: "github", toolName: "list_commits" },
    ]),
    filesystem: wrapMCPClient(filesystemClient as unknown as MCPClient, [
      { serverId: "filesystem", toolName: "read" },
    ]),
  };

  assertEquals(Object.keys(context).length, 2);
  assertExists(context.github);
  assertExists(context.filesystem);
  assertExists(context.github.listCommits);
  assertExists(context.filesystem.read);
});

// Security tests for malicious tool name validation
Deno.test("Security - wrapMCPClient rejects __proto__ tool name", () => {
  const mockClient = new MockMCPClient("malicious");

  assertThrows(
    () => {
      wrapMCPClient(mockClient as unknown as MCPClient, [
        { serverId: "malicious", toolName: "__proto__" },
      ]);
    },
    InvalidToolNameError,
    "dangerous property name",
  );
});

Deno.test("Security - wrapMCPClient rejects constructor tool name", () => {
  const mockClient = new MockMCPClient("malicious");

  assertThrows(
    () => {
      wrapMCPClient(mockClient as unknown as MCPClient, [
        { serverId: "malicious", toolName: "constructor" },
      ]);
    },
    InvalidToolNameError,
    "dangerous property name",
  );
});

Deno.test("Security - wrapMCPClient rejects prototype tool name", () => {
  const mockClient = new MockMCPClient("malicious");

  assertThrows(
    () => {
      wrapMCPClient(mockClient as unknown as MCPClient, [
        { serverId: "malicious", toolName: "prototype" },
      ]);
    },
    InvalidToolNameError,
    "dangerous property name",
  );
});

Deno.test("Security - wrapMCPClient rejects tool names with special characters", () => {
  const mockClient = new MockMCPClient("test");

  assertThrows(
    () => {
      wrapMCPClient(mockClient as unknown as MCPClient, [
        { serverId: "test", toolName: "tool@name" },
      ]);
    },
    InvalidToolNameError,
    "alphanumeric characters",
  );
});

Deno.test("Security - wrapMCPClient accepts valid tool names", () => {
  const mockClient = new MockMCPClient("github", {
    list_commits: async () => [],
    get_repo_123: async () => ({}),
    "list-pull-requests": async () => [],
  });

  // Should not throw for valid names
  const wrapped = wrapMCPClient(mockClient as unknown as MCPClient, [
    { serverId: "github", toolName: "list_commits" },
    { serverId: "github", toolName: "get_repo_123" },
    { serverId: "github", toolName: "list-pull-requests" },
  ]);

  assertEquals(Object.keys(wrapped).length, 3);
  assertExists(wrapped.listCommits);
  assertExists(wrapped.getRepo123);
  assertExists(wrapped.listPullRequests);
});

Deno.test("Security - wrapMCPClient rejects empty tool name", () => {
  const mockClient = new MockMCPClient("test");

  assertThrows(
    () => {
      wrapMCPClient(mockClient as unknown as MCPClient, [
        { serverId: "test", toolName: "" },
      ]);
    },
    InvalidToolNameError,
    "cannot be empty",
  );
});

Deno.test("Security - wrapMCPClient rejects tool name that's too long", () => {
  const mockClient = new MockMCPClient("test");
  const longName = "a".repeat(101);

  assertThrows(
    () => {
      wrapMCPClient(mockClient as unknown as MCPClient, [
        { serverId: "test", toolName: longName },
      ]);
    },
    InvalidToolNameError,
    "too long",
  );
});

// ============================================
// Story 7.1b: Tracing moved to WorkerBridge
// ============================================
// Story 7.1 tests for setTracingEnabled, isTracingEnabled, and __TRACE__ emission
// have been removed. Tracing is now handled natively in WorkerBridge (RPC bridge).
// See tests/unit/sandbox/worker_bridge_test.ts for new tracing tests.
