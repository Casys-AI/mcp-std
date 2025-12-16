/**
 * Dependency Resolver Module
 *
 * Shared utility for resolving task dependencies from previous results.
 * Used by code-executor and capability-executor.
 *
 * @module dag/execution/dependency-resolver
 */

import type { TaskResult } from "../types.ts";

/**
 * Resolve dependencies for a task from previous results
 *
 * Validates that all dependencies exist and have not critically failed.
 * Returns a map of dependency ID to full TaskResult for resilient patterns.
 *
 * @param dependsOn - Array of dependency task IDs
 * @param previousResults - Map of task ID to TaskResult
 * @returns Record of dependency ID to TaskResult
 * @throws Error if a dependency failed critically or is not found
 */
export function resolveDependencies(
  dependsOn: string[],
  previousResults: Map<string, TaskResult>,
): Record<string, TaskResult> {
  const taskDeps: Record<string, TaskResult> = {};

  for (const depId of dependsOn) {
    const depResult = previousResults.get(depId);

    // Critical failures halt execution
    if (depResult?.status === "error") {
      throw new Error(`Dependency task ${depId} failed: ${depResult.error}`);
    }
    if (!depResult) {
      throw new Error(`Dependency task ${depId} not found in results`);
    }

    // Story 3.5: Store full TaskResult (status, output, error)
    taskDeps[depId] = depResult;
  }

  return taskDeps;
}
