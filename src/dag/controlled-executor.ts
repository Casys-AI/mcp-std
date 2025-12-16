/**
 * ControlledExecutor - DAG Executor with Adaptive Feedback Loops
 *
 * Extends ParallelExecutor with:
 * - Event stream for real-time observability
 * - Command queue for dynamic control
 * - WorkflowState management with reducers
 * - Zero breaking changes to Epic 2 code
 *
 * @module dag/controlled-executor
 */

import { ParallelExecutor } from "./executor.ts";
import type { DAGStructure, Task } from "../graphrag/types.ts";
import type { ExecutionEvent, ExecutorConfig, TaskResult, ToolExecutor } from "./types.ts";
import { EventStream, type EventStreamStats } from "./event-stream.ts";
import { CommandQueue, type CommandQueueStats } from "./command-queue.ts";
import {
  createInitialState,
  getStateSnapshot,
  type StateUpdate,
  updateState,
  type WorkflowState,
} from "./state.ts";
import { CheckpointManager } from "./checkpoint-manager.ts";
import type { PGliteClient } from "../db/client.ts";
import { getLogger } from "../telemetry/logger.ts";
import type { DAGSuggester } from "../graphrag/dag-suggester.ts";
import { DenoSandboxExecutor } from "../sandbox/executor.ts";
import type { EpisodicMemoryStore } from "../learning/episodic-memory-store.ts";
import { SpeculativeExecutor } from "../speculation/speculative-executor.ts";
import {
  DEFAULT_SPECULATION_CONFIG,
  SpeculationManager,
} from "../speculation/speculation-manager.ts";
import type {
  CompletedTask,
  SpeculationCache,
  SpeculationConfig,
  SpeculationMetrics,
} from "../graphrag/types.ts";
// Story 7.7c: Permission escalation imports
import type { PermissionEscalationRequest, PermissionSet } from "../capabilities/types.ts";
import type { PermissionAuditStore } from "../capabilities/permission-audit-store.ts";
import {
  PermissionEscalationHandler,
  formatEscalationRequest,
} from "../capabilities/permission-escalation-handler.ts";
import { suggestEscalation } from "../capabilities/permission-escalation.ts";

const log = getLogger("controlled-executor");

/**
 * Determines if a task is safe-to-fail (Story 3.5)
 *
 * Safe-to-fail tasks:
 * - Are code_execution type (NOT MCP tools)
 * - Have NO side effects (idempotent, isolated)
 *
 * These tasks can fail without halting the workflow.
 *
 * @param task - Task to check
 * @returns true if task can fail safely
 */
function isSafeToFail(task: Task): boolean {
  return !task.sideEffects && task.type === "code_execution";
}

/**
 * ControlledExecutor extends ParallelExecutor with adaptive feedback loops
 *
 * Features:
 * - executeStream() async generator yields events in real-time
 * - Event stream for observability (<5ms emission overhead)
 * - Command queue for dynamic control (<10ms injection latency)
 * - WorkflowState with MessagesState-inspired reducers
 * - Backward compatible (ParallelExecutor.execute() still works)
 * - Preserves 5x speedup from parallel execution
 */
export class ControlledExecutor extends ParallelExecutor {
  private state: WorkflowState | null = null;
  private eventStream: EventStream;
  private commandQueue: CommandQueue;
  private checkpointManager: CheckpointManager | null = null;
  private dagSuggester: DAGSuggester | null = null;
  private replanCount: number = 0; // Rate limiting for replans (Story 2.5-3 Task 3)
  private readonly MAX_REPLANS = 3; // Maximum replans per workflow
  private episodicMemory: EpisodicMemoryStore | null = null; // Story 4.1d - Episodic memory integration

  // Story 3.5-1: Speculative Execution
  private speculativeExecutor: SpeculativeExecutor | null = null;
  private speculationManager: SpeculationManager | null = null;
  private speculationConfig: SpeculationConfig = DEFAULT_SPECULATION_CONFIG;
  private lastCompletedTool: string | null = null; // For pattern reinforcement

  // Story 9.5: Multi-tenant data isolation
  private userId: string = "local";

  // Task 3: Dependencies for sandbox execution (eager learning, trace collection)
  private capabilityStore?: import("../capabilities/capability-store.ts").CapabilityStore;
  private graphRAG?: import("../graphrag/graph-engine.ts").GraphRAGEngine;

  // Story 7.7c: Permission escalation for HIL approval
  private permissionEscalationHandler: PermissionEscalationHandler | null = null;
  private _permissionAuditStore: PermissionAuditStore | null = null;

  /**
   * Create a new controlled executor
   *
   * @param toolExecutor - Function to execute individual tools
   * @param config - Executor configuration
   */
  constructor(toolExecutor: ToolExecutor, config: ExecutorConfig = {}) {
    super(toolExecutor, config);
    this.eventStream = new EventStream();
    this.commandQueue = new CommandQueue();
    this.userId = config.userId ?? "local"; // Story 9.5: Multi-tenant isolation
  }

  /**
   * Set checkpoint manager for fault-tolerant execution
   *
   * Story 2.5-2: Enables checkpoint/resume functionality.
   * Call this before executeStream() to enable checkpointing.
   *
   * @param db - PGlite database client
   * @param autoPrune - Enable automatic pruning (default: true for production)
   */
  setCheckpointManager(db: PGliteClient, autoPrune: boolean = true): void {
    this.checkpointManager = new CheckpointManager(db, autoPrune);
  }

  /**
   * Set DAG suggester for replanning capability (Story 2.5-3)
   *
   * Required for AIL replan_dag commands.
   * Call this before executeStream() to enable dynamic replanning.
   *
   * @param dagSuggester - DAGSuggester instance with GraphRAG access
   */
  setDAGSuggester(dagSuggester: DAGSuggester): void {
    this.dagSuggester = dagSuggester;
  }

  /**
   * Set learning dependencies for sandbox execution (Task 3)
   *
   * Enables capability learning and trace collection during code execution.
   * These are passed to DenoSandboxExecutor → WorkerBridge for eager learning.
   *
   * @param capabilityStore - CapabilityStore for eager learning
   * @param graphRAG - GraphRAGEngine for trace collection
   */
  setLearningDependencies(
    capabilityStore?: import("../capabilities/capability-store.ts").CapabilityStore,
    graphRAG?: import("../graphrag/graph-engine.ts").GraphRAGEngine,
  ): void {
    this.capabilityStore = capabilityStore;
    this.graphRAG = graphRAG;
    log.debug("Learning dependencies set", {
      hasCapabilityStore: !!capabilityStore,
      hasGraphRAG: !!graphRAG,
    });
  }

  /**
   * Set permission escalation dependencies (Story 7.7c - AC3, AC4, AC5)
   *
   * Enables HIL permission escalation when a capability fails with PermissionDenied.
   * The handler coordinates between suggestEscalation(), HIL approval, and DB updates.
   *
   * @param auditStore - PermissionAuditStore for logging decisions
   */
  setPermissionEscalationDependencies(auditStore: PermissionAuditStore): void {
    this._permissionAuditStore = auditStore;

    // Create the handler with HIL callback that uses existing infrastructure
    if (this.capabilityStore && auditStore) {
      this.permissionEscalationHandler = new PermissionEscalationHandler(
        this.capabilityStore,
        auditStore,
        async (request: PermissionEscalationRequest) => {
          return await this.requestPermissionEscalation(request);
        },
        this.userId, // Pass the userId for audit logging (Story 7.7c L1 fix)
      );
      log.debug("Permission escalation handler configured", { userId: this.userId });
    }
  }

  /**
   * Request human approval for permission escalation (Story 7.7c - AC3)
   *
   * Follows existing HIL pattern:
   * 1. Emit decision_required event with escalation details
   * 2. Wait for permission_escalation_response command
   * 3. Return approval decision
   *
   * @param request - Permission escalation request
   * @returns Approval result
   */
  async requestPermissionEscalation(
    request: PermissionEscalationRequest,
  ): Promise<{ approved: boolean; feedback?: string }> {
    const workflowId = this.state?.workflowId ?? "unknown";

    // Format the escalation request for human display
    const description = formatEscalationRequest(request);

    // Emit decision_required event
    const escalationEvent: ExecutionEvent = {
      type: "decision_required",
      timestamp: Date.now(),
      workflowId,
      decisionType: "HIL",
      description,
    };

    await this.eventStream.emit(escalationEvent);

    log.info("Permission escalation requested, waiting for HIL approval", {
      capabilityId: request.capabilityId,
      currentSet: request.currentSet,
      requestedSet: request.requestedSet,
    });

    // Wait for human decision (5 minute timeout, same as regular HIL)
    const command = await this.waitForDecisionCommand("HIL", 300000);

    if (!command) {
      // Timeout: Default to reject (safer for permission escalation)
      log.warn("Permission escalation timeout - rejecting");
      return { approved: false, feedback: "Escalation request timed out" };
    }

    // Handle permission_escalation_response command
    if (command.type === "permission_escalation_response") {
      const approved = command.approved === true;
      log.info(`Permission escalation ${approved ? "approved" : "rejected"}`, {
        capabilityId: request.capabilityId,
        feedback: command.feedback,
      });

      // Capture decision in episodic memory
      this.captureHILDecision(
        workflowId,
        approved,
        `perm-esc-${request.capabilityId}`,
        command.feedback ?? `Escalation ${request.currentSet} -> ${request.requestedSet}`,
      );

      return { approved, feedback: command.feedback };
    }

    // Handle legacy approval_response as fallback
    if (command.type === "approval_response") {
      const approved = command.approved === true;
      log.info(`Permission escalation via approval_response: ${approved ? "approved" : "rejected"}`);

      this.captureHILDecision(
        workflowId,
        approved,
        `perm-esc-${request.capabilityId}`,
        command.feedback,
      );

      return { approved, feedback: command.feedback };
    }

    // Unknown command type
    log.warn(`Unexpected command type for permission escalation: ${command.type}`);
    return { approved: false, feedback: `Unexpected response: ${command.type}` };
  }

