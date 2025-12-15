/**
 * Radial HEB Layout - Hierarchical Edge Bundling with Concentric Circles
 *
 * Based on Holten 2006 "Hierarchical Edge Bundles"
 * Layout: Tools on outer circle, Capabilities on inner circle
 * Bundling: D3's native curveBundle with beta tension parameter
 *
 * @module web/utils/graph/radial-heb-layout
 */

// D3 loaded from CDN
// deno-lint-ignore no-explicit-any
const d3 = (globalThis as any).d3;

import type {
  CapabilityEdge,
  CapabilityNodeData,
  HierarchyNodeData,
  RootNodeData,
  ToolEdge,
  ToolNodeData,
} from "./hierarchy-builder.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RadialLayoutConfig {
  /** Container width */
  width: number;
  /** Container height */
  height: number;
  /** Outer radius for tools (default: min(width,height)/2 - 80) */
  radiusTools?: number;
  /** Inner radius for capabilities (default: radiusTools * 0.4) */
  radiusCapabilities?: number;
  /** Bundle tension/beta (0 = tight bundles, 1 = straight lines, default: 0.85) */
  tension?: number;
  /** Label font size (default: 10) */
  labelFontSize?: number;
}

/** Positioned node after layout */
export interface PositionedNode {
  id: string;
  name: string;
  type: "root" | "capability" | "tool";
  /** Angle in radians */
  x: number;
  /** Radius from center */
  y: number;
  /** Cartesian X (computed) */
  cartX: number;
  /** Cartesian Y (computed) */
  cartY: number;
  /** Original data */
  data: HierarchyNodeData;
  /** D3 hierarchy node reference */
  // deno-lint-ignore no-explicit-any
  d3Node: any;
}

/** Edge path for rendering */
export interface BundledPath {
  id: string;
  sourceId: string;
  targetId: string;
  /** SVG path d attribute */
  pathD: string;
  /** Edge type for styling */
  edgeType: "hierarchy" | "hyperedge" | "capability_link" | "tool_sequence";
}

