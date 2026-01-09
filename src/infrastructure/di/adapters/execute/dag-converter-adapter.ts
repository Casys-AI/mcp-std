/**
 * DAG Converter Adapter
 *
 * Adapts static-to-dag-converter and dag-optimizer to IDAGConverter interface.
 *
 * Phase 3.1: Execute Handler → Use Cases refactoring
 *
 * @module infrastructure/di/adapters/execute/dag-converter-adapter
 */

import type { StaticStructure } from "../../../../capabilities/types/mod.ts";
import type { DAGStructure } from "../../../../graphrag/types.ts";
import {
  isValidForDagConversion,
  staticStructureToDag,
} from "../../../../dag/static-to-dag-converter.ts";
import {
  optimizeDAG as optimizeDAGImpl,
  type OptimizedDAGStructure,
} from "../../../../dag/dag-optimizer.ts";
import { generateLogicalTrace as generateLogicalTraceImpl } from "../../../../dag/trace-generator.ts";

/**
 * Optimized DAG type (matches ExecuteDirectUseCase)
 */
export interface OptimizedDAG {
  tasks: unknown[];
  logicalToPhysical: Map<string, string>;
  physicalToLogical: Map<string, string[]>;
  logicalDAG: DAGStructure;
}

/**
 * IDAGConverter interface (matches ExecuteDirectUseCase dependency)
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
 * Adapts DAG conversion functions to IDAGConverter interface
 */
export class DAGConverterAdapter implements IDAGConverter {
  /**
   * Check if static structure is valid for DAG conversion
   */
  isValidForDagConversion(structure: StaticStructure): boolean {
    return isValidForDagConversion(structure);
  }

  /**
   * Convert static structure to logical DAG
   */
  staticStructureToDag(structure: StaticStructure): { tasks: unknown[] } {
    return staticStructureToDag(structure);
  }

  /**
   * Optimize logical DAG to physical DAG
   */
  optimizeDAG(dag: { tasks: unknown[] }): OptimizedDAG {
    const optimized = optimizeDAGImpl(dag as DAGStructure, {
      enabled: true,
      strategy: "sequential",
    });

    return {
      tasks: optimized.tasks,
      logicalToPhysical: optimized.logicalToPhysical,
      physicalToLogical: optimized.physicalToLogical,
      logicalDAG: optimized.logicalDAG,
    };
  }

  /**
   * Generate logical trace from physical execution results
   */
  generateLogicalTrace(
    dag: OptimizedDAG,
    results: Map<string, unknown>,
  ): { executedPath: string[]; toolsUsed: string[] } {
    // Convert results to TaskResult format
    type TaskResultStatus = "success" | "error" | "failed_safe";
    const taskResults = new Map<string, { taskId: string; status: TaskResultStatus; output?: unknown }>();
    for (const [taskId, result] of results) {
      const resultObj = result as { taskId?: string; status?: string; output?: unknown };
      const status = resultObj.status as TaskResultStatus ?? "success";
      taskResults.set(taskId, {
        taskId: resultObj.taskId ?? taskId,
        status,
        output: resultObj.output ?? result,
      });
    }

    const optimizedDAG: OptimizedDAGStructure = {
      tasks: dag.tasks as DAGStructure["tasks"],
      logicalToPhysical: dag.logicalToPhysical,
      physicalToLogical: dag.physicalToLogical,
      logicalDAG: dag.logicalDAG,
    };

    const trace = generateLogicalTraceImpl(optimizedDAG, taskResults);

    return {
      executedPath: trace.executedPath,
      toolsUsed: trace.toolsUsed,
    };
  }
}
