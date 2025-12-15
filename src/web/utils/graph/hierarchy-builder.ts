/**
 * Hierarchy Builder - Transform flat hypergraph to D3 hierarchy
 *
 * Converts HypergraphResponse (flat nodes/edges) to hierarchical structure
 * suitable for radial HEB (Holten's Hierarchical Edge Bundles) visualization.
 *
 * Structure: Root -> Capabilities -> Tools
 *
 * @module web/utils/graph/hierarchy-builder
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Base node in hierarchy */
export interface HierarchyNodeData {
  id: string;
  name: string;
  type: "root" | "capability" | "tool";
}

/** Root node containing all capabilities */
export interface RootNodeData extends HierarchyNodeData {
  type: "root";
  children: CapabilityNodeData[];
}

/** Capability node containing its tools */
export interface CapabilityNodeData extends HierarchyNodeData {
  type: "capability";
  successRate: number;
  usageCount: number;
  codeSnippet?: string;
  /** Spectral/Louvain community cluster ID */
  communityId?: number;
  children: ToolNodeData[];
}

/** Tool node (leaf) */
export interface ToolNodeData extends HierarchyNodeData {
  type: "tool";
  server: string;
  pagerank: number;
  degree: number;
  /** All parent capability IDs (for hyperedges) */
  parentCapabilities: string[];
  /** Primary parent (first in parents array) */
  primaryParent: string;
  /** Spectral/Louvain community cluster ID */
  communityId?: string;
}

/** Edge between capabilities (for cap↔cap bundling) */
export interface CapabilityEdge {
  source: string; // cap-{uuid}
  target: string; // cap-{uuid}
  edgeType: string;
  observedCount: number;
}

/** Edge between tools (sequence/dependency) */
export interface ToolEdge {
  source: string; // tool-id (server:name)
  target: string; // tool-id (server:name)
  edgeType: "sequence" | "dependency" | "contains";
  edgeSource: "template" | "inferred" | "observed";
  observedCount: number;
}

/** Result of hierarchy building */
export interface HierarchyBuildResult {
  /** Hierarchical data for d3.hierarchy() */
  root: RootNodeData;
  /** Edges between capabilities (not in hierarchy) */
  capabilityEdges: CapabilityEdge[];
  /** Edges between tools (sequence/dependency) */
  toolEdges: ToolEdge[];
  /** Tools that were excluded (orphans) */
  orphanTools: ToolNodeData[];
  /** Capabilities without tools (need separate positioning) */
  emptyCapabilities: CapabilityNodeData[];
  /** Stats */
  stats: {
    totalCapabilities: number;
    totalTools: number;
    orphanCount: number;
    hyperedgeCount: number; // Tools with multiple parents
    emptyCapabilityCount: number; // Capabilities without tools
    toolEdgeCount: number; // Tool-to-tool edges
  };
}

/** Input node from API (snake_case) */
interface ApiNode {
  data: {
    id: string;
    type: "capability" | "tool";
    label: string;
    server?: string;
    pagerank?: number;
    degree?: number;
    parents?: string[];
    success_rate?: number;
    usage_count?: number;
    code_snippet?: string;
    /** Spectral/Louvain community cluster ID (for capabilities: number, for tools: string) */
    community_id?: number;
    communityId?: string;
  };
}

/** Input edge from API (snake_case) */
interface ApiEdge {
  data: {
    id: string;
    source: string;
    target: string;
    edge_type: string;
    observed_count?: number;
  };
}

