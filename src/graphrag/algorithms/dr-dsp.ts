/**
 * DR-DSP (Directed Relationship Dynamic Shortest Path)
 *
 * POC implementation of shortest hyperpath algorithm for directed hypergraphs.
 * Based on Gallo et al. (1993) B-visit algorithm + dynamic extensions from
 * Ausiello et al. (2012) DR-DSP.
 *
 * Key concepts:
 * - Hyperedge: Connects multiple source nodes to multiple target nodes
 * - Hyperpath: Sequence of hyperedges where consecutive ones share at least one node
 * - B-arc (backward arc): (head, tail_set) where head is the target, tail_set are sources
 *
 * Complexity:
 * - General hypergraph: NP-hard
 * - DAG (acyclic): O(|V| + |E| × max_tail_size) - polynomial!
 *
 * @module graphrag/algorithms/dr-dsp
 */

import { getLogger } from "../../telemetry/logger.ts";

const _log = getLogger("default");
void _log; // Mark as intentionally unused for now

// ============================================================================
// Types
// ============================================================================

/**
 * Node types in the hypergraph (aligned with SHGAT)
 */
export type NodeType = "tool" | "capability";

/**
 * Hyperedge types for different relationships
 */
export type HyperedgeType =
  | "contains"    // capability contains tools/sub-capabilities
  | "sequence"    // cap/tool followed by another (temporal)
  | "provides"    // output of one feeds into another
  | "cooccurrence"; // frequently used together

/**
 * A node in the hypergraph (tool or capability)
 */
export interface HypergraphNode {
  id: string;
  type: NodeType;
  /** Hierarchy level (0 = tool, 1+ = capability) */
  hierarchyLevel: number;
  /** Optional embedding for scoring */
  embedding?: number[];
  /** Success rate for capabilities */
  successRate?: number;
}

/**
 * A hyperedge connecting multiple sources to multiple targets
 * Now supports both tools and capabilities as nodes
 */
export interface Hyperedge {
  id: string;
  /** Source nodes (prerequisites) - can be tools or capabilities */
  sources: string[];
  /** Target nodes (what this edge provides) - can be tools or capabilities */
  targets: string[];
  /** Weight/cost of traversing this hyperedge */
  weight: number;
  /** Type of relationship */
  edgeType?: HyperedgeType;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result of a hyperpath search
 */
export interface HyperpathResult {
  /** Sequence of hyperedge IDs forming the path */
  path: string[];
  /** Full hyperedge objects in order */
  hyperedges: Hyperedge[];
  /** Total path weight (sum of hyperedge weights) */
  totalWeight: number;
  /** Sequence of nodes visited */
  nodeSequence: string[];
  /** Whether a valid path was found */
  found: boolean;
}

/**
 * B-tree node for backward traversal
 */
interface BTreeNode {
  nodeId: string;
  distance: number;
  /** Hyperedge that leads to this node */
  viaHyperedge: string | null;
  /** Parent nodes in the B-tree */
  parents: string[];
}

/**
 * Dynamic update for incremental path computation
 */
export interface DynamicUpdate {
  type: "weight_increase" | "weight_decrease" | "edge_add" | "edge_remove";
  hyperedgeId: string;
  newWeight?: number;
  newEdge?: Hyperedge;
}

// ============================================================================
// DR-DSP Implementation
// ============================================================================

/**
 * DR-DSP Algorithm
 *
 * Finds shortest hyperpaths in directed hypergraphs.
 * Now aligned with SHGAT: both tools and capabilities are nodes.
 */
export class DRDSP {
  private hyperedges: Map<string, Hyperedge> = new Map();
  private nodeToIncomingEdges: Map<string, Set<string>> = new Map();
  private nodeToOutgoingEdges: Map<string, Set<string>> = new Map();

  // Explicit node tracking (aligned with SHGAT)
  private nodes: Map<string, HypergraphNode> = new Map();

  // B-tree for shortest path tracking
  private bTree: Map<string, BTreeNode> = new Map();

  constructor(hyperedges: Hyperedge[] = []) {
    for (const edge of hyperedges) {
      this.addHyperedge(edge);
    }
  }

  // ==========================================================================
  // Node Management (aligned with SHGAT)
  // ==========================================================================

  /**
   * Register a tool as a node
   */
  registerTool(id: string, embedding?: number[]): void {
    this.nodes.set(id, {
      id,
      type: "tool",
      hierarchyLevel: 0,
      embedding,
    });
  }

  /**
   * Register a capability as a node
   */
  registerCapability(
    id: string,
    options: {
      hierarchyLevel?: number;
      embedding?: number[];
      successRate?: number;
    } = {},
  ): void {
    this.nodes.set(id, {
      id,
      type: "capability",
      hierarchyLevel: options.hierarchyLevel ?? 1,
      embedding: options.embedding,
      successRate: options.successRate,
    });
  }

