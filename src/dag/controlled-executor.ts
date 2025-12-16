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
import type { EpisodicMemoryStore } from "../learning/episodic-memory-store.ts";
import type { CompletedTask, SpeculationCache, SpeculationConfig, SpeculationMetrics } from "../graphrag/types.ts";
import type { PermissionEscalationRequest, PermissionSet } from "../capabilities/types.ts";
import type { PermissionAuditStore } from "../capabilities/permission-audit-store.ts";
import { PermissionEscalationHandler, formatEscalationRequest } from "../capabilities/permission-escalation-handler.ts";
import { suggestEscalation } from "../capabilities/permission-escalation.ts";
import type { CapabilityStore } from "../capabilities/capability-store.ts";
import type { GraphRAGEngine } from "../graphrag/graph-engine.ts";
import type { Command } from "./types.ts";

// Import extracted modules
import {
  type CaptureContext,
  captureTaskComplete,
  captureAILDecision,
  captureHILDecision,
  captureSpeculationStart,
} from "./episodic/capture.ts";
import { waitForDecisionCommand } from "./loops/decision-waiter.ts";
import { shouldRequireApproval, generateHILSummary } from "./loops/hil-handler.ts";
import { shouldTriggerAIL, MAX_REPLANS } from "./loops/ail-handler.ts";
import {
  type SpeculationState,
  createSpeculationState,
  enableSpeculation as enableSpeculationState,
  disableSpeculation as disableSpeculationState,
  startSpeculativeExecution,
  checkSpeculativeCache,
  consumeSpeculation as consumeSpeculationFromState,
  getSpeculationMetrics as getSpeculationMetricsFromState,
  updateLastCompletedTool,
} from "./speculation/integration.ts";
import { saveCheckpointAfterLayer, loadCheckpoint, calculateResumeProgress } from "./checkpoints/integration.ts";
import { isSafeToFail, getTaskType } from "./execution/task-router.ts";
import { executeCodeTask, executeWithRetry, type CodeExecutorDeps } from "./execution/code-executor.ts";
import { executeCapabilityTask, getCapabilityPermissionSet } from "./execution/capability-executor.ts";
import { isPermissionError } from "./permissions/escalation-integration.ts";

