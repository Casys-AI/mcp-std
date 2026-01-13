/**
 * MiniTools Client
 *
 * Client for executing mini-tools with MCP interface support.
 *
 * @module lib/std/src/client
 */

import {
  allTools,
  getCategories,
  getToolByName,
  getToolsByCategory,
  toolsByCategory,
} from "./tools/mod.ts";
import type { MiniTool } from "./tools/types.ts";

// Re-export from tools
export {
  allTools,
  getCategories,
  getToolByName,
  getToolsByCategory,
  toolsByCategory,
};
export type { MiniTool };
export type { MiniToolHandler, MiniToolResult, ToolCategory } from "./tools/types.ts";

// ============================================================================
// MiniToolsClient Class
// ============================================================================

export interface MiniToolsClientOptions {
  categories?: string[];
}

/**
 * Client for executing mini-tools
 */
export class MiniToolsClient {
  private tools: MiniTool[];

  constructor(options?: MiniToolsClientOptions) {
    if (options?.categories) {
      this.tools = options.categories.flatMap((cat) => getToolsByCategory(cat));
    } else {
      this.tools = allTools;
    }
  }

  /**
   * List available tools
   */
  listTools(): MiniTool[] {
    return this.tools;
  }

  /**
   * Convert tools to MCP format
   */
  toMCPFormat(): Array<
    { name: string; description: string; inputSchema: Record<string, unknown> }
  > {
    return this.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  /**
   * Execute a tool by name
   */
  async execute(name: string, args: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools.find((t) => t.name === name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    return await tool.handler(args);
  }

  /**
   * Get tool count
   */
  get count(): number {
    return this.tools.length;
  }
}

/** Default client instance with all tools */
export const defaultClient: MiniToolsClient = new MiniToolsClient();

// ============================================================================
// Legacy Types (for backward compatibility)
// ============================================================================

/** MCP Tool definition */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** MCP Client interface */
export interface MCPClientBase {
  readonly serverId: string;
  readonly serverName: string;
  connect(): Promise<void>;
  listTools(): Promise<MCPTool[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  disconnect(): Promise<void>;
}

/**
 * MiniTools MCP Client - Implements MCPClientBase interface
 */
export class MiniToolsMCP implements MCPClientBase {
  readonly serverId = "mini-tools";
  readonly serverName = "MiniTools";

  private client: MiniToolsClient;
  private connected = false;

  constructor() {
    this.client = new MiniToolsClient();
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async listTools(): Promise<MCPTool[]> {
    return this.client.toMCPFormat();
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.connected) {
      throw new Error("Client not connected");
    }
    return this.client.execute(name, args);
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  getClient(): MiniToolsClient {
    return this.client;
  }
}

/** Default MiniToolsMCP instance */
export const miniToolsMCP: MiniToolsMCP = new MiniToolsMCP();