/** API response structure */
export interface HypergraphApiResponse {
  nodes: ApiNode[];
  edges: ApiEdge[];
  capabilities_count: number;
  tools_count: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build hierarchical structure from flat hypergraph API response
 *
 * @param response HypergraphResponse from /api/graph/hypergraph
 * @returns Hierarchical data structure for D3 + metadata
 */
export function buildHierarchy(response: HypergraphApiResponse): HierarchyBuildResult {
  const capabilities = new Map<string, CapabilityNodeData>();
  const tools = new Map<string, ToolNodeData>();
  const capabilityEdges: CapabilityEdge[] = [];
  const toolEdges: ToolEdge[] = [];
  const orphanTools: ToolNodeData[] = [];

  // 1. First pass: Create capability nodes
  for (const node of response.nodes) {
    if (node.data.type === "capability") {
      capabilities.set(node.data.id, {
        id: node.data.id,
        name: node.data.label,
        type: "capability",
        successRate: node.data.success_rate ?? 0,
        usageCount: node.data.usage_count ?? 0,
        codeSnippet: node.data.code_snippet,
        communityId: node.data.community_id,
        children: [],
      });
    }
  }

  // 2. Second pass: Create tool nodes and assign to capabilities
  let hyperedgeCount = 0;

  for (const node of response.nodes) {
    if (node.data.type === "tool") {
      const parents = node.data.parents ?? [];
      const validParents = parents.filter((p) => capabilities.has(p));

      const toolNode: ToolNodeData = {
        id: node.data.id,
        name: node.data.label,
        type: "tool",
        server: node.data.server ?? "unknown",
        pagerank: node.data.pagerank ?? 0,
        degree: node.data.degree ?? 0,
        parentCapabilities: validParents,
        primaryParent: validParents[0] ?? "",
        communityId: node.data.communityId,
      };

      tools.set(node.data.id, toolNode);

      if (validParents.length === 0) {
        // Orphan tool - no valid capability parent
        orphanTools.push(toolNode);
      } else {
        // Add to primary parent's children
        const primaryCap = capabilities.get(validParents[0]);
        if (primaryCap) {
          primaryCap.children.push(toolNode);
        }

        // Track hyperedges (tools with multiple parents)
        if (validParents.length > 1) {
          hyperedgeCount++;
        }
      }
    }
  }

  // 3. Extract edges (capability↔capability and tool↔tool)
  for (const edge of response.edges) {
    const sourceId = edge.data.source;
    const targetId = edge.data.target;

    // Capability-to-capability edges
    if (capabilities.has(sourceId) && capabilities.has(targetId)) {
      capabilityEdges.push({
        source: sourceId,
        target: targetId,
        edgeType: edge.data.edge_type,
        observedCount: edge.data.observed_count ?? 1,
      });
    }
    // Tool-to-tool edges (sequence, dependency, contains)
    else if (tools.has(sourceId) && tools.has(targetId)) {
      const edgeType = edge.data.edge_type as "sequence" | "dependency" | "contains";
      // Only include sequence and dependency (contains is implicit in hierarchy)
      if (edgeType === "sequence" || edgeType === "dependency") {
        toolEdges.push({
          source: sourceId,
          target: targetId,
          edgeType,
          edgeSource: (edge.data as any).edge_source ?? "inferred",
          observedCount: edge.data.observed_count ?? 1,
        });
      }
    }
  }

  // 4. Separate capabilities with and without tools
  const allCaps = Array.from(capabilities.values());
  const capsWithChildren = allCaps.filter((cap) => cap.children.length > 0);
  const emptyCapabilities = allCaps.filter((cap) => cap.children.length === 0);

  // 5. Build root node with capabilities that have tools
  // D3.cluster requires leaf nodes - empty caps will be positioned separately
  const root: RootNodeData = {
    id: "root",
    name: "Capabilities",
    type: "root",
    children: capsWithChildren,
  };

  // 6. Keep ALL capability edges (even for empty caps - they'll be positioned)
  const allCapIds = new Set(allCaps.map((c) => c.id));
  const filteredCapEdges = capabilityEdges.filter(
    (e) => allCapIds.has(e.source) && allCapIds.has(e.target),
  );

  return {
    root,
    capabilityEdges: filteredCapEdges,
    toolEdges,
    orphanTools,
    emptyCapabilities,
    stats: {
      totalCapabilities: allCaps.length,
      totalTools: tools.size - orphanTools.length,
      orphanCount: orphanTools.length,
      hyperedgeCount,
      emptyCapabilityCount: emptyCapabilities.length,
      toolEdgeCount: toolEdges.length,
    },
  };
}

/**
 * Get all hyperedges (tools with multiple parent capabilities)
 * Used for drawing additional edges in the visualization
 *
 * @param root Hierarchy root node
 * @returns Array of {toolId, capabilityIds} for tools with >1 parent
 */
export function getHyperedges(
  root: RootNodeData,
): Array<{ toolId: string; capabilityIds: string[] }> {
  const hyperedges: Array<{ toolId: string; capabilityIds: string[] }> = [];

  for (const cap of root.children) {
    for (const tool of cap.children) {
      if (tool.parentCapabilities.length > 1) {
        hyperedges.push({
          toolId: tool.id,
          capabilityIds: tool.parentCapabilities,
        });
      }
    }
  }

  return hyperedges;
}
