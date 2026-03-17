/**
 * Disk Usage Viewer UI for MCP Apps
 *
 * Treemap/sunburst visualization of disk usage:
 * - Squarified treemap layout
 * - Drill-down navigation
 * - Size-proportional rectangles
 * - Color coding by file type
 *
 * @module lib/std/src/ui/disk-usage-viewer
 */

import { render } from "preact";
import { useState, useEffect, useMemo, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { cx } from "../../components/utils";
import { Button } from "../../components/ui/button";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface DiskNode {
  name: string;
  size: number; // bytes
  type: "file" | "directory";
  children?: DiskNode[];
}

interface DiskUsageData {
  root: DiskNode;
  totalSize: number;
  path: string;
}

interface TreemapRect {
  x: number;
  y: number;
  width: number;
  height: number;
  node: DiskNode;
  depth: number;
}

interface ContentItem {
  type: string;
  text?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Disk Usage Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function getExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

function getColor(node: DiskNode, depth: number): string {
  if (node.type === "directory") {
    const shades = ["#6b7280", "#9ca3af", "#d1d5db", "#e5e7eb"];
    return shades[depth % shades.length];
  }

  const ext = getExtension(node.name);
  const colorMap: Record<string, string> = {
    js: "#f59e0b", jsx: "#f59e0b", ts: "#eab308", tsx: "#eab308",
    mjs: "#f59e0b", cjs: "#f59e0b",
    json: "#10b981", jsonc: "#10b981",
    md: "#3b82f6", mdx: "#3b82f6", txt: "#60a5fa", rst: "#60a5fa",
    png: "#8b5cf6", jpg: "#8b5cf6", jpeg: "#8b5cf6", gif: "#a78bfa",
    svg: "#a78bfa", webp: "#8b5cf6", ico: "#a78bfa",
    css: "#ec4899", scss: "#ec4899", sass: "#ec4899", less: "#f472b6",
    html: "#f97316", htm: "#f97316",
    yaml: "#06b6d4", yml: "#06b6d4", toml: "#22d3ee", ini: "#22d3ee", env: "#06b6d4",
    csv: "#14b8a6", xml: "#2dd4bf", sql: "#14b8a6",
    zip: "#ef4444", tar: "#ef4444", gz: "#dc2626", rar: "#ef4444",
    exe: "#475569", dll: "#475569", so: "#475569", bin: "#64748b", wasm: "#64748b",
    lock: "#9ca3af",
  };

  return colorMap[ext] || "#94a3b8";
}

// ============================================================================
// Squarified Treemap Algorithm
// ============================================================================

function worstRatio(row: DiskNode[], width: number, totalSize: number): number {
  if (row.length === 0) return Infinity;
  const rowSize = row.reduce((sum, n) => sum + n.size, 0);
  const rowArea = (rowSize / totalSize) * (width * width);
  const rowWidth = rowArea / width;
  let worst = 0;
  for (const node of row) {
    const nodeArea = (node.size / totalSize) * (width * width);
    const nodeHeight = nodeArea / rowWidth;
    const ratio = Math.max(rowWidth / nodeHeight, nodeHeight / rowWidth);
    worst = Math.max(worst, ratio);
  }
  return worst;
}

function squarify(
  nodes: DiskNode[],
  bounds: { x: number; y: number; width: number; height: number },
  totalSize: number,
  depth: number,
  results: TreemapRect[]
): void {
  if (nodes.length === 0 || totalSize === 0) return;
  const sortedNodes = nodes.filter((n) => n.size > 0).sort((a, b) => b.size - a.size);
  if (sortedNodes.length === 0) return;

  const { x, y, width, height } = bounds;
  const shortSide = Math.min(width, height);
  const isHorizontal = width >= height;

  let row: DiskNode[] = [];
  let rowSize = 0;
  let remaining = [...sortedNodes];

  while (remaining.length > 0) {
    const current = remaining[0];
    const newRow = [...row, current];
    const newRowSize = rowSize + current.size;
    const currentRatio = worstRatio(row, shortSide, totalSize);
    const newRatio = worstRatio(newRow, shortSide, totalSize);

    if (row.length === 0 || newRatio <= currentRatio) {
      row = newRow;
      rowSize = newRowSize;
      remaining = remaining.slice(1);
    } else {
      layoutRow(row, bounds, totalSize, isHorizontal, depth, results);
      const rowFraction = rowSize / totalSize;
      const rowDimension = (isHorizontal ? width : height) * rowFraction;
      const newBounds = isHorizontal
        ? { x: x + rowDimension, y, width: width - rowDimension, height }
        : { x, y: y + rowDimension, width, height: height - rowDimension };
      const remainingSize = remaining.reduce((sum, n) => sum + n.size, 0);
      squarify(remaining, newBounds, remainingSize, depth, results);
      return;
    }
  }

  if (row.length > 0) {
    layoutRow(row, bounds, totalSize, isHorizontal, depth, results);
  }
}

function layoutRow(
  row: DiskNode[],
  bounds: { x: number; y: number; width: number; height: number },
  totalSize: number,
  isHorizontal: boolean,
  depth: number,
  results: TreemapRect[]
): void {
  const { x, y, width, height } = bounds;
  const rowSize = row.reduce((sum, n) => sum + n.size, 0);
  const rowFraction = rowSize / totalSize;
  const rowDimension = isHorizontal ? width * rowFraction : height * rowFraction;
  let offset = 0;

  for (const node of row) {
    const nodeFraction = node.size / rowSize;
    const nodeDimension = (isHorizontal ? height : width) * nodeFraction;
    const rect: TreemapRect = isHorizontal
      ? { x, y: y + offset, width: rowDimension, height: nodeDimension, node, depth }
      : { x: x + offset, y, width: nodeDimension, height: rowDimension, node, depth };
    results.push(rect);
    offset += nodeDimension;
  }
}

function buildTreemap(
  node: DiskNode,
  bounds: { x: number; y: number; width: number; height: number },
  depth: number = 0,
  maxDepth: number = 1
): TreemapRect[] {
  const results: TreemapRect[] = [];
  if (!node.children || node.children.length === 0 || depth >= maxDepth) {
    results.push({ ...bounds, node, depth });
    return results;
  }
  const childrenWithSize = node.children.filter((c) => c.size > 0);
  const totalSize = childrenWithSize.reduce((sum, c) => sum + c.size, 0);
  if (totalSize === 0) {
    results.push({ ...bounds, node, depth });
    return results;
  }
  squarify(childrenWithSize, bounds, totalSize, depth, results);
  return results;
}

// ============================================================================
// Components
// ============================================================================

interface TreemapRectProps {
  rect: TreemapRect;
  onNavigate: (node: DiskNode) => void;
  hoveredPath: string | null;
  setHoveredPath: (path: string | null) => void;
  currentPath: string[];
}

function TreemapRectangle({ rect, onNavigate, hoveredPath, setHoveredPath, currentPath }: TreemapRectProps) {
  const { x, y, width, height, node, depth } = rect;
  const minSize = 3;
  const padding = 1;
  if (width < minSize || height < minSize) return null;

  const fullPath = [...currentPath, node.name].join("/");
  const isHovered = hoveredPath === fullPath;
  const color = getColor(node, depth);
  const canNavigate = node.type === "directory" && node.children && node.children.length > 0;
  const showLabel = width > 40 && height > 20;
  const showSize = width > 60 && height > 35;
  const maxChars = Math.floor((width - 8) / 7);
  const displayName = node.name.length > maxChars ? node.name.slice(0, maxChars - 1) + "..." : node.name;

  return (
    <g
      style={{ cursor: canNavigate ? "pointer" : "default" }}
      onMouseEnter={() => setHoveredPath(fullPath)}
      onMouseLeave={() => setHoveredPath(null)}
      onClick={(e) => {
        e.stopPropagation();
        if (canNavigate) {
          notifyModel("navigate", { path: fullPath, name: node.name, size: node.size });
          onNavigate(node);
        }
      }}
    >
      <rect
        x={x + padding}
        y={y + padding}
        width={Math.max(0, width - padding * 2)}
        height={Math.max(0, height - padding * 2)}
        fill={color}
        stroke={isHovered ? "#fff" : "#1f2937"}
        strokeWidth={isHovered ? 2 : 0.5}
        opacity={isHovered ? 1 : 0.85}
        rx={2}
      >
        <title>{`${fullPath}\n${formatSize(node.size)} (${node.type})`}</title>
      </rect>
      {showLabel && (
        <text
          x={x + padding + 4}
          y={y + padding + 14}
          fontSize={11}
          fontWeight={500}
          fill="#fff"
          style={{ pointerEvents: "none", textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
        >
          {node.type === "directory" ? "D " : ""}{displayName}
        </text>
      )}
      {showSize && (
        <text
          x={x + padding + 4}
          y={y + padding + 28}
          fontSize={10}
          fill="#fff"
          fillOpacity={0.8}
          style={{ pointerEvents: "none", textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
        >
          {formatSize(node.size)}
        </text>
      )}
    </g>
  );
}

interface BreadcrumbProps {
  pathStack: DiskNode[];
  rootPath: string;
  onNavigateToIndex: (index: number) => void;
}

function Breadcrumb({ pathStack, rootPath, onNavigateToIndex }: BreadcrumbProps) {
  return (
    <div className="flex items-center flex-wrap mb-3 p-2 bg-bg-subtle rounded-md text-sm">
      <Button
        variant="ghost"
        size="xs"
        onClick={() => onNavigateToIndex(0)}
        disabled={pathStack.length === 1}
      >
        {rootPath || "root"}
      </Button>
      {pathStack.slice(1).map((node, i) => (
        <div key={i} className="flex items-center gap-0">
          <div className="mx-1 text-fg-subtle">/</div>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onNavigateToIndex(i + 1)}
            disabled={i === pathStack.length - 2}
          >
            {node.name}
          </Button>
        </div>
      ))}
    </div>
  );
}

interface TooltipProps {
  path: string | null;
  node: DiskNode | null;
  totalSize: number;
}

function Tooltip({ path, node, totalSize }: TooltipProps) {
  if (!path || !node) return null;
  const percentage = ((node.size / totalSize) * 100).toFixed(1);

  return (
    <div className="absolute top-2 right-2 p-3 bg-bg-default border border-border-default rounded-md shadow-md min-w-[200px] z-10">
      <div className="font-medium mb-1 break-all text-xs text-fg-default">
        {path}
      </div>
      <div className="text-sm text-fg-muted mb-0.5">
        {formatSize(node.size)} ({percentage}%)
      </div>
      <div className="text-xs text-fg-subtle">
        {node.type === "directory" ? "Directory" : `File (${getExtension(node.name) || "no ext"})`}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function DiskUsageViewer() {
  const [data, setData] = useState<DiskUsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pathStack, setPathStack] = useState<DiskNode[]>([]);
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);

  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
      console.log("[disk-usage-viewer] Connected to MCP host");
    }).catch(() => {
      console.log("[disk-usage-viewer] No MCP host (standalone mode)");
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
        const parsed = JSON.parse(textContent.text) as DiskUsageData;
        setData(parsed);
        setPathStack([parsed.root]);
      } catch (e) {
        setError(`Failed to parse disk usage data: ${e instanceof Error ? e.message : "Unknown"}`);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  const currentNode = pathStack[pathStack.length - 1] || null;
  const currentPathParts = useMemo(() => pathStack.map((n) => n.name), [pathStack]);
  const treemapRects = useMemo(() => {
    if (!currentNode) return [];
    return buildTreemap(currentNode, { x: 0, y: 0, width: 700, height: 450 }, 0, 1);
  }, [currentNode]);

  const hoveredNode = useMemo(() => {
    if (!hoveredPath) return null;
    for (const rect of treemapRects) {
      const fullPath = [...currentPathParts, rect.node.name].join("/");
      if (fullPath === hoveredPath) return rect.node;
    }
    return null;
  }, [hoveredPath, treemapRects, currentPathParts]);

  const handleNavigate = useCallback((node: DiskNode) => {
    setPathStack((prev) => [...prev, node]);
  }, []);

  const handleNavigateToIndex = useCallback((index: number) => {
    setPathStack((prev) => prev.slice(0, index + 1));
  }, []);

  const handleBack = useCallback(() => {
    if (pathStack.length > 1) {
      setPathStack((prev) => prev.slice(0, -1));
    }
  }, [pathStack.length]);

  const width = 700;
  const height = 450;

  if (loading) {
    return (
      <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-screen">
        <div className="p-10 text-center text-fg-muted">Loading disk usage data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-screen">
        <div className="p-4 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 rounded-md">
          {error}
        </div>
      </div>
    );
  }

  if (!data || !currentNode) {
    return (
      <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-screen">
        <div className="p-10 text-center text-fg-muted">No disk usage data</div>
      </div>
    );
  }

  return (
    <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <div className="flex items-baseline gap-3">
          <h2 className="text-xl font-semibold m-0">Disk Usage</h2>
          <div className="text-sm text-fg-muted">{formatSize(data.totalSize)} total</div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleBack} disabled={pathStack.length <= 1}>
            Back
          </Button>
        </div>
      </div>

      {/* Breadcrumb */}
      <Breadcrumb pathStack={pathStack} rootPath={data.path} onNavigateToIndex={handleNavigateToIndex} />

      {/* Current directory info */}
      <div className="flex items-center gap-3 mb-3 p-2 bg-bg-muted rounded-md">
        <div className="font-medium">
          {currentNode.type === "directory" ? "D" : "F"} {currentNode.name}
        </div>
        <div className="text-fg-muted text-sm">{formatSize(currentNode.size)}</div>
        {currentNode.children && (
          <div className="text-fg-subtle text-xs">{currentNode.children.length} items</div>
        )}
      </div>

      {/* Treemap */}
      <div className="relative flex justify-center mb-4">
        <svg
          width={width}
          height={height}
          className="bg-bg-subtle rounded-lg border border-border-default"
        >
          {treemapRects.map((rect, i) => (
            <TreemapRectangle
              key={`${rect.node.name}-${i}`}
              rect={rect}
              onNavigate={handleNavigate}
              hoveredPath={hoveredPath}
              setHoveredPath={setHoveredPath}
              currentPath={currentPathParts}
            />
          ))}
        </svg>
        <Tooltip path={hoveredPath} node={hoveredNode} totalSize={currentNode.size} />
      </div>

      {/* Legend */}
      <div className="p-3 bg-bg-subtle rounded-md">
        <div className="text-xs font-medium text-fg-muted mb-2">Legend:</div>
        <div className="flex gap-4 flex-wrap">
          {[
            { color: "#6b7280", label: "Directories" },
            { color: "#eab308", label: "JS/TS" },
            { color: "#10b981", label: "JSON" },
            { color: "#3b82f6", label: "Markdown" },
            { color: "#8b5cf6", label: "Images" },
            { color: "#ec4899", label: "Styles" },
            { color: "#94a3b8", label: "Other" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5 text-xs text-fg-muted">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Mount
// ============================================================================

render(<DiskUsageViewer />, document.getElementById("app")!);