  /**
   * Check if a node exists
   */
  hasNode(id: string): boolean {
    return this.nodes.has(id);
  }

  /**
   * Get node by ID
   */
  getNode(id: string): HypergraphNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Get all nodes of a specific type
   */
  getNodesByType(type: NodeType): HypergraphNode[] {
    return Array.from(this.nodes.values()).filter((n) => n.type === type);
  }

  /**
   * Get all capability nodes
   */
  getCapabilityNodes(): Map<string, HypergraphNode> {
    const caps = new Map<string, HypergraphNode>();
    for (const [id, node] of this.nodes) {
      if (node.type === "capability") {
        caps.set(id, node);
      }
    }
    return caps;
  }

  /**
   * Get all tool nodes
   */
  getToolNodes(): Map<string, HypergraphNode> {
    const tools = new Map<string, HypergraphNode>();
    for (const [id, node] of this.nodes) {
      if (node.type === "tool") {
        tools.set(id, node);
      }
    }
    return tools;
  }

  /**
   * Add a hyperedge to the graph
   */
  addHyperedge(edge: Hyperedge): void {
    this.hyperedges.set(edge.id, edge);

    // Index by target nodes (incoming)
    for (const target of edge.targets) {
      if (!this.nodeToIncomingEdges.has(target)) {
        this.nodeToIncomingEdges.set(target, new Set());
      }
      this.nodeToIncomingEdges.get(target)!.add(edge.id);
    }

    // Index by source nodes (outgoing)
    for (const source of edge.sources) {
      if (!this.nodeToOutgoingEdges.has(source)) {
        this.nodeToOutgoingEdges.set(source, new Set());
      }
      this.nodeToOutgoingEdges.get(source)!.add(edge.id);
    }
  }

  /**
   * Remove a hyperedge from the graph
   */
  removeHyperedge(edgeId: string): void {
    const edge = this.hyperedges.get(edgeId);
    if (!edge) return;

    // Remove from indices
    for (const target of edge.targets) {
      this.nodeToIncomingEdges.get(target)?.delete(edgeId);
    }
    for (const source of edge.sources) {
      this.nodeToOutgoingEdges.get(source)?.delete(edgeId);
    }

    this.hyperedges.delete(edgeId);
  }

  /**
   * Find shortest hyperpath from source to target
   *
   * Uses B-visit algorithm (backward traversal from target)
   */
  findShortestHyperpath(source: string, target: string): HyperpathResult {
    // Reset B-tree
    this.bTree.clear();

    // Initialize target with distance 0
    this.bTree.set(target, {
      nodeId: target,
      distance: 0,
      viaHyperedge: null,
      parents: [],
    });

    // Priority queue for Dijkstra-like processing (min-heap by distance)
    const queue: Array<{ nodeId: string; distance: number }> = [{ nodeId: target, distance: 0 }];
    const visited = new Set<string>();

    while (queue.length > 0) {
      // Extract min
      queue.sort((a, b) => a.distance - b.distance);
      const current = queue.shift()!;

      if (visited.has(current.nodeId)) continue;
      visited.add(current.nodeId);

      // Check if we reached the source
      if (current.nodeId === source) {
        return this.reconstructPath(source, target);
      }

      // Get incoming hyperedges (edges where this node is a target)
      const incomingEdges = this.nodeToIncomingEdges.get(current.nodeId) || new Set();

      for (const edgeId of incomingEdges) {
        const edge = this.hyperedges.get(edgeId)!;

        // For B-visit: we need ALL sources of this edge to be reachable
        // In DAG case, we can relax this to "at least one source"
        const newDistance = current.distance + edge.weight;

        // Update all source nodes
        for (const sourceNode of edge.sources) {
          const existing = this.bTree.get(sourceNode);

          if (!existing || newDistance < existing.distance) {
            this.bTree.set(sourceNode, {
              nodeId: sourceNode,
              distance: newDistance,
              viaHyperedge: edgeId,
              parents: edge.targets,
            });

            if (!visited.has(sourceNode)) {
              queue.push({ nodeId: sourceNode, distance: newDistance });
            }
          }
        }
      }
    }

    // No path found
    return {
      path: [],
      hyperedges: [],
      totalWeight: Infinity,
      nodeSequence: [],
      found: false,
    };
  }

