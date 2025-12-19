/**
 * HIL (Human-in-the-Loop) Handler Module
 *
 * Handles human approval checkpoints during workflow execution.
 * Provides summary generation and approval processing.
 *
 * ⚠️ STATUS: NON UTILISÉ (2025-12-19)
 *
 * Ce module n'est pas activé en production. Le mécanisme de validation
 * humaine est maintenant géré par `per_layer_validation` via:
 * - `requiresValidation()` dans workflow-execution-handler.ts
 * - Détection automatique des tools dangereux (mcp-permissions.yaml)
 *
 * Le code est conservé pour référence future si on veut réactiver
 * un flow HIL interactif plus granulaire.
 *
 * @module dag/loops/hil-handler
 */

import type { ExecutorConfig } from "../types.ts";
import type { WorkflowState } from "../state.ts";
// Logger removed - not used in current implementation

/**
 * Check if HIL approval checkpoint should be triggered (Story 2.5-3)
 *
 * NOTE: This function is part of the legacy HIL mechanism.
 * Server-side validation is now handled by requiresValidation() in workflow-execution-handler.
 * Per-layer validation triggers when approvalMode: "hil" or unknown tools are in DAG.
 *
 * @param config - Executor configuration
 * @param _layerIdx - Current layer index (unused)
 * @param _layer - Tasks in current layer (unused)
 * @returns true if approval required
 */
export function shouldRequireApproval(
  config: ExecutorConfig,
  _layerIdx: number,
  _layer: unknown[],
): boolean {
  if (!config.hil?.enabled) return false;

  const mode = config.hil.approval_required;
  if (mode === "always") return true;
  if (mode === "never") return false;
  // "critical_only" was based on deprecated sideEffects field
  // Now handled by requiresValidation() server-side using mcp-permissions.yaml
  // Returning false until Phase 4 per-task HIL is implemented
  if (mode === "critical_only") {
    return false;
  }

  return false;
}

/**
 * Generate summary for HIL approval (Story 2.5-3)
 *
 * Template-based summary generation (500-1000 tokens).
 * No LLM call needed for MVP.
 *
 * @param state - Current workflow state
 * @param layerIdx - Completed layer index
 * @param layers - All DAG layers
 * @returns Summary string for human display
 */
export function generateHILSummary(
  state: WorkflowState | null,
  layerIdx: number,
  layers: Array<Array<{ id: string; tool: string; depends_on?: string[] }>>,
): string {
  if (!state) return "Error: State not initialized";

  const completedTasks = state.tasks.filter(
    (t) => t.status === "success",
  ).length;
  const failedTasks = state.tasks.filter((t) => t.status === "error")
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
    ...state.tasks.slice(-3).map((t) =>
      `  - ${t.taskId}: ${t.status} ${
        t.executionTimeMs ? `(${t.executionTimeMs.toFixed(0)}ms)` : ""
      }`
    ),
    `\n## Layer ${layerIdx} Task Details`,
    ...layers[layerIdx].map((t) =>
      `  - Task ID: ${t.id}\n    Tool: ${t.tool}\n    Dependencies: ${
        t.depends_on?.length || 0
      }\n    Status: ${
        state.tasks.find((task) => task.taskId === t.id)?.status ||
        "unknown"
      }`
    ),
  ];

  if (nextLayer) {
    summary.push(
      `\n## Next Layer Preview`,
      `The next layer contains ${nextLayer.length} task(s):`,
      ...nextLayer.slice(0, 5).map((t) =>
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
