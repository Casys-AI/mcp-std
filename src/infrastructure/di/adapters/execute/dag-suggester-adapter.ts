/**
 * DAG Suggester Adapter
 *
 * Adapts existing SHGAT + DR-DSP infrastructure to the IDAGSuggester interface.
 *
 * Phase 3.1: Execute Handler → Use Cases refactoring
 *
 * @module infrastructure/di/adapters/execute/dag-suggester-adapter
 */

import * as log from "@std/log";
import type {
  IDAGSuggester,
  SuggestionResult,
  CapabilityMatch,
  DAGSuggestion,
} from "../../../../domain/interfaces/dag-suggester.ts";
import type { ICapabilityRepository } from "../../../../domain/interfaces/capability-repository.ts";
import type { HypergraphNode } from "../../../../graphrag/algorithms/dr-dsp.ts";

/**
 * SHGAT scorer interface (from existing infrastructure)
 * SHGAT scores both capabilities (level 1+) and tools (level 0)
 */
export interface SHGATScorerInfra {
  scoreAllCapabilities(intentEmbedding: number[]): Array<{
    capabilityId: string;
    score: number;
    headScores?: number[];
    headWeights?: number[];
    recursiveContribution?: number;
    featureContributions?: {
      semantic?: number;
      structure?: number;
      temporal?: number;
      reliability?: number;
    };
  }>;
  /** Score tools (level 0 nodes) - same scoring as capabilities */
  scoreAllTools?(intentEmbedding: number[]): Array<{
    toolId: string;
    score: number;
  }>;
}

/**
 * DR-DSP pathfinder interface (from existing infrastructure)
 * Now aligned with SHGAT - supports tools AND capabilities as nodes
 * DR-DSP is for pathfinding, NOT scoring (SHGAT does scoring)
 */
export interface DRDSPPathfinder {
  findShortestHyperpath(source: string, target: string): {
    found: boolean;
    path: string[];
    nodeSequence: string[];
    hyperedges: Array<{ id: string }>;
    totalWeight: number;
  };
  /** Get node by ID (aligned model) - returns HypergraphNode */
  getNode?(id: string): HypergraphNode | undefined;
  /** Get all capability nodes */
  getCapabilityNodes?(): Map<string, HypergraphNode>;
  /** Get all tool nodes */
  getToolNodes?(): Map<string, HypergraphNode>;
}

/**
 * Embedding model interface
 */
export interface EmbeddingModelInfra {
  encode(text: string): Promise<number[]>;
}

/**
 * Capability registry interface for resolving callName
 */
export interface CapabilityRegistryInfra {
  getByWorkflowPatternId(capabilityId: string): Promise<{ namespace: string; action: string } | null>;
}

/**
 * Dependencies for DAGSuggesterAdapter
 */
export interface DAGSuggesterAdapterDeps {
  shgat?: SHGATScorerInfra;
  drdsp?: DRDSPPathfinder;
  embeddingModel?: EmbeddingModelInfra;
  capabilityRepo: ICapabilityRepository;
  capabilityRegistry?: CapabilityRegistryInfra;
}

/**
 * Adapts SHGAT + DR-DSP to IDAGSuggester interface
 */
export class DAGSuggesterAdapter implements IDAGSuggester {
  private deps: DAGSuggesterAdapterDeps;

  constructor(deps: DAGSuggesterAdapterDeps) {
    this.deps = deps;
  }

  /**
   * Set SHGAT scorer (lazy initialization after algorithms are loaded)
   */
  setSHGAT(shgat: SHGATScorerInfra): void {
    this.deps = { ...this.deps, shgat };
  }

  /**
   * Set DR-DSP pathfinder (lazy initialization after algorithms are loaded)
   */
  setDRDSP(drdsp: DRDSPPathfinder): void {
    this.deps = { ...this.deps, drdsp };
  }

  /**
   * Set embedding model (lazy initialization)
   */
  setEmbeddingModel(embeddingModel: EmbeddingModelInfra): void {
    this.deps = { ...this.deps, embeddingModel };
  }

