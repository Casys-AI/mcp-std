/**
 * Graph Insights Handler
 *
 * Unified endpoint that returns related nodes from ALL algorithms,
 * deduplicated by node_id with algorithm badges.
 *
 * @module api/graph-insights
 */

import * as log from "@std/log";
import type { RouteContext } from "../mcp/routing/types.ts";
import { errorResponse, jsonResponse } from "../mcp/routing/types.ts";

/** Algorithm contribution to a node's discovery */
interface AlgorithmScore {
  score: number;
  rank?: number;
  metadata?: Record<string, unknown>;
}

/** Unified insight item - a node discovered by one or more algorithms */
interface InsightItem {
  id: string;
  name: string;
  type: "tool" | "capability";
  server?: string;
  algorithms: Record<string, AlgorithmScore>;
  combinedScore: number;
}

/** Response for /api/graph/insights */
interface InsightsResponse {
  nodeId: string;
  nodeType: "tool" | "capability";
  items: InsightItem[];
  algorithmStats: Record<string, { count: number; avgScore: number }>;
}

/** Algorithm weights for combined score calculation */
const ALGO_WEIGHTS: Record<string, number> = {
  neighbors: 1.0,
  co_occurrence: 0.9,
  louvain: 0.8,
  adamic_adar: 0.7,
  hyperedge: 0.6,
  spectral: 0.5,
};

/**
 * GET /api/graph/insights
 *
 * Query params:
 * - node_id: Node ID to find insights for (required)
 * - limit: Max results per algorithm (default: 10)
 *
 * Algorithms included:
 * - louvain: Community members (same Louvain cluster)
 * - neighbors: Direct neighbors sorted by PageRank
 * - adamic_adar: Adamic-Adar similarity (for tools)
 * - hyperedge: Capabilities sharing tools (hyperedge overlap)
 * - spectral: Same spectral cluster
 * - co_occurrence: Capabilities that co-occur in execution traces
 */
