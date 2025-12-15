/**
 * CytoscapeGraph Island - Advanced graph visualization using Cytoscape.js
 *
 * Features:
 * - Compound nodes (Capabilities contain Tools and other Capabilities)
 * - Expand/Collapse functionality for hierarchical navigation
 * - Two view modes: Capabilities (hierarchical) and Tools (flat)
 * - Configurable highlight depth for exploring connections
 * - Integration with CodePanel for code/schema display
 *
 * @module web/islands/CytoscapeGraph
 */

import { useCallback, useEffect, useRef, useState } from "preact/hooks";

// Types matching the API response (snake_case from server)
interface ApiNodeData {
  id: string;
  type: "capability" | "tool" | "tool_invocation";
  label: string;
  // Capability fields
  code_snippet?: string;
  success_rate?: number;
  usage_count?: number;
  tools_count?: number;
  pagerank?: number;
  // Tool fields
  server?: string;
  parent?: string;
  parents?: string[];
  degree?: number;
  community_id?: number;
  // Tool invocation fields
  tool?: string; // The underlying tool ID (e.g., "filesystem:read_file")
  ts?: number; // Timestamp when invocation started
  duration_ms?: number; // Execution duration
  sequence_index?: number; // Sequence index within capability
}

interface ApiNode {
  data: ApiNodeData;
}

interface ApiEdgeData {
  id: string;
  source: string;
  target: string;
  edge_type?: string;
  edgeType?: string;
  weight?: number;
  observed_count?: number;
  // Sequence edge fields
  time_delta_ms?: number;
  is_parallel?: boolean;
}

interface ApiEdge {
  data: ApiEdgeData;
}

interface HypergraphApiResponse {
  nodes: ApiNode[];
  edges: ApiEdge[];
  capabilities_count: number;
  tools_count: number;
}

// Transformed types for internal use
interface CapabilityNode {
  id: string;
  name: string;
  type: "capability";
  successRate: number;
  usageCount: number;
  communityId?: number;
  codeSnippet?: string;
  toolsCount?: number;
  parentCapabilityId?: string;
}

interface ToolNode {
  id: string;
  name: string;
  type: "tool";
  server: string;
  pagerank: number;
  parentCapabilities: string[];
  inputSchema?: Record<string, unknown>;
  description?: string;
}

interface ToolInvocationNode {
  id: string;
  name: string;
  type: "tool_invocation";
  tool: string; // Underlying tool ID
  server: string;
  parentCapability: string;
  ts: number;
  durationMs: number;
  sequenceIndex: number;
}

interface Edge {
  source: string;
  target: string;
  edgeType: "hierarchy" | "contains" | "sequence" | "dependency" | "capability_link" | "uses";
  weight?: number;
  observedCount?: number;
  // Sequence edge specific
  timeDeltaMs?: number;
  isParallel?: boolean;
}

interface TransformedData {
  capabilities: CapabilityNode[];
  tools: ToolNode[];
  invocations: ToolInvocationNode[];
  edges: Edge[];
}

export interface CapabilityData {
  id: string;
  label: string;
  successRate: number;
  usageCount: number;
  toolsCount: number;
  codeSnippet?: string;
  toolIds?: string[];
  childCapabilityIds?: string[];
  communityId?: number;
  lastUsedAt?: number;
  createdAt?: number;
}

export interface ToolData {
  id: string;
  label: string;
  server: string;
  description?: string;
  parentCapabilities?: string[];
  inputSchema?: Record<string, unknown>;
  observedCount?: number;
}

/** View mode for the graph */
export type ViewMode = "capabilities" | "tools";

/** Layout direction */
export type LayoutDirection = "TB" | "LR";

interface CytoscapeGraphProps {
  apiBase: string;
  onCapabilitySelect?: (capability: CapabilityData | null) => void;
  onToolSelect?: (tool: ToolData | null) => void;
  onNodeSelect?: (node: { id: string; label: string; server: string } | null) => void;
  highlightedNodeId?: string | null;
  pathNodes?: string[] | null;
  /** Highlight depth (1 = direct connections, Infinity = full stack) */
  highlightDepth?: number;
  /** Current view mode */
  viewMode?: ViewMode;
  /** Layout direction (TB = top-bottom, LR = left-right) */
  layoutDirection?: LayoutDirection;
  /** Callback when expand/collapse state changes */
  onExpandedNodesChange?: (expandedIds: Set<string>) => void;
  /** External control of expanded nodes */
  expandedNodes?: Set<string>;
  /** Key to trigger data refresh (increment to refetch) */
  refreshKey?: number;
}

