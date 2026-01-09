/**
 * Routing Config API
 *
 * Serves routing configuration for PML package sync.
 * Endpoint: GET /api/v1/routing
 *
 * @module api/routing
 */

import * as log from "@std/log";
import type { RouteContext } from "../mcp/routing/types.ts";
import { jsonResponse } from "../mcp/routing/types.ts";

/**
 * Cached routing config (loaded once)
 */
let cachedConfig: RoutingResponse | null = null;
let configVersion = "1.0.0";

/**
 * Package-expected routing config format
 */
interface RoutingResponse {
  version: string;
  clientTools: string[];
  serverTools: string[];
  defaultRouting: "client" | "server";
}

/**
 * Load and transform routing config from config/mcp-routing.json
 */
async function loadRoutingConfig(): Promise<RoutingResponse> {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const configContent = await Deno.readTextFile("./config/mcp-routing.json");
    const config = JSON.parse(configContent) as {
      routing: { client?: string[]; server: string[] };
      default?: string;
    };

    // Transform to package format, stripping :* wildcards
    cachedConfig = {
      version: configVersion,
      clientTools: (config.routing.client ?? []).map((t) => t.replace(":*", "")),
      serverTools: config.routing.server.map((t) => t.replace(":*", "")),
      defaultRouting: (config.default as "client" | "server") ?? "client",
    };

    log.info("Routing config loaded", {
      clientTools: cachedConfig.clientTools.length,
      serverTools: cachedConfig.serverTools.length,
    });

    return cachedConfig;
  } catch (error) {
    log.error("Failed to load routing config", { error: String(error) });
    throw error;
  }
}

/**
 * GET /api/v1/routing
 *
 * Returns routing configuration for PML package.
 * Supports conditional fetch with If-None-Match header.
 */
export async function handleRoutingConfig(
  req: Request,
  _url: URL,
  _ctx: RouteContext,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  try {
    const config = await loadRoutingConfig();
    const etag = `"${config.version}"`;

    // Support conditional fetch
    const ifNoneMatch = req.headers.get("If-None-Match");
    if (ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: { ...corsHeaders, ETag: etag },
      });
    }

    return jsonResponse(config, 200, { ...corsHeaders, ETag: etag });
  } catch (_error) {
    return jsonResponse(
      { error: "Failed to load routing config" },
      500,
      corsHeaders,
    );
  }
}

/**
 * Route routing-related requests
 */
export function handleRoutingRoutes(
  req: Request,
  url: URL,
  ctx: RouteContext,
  corsHeaders: Record<string, string>,
): Promise<Response> | null {
  if (url.pathname === "/api/v1/routing" && req.method === "GET") {
    return handleRoutingConfig(req, url, ctx, corsHeaders);
  }

  return null;
}

/**
 * Reset cached config (for testing)
 */
export function resetRoutingCache(): void {
  cachedConfig = null;
}
