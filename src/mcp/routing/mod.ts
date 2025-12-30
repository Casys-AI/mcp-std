/**
 * Routing Module
 *
 * Central routing system for the MCP Gateway HTTP server.
 * Uses Hono for routing (QW-4 migration).
 *
 * @module mcp/routing
 */

// Middleware utilities
export {
  buildCorsHeaders,
  getAllowedOrigin,
  handleCorsPrelight,
  isPublicRoute,
  PUBLIC_ROUTES,
  rateLimitResponse,
  unauthorizedResponse,
} from "./middleware.ts";

// Types and response helpers
export type { RouteContext, RouteHandler } from "./types.ts";
export { errorResponse, jsonResponse } from "./types.ts";

// Re-export handlers for direct access if needed
export {
  handleCapabilitiesRoutes,
  handleEmergenceRoutes,
  handleGraphRoutes,
  handleHealthRoutes,
  handleMetricsRoutes,
  handleToolsRoutes,
} from "./handlers/mod.ts";

// Note: router.ts and dispatcher.ts are deprecated (QW-4)
// Routing is now handled by Hono in src/mcp/server/app.ts
