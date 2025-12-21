/**
 * Discover Handler (Story 10.6)
 *
 * Unified discovery API for tools and capabilities.
 * Implements Active Search mode from ADR-038.
 *
 * Algorithms used:
 * - Tools: Hybrid Search (α × semantic + (1-α) × graph)
 * - Capabilities: Capability Match (semantic × reliabilityFactor)
 *
 * @module mcp/handlers/discover-handler
 */

import * as log from "@std/log";
import type { GraphRAGEngine } from "../../graphrag/graph-engine.ts";
import type { VectorSearch } from "../../vector/search.ts";
import type { DAGSuggester } from "../../graphrag/dag-suggester.ts";
import type { MCPToolResponse, MCPErrorResponse } from "../server/types.ts";
import { formatMCPSuccess } from "../server/responses.ts";
import { addBreadcrumb, captureError, startTransaction } from "../../telemetry/sentry.ts";
import type { HybridSearchResult } from "../../graphrag/types.ts";
import type { CapabilityMatch } from "../../capabilities/types.ts";

/**
 * Discover request arguments
 */
export interface DiscoverArgs {
  intent?: string;
  filter?: {
    type?: "tool" | "capability" | "all";
    minScore?: number;
  };
  limit?: number;
  include_related?: boolean;
}

/**
 * Related tool in discover response
 */
interface RelatedToolResponse {
  tool_id: string;
  relation: string;
  score: number;
}

/**
 * Unified discover result item
 */
interface DiscoverResultItem {
  type: "tool" | "capability";
  id: string;
  name: string;
  description: string;
  score: number;
  // Tool-specific fields
  server_id?: string;
  input_schema?: Record<string, unknown>;
  related_tools?: RelatedToolResponse[];
  // Capability-specific fields
  code_snippet?: string;
  success_rate?: number;
  usage_count?: number;
  semantic_score?: number;
}

/**
 * Discover response format
 */
interface DiscoverResponse {
  results: DiscoverResultItem[];
  meta: {
    query: string;
    filter_type: string;
    total_found: number;
    tools_count: number;
    capabilities_count: number;
  };
}

/**
 * Handle pml:discover request (Story 10.6)
 *
 * Unified search across tools and capabilities with merged, sorted results.
 *
 * @param args - Discover arguments (intent, filter, limit, include_related)
 * @param vectorSearch - Vector search for semantic matching
 * @param graphEngine - GraphRAG engine for hybrid tool search
 * @param dagSuggester - DAG suggester for capability search
 * @returns Unified discover results
 */
export async function handleDiscover(
  args: unknown,
  vectorSearch: VectorSearch,
  graphEngine: GraphRAGEngine,
  dagSuggester: DAGSuggester,
): Promise<MCPToolResponse | MCPErrorResponse> {
  const transaction = startTransaction("mcp.discover", "mcp");
  const startTime = performance.now();

  try {
    const params = args as DiscoverArgs;

    // Validate required intent parameter
    if (!params.intent || typeof params.intent !== "string") {
      transaction.finish();
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "Missing required parameter: 'intent'",
          }),
        }],
      };
    }

    const intent = params.intent;
    const filterType = params.filter?.type ?? "all";
    const minScore = params.filter?.minScore ?? 0.0;
    const limit = Math.min(params.limit ?? 10, 50); // Max 50
    const includeRelated = params.include_related ?? false;

    transaction.setData("intent", intent);
    transaction.setData("filter_type", filterType);
    transaction.setData("limit", limit);
    addBreadcrumb("mcp", "Processing discover request", { intent, filterType });

    log.info(`discover: intent="${intent}", filter=${filterType}, limit=${limit}`);

    const results: DiscoverResultItem[] = [];
    let toolsCount = 0;
    let capabilitiesCount = 0;

    // Search tools if filter allows
    if (filterType === "all" || filterType === "tool") {
      const toolResults = await searchTools(
        intent,
        vectorSearch,
        graphEngine,
        limit,
        includeRelated,
      );
      for (const tool of toolResults) {
        if (tool.score >= minScore) {
          results.push(tool);
          toolsCount++;
        }
      }
    }

    // Search capabilities if filter allows
    if (filterType === "all" || filterType === "capability") {
      const capabilityResult = await searchCapability(intent, dagSuggester);
      if (capabilityResult && capabilityResult.score >= minScore) {
        results.push(capabilityResult);
        capabilitiesCount++;
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    // Apply limit after merge and sort
    const limitedResults = results.slice(0, limit);

    const response: DiscoverResponse = {
      results: limitedResults,
      meta: {
        query: intent,
        filter_type: filterType,
        total_found: results.length,
        tools_count: toolsCount,
        capabilities_count: capabilitiesCount,
      },
    };

    const elapsedMs = performance.now() - startTime;
    log.info(
      `discover: found ${limitedResults.length} results (${toolsCount} tools, ${capabilitiesCount} capabilities) in ${elapsedMs.toFixed(1)}ms`,
    );

    transaction.finish();
    return formatMCPSuccess(response);
  } catch (error) {
    log.error(`discover error: ${error}`);
    captureError(error as Error, {
      operation: "discover",
      handler: "handleDiscover",
    });
    transaction.finish();
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: `Discover failed: ${(error as Error).message}`,
        }),
      }],
    };
  }
}

/**
 * Search tools using hybrid search (ADR-038 §2.1)
 */
async function searchTools(
  intent: string,
  vectorSearch: VectorSearch,
  graphEngine: GraphRAGEngine,
  limit: number,
  includeRelated: boolean,
): Promise<DiscoverResultItem[]> {
  const hybridResults: HybridSearchResult[] = await graphEngine.searchToolsHybrid(
    vectorSearch,
    intent,
    limit,
    [], // contextTools - could be enhanced later
    includeRelated,
  );

  return hybridResults.map((result) => {
    const item: DiscoverResultItem = {
      type: "tool",
      id: result.toolId,
      name: extractToolName(result.toolId),
      description: result.description,
      score: result.finalScore,
      server_id: result.serverId,
      input_schema: result.schema?.inputSchema as Record<string, unknown> | undefined,
    };

    // Add related tools if present
    if (result.relatedTools && result.relatedTools.length > 0) {
      item.related_tools = result.relatedTools.map((rt) => ({
        tool_id: rt.toolId,
        relation: rt.relation,
        score: rt.score,
      }));
    }

    return item;
  });
}

/**
 * Search capabilities using capability matcher (ADR-038 §3.1)
 */
async function searchCapability(
  intent: string,
  dagSuggester: DAGSuggester,
): Promise<DiscoverResultItem | null> {
  const match: CapabilityMatch | null = await dagSuggester.searchCapabilities(intent);

  if (!match) {
    return null;
  }

  return {
    type: "capability",
    id: match.capability.id,
    name: match.capability.name ?? match.capability.id.substring(0, 8),
    description: match.capability.description ?? "Learned capability",
    score: match.score,
    code_snippet: match.capability.codeSnippet,
    success_rate: match.capability.successRate,
    usage_count: match.capability.usageCount,
    semantic_score: match.semanticScore,
  };
}

/**
 * Extract tool name from tool ID
 *
 * @example "filesystem:read_file" → "read_file"
 */
function extractToolName(toolId: string): string {
  const parts = toolId.split(":");
  return parts.length > 1 ? parts.slice(1).join(":") : toolId;
}
