/**
 * GraphNode Atom - SVG circle representing a graph node
 * Used for: D3 graph visualization nodes
 */

import type { JSX } from "preact";

export interface GraphNodeData {
  id: string;
  label: string;
  server: string;
  pagerank: number;
  degree: number;
  x?: number;
  y?: number;
  parents?: string[];
}

interface GraphNodeProps {
  data: GraphNodeData;
  color: string;
  selected?: boolean;
  highlighted?: boolean;
  isPath?: boolean;
  isOrphan?: boolean;
  hidden?: boolean;
  onClick?: (data: GraphNodeData) => void;
  onMouseEnter?: (data: GraphNodeData, event: MouseEvent) => void;
  onMouseLeave?: () => void;
}

/** Calculate node radius based on pagerank */
export function getNodeRadius(pagerank: number): number {
  return Math.max(15, pagerank * 50 + 10);
}

export default function GraphNode({
  data,
  color,
  selected = false,
  highlighted = false,
  isPath = false,
  isOrphan = false,
  hidden = false,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: GraphNodeProps): JSX.Element | null {
  if (hidden) return null;

  const radius = getNodeRadius(data.pagerank);
  const x = data.x ?? 0;
  const y = data.y ?? 0;

  // Determine border style
  let strokeWidth = 2;
  let strokeColor = "rgba(255, 255, 255, 0.3)";
  let strokeDasharray = "none";
  let opacity = 1;

  if (selected) {
    strokeWidth = 4;
    strokeColor = "#f5f0ea";
  } else if (isPath) {
    strokeWidth = 3;
    strokeColor = "#22c55e";
  } else if (highlighted) {
    strokeWidth = 3;
    strokeColor = "#f97316";
  }

  if (isOrphan) {
    opacity = 0.4;
    strokeDasharray = "4,2";
  }

  // Calculate font size based on radius
  const fontSize = Math.max(8, Math.min(12, radius * 0.6));
  const labelMaxWidth = radius * 1.8;

  return (
    <g
      class="graph-node"
      transform={`translate(${x}, ${y})`}
      style={{ cursor: "pointer", opacity }}
      onClick={() => onClick?.(data)}
      onMouseEnter={(e) => onMouseEnter?.(data, e as unknown as MouseEvent)}
      onMouseLeave={() => onMouseLeave?.()}
    >
      {/* Node circle */}
      <circle
        r={radius}
        fill={color}
        stroke={strokeColor}
        stroke-width={strokeWidth}
        stroke-dasharray={strokeDasharray}
        style={{ transition: "all 0.2s ease" }}
      />
      {/* Node label */}
      <text
        text-anchor="middle"
        dominant-baseline="middle"
        fill="#fff"
        font-size={fontSize}
        font-weight={500}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {truncateLabel(data.label, labelMaxWidth, fontSize)}
      </text>
    </g>
  );
}

/** Truncate label to fit within node */
function truncateLabel(label: string, maxWidth: number, fontSize: number): string {
  const avgCharWidth = fontSize * 0.6;
  const maxChars = Math.floor(maxWidth / avgCharWidth);
  if (label.length <= maxChars) return label;
  return label.slice(0, maxChars - 2) + "...";
}
