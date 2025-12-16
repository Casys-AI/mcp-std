/**
 * Server Lifecycle Management
 *
 * Start/stop/restart logic for the MCP Gateway server.
 *
 * @module mcp/server/lifecycle
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as log from "@std/log";
import type { MCPClientBase } from "../types.ts";
import type { ResolvedGatewayConfig } from "./types.ts";
import { SERVER_TITLE } from "./constants.ts";

/**
 * Initialize MCP Server instance
 */
export function createMCPServer(config: ResolvedGatewayConfig): Server {
  return new Server(
    {
      name: config.name,
      title: SERVER_TITLE,
      version: config.version,
    },
    {
      capabilities: {
        tools: {},
        prompts: {},
      },
    },
  );
}

/**
 * Start server with stdio transport
 */
export async function startStdioServer(
  server: Server,
  config: ResolvedGatewayConfig,
  mcpClients: Map<string, MCPClientBase>,
): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  log.info("✓ Casys PML MCP gateway started (stdio mode)");
  log.info(`  Server: ${config.name} v${config.version}`);
  log.info(`  Connected MCP servers: ${mcpClients.size}`);
  log.info("  Claude Code can now connect to cai");
}

/**
 * Graceful shutdown
 */
export async function stopServer(
  server: Server,
  mcpClients: Map<string, MCPClientBase>,
  httpServer: Deno.HttpServer | null,
): Promise<void> {
  log.info("Shutting down Casys PML gateway...");

  if (httpServer) {
    await httpServer.shutdown();
  }

  for (const [serverId, client] of mcpClients.entries()) {
    try {
      await client.disconnect();
      log.debug(`Disconnected from ${serverId}`);
    } catch (error) {
      log.error(`Error disconnecting from ${serverId}: ${error}`);
    }
  }

  await server.close();
  log.info("✓ Gateway stopped");
}
