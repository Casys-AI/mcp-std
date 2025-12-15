/**
 * Force-Directed Edge Bundling (FDEB) Algorithm
 * Based on Holten & van Wijk, 2009 - Section 3.3
 *
 * Iterative refinement scheme:
 * - Start with coarse subdivision
 * - Double subdivision points each cycle
 * - Halve step size each cycle
 * - Run physics simulation to bundle compatible edges
 */

import { type Edge, edgeCompatibility, isCompatible, type Point } from "./edge-compatibility.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface FDEBConfig {
  /** Global spring constant (default: 0.1) */
  K: number;
  /** Initial step size (default: 0.04) */
  S0: number;
  /** Initial iterations per cycle (default: 50) */
  I0: number;
  /** Number of refinement cycles (default: 6) */
  cycles: number;
  /** Minimum compatibility to consider bundling (default: 0.05) */
  compatibilityThreshold: number;
  /** TD-3: Use inverse-quadratic force model (default: true, per Holten paper Fig 7d) */
  useQuadratic: boolean;
}

export interface BundledEdge {
  sourceId: string;
  targetId: string;
  subdivisionPoints: Point[]; // Includes source and target as first/last
}

interface InternalEdge {
  sourceId: string;
  targetId: string;
  source: Point;
  target: Point;
  points: Point[]; // Subdivision points (mutable during algorithm)
  compatibleEdges: number[]; // Indices of compatible edges (cached)
}

// ─────────────────────────────────────────────────────────────────────────────
// Default Configuration
// ─────────────────────────────────────────────────────────────────────────────

// Default config from d3.ForceBundle reference implementation
// https://github.com/upphiminn/d3.ForceBundle
const DEFAULT_CONFIG: FDEBConfig = {
  K: 0.1, // Spring constant (controls bundling stiffness)
  S0: 0.1, // Initial step size (ref: 0.1 default)
  I0: 90, // Initial iterations per cycle (ref: 90 default)
  cycles: 6, // Number of cycles (ref: 6 default)
  compatibilityThreshold: 0.6, // Minimum Ce to consider (ref: 0.6 default, 60%)
  useQuadratic: true, // TD-3: Inverse-quadratic for localized bundling (Holten Fig 7d)
};

// Iterative refinement scheme from d3.ForceBundle reference
// P: subdivision points, S: step size, I: iterations
const SCHEME = {
  // Cycle:     0      1       2       3        4         5
  P: [1, 2, 4, 8, 16, 32], // Doubles each cycle (rate: 2)
  S: [0.1, 0.05, 0.025, 0.0125, 0.00625, 0.003125], // Halves each cycle (ref: starts at 0.1)
  I: [90, 60, 40, 27, 18, 12], // Reduces by ~2/3 each cycle (ref: starts at 90)
};

// ─────────────────────────────────────────────────────────────────────────────
// FDEB Bundler Class
// ─────────────────────────────────────────────────────────────────────────────

export class FDEBBundler {
  private config: FDEBConfig;
  private nodes: Map<string, Point> = new Map();
  private edgeData: Array<{ source: string; target: string }> = [];