  /**
   * Set episodic memory store for event capture (Story 4.1d)
   *
   * Enables automatic capture of episodic events during workflow execution.
   * Events captured: task_complete, ail_decision, hil_decision, speculation_start.
   * Optional - if not set, workflow executes normally without event capture (graceful degradation).
   *
   * @param store - EpisodicMemoryStore instance
   */
  setEpisodicMemoryStore(store: EpisodicMemoryStore): void {
    this.episodicMemory = store;
    log.debug("Episodic memory capture enabled");
  }

  // =============================================================================
  // Story 3.5-1: Speculative Execution Integration
  // =============================================================================

  /**
   * Enable speculative execution (Story 3.5-1)
   *
   * Configures speculation with optional custom settings.
   * When enabled, ControlledExecutor will:
   * - Predict next likely tools after each layer
   * - Execute high-confidence predictions speculatively in sandbox
   * - Return cached results instantly when predictions are correct
   *
   * @param config - Optional speculation configuration
   */
  enableSpeculation(config?: Partial<SpeculationConfig>): void {
    this.speculationConfig = {
      ...DEFAULT_SPECULATION_CONFIG,
      ...config,
    };

    // Initialize components if not already done
    if (!this.speculativeExecutor) {
      this.speculativeExecutor = new SpeculativeExecutor({
        maxConcurrent: this.speculationConfig.maxConcurrent,
      });
    }

    if (!this.speculationManager) {
      this.speculationManager = new SpeculationManager(this.speculationConfig);

      // Connect to AdaptiveThresholdManager if available via DAGSuggester
      // (The threshold manager would need to be passed separately or accessed via config)
    }

    // Connect components
    this.speculativeExecutor.setSpeculationManager(this.speculationManager);

    // Connect to GraphRAG if DAGSuggester is available
    if (this.dagSuggester) {
      this.speculationManager.setGraphEngine(this.dagSuggester.getGraphEngine());
    }

    log.info("[ControlledExecutor] Speculation enabled", {
      threshold: this.speculationConfig.confidenceThreshold,
      maxConcurrent: this.speculationConfig.maxConcurrent,
    });
  }

  /**
   * Disable speculative execution
   */
  disableSpeculation(): void {
    this.speculationConfig.enabled = false;
    if (this.speculativeExecutor) {
      this.speculativeExecutor.destroy();
      this.speculativeExecutor = null;
    }
    this.speculationManager = null;
    log.info("[ControlledExecutor] Speculation disabled");
  }

  /**
   * Start speculative execution for predicted tasks (Story 3.5-1 Task 4.1)
   *
   * Called internally before each layer to predict and speculatively execute
   * likely next tools.
   *
   * @param completedTasks - Tasks completed so far
   * @param context - Execution context
   */
  private async startSpeculativeExecution(
    completedTasks: CompletedTask[],
    context: Record<string, unknown>,
  ): Promise<void> {
    if (!this.speculationConfig.enabled || !this.dagSuggester || !this.speculativeExecutor) {
      return;
    }

    try {
      const startTime = performance.now();

      // Get predictions from DAGSuggester
      const predictions = await this.dagSuggester.predictNextNodes(null, completedTasks);

      if (predictions.length === 0) {
        log.debug("[ControlledExecutor] No predictions for speculation");
        return;
      }

      // Filter predictions that meet threshold
      const toSpeculate = this.speculationManager
        ? this.speculationManager.filterForSpeculation(predictions)
        : predictions.filter((p) => p.confidence >= this.speculationConfig.confidenceThreshold);

      if (toSpeculate.length === 0) {
        log.debug("[ControlledExecutor] No predictions meet speculation threshold");
        return;
      }

      // Capture speculation start events for metrics
      for (const prediction of toSpeculate) {
        this.captureSpeculationStart(
          this.state?.workflowId ?? "unknown",
          prediction.toolId,
          prediction.confidence,
          prediction.reasoning,
        );
      }

      // Start speculative execution (non-blocking)
      await this.speculativeExecutor.startSpeculations(toSpeculate, context);

      const elapsedMs = performance.now() - startTime;
      log.info(
        `[ControlledExecutor] Started ${toSpeculate.length} speculations (${
          elapsedMs.toFixed(1)
        }ms)`,
      );
    } catch (error) {
      log.error(`[ControlledExecutor] Speculation start failed: ${error}`);
      // Non-critical: Continue with normal execution
    }
  }

  /**
   * Check speculation cache for a tool (Story 3.5-1 Task 4.4)
   *
   * Called when executing a task to check if we already have
   * a speculative result cached.
   *
   * @param toolId - Tool to check
   * @returns Cached result or null
   */
  checkSpeculativeCache(toolId: string): SpeculationCache | null {
    if (!this.speculativeExecutor) {
      return null;
    }

    return this.speculativeExecutor.checkCache(toolId);
  }

  /**
   * Validate and consume speculation result (Story 3.5-1 Task 4.5)
   *
   * Called when a task is about to execute. If speculation was correct,
   * returns cached result. Otherwise, signals miss and clears cache.
   *
   * Note: Currently exposed as public for external use (e.g., MCP gateway).
   * Will be integrated into executeTask in future iteration.
   *
   * @param toolId - Tool being executed
   * @returns Cached result if speculation was correct, null otherwise
   */
  async consumeSpeculation(toolId: string): Promise<SpeculationCache | null> {
    if (!this.speculativeExecutor) {
      return null;
    }

    return await this.speculativeExecutor.validateAndConsume(
      toolId,
      this.lastCompletedTool ?? undefined,
    );
  }

  /**
   * Get speculation metrics (Story 3.5-1)
   *
   * @returns Current speculation metrics or null if not enabled
   */
  getSpeculationMetrics(): SpeculationMetrics | null {
    if (!this.speculationManager) {
      return null;
    }
    return this.speculationManager.getMetrics();
  }

  /**
   * Get current speculation configuration
   */
  getSpeculationConfig(): SpeculationConfig {
    return { ...this.speculationConfig };
  }

  /**
   * Capture episodic event for task completion (Story 4.1d - Task 2)
   *
   * Non-blocking capture with graceful degradation if episodic memory not set.
   * Includes workflow context hash for later retrieval.
   *
   * @param workflowId - Workflow identifier
   * @param taskId - Task identifier
   * @param status - Task status ('success' | 'error' | 'failed_safe')
   * @param output - Task output (not stored for PII safety, only metadata)
   * @param executionTimeMs - Execution time in milliseconds
   * @param error - Error message if task failed
   */
  private captureTaskComplete(
    workflowId: string,
    taskId: string,
    status: "success" | "error" | "failed_safe",
    output: unknown,
    executionTimeMs?: number,
    error?: string,
  ): void {
    if (!this.episodicMemory) return; // Graceful degradation

    // Non-blocking capture (fire-and-forget)
    this.episodicMemory.capture({
      workflow_id: workflowId, // Map to DB snake_case
      event_type: "task_complete",
      task_id: taskId,
      timestamp: Date.now(),
      context_hash: this.state ? this.getContextHash() : undefined,
      data: {
        result: {
          status: status === "failed_safe" ? "error" : status,
          executionTimeMs,
          errorMessage: error,
          // No output/arguments content for PII safety (ADR-008)
          // Enriched metadata allowed: output_size, output_type
          output: output !== null && output !== undefined
            ? {
              type: typeof output,
              size: typeof output === "string"
                ? output.length
                : Array.isArray(output)
                ? output.length
                : typeof output === "object"
                ? Object.keys(output as object).length
                : undefined,
            }
            : undefined,
        },
        context: this.state
          ? {
            currentLayer: this.state.currentLayer,
            completedTasksCount: this.state.tasks.filter((t) => t.status === "success").length,
            failedTasksCount: this.state.tasks.filter((t) => t.status === "error").length,
          }
          : undefined,
      },
    }).catch((err) => {
      // Non-critical: Log but don't fail workflow
      log.error(`Episodic capture failed for task ${taskId}: ${err}`);
    });
  }

