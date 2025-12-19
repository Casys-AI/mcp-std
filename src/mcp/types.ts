/**
 * MCP Protocol and Server Types
 *
 * @module mcp/types
 */

import type { JsonValue } from "../capabilities/types.ts";

/**
 * MCP Server configuration
 *
 * Supports two modes:
 * - stdio: Local process with command/args
 * - http: Remote server with URL (Smithery format)
 */
export interface MCPServer {
  id: string;
  name: string;
  /** Command for stdio servers */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  protocol: "stdio" | "http";
  /** URL for HTTP servers (Smithery format) */
  url?: string;
  /** HTTP headers for authentication */
  headers?: Record<string, string>;
}

/**
 * Smithery server configuration from registry API
 */
export interface SmitheryServerConfig {
  /** Qualified name from Smithery registry (e.g., "@domdomegg/airtable-mcp-server") */
  qualifiedName: string;
  /** Display name for the server */
  displayName: string;
  /** Whether this is a remote server (always true for Smithery) */
  remote: boolean;
  /** Configuration values from user's Smithery profile */
  config?: Record<string, unknown>;
}

/**
 * Common interface for MCP clients (stdio and HTTP Streamable)
 *
 * Both MCPClient (stdio) and SmitheryMCPClient (HTTP) implement this interface.
 */
export interface MCPClientBase {
  /** Server ID */
  readonly serverId: string;
  /** Server display name */
  readonly serverName: string;
  /** Connect to the server */
  connect(): Promise<void>;
  /** List available tools */
  listTools(): Promise<MCPTool[]>;
  /** Call a tool */
  callTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
  /** Disconnect from the server */
  disconnect(): Promise<void>;
  /** Close the connection (alias for disconnect) */
  close(): Promise<void>;
}

/**
 * Tool schema from MCP list_tools response
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

/**
 * Result of server discovery and schema extraction
 */
export interface ServerDiscoveryResult {
  serverId: string;
  serverName: string;
  status: "success" | "failed" | "timeout";
  toolsExtracted: number;
  tools?: MCPTool[];
  error?: string;
  connectionDuration?: number;
}

/**
 * Configuration loaded from config file
 */
export interface MCPConfig {
  servers: MCPServer[];
}

/**
 * Discovery statistics
 */
export interface DiscoveryStats {
  totalServers: number;
  successfulServers: number;
  failedServers: number;
  totalToolsExtracted: number;
  failures: Map<string, string>;
  duration: number;
}

/**
 * Code execution request (pml:execute_code tool)
 */
export interface CodeExecutionRequest {
  /**
   * TypeScript code to execute in sandbox
   */
  code: string;

  /**
   * Natural language description of task (optional, triggers tool discovery)
   */
  intent?: string;

  /**
   * Custom context/data to inject into sandbox (optional)
   */
  context?: Record<string, unknown>;

  /**
   * Sandbox configuration (timeout, memory, etc.)
   */
  sandbox_config?: {
    timeout?: number;
    memoryLimit?: number;
    allowedReadPaths?: string[];
  };
}

/**
 * Code execution response
 */
export interface CodeExecutionResponse {
  /**
   * Execution result (JSON-serializable)
   */
  result: JsonValue;

  /**
   * Console logs from code execution
   */
  logs: string[];

  /**
   * Execution metrics
   */
  metrics: {
    executionTimeMs: number;
    inputSizeBytes: number;
    outputSizeBytes: number;
  };

  /**
   * Optional state for checkpoint persistence
   */
  state?: Record<string, unknown>;

  /**
   * Matched capabilities from intent search (Story 8.3: capability reuse)
   * Returned when intent parameter is provided
   */
  matched_capabilities?: Array<{
    id: string;
    name: string | null;
    code_snippet: string;
    semantic_score: number;
    success_rate: number;
    usage_count: number;
  }>;

  /**
   * Tool failures during execution (ADR-043)
   * Surfaced even when code "succeeds" due to try/catch handling
   * Helps agent understand partial execution failures
   */
  tool_failures?: Array<{
    tool: string;
    error: string;
  }>;
}