  /**
   * Reconstruct the path from B-tree
   */
  private reconstructPath(source: string, target: string): HyperpathResult {
    const path: string[] = [];
    const hyperedges: Hyperedge[] = [];
    const nodeSequence: string[] = [source];

    let current = source;
    const visited = new Set<string>();

    while (current !== target && !visited.has(current)) {
      visited.add(current);
      const node = this.bTree.get(current);

      if (!node || !node.viaHyperedge) {
        // Check if we can reach target directly
        if (current === target) break;

        // Try to find path through parents
        const outgoing = this.nodeToOutgoingEdges.get(current);
        if (outgoing) {
          for (const edgeId of outgoing) {
            const edge = this.hyperedges.get(edgeId)!;
            // Check if any target is closer to destination
            for (const t of edge.targets) {
              const tNode = this.bTree.get(t);
              if (tNode && tNode.distance < (this.bTree.get(current)?.distance ?? Infinity)) {
                path.push(edgeId);
                hyperedges.push(edge);
                nodeSequence.push(t);
                current = t;
                break;
              }
            }
            if (current !== node?.nodeId) break;
          }
        }
        if (current === node?.nodeId) break;
      } else {
        path.push(node.viaHyperedge);
        const edge = this.hyperedges.get(node.viaHyperedge)!;
        hyperedges.push(edge);

        // Move to one of the targets (preferring the one closer to destination)
        let nextNode = node.parents[0];
        let minDist = Infinity;
        for (const parent of node.parents) {
          const pNode = this.bTree.get(parent);
          if (pNode && pNode.distance < minDist) {
            minDist = pNode.distance;
            nextNode = parent;
          }
        }
        nodeSequence.push(nextNode);
        current = nextNode;
      }
    }

    const totalWeight = hyperedges.reduce((sum, e) => sum + e.weight, 0);

    return {
      path,
      hyperedges,
      totalWeight,
      nodeSequence,
      found: current === target || nodeSequence.includes(target),
    };
  }

  /**
   * Dynamic update: handle weight change or edge modification
   *
   * DR-DSP is optimized for updates that affect shortest paths.
   * Instead of recomputing from scratch, we update incrementally.
   */
  applyUpdate(update: DynamicUpdate): void {
    switch (update.type) {
      case "weight_increase":
      case "weight_decrease": {
        const edge = this.hyperedges.get(update.hyperedgeId);
        if (edge && update.newWeight !== undefined) {
          edge.weight = update.newWeight;
        }
        break;
      }
      case "edge_add": {
        if (update.newEdge) {
          this.addHyperedge(update.newEdge);
        }
        break;
      }
      case "edge_remove": {
        this.removeHyperedge(update.hyperedgeId);
        break;
      }
    }

    // Note: In a full implementation, we would incrementally update
    // the B-tree rather than requiring a full recomputation.
    // For POC, we clear the cached tree.
    this.bTree.clear();
  }

  /**
   * Find all shortest hyperpaths from source to all reachable nodes
   * (SSSP - Single Source Shortest Path)
   */
  findAllShortestPaths(source: string): Map<string, HyperpathResult> {
    const results = new Map<string, HyperpathResult>();
    const allNodes = new Set<string>();

    // Collect all nodes
    for (const edge of this.hyperedges.values()) {
      for (const node of [...edge.sources, ...edge.targets]) {
        allNodes.add(node);
      }
    }

    // Find path to each node
    for (const target of allNodes) {
      if (target !== source) {
        const result = this.findShortestHyperpath(source, target);
        if (result.found) {
          results.set(target, result);
        }
      }
    }

    return results;
  }