export async function handleGraphInsights(
  _req: Request,
  url: URL,
  ctx: RouteContext,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  try {
    const nodeId = url.searchParams.get("node_id") || "";
    const limit = parseInt(url.searchParams.get("limit") || "10", 10);

    if (!nodeId) {
      return errorResponse("Missing required parameter: 'node_id'", 400, corsHeaders);
    }

    const isCapability = nodeId.startsWith("cap:") || !nodeId.includes(":");
    const nodeType: "tool" | "capability" = isCapability ? "capability" : "tool";

    const itemsMap = new Map<string, InsightItem>();

    // Helper to add/merge algorithm result
    const addResult = (
      id: string,
      name: string,
      type: "tool" | "capability",
      server: string | undefined,
      algorithm: string,
      score: number,
      rank: number,
      metadata?: Record<string, unknown>,
    ) => {
      const existing = itemsMap.get(id);
      if (existing) {
        existing.algorithms[algorithm] = { score, rank, metadata };
      } else {
        itemsMap.set(id, {
          id,
          name,
          type,
          server,
          algorithms: { [algorithm]: { score, rank, metadata } },
          combinedScore: 0,
        });
      }
    };

    const parseNodeId = (id: string): { server: string; name: string } => {
      if (id.includes(":")) {
        const colonIndex = id.indexOf(":");
        return {
          server: id.substring(0, colonIndex),
          name: id.substring(colonIndex + 1),
        };
      }
      return { server: "unknown", name: id };
    };

    // Build capability displayName lookup
    const capabilityNames = new Map<string, string>();
    if (ctx.capabilityDataService) {
      try {
        const capList = await ctx.capabilityDataService.listCapabilities({ limit: 200 });
        for (const cap of capList.capabilities) {
          capabilityNames.set(cap.id, cap.name || cap.id);
        }
      } catch (e) {
        log.warn(`Failed to build capability names lookup: ${e}`);
      }
    }

    const getNodeDisplayName = (id: string, type: "tool" | "capability"): string => {
      if (type === "capability") {
        return capabilityNames.get(id) || id.replace(/^cap:/, "");
      }
      return parseNodeId(id).name;
    };

    // 1. Louvain Community Members
    try {
      const communityId = ctx.graphEngine.getCommunity(nodeId);
      if (communityId !== undefined) {
        const memberIds = ctx.graphEngine.findCommunityMembers(nodeId);
        const members = memberIds
          .filter((id) => id !== nodeId)
          .map((id) => ({ id, pagerank: ctx.graphEngine.getPageRank(id) }))
          .sort((a, b) => b.pagerank - a.pagerank)
          .slice(0, limit);

        members.forEach((member, idx) => {
          const { server } = parseNodeId(member.id);
          const memberType: "tool" | "capability" = member.id.startsWith("cap:") ? "capability" : "tool";
          addResult(
            member.id,
            getNodeDisplayName(member.id, memberType),
            memberType,
            memberType === "capability" ? undefined : server,
            "louvain",
            member.pagerank,
            idx + 1,
            { communityId: parseInt(communityId, 10) },
          );
        });
      }
    } catch (e) {
      log.warn(`Louvain failed for ${nodeId}: ${e}`);
    }

    // 2. PageRank Neighbors
    try {
      const neighborIds = ctx.graphEngine.getNeighbors(nodeId);
      const neighbors = neighborIds
        .map((id) => ({
          id,
          pagerank: ctx.graphEngine.getPageRank(id),
          edgeData: ctx.graphEngine.getEdgeData(nodeId, id) || ctx.graphEngine.getEdgeData(id, nodeId),
        }))
        .sort((a, b) => b.pagerank - a.pagerank)
        .slice(0, limit);

      neighbors.forEach((neighbor, idx) => {
        const { server } = parseNodeId(neighbor.id);
        const neighborType: "tool" | "capability" = neighbor.id.startsWith("cap:") ? "capability" : "tool";
        addResult(
          neighbor.id,
          getNodeDisplayName(neighbor.id, neighborType),
          neighborType,
          neighborType === "capability" ? undefined : server,
          "neighbors",
          neighbor.pagerank,
          idx + 1,
          { edgeWeight: neighbor.edgeData?.weight ?? null, edgeType: neighbor.edgeData?.edge_type ?? null },
        );
      });
    } catch (e) {
      log.warn(`Neighbors failed for ${nodeId}: ${e}`);
    }

    // 3. Adamic-Adar (for tools)
    if (nodeType === "tool") {
      try {
        const related = ctx.graphEngine.computeAdamicAdar(nodeId, limit);
        related.forEach((r, idx) => {
          const { server, name } = parseNodeId(r.toolId);
          addResult(r.toolId, name, "tool", server, "adamic_adar", r.score, idx + 1);
        });
      } catch (e) {
        log.warn(`Adamic-Adar failed for ${nodeId}: ${e}`);
      }
    }

    // 4. Hyperedge Overlap (for capabilities)
    if (nodeType === "capability" && ctx.capabilityDataService) {
      try {
        const capList = await ctx.capabilityDataService.listCapabilities({ limit: 100 });
        const sourceCapability = capList.capabilities.find((c) => c.id === nodeId);

        if (sourceCapability && sourceCapability.toolsUsed.length > 0) {
          const sourceTools = new Set(sourceCapability.toolsUsed);
          const overlaps = capList.capabilities
            .filter((c) => c.id !== nodeId)
            .map((c) => {
              const sharedCount = c.toolsUsed.filter((t) => sourceTools.has(t)).length;
              const unionCount = new Set([...sourceCapability.toolsUsed, ...c.toolsUsed]).size;
              return { capability: c, sharedCount, jaccardScore: unionCount > 0 ? sharedCount / unionCount : 0 };
            })
            .filter((o) => o.sharedCount > 0)
            .sort((a, b) => b.jaccardScore - a.jaccardScore)
            .slice(0, limit);

          overlaps.forEach((overlap, idx) => {
            addResult(
              overlap.capability.id,
              overlap.capability.name || overlap.capability.id,
              "capability",
              undefined,
              "hyperedge",
              overlap.jaccardScore,
              idx + 1,
              { sharedTools: overlap.sharedCount },
            );
          });
        }
      } catch (e) {
        log.warn(`Hyperedge overlap failed for ${nodeId}: ${e}`);
      }
    }

    // 5. Co-occurrence from execution traces
    if (nodeType === "capability" && ctx.capabilityDataService) {
      try {
        const cooccurring = await ctx.capabilityDataService.findCoOccurringCapabilities(nodeId, limit);
        cooccurring.forEach((co, idx) => {
          const normalizedScore = Math.min(1.0, Math.log10(co.cooccurrenceCount + 1) / 2);
          addResult(
            co.capabilityId,
            co.name || co.capabilityId,
            "capability",
            undefined,
            "co_occurrence",
            normalizedScore,
            idx + 1,
            { count: co.cooccurrenceCount, lastSeen: co.lastSeen },
          );
        });
      } catch (e) {
        log.warn(`Co-occurrence failed for ${nodeId}: ${e}`);
      }
    }

    // 6. Spectral Clustering
    if (ctx.dagSuggester) {
      try {
        const pageranks = ctx.dagSuggester.getCapabilityPageranks();
        if (pageranks.size > 0) {
          const capList = await ctx.capabilityDataService?.listCapabilities({ limit: 100 });
          if (capList) {
            ctx.dagSuggester.ensurePageranksComputed(
              capList.capabilities.map((c) => ({ id: c.id, toolsUsed: c.toolsUsed })),
            );
            const sourcePagerank = pageranks.get(nodeId) || 0;
            if (sourcePagerank > 0) {
              const spectralPeers = capList.capabilities
                .filter((c) => c.id !== nodeId && pageranks.has(c.id))
                .map((c) => ({
                  capability: c,
                  pagerank: pageranks.get(c.id) || 0,
                  distance: Math.abs((pageranks.get(c.id) || 0) - sourcePagerank),
                }))
                .sort((a, b) => a.distance - b.distance)
                .slice(0, limit);

              spectralPeers.forEach((peer, idx) => {
                addResult(
                  peer.capability.id,
                  peer.capability.name || peer.capability.id,
                  "capability",
                  undefined,
                  "spectral",
                  1 - peer.distance,
                  idx + 1,
                  { pagerank: peer.pagerank },
                );
              });
            }
          }
        }
      } catch (e) {
        log.warn(`Spectral clustering failed for ${nodeId}: ${e}`);
      }
    }

    // Calculate combined scores
    const items = Array.from(itemsMap.values());
    for (const item of items) {
      const algoEntries = Object.entries(item.algorithms);
      let weightedSum = 0;
      let totalWeight = 0;

      for (const [algo, data] of algoEntries) {
        const weight = ALGO_WEIGHTS[algo] || 0.5;
        weightedSum += data.score * weight;
        totalWeight += weight;
      }

      const baseScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
      const algoBoost = Math.min(1.5, 1 + (algoEntries.length - 1) * 0.1);
      item.combinedScore = Math.round(baseScore * algoBoost * 1000) / 1000;
    }

    items.sort((a, b) => b.combinedScore - a.combinedScore);

    // Calculate algorithm stats
    const algorithmStats: Record<string, { count: number; avgScore: number }> = {};
    for (const item of items) {
      for (const [algo, data] of Object.entries(item.algorithms)) {
        if (!algorithmStats[algo]) {
          algorithmStats[algo] = { count: 0, avgScore: 0 };
        }
        algorithmStats[algo].count++;
        algorithmStats[algo].avgScore += data.score;
      }
    }
    for (const algo of Object.keys(algorithmStats)) {
      algorithmStats[algo].avgScore =
        Math.round((algorithmStats[algo].avgScore / algorithmStats[algo].count) * 1000) / 1000;
    }

    const response: InsightsResponse = { nodeId, nodeType, items, algorithmStats };
    return jsonResponse(response, 200, corsHeaders);
  } catch (error) {
    log.error(`Graph insights failed: ${error}`);
    return errorResponse(`Failed to compute insights: ${error}`, 500, corsHeaders);
  }
}
