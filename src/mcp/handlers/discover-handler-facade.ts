/**
 * Discover Handler Facade
 *
 * Thin facade that routes discover requests to use cases with optimized
 * embedding generation (single encoding shared across use cases).
 *
 * Phase 3.2: Performance optimization - avoids duplicate embedding generation.
 *
 * @module mcp/handlers/discover-handler-facade
 */

import * as log from "@std/log";
import { addBreadcrumb, captureError, startTransaction } from "../../telemetry/sentry.ts";
import { formatMCPSuccess } from "../server/responses.ts";
import type { MCPToolResponse, MCPErrorResponse } from "../server/types.ts";
import {
  DiscoverToolsUseCase,
  DiscoverCapabilitiesUseCase,
  type DiscoveredTool,
  type DiscoveredCapability,
} from "../../application/use-cases/discover/mod.ts";
import type { IDecisionLogger } from "../../telemetry/decision-logger.ts";

// ============================================================================
// Types
// ============================================================================

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
 * Unified discover result item
 */
type DiscoverResultItem = DiscoveredTool | DiscoveredCapability;

/**
 * Discover response format
 */
interface DiscoverResponse {
  results: DiscoverResultItem[];
  meta: {
    query: string;
    filter_type: string;
    total_found: number;
    returned_count: number;
    tools_count: number;
    capabilities_count: number;
  };
}

/**
 * Embedding model interface
 */
export interface IEmbeddingModel {
  encode(text: string): Promise<number[]>;
}

/**
 * Dependencies for DiscoverHandlerFacade
 */
export interface DiscoverHandlerFacadeDeps {
  toolsUseCase: DiscoverToolsUseCase;
  capabilitiesUseCase: DiscoverCapabilitiesUseCase;
  embeddingModel?: IEmbeddingModel;
  decisionLogger?: IDecisionLogger;
}

// ============================================================================
// Facade Implementation
// ============================================================================

/**
 * Discover Handler Facade
 *
 * Optimizes discover requests by:
 * 1. Generating embedding once and sharing across use cases
 * 2. Keeping use case instances as singletons
 * 3. Applying softmax normalization to final results
 */
export class DiscoverHandlerFacade {
  constructor(private readonly deps: DiscoverHandlerFacadeDeps) {}

  /**
   * Handle pml:discover request
   */
  async handle(args: unknown): Promise<MCPToolResponse | MCPErrorResponse> {
    const transaction = startTransaction("mcp.discover", "mcp");
    const startTime = performance.now();
    const correlationId = crypto.randomUUID();

    try {
      const params = args as DiscoverArgs;

      // Validate required intent parameter
      if (!params.intent || typeof params.intent !== "string" || !params.intent.trim()) {
        transaction.finish();
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: "Missing or empty required parameter: 'intent'" }),
          }],
        };
      }

      const intent = params.intent;
      const filterType = params.filter?.type ?? "all";
      const minScore = params.filter?.minScore ?? 0.0;
      const limit = Math.min(params.limit ?? 1, 50);
      const includeRelated = params.include_related ?? false;

      transaction.setData("intent", intent);
      transaction.setData("filter_type", filterType);
      transaction.setData("limit", limit);
      addBreadcrumb("mcp", "Processing discover request", { intent, filterType });

      log.info(`discover: intent="${intent}", filter=${filterType}, limit=${limit}, includeRelated=${includeRelated}`);

      // Generate embedding ONCE for all use cases
      let intentEmbedding: number[] | undefined;
      if (this.deps.embeddingModel) {
        try {
          const embedStart = performance.now();
          intentEmbedding = await this.deps.embeddingModel.encode(intent);
          const embedTime = performance.now() - embedStart;
          log.info(`[DiscoverFacade] Embedding generated in ${embedTime.toFixed(1)}ms`);
        } catch (err) {
          log.warn(`[DiscoverFacade] Failed to generate embedding: ${err}`);
        }
      }

      const results: DiscoverResultItem[] = [];
      let toolsCount = 0;
      let capabilitiesCount = 0;

      // Search tools if filter allows
      if (filterType === "all" || filterType === "tool") {
        const toolsStart = performance.now();
        const toolsResult = await this.deps.toolsUseCase.execute({
          intent,
          limit,
          minScore,
          includeRelated,
          correlationId,
          intentEmbedding, // Pass pre-computed embedding
        });
        log.info(`[DiscoverFacade] Tools search took ${(performance.now() - toolsStart).toFixed(1)}ms`);

        if (toolsResult.success && toolsResult.data) {
          for (const tool of toolsResult.data.tools) {
            if (tool.score >= minScore) {
              results.push(tool);
              toolsCount++;
            }
          }
        }
      }

      // Search capabilities if filter allows
      if (filterType === "all" || filterType === "capability") {
        const capsStart = performance.now();
        const capsResult = await this.deps.capabilitiesUseCase.execute({
          intent,
          limit,
          minScore,
          correlationId,
          intentEmbedding, // Pass pre-computed embedding
        });
        log.info(`[DiscoverFacade] Capabilities search took ${(performance.now() - capsStart).toFixed(1)}ms`);

        if (capsResult.success && capsResult.data) {
          for (const cap of capsResult.data.capabilities) {
            if (cap.score >= minScore) {
              results.push(cap);
              capabilitiesCount++;
            }
          }
        }
      }

      // Sort by score descending and apply limit
      results.sort((a, b) => b.score - a.score);
      const limitedResults = results.slice(0, limit);

      // Apply softmax to convert SHGAT scores to relative probabilities
      if (limitedResults.length > 1) {
        const temperature = 0.1; // Sharp distribution for clear ranking
        const scores = limitedResults.map((r) => r.score);
        const maxScore = Math.max(...scores);
        const expScores = scores.map((s) => Math.exp((s - maxScore) / temperature));
        const sumExp = expScores.reduce((a, b) => a + b, 0);

        for (let i = 0; i < limitedResults.length; i++) {
          // TODO: rename to shgat_score - this is the raw SHGAT score before softmax, not pure semantic similarity
          (limitedResults[i] as DiscoverResultItem & { semantic_score: number }).semantic_score =
            limitedResults[i].score;
          limitedResults[i].score = expScores[i] / sumExp;
        }
      }

      const response: DiscoverResponse = {
        results: limitedResults,
        meta: {
          query: intent,
          filter_type: filterType,
          total_found: results.length,
          returned_count: limitedResults.length,
          tools_count: toolsCount,
          capabilities_count: capabilitiesCount,
        },
      };

      const elapsedMs = performance.now() - startTime;
      log.info(
        `discover: found ${limitedResults.length} results (${toolsCount} tools, ${capabilitiesCount} caps) in ${elapsedMs.toFixed(1)}ms`,
      );

      transaction.finish();
      return formatMCPSuccess(response);
    } catch (error) {
      log.error(`discover error: ${error}`);
      captureError(error as Error, { operation: "discover", handler: "DiscoverHandlerFacade" });
      transaction.finish();
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: `Discover failed: ${(error as Error).message}` }),
        }],
      };
    }
  }
}
