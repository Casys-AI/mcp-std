/**
 * Edge Renderer - SVG Rendering for Bundled Edges
 *
 * Renders bundled edges as smooth SVG paths using D3's curve generators.
 * Supports hover, click interactions and highlighting.
 *
 * Note: D3 is loaded from CDN in browser, accessed via globalThis.d3
 */

// deno-lint-ignore no-explicit-any
const d3 = (globalThis as any).d3;

import type { Point } from "./edge-compatibility.ts";
import type { BundledEdge } from "./fdeb-bundler.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface EdgeRenderConfig {
  /** Stroke width (default: 1.5) */
  strokeWidth: number;
  /** Default stroke opacity (default: 0.3) */
  strokeOpacity: number;
  /** Hover stroke opacity (default: 0.8) */
  hoverOpacity: number;
  /** Highlighted stroke opacity (default: 1.0) */
  highlightOpacity: number;
  /** Default stroke color (default: #888) */
  strokeColor: string;
  /** Highlighted stroke color (default: #f97316) */
  highlightColor: string;
  /** Curve interpolation type */
  curveType: "basis" | "cardinal" | "catmullRom" | "linear";
  /** Cardinal tension (0-1, only for cardinal curve) */
  tension: number;
  /** Animation duration in ms (default: 200) */
  animationDuration: number;
}

export type EdgeClickHandler = (edge: BundledEdge) => void;
// deno-lint-ignore no-explicit-any
export type EdgeHoverHandler = (edge: BundledEdge | null, event?: any) => void;

// ─────────────────────────────────────────────────────────────────────────────
// Default Configuration
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: EdgeRenderConfig = {
  strokeWidth: 1.5,
  strokeOpacity: 0.3,
  hoverOpacity: 0.8,
  highlightOpacity: 1.0,
  strokeColor: "#888888",
  highlightColor: "#f97316",
  curveType: "basis",
  tension: 0.5,
  animationDuration: 200,
};

// ─────────────────────────────────────────────────────────────────────────────
// Edge Renderer Class
// ─────────────────────────────────────────────────────────────────────────────

export class EdgeRenderer {
  // deno-lint-ignore no-explicit-any
  private svgGroup: any;
  private config: EdgeRenderConfig;
  private edges: BundledEdge[] = [];
  private highlightedNodeId: string | null = null;
  private highlightedEdgeKey: string | null = null;
  private clickHandler: EdgeClickHandler | null = null;
  private hoverHandler: EdgeHoverHandler | null = null;

