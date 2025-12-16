/**
 * Workflow Execution Handler
 *
 * Handles DAG workflow execution, per-layer validation, and generator processing.
 *
 * @module mcp/handlers/workflow-execution-handler
 */

import * as log from "@std/log";
import type { MCPClientBase } from "../types.ts";
import type { DAGStructure } from "../../graphrag/types.ts";
import type { ExecutionEvent, TaskResult } from "../../dag/types.ts";
import type { WorkflowState } from "../../dag/state.ts";
import type {
  MCPToolResponse,
  MCPErrorResponse,
  ActiveWorkflow,
  WorkflowExecutionArgs,
} from "../server/types.ts";
import { MCPErrorCodes, ServerDefaults } from "../server/constants.ts";
import {
  formatMCPError,
  formatMCPSuccess,
  formatLayerComplete,
  formatWorkflowComplete,
  formatApprovalRequired,
} from "../server/responses.ts";
import { ControlledExecutor } from "../../dag/controlled-executor.ts";
import { deleteWorkflowDAG, saveWorkflowDAG } from "../workflow-dag-store.ts";
import type { WorkflowHandlerDependencies } from "./workflow-handler-types.ts";

/**
 * Create tool executor function for ControlledExecutor
 */
function createToolExecutor(mcpClients: Map<string, MCPClientBase>) {
  return async (tool: string, args: Record<string, unknown>): Promise<unknown> => {
    const [serverId, ...toolNameParts] = tool.split(":");
    const toolName = toolNameParts.join(":");
    const client = mcpClients.get(serverId);
    if (!client) {
      throw new Error(`Unknown MCP server: ${serverId}`);
    }
    return await client.callTool(toolName, args);
  };
}

/**
 * Handle workflow execution request
 *
 * Supports three modes:
 * 1. Intent-based: Natural language → DAG suggestion
 * 2. Explicit: DAG structure → Execute
 * 3. Per-layer validation: Execute with pauses between layers (Story 2.5-4)
 *
 * @param args - Workflow arguments (intent or workflow, optional config)
 * @param deps - Handler dependencies
 * @param userId - Optional user ID for multi-tenant isolation
 * @returns Execution result, suggestion, or layer_complete status
 */
export async function handleWorkflowExecution(
  args: unknown,
  deps: WorkflowHandlerDependencies,
  userId?: string,
): Promise<MCPToolResponse | MCPErrorResponse> {
  const workflowArgs = args as WorkflowExecutionArgs;
  const perLayerValidation = workflowArgs.config?.per_layer_validation === true;

  // Case 1: Explicit workflow provided
  if (workflowArgs.workflow) {
    log.info(`Executing explicit workflow (per_layer_validation: ${perLayerValidation})`);

    // Normalize tasks: ensure dependsOn is always an array
    const normalizedWorkflow: DAGStructure = {
      ...workflowArgs.workflow,
      tasks: workflowArgs.workflow.tasks.map((task) => ({
        ...task,
        dependsOn: task.dependsOn ?? [],
      })),
    };

    // Story 2.5-4: Per-layer validation mode
    if (perLayerValidation) {
      return await executeWithPerLayerValidation(
        normalizedWorkflow,
        workflowArgs.intent ?? "explicit_workflow",
        deps,
        userId,
      );
    }

    // Standard execution (no validation pauses)
    return await executeStandardWorkflow(normalizedWorkflow, workflowArgs.intent, deps, userId);
  }

  // Case 2: Intent-based (GraphRAG suggestion)
  if (workflowArgs.intent) {
    log.info(
      `Processing workflow intent: "${workflowArgs.intent}" (per_layer_validation: ${perLayerValidation})`,
    );

    const executionMode = await deps.gatewayHandler.processIntent({
      text: workflowArgs.intent,
    });

    if (executionMode.mode === "explicit_required") {
      return formatMCPSuccess({
        mode: "explicit_required",
        message: executionMode.explanation || "Low confidence - please provide explicit workflow",
        confidence: executionMode.confidence,
      });
    }

    if (executionMode.mode === "suggestion") {
      if (perLayerValidation && executionMode.dagStructure) {
        return await executeWithPerLayerValidation(
          executionMode.dagStructure,
          workflowArgs.intent,
          deps,
          userId,
        );
      }

      return formatMCPSuccess({
        mode: "suggestion",
        suggested_dag: executionMode.dagStructure,
        confidence: executionMode.confidence,
        explanation: executionMode.explanation,
      });
    }

    if (executionMode.mode === "speculative_execution") {
      return formatMCPSuccess({
        mode: "speculative_execution",
        results: executionMode.results,
        confidence: executionMode.confidence,
        executionTimeMs: executionMode.executionTimeMs,
      });
    }
  }

  // Neither intent nor workflow provided
  return formatMCPError(
    MCPErrorCodes.INVALID_PARAMS,
    "Either 'intent' or 'workflow' must be provided",
    { received: Object.keys(workflowArgs) },
  );
}

/**
 * Execute standard workflow without validation pauses
 */
