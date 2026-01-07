/**
 * Graph API Route Handlers
 *
 * Handles all /api/graph/* endpoints for the MCP Gateway.
 *
 * @module mcp/routing/handlers/graph
 */

import * as log from "@std/log";
import type { RouteContext } from "../mcp/routing/types.ts";
import { errorResponse, jsonResponse } from "../mcp/routing/types.ts";
import type { HypergraphOptions } from "../capabilities/types.ts";
import { mapEdgeData, mapNodeData } from "./graph-mappers.ts";
import { handleGraphInsights } from "./graph-insights.ts";

/**
 * GET /api/graph/snapshot
 *
 * Returns the current graph snapshot for visualization (Story 6.2)
 */
export function handleGraphSnapshot(
  _req: Request,
  _url: URL,
  ctx: RouteContext,
  corsHeaders: Record<string, string>,
): Response {
  try {
    const snapshot = ctx.graphEngine.getGraphSnapshot();
    return jsonResponse(snapshot, 200, corsHeaders);
  } catch (error) {
    log.error(`Failed to get graph snapshot: ${error}`);
    return errorResponse(`Failed to get graph snapshot: ${error}`, 500, corsHeaders);
  }
}

/**
 * GET /api/graph/path
 *
 * Find shortest path between two nodes (Story 6.4 AC4)
 *
 * Query params:
 * - from: Source node ID (required)
 * - to: Target node ID (required)
 */
export function handleGraphPath(
  _req: Request,
  url: URL,
  ctx: RouteContext,
  corsHeaders: Record<string, string>,
): Response {
  try {
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";

    if (!from || !to) {
      return errorResponse(
        "Missing required parameters: 'from' and 'to'",
        400,
        corsHeaders,
      );
    }

    const path = ctx.graphEngine.findShortestPath(from, to);
    return jsonResponse(
      {
        path: path || [],
        total_hops: path ? path.length - 1 : -1,
        from,
        to,
      },
      200,
      corsHeaders,
    );
  } catch (error) {
    log.error(`Path finding failed: ${error}`);
    return errorResponse(`Path finding failed: ${error}`, 500, corsHeaders);
  }
}

/**
 * GET /api/graph/related
 *
 * Find related tools using Adamic-Adar similarity (Story 6.4 AC6)
 *
 * Query params:
 * - tool_id: Tool ID to find related tools for (required)
 * - limit: Max results (default: 5)
 */
export function handleGraphRelated(
  _req: Request,
  url: URL,
  ctx: RouteContext,
  corsHeaders: Record<string, string>,
): Response {
  try {
    const toolId = url.searchParams.get("tool_id") || "";
    const limit = parseInt(url.searchParams.get("limit") || "5", 10);

    if (!toolId) {
      return errorResponse(
        "Missing required parameter: 'tool_id'",
        400,
        corsHeaders,
      );
    }

    const related = ctx.graphEngine.computeAdamicAdar(toolId, limit);

    // Enrich with server info and edge data
    const enrichedRelated = related.map((r) => {
      const edgeData = ctx.graphEngine.getEdgeData(toolId, r.toolId) ||
        ctx.graphEngine.getEdgeData(r.toolId, toolId);

      // Extract server and name from tool_id
      let server = "unknown";
      let name = r.toolId;
      if (r.toolId.includes(":")) {
        const colonIndex = r.toolId.indexOf(":");
        server = r.toolId.substring(0, colonIndex);
        name = r.toolId.substring(colonIndex + 1);
      }

      return {
        tool_id: r.toolId,
        name,
        server,
        adamic_adar_score: Math.round(r.score * 1000) / 1000,
        edge_confidence: edgeData?.weight ?? null,
      };
    });

    return jsonResponse(
      {
        tool_id: toolId,
        related: enrichedRelated,
      },
      200,
      corsHeaders,
    );
  } catch (error) {
    log.error(`Related tools lookup failed: ${error}`);
    return errorResponse(`Related tools lookup failed: ${error}`, 500, corsHeaders);
  }
}

/**
 * GET /api/graph/community
 *
 * Find nodes in the same Louvain community as the given node
 *
 * Query params:
 * - node_id: Node ID to find community for (required)
 * - limit: Max results (default: 20)
 */
