/**
 * Execution Module Exports
 *
 * Re-exports task routing and execution functionality.
 *
 * @module dag/execution
 */

export {
  getTaskType,
  isSafeToFail,
  requiresSandbox,
  isMCPTool,
  type TaskType,
} from "./task-router.ts";

export {
  executeCodeTask,
  executeWithRetry,
  type CodeExecutorDeps,
} from "./code-executor.ts";

export {
  executeCapabilityTask,
  getCapabilityPermissionSet,
  type CapabilityExecutorDeps,
} from "./capability-executor.ts";

export { resolveDependencies } from "./dependency-resolver.ts";
