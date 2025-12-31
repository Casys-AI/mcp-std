/**
 * Capability Use Case Types
 *
 * Shared types for capability-related use cases.
 *
 * @module application/use-cases/capabilities/types
 */

// Re-export shared types
export type { UseCaseError, UseCaseResult } from "../shared/types.ts";

// ============================================================================
// Capability Info
// ============================================================================

/**
 * Capability summary for search results
 *
 * Contains all fields needed by MCP handlers for API responses.
 */
export interface CapabilitySummary {
  id: string;
  name: string;
  displayName: string;
  description: string;
  /** Final score (semantic * reliability) */
  score: number;
  /** Raw semantic similarity score (0-1) */
  semanticScore: number;
  usageCount: number;
  successRate: number;
  /** TypeScript code snippet */
  codeSnippet?: string;
  /** JSON Schema for parameters (unknown for Clean Architecture compatibility) */
  parametersSchema?: unknown;
}

// ============================================================================
// Search Capabilities
// ============================================================================

/**
 * Request to search for capabilities
 */
export interface SearchCapabilitiesRequest {
  /** Natural language query */
  query: string;
  /** Maximum results to return */
  limit?: number;
  /** Minimum score threshold (0-1) */
  minScore?: number;
  /** Filter by visibility */
  visibility?: "public" | "private" | "all";
}

/**
 * Result of searching capabilities
 */
export interface SearchCapabilitiesResult {
  capabilities: CapabilitySummary[];
  query: string;
  totalFound: number;
  /** Threshold used for matching (from DAGSuggester) */
  thresholdUsed?: number;
}

// ============================================================================
// Execute Capability
// ============================================================================

/**
 * Request to execute a capability
 */
export interface ExecuteCapabilityRequest {
  /** Capability identifier (name or ID) */
  capabilityId: string;
  /** Arguments to pass to capability */
  args: Record<string, unknown>;
  /** Timeout in milliseconds */
  timeout?: number;
}

/**
 * Result of executing a capability
 */
export interface ExecuteCapabilityResult {
  capabilityId: string;
  output: unknown;
  executionTimeMs: number;
  success: boolean;
  error?: string;
}

// ============================================================================
// Learn Capability
// ============================================================================

/**
 * Request to learn a new capability
 */
export interface LearnCapabilityRequest {
  /** Capability name */
  name: string;
  /** Description of what it does */
  description: string;
  /** TypeScript code implementing the capability */
  code: string;
  /** Optional namespace */
  namespace?: string;
  /** Visibility level */
  visibility?: "public" | "private";
}

/**
 * Result of learning a capability
 */
export interface LearnCapabilityResult {
  id: string;
  name: string;
  displayName: string;
  fqdn: string;
  created: boolean;
}

// ============================================================================
// Get Suggestion (DR-DSP backward pathfinding)
// ============================================================================

/**
 * A task in the suggested DAG
 */
export interface SuggestedTask {
  /** Unique task identifier */
  id: string;
  /** Call name for invocation (e.g., "fs:read" or "math:sum") */
  callName: string;
  /** Whether this is a tool or capability */
  type: "tool" | "capability";
  /** JSON Schema for input parameters */
  inputSchema?: unknown;
  /** Task IDs this depends on */
  dependsOn: string[];
}

/**
 * Suggested DAG structure
 */
export interface SuggestedDag {
  tasks: SuggestedTask[];
}

/**
 * Request to get workflow suggestion
 */
export interface GetSuggestionRequest {
  /** Natural language intent */
  intent: string;
  /** Best capability match from SHGAT */
  bestCapability?: {
    id: string;
    score: number;
  };
  /** Correlation ID for tracing */
  correlationId?: string;
}

/**
 * Result of getting workflow suggestion
 */
export interface GetSuggestionResult {
  /** Suggested workflow DAG */
  suggestedDag?: SuggestedDag;
  /** Confidence score from SHGAT (0-1) */
  confidence: number;
}
