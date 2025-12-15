/**
 * GraphMarkers Atom - SVG marker definitions for arrow heads
 * Used for: D3 graph visualization edge arrows
 */

import type { JSX } from "preact";
import { getEdgeColor, type EdgeType } from "./GraphEdge.tsx";

interface GraphMarkersProps {
  id: string;
}

const EDGE_TYPES: EdgeType[] = ["contains", "sequence", "dependency"];

/**
 * SVG Defs containing arrow markers for each edge type
 * Must be placed inside the SVG element
 */
export default function GraphMarkers({ id }: GraphMarkersProps): JSX.Element {
  return (
    <defs>
      {EDGE_TYPES.map((edgeType) => (
        <marker
          key={edgeType}
          id={`${id}-${edgeType}`}
          viewBox="0 -5 10 10"
          refX={20}
          refY={0}
          markerWidth={6}
          markerHeight={6}
          orient="auto"
        >
          <path d="M0,-5L10,0L0,5" fill={getEdgeColor(edgeType)} />
        </marker>
      ))}
      {/* Highlighted marker */}
      <marker
        id={`${id}-highlighted`}
        viewBox="0 -5 10 10"
        refX={20}
        refY={0}
        markerWidth={6}
        markerHeight={6}
        orient="auto"
      >
        <path d="M0,-5L10,0L0,5" fill="#FFB86F" />
      </marker>
      {/* Path marker (green) */}
      <marker
        id={`${id}-path`}
        viewBox="0 -5 10 10"
        refX={20}
        refY={0}
        markerWidth={6}
        markerHeight={6}
        orient="auto"
      >
        <path d="M0,-5L10,0L0,5" fill="#22c55e" />
      </marker>
    </defs>
  );
}
