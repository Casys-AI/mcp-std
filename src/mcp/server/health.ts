/**
 * Health Checks & Readiness Probes
 *
 * Health check endpoints and readiness logic for the MCP Gateway.
 *
 * @module mcp/server/health
 */

import type { EventsStreamManager } from "../../server/events-stream.ts";

/**
 * Health check response
 */
export interface HealthStatus {
  status: "ok" | "degraded" | "unhealthy";
  timestamp: string;
  details?: Record<string, unknown>;
}

/**
 * Get basic health status
 */
export function getHealthStatus(): HealthStatus {
  return {
    status: "ok",
    timestamp: new Date().toISOString(),
  };
}

/**
 * JSON response helper
 */
function jsonResponse(
  data: unknown,
  status: number,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

/**
 * Handle GET /health
 *
 * Simple health check endpoint (public, no auth required)
 */
export function handleHealth(
  _req: Request,
  _url: URL,
  corsHeaders: Record<string, string>,
): Response {
  return jsonResponse(getHealthStatus(), 200, corsHeaders);
}

/**
 * Handle GET /events/stream
 *
 * Server-Sent Events stream for graph events
 */
export function handleEventsStream(
  req: Request,
  eventsStream: EventsStreamManager | null,
  corsHeaders: Record<string, string>,
): Response {
  if (!eventsStream) {
    return jsonResponse(
      { error: "Events stream not initialized" },
      503,
      corsHeaders,
    );
  }
  return eventsStream.handleRequest(req);
}

/**
 * Handle GET /dashboard
 *
 * Redirect to Fresh dashboard
 */
export function handleDashboardRedirect(): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: "http://localhost:8080/dashboard" },
  });
}
