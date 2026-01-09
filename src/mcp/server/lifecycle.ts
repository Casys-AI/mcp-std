/**
 * Server Lifecycle Management
 *
 * Start/stop/restart logic for the MCP Gateway server.
 *
 * @module mcp/server/lifecycle
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as log from "@std/log";
import type { MCPClientBase } from "../types.ts";
import type { ResolvedGatewayConfig } from "./types.ts";
import { SERVER_TITLE } from "./constants.ts";

/** Type alias for the underlying MCP Server (avoids deprecated import) */
export type McpServerInstance = McpServer["server"];

/**
 * Initialize MCP Server instance
 * Returns the underlying Server for backward compatibility with setRequestHandler API
 */
export function createMCPServer(config: ResolvedGatewayConfig): McpServerInstance {
  const mcpServer = new McpServer(
    {
      name: config.name,
      // @ts-ignore - title is valid in Implementation
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
  // Return underlying Server for low-level setRequestHandler API
  return mcpServer.server;
}

/**
 * Start server with stdio transport
 */
export async function startStdioServer(
  server: McpServerInstance,
  config: ResolvedGatewayConfig,
  mcpClients: Map<string, MCPClientBase>,
): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  log.info("✓ Casys PML MCP gateway started (stdio mode)");
  log.info(`  Server: ${config.name} v${config.version}`);
  log.info(`  Connected MCP servers: ${mcpClients.size}`);
  log.info("  Claude Code can now connect to pml");
}

/**
 * Graceful shutdown
 */
export async function stopServer(
  server: McpServerInstance,
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
