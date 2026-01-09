/**
 * Execute Direct Use Case
 *
 * Executes TypeScript code directly and creates a capability from the result.
 * Uses DAG execution via ControlledExecutor for parallel task execution.
 *
 * Phase 3.1: Execute Handler → Use Cases refactoring
 *
 * @module application/use-cases/execute/execute-direct
 */

import * as log from "@std/log";
import type { ICapabilityRepository } from "../../../domain/interfaces/capability-repository.ts";
import type { ITraceCollector } from "../../../domain/interfaces/trace-collector.ts";
import type { UseCaseResult } from "../shared/types.ts";
import type { ExecuteDirectRequest, ExecuteDirectResult } from "./types.ts";
import {
  buildTaskResults,
  extractSuccessOutputs,
  hasAnyFailure,
  buildToolFailures,
  type DAGExecutionResults,
  type OptimizedDAG,
} from "./shared/result-mapper.ts";
import { countToolCalls } from "./shared/execution-context.ts";
import type { StaticStructure, TraceTaskResult } from "../../../capabilities/types/mod.ts";
import { resolveRouting, getToolRouting } from "../../../capabilities/routing-resolver.ts";

// ============================================================================
// Interfaces (Clean Architecture - no concrete imports)
// ============================================================================

/**
 * DAG executor interface for running optimized DAGs
 */
export interface IDAGExecutor {
  execute(dag: { tasks: unknown[] }): Promise<DAGExecutionResults>;
  setWorkerBridge?(bridge: unknown): void;
  setToolDefinitions?(defs: unknown[]): void;
  setCheckpointManager?(db: unknown, enabled: boolean): void;
  setLearningDependencies?(capabilityStore: unknown, graphEngine: unknown): void;
  calculateSpeedup?(results: DAGExecutionResults): number;
}

/**
 * Static structure builder interface
 */
export interface IStaticStructureBuilder {
  buildStaticStructure(code: string): Promise<StaticStructure>;
  inferDecisions(
    structure: StaticStructure,
    executedPath: string[],
  ): Array<{ nodeId: string; outcome: string; condition?: string }>;
}

/**
 * Tool definitions builder interface
 */
export interface IToolDefinitionsBuilder {
  buildFromStaticStructure(structure: StaticStructure): Promise<unknown[]>;
}

/**
 * DAG conversion interface
 */
export interface IDAGConverter {
  isValidForDagConversion(structure: StaticStructure): boolean;
  staticStructureToDag(structure: StaticStructure): { tasks: unknown[] };
  optimizeDAG(dag: { tasks: unknown[] }): OptimizedDAG;
  generateLogicalTrace(
    dag: OptimizedDAG,
    results: Map<string, unknown>,
  ): { executedPath: string[]; toolsUsed: string[] };
}

/**
 * Worker bridge factory interface
 */
export interface IWorkerBridgeFactory {
  create(config: unknown): [IDAGExecutor, { bridge: unknown; traces: unknown[] }];
  cleanup(context: { bridge: unknown }): void;
}

/**
 * Capability registry interface for naming
 */
export interface ICapabilityRegistry {
  getByCodeHash(hash: string, scope: { org: string; project: string }): Promise<unknown | null>;
  create(input: {
    org: string;
    project: string;
    namespace: string;
    action: string;
    workflowPatternId: string;
    hash: string;
    createdBy: string;
    toolsUsed: string[];
  }): Promise<{ id: string }>;
}

/**
 * Embedding model interface
 */
export interface IEmbeddingModel {
  encode(text: string): Promise<number[]>;
}

/**
 * Event bus interface for capability.learned events (Phase 3.2)
 * Uses generic emit to be compatible with the real EventBus
 */
export interface IEventBus {
  emit<T extends string = string>(event: {
    type: T;
    source: string;
    payload: Record<string, unknown>;
    timestamp?: number;
  }): void;
}

/**
 * Embedding cache interface for SHGAT training (Phase 3.2)
 */
export interface IEmbeddingCache {
  set(key: string[], value: number[], options?: { expireIn?: number }): Promise<void>;
}

/**
 * Post-execution service interface (Phase 3.2)
 *
 * Handles all learning tasks after successful execution:
 * - updateDRDSP: Add hyperedges for capability routing
 * - registerSHGATNodes: Register capability/tool nodes in SHGAT
 * - learnFromTaskResults: Learn fan-in/fan-out edges
 * - runPERBatchTraining: PER training with traceStore
 */
export interface IPostExecutionService {
  process(input: {
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
  }): Promise<void>;
}

/**
 * Dependencies for ExecuteDirectUseCase
 */
