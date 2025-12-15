/**
 * Mock MCP Server for E2E Testing
 *
 * Programmable in-memory MCP server for E2E tests.
 * Tracks tool calls, simulates delays, and provides flexible tool handlers.
 */

export type ToolArgs = Record<string, unknown>;
export type ToolResult = unknown;

export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface MockTool {
  name: string;
  handler: (args: ToolArgs) => ToolResult | Promise<ToolResult>;
  delay: number;
  description?: string;
  inputSchema?: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * MockMCPServer - In-memory MCP server for programmatic testing
 *
 * Usage:
 * ```ts
 * const server = new MockMCPServer("test-server");
 * server.addTool("read", (args) => ({ content: "test" }));
 * const tools = await server.listTools();
 * const result = await server.callTool("read", { path: "/test" });
 * ```
 */
export class MockMCPServer {
  private tools = new Map<string, MockTool>();
  private callCount = new Map<string, number>();
  private callHistory: Array<{ tool: string; args: ToolArgs; timestamp: number }> = [];

  constructor(public serverId: string) {}

  /**
   * Add a tool to this mock server
   *
   * @param name - Tool name
   * @param handler - Function to handle tool execution
   * @param delay - Simulated execution delay in milliseconds (default: 0)
   * @param description - Tool description for schema
   */
  addTool(
    name: string,
    handler: (args: ToolArgs) => ToolResult | Promise<ToolResult>,
    delay: number = 0,
    description?: string,
  ): void {
    this.tools.set(name, {
      name,
      handler,
      delay,
      description: description || `Mock tool ${name}`,
      inputSchema: {
        type: "object",
        properties: {
          input: { type: "string" },
        },
      },
    });
  }

  /**
   * List all available tools (implements MCP tools/list)
   */
  listTools(): Promise<ToolSchema[]> {
    return Promise.resolve(
      Array.from(this.tools.values()).map((tool) => ({
        name: tool.name,
        description: tool.description || `Mock tool ${tool.name}`,
        inputSchema: tool.inputSchema || {
          type: "object",
          properties: {
            input: { type: "string" },
          },
        },
      })),
    );
  }

  /**
   * Call a tool with given arguments (implements MCP tools/call)
   *
   * @param name - Tool name
   * @param args - Tool arguments
   * @returns Tool execution result
   * @throws Error if tool not found
   */
  async callTool(name: string, args: ToolArgs): Promise<ToolResult> {
    const tool = this.tools.get(name);

    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    // Track call count
    this.callCount.set(name, (this.callCount.get(name) || 0) + 1);

    // Track call history
    this.callHistory.push({
      tool: name,
      args,
      timestamp: Date.now(),
    });

    // Simulate delay
    if (tool.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, tool.delay));
    }

    // Execute handler
    return await tool.handler(args);
  }

  /**
   * Get number of times a tool was called
   */
  getCallCount(toolName: string): number {
    return this.callCount.get(toolName) || 0;
  }

  /**
   * Get total number of tool calls across all tools
   */
  getTotalCallCount(): number {
    return Array.from(this.callCount.values()).reduce((sum, count) => sum + count, 0);
  }

  /**
   * Get call history for all tools
   */
  getCallHistory(): Array<{ tool: string; args: ToolArgs; timestamp: number }> {
    return [...this.callHistory];
  }

  /**
   * Reset all call tracking
   */
  reset(): void {
    this.callCount.clear();
    this.callHistory = [];
  }

  /**
   * Remove a tool from the server
   */
  removeTool(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Check if a tool exists
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get number of registered tools
   */
  getToolCount(): number {
    return this.tools.size;
  }
}

/**
 * Create a mock filesystem server with common tools
 */
export function createMockFilesystemServer(): MockMCPServer {
  const server = new MockMCPServer("filesystem");

  server.addTool(
    "read",
    (args: ToolArgs) => ({
      content: `mock content from ${args.path as string}`,
      size: 42,
    }),
    10,
    "Read a file from the filesystem",
  );

  server.addTool(
    "write",
    (args: ToolArgs) => ({
      success: true,
      path: args.path as string,
      bytesWritten: (args.content as string).length,
    }),
    15,
    "Write content to a file",
  );

  server.addTool(
    "list",
    (_args: ToolArgs) => ({
      files: ["file1.txt", "file2.json", "dir1/"],
      count: 3,
    }),
    5,
    "List directory contents",
  );

  return server;
}

/**
 * Create a mock JSON server with parsing tools
 */
export function createMockJsonServer(): MockMCPServer {
  const server = new MockMCPServer("json");

  server.addTool(
    "parse",
    (args: ToolArgs) => {
      try {
        return { data: JSON.parse(args.json as string), success: true };
      } catch (error) {
        throw new Error(`Invalid JSON: ${(error as Error).message}`);
      }
    },
    5,
    "Parse JSON string",
  );

  server.addTool(
    "stringify",
    (args: ToolArgs) => ({
      json: JSON.stringify(args.obj),
      success: true,
    }),
    5,
    "Stringify object to JSON",
  );

  return server;
}

/**
 * Create a mock API server with HTTP-like tools
 */
export function createMockApiServer(): MockMCPServer {
  const server = new MockMCPServer("api");

  server.addTool(
    "get",
    (args: ToolArgs) => ({
      status: 200,
      data: { message: "mock response" },
      url: args.url as string,
    }),
    50,
    "Perform GET request",
  );

  server.addTool(
    "post",
    (args: ToolArgs) => ({
      status: 201,
      data: { id: "mock-id", ...(args.body as Record<string, unknown>) },
      url: args.url as string,
    }),
    75,
    "Perform POST request",
  );

  return server;
}
