/**
 * MCP Registry API Route Handler
 *
 * GET /api/registry/{fqdn} - Get MCP tool/capability by FQDN
 *
 * Content negotiation:
 * - Accept: application/json → JSON metadata
 * - Otherwise (including default) → TypeScript code (for import())
 *
 * @module api/mcp-registry
 */

import * as log from "@std/log";
import type { RouteContext } from "../mcp/routing/types.ts";
import { jsonResponse } from "../mcp/routing/types.ts";
import { McpRegistryService } from "../mcp/registry/mcp-registry.service.ts";
import { getFQDNPartCount } from "../capabilities/fqdn.ts";

/**
 * Check if client wants JSON (explicit application/json Accept header).
 */
function wantsJson(req: Request): boolean {
  const accept = req.headers.get("Accept") || "";
  // Explicit JSON request
  return accept.includes("application/json");
}

/**
 * GET /api/registry/{fqdn}
 *
 * Content negotiation based on Accept header.
 * Supports both 4-part (redirect to current) and 5-part (exact match) FQDNs.
 */
export async function handleMcpRegistryGet(
  req: Request,
  url: URL,
  ctx: RouteContext,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  // Extract FQDN from path: /api/registry/{fqdn}
  const pathMatch = url.pathname.match(/^\/api\/registry\/(.+)$/);
  if (!pathMatch) {
    return jsonResponse(
      { error: "not_found", message: "FQDN parameter required" },
      400,
      corsHeaders,
    );
  }

  const fqdn = pathMatch[1];

  try {
    const service = new McpRegistryService(ctx.db!);
    const partCount = getFQDNPartCount(fqdn);

    // 4-part FQDN: redirect to current version with hash
    if (partCount === 4) {
      const currentFqdn = await service.getCurrentFqdn(fqdn);

      if (!currentFqdn) {
        log.debug(`[MCP Registry] Not found: ${fqdn}`);
        return jsonResponse(
          { error: "not_found", message: `MCP not found: ${fqdn}` },
          404,
          corsHeaders,
        );
      }

      // Redirect to full FQDN with hash
      const redirectUrl = new URL(url);
      redirectUrl.pathname = `/api/registry/${currentFqdn}`;

      return new Response(null, {
        status: 302,
        headers: {
          ...corsHeaders,
          "Location": redirectUrl.toString(),
          "X-PML-Current-FQDN": currentFqdn,
        },
      });
    }

    // 5-part FQDN: exact match
    const entry = await service.getByFqdn(fqdn);

    if (!entry) {
      // Check if exists with different hash
      const baseFqdn = fqdn.split(".").slice(0, 4).join(".");
      const currentFqdn = await service.getCurrentFqdn(baseFqdn);

      if (currentFqdn && currentFqdn !== fqdn) {
        return jsonResponse(
          {
            error: "hash_mismatch",
            message: `Hash mismatch for ${fqdn}. Current version has different hash.`,
            currentFqdn,
          },
          404,
          { ...corsHeaders, "X-PML-Current-FQDN": currentFqdn },
        );
      }

      return jsonResponse(
        { error: "not_found", message: `MCP not found: ${fqdn}` },
        404,
        corsHeaders,
      );
    }

    // Check If-None-Match for caching
    const clientEtag = req.headers.get("If-None-Match");
    const serverEtag = `"${entry.integrity}"`;

    if (clientEtag === serverEtag) {
      return new Response(null, {
        status: 304,
        headers: { ...corsHeaders, ETag: serverEtag },
      });
    }

    // Content negotiation: JSON metadata or TypeScript code
    if (wantsJson(req)) {
      // Return JSON metadata with codeUrl pointing to this same endpoint
      const baseUrl = `${url.protocol}//${url.host}`;
      const entryWithCodeUrl = {
        ...entry,
        codeUrl: `${baseUrl}/api/registry/${fqdn}`,
      };

      const headers: Record<string, string> = {
        ...corsHeaders,
        "Content-Type": "application/json",
        "X-PML-Type": entry.type,
        "X-PML-Routing": entry.routing,
        "ETag": serverEtag,
        "Cache-Control": "public, max-age=3600",
      };

      return jsonResponse(entryWithCodeUrl, 200, headers);
    }

    // Return TypeScript code for dynamic import
    const code = await service.getCode(fqdn);

    if (!code) {
      return jsonResponse(
        { error: "no_code", message: `No code available for ${fqdn}` },
        404,
        corsHeaders,
      );
    }

    return new Response(code, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/typescript",
        "X-PML-Type": entry.type,
        "X-PML-Routing": entry.routing,
        "ETag": serverEtag,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    log.error(`[MCP Registry] Error for ${fqdn}: ${error}`);
    return jsonResponse(
      { error: "internal_error", message: "Internal server error" },
      500,
      corsHeaders,
    );
  }
}

/**
 * GET /api/registry - List MCPs with filtering
 *
 * Query params:
 * - type: "deno" | "stdio" | "http"
 * - routing: "client" | "server"
 * - page: number (default 1)
 * - limit: number (default 50, max 100)
 * - search: string (search in name/description)
 */
export async function handleMcpRegistryList(
  _req: Request,
  url: URL,
  ctx: RouteContext,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  try {
    const service = new McpRegistryService(ctx.db!);

    // Parse query params
    const type = url.searchParams.get("type") as "deno" | "stdio" | "http" | null;
    const routing = url.searchParams.get("routing") as "client" | "server" | null;
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
    const search = url.searchParams.get("search") || undefined;

    const options: Record<string, unknown> = { page, limit };
    if (type) options.type = type;
    if (routing) options.routing = routing;
    if (search) options.search = search;

    const catalog = await service.list(options);

    return jsonResponse(catalog, 200, {
      ...corsHeaders,
      "Cache-Control": "public, max-age=60",
    });
  } catch (error) {
    log.error(`[MCP Registry] List error: ${error}`);
    return jsonResponse(
      { error: "internal_error", message: "Internal server error" },
      500,
      corsHeaders,
    );
  }
}

/**
 * Route /api/registry requests
 */
export async function handleMcpRegistryRoutes(
  req: Request,
  url: URL,
  ctx: RouteContext,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  if (req.method !== "GET") {
    return null;
  }

  // GET /api/registry - list all MCPs
  if (url.pathname === "/api/registry") {
    return handleMcpRegistryList(req, url, ctx, corsHeaders);
  }

  // GET /api/registry/{fqdn} - get specific MCP
  if (url.pathname.startsWith("/api/registry/")) {
    return handleMcpRegistryGet(req, url, ctx, corsHeaders);
  }

  return null;
}