const log = getLogger("controlled-executor");

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
  private replanCount: number = 0;
  private episodicMemory: EpisodicMemoryStore | null = null;
  private speculationState: SpeculationState;
  private userId: string = "local";
  private capabilityStore?: CapabilityStore;
  private graphRAG?: GraphRAGEngine;
  private permissionEscalationHandler: PermissionEscalationHandler | null = null;
  private _permissionAuditStore: PermissionAuditStore | null = null;

  constructor(toolExecutor: ToolExecutor, config: ExecutorConfig = {}) {
    super(toolExecutor, config);
    this.eventStream = new EventStream();
    this.commandQueue = new CommandQueue();
    this.userId = config.userId ?? "local";
    this.speculationState = createSpeculationState();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Configuration Methods
  // ═══════════════════════════════════════════════════════════════════════════

  setCheckpointManager(db: PGliteClient, autoPrune: boolean = true): void {
    this.checkpointManager = new CheckpointManager(db, autoPrune);
  }

  setDAGSuggester(dagSuggester: DAGSuggester): void {
    this.dagSuggester = dagSuggester;
  }

  setLearningDependencies(
    capabilityStore?: CapabilityStore,
    graphRAG?: GraphRAGEngine,
  ): void {
    this.capabilityStore = capabilityStore;
    this.graphRAG = graphRAG;
    log.debug("Learning dependencies set", { hasCapabilityStore: !!capabilityStore, hasGraphRAG: !!graphRAG });
  }

  setPermissionEscalationDependencies(auditStore: PermissionAuditStore): void {
    this._permissionAuditStore = auditStore;
    if (this.capabilityStore && auditStore) {
      this.permissionEscalationHandler = new PermissionEscalationHandler(
        this.capabilityStore,
        auditStore,
        async (request: PermissionEscalationRequest) => this.requestPermissionEscalation(request),
        this.userId,
      );
      log.debug("Permission escalation handler configured", { userId: this.userId });
    }
  }

  setEpisodicMemoryStore(store: EpisodicMemoryStore): void {
    this.episodicMemory = store;
    log.debug("Episodic memory capture enabled");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Speculation Methods
  // ═══════════════════════════════════════════════════════════════════════════

  enableSpeculation(config?: Partial<SpeculationConfig>): void {
    this.speculationState = enableSpeculationState(this.speculationState, this.dagSuggester, config);
  }

  disableSpeculation(): void {
    this.speculationState = disableSpeculationState(this.speculationState);
  }

  checkSpeculativeCache(toolId: string): SpeculationCache | null {
    return checkSpeculativeCache(this.speculationState, toolId);
  }

  async consumeSpeculation(toolId: string): Promise<SpeculationCache | null> {
    return await consumeSpeculationFromState(this.speculationState, toolId);
  }

  getSpeculationMetrics(): SpeculationMetrics | null {
    return getSpeculationMetricsFromState(this.speculationState);
  }

  getSpeculationConfig(): SpeculationConfig {
    return { ...this.speculationState.config };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Permission Escalation
  // ═══════════════════════════════════════════════════════════════════════════

  async requestPermissionEscalation(
    request: PermissionEscalationRequest,
  ): Promise<{ approved: boolean; feedback?: string }> {
    const workflowId = this.state?.workflowId ?? "unknown";
    const description = formatEscalationRequest(request);

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

    const command = await waitForDecisionCommand(this.commandQueue, "HIL", this.getTimeout("hil"));
    if (!command) {
      log.warn("Permission escalation timeout - rejecting");
      return { approved: false, feedback: "Escalation request timed out" };
    }

    if (command.type === "permission_escalation_response" || command.type === "approval_response") {
      const approved = command.approved === true;
      log.info(`Permission escalation ${approved ? "approved" : "rejected"}`, {
        capabilityId: request.capabilityId,
        feedback: command.feedback,
      });

      const ctx = this.getCaptureContext();
      captureHILDecision(
        ctx,
        workflowId,
        approved,
        `perm-esc-${request.capabilityId}`,
        command.feedback ?? `Escalation ${request.currentSet} -> ${request.requestedSet}`,
      );

      return { approved, feedback: command.feedback };
    }

    log.warn(`Unexpected command type for permission escalation: ${command.type}`);
    return { approved: false, feedback: `Unexpected response: ${command.type}` };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Timeout Configuration
  // ═══════════════════════════════════════════════════════════════════════════

  /** Default timeout values */
  private static readonly DEFAULT_TIMEOUTS = {
    hil: 300000, // 5 minutes
    ail: 60000, // 1 minute
    pollInterval: 100, // 100ms (legacy, not used with new async wait)
  };

  /** Get configured timeout or default */
  private getTimeout(type: "hil" | "ail" | "pollInterval"): number {
    return this.config.timeouts?.[type] ?? ControlledExecutor.DEFAULT_TIMEOUTS[type];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // State & Queue Access
  // ═══════════════════════════════════════════════════════════════════════════

  enqueueCommand(command: Command): void {
    this.commandQueue.enqueue(command);
  }

  getState(): Readonly<WorkflowState> | null {
    return this.state ? getStateSnapshot(this.state) : null;
  }

  updateState(update: StateUpdate): void {
    if (!this.state) throw new Error("State not initialized - call executeStream() first");
    this.state = updateState(this.state, update);
  }

  getEventStreamStats(): EventStreamStats {
    return this.eventStream.getStats();
  }

  getCommandQueueStats(): CommandQueueStats {
    return this.commandQueue.getStats();
  }

  getPermissionAuditStore(): PermissionAuditStore | null {
    return this._permissionAuditStore;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Core Execution
  // ═══════════════════════════════════════════════════════════════════════════

  async *executeStream(
    dag: DAGStructure,
    workflow_id?: string,
  ): AsyncGenerator<ExecutionEvent, WorkflowState, void> {
    const workflowId = workflow_id ?? `workflow-${Date.now()}`;
    const startTime = performance.now();

    this.state = createInitialState(workflowId);
    let layers = this.topologicalSort(dag);

    const startEvent: ExecutionEvent = {
      type: "workflow_start",
      timestamp: Date.now(),
      workflowId,
      totalLayers: layers.length,
    };
    await this.eventStream.emit(startEvent);
    yield startEvent;

    const results = new Map<string, TaskResult>();
    let successfulTasks = 0;
    let failedTasks = 0;

    for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
      const layer = layers[layerIdx];

      // Layer start event
      const layerStartEvent: ExecutionEvent = {
        type: "layer_start",
        timestamp: Date.now(),
        workflowId,
        layerIndex: layerIdx,
        tasksCount: layer.length,
      };
      await this.eventStream.emit(layerStartEvent);
      yield layerStartEvent;

      // Process control commands
      const commands = await this.commandQueue.processCommandsByType(["abort", "pause"]);
      for (const cmd of commands) {
        if (cmd.type === "abort") {
          throw new Error(`Workflow aborted by agent: ${cmd.reason}`);
        }
      }

      // Start speculation
      const completedTasksForPrediction: CompletedTask[] = this.state.tasks.map((t) => ({
        taskId: t.taskId,
        tool: dag.tasks.find((dt) => dt.id === t.taskId)?.tool ?? "unknown",
        status: t.status as "success" | "error" | "failed_safe",
        executionTimeMs: t.executionTimeMs,
      }));

      startSpeculativeExecution(
        this.speculationState,
        this.dagSuggester,
        completedTasksForPrediction,
        {},
        workflowId,
        (wId, toolId, confidence, reasoning) => {
          captureSpeculationStart(this.getCaptureContext(), wId, toolId, confidence, reasoning);
        },
      ).catch((err) => log.debug(`Speculation failed: ${err}`));

      // Execute layer
      for (const task of layer) yield* this.emitTaskStart(workflowId, task);

      const layerResults = await Promise.allSettled(
        layer.map((task) => this.executeTask(task, results)),
      );

      // Collect results
      const { layerTaskResults, layerSuccess, layerFailed } = await this.collectLayerResults(
        workflowId,
        layer,
        layerResults,
        results,
      );

      for (const event of layerTaskResults.events) yield event;
      successfulTasks += layerSuccess;
      failedTasks += layerFailed;

      // Update state
      const stateUpdate: StateUpdate = { currentLayer: layerIdx, tasks: layerTaskResults.tasks };
      this.state = updateState(this.state, stateUpdate);

      const stateEvent: ExecutionEvent = {
        type: "state_updated",
        timestamp: Date.now(),
        workflowId,
        updates: { tasksAdded: layerTaskResults.tasks.length },
      };
      await this.eventStream.emit(stateEvent);
      yield stateEvent;

      // Checkpoint
      const checkpointEvent = await this.saveCheckpoint(workflowId, layerIdx);
      if (checkpointEvent) yield checkpointEvent;

      // AIL Decision Point
      const ailEvents = await this.handleAILDecisionPoint(workflowId, layerIdx, failedTasks > 0, dag, layers);
      for (const event of ailEvents.events) yield event;
      if (ailEvents.newLayers) layers = ailEvents.newLayers;
      if (ailEvents.newDag) dag = ailEvents.newDag;

      // HIL Approval
      const hilEvents = await this.handleHILApproval(workflowId, layerIdx, layer, layers);
      for (const event of hilEvents) yield event;
    }

    // Workflow complete
    const totalTime = performance.now() - startTime;
    const completeEvent: ExecutionEvent = {
      type: "workflow_complete",
      timestamp: Date.now(),
      workflowId,
      totalTimeMs: totalTime,
      successfulTasks,
      failedTasks,
    };
    await this.eventStream.emit(completeEvent);
    yield completeEvent;

    // GraphRAG feedback
    this.updateGraphRAG(workflowId, dag, totalTime, failedTasks);

    await this.eventStream.close();
    return this.state;
  }

  async *resumeFromCheckpoint(
    dag: DAGStructure,
    checkpoint_id: string,
  ): AsyncGenerator<ExecutionEvent, WorkflowState, void> {
    const checkpoint = await loadCheckpoint(this.checkpointManager, checkpoint_id);
    if (!checkpoint) throw new Error(`Checkpoint ${checkpoint_id} not found`);

    const startTime = performance.now();
    this.state = checkpoint.state;
    const workflowId = checkpoint.workflowId;

    this.eventStream = new EventStream();
    this.commandQueue = new CommandQueue();

    let layers = this.topologicalSort(dag);
    const { completedCount } = calculateResumeProgress(checkpoint.layer, layers.length);
    const remainingLayers = layers.slice(completedCount);

    log.info(`Resuming workflow ${workflowId} from layer ${checkpoint.layer}`);

    const startEvent: ExecutionEvent = {
      type: "workflow_start",
      timestamp: Date.now(),
      workflowId,
      totalLayers: layers.length,
    };
    await this.eventStream.emit(startEvent);
    yield startEvent;

    const results = new Map<string, TaskResult>();
    for (const task of this.state!.tasks) results.set(task.taskId, task);

    let successfulTasks = this.state!.tasks.filter((t) => t.status === "success").length;
    let failedTasks = this.state!.tasks.filter((t) => t.status === "error").length;

    for (let i = 0; i < remainingLayers.length; i++) {
      const layer = remainingLayers[i];
      const actualLayerIdx = completedCount + i;

      const layerStartEvent: ExecutionEvent = {
        type: "layer_start",
        timestamp: Date.now(),
        workflowId,
        layerIndex: actualLayerIdx,
        tasksCount: layer.length,
      };
      await this.eventStream.emit(layerStartEvent);
      yield layerStartEvent;

      // Process control commands (same as executeStream)
      const commands = await this.commandQueue.processCommandsByType(["abort", "pause"]);
      for (const cmd of commands) {
        if (cmd.type === "abort") {
          throw new Error(`Workflow aborted by agent: ${cmd.reason}`);
        }
      }

      for (const task of layer) yield* this.emitTaskStart(workflowId, task);

      const layerResults = await Promise.allSettled(
        layer.map((task) => this.executeTask(task, results)),
      );

      const { layerTaskResults, layerSuccess, layerFailed } = await this.collectLayerResults(
        workflowId,
        layer,
        layerResults,
        results,
      );

      for (const event of layerTaskResults.events) yield event;
      successfulTasks += layerSuccess;
      failedTasks += layerFailed;

      const stateUpdate: StateUpdate = { currentLayer: actualLayerIdx, tasks: layerTaskResults.tasks };
      this.state = updateState(this.state!, stateUpdate);

      const stateEvent: ExecutionEvent = {
        type: "state_updated",
        timestamp: Date.now(),
        workflowId,
        updates: { tasksAdded: layerTaskResults.tasks.length },
      };
      await this.eventStream.emit(stateEvent);
      yield stateEvent;

      const checkpointEvent = await this.saveCheckpoint(workflowId, actualLayerIdx);
      if (checkpointEvent) yield checkpointEvent;

      // AIL Decision Point (SECURITY: Must include on resume to prevent bypass)
      const ailEvents = await this.handleAILDecisionPoint(workflowId, actualLayerIdx, layerFailed > 0, dag, layers);
      for (const event of ailEvents.events) yield event;
      if (ailEvents.newLayers) layers = ailEvents.newLayers;
      if (ailEvents.newDag) dag = ailEvents.newDag;

      // HIL Approval (SECURITY: Must include on resume to prevent bypass)
      const hilEvents = await this.handleHILApproval(workflowId, actualLayerIdx, layer, layers);
      for (const event of hilEvents) yield event;
    }

    const totalTime = performance.now() - startTime;
    const completeEvent: ExecutionEvent = {
      type: "workflow_complete",
      timestamp: Date.now(),
      workflowId,
      totalTimeMs: totalTime,
      successfulTasks,
      failedTasks,
    };
    await this.eventStream.emit(completeEvent);
    yield completeEvent;

    // GraphRAG feedback (same as executeStream)
    this.updateGraphRAG(workflowId, dag, totalTime, failedTasks);

    await this.eventStream.close();
    return this.state!;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Task Execution
  // ═══════════════════════════════════════════════════════════════════════════

  protected override async executeTask(
    task: Task,
    previousResults: Map<string, TaskResult>,
  ): Promise<{ output: unknown; executionTimeMs: number }> {
    const taskType = getTaskType(task);
    const deps: CodeExecutorDeps = { capabilityStore: this.capabilityStore, graphRAG: this.graphRAG };

    if (taskType === "code_execution") {
      if (isSafeToFail(task)) return await executeWithRetry(task, previousResults, deps);
      return await this.executeCodeTaskWithEscalation(task, previousResults, deps);
    } else if (taskType === "capability") {
      return await this.executeCapabilityTaskWithEscalation(task, previousResults, deps);
    } else {
      return await super.executeTask(task, previousResults);
    }
  }

  private async executeCodeTaskWithEscalation(
    task: Task,
    previousResults: Map<string, TaskResult>,
    deps: CodeExecutorDeps,
    permissionSet?: PermissionSet,
  ): Promise<{ output: unknown; executionTimeMs: number }> {
    try {
      return await executeCodeTask(task, previousResults, deps, permissionSet);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (isPermissionError(errorMessage)) {
        const result = await this.handleCodeTaskPermissionEscalation(task, previousResults, deps, errorMessage);
        if (result) return result;
      }
      throw error;
    }
  }

  private async executeCapabilityTaskWithEscalation(
    task: Task,
    previousResults: Map<string, TaskResult>,
    deps: CodeExecutorDeps,
  ): Promise<{ output: unknown; executionTimeMs: number }> {
    try {
      return await executeCapabilityTask(task, previousResults, deps);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (
        isPermissionError(errorMessage) &&
        this.permissionEscalationHandler &&
        this.capabilityStore &&
        task.capabilityId
      ) {
        const currentSet = await getCapabilityPermissionSet(this.capabilityStore, task.capabilityId);
        const executionId = `${this.state?.workflowId ?? "unknown"}-${task.id}`;
        const result = await this.permissionEscalationHandler.handlePermissionError(
          task.capabilityId,
          currentSet,
          errorMessage,
          executionId,
        );

        if (result.handled && result.approved) {
          log.info(`Permission escalation approved for ${task.capabilityId}, retrying`);
          return await this.executeCapabilityTaskWithEscalation(task, previousResults, deps);
        } else if (result.handled) {
          throw new Error(`Permission escalation rejected: ${result.feedback ?? result.error}`);
        }
      }
      throw error;
    }
  }

  private async handleCodeTaskPermissionEscalation(
    task: Task,
    previousResults: Map<string, TaskResult>,
    deps: CodeExecutorDeps,
    errorMessage: string,
  ): Promise<{ output: unknown; executionTimeMs: number } | null> {
    const currentPermissionSet: PermissionSet =
      (task.sandboxConfig?.permissionSet as PermissionSet) ?? "minimal";
    const suggestion = suggestEscalation(errorMessage, task.id, currentPermissionSet);

    if (!suggestion) return null;

    const description = formatEscalationRequest(suggestion);
    const escalationEvent: ExecutionEvent = {
      type: "decision_required",
      timestamp: Date.now(),
      workflowId: this.state?.workflowId ?? "unknown",
      decisionType: "HIL",
      description: `[Code Task: ${task.id}] ${description}`,
      checkpointId: `perm-esc-${task.id}`,
    };
    await this.eventStream.emit(escalationEvent);

    const command = await waitForDecisionCommand(this.commandQueue, "HIL", this.getTimeout("hil"));
    if (!command) {
      throw new Error(`Permission escalation timeout for code task ${task.id}`);
    }

    if (
      (command.type === "permission_escalation_response" || command.type === "approval_response") &&
      command.approved
    ) {
      return await executeCodeTask(task, previousResults, deps, suggestion.requestedSet);
    }

    throw new Error(`Permission escalation rejected for code task ${task.id}: ${command.feedback ?? "User rejected"}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Helper Methods
  // ═══════════════════════════════════════════════════════════════════════════

  private getCaptureContext(): CaptureContext {
    return { state: this.state, episodicMemory: this.episodicMemory };
  }

  private async *emitTaskStart(workflowId: string, task: Task): AsyncGenerator<ExecutionEvent> {
    const event: ExecutionEvent = {
      type: "task_start",
      timestamp: Date.now(),
      workflowId,
      taskId: task.id,
      tool: task.tool,
    };
    await this.eventStream.emit(event);
    yield event;
  }

  private async collectLayerResults(
    workflowId: string,
    layer: Task[],
    layerResults: PromiseSettledResult<{ output: unknown; executionTimeMs: number }>[],
    results: Map<string, TaskResult>,
  ): Promise<{
    layerTaskResults: { tasks: TaskResult[]; events: ExecutionEvent[] };
    layerSuccess: number;
    layerFailed: number;
  }> {
    const tasks: TaskResult[] = [];
    const events: ExecutionEvent[] = [];
    let layerSuccess = 0;
    let layerFailed = 0;
    const ctx = this.getCaptureContext();

    for (let i = 0; i < layer.length; i++) {
      const task = layer[i];
      const result = layerResults[i];

      if (result.status === "fulfilled") {
        layerSuccess++;
        const taskResult: TaskResult = {
          taskId: task.id,
          status: "success",
          output: result.value.output,
          executionTimeMs: result.value.executionTimeMs,
        };
        results.set(task.id, taskResult);
        tasks.push(taskResult);

        const completeEvent: ExecutionEvent = {
          type: "task_complete",
          timestamp: Date.now(),
          workflowId,
          taskId: task.id,
          executionTimeMs: result.value.executionTimeMs,
        };
        await this.eventStream.emit(completeEvent);
        events.push(completeEvent);

        captureTaskComplete(ctx, workflowId, task.id, "success", result.value.output, result.value.executionTimeMs);
        this.speculationState = updateLastCompletedTool(this.speculationState, task.tool);
      } else {
        const errorMsg = result.reason?.message || String(result.reason);
        const isSafe = isSafeToFail(task);

        if (isSafe) {
          log.warn(`Safe-to-fail task ${task.id} failed (continuing): ${errorMsg}`);
          const taskResult: TaskResult = { taskId: task.id, status: "failed_safe" as const, output: null, error: errorMsg };
          results.set(task.id, taskResult);
          tasks.push(taskResult);

          const warningEvent: ExecutionEvent = {
            type: "task_warning",
            timestamp: Date.now(),
            workflowId,
            taskId: task.id,
            error: errorMsg,
            message: "Safe-to-fail task failed, workflow continues",
          };
          await this.eventStream.emit(warningEvent);
          events.push(warningEvent);
          captureTaskComplete(ctx, workflowId, task.id, "failed_safe", null, undefined, errorMsg);
        } else {
          layerFailed++;
          const taskResult: TaskResult = { taskId: task.id, status: "error", error: errorMsg };
          results.set(task.id, taskResult);
          tasks.push(taskResult);

          const errorEvent: ExecutionEvent = {
            type: "task_error",
            timestamp: Date.now(),
            workflowId,
            taskId: task.id,
            error: errorMsg,
          };
          await this.eventStream.emit(errorEvent);
          events.push(errorEvent);
          captureTaskComplete(ctx, workflowId, task.id, "error", null, undefined, errorMsg);
        }
      }
    }

    return { layerTaskResults: { tasks, events }, layerSuccess, layerFailed };
  }

  private async saveCheckpoint(workflowId: string, layerIdx: number): Promise<ExecutionEvent | null> {
    if (!this.checkpointManager || !this.state) return null;
    const checkpointId = await saveCheckpointAfterLayer(
      this.checkpointManager,
      workflowId,
      layerIdx,
      this.state,
    );
    // null = save failed, "" = no manager (already checked above)
    if (!checkpointId) return null;

    const checkpointEvent: ExecutionEvent = {
      type: "checkpoint",
      timestamp: Date.now(),
      workflowId,
      checkpointId,
      layerIndex: layerIdx,
    };
    await this.eventStream.emit(checkpointEvent);
    return checkpointEvent;
  }

  private async handleAILDecisionPoint(
    workflowId: string,
    layerIdx: number,
    hasErrors: boolean,
    dag: DAGStructure,
    _layers: Task[][],
  ): Promise<{ events: ExecutionEvent[]; newLayers?: Task[][]; newDag?: DAGStructure }> {
    const events: ExecutionEvent[] = [];
    const ctx = this.getCaptureContext();

    if (!shouldTriggerAIL(this.config, layerIdx, hasErrors)) {
      return { events };
    }

    const ailEvent: ExecutionEvent = {
      type: "decision_required",
      timestamp: Date.now(),
      workflowId,
      decisionType: "AIL",
      description: `Layer ${layerIdx} completed. Agent decision required.`,
    };
    await this.eventStream.emit(ailEvent);
    events.push(ailEvent);

    const command = await waitForDecisionCommand(this.commandQueue, "AIL", this.getTimeout("ail"));

    if (!command || command.type === "continue") {
      captureAILDecision(ctx, workflowId, "continue", "Agent decision: continue", { reason: command?.reason || "default" });
      return { events };
    }

    if (command.type === "abort") {
      captureAILDecision(ctx, workflowId, "abort", "Agent decision: abort", { reason: command.reason });
      throw new Error(`Workflow aborted by agent: ${command.reason}`);
    }

    if (command.type === "replan_dag" && this.dagSuggester) {
      if (this.replanCount >= MAX_REPLANS) {
        captureAILDecision(ctx, workflowId, "replan_rejected", "Rate limit reached", { max_replans: MAX_REPLANS });
        return { events };
      }

      try {
        const augmentedDAG = await this.dagSuggester.replanDAG(dag, {
          completedTasks: this.state!.tasks,
          newRequirement: command.new_requirement ?? "",
          availableContext: (command.available_context ?? {}) as Record<string, unknown>,
        });

        if (augmentedDAG.tasks.length !== dag.tasks.length) {
          const newLayers = this.topologicalSort(augmentedDAG);
          this.replanCount++;
          captureAILDecision(ctx, workflowId, "replan_success", "DAG replanned", { replan_count: this.replanCount });
          return { events, newLayers, newDag: augmentedDAG };
        }
      } catch (error) {
        captureAILDecision(ctx, workflowId, "replan_failed", "Replan failed", { error: String(error) });
      }
    }

    return { events };
  }

  private async handleHILApproval(
    workflowId: string,
    layerIdx: number,
    layer: Task[],
    layers: Array<Array<{ id: string; tool: string; depends_on?: string[] }>>,
  ): Promise<ExecutionEvent[]> {
    const events: ExecutionEvent[] = [];
    const ctx = this.getCaptureContext();

    if (!shouldRequireApproval(this.config, layerIdx, layer)) {
      return events;
    }

    const summary = generateHILSummary(this.state, layerIdx, layers);
    const hilEvent: ExecutionEvent = {
      type: "decision_required",
      timestamp: Date.now(),
      workflowId,
      decisionType: "HIL",
      description: summary,
    };
    await this.eventStream.emit(hilEvent);
    events.push(hilEvent);

    const command = await waitForDecisionCommand(this.commandQueue, "HIL", this.getTimeout("hil"));

    if (!command) {
      captureHILDecision(ctx, workflowId, false, `layer-${layerIdx}`, "timeout");
      throw new Error("Workflow aborted: HIL approval timeout");
    }

    if (command.type === "approval_response") {
      if (command.approved) {
        captureHILDecision(ctx, workflowId, true, `layer-${layerIdx}`, command.feedback);
      } else {
        captureHILDecision(ctx, workflowId, false, `layer-${layerIdx}`, command.feedback);
        throw new Error(`Workflow aborted by human: ${command.feedback || "no reason provided"}`);
      }
    }

    return events;
  }

  private updateGraphRAG(workflowId: string, dag: DAGStructure, totalTime: number, failedTasks: number): void {
    if (!this.dagSuggester) return;

    try {
      const graphEngine = this.dagSuggester.getGraphEngine();
      graphEngine.updateFromExecution({
        executionId: workflowId,
        executedAt: new Date(),
        intentText: "workflow-execution",
        dagStructure: dag,
        success: failedTasks === 0,
        executionTimeMs: totalTime,
        errorMessage: failedTasks > 0 ? `${failedTasks} tasks failed` : undefined,
        userId: this.userId,
      }).catch((error) => log.error(`GraphRAG feedback loop failed: ${error}`));
    } catch (error) {
      log.error(`GraphRAG feedback loop failed: ${error}`);
    }
  }
}
