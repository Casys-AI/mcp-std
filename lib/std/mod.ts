/**
 * Std (Standard Library) Tools
 *
 * A collection of lightweight, sandboxed tools for AI agents.
 * Organized by category for modular use.
 *
 * @module lib/std
 */

// Re-export all tool modules
export { textTools } from "./text.ts";
export { jsonTools } from "./json.ts";
export { mathTools } from "./math.ts";
export { datetimeTools } from "./datetime.ts";
export { cryptoTools } from "./crypto.ts";
export { collectionsTools } from "./collections.ts";
export { vfsTools } from "./vfs.ts";
export { dataTools } from "./data.ts";
export { httpTools } from "./http.ts";
export { validationTools } from "./validation.ts";
export { formatTools } from "./format.ts";
export { transformTools } from "./transform.ts";
export { stateTools } from "./state.ts";
export { compareTools } from "./compare.ts";
export { algoTools } from "./algo.ts";
export { colorTools } from "./color.ts";
export { networkTools } from "./network.ts";
export { utilTools } from "./util.ts";

// Re-export types
export type { MiniTool, MiniToolHandler, MiniToolResult } from "./types.ts";

// Import all tools for aggregation
import { textTools } from "./text.ts";
import { jsonTools } from "./json.ts";
import { mathTools } from "./math.ts";
import { datetimeTools } from "./datetime.ts";
import { cryptoTools } from "./crypto.ts";
import { collectionsTools } from "./collections.ts";
import { vfsTools } from "./vfs.ts";
import { dataTools } from "./data.ts";
import { httpTools } from "./http.ts";
import { validationTools } from "./validation.ts";
import { formatTools } from "./format.ts";
import { transformTools } from "./transform.ts";
import { stateTools } from "./state.ts";
import { compareTools } from "./compare.ts";
import { algoTools } from "./algo.ts";
import { colorTools } from "./color.ts";
import { networkTools } from "./network.ts";
import { utilTools } from "./util.ts";
import type { MiniTool, MiniToolResult } from "./types.ts";

/**
 * All available mini tools combined
 */
export const allTools: MiniTool[] = [
  ...textTools,
  ...jsonTools,
  ...mathTools,
  ...datetimeTools,
  ...cryptoTools,
  ...collectionsTools,
  ...vfsTools,
  ...dataTools,
  ...httpTools,
  ...validationTools,
  ...formatTools,
  ...transformTools,
  ...stateTools,
  ...compareTools,
  ...algoTools,
  ...colorTools,
  ...networkTools,
  ...utilTools,
];

/**
 * Tool categories and their tools
 */
export const toolsByCategory: Record<string, MiniTool[]> = {
  text: textTools,
  json: jsonTools,
  math: mathTools,
  datetime: datetimeTools,
  crypto: cryptoTools,
  collections: collectionsTools,
  vfs: vfsTools,
  data: dataTools,
  http: httpTools,
  validation: validationTools,
  format: formatTools,
  transform: transformTools,
  state: stateTools,
  compare: compareTools,
  algo: algoTools,
  color: colorTools,
  network: networkTools,
  util: utilTools,
};

/**
 * Get tools by category
 */
export function getToolsByCategory(category: string): MiniTool[] {
  return toolsByCategory[category] || [];
}

/**
 * Get tool by name
 */
export function getToolByName(name: string): MiniTool | undefined {
  return allTools.find((t) => t.name === name);
}

/**
 * List all available categories
 */
export function getCategories(): string[] {
  return Object.keys(toolsByCategory);
}

/**
 * MiniToolsClient - A simple client for executing mini tools
 *
 * @example
 * ```typescript
 * const client = new MiniToolsClient();
 *
 * // Execute a tool
 * const result = await client.execute("text_upper", { text: "hello" });
 * console.log(result); // "HELLO"
 *
 * // List available tools
 * const tools = client.listTools();
 *
 * // Get tools by category
 * const textTools = client.getToolsByCategory("text");
 * ```
 */
export class MiniToolsClient {
  private tools: Map<string, MiniTool>;
  private enabledCategories: Set<string> | null;

  /**
   * Create a new MiniToolsClient
   *
   * @param options - Configuration options
   * @param options.categories - Limit to specific categories (null = all)
   * @param options.customTools - Additional custom tools to include
   */
  constructor(options?: {
    categories?: string[];
    customTools?: MiniTool[];
  }) {
    this.tools = new Map();
    this.enabledCategories = options?.categories ? new Set(options.categories) : null;

    // Load all tools, optionally filtered by category
    for (const tool of allTools) {
      if (!this.enabledCategories || this.enabledCategories.has(tool.category)) {
        this.tools.set(tool.name, tool);
      }
    }

    // Add custom tools if provided
    if (options?.customTools) {
      for (const tool of options.customTools) {
        this.tools.set(tool.name, tool);
      }
    }
  }

  /**
   * Execute a tool by name
   *
   * @param name - Tool name
   * @param input - Tool input parameters
   * @returns Tool execution result
   */
  async execute(name: string, input: Record<string, unknown> = {}): Promise<MiniToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { error: `Tool not found: ${name}` };
    }

    try {
      const result = await tool.handler(input);
      return result;
    } catch (error) {
      return { error: (error as Error).message };
    }
  }

  /**
   * List all available tools
   *
   * @returns Array of tool definitions (without handlers)
   */
  listTools(): Array<Omit<MiniTool, "handler">> {
    return Array.from(this.tools.values()).map(({ handler: _, ...tool }) => tool);
  }

  /**
   * Get tool definition by name
   *
   * @param name - Tool name
   * @returns Tool definition or undefined
   */
  getTool(name: string): MiniTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all tools in a category
   *
   * @param category - Category name
   * @returns Array of tools in the category
   */
  getToolsByCategory(category: string): MiniTool[] {
    return Array.from(this.tools.values()).filter((t) => t.category === category);
  }

  /**
   * Get available categories
   *
   * @returns Array of category names
   */
  getCategories(): string[] {
    const categories = new Set<string>();
    for (const tool of this.tools.values()) {
      categories.add(tool.category);
    }
    return Array.from(categories);
  }

  /**
   * Check if a tool exists
   *
   * @param name - Tool name
   * @returns true if tool exists
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Add a custom tool at runtime
   *
   * @param tool - Tool to add
   */
  addTool(tool: MiniTool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Remove a tool by name
   *
   * @param name - Tool name to remove
   * @returns true if tool was removed
   */
  removeTool(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Get tool count
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * Convert tools to MCP-compatible format
   *
   * @returns Array of MCP tool definitions
   */
  toMCPFormat(): Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }> {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }
}

/**
 * Default client instance with all tools enabled
 */
export const defaultClient = new MiniToolsClient();
