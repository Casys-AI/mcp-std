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
import { isPublicRoute, buildCorsHeaders } from "../routing/middleware.ts";

// Import existing handlers
import {
  handleCapabilitiesRoutes,
  handleEmergenceRoutes,
  handleGraphRoutes,
  handleMetricsRoutes,
  handleToolsRoutes,
} from "../routing/handlers/mod.ts";

// Types for Hono context
interface AppEnv {
  Variables: {
    routeCtx: RouteContext;
    corsHeaders: Record<string, string>;
    userId?: string;
  };
}

/**
 * Dependencies for creating the Hono app
 */
export interface HonoAppDependencies {
  routeContext: Omit<RouteContext, "userId" | "eventsStream">;
  eventsStream: EventsStreamManager | null;
  handleJsonRpc: (body: unknown, userId?: string) => Promise<unknown>;
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

  // === MCP JSON-RPC Endpoint ===
  app.post("/mcp", async (c) => {
    try {
      const body = await c.req.json();
      const userId = c.get("userId");
      const response = await deps.handleJsonRpc(body, userId);
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