/** Layout result */
export interface RadialLayoutResult {
  /** All positioned nodes */
  nodes: PositionedNode[];
  /** Capability nodes only */
  capabilities: PositionedNode[];
  /** Tool nodes only */
  tools: PositionedNode[];
  /** Bundled edge paths */
  paths: BundledPath[];
  /** Center point */
  center: { x: number; y: number };
  /** Actual radii used */
  radii: {
    tools: number;
    capabilities: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create radial HEB layout from hierarchy
 *
 * @param root Hierarchy root from buildHierarchy()
 * @param capabilityEdges Edges between capabilities
 * @param config Layout configuration
 * @param emptyCapabilities Capabilities without tools (positioned separately)
 * @param toolEdges Edges between tools (sequence/dependency)
 * @returns Positioned nodes and bundled paths
 */
export function createRadialLayout(
  root: RootNodeData,
  capabilityEdges: CapabilityEdge[],
  config: RadialLayoutConfig,
  emptyCapabilities: CapabilityNodeData[] = [],
  toolEdges: ToolEdge[] = [],
): RadialLayoutResult {
  const { width, height } = config;
  const centerX = width / 2;
  const centerY = height / 2;

  // Calculate radii
  const maxRadius = Math.min(width, height) / 2 - 80;
  const radiusTools = config.radiusTools ?? maxRadius;
  const radiusCapabilities = config.radiusCapabilities ?? radiusTools * 0.4;
  const tension = config.tension ?? 0.85;

  // Create D3 hierarchy
  const hierarchy = d3.hierarchy(root);

  // Create cluster layout (radial)
  const cluster = d3.cluster().size([2 * Math.PI, radiusTools]);

  // Apply layout
  cluster(hierarchy);

  // Collect positioned nodes
  const nodes: PositionedNode[] = [];
  const capabilities: PositionedNode[] = [];
  const tools: PositionedNode[] = [];
  // deno-lint-ignore no-explicit-any
  const nodeMap = new Map<string, any>(); // id -> d3 node

  // deno-lint-ignore no-explicit-any
  hierarchy.each((d: any) => {
    // Skip root node (has no x/y from cluster layout)
    if (d.data.type === "root" || d.x === undefined) {
      nodeMap.set(d.data.id, d);
      return;
    }

    // Override Y (radius) based on node type
    if (d.data.type === "capability") {
      d.y = radiusCapabilities;
    }
    // Tools keep the cluster-assigned y = radiusTools

    // Convert polar to cartesian
    const angle = d.x - Math.PI / 2; // Rotate so 0 is at top
    const cartX = centerX + d.y * Math.cos(angle);
    const cartY = centerY + d.y * Math.sin(angle);

    const positioned: PositionedNode = {
      id: d.data.id,
      name: d.data.name,
      type: d.data.type,
      x: d.x,
      y: d.y,
      cartX,
      cartY,
      data: d.data,
      d3Node: d,
    };

    nodes.push(positioned);
    nodeMap.set(d.data.id, d);

    if (d.data.type === "capability") {
      capabilities.push(positioned);
    } else if (d.data.type === "tool") {
      tools.push(positioned);
    }
  });

  // Position empty capabilities (those without tools)
  // Distribute them evenly in remaining angular space
  if (emptyCapabilities.length > 0) {
    // Find used angles from capabilities with tools
    const usedAngles = capabilities.map((c) => c.x).sort((a, b) => a - b);

    // Calculate gaps between used angles
    const gaps: Array<{ start: number; end: number; size: number }> = [];
    if (usedAngles.length === 0) {
      // No capabilities with tools - use full circle
      gaps.push({ start: 0, end: 2 * Math.PI, size: 2 * Math.PI });
    } else {
      // Gaps between consecutive capabilities
      for (let i = 0; i < usedAngles.length; i++) {
        const current = usedAngles[i];
        const next = usedAngles[(i + 1) % usedAngles.length];
        const gapSize = next > current ? next - current : 2 * Math.PI - current + next;
        // Only consider gaps larger than minimum threshold
        if (gapSize > 0.1) {
          gaps.push({ start: current, end: next, size: gapSize });
        }
      }
    }

    // Sort gaps by size (largest first) and distribute empty caps
    gaps.sort((a, b) => b.size - a.size);

    let emptyCapIndex = 0;
    for (const gap of gaps) {
      if (emptyCapIndex >= emptyCapabilities.length) break;

      // How many empty caps can fit in this gap?
      const capsForGap = Math.min(
        Math.ceil(emptyCapabilities.length / gaps.length),
        emptyCapabilities.length - emptyCapIndex,
      );

      // Position them evenly within the gap
      const spacing = gap.size / (capsForGap + 1);
      for (let i = 0; i < capsForGap && emptyCapIndex < emptyCapabilities.length; i++) {
        const emptyCap = emptyCapabilities[emptyCapIndex];
        const angle = gap.start + spacing * (i + 1);
        const normalizedAngle = angle % (2 * Math.PI);

        // Convert polar to cartesian
        const cartAngle = normalizedAngle - Math.PI / 2;
        const cartX = centerX + radiusCapabilities * Math.cos(cartAngle);
        const cartY = centerY + radiusCapabilities * Math.sin(cartAngle);

        // Create a pseudo d3Node for edge drawing compatibility
        // Must include ancestors() method for d3.path() compatibility
        const pseudoRoot = { data: { id: "root" }, x: 0, y: 0, parent: null };
        const pseudoD3Node: any = {
          x: normalizedAngle,
          y: radiusCapabilities,
          data: emptyCap,
          parent: pseudoRoot,
          // d3.path() calls ancestors() on both source and target nodes
          ancestors: function() {
            return [this, pseudoRoot];
          },
          path: (target: any) => {
            if (!target) return [{ x: normalizedAngle, y: radiusCapabilities }];
            return [
              { x: normalizedAngle, y: radiusCapabilities },
              { x: 0, y: 0 }, // through center
              { x: target.x ?? 0, y: target.y ?? 0 },
            ];
          },
        };
        // Also add ancestors to pseudoRoot for completeness
        (pseudoRoot as any).ancestors = function() { return [this]; };

        const positioned: PositionedNode = {
          id: emptyCap.id,
          name: emptyCap.name,
          type: "capability",
          x: normalizedAngle,
          y: radiusCapabilities,
          cartX,
          cartY,
          data: emptyCap,
          d3Node: pseudoD3Node,
        };

        nodes.push(positioned);
        capabilities.push(positioned);
        nodeMap.set(emptyCap.id, pseudoD3Node);

        emptyCapIndex++;
      }
    }
  }

  // Create bundled paths
  const paths: BundledPath[] = [];

  // Line generator for radial bundled paths
  // Note: d.path() includes root node which has x=undefined, so we default to 0
  const lineRadial = d3
    .lineRadial()
    .curve(d3.curveBundle.beta(tension))
    // deno-lint-ignore no-explicit-any
    .radius((d: any) => d?.y ?? 0)
    // deno-lint-ignore no-explicit-any
    .angle((d: any) => d?.x ?? 0);

  // 1. Hierarchy edges (capability → tool) using d3's path()
  // deno-lint-ignore no-explicit-any
  hierarchy.each((d: any) => {
    if (d.data.type === "tool" && d.parent) {
      const path = d.path(d.parent)?.filter((n: any) => n != null);
      if (!path?.length) return;
      const pathD = lineRadial(path);

      if (pathD) {
        paths.push({
          id: `hier-${d.parent.data.id}-${d.data.id}`,
          sourceId: d.parent.data.id,
          targetId: d.data.id,
          pathD,
          edgeType: "hierarchy",
        });
      }
    }
  });

  // 2. Hyperedges (tool → non-primary parent capabilities)
  // deno-lint-ignore no-explicit-any
  hierarchy.each((d: any) => {
    if (d.data.type === "tool") {
      const toolData = d.data as ToolNodeData;
      const primaryParent = toolData.primaryParent;

      for (const capId of toolData.parentCapabilities) {
        if (capId !== primaryParent) {
          const capNode = nodeMap.get(capId);
          if (capNode && d.parent) {
            // Path goes: tool → primary parent → root → secondary parent
            // Using d3's path() through common ancestor
            const path = d.path(capNode)?.filter((n: any) => n != null);
            if (!path?.length) continue;
            const pathD = lineRadial(path);

            if (pathD) {
              paths.push({
                id: `hyper-${capId}-${d.data.id}`,
                sourceId: capId,
                targetId: d.data.id,
                pathD,
                edgeType: "hyperedge",
              });
            }
          }
        }
      }
    }
  });

  // 3. Capability-to-capability edges (bundled through center)
  for (const edge of capabilityEdges) {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);

    if (sourceNode && targetNode) {
      // Path through root (center)
      const path = sourceNode.path(targetNode)?.filter((n: any) => n != null);
      if (!path?.length) continue;
      const pathD = lineRadial(path);

      if (pathD) {
        paths.push({
          id: `cap-${edge.source}-${edge.target}`,
          sourceId: edge.source,
          targetId: edge.target,
          pathD,
          edgeType: "capability_link",
        });
      }
    }
  }

  // 4. Tool-to-tool edges (sequence/dependency - bundled through common ancestor)
  for (const edge of toolEdges) {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);

    if (sourceNode && targetNode) {
      // Path through common ancestor (will bundle nicely)
      const path = sourceNode.path(targetNode)?.filter((n: any) => n != null);
      if (!path?.length) continue;
      const pathD = lineRadial(path);

      if (pathD) {
        paths.push({
          id: `tool-${edge.source}-${edge.target}`,
          sourceId: edge.source,
          targetId: edge.target,
          pathD,
          edgeType: "tool_sequence",
        });
      }
    }
  }

