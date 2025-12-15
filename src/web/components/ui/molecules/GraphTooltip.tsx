/**
 * GraphTooltip Molecule - Enriched tooltip for graph nodes
 * Story 6.4 AC11: Shows tool name, server, pagerank, degree on hover
 */

import type { JSX } from "preact";
import type { GraphNodeData } from "../atoms/GraphNode.tsx";

interface GraphTooltipProps {
  data: GraphNodeData;
  x: number;
  y: number;
  serverColor: string;
}

export default function GraphTooltip({
  data,
  x,
  y,
  serverColor,
}: GraphTooltipProps): JSX.Element {
  return (
    <div
      class="absolute py-2.5 px-3.5 rounded-lg text-xs pointer-events-none z-[1000]"
      style={{
        left: `${x}px`,
        top: `${y}px`,
        transform: "translate(-50%, -100%)",
        background: "rgba(18, 17, 15, 0.97)",
        border: "1px solid rgba(255, 184, 111, 0.25)",
        backdropFilter: "blur(12px)",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.4)",
        minWidth: "160px",
      }}
    >
      {/* Header: Tool name */}
      <div class="font-bold text-sm mb-2" style={{ color: "#fff" }}>
        {data.label}
      </div>

      {/* Server with color indicator */}
      <div class="flex items-center gap-2 mb-1.5">
        <div
          class="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ background: serverColor }}
        />
        <span style={{ color: "#d5c3b5" }}>{data.server}</span>
      </div>

      {/* Metrics */}
      <div
        class="flex gap-4 pt-1.5 mt-1.5"
        style={{ borderTop: "1px solid rgba(255, 255, 255, 0.1)" }}
      >
        <div>
          <span style={{ color: "#6b6560" }}>PR </span>
          <span style={{ color: "#ffb86f" }}>{data.pagerank.toFixed(3)}</span>
        </div>
        <div>
          <span style={{ color: "#6b6560" }}>Deg </span>
          <span style={{ color: "#d5c3b5" }}>{data.degree}</span>
        </div>
      </div>
    </div>
  );
}
