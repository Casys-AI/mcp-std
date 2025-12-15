/**
 * D3GraphVisualization Island - Radial Hierarchical Edge Bundling
 *
 * Based on Holten 2006 "Hierarchical Edge Bundles"
 * Layout: Tools on outer circle, Capabilities on inner circle
 * Bundling: D3's native curveBundle with tension parameter
 *
 * Story 8.3: Hypergraph view with capability hull zones
 */

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { type GraphNodeData } from "../components/ui/mod.ts";
import { GraphLegendPanel, GraphTooltip } from "../components/ui/mod.ts";
import {
  buildHierarchy,
  type CapabilityEdge,
  type HypergraphApiResponse,
  type RootNodeData,
  // DAG mode (Force-Directed with FDEB bundling)
  BoundedForceLayout,
  type SimulationNode,
  type SimulationLink,
  FDEBBundler,
  type BundledEdge,
} from "../utils/graph/index.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface D3GraphVisualizationProps {
  apiBase: string;
  /** Callback when a capability is selected */
  onCapabilitySelect?: (capability: CapabilityData | null) => void;
  /** Callback when a tool is selected */
  onToolSelect?: (tool: ToolData | null) => void;
  highlightedNodeId?: string | null;
}

/** Capability data for selection callback */
export interface CapabilityData {
  id: string;
  label: string;
  successRate: number;
  usageCount: number;
  toolsCount: number;
  codeSnippet?: string;
  toolIds?: string[];
  /** Spectral/Louvain community cluster ID */
  communityId?: number;
}

export interface ToolData {
  id: string;
  label: string;
  server: string;
  description?: string;
  parentCapabilities?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const COLOR_PALETTE = [
  "#FFB86F", // accent orange
  "#FF6B6B", // coral red
  "#4ECDC4", // teal
  "#FFE66D", // bright yellow
  "#95E1D3", // mint green
  "#F38181", // salmon pink
  "#AA96DA", // lavender
  "#FCBAD3", // light pink
  "#A8D8EA", // sky blue
  "#FF9F43", // bright orange
  "#6C5CE7", // purple
  "#00CEC9", // cyan
];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function D3GraphVisualization({
  apiBase: apiBaseProp,
  onCapabilitySelect,
  onToolSelect,
  highlightedNodeId,
}: D3GraphVisualizationProps) {
  const apiBase = apiBaseProp || "http://localhost:3003";

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Layout refs
  const hierarchyRef = useRef<RootNodeData | null>(null);
  const capEdgesRef = useRef<CapabilityEdge[]>([]);
  const toolEdgesRef = useRef<import("../utils/graph/index.ts").ToolEdge[]>([]);
  const emptyCapabilitiesRef = useRef<import("../utils/graph/index.ts").CapabilityNodeData[]>([]);
  // Data refs for callbacks
  const capabilityDataRef = useRef<Map<string, CapabilityData>>(new Map());
  const toolDataRef = useRef<Map<string, ToolData>>(new Map());

  // State
  const [servers, setServers] = useState<Set<string>>(new Set());
  const [hiddenServers, setHiddenServers] = useState<Set<string>>(new Set());
  const [showOrphanNodes, setShowOrphanNodes] = useState(false); // Off by default per plan
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; data: GraphNodeData } | null>(
    null,
  );
  const [capabilityTooltip, setCapabilityTooltip] = useState<
    { x: number; y: number; data: CapabilityData } | null
  >(null);

  // DAG Controls
  const [highlightDepth, setHighlightDepth] = useState(1); // 1 = direct connections only, Infinity = full stack
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // DAG mode refs
  const forceLayoutRef = useRef<BoundedForceLayout | null>(null);
  const simulationNodesRef = useRef<SimulationNode[]>([]);
  const bundledEdgesRef = useRef<BundledEdge[]>([]);

  // Server colors
  const serverColorsRef = useRef<Map<string, string>>(new Map());

