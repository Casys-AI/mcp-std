/**
 * Routing Module
 *
 * Central routing system for the MCP Gateway HTTP server.
 * Consolidates all routing logic per tech-spec-large-files-refactoring.md Phase 1.
 *
 * @module mcp/routing
 */

// Router
export { routeRequest, logRoutes } from "./router.ts";

// Dispatcher (for custom route registration)
export { RequestDispatcher, type RouteDefinition } from "./dispatcher.ts";

// Middleware utilities
export {
  isPublicRoute,
  getAllowedOrigin,
  buildCorsHeaders,
  handleCorsPrelight,
  unauthorizedResponse,
  rateLimitResponse,
} from "./middleware.ts";

// Types and response helpers
export type { RouteContext, RouteHandler } from "./types.ts";
export { jsonResponse, errorResponse } from "./types.ts";

// Re-export handlers for direct access if needed
export {
  handleGraphRoutes,
  handleCapabilitiesRoutes,
  handleMetricsRoutes,
  handleToolsRoutes,
  handleHealthRoutes,
} from "./handlers/mod.ts";
