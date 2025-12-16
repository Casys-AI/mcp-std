/**
 * Candidate Ranking Module
 *
 * Extracted from dag-suggester.ts for ranking hybrid search candidates
 * and extracting dependency paths.
 *
 * @module graphrag/suggestion/ranking
 */

import * as log from "@std/log";
import type { DagScoringConfig } from "../dag-scoring-config.ts";
import type { DependencyPath, HybridSearchResult } from "../types.ts";
import type { GraphRAGEngine } from "../graph-engine.ts";
import { calculatePathConfidence } from "./confidence.ts";
import { explainPath } from "./rationale.ts";

/**
 * Ranked candidate with all scoring information
 */
export interface RankedCandidate {
  toolId: string;
  serverId: string;
  toolName: string;
  score: number;
  semanticScore: number;
  graphScore: number;
  pageRank: number;
  adamicAdar: number;
  combinedScore: number;
  schema?: Record<string, unknown>;
}

/**
 * Alpha information for a candidate
 */
export interface CandidateAlpha {
  toolId: string;
  alpha: number;
  algorithm: string;
  coldStart: boolean;
}

/**
 * Rank hybrid search candidates by combined score
 *
 * Combines finalScore (hybrid semantic + graph) with PageRank using configured weights.
 *
 * @param hybridCandidates - Raw candidates from hybrid search
 * @param contextTools - Tools already in context
 * @param graphEngine - GraphRAG engine for PageRank and Adamic-Adar
 * @param config - Scoring configuration
 * @returns Sorted array of ranked candidates
 */
export function rankCandidates(
  hybridCandidates: HybridSearchResult[],
  contextTools: string[],
  graphEngine: GraphRAGEngine,
  config: DagScoringConfig,
): RankedCandidate[] {
  const rankedCandidates = hybridCandidates
    .map((c) => {
      // Compute max Adamic-Adar score vs context tools
      let maxAdamicAdar = 0;
      for (const ctxTool of contextTools) {
        const aa = graphEngine.adamicAdarBetween(c.toolId, ctxTool);
        if (aa > maxAdamicAdar) maxAdamicAdar = aa;
      }
      return {
        toolId: c.toolId,
        serverId: c.serverId,
        toolName: c.toolName,
        score: c.finalScore, // Use hybrid finalScore as base
        semanticScore: c.semanticScore,
        graphScore: c.graphScore,
        pageRank: graphEngine.getPageRank(c.toolId),
        adamicAdar: Math.min(maxAdamicAdar / 2, 1.0), // Normalize to 0-1
        schema: c.schema,
        combinedScore: 0, // Will be calculated below
      };
    })
    // Combine finalScore with PageRank using configured weights
    .map((c) => ({
      ...c,
      combinedScore: c.score * config.weights.candidateRanking.hybridScore +
        c.pageRank * config.weights.candidateRanking.pagerank,
    }))
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, config.limits.rankedCandidates);

  log.debug(
    `Ranked candidates (hybrid+PageRank): ${
      rankedCandidates.map((c) =>
        `${c.toolId} (final=${c.score.toFixed(2)}, PR=${c.pageRank.toFixed(3)})`
      ).join(", ")
    }`,
  );

  return rankedCandidates;
}

/**
 * Extract dependency paths for explainability
 *
 * Finds paths between tools and generates explanations for dependencies.
 *
 * @param toolIds - Array of tool IDs in the DAG
 * @param graphEngine - GraphRAG engine for path finding
 * @param config - Scoring configuration
 * @returns Array of dependency paths with explanations
 */
export function extractDependencyPaths(
  toolIds: string[],
  graphEngine: GraphRAGEngine,
  config: DagScoringConfig,
): DependencyPath[] {
  const paths: DependencyPath[] = [];

  for (let i = 0; i < toolIds.length; i++) {
    for (let j = 0; j < i; j++) {
      const fromTool = toolIds[j];
      const toTool = toolIds[i];

      const path = graphEngine.findShortestPath(fromTool, toTool);

      if (path && path.length <= config.limits.maxPathLength) {
        paths.push({
          from: fromTool,
          to: toTool,
          path: path,
          hops: path.length - 1,
          explanation: explainPath(path),
          confidence: calculatePathConfidence(path.length, config),
        });
      }
    }
  }

  return paths;
}

/**
 * Calculate average alpha from candidate alphas
 *
 * @param candidateAlphas - Alpha information for each candidate
 * @param defaultAlpha - Default alpha if no candidates
 * @returns Average alpha value
 */
export function calculateAverageAlpha(
  candidateAlphas: CandidateAlpha[],
  defaultAlpha: number,
): number {
  if (candidateAlphas.length === 0) {
    return defaultAlpha;
  }
  return candidateAlphas.reduce((sum, c) => sum + c.alpha, 0) / candidateAlphas.length;
}
