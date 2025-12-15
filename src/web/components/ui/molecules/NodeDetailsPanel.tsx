/**
 * NodeDetailsPanel Molecule - Details panel for selected graph node
 * Story 6.4 AC3: Shows label, server, pagerank, degree when node is selected
 */

import type { JSX } from "preact";
import type { GraphNodeData } from "../atoms/GraphNode.tsx";

interface NodeDetailsPanelProps {
  node: GraphNodeData;
  onClose: () => void;
}

export default function NodeDetailsPanel({
  node,
  onClose,
}: NodeDetailsPanelProps): JSX.Element {
  return (
    <div
      class="absolute bottom-5 left-5 p-5 rounded-xl min-w-[280px] z-10"
      style={{
        background: "rgba(18, 17, 15, 0.9)",
        border: "1px solid rgba(255, 184, 111, 0.1)",
        backdropFilter: "blur(12px)",
      }}
    >
      <span
        class="absolute top-3 right-3 cursor-pointer w-7 h-7 flex items-center justify-center rounded-md transition-all"
        style={{ color: "#8a8078" }}
        onClick={onClose}
        onMouseOver={(e) => {
          e.currentTarget.style.background = "rgba(248, 113, 113, 0.1)";
          e.currentTarget.style.color = "#f87171";
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "#8a8078";
        }}
      >
        ✕
      </span>
      <h3
        class="text-lg font-semibold mb-3"
        style={{ color: "#FFB86F" }}
      >
        {node.label}
      </h3>
      <p class="text-sm my-2 leading-relaxed" style={{ color: "#d5c3b5" }}>
        <span style={{ color: "#8a8078" }}>Server:</span> {node.server}
      </p>
      <p class="text-sm my-2 leading-relaxed" style={{ color: "#d5c3b5" }}>
        <span style={{ color: "#8a8078" }}>PageRank:</span> {node.pagerank.toFixed(4)}
      </p>
      <p class="text-sm my-2 leading-relaxed" style={{ color: "#d5c3b5" }}>
        <span style={{ color: "#8a8078" }}>Degree:</span> {node.degree}
      </p>
    </div>
  );
}
