/**
 * MCP Server Bootstrap for Std (Standard Library) Tools
 *
 * This file bootstraps the std tools as a proper MCP server
 * that can be loaded via mcp-servers.json or run as HTTP server.
 *
 * Uses the ConcurrentMCPServer framework for production-ready
 * concurrency control and backpressure.
 *
 * Usage in mcp-servers.json (stdio mode):
 * {
 *   "mcpServers": {
 *     "std": {
 *       "command": "deno",
 *       "args": ["run", "--allow-all", "jsr:@casys/mcp-std/server"]
 *     }
 *   }
 * }
 *
 * HTTP mode (default port: 3008):
 *   deno run --allow-all jsr:@casys/mcp-std/server --http
 *   deno run --allow-all jsr:@casys/mcp-std/server --http --port=3008
 *   deno run --allow-all jsr:@casys/mcp-std/server --http --port=4000 --hostname=127.0.0.1
 *
 * @module lib/std/server
 */

import { ConcurrentMCPServer, MCP_APP_MIME_TYPE, SamplingBridge } from "@casys/mcp-server";
import { MiniToolsClient } from "./src/client.ts";
import { createAgenticSamplingClient, setSamplingClient } from "./src/tools/agent.ts";
import { loadUiHtml, UI_RESOURCES } from "./src/ui/mod.ts";

const DEFAULT_HTTP_PORT = 3008;

async function main() {
  // Parse command line arguments
  const args = Deno.args;

  // Category filtering
  const categoriesArg = args.find((arg) => arg.startsWith("--categories="));
  const categories = categoriesArg
    ? categoriesArg.split("=")[1].split(",")
    : undefined;

  // HTTP mode: --http [--port=XXXX] [--hostname=X.X.X.X]
  const httpFlag = args.includes("--http");
  const portArg = args.find((arg) => arg.startsWith("--port="));
  const httpPort = portArg ? parseInt(portArg.split("=")[1], 10) : DEFAULT_HTTP_PORT;
  const hostnameArg = args.find((arg) => arg.startsWith("--hostname="));
  const hostname = hostnameArg ? hostnameArg.split("=")[1] : "0.0.0.0";

  // Initialize tools client
  const toolsClient = new MiniToolsClient(
    categories ? { categories } : undefined,
  );

  // Create agentic sampling client and wrap with SamplingBridge
  // The bridge adds timeout handling, request tracking, and cancellation support
  const underlyingSamplingClient = createAgenticSamplingClient();
  const samplingBridge = new SamplingBridge(underlyingSamplingClient, {
    timeout: 120000, // 2 minute timeout for agentic loops
  });

  // Use the bridge as the sampling client - it implements createMessage()
  // This routes all sampling through the bridge for better lifecycle management
  setSamplingClient(samplingBridge);

  console.error(
    "[mcp-std] Sampling bridge initialized (timeout: 120s, tracking enabled)",
  );

  // Create concurrent MCP server with framework
  const server = new ConcurrentMCPServer({
    name: "mcp-std",
    version: "0.2.1",
    maxConcurrent: 10,
    backpressureStrategy: "sleep",
    enableSampling: true,
    samplingClient: samplingBridge,
    logger: (msg) => console.error(`[mcp-std] ${msg}`),
  });

  // Register all tools from MiniToolsClient
  const mcpTools = toolsClient.toMCPFormat();
  const handlers = new Map();

  for (const tool of toolsClient.listTools()) {
    handlers.set(tool.name, tool.handler);
  }

  server.registerTools(mcpTools, handlers);

  // Collect and register UI resources from tools with _meta.ui
  const registeredUris = new Set<string>();
  for (const tool of toolsClient.listTools()) {
    const ui = tool._meta?.ui;
    if (ui?.resourceUri && !registeredUris.has(ui.resourceUri)) {
      registeredUris.add(ui.resourceUri);
      const resourceMeta = UI_RESOURCES[ui.resourceUri];
      if (resourceMeta) {
        server.registerResource(
          {
            uri: ui.resourceUri,
            name: resourceMeta.name,
            description: resourceMeta.description,
            mimeType: MCP_APP_MIME_TYPE,
          },
          async () => {
            const html = await loadUiHtml(ui.resourceUri);
            return { uri: ui.resourceUri, mimeType: MCP_APP_MIME_TYPE, text: html };
          },
        );
        console.error(`[mcp-std] Registered UI resource: ${ui.resourceUri}`);
      } else {
        console.error(`[mcp-std] Warning: UI resource metadata not found for ${ui.resourceUri}`);
      }
    }
  }

  // Start server (HTTP or stdio mode)
  if (httpFlag) {
    const httpServer = await server.startHttp({
      port: httpPort,
      hostname,
      cors: true,
      onListen: (info) => {
        console.error(
          `[mcp-std] HTTP server listening on http://${info.hostname}:${info.port}`,
        );
      },
    });

    console.error(
      `[mcp-std] Server ready (${toolsClient.count} tools) - HTTP mode${
        categories ? ` - categories: ${categories.join(", ")}` : ""
      }`,
    );

    // Keep server running until interrupted
    Deno.addSignalListener("SIGINT", async () => {
      console.error("[mcp-std] Shutting down HTTP server...");
      await httpServer.shutdown();
      Deno.exit(0);
    });
  } else {
    await server.start();

    console.error(
      `[mcp-std] Server ready (${toolsClient.count} tools) - stdio mode${
        categories ? ` - categories: ${categories.join(", ")}` : ""
      }`,
    );

    Deno.addSignalListener("SIGINT", () => {
      console.error("[mcp-std] SIGINT received, exiting...");
      Deno.exit(0);
    });
  }
}

// Run if main module
if (import.meta.main) {
  main().catch((error) => {
    console.error("[mcp-std] Fatal error:", error);
    Deno.exit(1);
  });
}
