/**
 * Hono Application
 *
 * HTTP routing using Hono framework (QW-4 migration).
 * Replaces custom dispatcher/router with declarative routing.
 * Includes auth, rate-limiting, and CORS middleware.
 *
 * @module mcp/server/app
 */

import { Hono } from "jsr:@hono/hono@^4";
import { cors } from "jsr:@hono/hono@^4/cors";
import * as log from "@std/log";

import type { RouteContext } from "../routing/types.ts";
import { validateRequest } from "../../lib/auth.ts";
import { RateLimiter } from "../../utils/rate-limiter.ts";
import { getRateLimitKey } from "../../lib/rate-limiter-helpers.ts";
import type { EventsStreamManager } from "../../server/events-stream.ts";
import {
  isPublicRoute,
  buildCorsHeaders,
  PROMETHEUS_ROUTE,
  validatePrometheusToken,
} from "../routing/middleware.ts";

// Import REST API route handlers
import {
  handleCapabilitiesRoutes,
  handleEmergenceRoutes,
  handleGraphRoutes,
  handleMcpRegistryRoutes,
  handleMetricsRoutes,
  handleRoutingRoutes,
  handleToolsRoutes,
} from "../../api/mod.ts";

// Package session management
import {
  getSessionStore,
  type RegisterRequest,
  type HeartbeatRequest,
  type UnregisterRequest,
} from "../sessions/mod.ts";


// Types for Hono context
interface AppEnv {
  Variables: {
    routeCtx: RouteContext;
    corsHeaders: Record<string, string>;
    userId?: string;
    sessionId?: string; // Package session ID from X-PML-Session header
  };
}

/**
 * Dependencies for creating the Hono app
 */
export interface HonoAppDependencies {
  routeContext: Omit<RouteContext, "userId" | "eventsStream">;
  eventsStream: EventsStreamManager | null;
  handleJsonRpc: (body: unknown, userId?: string, isPackageClient?: boolean) => Promise<unknown>;
}

/**
 * Create the main Hono application
 *
 * @param deps Dependencies (route context, event stream, JSON-RPC handler)
 * @param allowedOrigins CORS allowed origins
 */
