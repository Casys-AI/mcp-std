/**
 * Bounded Force Layout - D3 Force Simulation with Viewport Constraints
 *
 * Wraps D3's force simulation with:
 * - Custom boundary force to keep nodes within viewport
 * - Bipartite layout hints (capabilities left, tools right)
 * - Collision detection between nodes
 *
 * Note: D3 is loaded from CDN in browser, accessed via globalThis.d3
 */

// deno-lint-ignore no-explicit-any
const d3 = (globalThis as any).d3;

import type { Point } from "./edge-compatibility.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BoundedForceConfig {
  /** Container width */
  width: number;
  /** Container height */
  height: number;
  /** Padding from edges (default: 50) */
  padding: number;
  /** Node repulsion strength (default: -150) */
  chargeStrength: number;
  /** Ideal link distance (default: 150) */
  linkDistance: number;
  /** Boundary push-back strength (default: 0.5) */
  boundaryStrength: number;
  /** Enable bipartite hints (capabilities left, tools right) */
  bipartiteMode: boolean;
  /** X-force strength for bipartite mode (default: 0.3) */
  bipartiteStrength: number;
  /** Enable server-based clustering (groups tools by MCP server) */
  serverClusterMode: boolean;
  /** Strength of server clustering force (default: 0.15) */
  serverClusterStrength: number;
}

// deno-lint-ignore no-explicit-any
export interface SimulationNode {
  id: string;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  nodeType?: "capability" | "tool";
  radius?: number;
  /** MCP server name for clustering */
  server?: string;
  /** Louvain community ID for clustering */
  community?: string;
}

// deno-lint-ignore no-explicit-any
export interface SimulationLink {
  source: string | SimulationNode;
  target: string | SimulationNode;
}

// ─────────────────────────────────────────────────────────────────────────────
// Default Configuration
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: BoundedForceConfig = {
  width: 800,
  height: 600,
  padding: 50,
  chargeStrength: -150,
  linkDistance: 150,
  boundaryStrength: 0.5,
  bipartiteMode: true,
  bipartiteStrength: 0.3,
  serverClusterMode: false,
  serverClusterStrength: 0.15,
};

// ─────────────────────────────────────────────────────────────────────────────
// Bounded Force Layout Class
// ─────────────────────────────────────────────────────────────────────────────

export class BoundedForceLayout {
  private config: BoundedForceConfig;
  // deno-lint-ignore no-explicit-any
  private simulation: any = null;
  private nodes: SimulationNode[] = [];