  constructor(config?: Partial<FDEBConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set node positions (needed for edge endpoints)
   */
  setNodes(nodes: Map<string, Point>): this {
    this.nodes = nodes;
    return this;
  }

  /**
   * Set edges to bundle
   */
  setEdges(edges: Array<{ source: string; target: string }>): this {
    this.edgeData = edges;
    return this;
  }

  /**
   * Run FDEB algorithm and return bundled edges
   */
  bundle(): BundledEdge[] {
    // Build internal edge representation
    const edges = this.buildInternalEdges();

    if (edges.length === 0) {
      return [];
    }

    // Compute edge compatibilities (cached for performance)
    this.computeCompatibilities(edges);

    // Calculate average edge length for step size scaling
    const avgLength = this.calculateAverageLength(edges);

    // Run iterative refinement
    const numCycles = Math.min(this.config.cycles, SCHEME.P.length);

    for (let cycle = 0; cycle < numCycles; cycle++) {
      // Subdivide edges (except first cycle where P=1)
      if (cycle > 0) {
        this.subdivideEdges(edges);
      }

      // Get cycle parameters
      const stepSize = SCHEME.S[cycle] * avgLength;
      const iterations = SCHEME.I[cycle];
      const numPoints = SCHEME.P[cycle];

      // Spring constant scaled by number of segments
      const kP = this.config.K / numPoints;

      // Run force simulation for this cycle
      this.runSimulation(edges, stepSize, iterations, kP);
    }

    // Convert to output format
    return edges.map((e) => ({
      sourceId: e.sourceId,
      targetId: e.targetId,
      subdivisionPoints: e.points,
    }));
  }

  /**
   * Apply straightening to bundled edges (Holten paper Section 4.3)
   * s=0: fully bundled, s=1: straight lines
   * Formula: p'_i = (1-s)*p_i + s*(P0 + (i+1)/(N+1)*(P1-P0))
   */
  static applyStraightening(edges: BundledEdge[], s: number): BundledEdge[] {
    if (s <= 0) return edges;
    if (s >= 1) {
      // Full straightening - just source to target
      return edges.map((e) => ({
        ...e,
        subdivisionPoints: [
          e.subdivisionPoints[0],
          e.subdivisionPoints[e.subdivisionPoints.length - 1],
        ],
      }));
    }

    return edges.map((e) => {
      const points = e.subdivisionPoints;
      if (points.length < 2) return e;

      const P0 = points[0];
      const P1 = points[points.length - 1];
      const N = points.length - 2; // Number of internal points

      const newPoints: Point[] = [P0]; // Keep source

      for (let i = 1; i < points.length - 1; i++) {
        const pi = points[i];
        const t = i / (N + 1); // Proportional position along straight line
        const straightX = P0.x + t * (P1.x - P0.x);
        const straightY = P0.y + t * (P1.y - P0.y);

        newPoints.push({
          x: (1 - s) * pi.x + s * straightX,
          y: (1 - s) * pi.y + s * straightY,
        });
      }

      newPoints.push(P1); // Keep target

      return {
        ...e,
        subdivisionPoints: newPoints,
      };
    });
  }

  /**
   * Apply Gaussian smoothing to bundled edges (Holten paper Section 3.3)
   * Reduces jaggedness by convolving subdivision points with a Gaussian kernel
   * amount ∈ [0, 1] controls the kernel width (0 = no smoothing, 1 = maximum)
   */
  static applySmoothing(edges: BundledEdge[], amount: number): BundledEdge[] {
    if (amount <= 0) return edges;

    // Kernel size based on amount (3 to 7 points)
    const kernelSize = Math.max(3, Math.min(7, Math.round(3 + amount * 4)));
    const sigma = 0.5 + amount * 1.5; // Gaussian sigma

    // Pre-compute Gaussian kernel
    const kernel: number[] = [];
    const half = Math.floor(kernelSize / 2);
    let sum = 0;

    for (let i = -half; i <= half; i++) {
      const weight = Math.exp(-(i * i) / (2 * sigma * sigma));
      kernel.push(weight);
      sum += weight;
    }

    // Normalize kernel
    for (let i = 0; i < kernel.length; i++) {
      kernel[i] /= sum;
    }

    return edges.map((e) => {
      const points = e.subdivisionPoints;
      if (points.length < 3) return e;

      const newPoints: Point[] = [points[0]]; // Keep source

      // Apply convolution to internal points
      for (let i = 1; i < points.length - 1; i++) {
        let sumX = 0;
        let sumY = 0;

        for (let k = 0; k < kernel.length; k++) {
          const j = i - half + k;
          // Clamp to valid range
          const idx = Math.max(0, Math.min(points.length - 1, j));
          sumX += points[idx].x * kernel[k];
          sumY += points[idx].y * kernel[k];
        }

        newPoints.push({ x: sumX, y: sumY });
      }

      newPoints.push(points[points.length - 1]); // Keep target

      return {
        ...e,
        subdivisionPoints: newPoints,
      };
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private Methods
  // ───────────────────────────────────────────────────────────────────────────

  private buildInternalEdges(): InternalEdge[] {
    const edges: InternalEdge[] = [];

    for (const e of this.edgeData) {
      const source = this.nodes.get(e.source);
      const target = this.nodes.get(e.target);

      if (!source || !target) continue;

      // Initialize with just source and target (will be subdivided)
      edges.push({
        sourceId: e.source,
        targetId: e.target,
        source: { ...source },
        target: { ...target },
        points: [{ ...source }, { ...target }],
        compatibleEdges: [],
      });
    }

    return edges;
  }

  private computeCompatibilities(edges: InternalEdge[]): void {
    const threshold = this.config.compatibilityThreshold;

    for (let i = 0; i < edges.length; i++) {
      const edgeI: Edge = { source: edges[i].source, target: edges[i].target };

      for (let j = i + 1; j < edges.length; j++) {
        const edgeJ: Edge = {
          source: edges[j].source,
          target: edges[j].target,
        };

        if (isCompatible(edgeI, edgeJ, threshold)) {
          edges[i].compatibleEdges.push(j);
          edges[j].compatibleEdges.push(i);
        }
      }
    }
  }

  private calculateAverageLength(edges: InternalEdge[]): number {
    if (edges.length === 0) return 100;

    let total = 0;
    for (const e of edges) {
      const dx = e.target.x - e.source.x;
      const dy = e.target.y - e.source.y;
      total += Math.sqrt(dx * dx + dy * dy);
    }

    return total / edges.length;
  }

  private subdivideEdges(edges: InternalEdge[]): void {
    for (const edge of edges) {
      const oldPoints = edge.points;
      const newPoints: Point[] = [oldPoints[0]]; // Keep source

      // Add midpoints between consecutive points
      for (let i = 0; i < oldPoints.length - 1; i++) {
        const p1 = oldPoints[i];
        const p2 = oldPoints[i + 1];

        // Add midpoint
        newPoints.push({
          x: (p1.x + p2.x) / 2,
          y: (p1.y + p2.y) / 2,
        });

        // Add next point (except for last iteration where target is added below)
        if (i < oldPoints.length - 2) {
          newPoints.push(p2);
        }
      }

      newPoints.push(oldPoints[oldPoints.length - 1]); // Keep target
      edge.points = newPoints;
    }
  }

  private runSimulation(
    edges: InternalEdge[],
    stepSize: number,
    iterations: number,
    kP: number,
  ): void {
    // Pre-calculate edge compatibilities as floats for force calculation
    const compatibilityCache = new Map<string, number>();

    for (let i = 0; i < edges.length; i++) {
      const edgeI: Edge = { source: edges[i].source, target: edges[i].target };

      for (const j of edges[i].compatibleEdges) {
        if (j > i) {
          const edgeJ: Edge = {
            source: edges[j].source,
            target: edges[j].target,
          };
          const compat = edgeCompatibility(edgeI, edgeJ);
          const key = `${i}-${j}`;
          compatibilityCache.set(key, compat.total);
        }
      }
    }

    // Run iterations
    for (let iter = 0; iter < iterations; iter++) {
      // Calculate forces for all subdivision points
      const forces: Point[][] = edges.map((e) => e.points.map(() => ({ x: 0, y: 0 })));

      for (let i = 0; i < edges.length; i++) {
        const edgeI = edges[i];
        const pointsI = edgeI.points;

        // For each subdivision point (skip source and target)
        for (let p = 1; p < pointsI.length - 1; p++) {
          const pi = pointsI[p];

          // Spring force (pulls toward neighbors on same edge)
          const prev = pointsI[p - 1];
          const next = pointsI[p + 1];

          const springFx = kP * (prev.x - pi.x + next.x - pi.x);
          const springFy = kP * (prev.y - pi.y + next.y - pi.y);

          forces[i][p].x += springFx;
          forces[i][p].y += springFy;

          // Electrostatic force (attracts compatible edges)
          for (const j of edgeI.compatibleEdges) {
            const edgeJ = edges[j];
            const pointsJ = edgeJ.points;

            // Get compatibility (use cached value)
            const key = i < j ? `${i}-${j}` : `${j}-${i}`;
            const Ce = compatibilityCache.get(key) || 0;

            if (Ce === 0) continue;

            // Find corresponding point on edge J
            // Use same proportional index
            const pJ = Math.min(p, pointsJ.length - 2);
            const qj = pointsJ[pJ];

            // Direction from pi to qj
            const dx = qj.x - pi.x;
            const dy = qj.y - pi.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Avoid division by zero and very strong forces
            if (dist < 1) continue;

            // TD-3: Attraction force weighted by compatibility
            // Inverse-quadratic (1/d²) gives more localized bundling, less "webbing"
            const force = this.config.useQuadratic
              ? Ce / (dist * dist) // Inverse-quadratic (Holten Fig 7d)
              : Ce / dist; // Inverse-linear (original)

            forces[i][p].x += dx * force;
            forces[i][p].y += dy * force;
          }
        }
      }

      // Apply forces with step size
      for (let i = 0; i < edges.length; i++) {
        const pointsI = edges[i].points;

        for (let p = 1; p < pointsI.length - 1; p++) {
          pointsI[p].x += forces[i][p].x * stepSize;
          pointsI[p].y += forces[i][p].y * stepSize;
        }
      }
    }
  }
}

/**
 * Convenience function for quick bundling
 */
export function bundleEdges(
  nodes: Map<string, Point>,
  edges: Array<{ source: string; target: string }>,
  config?: Partial<FDEBConfig>,
): BundledEdge[] {
  return new FDEBBundler(config).setNodes(nodes).setEdges(edges).bundle();
}
