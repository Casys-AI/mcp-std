/**
 * Graph API Data Mappers
 *
 * Transforms internal graph data structures to snake_case external API format.
 *
 * @module api/graph-mappers
 */

import type {
  CapabilityNode,
  GraphEdge,
  GraphNode,
  SequenceEdge,
  ToolInvocationNode,
} from "../capabilities/types.ts";
import { toolsByCategory } from "../../lib/std/mod.ts";

// Build lookup: tool name -> category (module) for std tools
const stdToolCategoryMap = new Map<string, string>();
for (const [category, tools] of Object.entries(toolsByCategory)) {
  for (const tool of tools) {
    stdToolCategoryMap.set(tool.name, category);
  }
}

/**
 * Map node data to snake_case for external API
 */
export function mapNodeData(node: GraphNode): Record<string, unknown> {
  if (node.data.type === "capability") {
    const capNode = node as CapabilityNode;
    return {
      data: {
        id: node.data.id,
        type: node.data.type,
        label: node.data.label,
        description: capNode.data.description,
        parent: node.data.parent,
        code_snippet: node.data.codeSnippet,
        success_rate: node.data.successRate,
        usage_count: node.data.usageCount,
        tools_count: node.data.toolsCount,
        pagerank: capNode.data.pagerank,
        community_id: capNode.data.communityId,
        fqdn: capNode.data.fqdn,
        tools_used: capNode.data.toolsUsed,
        hierarchy_level: capNode.data.hierarchyLevel ?? 0,
        tool_invocations: capNode.data.toolInvocations?.map((inv) => ({
          id: inv.id,
          tool: inv.tool,
          ts: inv.ts,
          duration_ms: inv.durationMs,
          sequence_index: inv.sequenceIndex,
        })),
        traces: capNode.data.traces?.map((trace) => ({
          id: trace.id,
          capability_id: trace.capabilityId,
          executed_at: trace.executedAt instanceof Date
            ? trace.executedAt.toISOString()
            : trace.executedAt,
          success: trace.success,
          duration_ms: trace.durationMs,
          error_message: trace.errorMessage,
          priority: trace.priority,
          task_results: trace.taskResults.map((r) => ({
            task_id: r.taskId,
            tool: r.tool,
            resolved_tool: r.resolvedTool,
            args: r.args,
            result: r.result,
            success: r.success,
            duration_ms: r.durationMs,
            layer_index: r.layerIndex,
            loop_id: r.loopId,
            loop_type: r.loopType,
            loop_condition: r.loopCondition,
            body_tools: r.bodyTools,
            is_capability_call: r.isCapabilityCall,
            nested_tools: r.nestedTools,
          })),
        })),
      },
    };
  } else if (node.data.type === "tool_invocation") {
    const invNode = node as ToolInvocationNode;
    return {
      data: {
        id: invNode.data.id,
        parent: invNode.data.parent,
        type: invNode.data.type,
        tool: invNode.data.tool,
        server: invNode.data.server,
        label: invNode.data.label,
        ts: invNode.data.ts,
        duration_ms: invNode.data.durationMs,
        sequence_index: invNode.data.sequenceIndex,
      },
    };
  } else {
    // Tool node - add module for std tools
    const toolName = node.data.label;
    const module = node.data.server === "std" ? stdToolCategoryMap.get(toolName) : undefined;

    return {
      data: {
        id: node.data.id,
        parent: node.data.parent,
        parents: node.data.parents,
        type: node.data.type,
        server: node.data.server,
        module,
        label: node.data.label,
        pagerank: node.data.pagerank,
        degree: node.data.degree,
        community_id: node.data.communityId,
      },
    };
  }
}

/**
 * Map edge data to snake_case for external API
 */
export function mapEdgeData(edge: GraphEdge): Record<string, unknown> {
  if (edge.data.edgeType === "capability_link") {
    return {
      data: {
        id: edge.data.id,
        source: edge.data.source,
        target: edge.data.target,
        shared_tools: edge.data.sharedTools,
        edge_type: edge.data.edgeType,
        edge_source: edge.data.edgeSource,
      },
    };
  } else if (edge.data.edgeType === "sequence") {
    const seqEdge = edge as SequenceEdge;
    return {
      data: {
        id: seqEdge.data.id,
        source: seqEdge.data.source,
        target: seqEdge.data.target,
        edge_type: seqEdge.data.edgeType,
        time_delta_ms: seqEdge.data.timeDeltaMs,
        is_parallel: seqEdge.data.isParallel,
      },
    };
  } else {
    return {
      data: {
        id: edge.data.id,
        source: edge.data.source,
        target: edge.data.target,
        edge_type: edge.data.edgeType,
        edge_source: edge.data.edgeSource,
        observed_count: edge.data.observedCount,
      },
    };
  }
}