export function handleGraphCommunity(
  _req: Request,
  url: URL,
  ctx: RouteContext,
  corsHeaders: Record<string, string>,
): Response {
  try {
    const nodeId = url.searchParams.get("node_id") || "";
    const limit = parseInt(url.searchParams.get("limit") || "20", 10);

    if (!nodeId) {
      return errorResponse(
        "Missing required parameter: 'node_id'",
        400,
        corsHeaders,
      );
    }

    // Get community ID for the node
    const communityId = ctx.graphEngine.getCommunity(nodeId);
    if (communityId === undefined) {
      return jsonResponse(
        {
          node_id: nodeId,
          community_id: null,
          members: [],
          member_count: 0,
        },
        200,
        corsHeaders,
      );
    }

    // Get all members in this community
    const memberIds = ctx.graphEngine.findCommunityMembers(nodeId);

    // Enrich with PageRank and metadata, sorted by PageRank
    const enrichedMembers = memberIds
      .filter((id) => id !== nodeId) // Exclude the source node
      .map((memberId) => {
        const pagerank = ctx.graphEngine.getPageRank(memberId);
        let server = "unknown";
        let name = memberId;
        if (memberId.includes(":")) {
          const colonIndex = memberId.indexOf(":");
          server = memberId.substring(0, colonIndex);
          name = memberId.substring(colonIndex + 1);
        }
        return {
          id: memberId,
          name,
          server,
          pagerank: Math.round(pagerank * 1000) / 1000,
        };
      })
      .sort((a, b) => b.pagerank - a.pagerank)
      .slice(0, limit);

    return jsonResponse(
      {
        node_id: nodeId,
        community_id: parseInt(communityId, 10),
        members: enrichedMembers,
        member_count: memberIds.length - 1, // Exclude source node
      },
      200,
      corsHeaders,
    );
  } catch (error) {
    log.error(`Community lookup failed: ${error}`);
    return errorResponse(`Community lookup failed: ${error}`, 500, corsHeaders);
  }
}

/**
 * GET /api/graph/neighbors
 *
 * Get direct neighbors of a node, sorted by PageRank
 *
 * Query params:
 * - node_id: Node ID to find neighbors for (required)
 * - limit: Max results (default: 10)
 */
export function handleGraphNeighbors(
  _req: Request,
  url: URL,
  ctx: RouteContext,
  corsHeaders: Record<string, string>,
): Response {
  try {
    const nodeId = url.searchParams.get("node_id") || "";
    const limit = parseInt(url.searchParams.get("limit") || "10", 10);

    if (!nodeId) {
      return errorResponse(
        "Missing required parameter: 'node_id'",
        400,
        corsHeaders,
      );
    }

    // Get neighbors using the graph engine
    const neighbors = ctx.graphEngine.getNeighbors(nodeId);

    // Enrich with PageRank, edge data, sorted by PageRank
    const enrichedNeighbors = neighbors
      .map((neighborId) => {
        const pagerank = ctx.graphEngine.getPageRank(neighborId);
        const edgeData = ctx.graphEngine.getEdgeData(nodeId, neighborId) ||
          ctx.graphEngine.getEdgeData(neighborId, nodeId);

        let server = "unknown";
        let name = neighborId;
        if (neighborId.includes(":")) {
          const colonIndex = neighborId.indexOf(":");
          server = neighborId.substring(0, colonIndex);
          name = neighborId.substring(colonIndex + 1);
        }

        return {
          id: neighborId,
          name,
          server,
          pagerank: Math.round(pagerank * 1000) / 1000,
          edge_weight: edgeData?.weight ?? null,
          edge_type: edgeData?.edge_type ?? null,
          edge_source: edgeData?.edge_source ?? null,
        };
      })
      .sort((a, b) => b.pagerank - a.pagerank)
      .slice(0, limit);

    return jsonResponse(
      {
        node_id: nodeId,
        neighbors: enrichedNeighbors,
        neighbor_count: neighbors.length,
      },
      200,
      corsHeaders,
    );
  } catch (error) {
    log.error(`Neighbors lookup failed: ${error}`);
    return errorResponse(`Neighbors lookup failed: ${error}`, 500, corsHeaders);
  }
}


// handleGraphInsights is imported from ./graph-insights.ts
export { handleGraphInsights } from "./graph-insights.ts";

/**
 * GET /api/graph/hypergraph
 *
 * Returns hypergraph data for capability visualization (Story 8.1, 8.2, 8.3)
 *
 * Query params:
 * - include_tools: Include tool nodes (default: true)
 * - include_orphans: Include orphan tools with no parent capabilities (default: false for perf)
 * - min_success_rate: Filter by minimum success rate (0-1)
 * - min_usage: Filter by minimum usage count
 */