  /**
   * Generate DAG suggestion from natural language intent
   *
   * Strategy:
   * 1. Score both capabilities AND tools with SHGAT
   * 2. Compare best capability vs best tool
   * 3. If best score >= threshold → return capability OR tool directly
   * 4. If below threshold → use DR-DSP to compose path
   */
  async suggest(intent: string, correlationId?: string, precomputedEmbedding?: number[]): Promise<SuggestionResult> {
    if (!this.deps.shgat) {
      return { confidence: 0 };
    }

    try {
      // Use pre-computed embedding if available, otherwise generate
      let intentEmbedding = precomputedEmbedding;
      if (!intentEmbedding) {
        if (!this.deps.embeddingModel) {
          return { confidence: 0 };
        }
        intentEmbedding = await this.deps.embeddingModel.encode(intent);
      }
      if (!intentEmbedding || intentEmbedding.length === 0) {
        return { confidence: 0 };
      }

      // Score both capabilities AND tools with SHGAT
      const capResults = this.deps.shgat.scoreAllCapabilities(intentEmbedding);
      const toolResults = this.deps.shgat.scoreAllTools?.(intentEmbedding) ?? [];

      const bestCap = capResults[0];
      const bestTool = toolResults[0];

      // No results at all - nothing to suggest
      if (!bestCap && !bestTool) {
        return { confidence: 0 };
      }

      const GOOD_MATCH_THRESHOLD = 0.6;

      // Compare best capability vs best tool
      const bestCapScore = bestCap?.score ?? 0;
      const bestToolScore = bestTool?.score ?? 0;

      // Case 1: Best capability wins (or no tools)
      if (bestCapScore >= bestToolScore && bestCapScore >= GOOD_MATCH_THRESHOLD) {
        const capability = await this.deps.capabilityRepo.findById(bestCap.capabilityId);
        if (capability) {
          const callName = await this.resolveCallName(capability.id, capability.fqdn);

          const suggestedDag: DAGSuggestion = {
            tasks: [{
              id: "task_0",
              callName: callName || bestCap.capabilityId,
              type: "capability",
              inputSchema: capability.parametersSchema,
              dependsOn: [],
            }],
          };

          log.info("[DAGSuggesterAdapter] Good match - returning capability directly", {
            correlationId,
            capabilityId: capability.id,
            callName,
            score: bestCapScore,
          });

          const bestMatch: CapabilityMatch = {
            capabilityId: bestCap.capabilityId,
            score: bestCap.score,
            headScores: bestCap.headScores,
            headWeights: bestCap.headWeights,
            recursiveContribution: bestCap.recursiveContribution,
            featureContributions: bestCap.featureContributions,
          };

          return {
            suggestedDag,
            confidence: bestCapScore,
            bestMatch,
            canSpeculate: bestCapScore >= 0.7 && capability.successRate >= 0.8,
          };
        }
      }

      // Case 2: Best tool wins
      if (bestToolScore > bestCapScore && bestToolScore >= GOOD_MATCH_THRESHOLD) {
        const suggestedDag: DAGSuggestion = {
          tasks: [{
            id: "task_0",
            callName: bestTool.toolId,
            type: "tool",
            inputSchema: undefined, // Tools get schema from MCP registry
            dependsOn: [],
          }],
        };

        log.info("[DAGSuggesterAdapter] Good match - returning tool directly", {
          correlationId,
          toolId: bestTool.toolId,
          score: bestToolScore,
        });

        return {
          suggestedDag,
          confidence: bestToolScore,
          canSpeculate: false, // Tools don't have successRate tracking
        };
      }

      // Case 3: Below threshold - use DR-DSP composition
      log.debug("[DAGSuggesterAdapter] Below threshold, using DR-DSP composition", {
        correlationId,
        bestCapScore,
        bestToolScore,
        threshold: GOOD_MATCH_THRESHOLD,
      });

      const composed = await this.composeWithDRDSP(intentEmbedding, correlationId);

      // Include best capability match info if available
      if (bestCap) {
        const bestMatch: CapabilityMatch = {
          capabilityId: bestCap.capabilityId,
          score: bestCap.score,
          headScores: bestCap.headScores,
          headWeights: bestCap.headWeights,
          recursiveContribution: bestCap.recursiveContribution,
          featureContributions: bestCap.featureContributions,
        };
        return { ...composed, bestMatch };
      }

      return composed;
    } catch (error) {
      log.error(`[DAGSuggesterAdapter] Suggestion failed: ${error}`);
      return { confidence: 0 };
    }
  }