export function createApp(deps: HonoAppDependencies, allowedOrigins: string[]): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // Rate limiters
  const rateLimiters = {
    mcp: new RateLimiter(100, 60000),
    api: new RateLimiter(200, 60000),
  };

  // Build CORS headers for responses (use centralized middleware)
  const corsHeaders = buildCorsHeaders(allowedOrigins[0]);

  // === Middleware: Request Logger (using @std/log for promtail) ===
  app.use("*", async (c, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    log.info(`${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms`);
  });

  // === Middleware: CORS ===
  app.use(
    "*",
    cors({
      origin: allowedOrigins,
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "Cache-Control", "x-api-key"],
      exposeHeaders: ["Content-Length"],
      maxAge: 600,
      credentials: true,
    }),
  );

  // === Middleware: Auth & Rate Limiting ===
  app.use("*", async (c, next) => {
    const pathname = new URL(c.req.url).pathname;

    // Skip auth for public routes
    if (isPublicRoute(pathname)) {
      c.set("corsHeaders", corsHeaders);
      c.set("routeCtx", {
        ...deps.routeContext,
        eventsStream: deps.eventsStream,
        userId: undefined,
      });
      return next();
    }

    // Prometheus endpoint: special token-based auth (no user filtering)
    if (pathname === PROMETHEUS_ROUTE) {
      if (validatePrometheusToken(c.req.raw)) {
        c.set("corsHeaders", corsHeaders);
        c.set("routeCtx", {
          ...deps.routeContext,
          eventsStream: deps.eventsStream,
          userId: undefined, // No user filtering for Prometheus
        });
        return next();
      }
      return c.json({ error: "Unauthorized - Invalid Prometheus token" }, 401);
    }

    // Validate auth
    const authResult = await validateRequest(c.req.raw);
    if (!authResult) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Rate limiting
    const clientIp =
      c.req.header("x-forwarded-for") || c.req.header("cf-connecting-ip") || "unknown";
    const rateLimitKey = getRateLimitKey(authResult, clientIp);

    let limiter: RateLimiter | null = null;
    if (pathname === "/mcp" || pathname === "/message") {
      limiter = rateLimiters.mcp;
    } else if (pathname.startsWith("/api/")) {
      limiter = rateLimiters.api;
    }

    if (limiter && !(await limiter.checkLimit(rateLimitKey))) {
      log.warn(`Rate limit exceeded for ${rateLimitKey} on ${pathname}`);
      return c.json({ error: "Too Many Requests" }, 429);
    }

    // Set context variables
    c.set("userId", authResult.user_id);
    c.set("corsHeaders", corsHeaders);
    c.set("routeCtx", {
      ...deps.routeContext,
      eventsStream: deps.eventsStream,
      userId: authResult.user_id,
    });

    return next();
  });

  // === Health Routes (public) ===
  app.get("/health", (c) => {
    return c.json({ status: "ok", timestamp: Date.now() });
  });

  app.get("/events/stream", (c) => {
    if (!deps.eventsStream) {
      return c.json({ error: "Events stream not initialized" }, 503);
    }
    return deps.eventsStream.handleRequest(c.req.raw);
  });

  app.get("/dashboard", (c) => {
    // Dev: 8081, Prod: 8080
    const dashboardPort = Deno.env.get("PORT_DASHBOARD") || "8080";
    return c.redirect(`http://localhost:${dashboardPort}/dashboard`);
  });

  // === PML Package Session Management ===

  // Register: Package announces itself at startup
  app.post("/pml/register", async (c) => {
    try {
      const userId = c.get("userId");
      if (!userId) {
        return c.json({ error: "Authentication required" }, 401);
      }

      const body = await c.req.json() as RegisterRequest;

      // Validate request
      if (!body.clientId || !body.version) {
        return c.json({ error: "Missing clientId or version" }, 400);
      }

      const sessionStore = getSessionStore();
      const response = sessionStore.register(body, userId);

      log.info(`[PML] Package registered: ${body.clientId.slice(0, 8)} v${body.version}`);
      return c.json(response);
    } catch (error) {
      log.error(`[PML] Register failed: ${error}`);
      return c.json({ error: `Registration failed: ${error}` }, 500);
    }
  });

  // Heartbeat: Package keeps session alive
  app.post("/pml/heartbeat", async (c) => {
    try {
      const userId = c.get("userId");
      if (!userId) {
        return c.json({ error: "Authentication required" }, 401);
      }

      const body = await c.req.json() as HeartbeatRequest;

      if (!body.sessionId) {
        return c.json({ error: "Missing sessionId" }, 400);
      }

      const sessionStore = getSessionStore();

      // Verify session ownership before allowing heartbeat
      if (!sessionStore.verifyOwnership(body.sessionId, userId)) {
        return c.json({ error: "Session not found or not owned by this user" }, 403);
      }

      const response = sessionStore.heartbeat(body.sessionId);

      return c.json(response);
    } catch (error) {
      return c.json({ error: `Heartbeat failed: ${error}` }, 500);
    }
  });

  // Unregister: Package graceful shutdown
  app.post("/pml/unregister", async (c) => {
    try {
      const userId = c.get("userId");
      if (!userId) {
        return c.json({ error: "Authentication required" }, 401);
      }

      const body = await c.req.json() as UnregisterRequest;

      if (!body.sessionId) {
        return c.json({ error: "Missing sessionId" }, 400);
      }

      const sessionStore = getSessionStore();

      // Verify session ownership before allowing unregister
      if (!sessionStore.verifyOwnership(body.sessionId, userId)) {
        return c.json({ error: "Session not found or not owned by this user" }, 403);
      }

      const removed = sessionStore.unregister(body.sessionId);

      log.info(`[PML] Package unregistered: ${body.sessionId.slice(0, 8)} (found: ${removed})`);
      return c.json({ success: removed });
    } catch (error) {
      return c.json({ error: `Unregister failed: ${error}` }, 500);
    }
  });

  // === MCP JSON-RPC Endpoint ===
  app.post("/mcp", async (c) => {
    try {
      const body = await c.req.json();
      const userId = c.get("userId");

      // Check for package session via handshake
      const sessionId = c.req.header("X-PML-Session");
      const sessionStore = getSessionStore();
      const isPackageClient = sessionStore.isPackageClient(sessionId);

      const response = await deps.handleJsonRpc(body, userId, isPackageClient);
      return c.json(response);
    } catch (error) {
      return c.json({ error: `Invalid request: ${error}` }, 400);
    }
  });

  app.get("/mcp", (c) => {
    if (!deps.eventsStream) {
      return c.json({ error: "Events stream not initialized" }, 503);
    }
    return deps.eventsStream.handleRequest(c.req.raw);
  });

  // === Legacy /message endpoint ===
  app.post("/message", async (c) => {
    try {
      const body = await c.req.json();
      const userId = c.get("userId");
      const response = await deps.handleJsonRpc(body, userId);
      return c.json(response);
    } catch (error) {
      return c.json(
        { jsonrpc: "2.0", error: { code: -32700, message: `Parse error: ${error}` }, id: null },
        400,
      );
    }
  });

  // === API Routes ===
  // Routing Config API (for PML package sync)
  app.get("/api/v1/routing", async (c) => {
    const routeCtx = c.get("routeCtx");
    const corsHdrs = c.get("corsHeaders");
    const url = new URL(c.req.raw.url);
    const response = await handleRoutingRoutes(c.req.raw, url, routeCtx, corsHdrs);
    return response || c.json({ error: "Not found" }, 404);
  });

  // MCP Registry API (for PML package - tool/capability metadata)
  // List all MCPs
  app.get("/api/registry", async (c) => {
    const routeCtx = c.get("routeCtx");
    const corsHdrs = c.get("corsHeaders");
    const url = new URL(c.req.raw.url);
    const response = await handleMcpRegistryRoutes(c.req.raw, url, routeCtx, corsHdrs);
    return response || c.json({ error: "Not found" }, 404);
  });
  // Get specific MCP by FQDN
  app.get("/api/registry/*", async (c) => {
    const routeCtx = c.get("routeCtx");
    const corsHdrs = c.get("corsHeaders");
    const url = new URL(c.req.raw.url);
    const response = await handleMcpRegistryRoutes(c.req.raw, url, routeCtx, corsHdrs);
    return response || c.json({ error: "Not found" }, 404);
  });

  // Graph API
  app.all("/api/graph/*", async (c) => {
    const routeCtx = c.get("routeCtx");
    const corsHdrs = c.get("corsHeaders");
    const url = new URL(c.req.raw.url);
    const response = await handleGraphRoutes(c.req.raw, url, routeCtx, corsHdrs);
    return response || c.json({ error: "Not found" }, 404);
  });

  // Capabilities API
  app.all("/api/capabilities", async (c) => {
    const routeCtx = c.get("routeCtx");
    const corsHdrs = c.get("corsHeaders");
    const url = new URL(c.req.raw.url);
    const response = await handleCapabilitiesRoutes(c.req.raw, url, routeCtx, corsHdrs);
    return response || c.json({ error: "Not found" }, 404);
  });

  app.all("/api/capabilities/*", async (c) => {
    const routeCtx = c.get("routeCtx");
    const corsHdrs = c.get("corsHeaders");
    const url = new URL(c.req.raw.url);
    const response = await handleCapabilitiesRoutes(c.req.raw, url, routeCtx, corsHdrs);
    return response || c.json({ error: "Not found" }, 404);
  });

  // Metrics API
  app.all("/api/metrics", async (c) => {
    const routeCtx = c.get("routeCtx");
    const corsHdrs = c.get("corsHeaders");
    const url = new URL(c.req.raw.url);
    const response = await handleMetricsRoutes(c.req.raw, url, routeCtx, corsHdrs);
    return response || c.json({ error: "Not found" }, 404);
  });

  app.all("/api/metrics/*", async (c) => {
    const routeCtx = c.get("routeCtx");
    const corsHdrs = c.get("corsHeaders");
    const url = new URL(c.req.raw.url);

    // Try metrics first, then emergence
    const metricsResponse = await handleMetricsRoutes(c.req.raw, url, routeCtx, corsHdrs);
    if (metricsResponse) return metricsResponse;

    const emergenceResponse = await handleEmergenceRoutes(c.req.raw, url, routeCtx, corsHdrs);
    return emergenceResponse || c.json({ error: "Not found" }, 404);
  });

  // Tools API
  app.all("/api/tools/*", async (c) => {
    const routeCtx = c.get("routeCtx");
    const corsHdrs = c.get("corsHeaders");
    const url = new URL(c.req.raw.url);
    const response = handleToolsRoutes(c.req.raw, url, routeCtx, corsHdrs);
    return response || c.json({ error: "Not found" }, 404);
  });

  // === 404 fallback ===
  app.notFound((c) => {
    return c.json({ error: "Not found", path: c.req.path }, 404);
  });

  return app;
}

/**
 * Export types for consumers
 */
export type { AppEnv };
