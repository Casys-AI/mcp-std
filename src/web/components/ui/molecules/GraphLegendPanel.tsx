/**
 * GraphLegendPanel Molecule - Legend panel for graph visualization
 * With view mode toggle, expand/collapse controls, and highlight depth
 */

import type { JSX } from "preact";
import Badge from "../atoms/Badge.tsx";
import Button from "../atoms/Button.tsx";
import Divider from "../atoms/Divider.tsx";
import Slider from "../atoms/Slider.tsx";

/** View mode for the graph */
export type ViewMode = "capabilities" | "tools";

/** Node mode - definition (generic tools) vs invocation (actual calls) */
export type NodeMode = "definition" | "invocation";

interface GraphLegendPanelProps {
  servers: Set<string>;
  hiddenServers: Set<string>;
  showOrphanNodes: boolean;
  getServerColor: (server: string) => string;
  onToggleServer: (server: string) => void;
  onToggleOrphans: () => void;
  onExportJson: () => void;
  onExportPng: () => void;
  // Highlight depth control
  highlightDepth?: number;
  onHighlightDepthChange?: (d: number) => void;
  // View mode control
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  // Node mode (instance vs invocation)
  nodeMode?: NodeMode;
  onNodeModeChange?: (mode: NodeMode) => void;
}

export default function GraphLegendPanel({
  servers,
  hiddenServers,
  showOrphanNodes,
  getServerColor,
  onToggleServer,
  onToggleOrphans,
  onExportJson,
  onExportPng,
  // Highlight depth
  highlightDepth = 1,
  onHighlightDepthChange,
  // View mode
  viewMode = "capabilities",
  onViewModeChange,
  // Node mode
  nodeMode = "definition",
  onNodeModeChange,
}: GraphLegendPanelProps): JSX.Element {
  return (
    <div
      class="absolute top-5 left-5 p-4 rounded-xl z-10 transition-all duration-300 max-h-[calc(100vh-120px)] overflow-y-auto"
      style={{
        background: "rgba(18, 17, 15, 0.95)",
        border: "1px solid var(--border)",
        backdropFilter: "blur(12px)",
        minWidth: "200px",
      }}
    >
      {/* View Mode Toggle */}
      {onViewModeChange && (
        <>
          <h3
            class="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: "var(--text-dim)" }}
          >
            View Mode
          </h3>
          <div class="flex gap-1 mb-3">
            <button
              class="flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: viewMode === "capabilities"
                  ? "var(--accent, #FFB86F)"
                  : "var(--bg-surface, #1a1816)",
                color: viewMode === "capabilities"
                  ? "var(--bg, #0a0908)"
                  : "var(--text-muted, #d5c3b5)",
                border: viewMode === "capabilities"
                  ? "1px solid var(--accent, #FFB86F)"
                  : "1px solid var(--border, rgba(255, 184, 111, 0.1))",
              }}
              onClick={() => onViewModeChange("capabilities")}
              title="Hierarchical view with expand/collapse"
            >
              Capabilities
            </button>
            <button
              class="flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: viewMode === "tools"
                  ? "var(--accent, #FFB86F)"
                  : "var(--bg-surface, #1a1816)",
                color: viewMode === "tools" ? "var(--bg, #0a0908)" : "var(--text-muted, #d5c3b5)",
                border: viewMode === "tools"
                  ? "1px solid var(--accent, #FFB86F)"
                  : "1px solid var(--border, rgba(255, 184, 111, 0.1))",
              }}
              onClick={() => onViewModeChange("tools")}
              title="Flat view of all tools"
            >
              Tools
            </button>
          </div>
          <Divider />
        </>
      )}

      {/* Node Mode */}
      {onNodeModeChange && (
        <>
          <h3
            class="text-xs font-semibold uppercase tracking-widest mb-2"
            style={{ color: "var(--text-dim)" }}
          >
            Node Mode
          </h3>
          <div class="flex gap-1 mb-3">
            <button
              class="flex-1 px-2 py-1.5 rounded text-xs font-medium transition-all"
              style={{
                background: nodeMode === "definition"
                  ? "var(--accent, #FFB86F)"
                  : "var(--bg-surface, #1a1816)",
                color: nodeMode === "definition"
                  ? "var(--bg, #0a0908)"
                  : "var(--text-muted, #d5c3b5)",
                border: nodeMode === "definition"
                  ? "1px solid var(--accent)"
                  : "1px solid var(--border)",
              }}
              onClick={() => onNodeModeChange("definition")}
              title="Generic tool definitions"
            >
              Definition
            </button>
            <button
              class="flex-1 px-2 py-1.5 rounded text-xs font-medium transition-all"
              style={{
                background: nodeMode === "invocation"
                  ? "var(--accent, #FFB86F)"
                  : "var(--bg-surface, #1a1816)",
                color: nodeMode === "invocation"
                  ? "var(--bg, #0a0908)"
                  : "var(--text-muted, #d5c3b5)",
                border: nodeMode === "invocation"
                  ? "1px solid var(--accent)"
                  : "1px solid var(--border)",
              }}
              onClick={() => onNodeModeChange("invocation")}
              title="Actual tool invocations with sequence"
            >
              Invocation
            </button>
          </div>
          <Divider />
        </>
      )}

      {/* MCP Servers */}
      <h3
        class="text-xs font-semibold uppercase tracking-widest mb-3"
        style={{ color: "var(--text-dim)" }}
      >
        MCP Servers
      </h3>
      {Array.from(servers).map((server) => (
        <Badge
          key={server}
          color={getServerColor(server)}
          label={server}
          active={!hiddenServers.has(server)}
          onClick={() => onToggleServer(server)}
        />
      ))}

      <Divider />

      {/* Orphan toggle */}
      <Badge
        color="transparent"
        label="Orphan nodes"
        active={showOrphanNodes}
        onClick={onToggleOrphans}
        class="border-2 border-dashed"
      />

      <Divider />

      {/* Highlight Depth Control */}
      {onHighlightDepthChange && (
        <>
          <h3
            class="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: "var(--text-dim)" }}
          >
            Highlight Depth
          </h3>

          <div class="mb-3">
            <Slider
              value={highlightDepth}
              min={1}
              max={10}
              step={1}
              label={highlightDepth >= 10 ? "∞" : String(highlightDepth)}
              onChange={(v) => onHighlightDepthChange(v >= 10 ? Infinity : v)}
            />
            <div class="flex justify-between text-[10px] mt-1" style={{ color: "var(--text-dim)" }}>
              <span>Direct (1)</span>
              <span>Full stack (∞)</span>
            </div>
          </div>

          <Divider />
        </>
      )}

      {/* Export buttons */}
      <div class="flex gap-2">
        <Button variant="default" size="sm" onClick={onExportJson} class="flex-1">
          Export JSON
        </Button>
        <Button variant="default" size="sm" onClick={onExportPng} class="flex-1">
          Export PNG
        </Button>
      </div>
    </div>
  );
}