export interface ExecuteDirectDependencies {
  capabilityRepo: ICapabilityRepository;
  traceCollector?: ITraceCollector;
  staticStructureBuilder: IStaticStructureBuilder;
  toolDefinitionsBuilder: IToolDefinitionsBuilder;
  dagConverter: IDAGConverter;
  workerBridgeFactory: IWorkerBridgeFactory;
  capabilityRegistry?: ICapabilityRegistry;
  embeddingModel?: IEmbeddingModel;
  /** Event bus for capability.learned events (Phase 3.2) */
  eventBus?: IEventBus;
  /** Embedding cache for SHGAT training (Phase 3.2) */
  embeddingCache?: IEmbeddingCache;
  /** Post-execution service for learning tasks (Phase 3.2) */
  postExecutionService?: IPostExecutionService;
  /** Max code size in bytes */
  maxCodeSizeBytes?: number;
  /** Default execution timeout */
  defaultTimeout?: number;
}

// ============================================================================
// Use Case Implementation
// ============================================================================

const DEFAULT_MAX_CODE_SIZE = 100 * 1024; // 100KB
const DEFAULT_SCOPE = { org: "local", project: "default" };

/**
 * Execute Direct Use Case
 *
 * Executes TypeScript code and creates a capability from successful execution.
 */
export class ExecuteDirectUseCase {
  private userId: string | null = null;

  constructor(private readonly deps: ExecuteDirectDependencies) {}

  /**
   * Set user ID for multi-tenant trace isolation (Story 9.8)
   * Called per-request before execute()
   */
  setUserId(userId: string | null): void {
    this.userId = userId;
  }

