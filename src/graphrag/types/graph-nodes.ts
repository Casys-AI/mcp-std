/**
 * Graph Node Types
 *
 * Types for graph node representation (Phase 2a).
 *
 * @module graphrag/types/graph-nodes
 */

/**
 * Graph node type for distinguishing between operations and tools
 *
 * Phase 2a: Separate representation for pure code operations vs MCP tools
 * to enable semantic learning and better SHGAT pattern recognition.
 */
export type GraphNodeType = "intent" | "tool" | "operation" | "capability" | "result";

/**
 * Operation category for pure code operations
 */
export type OperationCategory =
  | "array"
  | "string"
  | "object"
  | "math"
  | "json"
  | "binary"
  | "logical"
  | "bitwise";

/**
 * Base attributes for graph nodes
 */
export interface BaseNodeAttributes {
  name: string;
  serverId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * MCP tool node attributes
 *
 * Represents external tools with side effects (filesystem, network, database, etc.)
 */
export interface ToolNodeAttributes extends BaseNodeAttributes {
  type: "tool";
  /** Server providing this tool (e.g., "github", "filesystem") */
  serverId: string;
}

/**
 * Pure operation node attributes
 *
 * Represents pure JavaScript operations with no side effects (filter, map, reduce, etc.)
 * These operations can be safely fused and learned semantically by SHGAT.
 */
export interface OperationNodeAttributes extends BaseNodeAttributes {
  type: "operation";
  /** Server is always "code" for operations */
  serverId: "code";
  /** Operation category for semantic grouping */
  category: OperationCategory;
  /** All operations are pure (no side effects) */
  pure: true;
}

/**
 * Capability node attributes
 */
export interface CapabilityNodeAttributes extends BaseNodeAttributes {
  type: "capability";
}

/**
 * Union type for all graph node attributes
 */
export type GraphNodeAttributes =
  | ToolNodeAttributes
  | OperationNodeAttributes
  | CapabilityNodeAttributes
  | BaseNodeAttributes; // Fallback for legacy nodes
