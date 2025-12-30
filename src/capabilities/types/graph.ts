/**
 * Graph visualization types for capability hypergraph
 *
 * Types for D3.js visualization of capabilities and tools.
 * Story 8.1, 8.2: Hypergraph visualization.
 *
 * @module capabilities/types/graph
 */

import type { CapabilityToolInvocation } from "./capability.ts";
import type { ExecutionTrace } from "./execution.ts";

/**
 * Options for building hypergraph data (internal camelCase)
 */
export interface HypergraphOptions {
  /** Include standalone tools not in capabilities */
  includeTools?: boolean;
  /** Include orphan tools (no parent capabilities). Default: true for backward compat */
  includeOrphans?: boolean;
  /** Filter capabilities by minimum success rate */
  minSuccessRate?: number;
  /** Filter capabilities by minimum usage */
  minUsage?: number;
  /**
   * Include execution traces for each capability (Story 11.4)
   * When true, each capability node includes up to 10 recent traces
   */
  includeTraces?: boolean;
}

/**
 * Graph node for capability (parent node in compound graph)
 * Internal camelCase - maps to snake_case at API boundary
 * Note: Previously named CytoscapeNode, renamed after D3.js migration
 */
export interface CapabilityNode {
  data: {
    id: string; // "cap-{uuid}"
    type: "capability";
    label: string; // Name or intent preview
    /** Full description/intent of the capability */
    description?: string;
    codeSnippet: string;
    successRate: number;
    usageCount: number;
    toolsCount: number; // Number of child tools
    pagerank: number; // Hypergraph PageRank score (0-1)
    /** Community/cluster ID from spectral clustering (Story 8.2) */
    communityId?: number;
    /** Fully qualified domain name (Story 8.2) */
    fqdn?: string;
    toolsUsed?: string[]; // Unique tools (deduplicated)
    toolInvocations?: CapabilityToolInvocation[]; // Full sequence with timestamps (for invocation mode)
    /** Execution traces (Story 11.4) - included when includeTraces=true */
    traces?: ExecutionTrace[];
    /** Last used timestamp (ISO format) for timeline sorting */
    lastUsed?: string;
    /** Parent capability ID for nested compound nodes (Story 10.1) */
    parent?: string;
    /** Hierarchy level: 0=leaf, 1+=contains other capabilities (Story 10.1) */
    hierarchyLevel?: number;
  };
}

/**
 * Graph node for tool (child of capability or standalone)
 * Internal camelCase - maps to snake_case at API boundary
 * Note: Previously named CytoscapeNode, renamed after D3.js migration
 *
 * Story 8.2: Changed from `parent?: string` to `parents: string[]`
 * to support hyperedges (tool belonging to multiple capabilities).
 */
export interface ToolNode {
  data: {
    id: string; // "filesystem:read"
    /** @deprecated Use `parents` instead. Kept for backward compatibility. */
    parent?: string; // Single parent (legacy)
    /** Parent capability IDs - supports hyperedges (multi-parent). Empty array for standalone tools. */
    parents: string[]; // ["cap-uuid-1", "cap-uuid-2"] or [] for standalone
    type: "tool";
    server: string; // "filesystem"
    label: string; // "read"
    pagerank: number; // From GraphSnapshot
    degree: number; // From GraphSnapshot
    /** Louvain community ID for clustering visualization */
    communityId?: string;
  };
}

/**
 * Graph node for tool invocation (individual call within a capability)
 * Unlike ToolNode which is deduplicated, this represents each call to a tool.
 * Enables sequence visualization and parallelism detection.
 */
export interface ToolInvocationNode {
  data: {
    id: string; // "filesystem:read_file#0"
    /** Parent capability ID */
    parent: string; // "cap-uuid"
    type: "tool_invocation";
    /** The underlying tool ID */
    tool: string; // "filesystem:read_file"
    server: string; // "filesystem"
    label: string; // "read_file #1"
    /** Timestamp when invocation started (ms since epoch) */
    ts: number;
    /** Execution duration in milliseconds */
    durationMs: number;
    /** Sequence index within capability (0-based) */
    sequenceIndex: number;
  };
}

