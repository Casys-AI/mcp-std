/**
 * Connection Pool
 *
 * Connection pooling for MCP servers.
 *
 * @module mcp/connections/pool
 */

import * as log from "@std/log";
import type { MCPClientBase } from "../types.ts";
import type { PoolConfig } from "./types.ts";
import { ConnectionManager } from "./manager.ts";

/**
 * Default pool configuration
 */
const DEFAULT_POOL_CONFIG: Required<PoolConfig> = {
  maxConnections: 50,
  idleTimeout: 300000, // 5 minutes
  connectionTimeout: 30000, // 30 seconds
};

/**
 * Connection Pool
 *
 * Manages a pool of MCP connections with:
 * - Idle connection timeout
 * - Maximum connection limits
 * - Connection reuse
 */
export class ConnectionPool {
  private manager: ConnectionManager;
  private config: Required<PoolConfig>;
  private idleTimers: Map<string, number> = new Map();

  constructor(config?: PoolConfig) {
    this.manager = new ConnectionManager();
    this.config = { ...DEFAULT_POOL_CONFIG, ...config };
  }

  /**
   * Get or create a connection
   */
  async acquire(serverId: string, factory: () => Promise<MCPClientBase>): Promise<MCPClientBase> {
    // Check existing connection
    let client = this.manager.get(serverId);
    if (client) {
      this.resetIdleTimer(serverId);
      return client;
    }

    // Check pool limit
    if (this.manager.size >= this.config.maxConnections) {
      throw new Error(`Connection pool exhausted (max: ${this.config.maxConnections})`);
    }

    // Create new connection
    log.debug(`Creating new connection: ${serverId}`);
    client = await factory();
    this.manager.register(serverId, client);
    this.startIdleTimer(serverId);

    return client;
  }

  /**
   * Release a connection back to pool
   */
  release(serverId: string): void {
    this.resetIdleTimer(serverId);
  }

  /**
   * Start idle timer for a connection
   */
  private startIdleTimer(serverId: string): void {
    const timer = setTimeout(() => {
      log.debug(`Connection ${serverId} idle timeout, disconnecting`);
      this.manager.disconnect(serverId);
      this.idleTimers.delete(serverId);
    }, this.config.idleTimeout);
    this.idleTimers.set(serverId, timer);
  }

  /**
   * Reset idle timer
   */
  private resetIdleTimer(serverId: string): void {
    const existing = this.idleTimers.get(serverId);
    if (existing) {
      clearTimeout(existing);
    }
    this.startIdleTimer(serverId);
  }

  /**
   * Close all connections and stop timers
   */
  async close(): Promise<void> {
    for (const timer of this.idleTimers.values()) {
      clearTimeout(timer);
    }
    this.idleTimers.clear();
    await this.manager.disconnectAll();
  }

  /**
   * Get underlying manager
   */
  getManager(): ConnectionManager {
    return this.manager;
  }
}