  /**
   * Get graph statistics
   */
  getStats(): {
    hyperedgeCount: number;
    nodeCount: number;
    avgHyperedgeSize: number;
  } {
    const nodes = new Set<string>();
    let totalSize = 0;

    for (const edge of this.hyperedges.values()) {
      for (const node of [...edge.sources, ...edge.targets]) {
        nodes.add(node);
      }
      totalSize += edge.sources.length + edge.targets.length;
    }

    return {
      hyperedgeCount: this.hyperedges.size,
      nodeCount: nodes.size,
      avgHyperedgeSize: this.hyperedges.size > 0 ? totalSize / this.hyperedges.size : 0,
    };
  }

}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert capability data to hyperedges
 *
 * A capability is a hyperedge where:
 * - sources = prerequisite tools (from provides edges)
 * - targets = tools that this capability enables
 */
export function capabilityToHyperedge(
  capabilityId: string,
  toolsUsed: string[],
  staticEdges?: Array<{ from: string; to: string; type: string }>,
  successRate: number = 1.0,
): Hyperedge {
  // If we have static structure, use provides edges
  if (staticEdges && staticEdges.length > 0) {
    const providesEdges = staticEdges.filter((e) => e.type === "provides");
    const sources = new Set<string>();
    const targets = new Set<string>();

    for (const edge of providesEdges) {
      sources.add(edge.from);
      targets.add(edge.to);
    }

    // If no provides edges, treat all tools as both sources and targets
    if (sources.size === 0) {
      return {
        id: capabilityId,
        sources: toolsUsed.slice(0, Math.ceil(toolsUsed.length / 2)),
        targets: toolsUsed.slice(Math.ceil(toolsUsed.length / 2)),
        weight: 1 / successRate, // Lower weight = better
      };
    }

    return {
      id: capabilityId,
      sources: Array.from(sources),
      targets: Array.from(targets),
      weight: 1 / successRate,
    };
  }

  // Default: first half are sources, second half are targets
  const mid = Math.ceil(toolsUsed.length / 2);
  return {
    id: capabilityId,
    sources: toolsUsed.slice(0, mid),
    targets: toolsUsed.slice(mid),
    weight: 1 / successRate,
  };
}

/**
 * Build DR-DSP from capability store data (legacy - tools as nodes only)
 * @deprecated Use buildDRDSPAligned for the new model
 */
export function buildDRDSPFromCapabilities(
  capabilities: Array<{
    id: string;
    toolsUsed: string[];
    staticEdges?: Array<{ from: string; to: string; type: string }>;
    successRate?: number;
  }>,
): DRDSP {
  const drdsp = new DRDSP();

  for (const cap of capabilities) {
    const hyperedge = capabilityToHyperedge(
      cap.id,
      cap.toolsUsed,
      cap.staticEdges,
      cap.successRate ?? 1.0,
    );
    drdsp.addHyperedge(hyperedge);
  }

  return drdsp;
}

/**
 * Capability input for aligned DR-DSP (matches SHGAT structure)
 */
export interface AlignedCapabilityInput {
  id: string;
  /** Tools this capability uses */
  toolsUsed: string[];
  /** Child capabilities (for meta-capabilities) */
  children?: string[];
  /** Parent capabilities (contains relationship) */
  parents?: string[];
  /** Hierarchy level (0 = uses only tools, 1+ = has child capabilities) */
  hierarchyLevel?: number;
  /** Success rate for weighting */
  successRate?: number;
  /** Optional embedding */
  embedding?: number[];
}

/**
 * Tool input for aligned DR-DSP
 */
export interface AlignedToolInput {
  id: string;
  embedding?: number[];
}

/**
 * Build DR-DSP aligned with SHGAT model
 *
 * Creates:
 * - Tool nodes (level 0)
 * - Capability nodes (level 1+)
 * - "contains" hyperedges: capability → tools/sub-capabilities
 * - "sequence" hyperedges: based on co-occurrence patterns
 */
export function buildDRDSPAligned(
  tools: AlignedToolInput[],
  capabilities: AlignedCapabilityInput[],
  cooccurrences?: Array<{ from: string; to: string; weight: number }>,
): DRDSP {
  const drdsp = new DRDSP();

  // 1. Register all tools as nodes
  for (const tool of tools) {
    drdsp.registerTool(tool.id, tool.embedding);
  }

  // 2. Register all capabilities as nodes
  for (const cap of capabilities) {
    drdsp.registerCapability(cap.id, {
      hierarchyLevel: cap.hierarchyLevel ?? (cap.children?.length ? 1 : 0),
      embedding: cap.embedding,
      successRate: cap.successRate,
    });
  }

  // 3. Create "contains" hyperedges (capability → members)
  for (const cap of capabilities) {
    const members: string[] = [];

    // Add tools
    if (cap.toolsUsed) {
      members.push(...cap.toolsUsed);
    }

    // Add child capabilities
    if (cap.children) {
      members.push(...cap.children);
    }

    if (members.length > 0) {
      // Hyperedge: capability contains its members
      // source = capability, targets = members (tools/sub-caps)
      drdsp.addHyperedge({
        id: `contains:${cap.id}`,
        sources: [cap.id],
        targets: members,
        weight: 1 / (cap.successRate ?? 1.0),
        edgeType: "contains",
      });

      // Reverse edge: members can invoke parent capability
      // This allows paths like: tool → capability → tool
      drdsp.addHyperedge({
        id: `invokes:${cap.id}`,
        sources: members,
        targets: [cap.id],
        weight: 1 / (cap.successRate ?? 1.0),
        edgeType: "provides",
      });
    }
  }

  // 4. Create "sequence" hyperedges from co-occurrence data
  if (cooccurrences) {
    for (const cooc of cooccurrences) {
      drdsp.addHyperedge({
        id: `seq:${cooc.from}:${cooc.to}`,
        sources: [cooc.from],
        targets: [cooc.to],
        weight: cooc.weight,
        edgeType: "sequence",
      });
    }
  }

  // 5. Create parent→child edges for meta-capabilities
  for (const cap of capabilities) {
    if (cap.parents) {
      for (const parentId of cap.parents) {
        // Parent capability can use this child
        drdsp.addHyperedge({
          id: `child:${parentId}:${cap.id}`,
          sources: [parentId],
          targets: [cap.id],
          weight: 0.5, // Low weight = preferred path
          edgeType: "contains",
        });
      }
    }
  }

  return drdsp;
}
