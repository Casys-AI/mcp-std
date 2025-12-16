/**
 * Capability Executor Module
 *
 * Executes capability tasks (learned code patterns from CapabilityStore).
 * Handles capability lookup, sandbox execution, and permission escalation.
 *
 * @module dag/execution/capability-executor
 */

import type { Task } from "../../graphrag/types.ts";
import type { TaskResult } from "../types.ts";
import type { PermissionSet } from "../../capabilities/types.ts";
import type { CapabilityStore } from "../../capabilities/capability-store.ts";
import type { GraphRAGEngine } from "../../graphrag/graph-engine.ts";
import { DenoSandboxExecutor } from "../../sandbox/executor.ts";
import { getLogger } from "../../telemetry/logger.ts";
import { resolveDependencies } from "./dependency-resolver.ts";

const log = getLogger("default");

/**
 * Dependencies for capability execution
 */
export interface CapabilityExecutorDeps {
  capabilityStore?: CapabilityStore;
  graphRAG?: GraphRAGEngine;
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
 * @param deps - Capability executor dependencies
 * @returns Execution result
 */
export async function executeCapabilityTask(
  task: Task,
  previousResults: Map<string, TaskResult>,
  deps: CapabilityExecutorDeps,
): Promise<{ output: unknown; executionTimeMs: number }> {
  const startTime = performance.now();

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
    if (!deps.capabilityStore) {
      throw new Error(
        `Capability task ${task.id} has no code and CapabilityStore is not configured. ` +
          `Call setLearningDependencies() before executing capability tasks.`,
      );
    }

    const capability = await deps.capabilityStore.findById(task.capabilityId);
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
  if (task.intent) {
    executionContext.intent = task.intent;
  }

  // Resolve dependencies
  executionContext.deps = resolveDependencies(task.dependsOn, previousResults);

  // Configure sandbox (capabilities use default safe config)
  const sandboxConfig = task.sandboxConfig || {};
  const executor = new DenoSandboxExecutor({
    timeout: sandboxConfig.timeout ?? 30000,
    memoryLimit: sandboxConfig.memoryLimit ?? 512,
    allowedReadPaths: sandboxConfig.allowedReadPaths ?? [],
    capabilityStore: deps.capabilityStore,
    graphRAG: deps.graphRAG,
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
}

/**
 * Get capability's current permission set from store
 *
 * @param capabilityStore - CapabilityStore instance
 * @param capabilityId - Capability ID to look up
 * @returns Permission set or "minimal" if not found
 */
export async function getCapabilityPermissionSet(
  capabilityStore: CapabilityStore | undefined,
  capabilityId: string,
): Promise<PermissionSet> {
  if (!capabilityStore) {
    return "minimal";
  }

  const capability = await capabilityStore.findById(capabilityId);
  return (capability?.permissionSet ?? "minimal") as PermissionSet;
}
