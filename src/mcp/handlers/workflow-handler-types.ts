/**
 * Workflow Handler Types
 *
 * Shared types for workflow execution handlers.
 *
 * @module mcp/handlers/workflow-handler-types
 */

import type { PGliteClient } from "../../db/client.ts";
import type { GraphRAGEngine } from "../../graphrag/graph-engine.ts";
import type { DAGSuggester } from "../../graphrag/dag-suggester.ts";
import type { CapabilityStore } from "../../capabilities/capability-store.ts";
import type { MCPClientBase } from "../types.ts";
import type { ActiveWorkflow } from "../server/types.ts";
import type { GatewayHandler } from "../gateway-handler.ts";
import type { CheckpointManager } from "../../dag/checkpoint-manager.ts";
import type { AdaptiveThresholdManager } from "../adaptive-threshold.ts";

/**
 * Dependencies required for workflow handler
 */
export interface WorkflowHandlerDependencies {
  db: PGliteClient;
  graphEngine: GraphRAGEngine;
  dagSuggester: DAGSuggester;
  capabilityStore?: CapabilityStore;
  mcpClients: Map<string, MCPClientBase>;
  gatewayHandler: GatewayHandler;
  checkpointManager: CheckpointManager | null;
  activeWorkflows: Map<string, ActiveWorkflow>;
  /** Story 10.7c: Thompson Sampling threshold manager (optional) */
  adaptiveThresholdManager?: AdaptiveThresholdManager;
}
