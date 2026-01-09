/**
 * Post-Execution Service
 *
 * Handles all post-execution tasks that were previously in execute-handler.ts:
 * - updateDRDSP: Add hyperedges for capability routing
 * - registerSHGATNodes: Register capability/tool nodes in SHGAT
 * - learnFromTaskResults: Learn fan-in/fan-out edges
 * - runPERBatchTraining: PER training with traceStore
 *
 * Phase 3.2: Migrated from monolithic execute-handler.ts to Clean Architecture
 *
 * @module application/services/post-execution
 */

import * as log from "@std/log";
import type { DRDSP } from "../../graphrag/algorithms/dr-dsp.ts";
import type { SHGAT } from "../../graphrag/algorithms/shgat.ts";
import type { GraphRAGEngine } from "../../graphrag/graph-engine.ts";
import type { EmbeddingModelInterface } from "../../vector/embeddings.ts";
import type { ExecutionTraceStore } from "../../capabilities/execution-trace-store.ts";
import type { DbClient } from "../../db/types.ts";
import type { StaticStructure, TraceTaskResult } from "../../capabilities/types/mod.ts";
import { trainSHGATOnPathTracesSubprocess } from "../../graphrag/learning/mod.ts";
import { trainingLock } from "../../graphrag/learning/mod.ts";
import { type AdaptiveThresholdManager, updateThompsonSampling } from "../../mcp/adaptive-threshold.ts";

// ============================================================================
// Interfaces
// ============================================================================

/**
 * Task result with layer index for fan-in/fan-out learning
 */
export interface TaskResultWithLayer extends TraceTaskResult {
  layerIndex: number;
}

/**
 * Capability row from database query
 */
interface CapabilityRow {
  id: string;
  embedding: number[] | string;
  tools_used: string[] | null;
  success_rate: number;
}

/**
 * Dependencies for PostExecutionService
 */
export interface PostExecutionServiceDeps {
  drdsp?: DRDSP;
  shgat?: SHGAT;
  graphEngine?: GraphRAGEngine;
  embeddingModel?: EmbeddingModelInterface;
  traceStore?: ExecutionTraceStore;
  db?: DbClient;
  /** Adaptive threshold manager for Thompson Sampling */
  adaptiveThresholdManager?: AdaptiveThresholdManager;
  /** Callback to save SHGAT params after training */
  onSHGATParamsUpdated?: () => Promise<void>;
}

/**
 * Input for post-execution processing
 */
export interface PostExecutionInput {
  capability: {
    id: string;
    successRate: number;
    toolsUsed?: string[];
    children?: string[];
    parents?: string[];
    hierarchyLevel?: number;
  };
  staticStructure: StaticStructure;
  toolsCalled: string[];
  taskResults: TraceTaskResult[];
  intent: string;
}

// ============================================================================
// Service Implementation
// ============================================================================

/**
 * Post-Execution Service
 *
 * Handles all learning and graph updates after successful execution.
 */
export class PostExecutionService {
  constructor(private readonly deps: PostExecutionServiceDeps) {}

  /**
   * Run all post-execution tasks
   *
   * Called after successful direct mode execution.
   * All tasks are non-blocking (fire and forget with error handling).
   */
  async process(input: PostExecutionInput): Promise<void> {
    const { capability, staticStructure, toolsCalled, taskResults, intent } = input;

    // 1. Update DR-DSP with new capability (sync, fast)
    this.updateDRDSP(capability, staticStructure);

    // 2. Register capability in SHGAT graph (async, generates embeddings)
    await this.registerSHGATNodes(capability, toolsCalled, intent);

    // 3. Update Thompson Sampling with execution outcomes (Story 10.7c)
    this.updateThompsonSampling(taskResults);

    // 4. Learn fan-in/fan-out edges from task results
    await this.learnFromTaskResults(taskResults);

    // 5. PER batch training (background, non-blocking)
    this.runPERBatchTraining().catch((err) =>
      log.warn("[PostExecutionService] PER training failed", { error: String(err) })
    );
  }

  // ==========================================================================
  // Thompson Sampling Update
  // ==========================================================================

