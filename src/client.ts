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
import type {
  MCPClientBase,
  MCPTool,
  MCPToolWireFormat,
  MiniTool,
} from "./tools/types.ts";

// Re-export from tools
export {
  allTools,
  getCategories,
  getToolByName,
  getToolsByCategory,
  toolsByCategory,
};
export type { MiniTool };
export type {
  MCPClientBase,
  MCPTool,
  MCPToolMeta,
  MCPToolWireFormat,
  McpUiToolMeta,
  MiniToolHandler,
  MiniToolResult,
  ToolCategory,
} from "./tools/types.ts";

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
    if (options?.categories !== undefined) {
      const categories = [
        ...new Set(
          options.categories.map((category) => category.trim()).filter(Boolean),
        ),
      ];
      const availableCategories = getCategories();
      const availableCategorySet = new Set(availableCategories);
      const unknownCategories = categories.filter((category) =>
        !availableCategorySet.has(category)
      );

      if (unknownCategories.length > 0) {
        throw new RangeError(
          `Unknown categories: ${unknownCategories.join(", ")}. ` +
            `Available categories: ${availableCategories.join(", ")}`,
        );
      }

      const selectedTools = categories.flatMap((category) =>
        getToolsByCategory(category)
      );
      this.tools = [...new Map(
        selectedTools.map((tool) => [tool.name, tool]),
      ).values()];
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
   * Convert tools to MCP format (includes _meta for MCP Apps UI support)
   */
  toMCPFormat(): MCPToolWireFormat[] {
    return this.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      ...(t._meta && { _meta: t._meta }),
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
// MCP Client Implementation
// ============================================================================

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

  connect(): Promise<void> {
    this.connected = true;
    return Promise.resolve();
  }

  listTools(): Promise<MCPTool[]> {
    return Promise.resolve(this.client.toMCPFormat());
  }

  callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.connected) {
      return Promise.reject(new Error("Client not connected"));
    }
    return this.client.execute(name, args);
  }

  disconnect(): Promise<void> {
    this.connected = false;
    return Promise.resolve();
  }

  getClient(): MiniToolsClient {
    return this.client;
  }
}

/** Default MiniToolsMCP instance */
export const miniToolsMCP: MiniToolsMCP = new MiniToolsMCP();