  constructor(config?: Partial<BoundedForceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create and return D3 force simulation with bounds
   */
  // deno-lint-ignore no-explicit-any
  createSimulation(nodes: SimulationNode[], links: SimulationLink[]): any {
    this.nodes = nodes;

    // Initialize node positions if not set
    this.initializePositions(nodes);

    // Create simulation with forces
    this.simulation = d3
      .forceSimulation(nodes)
      // Link force - pulls connected nodes together
      .force(
        "link",
        d3
          .forceLink(links)
          .id((d: SimulationNode) => d.id)
          .distance(this.config.linkDistance)
          .strength(0.3)
      )
      // Charge force - node repulsion
      .force(
        "charge",
        d3
          .forceManyBody()
          .strength(this.config.chargeStrength)
          .distanceMax(300)
      )
      // Collision force - prevent overlap
      .force(
        "collision",
        d3
          .forceCollide()
          .radius((d: SimulationNode) => (d.radius || 15) + 5)
          .strength(0.8)
      )
      // Custom boundary force
      .force("boundary", this.forceBoundary())
      // Center force (gentle pull to center)
      .force(
        "center",
        d3
          .forceCenter(this.config.width / 2, this.config.height / 2)
          .strength(0.02)
      );

    // Add bipartite X-force if enabled
    if (this.config.bipartiteMode) {
      this.simulation.force("bipartiteX", this.forceBipartiteX());
    }

    // Add server clustering force if enabled
    if (this.config.serverClusterMode) {
      this.simulation.force("serverCluster", this.forceServerCluster());
    }

    return this.simulation;
  }

  /**
   * Custom force that pushes nodes back into bounds
   */
  // deno-lint-ignore no-explicit-any
  forceBoundary(): any {
    const { width, height, padding, boundaryStrength } = this.config;

    const force = (alpha: number) => {
      for (const node of this.nodes) {
        const radius = node.radius || 15;

        // Left boundary
        if (node.x < padding + radius) {
          node.vx =
            (node.vx || 0) +
            (padding + radius - node.x) * boundaryStrength * alpha;
        }
        // Right boundary
        if (node.x > width - padding - radius) {
          node.vx =
            (node.vx || 0) +
            (width - padding - radius - node.x) * boundaryStrength * alpha;
        }
        // Top boundary
        if (node.y < padding + radius) {
          node.vy =
            (node.vy || 0) +
            (padding + radius - node.y) * boundaryStrength * alpha;
        }
        // Bottom boundary
        if (node.y > height - padding - radius) {
          node.vy =
            (node.vy || 0) +
            (height - padding - radius - node.y) * boundaryStrength * alpha;
        }
      }
    };

    return force;
  }

  /**
   * Bipartite X-force: capabilities left, tools right
   */
  // deno-lint-ignore no-explicit-any
  forceBipartiteX(): any {
    const { width, bipartiteStrength } = this.config;

    const leftTarget = width * 0.2; // 20% from left
    const rightTarget = width * 0.8; // 80% from left

    const force = (alpha: number) => {
      for (const node of this.nodes) {
        const targetX =
          node.nodeType === "capability" ? leftTarget : rightTarget;
        node.vx =
          (node.vx || 0) + (targetX - node.x) * bipartiteStrength * alpha;
      }
    };

    return force;
  }

  /**
   * Cluster force: groups nodes by Louvain community (preferred) or MCP server (fallback)
   * Capabilities go to center, tools cluster around their community/server position
   *
   * FDEB Optimization: If a community has only 1 member (singleton), fallback to server
   * to create meaningful clusters that enable edge bundling.
   */
  // deno-lint-ignore no-explicit-any
  forceServerCluster(): any {
    const { width, height, serverClusterStrength } = this.config;
    const centerX = width / 2;
    const centerY = height / 2;
    const clusterRadius = Math.min(width, height) * 0.35;

    // Calculate cluster positions once (memoized)
    let clusterPositions: Map<string, { x: number; y: number }> | null = null;
    let nodeClusterMap: Map<string, string> | null = null;

    const getClusterPositions = () => {
      if (clusterPositions && nodeClusterMap) return { positions: clusterPositions, nodeMap: nodeClusterMap };

      // Count members per community
      const communityCount = new Map<string, number>();
      for (const n of this.nodes) {
        if (n.nodeType === "capability") continue;
        const comm = n.community || "unknown";
        communityCount.set(comm, (communityCount.get(comm) || 0) + 1);
      }

      // Map each node to its effective cluster
      // If community is singleton, use server instead
      nodeClusterMap = new Map();
      for (const n of this.nodes) {
        if (n.nodeType === "capability") {
          nodeClusterMap.set(n.id, "capability");
        } else {
          const comm = n.community || "unknown";
          const count = communityCount.get(comm) || 0;
          // Use server if community is singleton (FDEB needs multi-member clusters)
          const effectiveCluster = count <= 1 ? (n.server || "unknown") : comm;
          nodeClusterMap.set(n.id, effectiveCluster);
        }
      }

      // Get unique cluster keys
      const clusterKeys = [...new Set(
        [...nodeClusterMap.values()].filter(k => k !== "capability")
      )];

      clusterPositions = new Map();

      // Capabilities cluster at center
      clusterPositions.set("capability", { x: centerX, y: centerY });

      // Arrange clusters in a circle
      clusterKeys.forEach((key, i) => {
        const angle = (2 * Math.PI * i) / clusterKeys.length - Math.PI / 2;
        clusterPositions!.set(key, {
          x: centerX + Math.cos(angle) * clusterRadius,
          y: centerY + Math.sin(angle) * clusterRadius,
        });
      });

      return { positions: clusterPositions, nodeMap: nodeClusterMap };
    };

    const force = (alpha: number) => {
      const { positions, nodeMap } = getClusterPositions();

      for (const node of this.nodes) {
        const clusterKey = nodeMap.get(node.id) || "unknown";
        const target = positions.get(clusterKey);
        if (target) {
          node.vx =
            (node.vx || 0) + (target.x - node.x) * serverClusterStrength * alpha;
          node.vy =
            (node.vy || 0) + (target.y - node.y) * serverClusterStrength * alpha;
        }
      }
    };

    return force;
  }

  /**
   * Initialize node positions (bipartite layout)
   */
  private initializePositions(nodes: SimulationNode[]): void {
    const { width, height, padding } = this.config;

    const capabilities = nodes.filter((n) => n.nodeType === "capability");
    const tools = nodes.filter((n) => n.nodeType === "tool");

    // Capabilities on left
    const capSpacing = (height - padding * 2) / Math.max(capabilities.length, 1);
    capabilities.forEach((node, i) => {
      if (node.x === undefined || node.x === 0) {
        node.x = width * 0.2 + (Math.random() - 0.5) * 30;
      }
      if (node.y === undefined || node.y === 0) {
        node.y = padding + (i + 0.5) * capSpacing + (Math.random() - 0.5) * 20;
      }
    });

    // Tools on right
    const toolSpacing = (height - padding * 2) / Math.max(tools.length, 1);
    tools.forEach((node, i) => {
      if (node.x === undefined || node.x === 0) {
        node.x = width * 0.8 + (Math.random() - 0.5) * 30;
      }
      if (node.y === undefined || node.y === 0) {
        node.y = padding + (i + 0.5) * toolSpacing + (Math.random() - 0.5) * 20;
      }
    });
  }

  /**
   * Update bounds (e.g., on resize)
   */
  setBounds(width: number, height: number): void {
    this.config.width = width;
    this.config.height = height;

    if (this.simulation) {
      // Update center force
      this.simulation.force(
        "center",
        d3.forceCenter(width / 2, height / 2).strength(0.02)
      );

      // Re-apply boundary force with new dimensions
      this.simulation.force("boundary", this.forceBoundary());

      // Re-apply bipartite force with new dimensions
      if (this.config.bipartiteMode) {
        this.simulation.force("bipartiteX", this.forceBipartiteX());
      }

      // Reheat simulation
      this.simulation.alpha(0.3).restart();
    }
  }

  /**
   * Get current node positions as Map
   */
  getNodePositions(): Map<string, Point> {
    const positions = new Map<string, Point>();

    for (const node of this.nodes) {
      positions.set(node.id, { x: node.x, y: node.y });
    }

    return positions;
  }

  /**
   * Stop simulation
   */
  stop(): void {
    if (this.simulation) {
      this.simulation.stop();
    }
  }

  /**
   * Restart simulation with alpha
   */
  restart(alpha: number = 0.3): void {
    if (this.simulation) {
      this.simulation.alpha(alpha).restart();
    }
  }

  /**
   * Get current alpha (simulation temperature)
   */
  getAlpha(): number {
    return this.simulation?.alpha() || 0;
  }

  /**
   * Check if simulation has stabilized
   */
  isStabilized(threshold: number = 0.01): boolean {
    return this.getAlpha() < threshold;
  }
}

/**
 * Convenience function to create a bounded force layout
 */
export function createBoundedForceLayout(
  nodes: SimulationNode[],
  links: SimulationLink[],
  config?: Partial<BoundedForceConfig>
): {
  // deno-lint-ignore no-explicit-any
  simulation: any;
  layout: BoundedForceLayout;
} {
  const layout = new BoundedForceLayout(config);
  const simulation = layout.createSimulation(nodes, links);

  return { simulation, layout };
}