  /**
   * Execute the use case
   */
  async execute(
    request: ExecuteDirectRequest,
  ): Promise<UseCaseResult<ExecuteDirectResult>> {
    const { code, intent, options = {} } = request;
    const startTime = performance.now();

    // Validate code size
    const codeSizeBytes = new TextEncoder().encode(code).length;
    const maxSize = this.deps.maxCodeSizeBytes ?? DEFAULT_MAX_CODE_SIZE;
    if (codeSizeBytes > maxSize) {
      return {
        success: false,
        error: {
          code: "CODE_TOO_LARGE",
          message: `Code size exceeds maximum: ${codeSizeBytes} bytes (max: ${maxSize})`,
        },
      };
    }

    log.info("[ExecuteDirectUseCase] Starting execution", {
      codeSize: codeSizeBytes,
      intent: intent.substring(0, 50),
      perLayerValidation: options.perLayerValidation,
    });

    try {
      // Step 1: Static analysis
      const staticStructure = await this.deps.staticStructureBuilder.buildStaticStructure(code);

      log.debug("[ExecuteDirectUseCase] Static structure built", {
        nodeCount: staticStructure.nodes.length,
        edgeCount: staticStructure.edges.length,
      });

      // Step 2: Build tool definitions
      const toolDefs = await this.deps.toolDefinitionsBuilder.buildFromStaticStructure(staticStructure);

      // Step 3: Check if DAG conversion is possible
      if (!this.deps.dagConverter.isValidForDagConversion(staticStructure)) {
        return {
          success: false,
          error: {
            code: "INVALID_CODE",
            message: "Code must use MCP tools to be executable. No valid DAG could be created.",
            details: {
              hint: "Ensure your code calls MCP tools like: const result = await mcp.filesystem.read_file({ path: '...' });",
            },
          },
        };
      }

      // Step 4: Convert to DAG
      const logicalDAG = this.deps.dagConverter.staticStructureToDag(staticStructure);
      if (logicalDAG.tasks.length === 0) {
        return {
          success: false,
          error: {
            code: "EMPTY_DAG",
            message: "No executable tasks found in code.",
          },
        };
      }

      // Step 5: Optimize DAG
      const optimizedDAG = this.deps.dagConverter.optimizeDAG(logicalDAG);

      log.info("[ExecuteDirectUseCase] Executing via DAG", {
        logicalTasks: logicalDAG.tasks.length,
        physicalTasks: optimizedDAG.tasks.length,
        fusionRate: Math.round((1 - optimizedDAG.tasks.length / logicalDAG.tasks.length) * 100),
      });

      // Step 5.5: Hybrid routing check (Story 14 - PML Execute Hybrid Routing)
      // Extract all tools/capabilities from tasks (exclude pseudo-tools like code:add)
      const toolsUsed = optimizedDAG.tasks
        .map((t) => (t as { tool?: string }).tool)
        .filter((t): t is string => !!t && !t.startsWith("code:"));

      if (toolsUsed.length > 0) {
        const routing = resolveRouting(toolsUsed);

        if (routing === "client") {
          const clientTools = toolsUsed.filter((t) => getToolRouting(t) === "client");
          const isPackageClient = options.isPackageClient ?? false;

          log.info("[ExecuteDirectUseCase] Routing check: client tools detected", {
            toolsUsed,
            clientTools,
            isPackageClient,
          });

          if (isPackageClient) {
            // Package client: return execute_locally response
            return {
              success: true,
              data: {
                success: true,
                mode: "execute_locally",
                code,
                toolsUsed,
                clientTools,
                executionTimeMs: performance.now() - startTime,
                dag: {
                  mode: "dag",
                  tasksCount: logicalDAG.tasks.length,
                  layersCount: 0,
                  toolsDiscovered: toolsUsed,
                },
              },
            };
          } else {
            // Non-package client: error - they need to install the package
            return {
              success: false,
              error: {
                code: "CLIENT_TOOLS_REQUIRE_PACKAGE",
                message: "Code contains client-side tools that cannot be executed on the server. Install PML package: deno install -Agf jsr:@anthropic/pml",
                details: {
                  clientTools,
                  toolsUsed,
                },
              },
            };
          }
        }
      }

      // Step 6: Create executor and execute
      const [executor, executorContext] = this.deps.workerBridgeFactory.create({
        toolDefinitions: toolDefs,
      });

      try {
        executor.setWorkerBridge?.(executorContext.bridge);
        executor.setToolDefinitions?.(toolDefs);

        const physicalResults = await executor.execute({ tasks: optimizedDAG.tasks });
        const executionTimeMs = performance.now() - startTime;

        // Step 7: Generate logical trace
        const physicalResultsMap = new Map(
          physicalResults.results.map((r) => [r.taskId, {
            taskId: r.taskId,
            status: r.status,
            output: r.output,
            executionTimeMs: r.executionTimeMs ?? 0,
          }]),
        );
        const logicalTrace = this.deps.dagConverter.generateLogicalTrace(optimizedDAG, physicalResultsMap);
        const toolsCalled = logicalTrace.executedPath;

        // Count tool calls for loop iteration tracking
        const toolCallCounts = countToolCalls(executorContext.traces as Array<{ type: string; tool?: string }>);

        // Build task results
        const taskResults = buildTaskResults(physicalResults, optimizedDAG, toolCallCounts);

        // Check for failures
        if (hasAnyFailure(physicalResults)) {
          const firstError = this.getFirstError(physicalResults);
          log.info("[ExecuteDirectUseCase] Execution failed, NOT saving capability", {
            failedTasks: physicalResults.failedTasks,
            firstError,
          });

          return {
            success: false,
            error: {
              code: "EXECUTION_FAILED",
              message: `Code execution failed: ${firstError}`,
              details: {
                failedTasks: physicalResults.failedTasks,
                errors: physicalResults.errors,
              },
            },
            data: {
              success: false,
              mode: "direct",
              executionTimeMs,
              toolFailures: buildToolFailures(physicalResults),
            },
          };
        }

        // Step 8: Save capability and emit learning event
        const correlationId = crypto.randomUUID();
        const { capability, capabilityFqdn, capabilityName } = await this.saveCapability(
          code,
          intent,
          executionTimeMs,
          toolsCalled,
          taskResults,
          staticStructure,
          correlationId,
        );

        // Step 9: Post-execution learning (DR-DSP, SHGAT nodes, PER training)
        // Runs in background (non-blocking) to not delay response
        if (this.deps.postExecutionService) {
          this.deps.postExecutionService.process({
            capability: {
              id: capability.id,
              successRate: 1.0, // New capability starts at 100%
              toolsUsed: toolsCalled,
            },
            staticStructure,
            toolsCalled,
            taskResults,
            intent,
          }).catch((err) => {
            log.warn("[ExecuteDirectUseCase] Post-execution processing failed", {
              error: String(err),
            });
          });
        }

        // Build response
        const successOutputs = extractSuccessOutputs(physicalResults.results);
        const result = successOutputs.length === 1 ? successOutputs[0] : successOutputs;

        log.info("[ExecuteDirectUseCase] Execution completed", {
          capabilityId: capability.id,
          capabilityName,
          executionTimeMs: executionTimeMs.toFixed(2),
          toolsCalled: toolsCalled.length,
        });

        return {
          success: true,
          data: {
            success: true,
            result,
            capabilityId: capability.id,
            capabilityName,
            capabilityFqdn,
            mode: "direct",
            executionTimeMs,
            dag: {
              mode: "dag",
              tasksCount: logicalDAG.tasks.length,
              layersCount: physicalResults.parallelizationLayers,
              speedup: executor.calculateSpeedup?.(physicalResults),
              toolsDiscovered: toolsCalled,
            },
            traces: taskResults,
            staticStructure,
          },
        };
      } finally {
        this.deps.workerBridgeFactory.cleanup(executorContext);
      }
    } catch (error) {
      log.error(`[ExecuteDirectUseCase] Error: ${error}`);
      return {
        success: false,
        error: {
          code: "EXECUTION_ERROR",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private getFirstError(results: DAGExecutionResults): string {
    const failedResults = results.results.filter(
      (r) => r.status === "error" || r.status === "failed_safe",
    );
    return failedResults[0]?.error ?? results.errors[0]?.error ?? "Unknown error";
  }

  private async saveCapability(
    code: string,
    intent: string,
    executionTimeMs: number,
    toolsCalled: string[],
    taskResults: TraceTaskResult[],
    staticStructure: StaticStructure,
    correlationId: string,
  ): Promise<{
    capability: { id: string; codeHash: string; name?: string };
    capabilityFqdn?: string;
    capabilityName?: string;
  }> {
    // Generate intent embedding
    let intentEmbedding: number[] | undefined;
    if (this.deps.embeddingModel) {
      try {
        intentEmbedding = await this.deps.embeddingModel.encode(intent);

        // Phase 3.2: Cache embedding for SHGAT training subscriber
        if (intentEmbedding && this.deps.embeddingCache) {
          await this.deps.embeddingCache.set(
            ["pml", "embedding", correlationId],
            intentEmbedding,
            { expireIn: 5 * 60 * 1000 }, // 5 minutes TTL
          );
          log.debug("[ExecuteDirectUseCase] Cached embedding for training", { correlationId });
        }
      } catch (err) {
        log.warn("[ExecuteDirectUseCase] Failed to generate embedding", { error: String(err) });
      }
    }

    // Infer decisions
    const inferredDecisions = this.deps.staticStructureBuilder.inferDecisions(
      staticStructure,
      toolsCalled,
    );

    // Save capability
    const { capability } = await this.deps.capabilityRepo.saveCapability({
      code,
      intent,
      durationMs: Math.round(executionTimeMs),
      success: true,
      toolsUsed: toolsCalled,
      traceData: {
        executedPath: toolsCalled,
        taskResults,
        decisions: inferredDecisions,
        initialContext: { intent },
        intentEmbedding,
        userId: this.userId ?? undefined,
      },
      staticStructure,
    });

    // Register in capability registry
    let capabilityFqdn: string | undefined;
    let capabilityName: string | undefined;

    if (this.deps.capabilityRegistry) {
      try {
        const existing = await this.deps.capabilityRegistry.getByCodeHash(
          capability.codeHash,
          DEFAULT_SCOPE,
        );

        if (existing) {
          // Reuse existing record
          capabilityFqdn = (existing as { id: string }).id;
          capabilityName = capability.name;
        } else {
          // Create new record
          const firstTool = toolsCalled[0] ?? "misc";
          const namespace = firstTool.includes(":") ? firstTool.split(":")[0] : "code";
          const action = `exec_${capability.codeHash.substring(0, 8)}`;
          const hash = capability.codeHash.substring(0, 4);
          capabilityName = `${namespace}:${action}`;

          const record = await this.deps.capabilityRegistry.create({
            org: DEFAULT_SCOPE.org,
            project: DEFAULT_SCOPE.project,
            namespace,
            action,
            workflowPatternId: capability.id,
            hash,
            createdBy: "pml_execute",
            toolsUsed: toolsCalled,
          });

          capabilityFqdn = record.id;
        }
      } catch (err) {
        log.warn("[ExecuteDirectUseCase] Failed to register in registry", { error: String(err) });
      }
    }

    // Phase 3.2: Cache embedding with capabilityId for training after SHGAT registration
    // TrainingSubscriber listens to capability.zone.created (after SHGAT registers the cap)
    if (intentEmbedding && this.deps.embeddingCache) {
      try {
        await this.deps.embeddingCache.set(
          ["pml", "embedding", "cap", capability.id],
          intentEmbedding,
          { expireIn: 5 * 60 * 1000 }, // 5 minutes TTL
        );
        log.debug("[ExecuteDirectUseCase] Cached embedding for training (by capabilityId)", {
          capabilityId: capability.id,
        });
      } catch (err) {
        log.warn("[ExecuteDirectUseCase] Failed to cache embedding by capabilityId", { error: String(err) });
      }
    }

    return {
      capability,
      capabilityFqdn,
      capabilityName: capabilityName ?? capability.name,
    };
  }
}