  // deno-lint-ignore no-explicit-any
  constructor(svgGroup: any, config?: Partial<EdgeRenderConfig>) {
    this.svgGroup = svgGroup;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Render bundled edges as SVG paths
   */
  render(edges: BundledEdge[]): void {
    this.edges = edges;

    // Select existing paths and bind data
    const paths = this.svgGroup
      .selectAll("path.bundled-edge")
      .data(edges, (d: BundledEdge) => `${d.sourceId}-${d.targetId}`);

    // Remove old paths
    paths.exit().remove();

    // Create line generator
    const line = this.createLineGenerator();

    // Enter new paths
    const enterPaths = paths
      .enter()
      .append("path")
      .attr("class", "bundled-edge")
      .attr("fill", "none")
      .attr("stroke", this.config.strokeColor)
      .attr("stroke-width", this.config.strokeWidth)
      .attr("stroke-opacity", 0) // Start invisible for animation
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round");

    // Merge enter + update
    const allPaths = enterPaths.merge(paths);

    // Update path data
    allPaths
      .attr("d", (d: BundledEdge) => line(d.subdivisionPoints))
      .attr("data-source", (d: BundledEdge) => d.sourceId)
      .attr("data-target", (d: BundledEdge) => d.targetId);

    // Animate to visible
    allPaths
      .transition()
      .duration(this.config.animationDuration)
      .attr("stroke-opacity", this.config.strokeOpacity);

    // Add interactions
    this.setupInteractions(allPaths);

    // Apply any existing highlights
    this.applyHighlights();
  }

  /**
   * Highlight edges connected to a node
   */
  highlightByNode(nodeId: string | null): void {
    this.highlightedNodeId = nodeId;
    this.highlightedEdgeKey = null;
    this.applyHighlights();
  }

  /**
   * Highlight a specific edge
   */
  highlightEdge(sourceId: string, targetId: string): void {
    this.highlightedEdgeKey = `${sourceId}-${targetId}`;
    this.highlightedNodeId = null;
    this.applyHighlights();
  }

  /**
   * Clear all highlights
   */
  clearHighlights(): void {
    this.highlightedNodeId = null;
    this.highlightedEdgeKey = null;
    this.applyHighlights();
  }

  /**
   * Set click handler for edges
   */
  onClick(handler: EdgeClickHandler): void {
    this.clickHandler = handler;
  }

  /**
   * Set hover handler for edges
   */
  onHover(handler: EdgeHoverHandler): void {
    this.hoverHandler = handler;
  }

  /**
   * Update edge positions (e.g., during simulation tick)
   */
  updatePositions(
    getPosition: (nodeId: string) => Point | undefined
  ): void {
    // Update edge endpoints based on current node positions
    for (const edge of this.edges) {
      const sourcePos = getPosition(edge.sourceId);
      const targetPos = getPosition(edge.targetId);

      if (sourcePos && targetPos && edge.subdivisionPoints.length >= 2) {
        // Update source point
        edge.subdivisionPoints[0] = { ...sourcePos };
        // Update target point
        edge.subdivisionPoints[edge.subdivisionPoints.length - 1] = {
          ...targetPos,
        };
      }
    }

    // Re-render paths
    const line = this.createLineGenerator();
    this.svgGroup
      .selectAll("path.bundled-edge")
      .attr("d", (d: BundledEdge) => line(d.subdivisionPoints));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private Methods
  // ───────────────────────────────────────────────────────────────────────────

  // deno-lint-ignore no-explicit-any
  private createLineGenerator(): any {
    // deno-lint-ignore no-explicit-any
    let curve: any;

    switch (this.config.curveType) {
      case "cardinal":
        curve = d3.curveCardinal.tension(this.config.tension);
        break;
      case "catmullRom":
        curve = d3.curveCatmullRom.alpha(this.config.tension);
        break;
      case "linear":
        curve = d3.curveLinear;
        break;
      case "basis":
      default:
        curve = d3.curveBasis;
    }

    return d3
      .line()
      .x((d: Point) => d.x)
      .y((d: Point) => d.y)
      .curve(curve);
  }

  // deno-lint-ignore no-explicit-any
  private setupInteractions(paths: any): void {
    const self = this;

    paths
      .style("cursor", "pointer")
      // deno-lint-ignore no-explicit-any
      .on("mouseenter", function (this: any, event: any, d: BundledEdge) {
        if (!self.highlightedNodeId && !self.highlightedEdgeKey) {
          d3.select(this)
            .transition()
            .duration(100)
            .attr("stroke-opacity", self.config.hoverOpacity)
            .attr("stroke-width", self.config.strokeWidth * 1.5);
        }
        self.hoverHandler?.(d, event);
      })
      // deno-lint-ignore no-explicit-any
      .on("mouseleave", function (this: any, _event: any, _d: BundledEdge) {
        if (!self.highlightedNodeId && !self.highlightedEdgeKey) {
          d3.select(this)
            .transition()
            .duration(100)
            .attr("stroke-opacity", self.config.strokeOpacity)
            .attr("stroke-width", self.config.strokeWidth);
        }
        self.hoverHandler?.(null);
      })
      // deno-lint-ignore no-explicit-any
      .on("click", function (_event: any, d: BundledEdge) {
        self.clickHandler?.(d);
      });
  }

  private applyHighlights(): void {
    const paths = this.svgGroup.selectAll("path.bundled-edge");

    if (this.highlightedNodeId) {
      // Highlight edges connected to the node
      paths
        .transition()
        .duration(this.config.animationDuration)
        .attr("stroke", (d: BundledEdge) =>
          d.sourceId === this.highlightedNodeId ||
          d.targetId === this.highlightedNodeId
            ? this.config.highlightColor
            : this.config.strokeColor
        )
        .attr("stroke-opacity", (d: BundledEdge) =>
          d.sourceId === this.highlightedNodeId ||
          d.targetId === this.highlightedNodeId
            ? this.config.highlightOpacity
            : this.config.strokeOpacity * 0.5
        )
        .attr("stroke-width", (d: BundledEdge) =>
          d.sourceId === this.highlightedNodeId ||
          d.targetId === this.highlightedNodeId
            ? this.config.strokeWidth * 2
            : this.config.strokeWidth
        );
    } else if (this.highlightedEdgeKey) {
      // Highlight specific edge
      paths
        .transition()
        .duration(this.config.animationDuration)
        .attr("stroke", (d: BundledEdge) =>
          `${d.sourceId}-${d.targetId}` === this.highlightedEdgeKey
            ? this.config.highlightColor
            : this.config.strokeColor
        )
        .attr("stroke-opacity", (d: BundledEdge) =>
          `${d.sourceId}-${d.targetId}` === this.highlightedEdgeKey
            ? this.config.highlightOpacity
            : this.config.strokeOpacity * 0.5
        )
        .attr("stroke-width", (d: BundledEdge) =>
          `${d.sourceId}-${d.targetId}` === this.highlightedEdgeKey
            ? this.config.strokeWidth * 2
            : this.config.strokeWidth
        );
    } else {
      // Clear all highlights
      paths
        .transition()
        .duration(this.config.animationDuration)
        .attr("stroke", this.config.strokeColor)
        .attr("stroke-opacity", this.config.strokeOpacity)
        .attr("stroke-width", this.config.strokeWidth);
    }
  }
}

/**
 * Render unbundled edges (simple straight lines)
 * Used before bundling is complete
 */
export function renderSimpleEdges(
  // deno-lint-ignore no-explicit-any
  svgGroup: any,
  edges: Array<{ source: string; target: string }>,
  getPosition: (nodeId: string) => Point | undefined,
  config?: Partial<EdgeRenderConfig>
): void {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  const paths = svgGroup
    .selectAll("line.simple-edge")
    .data(edges, (d: (typeof edges)[0]) => `${d.source}-${d.target}`);

  paths.exit().remove();

  const enterLines = paths
    .enter()
    .append("line")
    .attr("class", "simple-edge")
    .attr("stroke", mergedConfig.strokeColor)
    .attr("stroke-width", mergedConfig.strokeWidth)
    .attr("stroke-opacity", mergedConfig.strokeOpacity);

  // deno-lint-ignore no-explicit-any
  enterLines.merge(paths).each(function (this: any, d: (typeof edges)[0]) {
    const sourcePos = getPosition(d.source);
    const targetPos = getPosition(d.target);

    if (sourcePos && targetPos) {
      d3.select(this)
        .attr("x1", sourcePos.x)
        .attr("y1", sourcePos.y)
        .attr("x2", targetPos.x)
        .attr("y2", targetPos.y);
    }
  });
}
