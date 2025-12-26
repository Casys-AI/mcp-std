/**
 * SHGAT Graph Module
 *
 * Graph construction and management for SHGAT hypergraphs.
 *
 * @module graphrag/algorithms/shgat/graph
 */

export {
  GraphBuilder,
  generateDefaultToolEmbedding,
  type GraphBuildData,
} from "./graph-builder.ts";

// Hierarchy computation (n-SuperHyperGraph)
export {
  computeHierarchyLevels,
  getCapabilitiesAtLevel,
  getSortedLevels,
  validateAcyclic,
  HierarchyCycleError,
  type HierarchyResult,
} from "./hierarchy.ts";

// Multi-level incidence structure (n-SuperHyperGraph)
export {
  buildMultiLevelIncidence,
  getCapsContainingTool,
  getToolsInCap,
  getParentCaps,
  getChildCaps,
  getIncidenceStats,
  type MultiLevelIncidence,
} from "./incidence.ts";