// Color palette for servers
const SERVER_COLORS = [
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

// Capability colors by zone/category
const CAPABILITY_COLORS = [
  "#8b5cf6", // violet (default)
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#84cc16", // lime
];

export default function CytoscapeGraph({
  apiBase,
  onCapabilitySelect,
  onToolSelect,
  onNodeSelect,
  highlightedNodeId,
  pathNodes,
  highlightDepth = 1,
  viewMode = "capabilities",
  layoutDirection = "TB",
  onExpandedNodesChange,
  expandedNodes: externalExpandedNodes,
  refreshKey = 0,
}: CytoscapeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // deno-lint-ignore no-explicit-any
  const cyRef = useRef<any>(null);
  const serverColorsRef = useRef<Map<string, string>>(new Map());
  const capabilityColorsRef = useRef<Map<string, string>>(new Map());

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [internalExpandedNodes, setInternalExpandedNodes] = useState<Set<string>>(new Set());

  // Use external expanded nodes if provided, otherwise use internal state
  const expandedNodes = externalExpandedNodes ?? internalExpandedNodes;
  const setExpandedNodes = useCallback(
    (nodes: Set<string> | ((prev: Set<string>) => Set<string>)) => {
      if (externalExpandedNodes !== undefined && onExpandedNodesChange) {
        const newNodes = typeof nodes === "function" ? nodes(externalExpandedNodes) : nodes;
        onExpandedNodesChange(newNodes);
      } else {
        setInternalExpandedNodes(nodes as Set<string>);
      }
    },
    [externalExpandedNodes, onExpandedNodesChange],
  );

  // Store data for callbacks
  const capabilityDataRef = useRef<Map<string, CapabilityData>>(new Map());
  const toolDataRef = useRef<Map<string, ToolData>>(new Map());
  const rawDataRef = useRef<TransformedData | null>(null);

  const getServerColor = useCallback((server: string): string => {
    if (server === "unknown") return "#8a8078";
    if (!serverColorsRef.current.has(server)) {
      const index = serverColorsRef.current.size % SERVER_COLORS.length;
      serverColorsRef.current.set(server, SERVER_COLORS[index]);
    }
    return serverColorsRef.current.get(server)!;
  }, []);

  const getCapabilityColor = useCallback((capId: string, communityId?: number): string => {
    if (!capabilityColorsRef.current.has(capId)) {
      const index = communityId ?? capabilityColorsRef.current.size;
      capabilityColorsRef.current.set(capId, CAPABILITY_COLORS[index % CAPABILITY_COLORS.length]);
    }
    return capabilityColorsRef.current.get(capId)!;
  }, []);

  // Count children (tools + nested capabilities) for badge
  const countChildren = useCallback((capId: string): { tools: number; caps: number } => {
    const data = rawDataRef.current;
    if (!data) return { tools: 0, caps: 0 };

    const tools = data.tools.filter((t) => t.parentCapabilities.includes(capId)).length;
    const caps = data.capabilities.filter((c) => c.parentCapabilityId === capId).length;
    return { tools, caps };
  }, []);

  // Initialize Cytoscape
  useEffect(() => {
    if (!containerRef.current) return;

    // deno-lint-ignore no-explicit-any
    const cy = (globalThis as any).cytoscape;
    if (!cy) {
      setError("Cytoscape.js not loaded");
      return;
    }

    // Create Cytoscape instance with compound node support
    cyRef.current = cy({
      container: containerRef.current,
      style: getCytoscapeStyles(),
      layout: { name: "preset" },
      wheelSensitivity: 0.3,
      minZoom: 0.1,
      maxZoom: 3,
    });

    // Load data
    loadData();

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, []);

  // Refetch data when refreshKey changes (for SSE incremental updates)
  const prevRefreshKeyRef = useRef(refreshKey);
  useEffect(() => {
    // Skip initial render (loadData already called in init useEffect)
    if (prevRefreshKeyRef.current === refreshKey) return;
    prevRefreshKeyRef.current = refreshKey;

    // Refetch data - Cytoscape instance already exists
    if (cyRef.current) {
      loadData();
    }
  }, [refreshKey]);

  // Track previous values for incremental updates
  const prevViewModeRef = useRef(viewMode);
  const prevLayoutDirectionRef = useRef(layoutDirection);
  const isInitialRenderRef = useRef(true);

  // Re-render when view mode or layout direction change (full re-render)
  useEffect(() => {
    if (!rawDataRef.current || !cyRef.current) return;

    const viewModeChanged = prevViewModeRef.current !== viewMode;
    const layoutChanged = prevLayoutDirectionRef.current !== layoutDirection;

    if (isInitialRenderRef.current || viewModeChanged || layoutChanged) {
      renderGraph(true); // Full render with layout
      isInitialRenderRef.current = false;
    } else {
      // Just expand/collapse changed - do incremental update
      renderGraph(false); // Incremental update, no full layout
    }

    prevViewModeRef.current = viewMode;
    prevLayoutDirectionRef.current = layoutDirection;
  }, [viewMode, expandedNodes, layoutDirection]);

  const getCytoscapeStyles = () => [
    // Capability nodes (always expanded - bento boxes)
    {
      selector: 'node[type="capability"]',
      style: {
        "background-color": "data(bgColor)",
        "background-opacity": 0.15,
        "border-color": "data(color)",
        "border-width": 2,
        "border-style": "solid",
        label: "data(label)",
        "text-valign": "top",
        "text-halign": "center",
        "font-size": "11px",
        "font-weight": "bold",
        color: "data(color)",
        "text-margin-y": -8,
        shape: "roundrectangle",
        "padding": "20px",
        "compound-sizing-wrt-labels": "include",
        "min-width": "100px",
        "min-height": "60px",
      },
    },
    // Tool nodes
    {
      selector: 'node[type="tool"]',
      style: {
        "background-color": "data(color)",
        "border-color": "#fff",
        "border-width": 1,
        label: "data(label)",
        "text-valign": "bottom",
        "text-halign": "center",
        "font-size": "9px",
        color: "#d5c3b5",
        "text-margin-y": 5,
        width: "mapData(pagerank, 0, 0.1, 20, 45)",
        height: "mapData(pagerank, 0, 0.1, 20, 45)",
        shape: "ellipse",
      },
    },
    // Tool invocation nodes (individual calls with sequence number)
    {
      selector: 'node[type="tool_invocation"]',
      style: {
        "background-color": "data(color)",
        "border-color": "#fff",
        "border-width": 2,
        label: "data(label)",
        "text-valign": "bottom",
        "text-halign": "center",
        "font-size": "8px",
        color: "#d5c3b5",
        "text-margin-y": 4,
        width: 28,
        height: 28,
        shape: "diamond", // Diamond shape to distinguish from regular tools
      },
    },
    // Edges - hierarchy (capability → tool)
    {
      selector: 'edge[edgeType="hierarchy"]',
      style: {
        width: 1.5,
        "line-color": "#555",
        "curve-style": "bezier",
        opacity: 0.3,
      },
    },
    // Edges - contains (capability → capability)
    {
      selector: 'edge[edgeType="contains"]',
      style: {
        width: 2,
        "line-color": "#8b5cf6",
        "curve-style": "bezier",
        opacity: 0.4,
      },
    },
    // Edges - depends
    {
      selector: 'edge[edgeType="dependency"]',
      style: {
        width: 2,
        "line-color": "#3b82f6",
        "target-arrow-shape": "triangle",
        "target-arrow-color": "#3b82f6",
        "curve-style": "bezier",
        "line-style": "solid",
        opacity: 0.6,
      },
    },
    // Edges - sequence (sequential execution)
    {
      selector: 'edge[edgeType="sequence"]',
      style: {
        width: 2,
        "line-color": "#10b981",
        "target-arrow-shape": "triangle",
        "target-arrow-color": "#10b981",
        "arrow-scale": 0.8,
        "curve-style": "bezier",
        opacity: 0.5,
      },
    },
    // Edges - sequence with parallel execution (overlapping timestamps)
    {
      selector: 'edge[edgeType="sequence"][?isParallel]',
      style: {
        width: 2,
        "line-color": "#f59e0b", // Amber color for parallel
        "target-arrow-shape": "triangle",
        "target-arrow-color": "#f59e0b",
        "arrow-scale": 0.8,
        "curve-style": "bezier",
        "line-style": "dashed",
        opacity: 0.7,
      },
    },
    // Edges - capability_link (shared tools)
    {
      selector: 'edge[edgeType="capability_link"]',
      style: {
        width: 1.5,
        "line-color": "#8b5cf6",
        "line-style": "dashed",
        "curve-style": "bezier",
        opacity: 0.4,
      },
    },
    // Edges - uses (tool used by multiple capabilities) - dashed
    {
      selector: 'edge[edgeType="uses"]',
      style: {
        width: 1,
        "line-color": "#FFB86F",
        "line-style": "dotted",
        "curve-style": "bezier",
        opacity: 0.3,
      },
    },
    // Edges - hyperedge (shared tool connection to other capabilities)
    {
      selector: 'edge[edgeType="hyperedge"]',
      style: {
        width: 2,
        "line-color": "#FFB86F",
        "line-style": "dashed",
        "target-arrow-shape": "diamond",
        "target-arrow-color": "#FFB86F",
        "arrow-scale": 0.6,
        "curve-style": "bezier",
        opacity: 0.6,
      },
    },
    // Highlighted node
    {
      selector: "node.highlighted",
      style: {
        "border-color": "#FFB86F",
        "border-width": 4,
        "z-index": 999,
      },
    },
    // Selected node (persistent)
    {
      selector: "node.selected",
      style: {
        "border-color": "#FFB86F",
        "border-width": 5,
        "overlay-color": "#FFB86F",
        "overlay-padding": 8,
        "overlay-opacity": 0.3,
        "z-index": 1000,
      },
    },
    // Connected to highlighted
    {
      selector: "node.connected",
      style: {
        opacity: 1,
      },
    },
    // Dimmed (not connected)
    {
      selector: "node.dimmed",
      style: {
        opacity: 0.3,
      },
    },
    {
      selector: "edge.dimmed",
      style: {
        opacity: 0.1,
      },
    },
    {
      selector: "edge.highlighted",
      style: {
        opacity: 1,
        width: 3,
        "line-color": "#FFB86F",
        "target-arrow-color": "#FFB86F",
        "z-index": 999,
      },
    },
    // Path highlighting
    {
      selector: "node.path",
      style: {
        "border-color": "#10b981",
        "border-width": 4,
      },
    },
    {
      selector: "edge.path",
      style: {
        "line-color": "#10b981",
        opacity: 1,
        width: 3,
      },
    },
  ];

  const loadData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiBase}/api/graph/hypergraph`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const apiData: HypergraphApiResponse = await response.json();

      // Transform API response (snake_case) to internal format (camelCase)
      const capabilities: CapabilityNode[] = [];
      const tools: ToolNode[] = [];
      const invocations: ToolInvocationNode[] = [];

      for (const node of apiData.nodes) {
        const d = node.data;
        if (d.type === "capability") {
          const usageCount = d.usage_count ?? 0;
          // Only include capabilities that have been used at least once
          if (usageCount > 0) {
            capabilities.push({
              id: d.id,
              name: d.label,
              type: "capability",
              successRate: d.success_rate ?? 0,
              usageCount,
              toolsCount: d.tools_count ?? 0,
              codeSnippet: d.code_snippet,
              communityId: d.community_id,
            });
          }
        } else if (d.type === "tool") {
          const parents = d.parents ?? (d.parent ? [d.parent] : []);
          // Only include tools that have been used (have at least one parent capability)
          if (parents.length > 0) {
            tools.push({
              id: d.id,
              name: d.label,
              type: "tool",
              server: d.server ?? "unknown",
              pagerank: d.pagerank ?? 0,
              parentCapabilities: parents,
            });
          }
        } else if (d.type === "tool_invocation") {
          // Tool invocation nodes - individual calls with timestamps
          invocations.push({
            id: d.id,
            name: d.label,
            type: "tool_invocation",
            tool: d.tool ?? "unknown",
            server: d.server ?? "unknown",
            parentCapability: d.parent ?? "",
            ts: d.ts ?? 0,
            durationMs: d.duration_ms ?? 0,
            sequenceIndex: d.sequence_index ?? 0,
          });
        }
      }

      const edges: Edge[] = apiData.edges.map((e) => ({
        source: e.data.source,
        target: e.data.target,
        edgeType: (e.data.edge_type || e.data.edgeType || "hierarchy") as Edge["edgeType"],
        weight: e.data.weight,
        observedCount: e.data.observed_count,
        timeDeltaMs: e.data.time_delta_ms,
        isParallel: e.data.is_parallel,
      }));

      // Derive parent-child relationships from "contains" edges
      // If A --contains--> B, then B is a child of A (nested inside when expanded)
      const capabilityParentMap = new Map<string, string>();
      for (const edge of edges) {
        if (edge.edgeType === "contains") {
          const parentId = edge.source;
          const childId = edge.target;
          // Only if both are capabilities
          if (parentId.startsWith("cap-") && childId.startsWith("cap-")) {
            if (!capabilityParentMap.has(childId)) {
              capabilityParentMap.set(childId, parentId);
            }
          }
        }
      }

      // Apply parentCapabilityId to capabilities
      for (const cap of capabilities) {
        const parentId = capabilityParentMap.get(cap.id);
        if (parentId) {
          cap.parentCapabilityId = parentId;
        }
      }

      const transformedData: TransformedData = { capabilities, tools, invocations, edges };
      rawDataRef.current = transformedData;

      // Build capability data map for CodePanel
      const capMap = new Map<string, CapabilityData>();
      const toolMap = new Map<string, ToolData>();

      for (const cap of capabilities) {
        const toolIds = tools
          .filter((t) => t.parentCapabilities.includes(cap.id))
          .map((t) => t.id);

        const childCapIds = capabilities
          .filter((c) => c.parentCapabilityId === cap.id)
          .map((c) => c.id);

        capMap.set(cap.id, {
          id: cap.id,
          label: cap.name,
          successRate: cap.successRate,
          usageCount: cap.usageCount,
          toolsCount: cap.toolsCount ?? toolIds.length,
          codeSnippet: cap.codeSnippet,
          toolIds,
          childCapabilityIds: childCapIds,
          communityId: cap.communityId,
        });
      }

      for (const tool of tools) {
        toolMap.set(tool.id, {
          id: tool.id,
          label: tool.name,
          server: tool.server,
          parentCapabilities: tool.parentCapabilities,
        });
      }

      capabilityDataRef.current = capMap;
      toolDataRef.current = toolMap;

      renderGraph(true);
      setIsLoading(false);
    } catch (err) {
      console.error("Failed to load graph data:", err);
      setError(err instanceof Error ? err.message : "Failed to load graph");
      setIsLoading(false);
    }
  };

  const renderGraph = (fullLayout = true) => {
    const cy = cyRef.current;
    const data = rawDataRef.current;
    if (!cy || !data) return;

    // Clear existing elements
    cy.elements().remove();

    const elements: Array<{ group: "nodes" | "edges"; data: Record<string, unknown> }> = [];

    if (viewMode === "capabilities") {
      // Capabilities mode: hierarchical with expand/collapse
      renderCapabilitiesMode(elements, data);
    } else {
      // Tools mode: flat tools with capability badges
      renderToolsMode(elements, data);
    }

    // Add all elements
    cy.add(elements);

    // Run layout - full layout with fit, or quick layout without fit
    if (fullLayout) {
      runLayout(true);
    } else {
      // Incremental: quick layout without fit to preserve user's view
      runLayout(false);
    }

    // Setup event handlers
    setupEventHandlers();
  };

  const renderCapabilitiesMode = (
    elements: Array<{ group: "nodes" | "edges"; data: Record<string, unknown> }>,
    data: TransformedData,
  ) => {
    // All capabilities are always expanded (bento mode)
    const allCapabilities = new Set(data.capabilities.map((c) => c.id));

    // Add all capability nodes (always expanded style)
    for (const cap of data.capabilities) {
      const { tools, caps } = countChildren(cap.id);
      const color = getCapabilityColor(cap.id, cap.communityId);
      const shortName = cap.name.length > 20 ? cap.name.slice(0, 17) + "..." : cap.name;

      elements.push({
        group: "nodes",
        data: {
          id: cap.id,
          label: shortName,
          type: "capability",
          usageCount: cap.usageCount,
          successRate: cap.successRate,
          color,
          bgColor: color,
          childCount: tools + caps,
          // Nested capabilities via contains edges
          ...(cap.parentCapabilityId ? { parent: cap.parentCapabilityId } : {}),
        },
      });
    }

    // Add all tool nodes - one instance per parent capability
    for (const tool of data.tools) {
      const color = getServerColor(tool.server);
      const isShared = tool.parentCapabilities.length > 1;
      const label = tool.name.length > 12 ? tool.name.slice(0, 10) + ".." : tool.name;

      // Create a tool instance in EACH parent capability
      for (const parentCap of tool.parentCapabilities) {
        if (!allCapabilities.has(parentCap)) continue;

        const instanceId = isShared ? `${tool.id}__${parentCap}` : tool.id;

        elements.push({
          group: "nodes",
          data: {
            id: instanceId,
            toolId: tool.id,
            label,
            type: "tool",
            server: tool.server,
            pagerank: tool.pagerank,
            color,
            parent: parentCap,
          },
        });
      }
    }

    // Add tool invocation nodes (individual calls with timestamps)
    for (const inv of data.invocations) {
      const color = getServerColor(inv.server);
      const capId = inv.parentCapability;
      if (!allCapabilities.has(capId)) continue;

      // Format duration for display
      const durationLabel = inv.durationMs > 1000
        ? `${(inv.durationMs / 1000).toFixed(1)}s`
        : `${inv.durationMs}ms`;

      elements.push({
        group: "nodes",
        data: {
          id: inv.id,
          label: `#${inv.sequenceIndex + 1} ${inv.name}`,
          type: "tool_invocation",
          tool: inv.tool,
          server: inv.server,
          color,
          parent: capId,
          ts: inv.ts,
          durationMs: inv.durationMs,
          durationLabel,
          sequenceIndex: inv.sequenceIndex,
        },
      });
    }

    // Build map for tool-to-tool edges
    const toolInstanceMap = new Map<string, string>();
    for (const tool of data.tools) {
      const isShared = tool.parentCapabilities.length > 1;
      for (const capId of tool.parentCapabilities) {
        if (allCapabilities.has(capId)) {
          const instanceId = isShared ? `${tool.id}__${capId}` : tool.id;
          toolInstanceMap.set(`${tool.id}|${capId}`, instanceId);
        }
      }
    }

    // Add edges
    for (const edge of data.edges) {
      const sourceIsCap = edge.source.startsWith("cap-");
      const targetIsCap = edge.target.startsWith("cap-");

      // Capability-to-capability: only dependency edges
      if (sourceIsCap && targetIsCap) {
        if (edge.edgeType !== "dependency") continue;
        if (!allCapabilities.has(edge.source) || !allCapabilities.has(edge.target)) continue;

        elements.push({
          group: "edges",
          data: {
            id: `${edge.source}-${edge.target}-${edge.edgeType}`,
            source: edge.source,
            target: edge.target,
            edgeType: edge.edgeType,
            weight: edge.weight,
          },
        });
      }
      // Tool-to-tool edges within same capability
      else if (!sourceIsCap && !targetIsCap) {
        // Check if this is a sequence edge between invocations
        if (edge.edgeType === "sequence") {
          // Invocation sequence edges - connect invocation nodes directly
          const sourceInv = data.invocations.find((i) => i.id === edge.source);
          const targetInv = data.invocations.find((i) => i.id === edge.target);
          if (sourceInv && targetInv) {
            elements.push({
              group: "edges",
              data: {
                id: `${edge.source}-${edge.target}-seq`,
                source: edge.source,
                target: edge.target,
                edgeType: "sequence",
                isParallel: edge.isParallel,
                timeDeltaMs: edge.timeDeltaMs,
              },
            });
            continue;
          }
        }

        // Regular tool-to-tool edges
        const sourceTools = data.tools.find((t) => t.id === edge.source);
        const targetTools = data.tools.find((t) => t.id === edge.target);
        if (!sourceTools || !targetTools) continue;

        for (const capId of sourceTools.parentCapabilities) {
          if (!targetTools.parentCapabilities.includes(capId)) continue;

          const sourceInstance = toolInstanceMap.get(`${edge.source}|${capId}`);
          const targetInstance = toolInstanceMap.get(`${edge.target}|${capId}`);
          if (!sourceInstance || !targetInstance) continue;

          elements.push({
            group: "edges",
            data: {
              id: `${sourceInstance}-${targetInstance}-${edge.edgeType}`,
              source: sourceInstance,
              target: targetInstance,
              edgeType: edge.edgeType,
              weight: edge.weight,
            },
          });
        }
      }
    }
  };

  const renderToolsMode = (
    elements: Array<{ group: "nodes" | "edges"; data: Record<string, unknown> }>,
    data: TransformedData,
  ) => {
    // Tools mode: all tools flat, capabilities as badges/tags

    // Add all tool nodes
    for (const tool of data.tools) {
      const color = getServerColor(tool.server);

      elements.push({
        group: "nodes",
        data: {
          id: tool.id,
          label: tool.name,
          type: "tool",
          server: tool.server,
          pagerank: tool.pagerank,
          color,
          // Capabilities as tags (stored for tooltip)
          capabilities: tool.parentCapabilities,
        },
      });
    }

    // Add edges between tools (from sequence edges)
    for (const edge of data.edges) {
      // Only show tool-to-tool relationships
      const sourceIsTool = data.tools.some((t) => t.id === edge.source);
      const targetIsTool = data.tools.some((t) => t.id === edge.target);

      if (sourceIsTool && targetIsTool && edge.edgeType === "sequence") {
        elements.push({
          group: "edges",
          data: {
            id: `${edge.source}-${edge.target}`,
            source: edge.source,
            target: edge.target,
            edgeType: edge.edgeType,
            weight: edge.weight,
          },
        });
      }
    }
  };

  const runLayout = (fit = true) => {
    const cy = cyRef.current;
    if (!cy) return;

    // Use cose layout for capabilities (handles compound nodes well)
    if (viewMode === "capabilities") {
      cy.layout({
        name: "cose",
        animate: true,
        animationDuration: fit ? 400 : 200,
        fit,
        padding: 50,
        // Compound node settings
        nodeRepulsion: () => 8000,
        idealEdgeLength: () => 80,
        edgeElasticity: () => 100,
        nestingFactor: 1.2,
        gravity: 0.25,
        numIter: 1000,
        coolingFactor: 0.95,
        minTemp: 1.0,
        // Prevent overlap
        nodeOverlap: 20,
        componentSpacing: 60,
      }).run();
    } else {
      cy.layout({
        name: "dagre",
        rankDir: layoutDirection,
        nodeSep: 40,
        rankSep: 80,
        padding: 50,
        animate: true,
        animationDuration: fit ? 300 : 150,
        fit,
      }).run();
    }
  };

  const setupEventHandlers = () => {
    const cy = cyRef.current;
    if (!cy) return;

    // Remove existing handlers
    cy.off("tap");
    cy.off("mouseover");
    cy.off("mouseout");

    // Node click - zoom to capability, select for tools
    // deno-lint-ignore no-explicit-any
    cy.on("tap", "node", (evt: { target: any }) => {
      const node = evt.target;
      const nodeId = node.data("id") as string;
      const nodeType = node.data("type") as string;

      if (nodeType === "capability") {
        // Zoom to fit this capability and its children
        const capNode = cy.getElementById(nodeId);
        const children = capNode.descendants();
        const toFit = children.length > 0 ? capNode.union(children) : capNode;

        cy.animate({
          fit: { eles: toFit, padding: 50 },
          duration: 300,
          easing: "ease-out",
        });

        // Select for CodePanel
        const capData = capabilityDataRef.current.get(nodeId);
        if (capData) {
          onCapabilitySelect?.(capData);
          onToolSelect?.(null);
        }
      } else {
        // Tool selected - use toolId for shared tools (nodeId may have __capId suffix)
        const toolId = (node.data("toolId") as string) || nodeId;
        const toolData = toolDataRef.current.get(toolId);
        if (toolData) {
          onToolSelect?.(toolData);
          onCapabilitySelect?.(null);
          onNodeSelect?.({
            id: toolId,
            label: toolData.label,
            server: toolData.server,
          });
        }
      }

      highlightNode(nodeId);
    });

    // Background click - clear selection
    cy.on("tap", (evt: { target: { isNode?: () => boolean } }) => {
      if (!evt.target.isNode?.()) {
        clearHighlight();
        onCapabilitySelect?.(null);
        onToolSelect?.(null);
      }
    });

    // Node hover - temporary highlight
    cy.on("mouseover", "node", (evt: { target: { data: (key: string) => string } }) => {
      const nodeId = evt.target.data("id");
      highlightNode(nodeId, true);
    });

    cy.on("mouseout", "node", () => {
      if (highlightedNodeId) {
        highlightNode(highlightedNodeId);
      } else {
        clearHighlight();
      }
    });
  };

  const highlightNode = (nodeId: string, _isHover = false) => {
    const cy = cyRef.current;
    if (!cy) return;

    // Clear previous classes
    cy.elements().removeClass("highlighted connected dimmed path selected");

    const node = cy.getElementById(nodeId);
    if (!node.length) return;

    // Highlight the node
    node.addClass("highlighted");

    // Get connected nodes based on depth
    const connectedNodes = getConnectedNodes(node, highlightDepth);
    const connectedEdges = getConnectedEdges(node, connectedNodes);

    // Mark connected
    connectedNodes.addClass("connected");
    connectedEdges.addClass("highlighted");

    // Dim everything else
    cy.elements()
      .not(node)
      .not(connectedNodes)
      .not(connectedEdges)
      .addClass("dimmed");
  };

  // deno-lint-ignore no-explicit-any
  const getConnectedNodes = (node: any, depth: number): any => {
    const cy = cyRef.current;
    if (!cy || depth <= 0) return cy.collection();

    let connected = node.neighborhood().nodes();

    if (depth > 1) {
      // Recursively get deeper connections
      let frontier = connected;
      for (let d = 1; d < depth && d < 10; d++) {
        const nextFrontier = frontier.neighborhood().nodes();
        connected = connected.union(nextFrontier);
        frontier = nextFrontier.difference(connected);
        if (frontier.length === 0) break;
      }
    }

    return connected;
  };

  // deno-lint-ignore no-explicit-any
  const getConnectedEdges = (node: any, connectedNodes: any): any => {
    const cy = cyRef.current;
    if (!cy) return cy.collection();

    // Get edges between the node and connected nodes
    const allNodes = connectedNodes.union(node);
    return allNodes.edgesWith(allNodes);
  };

  const clearHighlight = () => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass("highlighted connected dimmed path selected");
  };

  // Handle external highlight changes
  useEffect(() => {
    if (highlightedNodeId) {
      highlightNode(highlightedNodeId);
    } else {
      clearHighlight();
    }
  }, [highlightedNodeId, highlightDepth]);

  // Handle path highlighting
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.elements().removeClass("path");

    if (pathNodes && pathNodes.length > 0) {
      for (const nodeId of pathNodes) {
        cy.getElementById(nodeId).addClass("path");
      }

      for (let i = 0; i < pathNodes.length - 1; i++) {
        const edgeId = `${pathNodes[i]}-${pathNodes[i + 1]}`;
        cy.getElementById(edgeId).addClass("path");
        const reverseEdgeId = `${pathNodes[i + 1]}-${pathNodes[i]}`;
        cy.getElementById(reverseEdgeId).addClass("path");
      }

      const pathElements = cy.elements(".path");
      if (pathElements.length > 0) {
        cy.fit(pathElements, 100);
      }
    }
  }, [pathNodes]);

  // Expand all capabilities
  const expandAll = useCallback(() => {
    const allCapIds = Array.from(capabilityDataRef.current.keys());
    setExpandedNodes(new Set(allCapIds));
  }, [setExpandedNodes]);

  // Collapse all capabilities
  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set());
  }, [setExpandedNodes]);

  // Expose methods for external control
  useEffect(() => {
    if (containerRef.current) {
      // @ts-ignore - attach methods to DOM element for external access
      containerRef.current.expandAll = expandAll;
      // @ts-ignore
      containerRef.current.collapseAll = collapseAll;
    }
  }, [expandAll, collapseAll]);

  return (
    <div class="w-full h-full relative" style={{ background: "var(--bg, #0a0908)" }}>
      {/* Cytoscape container */}
      <div ref={containerRef} class="w-full h-full" />

      {/* Loading spinner */}
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

      {/* Error message */}
      {error && !isLoading && (
        <div
          class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 max-w-md text-center p-6 rounded-xl"
          style={{
            background: "var(--bg-elevated, #12110f)",
            border: "1px solid var(--border)",
          }}
        >
          <div class="text-4xl mb-3">Error</div>
          <p style={{ color: "var(--text-muted)" }}>{error}</p>
        </div>
      )}
    </div>
  );
}