  return {
    nodes,
    capabilities,
    tools,
    paths,
    center: { x: centerX, y: centerY },
    radii: {
      tools: radiusTools,
      capabilities: radiusCapabilities,
    },
  };
}

/**
 * Update bundle tension and recompute paths
 * More efficient than full relayout when only tension changes
 *
 * @param root Hierarchy root
 * @param capabilityEdges Capability edges
 * @param nodeMap Map of id to d3 node
 * @param tension New tension value (0-1)
 * @returns Updated bundled paths
 */
export function updateBundleTension(
  // deno-lint-ignore no-explicit-any
  hierarchy: any,
  capabilityEdges: CapabilityEdge[],
  // deno-lint-ignore no-explicit-any
  nodeMap: Map<string, any>,
  tension: number,
): BundledPath[] {
  const paths: BundledPath[] = [];

  const lineRadial = d3
    .lineRadial()
    .curve(d3.curveBundle.beta(tension))
    // deno-lint-ignore no-explicit-any
    .radius((d: any) => d?.y ?? 0)
    // deno-lint-ignore no-explicit-any
    .angle((d: any) => d?.x ?? 0);

  // Rebuild all paths with new tension
  // deno-lint-ignore no-explicit-any
  hierarchy.each((d: any) => {
    // Hierarchy edges
    if (d.data.type === "tool" && d.parent) {
      const path = d.path(d.parent)?.filter((n: any) => n != null);
      if (!path?.length) return;
      const pathD = lineRadial(path);
      if (pathD) {
        paths.push({
          id: `hier-${d.parent.data.id}-${d.data.id}`,
          sourceId: d.parent.data.id,
          targetId: d.data.id,
          pathD,
          edgeType: "hierarchy",
        });
      }
    }

    // Hyperedges
    if (d.data.type === "tool") {
      const toolData = d.data as ToolNodeData;
      for (const capId of toolData.parentCapabilities) {
        if (capId !== toolData.primaryParent) {
          const capNode = nodeMap.get(capId);
          if (capNode) {
            const path = d.path(capNode)?.filter((n: any) => n != null);
            if (!path?.length) continue;
            const pathD = lineRadial(path);
            if (pathD) {
              paths.push({
                id: `hyper-${capId}-${d.data.id}`,
                sourceId: capId,
                targetId: d.data.id,
                pathD,
                edgeType: "hyperedge",
              });
            }
          }
        }
      }
    }
  });

  // Capability edges
  for (const edge of capabilityEdges) {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (sourceNode && targetNode) {
      const path = sourceNode.path(targetNode)?.filter((n: any) => n != null);
      if (!path?.length) continue;
      const pathD = lineRadial(path);
      if (pathD) {
        paths.push({
          id: `cap-${edge.source}-${edge.target}`,
          sourceId: edge.source,
          targetId: edge.target,
          pathD,
          edgeType: "capability_link",
        });
      }
    }
  }

  return paths;
}