  /**
   * Update Thompson Sampling with execution outcomes
   *
   * Story 10.7c: Records success/failure for per-tool adaptive thresholds.
   */
  private updateThompsonSampling(taskResults: TraceTaskResult[]): void {
    updateThompsonSampling(this.deps.adaptiveThresholdManager, taskResults);
  }

  // ==========================================================================
  // DR-DSP Update
  // ==========================================================================

  /**
   * Update DR-DSP with a newly created capability
   *
   * Adds hyperedge: sources (prerequisites) → targets (what it provides)
   */
  private updateDRDSP(
    capability: { id: string; successRate: number },
    staticStructure: StaticStructure,
  ): void {
    const { drdsp } = this.deps;
    if (!drdsp || staticStructure.nodes.length === 0) return;

    try {
      const tools = staticStructure.nodes
        .filter((n): n is typeof n & { type: "task"; tool: string } => n.type === "task" && !!n.tool)
        .map((n) => n.tool);

      // Hyperedge: sources (prerequisites) → targets (what it provides)
      drdsp.applyUpdate({
        type: "edge_add",
        hyperedgeId: `cap__${capability.id}`,
        newEdge: {
          id: `cap__${capability.id}`,
          sources: tools.length > 0 ? [tools[0]] : ["intent"],
          targets: tools.length > 1 ? tools.slice(1) : [`cap__${capability.id}`],
          weight: 1.0 - capability.successRate,
          metadata: {
            capabilityId: capability.id,
            tools,
            successRate: capability.successRate,
          },
        },
      });
      log.debug("[PostExecutionService] DR-DSP updated", { capabilityId: capability.id });
    } catch (error) {
      log.warn("[PostExecutionService] Failed to update DR-DSP", { error: String(error) });
    }
  }

  // ==========================================================================
  // SHGAT Node Registration
  // ==========================================================================

  /**
   * Register capability and tools in SHGAT graph
   *
   * Adds new nodes to the graph. Training is done separately via PER.
   * Also includes children (contained capabilities) for hierarchy.
   */
  private async registerSHGATNodes(
    capability: {
      id: string;
      toolsUsed?: string[];
      successRate: number;
      children?: string[];
      parents?: string[];
      hierarchyLevel?: number;
    },
    toolsCalled: string[],
    intent: string,
  ): Promise<void> {
    const { shgat, embeddingModel } = this.deps;
    if (!shgat || !embeddingModel) return;

    try {
      // Generate embedding for the capability from intent
      const embedding = await embeddingModel.encode(intent);

      // Register any new tools (with generated embeddings)
      for (const toolId of toolsCalled) {
        if (!shgat.hasToolNode(toolId)) {
          const toolEmbedding = await embeddingModel.encode(toolId.replace(":", " "));
          shgat.registerTool({ id: toolId, embedding: toolEmbedding });
        }
      }

      // Build members: tools + child capabilities
      const toolMembers = (capability.toolsUsed ?? toolsCalled).map((id) => ({
        type: "tool" as const,
        id,
      }));
      const capabilityMembers = (capability.children ?? []).map((id) => ({
        type: "capability" as const,
        id,
      }));
      const allMembers = [...toolMembers, ...capabilityMembers];

      // Register the capability with hierarchy info
      shgat.registerCapability({
        id: capability.id,
        embedding,
        members: allMembers,
        hierarchyLevel: capability.hierarchyLevel ?? 0,
        successRate: capability.successRate,
        children: capability.children,
        parents: capability.parents,
        toolsUsed: capability.toolsUsed ?? toolsCalled,
      });

      log.debug("[PostExecutionService] SHGAT nodes registered", {
        capabilityId: capability.id,
        toolsCount: toolsCalled.length,
        childrenCount: capability.children?.length ?? 0,
        hierarchyLevel: capability.hierarchyLevel ?? 0,
      });
    } catch (error) {
      log.warn("[PostExecutionService] Failed to register SHGAT nodes", { error: String(error) });
    }
  }

  // ==========================================================================
  // Fan-in/Fan-out Learning
  // ==========================================================================

