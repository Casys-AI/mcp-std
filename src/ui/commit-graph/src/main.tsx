/**
 * Commit Graph UI for MCP Apps
 *
 * Interactive Git commit graph visualization with:
 * - SVG-based branch lines and merge visualization
 * - Color-coded branches
 * - Clickable commits with hover details
 * - Ref badges (branches, tags)
 * - Zoom and pan support
 *
 * @module lib/std/src/ui/commit-graph
 */

import { render } from "preact";
import { useState, useEffect, useCallback, useMemo, useRef } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { cx } from "../../components/utils";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface Commit {
  hash: string;
  shortHash: string;
  message: string;
  refs: string[];
  graphChars: string;
  parents: string[];
  author: string;
  timestamp: number;
}

interface GraphData {
  commits: Commit[];
  branches: string[];
  totalCommits: number;
}

interface ContentItem {
  type: string;
  text?: string;
}

interface GraphNode {
  commit: Commit;
  x: number;
  y: number;
  rail: number;
  parentConnections: Array<{
    parentHash: string;
    parentRail: number;
    parentY: number;
  }>;
}

// ============================================================================
// Constants
// ============================================================================

const NODE_RADIUS = 6;
const ROW_HEIGHT = 36;
const RAIL_WIDTH = 24;
const GRAPH_PADDING = 20;
const RAIL_COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#84cc16", // lime
];

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Commit Graph", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Graph Layout Algorithm
// ============================================================================

/**
 * Calculate graph layout from commits
 * Assigns each commit to a "rail" (x position) based on branch topology
 */
function calculateGraphLayout(commits: Commit[]): GraphNode[] {
  if (commits.length === 0) return [];

  const nodes: GraphNode[] = [];
  const commitIndexMap = new Map<string, number>();
  const commitRailMap = new Map<string, number>();
  const activeRails = new Set<number>();

  // First pass: index all commits
  commits.forEach((commit, idx) => {
    commitIndexMap.set(commit.hash, idx);
  });

  // Second pass: assign rails
  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];

    // Check if any parent assigned a rail to this commit
    let assignedRail = commitRailMap.get(commit.hash);

    if (assignedRail === undefined) {
      // Find the first available rail
      assignedRail = 0;
      while (activeRails.has(assignedRail)) {
        assignedRail++;
      }
    }

    activeRails.add(assignedRail);
    commitRailMap.set(commit.hash, assignedRail);

    // Process parents
    const parentConnections: GraphNode["parentConnections"] = [];

    for (let p = 0; p < commit.parents.length; p++) {
      const parentHash = commit.parents[p];
      const parentIdx = commitIndexMap.get(parentHash);

      if (parentIdx !== undefined) {
        // Parent exists in our commit list
        let parentRail = commitRailMap.get(parentHash);

        if (parentRail === undefined) {
          if (p === 0) {
            // First parent continues on same rail
            parentRail = assignedRail;
          } else {
            // Other parents get new rails
            parentRail = 0;
            while (activeRails.has(parentRail) || commitRailMap.has(parentHash)) {
              parentRail++;
            }
          }
          commitRailMap.set(parentHash, parentRail);
        }

        parentConnections.push({
          parentHash,
          parentRail,
          parentY: parentIdx * ROW_HEIGHT + GRAPH_PADDING,
        });
      }
    }

    // If this commit has no parents pointing to it from below, free the rail
    const hasChildOnRail = commits.slice(i + 1).some((c) => {
      const cRail = commitRailMap.get(c.hash);
      return cRail === assignedRail && c.parents.includes(commit.hash);
    });

    if (!hasChildOnRail && commit.parents.length === 0) {
      activeRails.delete(assignedRail);
    }

    nodes.push({
      commit,
      x: assignedRail * RAIL_WIDTH + GRAPH_PADDING,
      y: i * ROW_HEIGHT + GRAPH_PADDING,
      rail: assignedRail,
      parentConnections,
    });
  }

  return nodes;
}

/**
 * Format relative time from timestamp
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo ago`;
  return `${Math.floor(diff / 31536000)}y ago`;
}

/**
 * Format full date from timestamp
 */
function formatFullDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString();
}

// ============================================================================
// Components
// ============================================================================

interface RefBadgeProps {
  refName: string;
}

function RefBadge({ refName }: RefBadgeProps) {
  const isTag = refName.startsWith("tag:");
  const isRemote = refName.includes("/");
  const isHead = refName === "HEAD";
  const displayName = isTag ? refName.replace("tag:", "") : refName;

  let variant: "solid" | "subtle" | "outline" = "subtle";
  let colorPalette: "green" | "amber" | "purple" | "gray" = "green";

  if (isTag) {
    colorPalette = "amber";
  } else if (isHead) {
    colorPalette = "purple";
  } else if (isRemote) {
    colorPalette = "gray";
    variant = "outline";
  }

  return (
    <Badge size="sm" variant={variant} colorScheme={colorPalette}>
      {displayName}
    </Badge>
  );
}