  /**
   * Generate context hash from current workflow state (Story 4.1d)
   *
   * Hash includes workflow type, current layer, and complexity metrics.
   * Used for context-based retrieval of similar episodes.
   */
  private getContextHash(): string {
    if (!this.state) return "no-state";

    // Build context for hashing (consistent with EpisodicMemoryStore.hashContext)
    const context = {
      workflowType: "dag-execution",
      domain: "cai",
      complexity: this.state.tasks.length > 10
        ? "high"
        : this.state.tasks.length > 5
        ? "medium"
        : "low",
    };

    // Simple hash matching EpisodicMemoryStore pattern
    return ["workflowType", "domain", "complexity"]
      .map((k) => `${k}:${context[k as keyof typeof context] ?? "default"}`)
      .join("|");
  }

  /**
   * Capture episodic event for AIL decision (Story 4.1d - Task 3)
   *
   * Non-blocking capture with context at decision point.
   *
   * @param workflowId - Workflow identifier
   * @param outcome - Decision outcome (continue, abort, replan_success, etc.)
   * @param reasoning - Decision reasoning/description
   * @param metadata - Additional decision metadata
   */
  private captureAILDecision(
    workflowId: string,
    outcome: string,
    reasoning: string,
    metadata?: Record<string, unknown>,
  ): void {
    if (!this.episodicMemory) return; // Graceful degradation

    // Non-blocking capture (fire-and-forget)
    this.episodicMemory.capture({
      workflow_id: workflowId, // Map to DB snake_case
      event_type: "ail_decision",
      timestamp: Date.now(),
      context_hash: this.state ? this.getContextHash() : undefined,
      data: {
        decision: {
          type: "ail",
          action: outcome,
          reasoning,
        },
        context: this.state
          ? {
            currentLayer: this.state.currentLayer,
            completedTasksCount: this.state.tasks.filter((t) => t.status === "success").length,
            failedTasksCount: this.state.tasks.filter((t) => t.status === "error").length,
          }
          : undefined,
        metadata,
      },
    }).catch((err) => {
      log.error(`Episodic capture failed for AIL decision: ${err}`);
    });
  }

  /**
   * Capture episodic event for HIL decision (Story 4.1d - Task 4)
   *
   * Non-blocking capture with approval data and context.
   *
   * @param workflowId - Workflow identifier
   * @param approved - Whether human approved
   * @param checkpointId - Checkpoint ID for this decision
   * @param feedback - Human feedback/comments
   */
  private captureHILDecision(
    workflowId: string,
    approved: boolean,
    checkpointId: string,
    feedback?: string,
  ): void {
    if (!this.episodicMemory) return; // Graceful degradation

    // Non-blocking capture (fire-and-forget)
    this.episodicMemory.capture({
      workflow_id: workflowId, // Map to DB snake_case
      event_type: "hil_decision",
      timestamp: Date.now(),
      context_hash: this.state ? this.getContextHash() : undefined,
      data: {
        decision: {
          type: "hil",
          action: approved ? "approve" : "reject",
          reasoning: feedback || (approved ? "Human approved" : "Human rejected"),
          approved,
        },
        context: this.state
          ? {
            currentLayer: this.state.currentLayer,
            completedTasksCount: this.state.tasks.filter((t) => t.status === "success").length,
            failedTasksCount: this.state.tasks.filter((t) => t.status === "error").length,
          }
          : undefined,
        metadata: {
          checkpointId: checkpointId,
        },
      },
    }).catch((err) => {
      log.error(`Episodic capture failed for HIL decision: ${err}`);
    });
  }

  /**
   * Capture episodic event for speculation start (Story 4.1d - Task 5)
   *
   * Placeholder for Epic 3.5 integration. Call this when speculation begins
   * to track prediction accuracy over time.
   *
   * Non-blocking capture with prediction data.
   *
   * @param workflowId - Workflow identifier
   * @param toolId - Tool being speculatively executed
   * @param confidence - Confidence score (0-1) of the speculation
   * @param reasoning - Why this tool was selected speculatively
   * @returns Event ID (string) for later updating wasCorrect field
   */
  captureSpeculationStart(
    workflowId: string,
    toolId: string,
    confidence: number,
    reasoning: string,
  ): string | null {
    if (!this.episodicMemory) return null; // Graceful degradation

    const eventId = crypto.randomUUID();

    // Non-blocking capture (fire-and-forget)
    this.episodicMemory.capture({
      workflow_id: workflowId, // Map to DB snake_case
      event_type: "speculation_start",
      timestamp: Date.now(),
      context_hash: this.state ? this.getContextHash() : undefined,
      data: {
        prediction: {
          toolId,
          confidence,
          reasoning,
          wasCorrect: undefined, // Will be updated after validation
        },
        context: this.state
          ? {
            currentLayer: this.state.currentLayer,
            completedTasksCount: this.state.tasks.filter((t) => t.status === "success").length,
            failedTasksCount: this.state.tasks.filter((t) => t.status === "error").length,
          }
          : undefined,
      },
    }).catch((err) => {
      log.error(`Episodic capture failed for speculation_start: ${err}`);
    });

    return eventId;
  }

  /**
   * Check if AIL decision point should be triggered (Story 2.5-3)
   *
   * @param config - Executor configuration
   * @param _layerIdx - Current layer index (unused, reserved for future)
   * @param hasErrors - Whether current layer had errors
   * @returns true if decision point should trigger
   */
  private shouldTriggerAIL(
    config: ExecutorConfig,
    _layerIdx: number,
    hasErrors: boolean,
  ): boolean {
    if (!config.ail?.enabled) return false;

    const mode = config.ail.decision_points;
    if (mode === "per_layer") return true;
    if (mode === "on_error") return hasErrors;
    if (mode === "manual") return false; // Only trigger via explicit command

    return false;
  }

  /**
   * Check if HIL approval checkpoint should be triggered (Story 2.5-3)
   *
   * @param config - Executor configuration
   * @param _layerIdx - Current layer index (unused, reserved for future)
   * @param layer - Tasks in current layer
   * @returns true if approval required
   */
  private shouldRequireApproval(
    config: ExecutorConfig,
    _layerIdx: number,
    layer: any[],
  ): boolean {
    if (!config.hil?.enabled) return false;

    const mode = config.hil.approval_required;
    if (mode === "always") return true;
    if (mode === "never") return false;
    if (mode === "critical_only") {
      // Check if any task in layer has sideEffects flag
      return layer.some((task) => task.sideEffects === true);
    }

    return false;
  }

  /**
   * Generate summary for HIL approval (Story 2.5-3)
   *
   * Template-based summary generation (500-1000 tokens).
   * No LLM call needed for MVP.
   *
   * @param layerIdx - Completed layer index
   * @param layers - All DAG layers
   * @returns Summary string for human display
   */
  private generateHILSummary(
    layerIdx: number,
    layers: any[][],
  ): string {
    if (!this.state) return "Error: State not initialized";

    const completedTasks = this.state.tasks.filter(
      (t) => t.status === "success",
    ).length;
    const failedTasks = this.state.tasks.filter((t) => t.status === "error")
      .length;

    const nextLayer = layerIdx + 1 < layers.length ? layers[layerIdx + 1] : null;

    const summary = [
      `=== Workflow Approval Checkpoint ===\n`,
      `Layer ${layerIdx} completed successfully\n`,
      `\n## Execution Summary`,
      `Tasks executed in this layer: ${layers[layerIdx].length}`,
      `Total tasks completed: ${completedTasks}`,
      `Total tasks failed: ${failedTasks}`,
      `Current workflow status: ${
        failedTasks === 0 ? "All tasks successful" : "Some tasks have errors"
      }`,
      `\n## Recent Task Results`,
      ...this.state.tasks.slice(-3).map((t) =>
        `  - ${t.taskId}: ${t.status} ${
          t.executionTimeMs ? `(${t.executionTimeMs.toFixed(0)}ms)` : ""
        }`
      ),
      `\n## Layer ${layerIdx} Task Details`,
      ...layers[layerIdx].map((t: any) =>
        `  - Task ID: ${t.id}\n    Tool: ${t.tool}\n    Dependencies: ${
          t.depends_on?.length || 0
        }\n    Status: ${
          this.state?.tasks.find((task) => task.taskId === t.id)?.status ||
          "unknown"
        }`
      ),
    ];

    if (nextLayer) {
      summary.push(
        `\n## Next Layer Preview`,
        `The next layer contains ${nextLayer.length} task(s):`,
        ...nextLayer.slice(0, 5).map((t: any) =>
          `  - Task ID: ${t.id}\n    Tool: ${t.tool}\n    Dependencies: ${
            t.depends_on?.join(", ") || "none"
          }`
        ),
      );
      if (nextLayer.length > 5) {
        summary.push(`  ... and ${nextLayer.length - 5} more tasks`);
      }
      summary.push(
        `\n## Approval Request`,
        `The workflow is ready to proceed to layer ${layerIdx + 1}.`,
        `Please review the completed tasks and upcoming work before approving.`,
        `\nApprove to continue execution? [Y/N]`,
      );
    } else {
      summary.push(
        `\n## Final Layer Reached`,
        `This was the final layer of the workflow.`,
        `All planned tasks have been executed.`,
        `\nApprove to complete the workflow? [Y/N]`,
      );
    }

    return summary.join("\n");
  }

