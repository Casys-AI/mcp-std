/**
 * Static Structure to DAG Converter (Epic 10 - Story 10.5)
 *
 * Converts StaticStructure (from static code analysis) to DAGStructure
 * for execution via ControlledExecutor with all DAG features:
 * - Per-layer validation (HIL)
 * - Parallel execution
 * - Checkpoints/resume
 * - SSE streaming
 *
 * @module dag/static-to-dag-converter
 */

import type {
  ArgumentsStructure,
  StaticStructure,
  StaticStructureNode,
} from "../capabilities/types.ts";
import type { Task } from "../graphrag/types.ts";
import { getLogger } from "../telemetry/logger.ts";

const logger = getLogger("default");

/**
 * Condition for conditional task execution
 *
 * When present on a task, the task is only executed if the condition is met.
 * The condition references a decision node and the required outcome.
 */
export interface TaskCondition {
  /** ID of the decision node that controls this task */
  decisionNodeId: string;
  /** Required outcome for this task to execute ("true", "false", "case:value") */
  requiredOutcome: string;
}

/**
 * Extended Task with conditional execution support
 *
 * Extends the base Task with:
 * - condition: For conditional branches (if/else, switch)
 * - staticArguments: Original argument resolution strategies
 */
export interface ConditionalTask extends Task {
  /**
   * Condition for conditional execution (AC4)
   *
   * When set, this task is only executed if the referenced decision node
   * evaluates to the required outcome.
   */
  condition?: TaskCondition;

  /**
   * Original argument resolution strategies from static analysis (AC3)
   *
   * Preserved from StaticStructure for runtime argument resolution.
   * See ArgumentsStructure type for resolution strategies.
   */
  staticArguments?: ArgumentsStructure;
}

/**
 * Extended DAGStructure with conditional tasks
 */
export interface ConditionalDAGStructure {
  tasks: ConditionalTask[];
}

/**
 * Conversion options for staticStructureToDag
 */
export interface ConversionOptions {
  /**
   * Whether to include decision nodes as tasks (default: false)
   *
   * When true, decision nodes become tasks that evaluate conditions.
   * When false, decision nodes only affect conditional edges.
   */
  includeDecisionTasks?: boolean;

  /**
   * Prefix for generated task IDs (default: "task_")
   */
  taskIdPrefix?: string;
}

/**
 * Convert StaticStructure to DAGStructure for execution
 *
 * Mapping rules (AC1):
 * - task node → Task { tool, arguments, type: "mcp_tool" }
 * - capability node → Task { capabilityId, type: "capability" }
 * - decision node → Creates conditional edges (not a task)
 * - fork node → Parallel tasks (no dependencies between them)
 * - join node → Task depends on all fork children
 *
 * Edge mapping (AC1):
 * - sequence edge → Direct dependency (dependsOn)
 * - conditional edge → Task with condition field
 * - provides edge → Data flow dependency (dependsOn)
 *
 * @param structure StaticStructure from static code analysis
 * @param options Conversion options
 * @returns DAGStructure ready for ControlledExecutor
 */
export function staticStructureToDag(
  structure: StaticStructure,
  options: ConversionOptions = {},
): ConditionalDAGStructure {
  const { includeDecisionTasks = false, taskIdPrefix = "task_" } = options;

  logger.debug("Converting static structure to DAG", {
    nodeCount: structure.nodes.length,
    edgeCount: structure.edges.length,
  });

  // Phase 1: Create task map from nodes
  const tasks: ConditionalTask[] = [];
  const nodeToTaskId = new Map<string, string>();
  const forkChildren = new Map<string, string[]>(); // fork.id -> child task IDs

  for (const node of structure.nodes) {
    const task = nodeToTask(node, taskIdPrefix, includeDecisionTasks);
    if (task) {
      tasks.push(task);
      nodeToTaskId.set(node.id, task.id);
    }

    // Track fork nodes for join dependency resolution
    if (node.type === "fork") {
      forkChildren.set(node.id, []);
    }
  }

  // Phase 2: Build dependency map from edges
  const dependencies = new Map<string, string[]>();
  const conditions = new Map<string, TaskCondition>();

  for (const edge of structure.edges) {
    const fromTaskId = nodeToTaskId.get(edge.from);
    const toTaskId = nodeToTaskId.get(edge.to);

    if (!toTaskId) continue; // Target node not converted to task

    switch (edge.type) {
      case "sequence":
      case "provides":
        // Direct dependency
        if (fromTaskId) {
          addDependency(dependencies, toTaskId, fromTaskId);
        }
        // Check if this is a fork -> child edge
        if (forkChildren.has(edge.from)) {
          forkChildren.get(edge.from)!.push(toTaskId);
        }
        break;

      case "conditional":
        // Conditional execution (AC4)
        if (edge.outcome) {
          conditions.set(toTaskId, {
            decisionNodeId: edge.from,
            requiredOutcome: edge.outcome,
          });
          // Also add dependency on the decision node (if included)
          if (fromTaskId) {
            addDependency(dependencies, toTaskId, fromTaskId);
          }
        }
        break;

      case "contains":
        // Hierarchy edge - not used for DAG execution
        break;
    }
  }

  // Phase 3: Resolve join dependencies (AC5)
  for (const node of structure.nodes) {
    if (node.type === "join") {
      const joinTaskId = nodeToTaskId.get(node.id);
      if (!joinTaskId) continue;

      // Find the matching fork by looking at incoming edges
      for (const edge of structure.edges) {
        if (edge.to === node.id && forkChildren.has(edge.from)) {
          // Don't add the fork itself, add its children
          continue;
        }
        if (edge.to === node.id && edge.type === "sequence") {
          const fromTaskId = nodeToTaskId.get(edge.from);
          if (fromTaskId) {
            addDependency(dependencies, joinTaskId, fromTaskId);
          }
        }
      }
    }
  }

  // Phase 4: Apply dependencies and conditions to tasks
  for (const task of tasks) {
    const deps = dependencies.get(task.id);
    if (deps) {
      task.dependsOn = [...new Set(deps)]; // Deduplicate
    }

    const condition = conditions.get(task.id);
    if (condition) {
      task.condition = condition;
    }
  }

  logger.debug("Static structure converted to DAG", {
    tasksCount: tasks.length,
    tasksWithDeps: tasks.filter((t) => t.dependsOn.length > 0).length,
    conditionalTasks: tasks.filter((t) => t.condition).length,
  });

  return { tasks };
}

