/**
 * Health & Events Route Handlers
 *
 * Handles /health and /events/* endpoints for the MCP Gateway.
 *
 * @module mcp/routing/handlers/health
 */

import type { RouteContext } from "../types.ts";
import { jsonResponse } from "../types.ts";

/**
 * GET /health
 *
 * Simple health check endpoint (public, no auth required)
 */
export function handleHealth(
  _req: Request,
  _url: URL,
  _ctx: RouteContext,
  corsHeaders: Record<string, string>,
): Response {
  return jsonResponse({ status: "ok" }, 200, corsHeaders);
}

/**
 * GET /events/stream
 *
 * Server-Sent Events stream for graph events (Story 6.1)
 */
export function handleEventsStream(
  req: Request,
  _url: URL,
  ctx: RouteContext,
  corsHeaders: Record<string, string>,
): Response {
  if (!ctx.eventsStream) {
    return jsonResponse(
      { error: "Events stream not initialized" },
      503,
      corsHeaders,
    );
  }
  return ctx.eventsStream.handleRequest(req);
}

/**
 * GET /dashboard
 *
 * Redirect to Fresh dashboard (Story 6.2)
 */
export function handleDashboardRedirect(
  _req: Request,
  _url: URL,
  _ctx: RouteContext,
  _corsHeaders: Record<string, string>,
): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: "http://localhost:8080/dashboard" },
  });
}

/**
 * Route health-related requests
 */
export function handleHealthRoutes(
  req: Request,
  url: URL,
  ctx: RouteContext,
  corsHeaders: Record<string, string>,
): Response | null {
  if (url.pathname === "/health" && req.method === "GET") {
    return handleHealth(req, url, ctx, corsHeaders);
  }

  if (url.pathname === "/events/stream" && req.method === "GET") {
    return handleEventsStream(req, url, ctx, corsHeaders);
  }

  if (url.pathname === "/dashboard" && req.method === "GET") {
    return handleDashboardRedirect(req, url, ctx, corsHeaders);
  }

  return null;
}