export async function handleGraphHypergraph(
  req: Request,
  url: URL,
  ctx: RouteContext,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  try {
    if (!ctx.capabilityDataService) {
      return errorResponse("CapabilityDataService not configured", 503, corsHeaders);
    }

    // Parse query parameters
    const options: HypergraphOptions = {};

    const includeToolsParam = url.searchParams.get("include_tools");
    if (includeToolsParam !== null) {
      options.includeTools = includeToolsParam === "true";
    }

    // Performance: Default to false to avoid sending 450+ orphan tool nodes
    const includeOrphansParam = url.searchParams.get("include_orphans");
    options.includeOrphans = includeOrphansParam === "true"; // Default false for perf

    const minSuccessRateParam = url.searchParams.get("min_success_rate");
    if (minSuccessRateParam) {
      const minSuccessRate = parseFloat(minSuccessRateParam);
      if (!isNaN(minSuccessRate)) {
        if (minSuccessRate < 0 || minSuccessRate > 1) {
          return errorResponse(
            "min_success_rate must be between 0 and 1",
            400,
            corsHeaders,
          );
        }
        options.minSuccessRate = minSuccessRate;
      }
    }

    const minUsageParam = url.searchParams.get("min_usage");
    if (minUsageParam) {
      const minUsage = parseInt(minUsageParam, 10);
      if (!isNaN(minUsage)) {
        if (minUsage < 0) {
          return errorResponse("min_usage must be >= 0", 400, corsHeaders);
        }
        options.minUsage = minUsage;
      }
    }

    // Story 11.4: Include execution traces for each capability
    const includeTracesParam = url.searchParams.get("include_traces");
    if (includeTracesParam !== null) {
      options.includeTraces = includeTracesParam === "true";
    }

    // Build hypergraph data
    const result = await ctx.capabilityDataService.buildHypergraphData(options);

    const response = {
      nodes: result.nodes.map(mapNodeData),
      edges: result.edges.map(mapEdgeData),
      capability_zones: result.capabilityZones || [],
      capabilities_count: result.capabilitiesCount,
      tools_count: result.toolsCount,
      metadata: {
        generated_at: result.metadata.generatedAt,
        version: result.metadata.version,
      },
    };

    // Generate ETag from response content hash for caching
    const responseBody = JSON.stringify(response);
    const etag = `"${await generateETag(responseBody)}"`;

    // Check If-None-Match header for conditional GET
    const ifNoneMatch = req.headers.get("If-None-Match");
    if (ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: { ...corsHeaders, "ETag": etag },
      });
    }

    return new Response(responseBody, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "ETag": etag,
        "Cache-Control": "private, max-age=5", // 5s cache, revalidate with ETag
      },
    });
  } catch (error) {
    log.error(`Hypergraph generation failed: ${error}`);
    return errorResponse(`Failed to build hypergraph: ${error}`, 500, corsHeaders);
  }
}

/**
 * Generate a short ETag hash from response body
 */
async function generateETag(body: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(body);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  // Use first 16 bytes for shorter ETag
  return hashArray.slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Route all /api/graph/* requests
 */
export async function handleGraphRoutes(
  req: Request,
  url: URL,
  ctx: RouteContext,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  if (!url.pathname.startsWith("/api/graph/")) {
    return null;
  }

  if (req.method !== "GET") {
    return new Response(null, { status: 405, headers: corsHeaders });
  }

  switch (url.pathname) {
    case "/api/graph/snapshot":
      return handleGraphSnapshot(req, url, ctx, corsHeaders);
    case "/api/graph/path":
      return handleGraphPath(req, url, ctx, corsHeaders);
    case "/api/graph/related":
      return handleGraphRelated(req, url, ctx, corsHeaders);
    case "/api/graph/community":
      return handleGraphCommunity(req, url, ctx, corsHeaders);
    case "/api/graph/neighbors":
      return handleGraphNeighbors(req, url, ctx, corsHeaders);
    case "/api/graph/hypergraph":
      return await handleGraphHypergraph(req, url, ctx, corsHeaders);
    case "/api/graph/insights":
      return await handleGraphInsights(req, url, ctx, corsHeaders);
    default:
      return null;
  }
}