/**
 * Convert a single StaticStructureNode to a Task
 *
 * @param node The node to convert
 * @param prefix Task ID prefix
 * @param includeDecisions Whether to include decision nodes as tasks
 * @returns Task or null if node should not become a task
 */
function nodeToTask(
  node: StaticStructureNode,
  prefix: string,
  includeDecisions: boolean,
): ConditionalTask | null {
  const taskId = `${prefix}${node.id}`;

  switch (node.type) {
    case "task":
      return {
        id: taskId,
        tool: node.tool,
        arguments: {}, // Will be resolved at runtime via staticArguments
        dependsOn: [],
        type: "mcp_tool",
        staticArguments: node.arguments,
      };

    case "capability":
      return {
        id: taskId,
        tool: `capability:${node.capabilityId}`,
        arguments: {},
        dependsOn: [],
        type: "capability",
        capabilityId: node.capabilityId,
      };

    case "decision":
      if (includeDecisions) {
        // Decision nodes can be tasks that evaluate conditions
        return {
          id: taskId,
          tool: "internal:decision",
          arguments: { condition: node.condition },
          dependsOn: [],
          type: "mcp_tool",
        };
      }
      return null; // Decision nodes are not tasks by default

    case "fork":
      // Fork nodes are structural, not tasks
      // They indicate parallel execution starts here
      return null;

    case "join":
      // Join nodes can be represented as synchronization points
      // For now, we don't create explicit join tasks
      // The join is implicit in the dependencies
      return null;

    default:
      logger.warn("Unknown node type in static structure", { node });
      return null;
  }
}

/**
 * Add a dependency to the dependency map
 */
function addDependency(
  deps: Map<string, string[]>,
  taskId: string,
  dependsOn: string,
): void {
  if (!deps.has(taskId)) {
    deps.set(taskId, []);
  }
  deps.get(taskId)!.push(dependsOn);
}

/**
 * Check if a static structure is valid for DAG conversion
 *
 * Returns false for empty structures or structures with only
 * non-executable nodes (fork/join without tasks).
 *
 * @param structure StaticStructure to validate
 * @returns true if structure can be converted to a meaningful DAG
 */
export function isValidForDagConversion(structure: StaticStructure): boolean {
  if (!structure || !structure.nodes || structure.nodes.length === 0) {
    return false;
  }

  // Check if there's at least one executable node (task or capability)
  const hasExecutableNode = structure.nodes.some(
    (node) => node.type === "task" || node.type === "capability",
  );

  return hasExecutableNode;
}

/**
 * Get the list of tools that will be executed from a static structure
 *
 * Useful for HIL approval summaries and permission checking.
 *
 * @param structure StaticStructure to analyze
 * @returns List of tool IDs that will be executed
 */
export function getToolsFromStaticStructure(structure: StaticStructure): string[] {
  const tools: string[] = [];

  for (const node of structure.nodes) {
    if (node.type === "task") {
      tools.push(node.tool);
    }
  }

  return tools;
}

/**
 * Estimate parallel execution layers from static structure
 *
 * Analyzes the structure to determine how many parallel execution
 * layers will be created. Useful for progress estimation.
 *
 * @param structure StaticStructure to analyze
 * @returns Estimated number of parallel layers
 */
export function estimateParallelLayers(structure: StaticStructure): number {
  // Simple heuristic: count fork nodes + 1
  const forkCount = structure.nodes.filter((n) => n.type === "fork").length;

  if (forkCount === 0) {
    // Sequential execution: each task is a layer
    const taskCount = structure.nodes.filter(
      (n) => n.type === "task" || n.type === "capability",
    ).length;
    return taskCount;
  }

  // With parallelism: approximate based on fork/join structure
  // Each fork adds potential parallelism
  return Math.max(1, forkCount + 1);
}