/**
 * Calculate label rotation for radial text
 * Labels on the left side of the circle should be flipped
 *
 * @param angle Angle in radians
 * @returns CSS transform rotation
 */
export function getLabelRotation(angle: number): { rotate: number; anchor: string } {
  // Convert to degrees
  const degrees = (angle * 180) / Math.PI - 90;

  // Labels on left side (90° to 270°) should be flipped
  if (angle > Math.PI / 2 && angle < (3 * Math.PI) / 2) {
    return {
      rotate: degrees + 180,
      anchor: "end",
    };
  }

  return {
    rotate: degrees,
    anchor: "start",
  };
}

/**
 * Get edge color based on type
 */
export function getRadialEdgeColor(edgeType: BundledPath["edgeType"]): string {
  switch (edgeType) {
    case "hierarchy":
      return "#888888"; // Gray for cap→tool
    case "hyperedge":
      return "#f59e0b"; // Amber for multi-parent tools
    case "capability_link":
      return "#3b82f6"; // Blue for cap↔cap
    case "tool_sequence":
      return "#10b981"; // Emerald/Green for tool→tool sequence
    default:
      return "#888888";
  }
}

/**
 * Get edge opacity based on type
 */
export function getRadialEdgeOpacity(edgeType: BundledPath["edgeType"]): number {
  switch (edgeType) {
    case "hierarchy":
      return 0.4;
    case "hyperedge":
      return 0.6;
    case "capability_link":
      return 0.7;
    case "tool_sequence":
      return 0.8; // More visible for sequence edges
    default:
      return 0.4;
  }
}
