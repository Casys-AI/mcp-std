/**
 * Graph Utilities - Hierarchical Edge Bundling (HEB)
 *
 * Based on Holten 2006 "Hierarchical Edge Bundles"
 *
 * Modules:
 * - hierarchy-builder: Transform flat hypergraph to D3 hierarchy
 * - radial-heb-layout: Concentric circle layout with D3 curveBundle
 *
 * Legacy modules (deprecated, kept for reference):
 * - edge-compatibility: 4 compatibility metrics (Ca, Cs, Cp, Cv)
 * - fdeb-bundler: FDEB algorithm with iterative refinement
 * - bounded-force-layout: D3 force simulation with viewport bounds
 */

// Edge Compatibility
export {
  type Point,
  type Edge,
  type CompatibilityResult,
  angleCompatibility,
  scaleCompatibility,
  positionCompatibility,
  visibilityCompatibility,
  edgeCompatibility,
  isCompatible,
} from "./edge-compatibility.ts";

// FDEB Bundler
export {
  type FDEBConfig,
  type BundledEdge,
  FDEBBundler,
  bundleEdges,
} from "./fdeb-bundler.ts";

// Bounded Force Layout
export {
  type BoundedForceConfig,
  type SimulationNode,
  type SimulationLink,
  BoundedForceLayout,
  createBoundedForceLayout,
} from "./bounded-force-layout.ts";

// Edge Renderer
export {
  type EdgeRenderConfig,
  type EdgeClickHandler,
  type EdgeHoverHandler,
  EdgeRenderer,
  renderSimpleEdges,
} from "./edge-renderer.ts";

// Edge Heatmap (Holten paper - WebGL density visualization)
export {
  type EdgeHeatmapConfig,
  EdgeHeatmap,
  DEFAULT_HEATMAP_COLORS,
} from "./edge-heatmap.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Hierarchical Edge Bundling (HEB) - Holten 2006
// ─────────────────────────────────────────────────────────────────────────────

// Hierarchy Builder
export {
  type HierarchyNodeData,
  type RootNodeData,
  type CapabilityNodeData,
  type ToolNodeData,
  type CapabilityEdge,
  type ToolEdge,
  type HierarchyBuildResult,
  type HypergraphApiResponse,
  buildHierarchy,
  getHyperedges,
} from "./hierarchy-builder.ts";

// Radial HEB Layout
export {
  type RadialLayoutConfig,
  type PositionedNode,
  type BundledPath,
  type RadialLayoutResult,
  createRadialLayout,
  updateBundleTension,
  getLabelRotation,
  getRadialEdgeColor,
  getRadialEdgeOpacity,
} from "./radial-heb-layout.ts";
