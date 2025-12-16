/**
 * Request Dispatcher
 *
 * Dispatches requests to appropriate handlers based on path patterns.
 *
 * @module mcp/routing/dispatcher
 */

import type { RouteContext, RouteHandler } from "./types.ts";

/**
 * Route definition
 */
export interface RouteDefinition {
  method: "GET" | "POST" | "DELETE" | "OPTIONS" | "*";
  pattern: string | RegExp;
  handler: RouteHandler;
}

/**
 * Request Dispatcher
 *
 * Matches requests against registered routes and dispatches to handlers.
 */
export class RequestDispatcher {
  private routes: RouteDefinition[] = [];

  /**
   * Register a route
   */
  register(
    method: RouteDefinition["method"],
    pattern: string | RegExp,
    handler: RouteHandler,
  ): void {
    this.routes.push({ method, pattern, handler });
  }

  /**
   * Register GET route
   */
  get(pattern: string | RegExp, handler: RouteHandler): void {
    this.register("GET", pattern, handler);
  }

  /**
   * Register POST route
   */
  post(pattern: string | RegExp, handler: RouteHandler): void {
    this.register("POST", pattern, handler);
  }

  /**
   * Register DELETE route
   */
  delete(pattern: string | RegExp, handler: RouteHandler): void {
    this.register("DELETE", pattern, handler);
  }

  /**
   * Match and dispatch request
   *
   * @returns Response if matched, null otherwise
   */
  async dispatch(
    req: Request,
    url: URL,
    ctx: RouteContext,
    corsHeaders: Record<string, string>,
  ): Promise<Response | null> {
    for (const route of this.routes) {
      // Check method
      if (route.method !== "*" && route.method !== req.method) {
        continue;
      }

      // Check pattern
      let matches = false;
      let params: Record<string, string> = {};

      if (typeof route.pattern === "string") {
        // Simple string match or path parameter pattern
        if (route.pattern.includes(":")) {
          const result = this.matchPathPattern(url.pathname, route.pattern);
          matches = result.matches;
          params = result.params;
        } else {
          matches = url.pathname === route.pattern;
        }
      } else {
        // Regex match
        const match = url.pathname.match(route.pattern);
        matches = match !== null;
        if (match?.groups) {
          params = match.groups;
        }
      }

      if (matches) {
        return await route.handler(req, url, { ...ctx, params }, corsHeaders);
      }
    }

    return null;
  }

  /**
   * Match path pattern with parameters (e.g., /api/items/:id)
   */
  private matchPathPattern(
    pathname: string,
    pattern: string,
  ): { matches: boolean; params: Record<string, string> } {
    const patternParts = pattern.split("/");
    const pathParts = pathname.split("/");

    if (patternParts.length !== pathParts.length) {
      return { matches: false, params: {} };
    }

    const params: Record<string, string> = {};

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i];
      const pathPart = pathParts[i];

      if (patternPart.startsWith(":")) {
        // Parameter
        const paramName = patternPart.slice(1);
        params[paramName] = pathPart;
      } else if (patternPart !== pathPart) {
        return { matches: false, params: {} };
      }
    }

    return { matches: true, params };
  }
}
