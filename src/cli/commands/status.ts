/**
 * Status Command
 *
 * CLI command to check health status of all MCP servers
 *
 * @module cli/commands/status
 */

import { Command } from "@cliffy/command";
import * as log from "@std/log";
import { MCPServerDiscovery } from "../../mcp/discovery.ts";
import { MCPClient } from "../../mcp/client.ts";
import {
  HealthChecker,
  type HealthStatus,
  type ServerHealth,
} from "../../health/health-checker.ts";
import type { MCPClientBase, MCPServer } from "../../mcp/types.ts";

/**
 * Default MCP config path
 */
const DEFAULT_CONFIG_PATHS = [
  `${Deno.env.get("HOME")}/.pml/config.yaml`,
  `${Deno.env.get("HOME")}/.config/Claude/claude_desktop_config.json`,
];

/**
 * Find first existing config file
 */
async function findConfigFile(customPath?: string): Promise<string> {
  if (customPath) {
    try {
      await Deno.stat(customPath);
      return customPath;
    } catch {
      throw new Error(`Config file not found: ${customPath}`);
    }
  }

  for (const path of DEFAULT_CONFIG_PATHS) {
    try {
      await Deno.stat(path);
      return path;
    } catch {
      // Try next path
    }
  }

  throw new Error(
    "No config file found. Run 'pml init' to create one.",
  );
}

/**
 * Connect to MCP servers
 */
async function connectToServers(
  servers: MCPServer[],
): Promise<Map<string, MCPClientBase>> {
  const clients = new Map<string, MCPClientBase>();

  for (const server of servers) {
    try {
      const client = new MCPClient(server, 10000);
      await client.connect();
      clients.set(server.id, client);
    } catch (error) {
      log.warn(`Failed to connect to ${server.id}: ${error}`);
    }
  }

  return clients;
}

/**
 * Display health status in human-readable format
 */
function displayHealthStatus(
  allHealth: ServerHealth[],
  summary: { total: number; healthy: number; degraded: number; down: number },
): void {
  console.log("╔════════════════════════════════════════════════╗");
  console.log("║         Casys PML Health Status              ║");
  console.log("╚════════════════════════════════════════════════╝\n");

  console.log(`📊 Summary: ${summary.healthy}/${summary.total} servers healthy\n`);

  for (const health of allHealth) {
    const icon = getStatusIcon(health.status);
    const statusColor = getStatusColor(health.status);

    console.log(`${icon} ${health.serverName} (${health.serverId})`);
    console.log(`   Status: ${statusColor(health.status)}`);
    console.log(`   Last check: ${formatDate(health.lastCheck)}`);

    if (health.latencyMs !== null) {
      console.log(`   Latency: ${health.latencyMs.toFixed(1)}ms`);
    }

    if (health.errorMessage) {
      console.log(`   Error: ${health.errorMessage}`);
    }

    if (health.consecutiveFailures > 0) {
      console.log(`   Consecutive failures: ${health.consecutiveFailures}`);
    }

    console.log("");
  }

  if (summary.down > 0) {
    console.warn(
      `⚠️  ${summary.down} server(s) are down. Run 'pml init' to reconfigure.`,
    );
  }
}

/**
 * Display health status in JSON format
 */
function displayHealthStatusJSON(
  allHealth: ServerHealth[],
  summary: { total: number; healthy: number; degraded: number; down: number },
): void {
  console.log(JSON.stringify({ summary, servers: allHealth }, null, 2));
}

function getStatusIcon(status: HealthStatus): string {
  return status === "healthy" ? "✓" : status === "degraded" ? "⚠️ " : "✗";
}

function getStatusColor(status: HealthStatus): (text: string) => string {
  return status === "healthy"
    ? (text) => `\x1b[32m${text}\x1b[0m` // Green
    : status === "degraded"
    ? (text) => `\x1b[33m${text}\x1b[0m` // Yellow
    : (text) => `\x1b[31m${text}\x1b[0m`; // Red
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

/**
 * Create status command
 *
 * Usage:
 *   pml status                    # One-time health check
 *   pml status --json             # JSON output
 *   pml status --watch            # Watch mode (refresh every 30s)
 *   pml status --config <path>    # Use custom config path
 */
export function createStatusCommand() {
  return new Command()
    .name("status")
    .description("Show health status of all MCP servers")
    .option("--json", "Output in JSON format")
    .option("--watch", "Watch mode (refresh every 30s)")
    .option("--config <path:string>", "Path to MCP config file")
    .action(async (options) => {
      try {
        // Find config file
        const configPath = await findConfigFile(options.config);

        // Discover servers
        const discovery = new MCPServerDiscovery(configPath);
        const config = await discovery.loadConfig();
        const servers = config.servers;

        if (servers.length === 0) {
          console.log("No MCP servers configured.");
          console.log("Run 'pml init' to configure servers.");
          return;
        }

        // Connect to servers
        const mcpClients = await connectToServers(servers);

        if (mcpClients.size === 0) {
          console.error("Failed to connect to any MCP servers.");
          Deno.exit(1);
        }

        // Create health checker
        const healthChecker = new HealthChecker(mcpClients);

        if (options.watch) {
          // Watch mode - continuous updates
          while (true) {
            console.clear();
            await healthChecker.initialHealthCheck();

            const allHealth = healthChecker.getAllHealth();
            const summary = healthChecker.getHealthSummary();

            if (options.json) {
              displayHealthStatusJSON(allHealth, summary);
            } else {
              displayHealthStatus(allHealth, summary);
            }

            console.log("\n🔄 Refreshing in 30 seconds... (Ctrl+C to exit)");
            await new Promise((resolve) => setTimeout(resolve, 30000));
          }
        } else {
          // One-time check
          await healthChecker.initialHealthCheck();

          const allHealth = healthChecker.getAllHealth();
          const summary = healthChecker.getHealthSummary();

          if (options.json) {
            displayHealthStatusJSON(allHealth, summary);
          } else {
            displayHealthStatus(allHealth, summary);
          }
        }

        // Cleanup connections
        for (const client of mcpClients.values()) {
          try {
            await client.disconnect();
          } catch {
            // Ignore disconnect errors
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error(`Status check failed: ${error}`);
        console.error(`❌ Error: ${errorMessage}`);
        Deno.exit(1);
      }
    });
}