async function executeStandardWorkflow(
  dag: DAGStructure,
  intent: string | undefined,
  deps: WorkflowHandlerDependencies,
  userId?: string,
): Promise<MCPToolResponse> {
  const controlledExecutor = new ControlledExecutor(
    createToolExecutor(deps.mcpClients),
    {
      taskTimeout: ServerDefaults.taskTimeout,
      userId: userId ?? "local",
      hil: { enabled: true, approval_required: "critical_only" },
    },
  );

  controlledExecutor.setDAGSuggester(deps.dagSuggester);
  controlledExecutor.setLearningDependencies(deps.capabilityStore, deps.graphEngine);

  const result = await controlledExecutor.execute(dag);

  // Update graph with execution data (learning loop)
  await deps.graphEngine.updateFromExecution({
    executionId: crypto.randomUUID(),
    executedAt: new Date(),
    intentText: intent ?? "",
    dagStructure: dag,
    success: result.errors.length === 0,
    executionTimeMs: result.executionTimeMs,
    userId: userId ?? "local",
  });

  return formatMCPSuccess({
    status: "completed",
    results: result.results,
    executionTimeMs: result.executionTimeMs,
    parallelization_layers: result.parallelizationLayers,
    errors: result.errors,
  });
}

/**
 * Execute workflow with per-layer validation (Story 2.5-4)
 */
async function executeWithPerLayerValidation(
  dag: DAGStructure,
  intent: string,
  deps: WorkflowHandlerDependencies,
  userId?: string,
): Promise<MCPToolResponse> {
  const workflowId = crypto.randomUUID();

  // Save DAG to database for stateless continuation
  await saveWorkflowDAG(deps.db, workflowId, dag, intent);

  // Create ControlledExecutor for this workflow
  const controlledExecutor = new ControlledExecutor(
    createToolExecutor(deps.mcpClients),
    {
      taskTimeout: ServerDefaults.taskTimeout,
      userId: userId ?? "local",
      hil: { enabled: true, approval_required: "critical_only" },
    },
  );

  // Configure checkpointing
  controlledExecutor.setCheckpointManager(deps.db, true);
  controlledExecutor.setDAGSuggester(deps.dagSuggester);
  controlledExecutor.setLearningDependencies(deps.capabilityStore, deps.graphEngine);

  // Start streaming execution
  const generator = controlledExecutor.executeStream(dag, workflowId);

  // Process events until first layer completes
  return await processGeneratorUntilPause(
    workflowId,
    controlledExecutor,
    generator,
    dag,
    0,
    deps,
  );
}

/**
 * Process generator events until next pause point or completion
 */
export async function processGeneratorUntilPause(
  workflowId: string,
  executor: ControlledExecutor,
  generator: AsyncGenerator<ExecutionEvent, WorkflowState, void>,
  dag: DAGStructure,
  expectedLayer: number,
  deps: WorkflowHandlerDependencies,
): Promise<MCPToolResponse> {
  const layerResults: TaskResult[] = [];
  let currentLayer = expectedLayer;
  let totalLayers = 0;
  let latestCheckpointId: string | null = null;

  for await (const event of generator) {
    if (event.type === "workflow_start") {
      totalLayers = event.totalLayers ?? 0;
    }

    if (event.type === "task_complete" || event.type === "task_error") {
      layerResults.push({
        taskId: event.taskId ?? "",
        status: event.type === "task_complete" ? "success" : "error",
        output: event.type === "task_complete"
          ? { executionTimeMs: event.executionTimeMs }
          : undefined,
        error: event.type === "task_error" ? event.error : undefined,
      });
    }

    // Story 2.5-3 HIL Fix: Handle decision_required events
    if (event.type === "decision_required") {
      const activeWorkflow: ActiveWorkflow = {
        workflowId,
        executor,
        generator,
        dag,
        currentLayer,
        totalLayers,
        layerResults: [...layerResults],
        status: "awaiting_approval",
        createdAt: deps.activeWorkflows.get(workflowId)?.createdAt ?? new Date(),
        lastActivityAt: new Date(),
        latestCheckpointId: event.checkpointId ?? null,
      };
      deps.activeWorkflows.set(workflowId, activeWorkflow);

      return formatApprovalRequired(
        workflowId,
        event.checkpointId,
        event.decisionType,
        event.description,
        event.context,
      );
    }

    if (event.type === "checkpoint") {
      latestCheckpointId = event.checkpointId ?? null;
      currentLayer = event.layerIndex ?? currentLayer;

      // Update active workflow state
      const activeWorkflow: ActiveWorkflow = {
        workflowId,
        executor,
        generator,
        dag,
        currentLayer,
        totalLayers,
        layerResults: [...layerResults],
        status: "paused",
        createdAt: deps.activeWorkflows.get(workflowId)?.createdAt ?? new Date(),
        lastActivityAt: new Date(),
        latestCheckpointId,
      };
      deps.activeWorkflows.set(workflowId, activeWorkflow);

      return formatLayerComplete(
        workflowId,
        latestCheckpointId,
        currentLayer,
        totalLayers,
        layerResults,
        currentLayer + 1 < totalLayers,
      );
    }

    if (event.type === "workflow_complete") {
      // Workflow completed - clean up
      deps.activeWorkflows.delete(workflowId);
      await deleteWorkflowDAG(deps.db, workflowId);

      return formatWorkflowComplete(
        workflowId,
        event.totalTimeMs ?? 0,
        event.successfulTasks ?? 0,
        event.failedTasks ?? 0,
        layerResults,
      );
    }
  }

  // Generator exhausted without workflow_complete (unexpected)
  return formatMCPSuccess({ status: "complete", workflow_id: workflowId });
}
