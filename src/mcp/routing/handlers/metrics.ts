/**
 * Metrics API Route Handler
 *
 * Handles /api/metrics endpoint for the MCP Gateway.
 *
 * @module mcp/routing/handlers/metrics
 */

import * as log from "@std/log";
import type { RouteContext } from "../types.ts";
import { jsonResponse, errorResponse } from "../types.ts";

/**
 * GET /api/metrics
 *
 * Returns graph metrics for the specified time range (Story 6.3)
 *
 * Query params:
 * - range: Time range (1h, 24h, 7d) (default: 24h)
 */
export async function handleMetrics(
  _req: Request,
  url: URL,
  ctx: RouteContext,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  try {
    const range = url.searchParams.get("range") || "24h";

    // Validate range parameter
    if (range !== "1h" && range !== "24h" && range !== "7d") {
      return errorResponse(
        `Invalid range parameter: ${range}. Must be one of: 1h, 24h, 7d`,
        400,
        corsHeaders,
      );
    }

    const metrics = await ctx.graphEngine.getMetrics(range as "1h" | "24h" | "7d");
    return jsonResponse(metrics, 200, corsHeaders);
  } catch (error) {
    log.error(`Failed to get metrics: ${error}`);
    return errorResponse(`Failed to get metrics: ${error}`, 500, corsHeaders);
  }
}

/**
 * Route /api/metrics requests
 */
export async function handleMetricsRoutes(
  req: Request,
  url: URL,
  ctx: RouteContext,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  if (url.pathname === "/api/metrics" && req.method === "GET") {
    return await handleMetrics(req, url, ctx, corsHeaders);
  }
  return null;
}