  const getServerColor = useCallback((server: string): string => {
    if (server === "unknown") return "#8a8078";
    if (server === "capability") return "#8b5cf6"; // Purple for capabilities
    if (!serverColorsRef.current.has(server)) {
      const index = serverColorsRef.current.size % COLOR_PALETTE.length;
      serverColorsRef.current.set(server, COLOR_PALETTE[index]);
    }
    return serverColorsRef.current.get(server)!;
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // D3 Initialization
  // ───────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    console.log("[RadialHEB] Component mounted, apiBase:", apiBase);
    let isMounted = true;

    // Initialize SVG
    if (!svgRef.current && containerRef.current) {
      if (typeof window === "undefined" || !containerRef.current) return;

      // @ts-ignore - D3 loaded from CDN
      const d3 = globalThis.d3;
      if (!d3) {
        console.error("D3 not loaded");
        return;
      }

      const container = containerRef.current;
      const width = container.clientWidth;
      const height = container.clientHeight;

      // Create SVG
      const svg = d3
        .select(container)
        .append("svg")
        .attr("width", "100%")
        .attr("height", "100%")
        .attr("viewBox", [0, 0, width, height])
        .style("background", "transparent")
        .on("click", (event: MouseEvent) => {
          if (event.target === svgRef.current) {
            onToolSelect?.(null);
            onCapabilitySelect?.(null);
            clearHighlight();
          }
        });

      svgRef.current = svg.node();

      // Main group for zoom/pan
      const g = svg.append("g").attr("class", "graph-container");

      // Layers: edges first, then nodes on top
      const edgeLayer = g.append("g").attr("class", "edges");
      const nodeLayer = g.append("g").attr("class", "nodes");
      const labelLayer = g.append("g").attr("class", "labels");

      // Zoom behavior
      const zoom = d3
        .zoom()
        .scaleExtent([0.3, 3])
        .on("zoom", (event: any) => {
          g.attr("transform", event.transform);
        });

      svg.call(zoom);

      // Store references
      (window as any).__radialGraph = {
        svg,
        g,
        edgeLayer,
        nodeLayer,
        labelLayer,
        zoom,
        width,
        height,
      };
    }

    const loadData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        await loadRadialData();
      } catch (err) {
        console.error("[RadialHEB] Data load error:", err);
        setError(err instanceof Error ? err.message : "Failed to load graph data");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadData();

    // SSE for real-time updates
    const eventSource = new EventSource(`${apiBase}/events/stream`);
    let hadError = false;

    eventSource.onopen = () => {
      if (hadError) {
        loadData();
        hadError = false;
      }
    };
    eventSource.onerror = () => {
      hadError = true;
    };

    const handleReload = () => loadData();
    eventSource.addEventListener("node_created", handleReload);
    eventSource.addEventListener("capability.zone.created", handleReload);

    return () => {
      isMounted = false;
      eventSource.close();
      if (svgRef.current) {
        svgRef.current.remove();
        svgRef.current = null;
      }
      delete (window as any).__radialGraph;
    };
  }, [apiBase]);

  // ───────────────────────────────────────────────────────────────────────────
  // Data Loading
  // ───────────────────────────────────────────────────────────────────────────

