/**
 * Routing Middleware
 *
 * Request/response middleware: CORS, authentication, rate limiting.
 *
 * @module mcp/routing/middleware
 */

import * as log from "@std/log";

/**
 * Public routes that don't require authentication
 * Centralized definition - used by Hono app middleware
 */
export const PUBLIC_ROUTES = ["/health", "/events/stream", "/dashboard"];

/**
 * Check if a route is public (no auth required)
 * Supports exact matches and prefix matches (e.g., /dashboard/*)
 */
export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

/**
 * Get allowed CORS origin based on environment
 */
export function getAllowedOrigin(): string {
  const domain = Deno.env.get("DOMAIN");
  if (domain) return `https://${domain}`;
  const dashboardPort = Deno.env.get("FRESH_PORT") || "8081";
  return `http://localhost:${dashboardPort}`;
}

/**
 * Build CORS headers
 * Centralized definition - used by Hono app CORS middleware
 */
export function buildCorsHeaders(allowedOrigin?: string): Record<string, string> {
  const origin = allowedOrigin ?? getAllowedOrigin();
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cache-Control, x-api-key",
  };
}

/**
 * Handle CORS preflight request
 */
export function handleCorsPrelight(corsHeaders: Record<string, string>): Response {
  return new Response(null, { headers: corsHeaders });
}

/**
 * Create unauthorized response
 */
export function unauthorizedResponse(corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      error: "Unauthorized",
      message: "Valid API key required",
    }),
    {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    },
  );
}

/**
 * Create rate limit exceeded response
 */
export function rateLimitResponse(corsHeaders: Record<string, string>): Response {
  log.warn("Rate limit exceeded");
  return new Response(
    JSON.stringify({
      error: "Rate limit exceeded",
      message: "Too many requests. Please try again later.",
      retryAfter: 60,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": "60",
        ...corsHeaders,
      },
    },
  );
}
