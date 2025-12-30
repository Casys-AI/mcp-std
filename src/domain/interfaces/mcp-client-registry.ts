/**
 * MCP Client Registry Interface
 *
 * Defines the contract for MCP client management.
 * Uses MCPClientBase from mcp/types.ts as the client type.
 *
 * Phase 2.1: Foundation for DI with diod
 *
 * @module domain/interfaces/mcp-client-registry
 */

import type { MCPClientBase, MCPTool } from "../../mcp/types.ts";

// Re-export for consumers
export type { MCPClientBase, MCPTool };

/**
 * Client registration options
 */
export interface ClientRegistrationOptions {
  /** Override existing client with same ID */
  override?: boolean;
  /** Auto-connect after registration */
  autoConnect?: boolean;
}

/**
 * Interface for MCP client registry
 *
 * This interface abstracts the management of MCP server
 * connections, allowing for different connection strategies
 * and easy mocking in tests.
 */
export interface IMCPClientRegistry {
  /**
   * Get a client by server ID
   */
  getClient(serverId: string): MCPClientBase | undefined;

  /**
   * Get all registered clients
   */
  getAllClients(): MCPClientBase[];

  /**
   * Get all connected client IDs
   */
  getConnectedClientIds(): string[];

  /**
   * Register a new client
   */
  register(
    serverId: string,
    client: MCPClientBase,
    options?: ClientRegistrationOptions,
  ): void;

  /**
   * Unregister a client
   */
  unregister(serverId: string): void;

  /**
   * Check if a client is registered
   */
  has(serverId: string): boolean;

  /**
   * Get total number of registered clients
   */
  size(): number;

  /**
   * Get all available tools across all clients
   */
  getAllTools(): MCPTool[];

  /**
   * Find which client provides a specific tool
   */
  findToolProvider(toolName: string): MCPClientBase | undefined;

  /**
   * Call a tool on any connected client
   */
  callTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown>;
}