  const loadRadialData = async () => {
    const response = await fetch(`${apiBase}/api/graph/hypergraph`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: HypergraphApiResponse = await response.json();
    // deno-lint-ignore no-explicit-any
    const graph = (window as any).__radialGraph;
    if (!graph) return;

    // 1. Build hierarchy from flat data
    const { root, capabilityEdges, toolEdges, orphanTools, emptyCapabilities, stats } = buildHierarchy(data);

    console.log("[RadialHEB] Built hierarchy:", stats);

    hierarchyRef.current = root;
    capEdgesRef.current = capabilityEdges;
    toolEdgesRef.current = toolEdges;
    emptyCapabilitiesRef.current = emptyCapabilities;

    // 2. Store capability/tool data for callbacks
    const capMap = new Map<string, CapabilityData>();
    const toolMap = new Map<string, ToolData>();

    for (const cap of root.children) {
      capMap.set(cap.id, {
        id: cap.id,
        label: cap.name,
        successRate: cap.successRate,
        usageCount: cap.usageCount,
        toolsCount: cap.children.length,
        codeSnippet: cap.codeSnippet,
        toolIds: cap.children.map((t) => t.id),
        communityId: cap.communityId,
      });

      for (const tool of cap.children) {
        toolMap.set(tool.id, {
          id: tool.id,
          label: tool.name,
          server: tool.server,
          parentCapabilities: tool.parentCapabilities,
        });
      }
    }

    // Add orphans to toolMap if showOrphanNodes is enabled
    for (const tool of orphanTools) {
      toolMap.set(tool.id, {
        id: tool.id,
        label: tool.name,
        server: tool.server,
        parentCapabilities: [],
      });
    }

    // Add empty capabilities to capMap
    for (const cap of emptyCapabilitiesRef.current) {
      capMap.set(cap.id, {
        id: cap.id,
        label: cap.name,
        successRate: cap.successRate,
        usageCount: cap.usageCount,
        toolsCount: 0,
        codeSnippet: cap.codeSnippet,
        toolIds: [],
        communityId: cap.communityId,
      });
    }

    capabilityDataRef.current = capMap;
    toolDataRef.current = toolMap;

    // 3. Update servers list from tools
    const serverSet = new Set<string>();
    for (const cap of root.children) {
      for (const tool of cap.children) {
        serverSet.add(tool.server || "unknown");
      }
    }
    setServers(serverSet);

    console.log("[DAG] Data loaded:", root.children.length, "capabilities,", serverSet.size, "servers");

    // 4. Render DAG
    renderDagGraph();
  };

  // ───────────────────────────────────────────────────────────────────────────
  // DAG Mode Rendering (Force-Directed with FDEB bundling)
  // ───────────────────────────────────────────────────────────────────────────

  const renderDagGraph = useCallback(() => {
    const graph = (window as any).__radialGraph;
    if (!graph || !hierarchyRef.current) return;

    // @ts-ignore
    const d3 = globalThis.d3;
    const { edgeLayer, nodeLayer, labelLayer, width, height } = graph;

    // Clear existing
    edgeLayer.selectAll("*").remove();
    nodeLayer.selectAll("*").remove();
    labelLayer.selectAll("*").remove();

    // Reset edge layer transform (DAG uses cartesian coordinates)
    edgeLayer.attr("transform", null);

    // Build simulation nodes from hierarchy
    const simNodes: SimulationNode[] = [];
    const simLinks: SimulationLink[] = [];

    // Add capabilities as nodes
    for (const cap of hierarchyRef.current.children) {
      simNodes.push({
        id: cap.id,
        x: width * 0.2,
        y: 0,
        nodeType: "capability",
        radius: 15 + Math.min(cap.usageCount * 0.5, 10),
        community: String(cap.communityId ?? "unknown"),
      });

      // Add tools as nodes
      for (const tool of cap.children) {
        if (!simNodes.find((n) => n.id === tool.id)) {
          simNodes.push({
            id: tool.id,
            x: width * 0.8,
            y: 0,
            nodeType: "tool",
            radius: 8 + Math.min(tool.pagerank * 20, 8),
            server: tool.server,
            community: tool.communityId ?? tool.server,
          });
        }

        // Add cap->tool link
        simLinks.push({
          source: cap.id,
          target: tool.id,
        });
      }
    }

    // Add empty capabilities
    for (const cap of emptyCapabilitiesRef.current) {
      if (!simNodes.find((n) => n.id === cap.id)) {
        simNodes.push({
          id: cap.id,
          x: width * 0.2,
          y: 0,
          nodeType: "capability",
          radius: 12,
          community: String(cap.communityId ?? "unknown"),
        });
      }
    }

    // Build set of existing node IDs for edge validation
    const nodeIds = new Set(simNodes.map(n => n.id));

    // Add tool->tool edges (sequences) - only if both nodes exist
    for (const edge of toolEdgesRef.current) {
      if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
        simLinks.push({
          source: edge.source,
          target: edge.target,
        });
      }
    }

    // Add cap->cap edges - only if both nodes exist
    for (const edge of capEdgesRef.current) {
      if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
        simLinks.push({
          source: edge.source,
          target: edge.target,
        });
      }
    }

    simulationNodesRef.current = simNodes;

    // Create force layout
    const forceLayout = new BoundedForceLayout({
      width,
      height,
      padding: 60,
      chargeStrength: -200,
      linkDistance: 120,
      boundaryStrength: 0.6,
      bipartiteMode: true,
      bipartiteStrength: 0.2,
      serverClusterMode: true,
      serverClusterStrength: 0.12,
    });

    const simulation = forceLayout.createSimulation(simNodes, simLinks);
    forceLayoutRef.current = forceLayout;

    // Create line generator for bundled edges
    const line = d3.line()
      .x((d: { x: number }) => d.x)
      .y((d: { y: number }) => d.y)
      .curve(d3.curveBasis);

    // Render nodes
    const nodeGroups = nodeLayer
      .selectAll(".dag-node")
      .data(simNodes, (d: SimulationNode) => d.id)
      .enter()
      .append("g")
      .attr("class", (d: SimulationNode) => `dag-node dag-${d.nodeType}`)
      .style("cursor", "pointer");

    // Node circles
    nodeGroups
      .append("circle")
      .attr("r", (d: SimulationNode) => d.radius || 10)
      .attr("fill", (d: SimulationNode) => {
        if (d.nodeType === "capability") return "#8b5cf6";
        return getServerColor(d.server || "unknown");
      })
      .attr("stroke", "rgba(255,255,255,0.3)")
      .attr("stroke-width", 2);

    // Node labels
    nodeGroups
      .append("text")
      .attr("dy", (d: SimulationNode) => (d.radius || 10) + 12)
      .attr("text-anchor", "middle")
      .attr("fill", (d: SimulationNode) => d.nodeType === "capability" ? "#fff" : "#d5c3b5")
      .attr("font-size", "9px")
      .text((d: SimulationNode) => {
        const data = d.nodeType === "capability"
          ? capabilityDataRef.current.get(d.id)
          : toolDataRef.current.get(d.id);
        const label = data?.label || d.id;
        return label.length > 12 ? label.slice(0, 10) + ".." : label;
      });

    // Render simple edges initially (will be bundled after simulation stabilizes)
    const edgePaths = edgeLayer
      .selectAll(".dag-edge")
      .data(simLinks, (d: SimulationLink) => `${typeof d.source === 'string' ? d.source : d.source.id}-${typeof d.target === 'string' ? d.target : d.target.id}`)
      .enter()
      .append("path")
      .attr("class", "dag-edge")
      .attr("fill", "none")
      .attr("stroke", "#888")
      .attr("stroke-width", 1.5)
      .attr("stroke-opacity", 0.4);

    // Event handlers (unified with Sunburst mode)
    nodeGroups
      .on("click", (_event: any, d: SimulationNode) => {
        if (d.nodeType === "capability") {
          const capData = capabilityDataRef.current.get(d.id);
          if (capData) {
            onCapabilitySelect?.(capData);
            onToolSelect?.(null);
            highlightNode(d.id); // Unified highlight
          }
        } else {
          const toolData = toolDataRef.current.get(d.id);
          if (toolData) {
            onToolSelect?.(toolData);
            onCapabilitySelect?.(null);
            highlightNode(d.id); // Unified highlight
          }
        }
      })
      .on("mouseenter", (event: MouseEvent, d: SimulationNode) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        // Show tooltip
        if (d.nodeType === "capability") {
          const capData = capabilityDataRef.current.get(d.id);
          if (capData) {
            setCapabilityTooltip({
              x: event.clientX - rect.left,
              y: event.clientY - rect.top,
              data: capData,
            });
          }
        } else {
          const toolData = toolDataRef.current.get(d.id);
          if (toolData) {
            setTooltip({
              x: event.clientX - rect.left,
              y: event.clientY - rect.top - 10,
              data: {
                id: d.id,
                label: toolData.label,
                server: toolData.server,
                pagerank: 0,
                degree: 0,
                parents: toolData.parentCapabilities || [],
              },
            });
          }
        }

        // Unified highlight (dims nodes + edges)
        highlightConnectedEdges(d.id);
      })
      .on("mouseleave", () => {
        setTooltip(null);
        setCapabilityTooltip(null);
        resetEdgeHighlight(); // Unified reset (respects selection)
      });

