/**
 * Execution Learning Module
 *
 * Updates graph relationships from code execution traces.
 * Learns tool dependencies and sequences from observed behavior.
 *
 * @module graphrag/dag/execution-learning
 */

import type { TraceEvent } from "../../sandbox/types.ts";
import type { EdgeType, EdgeSource } from "../algorithms/edge-weights.ts";
import { EDGE_TYPE_WEIGHTS, EDGE_SOURCE_MODIFIERS, OBSERVED_THRESHOLD } from "../algorithms/edge-weights.ts";
import { persistCapabilityDependency } from "../sync/db-sync.ts";
import type { PGliteClient } from "../../db/client.ts";

/**
 * Graph interface for execution learning
 */
export interface ExecutionLearningGraph {
  hasNode(nodeId: string): boolean;
  hasEdge(source: string, target: string): boolean;
  addNode(nodeId: string, attributes: Record<string, unknown>): void;
  addEdge(source: string, target: string, attributes: Record<string, unknown>): void;
  getEdgeAttributes(source: string, target: string): Record<string, unknown>;
  setEdgeAttribute(source: string, target: string, attr: string, value: unknown): void;
}

/**
 * Edge event emitter interface
 */
export interface EdgeEventEmitter {
  emitEdgeCreated(data: {
    fromToolId: string;
    toToolId: string;
    confidenceScore: number;
    observedCount: number;
    edgeType: string;
    edgeSource: string;
  }): void;
  emitEdgeUpdated(data: {
    fromToolId: string;
    toToolId: string;
    oldConfidence: number;
    newConfidence: number;
    observedCount: number;
    edgeType: string;
    edgeSource: string;
  }): void;
}

/**
 * Result of processing execution traces
 */
export interface ExecutionLearningResult {
  nodesCreated: number;
  edgesCreated: number;
  edgesUpdated: number;
}

/**
 * Update graph from code execution traces
 *
 * Processes trace events to:
 * 1. Create nodes for tools and capabilities
 * 2. Create 'contains' edges from parent to child traces
 * 3. Create 'sequence' edges between sibling traces
 *
 * @param graph - Graphology graph instance
 * @param db - Database client for capability persistence
 * @param traces - Array of trace events from code execution
 * @param eventEmitter - Optional event emitter for edge events
 * @returns Statistics about graph updates
 */
export async function updateFromCodeExecution(
  graph: ExecutionLearningGraph,
  db: PGliteClient,
  traces: TraceEvent[],
  eventEmitter?: EdgeEventEmitter
): Promise<ExecutionLearningResult> {
  if (traces.length < 1) {
    return { nodesCreated: 0, edgesCreated: 0, edgesUpdated: 0 };
  }

  const result: ExecutionLearningResult = { nodesCreated: 0, edgesCreated: 0, edgesUpdated: 0 };
  const traceToNode = new Map<string, string>();
  const parentToChildren = new Map<string, string[]>();

  // Phase 1: Create nodes and build parent-child map
  for (const trace of traces) {
    if (trace.type !== "tool_end" && trace.type !== "capability_end") continue;

    const nodeId = trace.type === "tool_end"
      ? (trace as { tool: string }).tool
      : `capability:${(trace as { capabilityId: string }).capabilityId}`;

    traceToNode.set(trace.traceId, nodeId);

    if (trace.parentTraceId) {
      if (!parentToChildren.has(trace.parentTraceId)) {
        parentToChildren.set(trace.parentTraceId, []);
      }
      parentToChildren.get(trace.parentTraceId)!.push(nodeId);
    }

    if (!graph.hasNode(nodeId)) {
      graph.addNode(nodeId, {
        type: trace.type === "tool_end" ? "tool" : "capability",
        name: trace.type === "tool_end"
          ? (trace as { tool: string }).tool
          : (trace as { capability: string }).capability,
      });
      result.nodesCreated++;
    }
  }

  // Phase 2: Create 'contains' edges (parent → child)
  for (const [parentTraceId, children] of parentToChildren) {
    const parentNodeId = traceToNode.get(parentTraceId);
    if (!parentNodeId) continue;

    for (const childNodeId of children) {
      if (parentNodeId === childNodeId) continue;

      const edgeResult = await createOrUpdateEdge(
        graph,
        parentNodeId,
        childNodeId,
        "contains",
        eventEmitter
      );

      if (edgeResult === "created") result.edgesCreated++;
      else if (edgeResult === "updated") result.edgesUpdated++;

      // Persist capability dependencies
      if (parentNodeId.startsWith("capability:") && childNodeId.startsWith("capability:")) {
        await persistCapabilityDependency(
          db,
          parentNodeId.replace("capability:", ""),
          childNodeId.replace("capability:", ""),
          "contains"
        );
      }
    }
  }

  // Phase 3: Create 'sequence' edges (sibling order)
  for (const [_, children] of parentToChildren) {
    for (let i = 0; i < children.length - 1; i++) {
      if (children[i] !== children[i + 1]) {
        const edgeResult = await createOrUpdateEdge(
          graph,
          children[i],
          children[i + 1],
          "sequence",
          eventEmitter
        );

        if (edgeResult === "created") result.edgesCreated++;
        else if (edgeResult === "updated") result.edgesUpdated++;
      }
    }
  }

  return result;
}

/**
 * Create or update an edge with proper weight calculation
 *
 * @param graph - Graph instance
 * @param fromId - Source node ID
 * @param toId - Target node ID
 * @param edgeType - Type of edge (dependency, contains, sequence)
 * @param eventEmitter - Optional event emitter
 * @returns Result of operation
 */
export async function createOrUpdateEdge(
  graph: ExecutionLearningGraph,
  fromId: string,
  toId: string,
  edgeType: EdgeType,
  eventEmitter?: EdgeEventEmitter
): Promise<"created" | "updated" | "none"> {
  const baseWeight = EDGE_TYPE_WEIGHTS[edgeType];

  if (graph.hasEdge(fromId, toId)) {
    const edge = graph.getEdgeAttributes(fromId, toId);
    const newCount = (edge.count as number) + 1;
    let newSource = (edge.edge_source as string) || "inferred";

    if (newCount >= OBSERVED_THRESHOLD && newSource === "inferred") {
      newSource = "observed";
    }

    const sourceModifier = EDGE_SOURCE_MODIFIERS[newSource as EdgeSource] || 0.7;
    const newWeight = baseWeight * sourceModifier;

    graph.setEdgeAttribute(fromId, toId, "count", newCount);
    graph.setEdgeAttribute(fromId, toId, "weight", newWeight);
    graph.setEdgeAttribute(fromId, toId, "edge_type", edgeType);
    graph.setEdgeAttribute(fromId, toId, "edge_source", newSource);

    eventEmitter?.emitEdgeUpdated({
      fromToolId: fromId,
      toToolId: toId,
      oldConfidence: edge.weight as number,
      newConfidence: newWeight,
      observedCount: newCount,
      edgeType,
      edgeSource: newSource,
    });

    return "updated";
  } else {
    const sourceModifier = EDGE_SOURCE_MODIFIERS["inferred"];
    const weight = baseWeight * sourceModifier;

    graph.addEdge(fromId, toId, {
      count: 1,
      weight,
      edge_type: edgeType,
      edge_source: "inferred",
    });

    eventEmitter?.emitEdgeCreated({
      fromToolId: fromId,
      toToolId: toId,
      confidenceScore: weight,
      observedCount: 1,
      edgeType,
      edgeSource: "inferred",
    });

    return "created";
  }
}
