/**
 * Connection Manager
 *
 * Manages MCP server connection lifecycle.
 *
 * @module mcp/connections/manager
 */

import * as log from "@std/log";
import type { MCPClientBase } from "../types.ts";
import type { ConnectionInfo, ConnectionStatus, ManagedClient } from "./types.ts";

/**
 * Connection Manager
 *
 * Handles connection lifecycle for MCP clients:
 * - Connection establishment
 * - Disconnection
 * - Status tracking
 * - Error handling
 */
export class ConnectionManager {
  private connections: Map<string, ManagedClient> = new Map();

  /**
   * Register a client
   */
  register(serverId: string, client: MCPClientBase): void {
    const info: ConnectionInfo = {
      serverId,
      status: "connected",
      connectedAt: new Date(),
      lastActivityAt: new Date(),
    };
    this.connections.set(serverId, { client, info });
    log.debug(`Registered connection: ${serverId}`);
  }

  /**
   * Get a client by server ID
   */
  get(serverId: string): MCPClientBase | undefined {
    return this.connections.get(serverId)?.client;
  }

  /**
   * Get connection info
   */
  getInfo(serverId: string): ConnectionInfo | undefined {
    return this.connections.get(serverId)?.info;
  }

  /**
   * Update connection status
   */
  updateStatus(serverId: string, status: ConnectionStatus, error?: string): void {
    const managed = this.connections.get(serverId);
    if (managed) {
      managed.info.status = status;
      managed.info.lastActivityAt = new Date();
      if (error) {
        managed.info.errorMessage = error;
      }
    }
  }

  /**
   * Disconnect a client
   */
  async disconnect(serverId: string): Promise<void> {
    const managed = this.connections.get(serverId);
    if (managed) {
      try {
        await managed.client.disconnect();
        this.updateStatus(serverId, "disconnected");
        log.debug(`Disconnected: ${serverId}`);
      } catch (error) {
        this.updateStatus(serverId, "error", String(error));
        log.error(`Error disconnecting ${serverId}: ${error}`);
      }
    }
  }

  /**
   * Disconnect all clients
   */
  async disconnectAll(): Promise<void> {
    for (const serverId of this.connections.keys()) {
      await this.disconnect(serverId);
    }
  }

  /**
   * Get all server IDs
   */
  getServerIds(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Get all clients as Map (for backward compatibility)
   */
  getClientsMap(): Map<string, MCPClientBase> {
    const map = new Map<string, MCPClientBase>();
    for (const [id, managed] of this.connections) {
      map.set(id, managed.client);
    }
    return map;
  }

  /**
   * Get connection count
   */
  get size(): number {
    return this.connections.size;
  }
}