  /**
   * Compose a DAG using DR-DSP when no good capability match exists
   * - SHGAT scores the tools (level 0 nodes)
   * - DR-DSP finds the path between relevant tools
   */
  private async composeWithDRDSP(
    intentEmbedding: number[],
    correlationId?: string,
  ): Promise<SuggestionResult> {
    // Need both SHGAT (for scoring) and DR-DSP (for pathfinding)
    if (!this.deps.shgat?.scoreAllTools) {
      log.debug("[DAGSuggesterAdapter] No SHGAT.scoreAllTools available for composition");
      return { confidence: 0 };
    }

    // Score tools using SHGAT (not DR-DSP!)
    const toolScores = this.deps.shgat.scoreAllTools(intentEmbedding);
    if (toolScores.length === 0) {
      return { confidence: 0 };
    }

    // Get top tools (threshold for relevance)
    const TOOL_RELEVANCE_THRESHOLD = 0.3;
    const relevantTools = toolScores.filter((t) => t.score >= TOOL_RELEVANCE_THRESHOLD);

    if (relevantTools.length === 0) {
      return { confidence: 0 };
    }

    // If only one relevant tool, return it directly
    if (relevantTools.length === 1) {
      const suggestedDag: DAGSuggestion = {
        tasks: [{
          id: "task_0",
          callName: relevantTools[0].toolId,
          type: "tool",
          inputSchema: undefined,
          dependsOn: [],
        }],
      };

      return {
        suggestedDag,
        confidence: relevantTools[0].score,
        canSpeculate: false,
      };
    }

    // Multiple relevant tools - find path between top 2 using DR-DSP
    const startTool = relevantTools[0].toolId;
    const endTool = relevantTools[1].toolId;

    // Use DR-DSP for pathfinding if available
    if (this.deps.drdsp) {
      const pathResult = this.deps.drdsp.findShortestHyperpath(startTool, endTool);

      if (pathResult.found && pathResult.nodeSequence.length > 0) {
        const suggestedDag = this.buildDAGFromPathWithTypes(pathResult.nodeSequence);

        log.info("[DAGSuggesterAdapter] DR-DSP composition found path", {
          correlationId,
          pathLength: pathResult.nodeSequence.length,
          tasksCount: suggestedDag.tasks.length,
          startTool,
          endTool,
        });

        // Confidence is average of tool scores in path
        const avgConfidence = relevantTools.slice(0, 2).reduce((sum, t) => sum + t.score, 0) / 2;

        return {
          suggestedDag,
          confidence: avgConfidence,
          canSpeculate: false, // Composed paths require user validation
        };
      }
    }

    // Fallback: just return top tools as sequence (no DR-DSP or no path found)
    const suggestedDag: DAGSuggestion = {
      tasks: relevantTools.slice(0, 3).map((t, index) => ({
        id: `task_${index}`,
        callName: t.toolId,
        type: "tool" as const,
        inputSchema: undefined,
        dependsOn: index > 0 ? [`task_${index - 1}`] : [],
      })),
    };

    const avgConfidence = relevantTools.slice(0, 3).reduce((sum, t) => sum + t.score, 0) / Math.min(relevantTools.length, 3);

    return {
      suggestedDag,
      confidence: avgConfidence,
      canSpeculate: false,
    };
  }

  /**
   * Build DAG from path, preserving node types (tool vs capability)
   */
  private buildDAGFromPathWithTypes(nodeSequence: string[]): DAGSuggestion {
    const tasks = nodeSequence.map((nodeId, index) => {
      // Check if node is capability (DR-DSP aligned has this info)
      const node = this.deps.drdsp?.getNode?.(nodeId);
      const nodeType = node?.type ?? "tool";

      return {
        id: `task_${index}`,
        callName: nodeId,
        type: nodeType,
        inputSchema: undefined,
        dependsOn: index > 0 ? [`task_${index - 1}`] : [],
      };
    });

    return { tasks };
  }

  /**
   * Score all capabilities for an intent (raw SHGAT scoring)
   */
  scoreCapabilities(intentEmbedding: number[]): CapabilityMatch[] {
    if (!this.deps.shgat) {
      return [];
    }

    return this.deps.shgat.scoreAllCapabilities(intentEmbedding).map((r) => ({
      capabilityId: r.capabilityId,
      score: r.score,
      headScores: r.headScores,
      headWeights: r.headWeights,
      recursiveContribution: r.recursiveContribution,
      featureContributions: r.featureContributions,
    }));
  }

  /**
   * Resolve namespace:action callName from registry or FQDN
   */
  private async resolveCallName(capabilityId: string, fqdn?: string): Promise<string | undefined> {
    log.debug("[DAGSuggesterAdapter] resolveCallName called", {
      capabilityId,
      fqdn,
      hasRegistry: !!this.deps.capabilityRegistry,
    });

    // Try registry first
    if (this.deps.capabilityRegistry) {
      const record = await this.deps.capabilityRegistry.getByWorkflowPatternId(capabilityId);
      log.debug("[DAGSuggesterAdapter] resolveCallName: registry result", {
        found: !!record,
        callName: record ? `${record.namespace}:${record.action}` : null,
      });
      if (record) {
        return `${record.namespace}:${record.action}`;
      }
    }

    // Fallback: parse from FQDN (format: org.project.namespace.action.hash)
    if (fqdn) {
      const parts = fqdn.split(".");
      if (parts.length >= 5) {
        return `${parts[2]}:${parts[3]}`;
      }
    }

    return undefined;
  }
}