  /**
   * Learn fan-in/fan-out edges from task results
   *
   * Story 11.4 AC11: Uses layerIndex to learn parallel execution patterns.
   */
  private async learnFromTaskResults(taskResults: TraceTaskResult[]): Promise<void> {
    const { graphEngine } = this.deps;
    if (!graphEngine) return;

    try {
      const tasksWithLayer = taskResults
        .filter((t): t is TaskResultWithLayer => t.layerIndex !== undefined);

      if (tasksWithLayer.length > 0) {
        await graphEngine.learnFromTaskResults(tasksWithLayer);
        log.debug("[PostExecutionService] Learned from task results", {
          tasksCount: tasksWithLayer.length,
        });
      }
    } catch (error) {
      log.warn("[PostExecutionService] Failed to learn from task results", { error: String(error) });
    }
  }

  // ==========================================================================
  // PER Batch Training
  // ==========================================================================

  /**
   * Run PER (Prioritized Experience Replay) batch training
   *
   * Story 11.6: Trains SHGAT on high-priority traces from database.
   * Uses subprocess for non-blocking execution.
   * Skips if another training is already in progress.
   */
  async runPERBatchTraining(): Promise<void> {
    const { shgat, traceStore, embeddingModel, db, onSHGATParamsUpdated } = this.deps;

    // Skip if training already in progress
    if (!trainingLock.acquire("PER")) {
      log.debug("[PostExecutionService] Skipping PER training - lock held", {
        owner: trainingLock.owner,
      });
      return;
    }

    // Check required dependencies
    if (!shgat || !traceStore || !embeddingModel || !db) {
      log.debug("[PostExecutionService] Skipping PER training - missing dependencies", {
        hasShgat: !!shgat,
        hasTraceStore: !!traceStore,
        hasEmbeddingModel: !!embeddingModel,
        hasDb: !!db,
      });
      trainingLock.release("PER");
      return;
    }

    try {
      // Create embedding provider wrapper
      const embeddingProvider = {
        getEmbedding: async (text: string) => embeddingModel.encode(text),
      };

      // Fetch capabilities with embeddings for subprocess (negative mining)
      const rows = await db.query(
        `SELECT
          pattern_id as id,
          intent_embedding as embedding,
          dag_structure->'tools_used' as tools_used,
          success_rate
        FROM workflow_pattern
        WHERE code_snippet IS NOT NULL
          AND intent_embedding IS NOT NULL
        LIMIT 500`,
      ) as unknown as CapabilityRow[];

      // Parse embeddings (handle pgvector string format)
      const capabilities = rows
        .map((c) => {
          let embedding: number[];
          if (Array.isArray(c.embedding)) {
            embedding = c.embedding;
          } else if (typeof c.embedding === "string") {
            try {
              embedding = JSON.parse(c.embedding);
            } catch {
              return null;
            }
          } else {
            return null;
          }
          if (!Array.isArray(embedding) || embedding.length === 0) return null;
          return {
            id: c.id,
            embedding,
            toolsUsed: c.tools_used ?? [],
            successRate: c.success_rate,
          };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);

      if (capabilities.length === 0) {
        log.debug("[PostExecutionService] No capabilities with embeddings for PER training");
        return;
      }

      // Run path-level training with PER sampling in subprocess
      log.info("[PostExecutionService] Starting PER batch training", {
        capabilitiesCount: capabilities.length,
      });

      const result = await trainSHGATOnPathTracesSubprocess(
        shgat,
        traceStore,
        embeddingProvider,
        {
          capabilities,
          minTraces: 1,
          maxTraces: 50,
          batchSize: 16,
          epochs: 1, // Live mode: single epoch
        },
      );

      if (!result.fallback && result.tracesProcessed > 0) {
        log.info("[PostExecutionService] PER training completed", {
          traces: result.tracesProcessed,
          examples: result.examplesGenerated,
          loss: result.loss.toFixed(4),
          priorities: result.prioritiesUpdated,
        });

        // Save params after successful PER training
        if (onSHGATParamsUpdated) {
          await onSHGATParamsUpdated();
        }
      } else if (result.fallback) {
        log.debug("[PostExecutionService] PER training fallback", {
          reason: result.fallbackReason,
        });
      }
    } catch (error) {
      log.warn("[PostExecutionService] PER training failed", { error: String(error) });
    } finally {
      trainingLock.release("PER");
    }
  }
}