    // Simulation tick
    simulation.on("tick", () => {
      nodeGroups.attr("transform", (d: SimulationNode) => `translate(${d.x},${d.y})`);

      // Update edge positions
      edgePaths.attr("d", (d: SimulationLink) => {
        const src = typeof d.source === 'string' ? simNodes.find(n => n.id === d.source) : d.source;
        const tgt = typeof d.target === 'string' ? simNodes.find(n => n.id === d.target) : d.target;
        if (!src || !tgt) return "";
        return line([{ x: src.x, y: src.y }, { x: tgt.x, y: tgt.y }]);
      });
    });

    // Run FDEB bundling after simulation stabilizes
    simulation.on("end", () => {
      console.log("[DAG] Simulation stabilized, running FDEB bundling...");

      // Build node positions map
      const nodePositions = new Map<string, { x: number; y: number }>();
      for (const node of simNodes) {
        nodePositions.set(node.id, { x: node.x, y: node.y });
      }

      // Build edges for bundler
      const edgesForBundler: Array<{ source: string; target: string }> = [];
      for (const link of simLinks) {
        const srcId = typeof link.source === 'string' ? link.source : (link.source as SimulationNode).id;
        const tgtId = typeof link.target === 'string' ? link.target : (link.target as SimulationNode).id;
        edgesForBundler.push({ source: srcId, target: tgtId });
      }

      // Run FDEB with params from d3.ForceBundle reference implementation
      // https://github.com/upphiminn/d3.ForceBundle
      const bundler = new FDEBBundler({
        K: 0.1, // Spring constant
        S0: 0.1, // Step size (ref: 0.1 default)
        I0: 90, // Iterations per cycle (ref: 90 default)
        cycles: 6, // Full 6 cycles for proper bundling
        compatibilityThreshold: 0.6, // Only bundle edges with >= 60% compatibility (ref: 0.6 default)
        useQuadratic: true, // Inverse-quadratic for localized bundling (Fig 7d)
      });

      let bundledEdges = bundler
        .setNodes(nodePositions)
        .setEdges(edgesForBundler)
        .bundle();

      // Apply Gaussian smoothing to reduce jaggedness (Holten Section 3.3)
      bundledEdges = FDEBBundler.applySmoothing(bundledEdges, 0.5);

      bundledEdgesRef.current = bundledEdges;

      console.log("[DAG] FDEB bundling complete:", bundledEdges.length, "edges");

      // Build a map for quick lookup: "sourceId-targetId" -> bundledEdge
      const bundledEdgeMap = new Map<string, BundledEdge>();
      for (const bundled of bundledEdges) {
        bundledEdgeMap.set(`${bundled.sourceId}-${bundled.targetId}`, bundled);
      }

      // Update edge paths with bundled data
      edgePaths
        .transition()
        .duration(500)
        .attr("d", (d: SimulationLink) => {
          const srcId = typeof d.source === 'string' ? d.source : (d.source as SimulationNode).id;
          const tgtId = typeof d.target === 'string' ? d.target : (d.target as SimulationNode).id;
          const bundled = bundledEdgeMap.get(`${srcId}-${tgtId}`);

          if (bundled && bundled.subdivisionPoints.length > 0) {
            return line(bundled.subdivisionPoints);
          }
          // Fallback to straight line
          const src = typeof d.source === 'string' ? simNodes.find(n => n.id === d.source) : d.source;
          const tgt = typeof d.target === 'string' ? simNodes.find(n => n.id === d.target) : d.target;
          if (!src || !tgt) return "";
          return line([{ x: src.x, y: src.y }, { x: tgt.x, y: tgt.y }]);
        });
    });

  }, [getServerColor, onCapabilitySelect, onToolSelect]);

  // ───────────────────────────────────────────────────────────────────────────
  // Highlighting (unified for both Sunburst and DAG modes)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Build adjacency map from edges for DAG mode
   */
  const buildAdjacencyMap = useCallback(() => {
    const adjacency = new Map<string, Set<string>>();

    // DAG mode - use capEdges + toolEdges
    for (const edge of capEdgesRef.current) {
      if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
      if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set());
      adjacency.get(edge.source)!.add(edge.target);
      adjacency.get(edge.target)!.add(edge.source);
    }
    for (const edge of toolEdgesRef.current) {
      if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
      if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set());
      adjacency.get(edge.source)!.add(edge.target);
      adjacency.get(edge.target)!.add(edge.source);
    }
    // Also add cap->tool containment edges
    if (hierarchyRef.current) {
      for (const cap of hierarchyRef.current.children) {
        for (const tool of cap.children) {
          if (!adjacency.has(cap.id)) adjacency.set(cap.id, new Set());
          if (!adjacency.has(tool.id)) adjacency.set(tool.id, new Set());
          adjacency.get(cap.id)!.add(tool.id);
          adjacency.get(tool.id)!.add(cap.id);
        }
      }
    }

    return adjacency;
  }, []);

  /**
   * Get connected nodes using BFS with depth limit
   */
  const getConnectedNodes = useCallback((nodeId: string, maxDepth: number = highlightDepth) => {
    const adjacency = buildAdjacencyMap();
    const connected = new Set<string>([nodeId]);
    const queue: Array<{ id: string; depth: number }> = [{ id: nodeId, depth: 0 }];

    while (queue.length > 0) {
      const { id: current, depth } = queue.shift()!;
      if (depth >= maxDepth) continue;

      const neighbors = adjacency.get(current);
      if (neighbors) {
        for (const neighbor of neighbors) {
          if (!connected.has(neighbor)) {
            connected.add(neighbor);
            queue.push({ id: neighbor, depth: depth + 1 });
          }
        }
      }
    }
    return connected;
  }, [buildAdjacencyMap, highlightDepth]);

  /**
   * Apply highlight to nodes and edges (DAG mode)
   */
  const applyHighlight = useCallback((nodeId: string | null, isHover: boolean = false) => {
    // deno-lint-ignore no-explicit-any
    const graph = (window as any).__radialGraph;
    if (!graph) return;

    const duration = isHover ? 100 : 200;
    const nodeSelector = ".dag-node";
    const edgeSelector = ".dag-edge";

    if (!nodeId) {
      // Reset all to default
      graph.nodeLayer.selectAll(nodeSelector)
        .transition().duration(duration)
        .attr("opacity", 1);

      graph.edgeLayer.selectAll(edgeSelector)
        .transition().duration(duration)
        .attr("stroke-opacity", 0.4)
        .attr("stroke-width", 1.5);
      return;
    }

    const connected = getConnectedNodes(nodeId);

    // Dim non-connected nodes
    graph.nodeLayer.selectAll(nodeSelector)
      .transition().duration(duration)
      // deno-lint-ignore no-explicit-any
      .attr("opacity", (d: any) => {
        const id = d.id || d.data?.id;
        return connected.has(id) ? 1 : 0.2;
      });

    // Highlight connected edges
    graph.edgeLayer.selectAll(edgeSelector)
      .transition().duration(duration)
      .attr("stroke-opacity", (d: SimulationLink) => {
        const srcId = typeof d.source === 'string' ? d.source : (d.source as SimulationNode).id;
        const tgtId = typeof d.target === 'string' ? d.target : (d.target as SimulationNode).id;
        const inStack = connected.has(srcId) && connected.has(tgtId);
        return inStack ? 0.9 : 0.05;
      })
      .attr("stroke-width", (d: SimulationLink) => {
        const srcId = typeof d.source === 'string' ? d.source : (d.source as SimulationNode).id;
        const tgtId = typeof d.target === 'string' ? d.target : (d.target as SimulationNode).id;
        const inStack = connected.has(srcId) && connected.has(tgtId);
        return inStack ? (isHover ? 2.5 : 3) : 1;
      });
  }, [getConnectedNodes]);

  /**
   * Handle node selection (click)
   */
  const handleNodeSelect = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
    applyHighlight(nodeId, false);
  }, [applyHighlight]);

  /**
   * Handle node hover (mouseenter/mouseleave)
   */
  const handleNodeHover = useCallback((nodeId: string | null) => {
    // If there's a selection, don't override it on hover
    if (selectedNodeId && !nodeId) {
      // Mouse left, restore selection highlight
      applyHighlight(selectedNodeId, false);
    } else if (nodeId) {
      // Mouse entered a node
      applyHighlight(nodeId, true);
    } else {
      // No selection, no hover - reset all
      applyHighlight(null);
    }
  }, [selectedNodeId, applyHighlight]);

  // Legacy wrappers for backward compatibility
  const highlightConnectedEdges = (nodeId: string) => handleNodeHover(nodeId);
  const resetEdgeHighlight = () => handleNodeHover(null);
  const highlightNode = (nodeId: string) => handleNodeSelect(nodeId);
  const clearHighlight = () => handleNodeSelect(null);

  // ───────────────────────────────────────────────────────────────────────────
  // Server Visibility
  // ───────────────────────────────────────────────────────────────────────────

  const toggleServer = (server: string) => {
    const newHidden = new Set(hiddenServers);
    if (newHidden.has(server)) {
      newHidden.delete(server);
    } else {
      newHidden.add(server);
    }
    setHiddenServers(newHidden);
    // TODO: Filter and re-render
  };

  const toggleOrphanNodes = () => {
    setShowOrphanNodes(!showOrphanNodes);
    // TODO: Re-load with orphans included/excluded
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Export
  // ───────────────────────────────────────────────────────────────────────────

  const exportGraph = (format: "json" | "png") => {
    if (format === "json") {
      const data = {
        capabilities: Array.from(capabilityDataRef.current.values()),
        tools: Array.from(toolDataRef.current.values()),
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `graph-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Effect: Handle external highlight
  // ───────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (highlightedNodeId) {
      highlightNode(highlightedNodeId);
    } else {
      clearHighlight();
    }
  }, [highlightedNodeId]);


  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <>
      <div ref={containerRef} class="w-full h-full absolute top-0 left-0" />

      {/* Loading Spinner */}
      {isLoading && (
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
          <div class="flex flex-col items-center gap-3">
            <div
              class="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin"
              style={{ color: "var(--accent, #FFB86F)" }}
            />
            <span class="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
              Loading graph...
            </span>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && !isLoading && (
        <div
          class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 max-w-md text-center p-6 rounded-xl"
          style={{
            background: "var(--bg-elevated, #12110f)",
            border: "1px solid var(--border, rgba(255, 184, 111, 0.1))",
          }}
        >
          <div class="text-4xl mb-3">📊</div>
          <p style={{ color: "var(--text-muted, #d5c3b5)" }}>{error}</p>
        </div>
      )}

      {/* Legend Panel with Tension Slider */}
      <GraphLegendPanel
        servers={servers}
        hiddenServers={hiddenServers}
        showOrphanNodes={showOrphanNodes}
        getServerColor={getServerColor}
        onToggleServer={toggleServer}
        onToggleOrphans={toggleOrphanNodes}
        onExportJson={() => exportGraph("json")}
        onExportPng={() => exportGraph("png")}
        // Highlight depth control
        highlightDepth={highlightDepth === Infinity ? 10 : highlightDepth}
        onHighlightDepthChange={setHighlightDepth}
      />

      {/* Tool Tooltip */}
      {tooltip && (
        <GraphTooltip
          data={tooltip.data}
          x={tooltip.x}
          y={tooltip.y}
          serverColor={getServerColor(tooltip.data.server)}
        />
      )}

      {/* Capability Tooltip */}
      {capabilityTooltip && (
        <div
          class="absolute z-50 pointer-events-none"
          style={{
            left: `${capabilityTooltip.x}px`,
            top: `${capabilityTooltip.y - 10}px`,
            transform: "translateX(-50%) translateY(-100%)",
          }}
        >
          <div
            class="px-3 py-2 rounded-lg shadow-xl border backdrop-blur-md"
            style={{
              background: "var(--bg-elevated, #12110f)",
              borderColor: "var(--border, rgba(255, 184, 111, 0.1))",
            }}
          >
            <div class="font-bold text-sm text-white mb-1">{capabilityTooltip.data.label}</div>
            <div class="text-xs text-gray-400">
              {capabilityTooltip.data.toolsCount} tools •{" "}
              {Math.round(capabilityTooltip.data.successRate * 100)}% success
              {capabilityTooltip.data.communityId !== undefined && (
                <> • C{capabilityTooltip.data.communityId}</>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
