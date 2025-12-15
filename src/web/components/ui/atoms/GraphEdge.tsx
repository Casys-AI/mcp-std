/**
 * GraphEdge Atom - SVG line/path representing a graph edge
 * Used for: D3 graph visualization edges
 * Supports ADR-041 edge types and sources
 */

import type { JSX } from "preact";

export type EdgeType = "contains" | "sequence" | "dependency";
export type EdgeSource = "observed" | "inferred" | "template";

export interface GraphEdgeData {
  id: string;
  source: string;
  target: string;
  confidence: number;
  observed_count: number;
  edge_type: EdgeType;
  edge_source: EdgeSource;
  // D3 simulation adds these
  sourceX?: number;
  sourceY?: number;
  targetX?: number;
  targetY?: number;
}

interface GraphEdgeProps {
  data: GraphEdgeData;
  isPath?: boolean;
  highlighted?: boolean;
  hidden?: boolean;
  markerId: string;
}

/** Get edge color based on type (ADR-041) */
export function getEdgeColor(edgeType: EdgeType): string {
  switch (edgeType) {
    case "contains":
      return "#ef4444"; // red (capability → tool)
    case "dependency":
      return "#3b82f6"; // blue
    case "sequence":
    default:
      return "#FFB86F"; // orange
  }
}

/** Get edge stroke style based on source (ADR-041) */
export function getEdgeStrokeDasharray(edgeSource: EdgeSource): string {
  switch (edgeSource) {
    case "observed":
      return "none";
    case "template":
      return "2,4";
    case "inferred":
    default:
      return "6,3";
  }
}

/** Get edge opacity based on source (ADR-041) */
export function getEdgeOpacity(edgeSource: EdgeSource): number {
  switch (edgeSource) {
    case "observed":
      return 0.9;
    case "template":
      return 0.4;
    case "inferred":
    default:
      return 0.6;
  }
}

/** Calculate edge width based on confidence */
export function getEdgeWidth(confidence: number): number {
  // Minimum 2px for FDEB bundle visibility (Holten paper)
  return Math.max(2, 2 + confidence * 3);
}

export default function GraphEdge({
  data,
  isPath = false,
  highlighted = false,
  hidden = false,
  markerId,
}: GraphEdgeProps): JSX.Element | null {
  if (hidden) return null;

  const x1 = data.sourceX ?? 0;
  const y1 = data.sourceY ?? 0;
  const x2 = data.targetX ?? 0;
  const y2 = data.targetY ?? 0;

  // Calculate path with slight curve for better visual
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dr = Math.sqrt(dx * dx + dy * dy) * 0.8;

  // Determine styling
  let color: string;
  let strokeWidth: number;
  let opacity: number;
  let strokeDasharray: string;

  if (isPath) {
    color = "#22c55e";
    strokeWidth = 3;
    opacity = 1;
    strokeDasharray = "none";
  } else if (highlighted) {
    color = "#FFB86F";
    strokeWidth = 3;
    opacity = 1;
    strokeDasharray = "none";
  } else {
    color = getEdgeColor(data.edge_type);
    strokeWidth = getEdgeWidth(data.confidence);
    opacity = getEdgeOpacity(data.edge_source);
    strokeDasharray = getEdgeStrokeDasharray(data.edge_source);
  }

  // Use curved path for better aesthetics
  const pathD = `M${x1},${y1} A${dr},${dr} 0 0,1 ${x2},${y2}`;

  return (
    <path
      class="graph-edge"
      d={pathD}
      fill="none"
      stroke={color}
      stroke-width={strokeWidth}
      stroke-dasharray={strokeDasharray}
      opacity={opacity}
      marker-end={`url(#${markerId}-${data.edge_type})`}
      style={{ transition: "all 0.2s ease" }}
    />
  );
}
