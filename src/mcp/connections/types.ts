/**
 * Connection Types
 *
 * Types for MCP server connections and pooling.
 *
 * @module mcp/connections/types
 */

import type { MCPClientBase } from "../types.ts";

/**
 * Connection status
 */
export type ConnectionStatus = "connected" | "disconnected" | "connecting" | "error";

/**
 * Connection metadata
 */
export interface ConnectionInfo {
  serverId: string;
  status: ConnectionStatus;
  connectedAt: Date | null;
  lastActivityAt: Date | null;
  errorMessage?: string;
}

/**
 * Connection pool configuration
 */
export interface PoolConfig {
  maxConnections?: number;
  idleTimeout?: number;
  connectionTimeout?: number;
}

/**
 * Client with metadata
 */
export interface ManagedClient {
  client: MCPClientBase;
  info: ConnectionInfo;
}
