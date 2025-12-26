/**
 * Capability MCP Server Interfaces
 *
 * Story 13.3: CapabilityMCPServer + Gateway
 *
 * Interface-first design following project-context.md patterns.
 * These interfaces define the contract for capability-as-MCP-tool functionality.
 *
 * @module mcp/capability-server/interfaces
 */

import type { MCPTool } from "../types.ts";

/**
 * Result of capability execution
 */
export interface ExecuteResult {
  /** Whether execution succeeded */
  success: boolean;
  /** Result data (JSON-serializable) */
  data: unknown;
  /** Error message if failed */
  error?: string;
  /** Execution time in milliseconds */
  latencyMs: number;
}

/**
 * Capability lister interface
 *
 * Lists all capabilities as MCP tools with proper formatting.
 */
export interface CapabilityLister {
  /**
   * List all capabilities as MCP tools
   *
   * Converts capabilities to MCP tool format:
   * - name: `mcp__<namespace>__<action>`
   * - inputSchema: from capability's parameters_schema
   *
   * @returns List of MCP tools representing capabilities
   */
  listTools(): Promise<MCPTool[]>;
}

/**
 * Capability executor interface
 *
 * Executes capabilities by their MCP tool name.
 */
export interface CapabilityExecutor {
  /**
   * Execute a capability by MCP tool name
   *
   * @param toolName - MCP tool name (e.g., `mcp__code__analyze`)
   * @param args - Tool arguments
   * @returns Execution result with success/error and latency
   */
  execute(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<ExecuteResult>;
}

/**
 * Parsed tool name components
 */
export interface ParsedToolName {
  /** Namespace part (e.g., "code") */
  namespace: string;
  /** Action part (e.g., "analyze") */
  action: string;
}

/**
 * Parse an MCP tool name into namespace and action
 *
 * Format: `mcp__<namespace>__<action>`
 *
 * @param name - The full MCP tool name
 * @returns Parsed components or null if invalid format
 *
 * @example
 * ```typescript
 * parseToolName("mcp__code__analyze")
 * // => { namespace: "code", action: "analyze" }
 *
 * parseToolName("invalid_format")
 * // => null
 * ```
 */
export function parseToolName(name: string): ParsedToolName | null {
  const match = name.match(/^mcp__([a-z0-9_]+)__([a-z0-9_]+)$/);
  if (!match) return null;
  return { namespace: match[1], action: match[2] };
}

/**
 * Generate MCP tool name from namespace and action
 *
 * @param namespace - Namespace grouping
 * @param action - Action name
 * @returns Formatted MCP tool name
 *
 * @example
 * ```typescript
 * toMCPToolName("code", "analyze")
 * // => "mcp__code__analyze"
 * ```
 */
export function toMCPToolName(namespace: string, action: string): string {
  return `mcp__${namespace}__${action}`;
}