/**
 * Edge connecting sequential tool invocations within a capability
 * Shows execution order between invocations.
 */
export interface SequenceEdge {
  data: {
    id: string;
    source: string; // "filesystem:read_file#0"
    target: string; // "filesystem:read_file#1"
    edgeType: "sequence";
    /** Time delta between invocations in ms (negative = parallel) */
    timeDeltaMs: number;
    /** Whether invocations overlap in time (parallel execution) */
    isParallel: boolean;
  };
}

/**
 * Graph edge between capabilities that share tools
 * Internal camelCase - maps to snake_case at API boundary
 * Note: Previously named CytoscapeEdge, renamed after D3.js migration
 */
export interface CapabilityEdge {
  data: {
    id: string;
    source: string; // "cap-{uuid1}"
    target: string; // "cap-{uuid2}"
    sharedTools: number; // Count of shared tools
    edgeType: "capability_link";
    edgeSource: "inferred";
  };
}

/**
 * Hierarchical edge (capability → tool via parentTraceId, ADR-041)
 * Internal camelCase - maps to snake_case at API boundary
 */
export interface HierarchicalEdge {
  data: {
    id: string;
    source: string; // "cap-{uuid}" (parent)
    target: string; // "filesystem:read" (child tool)
    edgeType: "hierarchy";
    edgeSource: "observed"; // From trace data
    observedCount: number; // Number of times this call was traced
  };
}

/**
 * Tech-spec: Capability-to-capability dependency edge (hyperedge)
 * Represents relationships between capabilities in the hypergraph
 * Story 10.3: Added "provides" for data flow relationships
 */
export interface CapabilityDependencyEdge {
  data: {
    id: string;
    source: string; // "cap-{uuid1}"
    target: string; // "cap-{uuid2}"
    edgeType: "contains" | "sequence" | "dependency" | "alternative" | "provides";
    edgeSource: "template" | "inferred" | "observed";
    observedCount: number;
  };
}

/**
 * Union type for all graph nodes
 * @deprecated Use GraphNode instead. Kept for backward compatibility.
 */
export type CytoscapeNode = CapabilityNode | ToolNode | ToolInvocationNode;

/**
 * Union type for all graph edges
 * @deprecated Use GraphEdge instead. Kept for backward compatibility.
 */
export type CytoscapeEdge =
  | CapabilityEdge
  | HierarchicalEdge
  | CapabilityDependencyEdge
  | SequenceEdge;

/**
 * Union type for all graph nodes (D3.js visualization)
 */
export type GraphNode = CapabilityNode | ToolNode | ToolInvocationNode;

/**
 * Union type for all graph edges (D3.js visualization)
 */
export type GraphEdge = CapabilityEdge | HierarchicalEdge | CapabilityDependencyEdge | SequenceEdge;

/**
 * Hull zone metadata for capability visualization (Story 8.2)
 * Each capability is rendered as a convex hull around its tools
 */
export interface CapabilityZone {
  /** Capability ID (cap-{uuid}) */
  id: string;
  /** Display label */
  label: string;
  /** Zone color (hex) */
  color: string;
  /** Opacity (0-1) for overlapping zones */
  opacity: number;
  /** Tool IDs contained in this zone */
  toolIds: string[];
  /** Padding around tools in px */
  padding: number;
  /** Minimum hull radius */
  minRadius: number;
}

/**
 * Response from buildHypergraphData (internal camelCase)
 * Maps to snake_case at API boundary in gateway-server.ts
 */
export interface HypergraphResponseInternal {
  nodes: CytoscapeNode[];
  edges: CytoscapeEdge[];
  /** Hull zone metadata for D3.js hull rendering (Story 8.2) */
  capabilityZones?: CapabilityZone[];
  capabilitiesCount: number;
  toolsCount: number;
  metadata: {
    generatedAt: string;
    version: string;
  };
}
