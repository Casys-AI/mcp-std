/**
 * Code Hashing for Capability Deduplication (Epic 7 - Story 7.2a)
 *
 * Uses SHA-256 to generate collision-resistant hashes for code snippets.
 * Normalizes code before hashing to ensure consistent deduplication.
 *
 * Semantic Hashing (Story 7.2c):
 * - hashSemanticStructure() hashes the static structure (nodes/edges)
 * - Variable names are normalized to node IDs, so different variable names
 *   produce the same hash if the semantic structure is identical
 *
 * @module capabilities/hash
 */

import type { StaticStructure, StaticStructureNode, StaticStructureEdge } from "./types/static-analysis.ts";

/**
 * Normalize code for consistent hashing
 *
 * - Removes single-line comments (// ...)
 * - Removes multi-line comments (block comments)
 * - Trims leading/trailing whitespace
 * - Collapses consecutive whitespace to single space
 *
 * Comments are removed because they don't affect code behavior
 * and should not create different hashes for identical logic.
 *
 * @param code Raw code string
 * @returns Normalized code string
 */
export function normalizeCode(code: string): string {
  return code
    // Remove single-line comments (// ...)
    .replace(/\/\/.*$/gm, "")
    // Remove multi-line comments (/* ... */)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // Trim and collapse whitespace
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Generate SHA-256 hash of code for deduplication
 *
 * Uses Web Crypto API (available in Deno) for secure hashing.
 * Code is normalized before hashing to ensure consistent deduplication
 * even with whitespace variations.
 *
 * @deprecated Use hashSemanticStructure() instead for capability deduplication.
 * hashCode() does NOT normalize variable names, so:
 * - "const result = await mcp.foo(); return result;"
 * - "const data = await mcp.foo(); return data;"
 * produce DIFFERENT hashes despite identical semantics.
 *
 * hashSemanticStructure() uses StaticStructure which normalizes variables
 * to node IDs, producing the same hash for semantically identical code.
 *
 * This function is kept as fallback for code without static structure.
 *
 * @param code TypeScript code snippet
 * @returns 64-character hex string (SHA-256)
 *
 * @example
 * ```typescript
 * // DEPRECATED - use hashSemanticStructure instead:
 * const structure = await builder.buildStaticStructure(code);
 * const hash = await hashSemanticStructure(structure);
 *
 * // Legacy usage (not recommended):
 * const hash = await hashCode("const x = 1;");
 * ```
 */
export async function hashCode(code: string): Promise<string> {
  const normalized = normalizeCode(code);
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate hash synchronously using djb2 algorithm (for tests/quick checks)
 *
 * NOT cryptographically secure - use hashCode() for production deduplication.
 * Useful for quick tests where async is inconvenient.
 *
 * @param code TypeScript code snippet
 * @returns djb2 hash as hex string
 */
export function hashCodeSync(code: string): string {
  const normalized = normalizeCode(code);
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) + hash) ^ normalized.charCodeAt(i);
  }
  // Convert to unsigned 32-bit integer and then to hex
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Serialize a static structure node for hashing
 *
 * Extracts only semantically meaningful parts:
 * - Node type and tool name (for task nodes)
 * - Arguments with node ID references (not variable names)
 *
 * @param node Static structure node
 * @returns Canonical string representation
 */
function serializeNode(node: StaticStructureNode): string {
  const base = { id: node.id, type: node.type };

  switch (node.type) {
    case "task":
      // Include tool and arguments (arguments already have node IDs, not variable names)
      return JSON.stringify({ ...base, tool: node.tool, arguments: node.arguments });
    case "decision":
      return JSON.stringify({ ...base, condition: node.condition });
    case "capability":
      return JSON.stringify({ ...base, capabilityId: node.capabilityId });
    default:
      return JSON.stringify(base);
  }
}

/**
 * Serialize a static structure edge for hashing
 *
 * @param edge Static structure edge
 * @returns Canonical string representation
 */
function serializeEdge(edge: StaticStructureEdge): string {
  return JSON.stringify({
    from: edge.from,
    to: edge.to,
    type: edge.type,
    outcome: edge.outcome,
    coverage: edge.coverage,
  });
}

/**
 * Generate SHA-256 hash from static structure for semantic deduplication
 *
 * This produces the same hash for code with different variable names
 * but identical semantic structure (same MCP calls in same order).
 *
 * The static structure normalizes variable names to node IDs:
 * - "const result = await mcp.foo(); return result;"
 * - "const data = await mcp.foo(); return data;"
 * Both produce the same semantic hash because the structure is:
 * - Node n1: task(mcp.foo)
 * - Return references n1
 *
 * @param structure Static structure from code analysis
 * @returns 64-character hex string (SHA-256)
 *
 * @example
 * ```typescript
 * const structure = await staticStructureBuilder.buildStaticStructure(code);
 * const hash = await hashSemanticStructure(structure);
 * ```
 */
export async function hashSemanticStructure(structure: StaticStructure): Promise<string> {
  // Serialize nodes and edges in deterministic order
  const serializedNodes = structure.nodes
    .map(serializeNode)
    .sort() // Sort for determinism
    .join("|");

  const serializedEdges = structure.edges
    .map(serializeEdge)
    .sort() // Sort for determinism
    .join("|");

  // Combine into canonical representation
  const canonical = `nodes:${serializedNodes}||edges:${serializedEdges}`;

  // Hash using SHA-256
  const encoder = new TextEncoder();
  const data = encoder.encode(canonical);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