  /**
   * Process AIL/HIL commands and wait for decision (Story 2.5-3)
   *
   * Waits for agent/human to enqueue a command via CommandQueue.
   * Timeout after 5 minutes (configurable).
   *
   * @param decisionType - "AIL" or "HIL"
   * @param timeout - Timeout in ms (default: 5 minutes)
   * @returns Command from queue or null if timeout
   */
  private async waitForDecisionCommand(
    decisionType: "AIL" | "HIL",
    timeout: number = 300000, // 5 minutes
  ): Promise<any | null> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const commands = await this.commandQueue.processCommandsAsync();

      if (commands.length > 0) {
        // Return first command (FIFO)
        return commands[0];
      }

      // Wait 100ms before checking again (non-blocking polling)
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    log.warn(`${decisionType} decision timeout after ${timeout}ms`);
    return null; // Timeout
  }

  /**
   * Execute DAG with streaming events and adaptive control
   *
   * Returns an async generator that yields ExecutionEvents in real-time.
   * Final return value is the complete WorkflowState.
   *
   * Flow:
   * 1. Emit workflow_start event
   * 2. Initialize WorkflowState
   * 3. For each layer:
   *    - Emit layer_start event
   *    - Process commands (non-blocking)
   *    - Execute layer in parallel (call super.executeLayer())
   *    - Update state via reducers
   *    - Emit state_updated event
   *    - Yield checkpoint event (placeholder for Story 2.5-2)
   * 4. Emit workflow_complete event
   * 5. Return final WorkflowState
   *
   * @param dag - DAG structure to execute
   * @param workflow_id - Unique workflow identifier (default: auto-generated)
   * @returns Async generator yielding events, returning final state
   */
  async *executeStream(
    dag: DAGStructure,
    workflow_id?: string,
  ): AsyncGenerator<ExecutionEvent, WorkflowState, void> {
    const workflowId = workflow_id ?? `workflow-${Date.now()}`;
    const startTime = performance.now();

    // 1. Initialize state
    this.state = createInitialState(workflowId);

    // 2. Topological sort (from ParallelExecutor)
    let layers = this.topologicalSort(dag);

    // 3. Emit workflow_start event
    const startEvent: ExecutionEvent = {
      type: "workflow_start",
      timestamp: Date.now(),
      workflowId: workflowId,
      totalLayers: layers.length,
    };
    await this.eventStream.emit(startEvent);
    yield startEvent;

    // 4. Execute layer by layer
    const results = new Map<string, any>();
    let successfulTasks = 0;
    let failedTasks = 0;

    for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
      const layer = layers[layerIdx];

      // 4a. Emit layer_start event
      const layerStartEvent: ExecutionEvent = {
        type: "layer_start",
        timestamp: Date.now(),
        workflowId: workflowId,
        layerIndex: layerIdx,
        tasksCount: layer.length,
      };
      await this.eventStream.emit(layerStartEvent);
      yield layerStartEvent;

      // 4b. Process general control commands (non-blocking)
      // Only process commands that are NOT decision commands (AIL/HIL)
      // Decision commands (continue, approval_response) are handled by waitForDecisionCommand()
      const commands = await this.commandQueue.processCommandsByType(["abort", "pause"]);
      for (const cmd of commands) {
        log.info(`Processing control command: ${cmd.type}`);
        if (cmd.type === "abort") {
          log.warn(`Abort command received: ${cmd.reason}`);
          throw new Error(`Workflow aborted by agent: ${cmd.reason}`);
        }
        // TODO: Story 2.5-3 - Implement pause command handler
      }

      // 4b.5 Story 3.5-1: Start speculative execution for next layer
      // Build completed tasks list for prediction
      const completedTasksForPrediction: CompletedTask[] = this.state.tasks.map((t) => ({
        taskId: t.taskId,
        tool: dag.tasks.find((dt) => dt.id === t.taskId)?.tool ?? "unknown",
        status: t.status as "success" | "error" | "failed_safe",
        executionTimeMs: t.executionTimeMs,
      }));

      // Start speculation in background (non-blocking)
      this.startSpeculativeExecution(completedTasksForPrediction, {}).catch((err) => {
        log.debug(`[ControlledExecutor] Speculation failed: ${err}`);
      });

      // 4c. Emit task_start for each task
      for (const task of layer) {
        const taskStartEvent: ExecutionEvent = {
          type: "task_start",
          timestamp: Date.now(),
          workflowId: workflowId,
          taskId: task.id,
          tool: task.tool,
        };
        await this.eventStream.emit(taskStartEvent);
        yield taskStartEvent;
      }

      // 4d. Execute layer in parallel
      const layerResults = await Promise.allSettled(
        layer.map((task) => this.executeTask(task, results)),
      );

      // 4e. Collect results and emit task events
      const layerTaskResults = [];
      for (let i = 0; i < layer.length; i++) {
        const task = layer[i];
        const result = layerResults[i];

        if (result.status === "fulfilled") {
          successfulTasks++;
          const taskResult = {
            taskId: task.id,
            status: "success" as const,
            output: result.value.output,
            executionTimeMs: result.value.executionTimeMs,
          };
          results.set(task.id, taskResult);
          layerTaskResults.push(taskResult);

          // Emit task_complete event
          const completeEvent: ExecutionEvent = {
            type: "task_complete",
            timestamp: Date.now(),
            workflowId: workflowId,
            taskId: task.id,
            executionTimeMs: result.value.executionTimeMs,
          };
          await this.eventStream.emit(completeEvent);
          yield completeEvent;

          // Story 4.1d: Capture episodic event for task completion
          this.captureTaskComplete(
            workflowId,
            task.id,
            "success",
            result.value.output,
            result.value.executionTimeMs,
          );

          // Story 3.5-1: Track last completed tool for pattern reinforcement
          this.lastCompletedTool = task.tool;
        } else {
          // Story 3.5: Differentiate safe-to-fail vs critical failures
          const errorMsg = result.reason?.message || String(result.reason);
          const isSafe = isSafeToFail(task);

          if (isSafe) {
            // Safe-to-fail task: Log warning, continue workflow
            log.warn(`Safe-to-fail task ${task.id} failed (continuing): ${errorMsg}`);
            const taskResult = {
              taskId: task.id,
              status: "failed_safe" as const,
              output: null,
              error: errorMsg,
            };
            results.set(task.id, taskResult);
            layerTaskResults.push(taskResult);

            // Emit task_warning event (non-critical)
            const warningEvent: ExecutionEvent = {
              type: "task_warning",
              timestamp: Date.now(),
              workflowId: workflowId,
              taskId: task.id,
              error: errorMsg,
              message: "Safe-to-fail task failed, workflow continues",
            };
            await this.eventStream.emit(warningEvent);
            yield warningEvent;

            // Story 4.1d: Capture episodic event for failed_safe task
            this.captureTaskComplete(
              workflowId,
              task.id,
              "failed_safe",
              null,
              undefined,
              errorMsg,
            );
          } else {
            // Critical failure: Halt workflow
            failedTasks++;
            const taskResult = {
              taskId: task.id,
              status: "error" as const,
              error: errorMsg,
            };
            results.set(task.id, taskResult);
            layerTaskResults.push(taskResult);

            // Emit task_error event
            const errorEvent: ExecutionEvent = {
              type: "task_error",
              timestamp: Date.now(),
              workflowId: workflowId,
              taskId: task.id,
              error: errorMsg,
            };
            await this.eventStream.emit(errorEvent);
            yield errorEvent;

            // Story 4.1d: Capture episodic event for critical error
            this.captureTaskComplete(
              workflowId,
              task.id,
              "error",
              null,
              undefined,
              errorMsg,
            );
          }
        }
      }

      // 4f. Update state via reducers
      const stateUpdate: StateUpdate = {
        currentLayer: layerIdx,
        tasks: layerTaskResults,
      };
      this.state = updateState(this.state, stateUpdate);

      // Emit state_updated event
      const stateEvent: ExecutionEvent = {
        type: "state_updated",
        timestamp: Date.now(),
        workflowId: workflowId,
        updates: {
          tasksAdded: layerTaskResults.length,
        },
      };
      await this.eventStream.emit(stateEvent);
      yield stateEvent;

      // 4g. Checkpoint (Story 2.5-2)
      let checkpointId = "";
      if (this.checkpointManager) {
        try {
          const checkpoint = await this.checkpointManager.saveCheckpoint(
            workflowId,
            layerIdx,
            this.state,
          );

          checkpointId = checkpoint.id;

          const checkpointEvent: ExecutionEvent = {
            type: "checkpoint",
            timestamp: Date.now(),
            workflowId: workflowId,
            checkpointId: checkpoint.id,
            layerIndex: layerIdx,
          };
          await this.eventStream.emit(checkpointEvent);
          yield checkpointEvent;
        } catch (error) {
          // Checkpoint save failure should not stop execution
          log.error(`Checkpoint save failed at layer ${layerIdx}: ${error}`);
          checkpointId = `failed-${layerIdx}`;
          // Emit event with placeholder ID to indicate failure
          const checkpointEvent: ExecutionEvent = {
            type: "checkpoint",
            timestamp: Date.now(),
            workflowId: workflowId,
            checkpointId: checkpointId,
            layerIndex: layerIdx,
          };
          await this.eventStream.emit(checkpointEvent);
          yield checkpointEvent;
        }
      }

      // 4h. AIL Decision Point (Story 2.5-3)
      const hasErrors = failedTasks > 0;
      if (this.shouldTriggerAIL(this.config, layerIdx, hasErrors)) {
        const ailEvent: ExecutionEvent = {
          type: "decision_required",
          timestamp: Date.now(),
          workflowId: workflowId,
          decisionType: "AIL",
          description: `Layer ${layerIdx} completed. Agent decision required.`,
        };
        await this.eventStream.emit(ailEvent);
        yield ailEvent;

        // Wait for agent command (non-blocking, via CommandQueue)
        const command = await this.waitForDecisionCommand("AIL", 60000); // 1 minute timeout

        if (!command || command.type === "continue") {
          // Default action: continue
          log.info(`AIL decision: continue (${command?.reason || "default"})`);
          const decision: StateUpdate = {
            decisions: [{
              type: "AIL",
              timestamp: Date.now(),
              description: "Agent decision: continue",
              outcome: "continue",
              metadata: { reason: command?.reason || "default" },
            }],
          };
          this.state = updateState(this.state, decision);

          // Story 4.1d: Capture AIL decision event
          this.captureAILDecision(
            workflowId,
            "continue",
            "Agent decision: continue",
            { reason: command?.reason || "default" },
          );
        } else if (command.type === "abort") {
          log.warn(`AIL decision: abort (${command.reason})`);
          const decision: StateUpdate = {
            decisions: [{
              type: "AIL",
              timestamp: Date.now(),
              description: "Agent decision: abort",
              outcome: "abort",
              metadata: { reason: command.reason },
            }],
          };
          this.state = updateState(this.state, decision);

          // Story 4.1d: Capture AIL decision event
          this.captureAILDecision(
            workflowId,
            "abort",
            "Agent decision: abort",
            { reason: command.reason },
          );

          throw new Error(`Workflow aborted by agent: ${command.reason}`);
        } else if (command.type === "replan_dag") {
          // Story 2.5-3 Task 3: Handle replan command
          log.info(`AIL decision: replan_dag`);

          // Rate limiting check
          if (this.replanCount >= this.MAX_REPLANS) {
            log.warn(
              `Replan limit reached (${this.MAX_REPLANS}), ignoring replan command`,
            );
            const decision: StateUpdate = {
              decisions: [{
                type: "AIL",
                timestamp: Date.now(),
                description: "Agent decision: replan rejected (rate limit)",
                outcome: "replan_rejected",
                metadata: { reason: "rate_limit", max_replans: this.MAX_REPLANS },
              }],
            };
            this.state = updateState(this.state, decision);

            // Story 4.1d: Capture AIL replan_rejected decision
            this.captureAILDecision(
              workflowId,
              "replan_rejected",
              "Agent decision: replan rejected (rate limit)",
              { reason: "rate_limit", max_replans: this.MAX_REPLANS },
            );

            continue; // Skip replan, continue execution
          }

          // Check if DAGSuggester is available
          if (!this.dagSuggester) {
            log.error("DAGSuggester not set - cannot replan");
            const decision: StateUpdate = {
              decisions: [{
                type: "AIL",
                timestamp: Date.now(),
                description: "Agent decision: replan failed (no DAGSuggester)",
                outcome: "replan_failed",
                metadata: { error: "DAGSuggester not set" },
              }],
            };
            this.state = updateState(this.state, decision);

            // Story 4.1d: Capture AIL replan_failed decision
            this.captureAILDecision(
              workflowId,
              "replan_failed",
              "Agent decision: replan failed (no DAGSuggester)",
              { error: "DAGSuggester not set" },
            );

            continue;
          }

          // Execute replanning
          try {
            const replanStartTime = performance.now();

            const augmentedDAG = await this.dagSuggester.replanDAG(dag, {
              completedTasks: this.state.tasks,
              newRequirement: command.new_requirement,
              availableContext: command.available_context,
            });

            const replanTime = performance.now() - replanStartTime;

            // Check if DAG actually changed
            if (augmentedDAG.tasks.length === dag.tasks.length) {
              log.info("Replanning returned same DAG (no new tools found)");
              const decision: StateUpdate = {
                decisions: [{
                  type: "AIL",
                  timestamp: Date.now(),
                  description: "Agent decision: replan (no changes)",
                  outcome: "replan_no_changes",
                  metadata: { replan_time_ms: replanTime },
                }],
              };
              this.state = updateState(this.state, decision);

              // Story 4.1d: Capture AIL replan_no_changes decision
              this.captureAILDecision(
                workflowId,
                "replan_no_changes",
                "Agent decision: replan (no changes)",
                { replan_time_ms: replanTime },
              );

              continue;
            }

            // Update DAG with augmented structure
            dag = augmentedDAG;
            layers = this.topologicalSort(dag); // Re-sort with new tasks
            this.replanCount++;

            log.info(
              `✓ DAG replanned: ${dag.tasks.length - augmentedDAG.tasks.length} new tasks added (${
                replanTime.toFixed(1)
              }ms)`,
            );

            // Log decision
            const decision: StateUpdate = {
              decisions: [{
                type: "AIL",
                timestamp: Date.now(),
                description: "Agent decision: replan successful",
                outcome: "replan_success",
                metadata: {
                  new_tasks_count: augmentedDAG.tasks.length - dag.tasks.length,
                  replan_time_ms: replanTime,
                  replan_count: this.replanCount,
                },
              }],
            };
            this.state = updateState(this.state, decision);

            // Emit dag_replanned event
            const replanEvent: ExecutionEvent = {
              type: "state_updated",
              timestamp: Date.now(),
              workflowId: workflowId,
              updates: {
                contextKeys: ["dag_replanned"],
              },
            };
            await this.eventStream.emit(replanEvent);
            yield replanEvent;

            // Story 4.1d: Capture AIL replan_success decision
            this.captureAILDecision(
              workflowId,
              "replan_success",
              "Agent decision: replan successful",
              {
                new_tasks_count: augmentedDAG.tasks.length - dag.tasks.length,
                replan_time_ms: replanTime,
                replan_count: this.replanCount,
              },
            );
          } catch (error) {
            log.error(`Replanning failed: ${error}`);
            const decision: StateUpdate = {
              decisions: [{
                type: "AIL",
                timestamp: Date.now(),
                description: "Agent decision: replan failed",
                outcome: "replan_failed",
                metadata: { error: String(error) },
              }],
            };
            this.state = updateState(this.state, decision);

            // Story 4.1d: Capture AIL replan_failed decision
            this.captureAILDecision(
              workflowId,
              "replan_failed",
              "Agent decision: replan failed",
              { error: String(error) },
            );
          }
        }
      }

      // 4i. HIL Approval Checkpoint (Story 2.5-3)
      if (this.shouldRequireApproval(this.config, layerIdx, layer)) {
        const summary = this.generateHILSummary(layerIdx, layers);

        const hilEvent: ExecutionEvent = {
          type: "decision_required",
          timestamp: Date.now(),
          workflowId: workflowId,
          decisionType: "HIL",
          description: summary,
        };
        await this.eventStream.emit(hilEvent);
        yield hilEvent;

        // Wait for human approval (5 minute timeout)
        const command = await this.waitForDecisionCommand("HIL", 300000);

        if (!command) {
          // Timeout: Default to abort (safer for critical operations)
          log.error("HIL approval timeout - aborting workflow");
          const decision: StateUpdate = {
            decisions: [{
              type: "HIL",
              timestamp: Date.now(),
              description: "Human approval timeout",
              outcome: "abort",
              metadata: { reason: "timeout" },
            }],
          };
          this.state = updateState(this.state, decision);

          // Story 4.1d: Capture HIL timeout decision
          this.captureHILDecision(workflowId, false, checkpointId, "timeout");

          throw new Error("Workflow aborted: HIL approval timeout");
        }

        if (command.type === "approval_response") {
          if (command.approved) {
            log.info("HIL approval: approved");
            const decision: StateUpdate = {
              decisions: [{
                type: "HIL",
                timestamp: Date.now(),
                description: "Human approved continuation",
                outcome: "approve",
                metadata: { feedback: command.feedback, checkpoint_id: checkpointId },
              }],
            };
            this.state = updateState(this.state, decision);

            // Story 4.1d: Capture HIL approval decision
            this.captureHILDecision(workflowId, true, checkpointId, command.feedback);
          } else {
            log.warn(`HIL approval: rejected (${command.feedback})`);
            const decision: StateUpdate = {
              decisions: [{
                type: "HIL",
                timestamp: Date.now(),
                description: "Human rejected continuation",
                outcome: "reject",
                metadata: { feedback: command.feedback, checkpoint_id: checkpointId },
              }],
            };
            this.state = updateState(this.state, decision);

            // Story 4.1d: Capture HIL rejection decision
            this.captureHILDecision(workflowId, false, checkpointId, command.feedback);

            throw new Error(
              `Workflow aborted by human: ${command.feedback || "no reason provided"}`,
            );
          }
        }
      }
    }

    // 5. Emit workflow_complete event
    const totalTime = performance.now() - startTime;
    const completeEvent: ExecutionEvent = {
      type: "workflow_complete",
      timestamp: Date.now(),
      workflowId: workflowId,
      totalTimeMs: totalTime,
      successfulTasks: successfulTasks,
      failedTasks: failedTasks,
    };
    await this.eventStream.emit(completeEvent);
    yield completeEvent;

    // 6. GraphRAG Feedback Loop (Story 2.5-3 Task 4)
    // Update knowledge graph with execution patterns (fire-and-forget, async)
    if (this.dagSuggester && successfulTasks > 0) {
      try {
        const graphEngine = this.dagSuggester.getGraphEngine();

        // Build WorkflowExecution record
        const execution = {
          executionId: workflowId,
          executedAt: new Date(),
          intentText: "workflow-execution", // Could be extracted from initial intent
          dagStructure: dag,
          success: failedTasks === 0,
          executionTimeMs: totalTime,
          errorMessage: failedTasks > 0 ? `${failedTasks} tasks failed` : undefined,
          userId: this.userId, // Story 9.5: Multi-tenant data isolation
        };

        // Fire-and-forget: Update GraphRAG asynchronously (don't await)
        graphEngine.updateFromExecution(execution).then(() => {
          log.info(`✓ GraphRAG updated with execution patterns from ${workflowId}`);
        }).catch((error) => {
          log.error(`GraphRAG feedback loop failed: ${error}`);
        });
      } catch (error) {
        // Non-critical: Log but don't fail workflow
        log.error(`GraphRAG feedback loop failed: ${error}`);
      }
    }

    // 7. Close event stream
    await this.eventStream.close();

    // 8. Return final state
    return this.state;
  }

  /**
   * Resume workflow execution from checkpoint
   *
   * Story 2.5-2: Enables fault-tolerant execution via checkpoint/resume.
   * Restores WorkflowState from checkpoint and continues execution from
   * the next layer after the checkpointed layer.
   *
   * Flow:
   * 1. Load checkpoint from database
   * 2. Restore WorkflowState
   * 3. Emit workflow_start event (resumed=true)
   * 4. Calculate completed layers (0 to checkpoint.layer)
   * 5. Calculate remaining layers (checkpoint.layer + 1 to end)
   * 6. Execute remaining layers (same as executeStream)
   *
   * @param dag - DAG structure (same as original execution)
   * @param checkpoint_id - UUID of checkpoint to resume from
   * @returns Async generator yielding events, returning final state
   * @throws Error if checkpoint not found or checkpoint manager not set
   */
  async *resumeFromCheckpoint(
    dag: DAGStructure,
    checkpoint_id: string,
  ): AsyncGenerator<ExecutionEvent, WorkflowState, void> {
    if (!this.checkpointManager) {
      throw new Error(
        "CheckpointManager not set - call setCheckpointManager() first",
      );
    }

    const startTime = performance.now();

    // 1. Load checkpoint
    const checkpoint = await this.checkpointManager.loadCheckpoint(checkpoint_id);
    if (!checkpoint) {
      throw new Error(`Checkpoint ${checkpoint_id} not found`);
    }

    log.info(
      `Resuming workflow ${checkpoint.workflowId} from checkpoint ${checkpoint_id} (layer ${checkpoint.layer})`,
    );

    // 2. Restore WorkflowState
    this.state = checkpoint.state;
    const workflowId = checkpoint.workflowId;

    // 3. Reset event stream and command queue for resume
    this.eventStream = new EventStream();
    this.commandQueue = new CommandQueue();

    // 4. Topological sort (from ParallelExecutor)
    const layers = this.topologicalSort(dag);

    // 4. Emit workflow_start event (resume mode)
    const startEvent: ExecutionEvent = {
      type: "workflow_start",
      timestamp: Date.now(),
      workflowId: workflowId,
      totalLayers: layers.length,
    };
    await this.eventStream.emit(startEvent);
    yield startEvent;

    // 5. Calculate completed and remaining layers
    const completedLayerCount = checkpoint.layer + 1; // Layers 0 to checkpoint.layer are done
    const remainingLayers = layers.slice(completedLayerCount);

    log.info(
      `Skipping ${completedLayerCount} completed layers, executing ${remainingLayers.length} remaining layers`,
    );

    // 6. Execute remaining layers (same logic as executeStream)
    // Restore completed task results from state into results Map
    const results = new Map<string, any>();
    for (const task of this.state.tasks) {
      results.set(task.taskId, task);
    }

    let successfulTasks = this.state.tasks.filter((t) => t.status === "success").length;
    let failedTasks = this.state.tasks.filter((t) => t.status === "error").length;

    for (let layerIdx = 0; layerIdx < remainingLayers.length; layerIdx++) {
      const layer = remainingLayers[layerIdx];
      const actualLayerIdx = completedLayerCount + layerIdx;

      // 6a. Emit layer_start event
      const layerStartEvent: ExecutionEvent = {
        type: "layer_start",
        timestamp: Date.now(),
        workflowId: workflowId,
        layerIndex: actualLayerIdx,
        tasksCount: layer.length,
      };
      await this.eventStream.emit(layerStartEvent);
      yield layerStartEvent;

      // 6b. Process general control commands (non-blocking)
      // Only process commands that are NOT decision commands (AIL/HIL)
      // Decision commands (continue, approval_response) are handled by waitForDecisionCommand()
      const commands = await this.commandQueue.processCommandsByType(["abort", "pause"]);
      for (const cmd of commands) {
        log.info(`Processing control command: ${cmd.type}`);
        if (cmd.type === "abort") {
          log.warn(`Abort command received: ${cmd.reason}`);
          throw new Error(`Workflow aborted by agent: ${cmd.reason}`);
        }
        // TODO: Story 2.5-3 - Implement pause command handler
      }

      // 6c. Emit task_start for each task
      for (const task of layer) {
        const taskStartEvent: ExecutionEvent = {
          type: "task_start",
          timestamp: Date.now(),
          workflowId: workflowId,
          taskId: task.id,
          tool: task.tool,
        };
        await this.eventStream.emit(taskStartEvent);
        yield taskStartEvent;
      }

      // 6d. Execute layer in parallel
      const layerResults = await Promise.allSettled(
        layer.map((task) => this.executeTask(task, results)),
      );

      // 6e. Collect results and emit task events
      const layerTaskResults = [];
      for (let i = 0; i < layer.length; i++) {
        const task = layer[i];
        const result = layerResults[i];

        if (result.status === "fulfilled") {
          successfulTasks++;
          const taskResult = {
            taskId: task.id,
            status: "success" as const,
            output: result.value.output,
            executionTimeMs: result.value.executionTimeMs,
          };
          results.set(task.id, taskResult);
          layerTaskResults.push(taskResult);

          const completeEvent: ExecutionEvent = {
            type: "task_complete",
            timestamp: Date.now(),
            workflowId: workflowId,
            taskId: task.id,
            executionTimeMs: result.value.executionTimeMs,
          };
          await this.eventStream.emit(completeEvent);
          yield completeEvent;

          // Story 4.1d: Capture episodic event for task completion (resume)
          this.captureTaskComplete(
            workflowId,
            task.id,
            "success",
            result.value.output,
            result.value.executionTimeMs,
          );
        } else {
          failedTasks++;
          const errorMsg = result.reason?.message || String(result.reason);
          const taskResult = {
            taskId: task.id,
            status: "error" as const,
            error: errorMsg,
          };
          results.set(task.id, taskResult);
          layerTaskResults.push(taskResult);

          const errorEvent: ExecutionEvent = {
            type: "task_error",
            timestamp: Date.now(),
            workflowId: workflowId,
            taskId: task.id,
            error: errorMsg,
          };
          await this.eventStream.emit(errorEvent);
          yield errorEvent;

          // Story 4.1d: Capture episodic event for error (resume)
          this.captureTaskComplete(
            workflowId,
            task.id,
            "error",
            null,
            undefined,
            errorMsg,
          );
        }
      }

      // 6f. Update state via reducers
      const stateUpdate: StateUpdate = {
        currentLayer: actualLayerIdx,
        tasks: layerTaskResults,
      };
      this.state = updateState(this.state, stateUpdate);

      const stateEvent: ExecutionEvent = {
        type: "state_updated",
        timestamp: Date.now(),
        workflowId: workflowId,
        updates: {
          tasksAdded: layerTaskResults.length,
        },
      };
      await this.eventStream.emit(stateEvent);
      yield stateEvent;

      // 6g. Checkpoint (same as executeStream)
      if (this.checkpointManager) {
        try {
          const newCheckpoint = await this.checkpointManager.saveCheckpoint(
            workflowId,
            actualLayerIdx,
            this.state,
          );

          const checkpointEvent: ExecutionEvent = {
            type: "checkpoint",
            timestamp: Date.now(),
            workflowId: workflowId,
            checkpointId: newCheckpoint.id,
            layerIndex: actualLayerIdx,
          };
          await this.eventStream.emit(checkpointEvent);
          yield checkpointEvent;
        } catch (error) {
          log.error(`Checkpoint save failed at layer ${actualLayerIdx}: ${error}`);
          const checkpointEvent: ExecutionEvent = {
            type: "checkpoint",
            timestamp: Date.now(),
            workflowId: workflowId,
            checkpointId: `failed-${actualLayerIdx}`,
            layerIndex: actualLayerIdx,
          };
          await this.eventStream.emit(checkpointEvent);
          yield checkpointEvent;
        }
      }
    }

    // 7. Emit workflow_complete event
    const totalTime = performance.now() - startTime;
    const completeEvent: ExecutionEvent = {
      type: "workflow_complete",
      timestamp: Date.now(),
      workflowId: workflowId,
      totalTimeMs: totalTime,
      successfulTasks: successfulTasks,
      failedTasks: failedTasks,
    };
    await this.eventStream.emit(completeEvent);
    yield completeEvent;

    // 8. Close event stream
    await this.eventStream.close();

    // 9. Return final state
    return this.state;
  }

  /**
   * Enqueue a command for processing
   *
   * Commands are processed non-blocking between DAG layers.
   * FIFO ordering guaranteed.
   *
   * @param command - Command to enqueue
   */
  enqueueCommand(command: any): void {
    this.commandQueue.enqueue(command);
  }

  /**
   * Get current workflow state (readonly snapshot)
   *
   * @returns Readonly state snapshot or null if not initialized
   */
  getState(): Readonly<WorkflowState> | null {
    return this.state ? getStateSnapshot(this.state) : null;
  }

  /**
   * Update workflow state manually (for testing/debugging)
   *
   * @param update - State update
   * @throws Error if state not initialized
   */
  updateState(update: StateUpdate): void {
    if (!this.state) {
      throw new Error("State not initialized - call executeStream() first");
    }
    this.state = updateState(this.state, update);
  }

  /**
   * Get event stream statistics
   */
  getEventStreamStats(): EventStreamStats {
    return this.eventStream.getStats();
  }

  /**
   * Get command queue statistics
   */
  getCommandQueueStats(): CommandQueueStats {
    return this.commandQueue.getStats();
  }

  /**
   * Get permission audit store for external audit log access (Story 7.7c)
   *
   * @returns PermissionAuditStore or null if not configured
   */
  getPermissionAuditStore(): PermissionAuditStore | null {
    return this._permissionAuditStore;
  }

  /**
   * Override: Execute task with support for code_execution and capability types (Story 3.4, Story 7.4)
   *
   * Routes tasks based on type:
   * - code_execution: Delegate to sandbox with tool injection
   * - capability: Execute learned capability code (Story 7.4 AC#7)
   * - mcp_tool (default): Delegate to parent ParallelExecutor
   *
   * @param task - Task to execute
   * @param previousResults - Results from previous tasks
   * @returns Task output and execution time
   */
  protected override async executeTask(
    task: Task,
    previousResults: Map<string, TaskResult>,
  ): Promise<{ output: unknown; executionTimeMs: number }> {
    const taskType = task.type ?? "mcp_tool";

    // Route based on task type
    if (taskType === "code_execution") {
      // Story 3.5: Add retry logic for safe-to-fail sandbox tasks
      if (isSafeToFail(task)) {
        return await this.executeWithRetry(task, previousResults);
      }
      return await this.executeCodeTask(task, previousResults);
    } else if (taskType === "capability") {
      // Story 7.4: Execute learned capability
      return await this.executeCapabilityTask(task, previousResults);
    } else {
      // Default: MCP tool execution (delegate to parent)
      return await super.executeTask(task, previousResults);
    }
  }

  /**
   * Execute capability task (Story 7.4 AC#7, AC#11)
   *
   * Capabilities are learned code patterns stored in CapabilityStore.
   * They are executed in a sandbox similar to code_execution tasks.
   *
   * Process:
   * 1. Validate task has capabilityId and code
   * 2. Build execution context from dependencies
   * 3. Execute in sandbox
   * 4. Return result for checkpoint persistence
   *
   * @param task - Capability task (must have capabilityId and code)
   * @param previousResults - Results from previous tasks
   * @returns Execution result
   */
  private async executeCapabilityTask(
    task: Task,
    previousResults: Map<string, TaskResult>,
  ): Promise<{ output: unknown; executionTimeMs: number }> {
    const startTime = performance.now();

    try {
      log.debug(`Executing capability task: ${task.id} (capability: ${task.capabilityId})`);

      // Validate task structure
      if (!task.capabilityId) {
        throw new Error(
          `Capability task ${task.id} missing required 'capabilityId' field`,
        );
      }

      // Resolve code: use task.code if provided, otherwise fetch from CapabilityStore (AC3)
      let capabilityCode = task.code;
      if (!capabilityCode) {
        // Must fetch from CapabilityStore
        if (!this.capabilityStore) {
          throw new Error(
            `Capability task ${task.id} has no code and CapabilityStore is not configured. ` +
              `Call setLearningDependencies() before executing capability tasks.`,
          );
        }

        const capability = await this.capabilityStore.findById(task.capabilityId);
        if (!capability) {
          throw new Error(
            `Capability ${task.capabilityId} not found in CapabilityStore for task ${task.id}`,
          );
        }

        capabilityCode = capability.codeSnippet;
        log.debug(`Fetched capability code from store: ${task.capabilityId}`);
      }

      // Build execution context from dependencies
      const executionContext: Record<string, unknown> = {
        ...task.arguments,
        capabilityId: task.capabilityId,
      };

      // Pass intent to WorkerBridge for eager learning (Story 7.2a)
      // Even for capability tasks, new variations might be worth capturing
      if (task.intent) {
        executionContext.intent = task.intent;
      }

      // Resolve dependencies
      const deps: Record<string, TaskResult> = {};
      for (const depId of task.dependsOn) {
        const depResult = previousResults.get(depId);

        if (depResult?.status === "error") {
          throw new Error(`Dependency task ${depId} failed: ${depResult.error}`);
        }
        if (!depResult) {
          throw new Error(`Dependency task ${depId} not found in results`);
        }

        deps[depId] = depResult;
      }
      executionContext.deps = deps;

      // Configure sandbox (capabilities use default safe config)
      // Task 3: Pass learning dependencies for eager learning and trace collection
      const sandboxConfig = task.sandboxConfig || {};
      const executor = new DenoSandboxExecutor({
        timeout: sandboxConfig.timeout ?? 30000,
        memoryLimit: sandboxConfig.memoryLimit ?? 512,
        allowedReadPaths: sandboxConfig.allowedReadPaths ?? [],
        capabilityStore: this.capabilityStore,
        graphRAG: this.graphRAG,
      });

      // Execute capability code in sandbox
      const result = await executor.execute(capabilityCode, executionContext);

      if (!result.success) {
        const error = result.error!;
        throw new Error(`${error.type}: ${error.message}`);
      }

      const executionTimeMs = performance.now() - startTime;

      log.info(`Capability task ${task.id} succeeded`, {
        capabilityId: task.capabilityId,
        executionTimeMs: executionTimeMs.toFixed(2),
        resultType: typeof result.result,
      });

      // Return result for checkpoint persistence (AC#11)
      return {
        output: {
          result: result.result,
          capabilityId: task.capabilityId,
          executionTimeMs: result.executionTimeMs,
        },
        executionTimeMs,
      };
    } catch (error) {
      const executionTimeMs = performance.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Story 7.7c: Handle PermissionDenied errors with HIL escalation
      if (
        errorMessage.includes("PermissionDenied") &&
        this.permissionEscalationHandler &&
        this.capabilityStore &&
        task.capabilityId
      ) {
        log.info(`Permission denied for capability ${task.capabilityId}, attempting escalation`);

        // Get current permission set from capability
        const capability = await this.capabilityStore.findById(task.capabilityId);
        const currentPermissionSet = (capability?.permissionSet ?? "minimal") as PermissionSet;

        // Create execution ID for retry tracking
        const executionId = `${this.state?.workflowId ?? "unknown"}-${task.id}`;

        // Handle the permission error (includes HIL approval request)
        const escalationResult = await this.permissionEscalationHandler.handlePermissionError(
          task.capabilityId,
          currentPermissionSet,
          errorMessage,
          executionId,
        );

        if (escalationResult.handled && escalationResult.approved) {
          log.info(
            `Permission escalation approved for ${task.capabilityId}, ` +
              `retrying with permission_set: ${escalationResult.newPermissionSet}`,
          );

          // Retry execution with updated permissions (AC5)
          // The capability's permission_set has been updated in DB by the handler
          return await this.executeCapabilityTask(task, previousResults);
        } else if (escalationResult.handled) {
          // Escalation was handled but rejected
          log.warn(
            `Permission escalation rejected for ${task.capabilityId}: ${escalationResult.feedback ?? escalationResult.error}`,
          );
          throw new Error(
            `Permission escalation rejected for capability ${task.capabilityId}: ` +
              `${escalationResult.feedback ?? escalationResult.error ?? "No feedback provided"}`,
          );
        } else {
          // Escalation not handled (security-critical, no valid path, etc.)
          log.warn(
            `Permission escalation not available for ${task.capabilityId}: ${escalationResult.error}`,
          );
        }
      }

      log.error(`Capability task ${task.id} failed`, {
        capabilityId: task.capabilityId,
        error: errorMessage,
        executionTimeMs,
      });
      throw error;
    }
  }

  /**
   * Execute safe-to-fail task with retry logic (Story 3.5 - Task 7)
   *
   * Retry strategy:
   * - Max 3 attempts
   * - Exponential backoff: 100ms, 200ms, 400ms
   * - Only for safe-to-fail tasks (idempotent)
   *
   * @param task - Safe-to-fail task
   * @param previousResults - Results from previous tasks
   * @returns Execution result
   */
  private async executeWithRetry(
    task: Task,
    previousResults: Map<string, TaskResult>,
  ): Promise<{ output: unknown; executionTimeMs: number }> {
    const maxAttempts = 3;
    const baseDelay = 100; // ms
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        log.debug(`Executing safe-to-fail task ${task.id} (attempt ${attempt}/${maxAttempts})`);
        return await this.executeCodeTask(task, previousResults);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxAttempts) {
          // Exponential backoff: 100ms, 200ms, 400ms
          const delay = baseDelay * Math.pow(2, attempt - 1);
          log.warn(
            `Safe-to-fail task ${task.id} failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms: ${lastError.message}`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          log.error(
            `Safe-to-fail task ${task.id} failed after ${maxAttempts} attempts: ${lastError.message}`,
          );
        }
      }
    }

    // All retries exhausted, throw the last error
    throw lastError!;
  }

  /**
   * Execute code_execution task (Story 3.4, Story 7.7c HIL extension)
   *
   * Process:
   * 1. Resolve dependencies from previousResults
   * 2. Intent-based mode: vector search → inject tools
   * 3. Execute code in sandbox with context and permissionSet
   * 4. On PermissionError: HIL escalation for approval (Story 7.7c)
   * 5. Return result for checkpoint persistence
   *
   * @param task - Code execution task
   * @param previousResults - Results from previous tasks
   * @param permissionSet - Permission set to use (default: from task.sandboxConfig or "minimal")
   * @returns Execution result
   */
  private async executeCodeTask(
    task: Task,
    previousResults: Map<string, TaskResult>,
    permissionSet?: PermissionSet,
  ): Promise<{ output: unknown; executionTimeMs: number }> {
    const startTime = performance.now();
    // Story 7.7c: Get permission set from parameter, sandboxConfig, or default to "minimal"
    const currentPermissionSet: PermissionSet =
      permissionSet ?? (task.sandboxConfig?.permissionSet as PermissionSet) ?? "minimal";

    try {
      log.debug(`Executing code task: ${task.id}`, { permissionSet: currentPermissionSet });

      // Validate task structure
      if (!task.code) {
        throw new Error(
          `Code execution task ${task.id} missing required 'code' field`,
        );
      }

      // Build execution context: merge deps + custom context
      const executionContext: Record<string, unknown> = {
        ...task.arguments, // Custom context from task
      };

      // Pass intent to WorkerBridge for eager learning (Story 7.2a)
      // Without this, capabilities won't be saved after successful execution
      if (task.intent) {
        executionContext.intent = task.intent;
      }

      // Resolve dependencies: $OUTPUT[dep_id] → actual results
      // Story 3.5: Pass full TaskResult to enable resilient patterns
      const deps: Record<string, TaskResult> = {};
      for (const depId of task.dependsOn) {
        const depResult = previousResults.get(depId);

        // Critical failures halt execution
        if (depResult?.status === "error") {
          throw new Error(`Dependency task ${depId} failed: ${depResult.error}`);
        }
        if (!depResult) {
          throw new Error(`Dependency task ${depId} not found in results`);
        }

        // Story 3.5: Store full TaskResult (status, output, error)
        // Enables user code to check: if (deps.task?.status === "success")
        deps[depId] = depResult;
      }
      executionContext.deps = deps;

      // Note: Intent-based tool injection via contextBuilder is NOT used here.
      // The sandbox has its own tool injection mechanism via DenoSandboxExecutor.executeWithTools().
      // The task.intent is passed in executionContext ONLY for eager learning (WorkerBridge).

      // Configure sandbox
      // Task 3: Pass learning dependencies for eager learning and trace collection
      const sandboxConfig = task.sandboxConfig || {};
      const executor = new DenoSandboxExecutor({
        timeout: sandboxConfig.timeout ?? 30000,
        memoryLimit: sandboxConfig.memoryLimit ?? 512,
        allowedReadPaths: sandboxConfig.allowedReadPaths ?? [],
        capabilityStore: this.capabilityStore,
        graphRAG: this.graphRAG,
      });

      // Story 7.7c: Execute code in sandbox with permissionSet
      const result = await executor.execute(task.code, executionContext, currentPermissionSet);

      if (!result.success) {
        const error = result.error!;
        throw new Error(`${error.type}: ${error.message}`);
      }

      const executionTimeMs = performance.now() - startTime;

      log.info(`Code task ${task.id} succeeded`, {
        executionTimeMs: executionTimeMs.toFixed(2),
        resultType: typeof result.result,
        permissionSet: currentPermissionSet,
      });

      // Return result for checkpoint persistence (AC #10, #11)
      return {
        output: {
          result: result.result,
          state: executionContext, // For checkpoint compatibility
          executionTimeMs: result.executionTimeMs,
        },
        executionTimeMs,
      };
    } catch (error) {
      const executionTimeMs = performance.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Story 7.7c: Handle PermissionError with HIL escalation for code_execution tasks
      if (
        (errorMessage.includes("PermissionError") ||
          errorMessage.includes("PermissionDenied") ||
          errorMessage.includes("NotCapable")) &&
        this.eventStream
      ) {
        log.info(`Permission error in code task ${task.id}, attempting HIL escalation`, {
          error: errorMessage.substring(0, 200),
          currentPermissionSet,
        });

        // Use suggestEscalation to parse the error and determine the needed permission
        // Note: We use task.id as a placeholder for capabilityId since code_execution
        // tasks don't have capabilities. The escalation won't persist to DB.
        const escalationSuggestion = suggestEscalation(
          errorMessage,
          task.id, // Use task.id as placeholder (no DB persistence for code_execution)
          currentPermissionSet,
        );

        if (escalationSuggestion) {
          log.info(`Escalation suggested for code task ${task.id}`, {
            currentSet: currentPermissionSet,
            requestedSet: escalationSuggestion.requestedSet,
            detectedOperation: escalationSuggestion.detectedOperation,
          });

          // Create HIL checkpoint for permission approval
          // Format the request for human-readable display
          const description = formatEscalationRequest(escalationSuggestion);

          // Generate checkpoint ID for approval_response matching
          const checkpointId = `perm-esc-${task.id}`;

          // Emit decision_required event for HIL approval (same pattern as requestHILApproval)
          // Story 2.5-3 HIL fix: include checkpointId and context for proper approval routing
          const escalationEvent: ExecutionEvent = {
            type: "decision_required",
            timestamp: Date.now(),
            workflowId: this.state?.workflowId ?? "unknown",
            decisionType: "HIL",
            description: `[Code Task: ${task.id}] ${description}`,
            checkpointId,
            context: {
              taskId: task.id,
              taskType: "code_execution",
              currentPermissionSet,
              requestedPermissionSet: escalationSuggestion.requestedSet,
              detectedOperation: escalationSuggestion.detectedOperation,
            },
          };
          await this.eventStream.emit(escalationEvent);

          log.info("Code task permission escalation requested, waiting for HIL approval", {
            taskId: task.id,
            currentSet: currentPermissionSet,
            requestedSet: escalationSuggestion.requestedSet,
          });

          // Wait for human decision (5 minute timeout, same as regular HIL)
          const command = await this.waitForDecisionCommand("HIL", 300000);

          if (!command) {
            // Timeout: Default to reject (safer for permission escalation)
            log.warn(`Permission escalation timeout for code task ${task.id} - rejecting`);
            throw new Error(
              `Permission escalation timeout for code task ${task.id}: ` +
                `Request to escalate ${currentPermissionSet} -> ${escalationSuggestion.requestedSet} timed out`,
            );
          }

          // Handle permission_escalation_response or approval_response command
          if (
            command.type === "permission_escalation_response" ||
            command.type === "approval_response"
          ) {
            const approved = command.approved === true;
            log.info(`Permission escalation ${approved ? "approved" : "rejected"} for code task ${task.id}`, {
              feedback: command.feedback,
            });

            if (approved) {
              log.info(
                `Permission escalation approved for code task ${task.id}, ` +
                  `retrying with permission_set: ${escalationSuggestion.requestedSet}`,
              );

              // Retry execution with escalated permissions
              // Note: Unlike capabilities, code_execution tasks don't persist permission changes
              return await this.executeCodeTask(
                task,
                previousResults,
                escalationSuggestion.requestedSet,
              );
            } else {
              // Escalation rejected
              throw new Error(
                `Permission escalation rejected for code task ${task.id}: ` +
                  `${command.feedback ?? "User rejected the permission request"}`,
              );
            }
          }
        } else {
          log.warn(`Could not suggest escalation for code task ${task.id}`, {
            error: errorMessage.substring(0, 200),
          });
        }
      }

      log.error(`Code task ${task.id} failed`, {
        error: errorMessage,
        executionTimeMs,
        permissionSet: currentPermissionSet,
      });
      throw error;
    }
  }
}
