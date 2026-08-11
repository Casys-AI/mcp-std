/**
 * MCP Server Bootstrap for Std (Standard Library) Tools
 *
 * This file bootstraps the std tools as a proper MCP server
 * that can be loaded via mcp-servers.json or run as HTTP server.
 *
 * Uses the McpApp framework for production-ready
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
 *   deno run --allow-all jsr:@casys/mcp-std/server --http --cors
 *
 * @module lib/std/server
 */

import { MCP_APP_MIME_TYPE, McpApp } from "@casys/mcp-server";
import { getCategories, MiniToolsClient } from "./src/client.ts";
import {
  createAgenticSamplingClient,
  setSamplingClient,
} from "./src/tools/agent.ts";
import { decodeViewerText, gunzipText } from "./src/ui/gzip.ts";

const DEFAULT_HTTP_PORT = 3008;

async function readViewer(path: string): Promise<string> {
  if (path.startsWith("https://") || path.startsWith("http://")) {
    const response = await fetch(path);
    if (response.ok) return response.text();

    const gzipPath = `${path}.gz`;
    const gzipResponse = await fetch(gzipPath);
    if (!gzipResponse.ok) {
      throw new Error(
        `[mcp-std] Failed to fetch viewer ${path}: ${response.status}; ` +
          `gzip fallback: ${gzipResponse.status}`,
      );
    }
    return decodeViewerText(
      new Uint8Array(await gzipResponse.arrayBuffer()),
    );
  }

  try {
    return await Deno.readTextFile(path);
  } catch (htmlError) {
    try {
      return await gunzipText(await Deno.readFile(`${path}.gz`));
    } catch (gzipError) {
      throw new AggregateError(
        [htmlError, gzipError],
        `[mcp-std] Failed to read viewer ${path}`,
      );
    }
  }
}

async function main() {
  // Parse command line arguments
  const args = Deno.args;

  if (args.includes("--list-categories")) {
    console.log(getCategories().join("\n"));
    return;
  }

  // Category filtering
  const categoriesArg = args.find((arg) => arg.startsWith("--categories="));
  const categories = categoriesArg
    ? categoriesArg.slice("--categories=".length).split(",").map((category) =>
      category.trim()
    ).filter(Boolean)
    : undefined;
  if (categoriesArg && categories?.length === 0) {
    throw new Error("--categories requires at least one category name");
  }

  // HTTP mode: --http [--port=XXXX] [--hostname=127.0.0.1] [--cors]
  const httpFlag = args.includes("--http");
  const portArg = args.find((arg) => arg.startsWith("--port="));
  const httpPort = portArg
    ? parseInt(portArg.split("=")[1], 10)
    : DEFAULT_HTTP_PORT;
  const hostnameArg = args.find((arg) => arg.startsWith("--hostname="));
  const hostname = hostnameArg ? hostnameArg.split("=")[1] : "127.0.0.1";
  const cors = args.includes("--cors");

  // Initialize tools client
  const toolsClient = new MiniToolsClient(
    categories ? { categories } : undefined,
  );

  // Agentic tools use their own sampling client. McpApp no longer owns a
  // SamplingBridge, so register the client directly with the tools module.
  setSamplingClient(createAgenticSamplingClient());

  console.error(
    "[mcp-std] Agentic sampling client initialized",
  );

  // Create MCP application with framework
  const server = new McpApp({
    name: "mcp-std",
    version: "0.4.1",
    maxConcurrent: 10,
    backpressureStrategy: "sleep",
    logger: (msg) => console.error(`[mcp-std] ${msg}`),
  });

  // Register all tools from MiniToolsClient
  const mcpTools = toolsClient.toMCPFormat();
  const handlers = new Map();

  for (const tool of toolsClient.listTools()) {
    handlers.set(tool.name, tool.handler);
  }

  server.registerTools(mcpTools, handlers);

  // Register the viewers referenced by tool metadata. The callbacks support
  // local/compiled modules and remote JSR modules without a separate registry.
  const viewerNames = new Set<string>();
  for (const tool of toolsClient.listTools()) {
    const resourceUri = tool._meta?.ui?.resourceUri;
    const viewerName = resourceUri?.match(/^ui:\/\/mcp-std\/([^/]+)$/)?.[1];
    if (viewerName) {
      viewerNames.add(viewerName);
    }
  }

  const viewerRegistration = server.registerViewers({
    prefix: "mcp-std",
    moduleUrl: import.meta.url,
    viewers: [...viewerNames].sort(),
    exists: (path) => {
      if (path.startsWith("https://") || path.startsWith("http://")) {
        // Explicit viewer metadata is the package contract; fetch errors are
        // reported when the client reads the matching resource.
        return true;
      }
      try {
        return Deno.statSync(path).isFile;
      } catch {
        try {
          return Deno.statSync(`${path}.gz`).isFile;
        } catch {
          return false;
        }
      }
    },
    readFile: readViewer,
  });
  console.error(
    `[mcp-std] Registered ${viewerRegistration.registered.length} MCP App viewer(s) (${MCP_APP_MIME_TYPE})`,
  );

  // Start server (HTTP or stdio mode)
  if (httpFlag) {
    const httpServer = await server.startHttp({
      port: httpPort,
      hostname,
      cors,
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