interface CommitPopupProps {
  node: GraphNode;
  position: { x: number; y: number };
}

function CommitPopup({ node, position }: CommitPopupProps) {
  const { commit } = node;

  return (
    <div
      className="fixed z-[100] w-[320px] p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg pointer-events-none"
      style={{
        top: `${position.y + 15}px`,
        left: `${Math.min(position.x, window.innerWidth - 350)}px`,
      }}
    >
      <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-100 dark:border-gray-800">
        <span className="font-mono text-xs text-blue-600 dark:text-blue-400">
          {commit.hash.slice(0, 10)}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">{formatFullDate(commit.timestamp)}</span>
      </div>
      <div className="text-sm mb-2">
        <strong>{commit.author}</strong>
      </div>
      <div className="text-sm text-gray-900 dark:text-gray-100 leading-[1.4] break-words mb-2">
        {commit.message}
      </div>
      {commit.refs.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {commit.refs.map((ref) => (
            <RefBadge key={ref} refName={ref} />
          ))}
        </div>
      )}
      {commit.parents.length > 0 && (
        <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
          Parents: {commit.parents.map((p) => p.slice(0, 7)).join(", ")}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function CommitGraph() {
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Connect to MCP host
  useEffect(() => {
    app
      .connect()
      .then(() => {
        appConnected = true;
        console.log("[commit-graph] Connected to MCP host");
      })
      .catch(() => {
        console.log("[commit-graph] No MCP host (standalone mode)");
      });

    app.ontoolresult = (result: { content?: ContentItem[] }) => {
      setLoading(false);
      setError(null);

      try {
        const textContent = result.content?.find((c) => c.type === "text") as ContentItem | undefined;
        if (!textContent?.text) {
          setData(null);
          return;
        }

        const parsed: GraphData = JSON.parse(textContent.text);
        setData(parsed);
        setSelectedHash(null);
        setZoom(1);
      } catch (e) {
        setError(`Failed to parse graph data: ${e instanceof Error ? e.message : "Unknown"}`);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // Track mouse position for popup
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setPopupPosition({ x: e.clientX, y: e.clientY });
    };
    document.addEventListener("mousemove", handleMouseMove);
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Calculate graph layout
  const graphNodes = useMemo(() => {
    if (!data?.commits) return [];
    return calculateGraphLayout(data.commits);
  }, [data]);

  // Calculate SVG dimensions
  const svgDimensions = useMemo(() => {
    if (graphNodes.length === 0) return { width: 800, height: 400 };

    const maxRail = Math.max(...graphNodes.map((n) => n.rail));
    const graphWidth = (maxRail + 1) * RAIL_WIDTH + GRAPH_PADDING * 2;
    const graphHeight = graphNodes.length * ROW_HEIGHT + GRAPH_PADDING * 2;

    return {
      width: Math.max(graphWidth, 200),
      height: graphHeight,
    };
  }, [graphNodes]);

  // Handlers
  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      const newSelected = selectedHash === node.commit.hash ? null : node.commit.hash;
      setSelectedHash(newSelected);
      if (newSelected) {
        notifyModel("select", {
          hash: node.commit.hash,
          message: node.commit.message,
          author: node.commit.author,
          refs: node.commit.refs,
        });
      }
    },
    [selectedHash]
  );

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(z + 0.2, 2));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(z - 0.2, 0.5));
  }, []);

  // Render states
  if (loading) {
    return (
      <div className="font-sans text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 min-h-screen relative">
        <div className="p-10 text-center text-gray-500 dark:text-gray-400">Loading commit graph...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="font-sans text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 min-h-screen relative">
        <div className="p-4 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 rounded-md m-4">{error}</div>
      </div>
    );
  }

  if (!data || data.commits.length === 0) {
    return (
      <div className="font-sans text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 min-h-screen relative">
        <div className="p-10 text-center text-gray-500 dark:text-gray-400">No commits to display</div>
      </div>
    );
  }

  return (
    <div className="font-sans text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 min-h-screen relative" ref={containerRef}>
      {/* Header */}
      <div className="sticky top-0 z-10 flex justify-between items-center p-3 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-lg">Commit Graph</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {data.totalCommits} commits | {data.branches.length} branches
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleZoomOut}>-</Button>
          <span className="min-w-[50px] text-center text-sm text-gray-500 dark:text-gray-400">
            {Math.round(zoom * 100)}%
          </span>
          <Button variant="outline" size="sm" onClick={handleZoomIn}>+</Button>
        </div>
      </div>

      {/* Graph content */}
      <div className="overflow-auto relative">
        <div className="flex relative min-w-fit" style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}>
          {/* SVG for graph lines */}
          <svg
            width={svgDimensions.width}
            height={svgDimensions.height}
            style={{ position: "absolute", top: 0, left: 0, flexShrink: 0 }}
          >
            {/* Connection lines */}
            {graphNodes.map((node) =>
              node.parentConnections.map((conn, idx) => {
                const color = RAIL_COLORS[node.rail % RAIL_COLORS.length];
                const parentNode = graphNodes.find((n) => n.commit.hash === conn.parentHash);
                if (!parentNode) return null;

                const startX = node.x;
                const startY = node.y;
                const endX = parentNode.x;
                const endY = parentNode.y;

                // Create curved path for merge lines
                if (startX !== endX) {
                  const midY = (startY + endY) / 2;
                  const path = `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;
                  return (
                    <path
                      key={`${node.commit.hash}-${conn.parentHash}-${idx}`}
                      d={path}
                      fill="none"
                      stroke={color}
                      strokeWidth={2}
                      opacity={0.6}
                    />
                  );
                }

                // Straight line for same rail
                return (
                  <line
                    key={`${node.commit.hash}-${conn.parentHash}-${idx}`}
                    x1={startX}
                    y1={startY}
                    x2={endX}
                    y2={endY}
                    stroke={color}
                    strokeWidth={2}
                    opacity={0.6}
                  />
                );
              })
            )}

            {/* Commit nodes */}
            {graphNodes.map((node) => {
              const color = RAIL_COLORS[node.rail % RAIL_COLORS.length];
              const isSelected = selectedHash === node.commit.hash;
              const isHovered = hoveredNode?.commit.hash === node.commit.hash;
              const isMerge = node.commit.parents.length > 1;

              return (
                <g
                  key={node.commit.hash}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHoveredNode(node)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onClick={() => handleNodeClick(node)}
                >
                  {/* Commit circle */}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={isSelected ? NODE_RADIUS + 2 : NODE_RADIUS}
                    fill={isMerge ? "white" : color}
                    stroke={color}
                    strokeWidth={isMerge ? 3 : 2}
                  />

                  {/* Selection ring */}
                  {isSelected && (
                    <circle cx={node.x} cy={node.y} r={NODE_RADIUS + 5} fill="none" stroke={color} strokeWidth={2} opacity={0.5} />
                  )}

                  {/* Hover highlight */}
                  {isHovered && !isSelected && (
                    <circle cx={node.x} cy={node.y} r={NODE_RADIUS + 3} fill="none" stroke={color} strokeWidth={1} opacity={0.3} />
                  )}
                </g>
              );
            })}
          </svg>

          {/* Commit rows with info */}
          <div className="flex flex-col gap-0 min-w-[400px]" style={{ marginLeft: `${svgDimensions.width + 10}px` }}>
            {graphNodes.map((node) => {
              const isSelected = selectedHash === node.commit.hash;

              return (
                <div
                  key={node.commit.hash}
                  className={cx(
                    "flex items-center gap-2 px-2 cursor-pointer border-b border-gray-100 dark:border-gray-800 transition-colors duration-100 hover:bg-gray-100 dark:hover:bg-gray-800",
                    isSelected && "bg-blue-50 dark:bg-blue-950"
                  )}
                  style={{ height: `${ROW_HEIGHT}px` }}
                  onMouseEnter={() => setHoveredNode(node)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onClick={() => handleNodeClick(node)}
                >
                  {/* Refs */}
                  {node.commit.refs.length > 0 && (
                    <div className="flex gap-1 shrink-0">
                      {node.commit.refs.map((ref) => (
                        <RefBadge key={ref} refName={ref} />
                      ))}
                    </div>
                  )}

                  {/* Hash */}
                  <span className="font-mono text-xs text-blue-600 dark:text-blue-400 min-w-[60px] shrink-0">
                    {node.commit.shortHash}
                  </span>

                  {/* Message */}
                  <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-gray-900 dark:text-gray-100">
                    {node.commit.message}
                  </span>

                  {/* Author and time */}
                  <div className="flex items-center gap-2 shrink-0 text-xs text-gray-500 dark:text-gray-400">
                    <span className="max-w-[100px] overflow-hidden text-ellipsis whitespace-nowrap">
                      {node.commit.author}
                    </span>
                    <span className="min-w-[60px] text-right">
                      {formatRelativeTime(node.commit.timestamp)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Hover popup */}
      {hoveredNode && <CommitPopup node={hoveredNode} position={popupPosition} />}
    </div>
  );
}

// ============================================================================
// Mount
// ============================================================================

render(<CommitGraph />, document.getElementById("app")!);
