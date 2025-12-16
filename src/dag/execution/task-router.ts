/**
 * Task Router Module
 *
 * Routes task execution based on task type (code_execution, capability, mcp_tool).
 * Provides utility functions for task type determination and safe-to-fail checks.
 *
 * @module dag/execution/task-router
 */

import type { Task } from "../../graphrag/types.ts";

/**
 * Task execution types
 */
export type TaskType = "code_execution" | "capability" | "mcp_tool";

/**
 * Get the task type for routing (defaults to mcp_tool)
 *
 * @param task - Task to check
 * @returns Task type for routing
 */
export function getTaskType(task: Task): TaskType {
  return (task.type as TaskType) ?? "mcp_tool";
}

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
export function isSafeToFail(task: Task): boolean {
  return !task.sideEffects && task.type === "code_execution";
}

/**
 * Check if a task requires sandbox execution
 *
 * @param task - Task to check
 * @returns true if task should be executed in sandbox
 */
export function requiresSandbox(task: Task): boolean {
  const type = getTaskType(task);
  return type === "code_execution" || type === "capability";
}

/**
 * Check if a task is an MCP tool call
 *
 * @param task - Task to check
 * @returns true if task is an MCP tool call
 */
export function isMCPTool(task: Task): boolean {
  return getTaskType(task) === "mcp_tool";
}
