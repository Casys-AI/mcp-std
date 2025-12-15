/**
 * Health Check Service for MCP Servers
 *
 * Monitors MCP server health with periodic checks and retry logic
 *
 * @module health/health-checker
 */

import * as log from "@std/log";
import type { MCPClientBase } from "../mcp/types.ts";

export type HealthStatus = "healthy" | "degraded" | "down";

export interface ServerHealth {
  serverId: string;
  serverName: string;
  status: HealthStatus;
  lastCheck: Date;
  lastSuccess: Date | null;
  consecutiveFailures: number;
  latencyMs: number | null;
  errorMessage: string | null;
}

/**
 * Health checker for MCP servers
 *
 * Features:
 * - Initial health check at startup
 * - Periodic health checks (every 5 minutes)
 * - Automatic retry logic (3 attempts)
 * - Health status tracking
 */
export class HealthChecker {
  private healthMap = new Map<string, ServerHealth>();
  private checkInterval: number | null = null;
  private readonly CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 1000;
  private readonly DEGRADED_LATENCY_THRESHOLD = 1000; // 1 second

  constructor(private mcpClients: Map<string, MCPClientBase>) {}

  /**
   * Perform initial health check at startup
   */
  async initialHealthCheck(): Promise<void> {
    console.error("🏥 Performing initial health check...\n");

    // Check all servers in parallel for faster startup
    const checks = Array.from(this.mcpClients.entries()).map(
      async ([serverId, client]) => {
        const health = await this.checkServer(serverId, client);
        this.healthMap.set(serverId, health);
        return health;
      },
    );

    const results = await Promise.all(checks);

    // Log results
    for (const health of results) {
      const icon = this.getStatusIcon(health.status);
      console.error(
        `${icon} ${health.serverName} (${health.serverId}): ${health.status}`,
      );

      if (health.errorMessage) {
        console.error(`   └─ ${health.errorMessage}`);
      }

      // Structured logging
      log.info("Health check completed", {
        server_id: health.serverId,
        server_name: health.serverName,
        status: health.status,
        last_check: health.lastCheck.toISOString(),
        latency_ms: health.latencyMs,
        error: health.errorMessage,
      });
    }

    const summary = this.getHealthSummary();
    console.error(`\n📊 Health summary: ${summary.healthy}/${summary.total} servers healthy\n`);

    if (summary.down > 0) {
      console.warn(
        `⚠️  Warning: ${summary.down} server(s) are down. Some tools may be unavailable.`,
      );
    }
  }

  /**
   * Start periodic health checks
   */
  startPeriodicChecks(): void {
    console.error("🔄 Starting periodic health checks (every 5 minutes)");

    this.checkInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.CHECK_INTERVAL_MS);
  }

  /**
   * Stop periodic health checks
   */
  stopPeriodicChecks(): void {
    if (this.checkInterval !== null) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Perform health check on all servers
   */
  private async performHealthCheck(): Promise<void> {
    log.debug("Running scheduled health check...");

    for (const [serverId, client] of this.mcpClients) {
      const previousHealth = this.healthMap.get(serverId);
      const health = await this.checkServer(serverId, client);

      // Detect status change
      if (previousHealth && previousHealth.status !== health.status) {
        this.logStatusChange(previousHealth, health);
      }

      this.healthMap.set(serverId, health);
    }

    const summary = this.getHealthSummary();
    log.info("Health check complete", {
      healthy: summary.healthy,
      degraded: summary.degraded,
      down: summary.down,
      total: summary.total,
    });
  }

  /**
   * Check individual server with retries
   */
  private async checkServer(
    serverId: string,
    client: MCPClientBase,
  ): Promise<ServerHealth> {
    const serverName = client.serverName || serverId;
    let consecutiveFailures = 0;
    let lastError: string | null = null;
    let retriesNeeded = 0;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const startTime = performance.now();

        // Ping server (list_tools is a good health check)
        await client.listTools();

        const latency = performance.now() - startTime;

        // Determine status based on latency and retries needed
        let status: HealthStatus = "healthy";
        if (latency > this.DEGRADED_LATENCY_THRESHOLD || retriesNeeded > 0) {
          status = "degraded";
        }

        return {
          serverId,
          serverName,
          status,
          lastCheck: new Date(),
          lastSuccess: new Date(),
          consecutiveFailures: 0,
          latencyMs: latency,
          errorMessage: null,
        };
      } catch (error) {
        consecutiveFailures++;
        retriesNeeded = attempt;
        lastError = error instanceof Error ? error.message : String(error);

        // Retry with exponential backoff
        if (attempt < this.MAX_RETRIES) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.RETRY_DELAY_MS * Math.pow(2, attempt - 1))
          );
        }
      }
    }

    // All retries failed
    const previousHealth = this.healthMap.get(serverId);

    return {
      serverId,
      serverName,
      status: "down",
      lastCheck: new Date(),
      lastSuccess: previousHealth?.lastSuccess || null,
      consecutiveFailures: (previousHealth?.consecutiveFailures || 0) + 1,
      latencyMs: null,
      errorMessage: lastError,
    };
  }

  /**
   * Get health status for a specific server
   */
  getServerHealth(serverId: string): ServerHealth | undefined {
    return this.healthMap.get(serverId);
  }

  /**
   * Get all server health statuses
   */
  getAllHealth(): ServerHealth[] {
    return Array.from(this.healthMap.values());
  }

  /**
   * Get health summary
   */
  getHealthSummary(): {
    total: number;
    healthy: number;
    degraded: number;
    down: number;
  } {
    const statuses = Array.from(this.healthMap.values());

    return {
      total: statuses.length,
      healthy: statuses.filter((s) => s.status === "healthy").length,
      degraded: statuses.filter((s) => s.status === "degraded").length,
      down: statuses.filter((s) => s.status === "down").length,
    };
  }

  private getStatusIcon(status: HealthStatus): string {
    switch (status) {
      case "healthy":
        return "✓";
      case "degraded":
        return "⚠️ ";
      case "down":
        return "✗";
    }
  }

  private logStatusChange(
    previous: ServerHealth,
    current: ServerHealth,
  ): void {
    const icon = this.getStatusIcon(current.status);
    console.warn(
      `${icon} ${current.serverName}: ${previous.status} → ${current.status}`,
    );

    if (current.errorMessage) {
      console.warn(`   └─ ${current.errorMessage}`);
    }

    log.warn("Server status changed", {
      server_id: current.serverId,
      server_name: current.serverName,
      previous_status: previous.status,
      current_status: current.status,
      error: current.errorMessage,
    });
  }
}
