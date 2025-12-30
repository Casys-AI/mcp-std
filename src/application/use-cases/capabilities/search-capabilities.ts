/**
 * Search Capabilities Use Case
 *
 * Searches for capabilities by semantic similarity.
 *
 * @example
 * ```typescript
 * const useCase = new SearchCapabilitiesUseCase(vectorSearch, capabilityRepo);
 * const result = await useCase.execute({
 *   query: "parse JSON data",
 *   limit: 10
 * });
 * ```
 *
 * @module application/use-cases/capabilities/search-capabilities
 */

import * as log from "@std/log";
import type { UseCaseResult } from "../shared/types.ts";
import type {
  CapabilitySummary,
  SearchCapabilitiesRequest,
  SearchCapabilitiesResult,
} from "./types.ts";

/**
 * Vector search interface
 */
export interface IVectorSearch {
  searchCapabilities(
    query: string,
    options?: { limit?: number; minScore?: number },
  ): Promise<VectorSearchResult[]>;
}

/**
 * Vector search result
 */
export interface VectorSearchResult {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

/**
 * Capability repository interface
 */
export interface ICapabilityRepository {
  getById(id: string): Promise<CapabilityRecord | null>;
  getByIds(ids: string[]): Promise<CapabilityRecord[]>;
}

/**
 * Capability record from repository
 */
export interface CapabilityRecord {
  id: string;
  name: string;
  displayName: string;
  description: string;
  usageCount: number;
  successRate: number;
  visibility: "public" | "private";
}

/**
 * Use case for searching capabilities
 */
export class SearchCapabilitiesUseCase {
  constructor(
    private readonly vectorSearch: IVectorSearch,
    private readonly capabilityRepo: ICapabilityRepository,
  ) {}

  /**
   * Execute the search capabilities use case
   */
  async execute(
    request: SearchCapabilitiesRequest,
  ): Promise<UseCaseResult<SearchCapabilitiesResult>> {
    const { query, limit = 10, minScore = 0.5, visibility = "all" } = request;

    // Validate request
    if (!query || query.trim().length === 0) {
      return {
        success: false,
        error: {
          code: "MISSING_QUERY",
          message: "Missing required parameter: query",
        },
      };
    }

    log.debug(
      `SearchCapabilitiesUseCase: query="${query}", limit=${limit}, minScore=${minScore}`,
    );

    try {
      // Search by vector similarity
      const searchResults = await this.vectorSearch.searchCapabilities(query, {
        limit: limit * 2, // Fetch more to filter by visibility
        minScore,
      });

      if (searchResults.length === 0) {
        return {
          success: true,
          data: {
            capabilities: [],
            query,
            totalFound: 0,
          },
        };
      }

      // Fetch full capability records
      const ids = searchResults.map((r) => r.id);
      const capabilities = await this.capabilityRepo.getByIds(ids);

      // Create score map for sorting
      const scoreMap = new Map(searchResults.map((r) => [r.id, r.score]));

      // Filter by visibility and build summaries
      const summaries: CapabilitySummary[] = capabilities
        .filter((cap) => visibility === "all" || cap.visibility === visibility)
        .map((cap) => ({
          id: cap.id,
          name: cap.name,
          displayName: cap.displayName,
          description: cap.description,
          score: scoreMap.get(cap.id) ?? 0,
          usageCount: cap.usageCount,
          successRate: cap.successRate,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      log.debug(`Found ${summaries.length} capabilities matching query`);

      return {
        success: true,
        data: {
          capabilities: summaries,
          query,
          totalFound: summaries.length,
        },
      };
    } catch (error) {
      log.error(`Search capabilities failed: ${error}`);
      return {
        success: false,
        error: {
          code: "SEARCH_FAILED",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
}
