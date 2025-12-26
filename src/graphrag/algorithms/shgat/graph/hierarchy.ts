/**
 * SHGAT Hierarchy Computation Module
 *
 * Computes hierarchy levels for n-SuperHyperGraph capabilities via topological sort.
 *
 * For capability c ∈ P^k(V₀):
 * - level(c) = 0 if c contains only tools (c ⊆ V₀)
 * - level(c) = 1 + max{level(c') | c' ∈ c} otherwise
 *
 * @module graphrag/algorithms/shgat/graph/hierarchy
 * @see 02-hierarchy-computation.md
 */

import type { CapabilityNode } from "../types.ts";
import { getDirectCapabilities } from "../types.ts";

/**
 * Result of hierarchy computation
 */
export interface HierarchyResult {
  /** Mapping: level → set of capability IDs at that level */
  hierarchyLevels: Map<number, Set<string>>;
  /** Maximum hierarchy level (L_max) */
  maxHierarchyLevel: number;
  /** Updated capabilities with hierarchyLevel set */
  capabilities: Map<string, CapabilityNode>;
}

/**
 * Error thrown when a cycle is detected in the capability hierarchy
 */
export class HierarchyCycleError extends Error {
  constructor(
    public readonly capabilityId: string,
    public readonly path: string[],
  ) {
    super(
      `Cycle detected at capability '${capabilityId}'. ` +
        `Path: ${path.join(" → ")} → ${capabilityId}`,
    );
    this.name = "HierarchyCycleError";
  }
}

/**
 * Compute hierarchy levels for all capabilities via topological sort
 *
 * Uses DFS with memoization to compute levels. Detects cycles and throws
 * HierarchyCycleError if found.
 *
 * Algorithm:
 * 1. For each capability, recursively compute level of children
 * 2. level(c) = 0 if no child capabilities
 * 3. level(c) = 1 + max(level(children)) otherwise
 * 4. Cache results to avoid recomputation
 *
 * Time complexity: O(C + E) where C = capabilities, E = containment edges
 *
 * @param capabilities Map of capability ID → CapabilityNode
 * @returns HierarchyResult with levels, max level, and updated capabilities
 * @throws HierarchyCycleError if cycle detected
 */
export function computeHierarchyLevels(
  capabilities: Map<string, CapabilityNode>,
): HierarchyResult {
  const hierarchyLevels = new Map<number, Set<string>>();
  let maxHierarchyLevel = 0;

  // Memoization cache for computed levels
  const levelCache = new Map<string, number>();

  // Track nodes currently in DFS path for cycle detection
  const visiting = new Set<string>();

  // Track path for error reporting
  const currentPath: string[] = [];

  /**
   * Recursively compute level for a capability
   */
  const computeLevel = (capId: string): number => {
    // Already computed?
    const cached = levelCache.get(capId);
    if (cached !== undefined) {
      return cached;
    }

    // Cycle detection: if we're already visiting this node, we have a cycle
    if (visiting.has(capId)) {
      throw new HierarchyCycleError(capId, [...currentPath]);
    }

    const cap = capabilities.get(capId);
    if (!cap) {
      throw new Error(
        `Unknown capability '${capId}' referenced as child. ` +
          `Path: ${currentPath.join(" → ")}`,
      );
    }

    // Mark as visiting
    visiting.add(capId);
    currentPath.push(capId);

    try {
      // Get child capabilities (not tools)
      const childCapIds = getDirectCapabilities(cap);

      let level: number;
      if (childCapIds.length === 0) {
        // Leaf: contains only tools (or nothing)
        level = 0;
      } else {
        // level(c) = 1 + max{level(c') | c' ∈ c}
        const childLevels = childCapIds.map((childId) => computeLevel(childId));
        level = 1 + Math.max(...childLevels);
      }

      // Cache result
      levelCache.set(capId, level);

      // Update capability's hierarchyLevel
      cap.hierarchyLevel = level;

      // Track in hierarchyLevels map
      let capsAtLevel = hierarchyLevels.get(level);
      if (!capsAtLevel) {
        capsAtLevel = new Set();
        hierarchyLevels.set(level, capsAtLevel);
      }
      capsAtLevel.add(capId);

      // Update max level
      if (level > maxHierarchyLevel) {
        maxHierarchyLevel = level;
      }

      return level;
    } finally {
      // Remove from visiting set and path
      visiting.delete(capId);
      currentPath.pop();
    }
  };

  // Compute for all capabilities
  for (const capId of capabilities.keys()) {
    computeLevel(capId);
  }

  return {
    hierarchyLevels,
    maxHierarchyLevel,
    capabilities,
  };
}

/**
 * Get capabilities at a specific hierarchy level
 *
 * @param hierarchyLevels The hierarchy levels map
 * @param level The level to get
 * @returns Set of capability IDs at that level, or empty set
 */
export function getCapabilitiesAtLevel(
  hierarchyLevels: Map<number, Set<string>>,
  level: number,
): Set<string> {
  return hierarchyLevels.get(level) ?? new Set();
}

/**
 * Get all levels in sorted order (0, 1, 2, ...)
 *
 * @param hierarchyLevels The hierarchy levels map
 * @returns Array of levels in ascending order
 */
export function getSortedLevels(
  hierarchyLevels: Map<number, Set<string>>,
): number[] {
  return Array.from(hierarchyLevels.keys()).sort((a, b) => a - b);
}

/**
 * Validate that a capability graph is a valid DAG (no cycles)
 *
 * @param capabilities Map of capability ID → CapabilityNode
 * @returns true if valid DAG, throws HierarchyCycleError if cycle found
 */
export function validateAcyclic(
  capabilities: Map<string, CapabilityNode>,
): boolean {
  // computeHierarchyLevels will throw if cycle detected
  computeHierarchyLevels(capabilities);
  return true;
}
