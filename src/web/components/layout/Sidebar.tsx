/**
 * Sidebar Component - Refactored with Atomic Design components
 * Contains: SearchBar, MCP Servers filter, Edge Types legend, Confidence legend, Export buttons
 */

import SearchBar from "../ui/molecules/SearchBar.tsx";
import LegendItem from "../ui/molecules/LegendItem.tsx";
import Button from "../ui/atoms/Button.tsx";
import Divider from "../ui/atoms/Divider.tsx";
import Badge from "../ui/atoms/Badge.tsx";

interface SidebarProps {
  // Search
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onSearchFocus?: () => void;
  onSearchBlur?: () => void;

  // Server filters
  servers: Set<string>;
  hiddenServers: Set<string>;
  onToggleServer: (server: string) => void;
  getServerColor: (server: string) => string;

  // Orphan toggle
  showOrphanNodes: boolean;
  onToggleOrphanNodes: () => void;

  // Export
  onExport: (format: "json" | "png") => void;
}

export default function Sidebar({
  searchQuery = "",
  onSearchChange,
  onSearchFocus,
  onSearchBlur,
  servers,
  hiddenServers,
  onToggleServer,
  getServerColor,
  showOrphanNodes,
  onToggleOrphanNodes,
  onExport,
}: SidebarProps) {
  // Build server filter items
  const serverItems = Array.from(servers).map((server) => ({
    id: server,
    label: server,
    color: getServerColor(server),
    active: !hiddenServers.has(server),
  }));

  // Edge types legend data
  const edgeTypes = [
    {
      id: "contains",
      label: "Contains (parent→child)",
      color: "#22c55e",
      lineStyle: "solid" as const,
    },
    { id: "sequence", label: "Sequence (siblings)", color: "#FFB86F", lineStyle: "solid" as const },
    {
      id: "dependency",
      label: "Dependency (explicit)",
      color: "#f5f0ea",
      lineStyle: "solid" as const,
    },
  ];

  // Confidence legend data
  const confidenceLevels = [
    {
      id: "observed",
      label: "Observed (3+ runs)",
      color: "var(--text-dim)",
      lineStyle: "solid" as const,
      opacity: 1,
    },
    {
      id: "inferred",
      label: "Inferred (1-2 runs)",
      color: "var(--text-dim)",
      lineStyle: "dashed" as const,
      opacity: 1,
    },
    {
      id: "template",
      label: "Template (bootstrap)",
      color: "var(--text-dim)",
      lineStyle: "dotted" as const,
      opacity: 0.5,
    },
  ];

  return (
    <aside
      class="w-[240px] h-full flex flex-col py-4 px-4 overflow-y-auto"
      style={{
        background: "var(--bg-elevated)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* Search Bar */}
      {onSearchChange && (
        <>
          <SearchBar
            value={searchQuery}
            onChange={onSearchChange}
            onFocus={onSearchFocus}
            onBlur={onSearchBlur}
            placeholder="Search tools..."
            shortcut="/"
            class="mb-4"
          />
          <Divider />
        </>
      )}

      {/* MCP Servers Filter */}
      <section class="mb-4">
        <h3
          class="text-xs font-semibold uppercase tracking-widest mb-3"
          style={{ color: "var(--text-dim)" }}
        >
          MCP Servers
        </h3>
        {serverItems.map((item) => (
          <Badge
            key={item.id}
            color={item.color}
            label={item.label}
            active={item.active}
            onClick={() => onToggleServer(item.id)}
          />
        ))}
      </section>

      <Divider />

      {/* Edge Types Legend */}
      <section class="mb-4">
        <h3
          class="text-xs font-semibold uppercase tracking-widest mb-3"
          style={{ color: "var(--text-dim)" }}
        >
          Edge Types
        </h3>
        {edgeTypes.map((item) => (
          <LegendItem
            key={item.id}
            label={item.label}
            color={item.color}
            lineStyle={item.lineStyle}
          />
        ))}
      </section>

      <Divider />

      {/* Confidence Legend */}
      <section class="mb-4">
        <h3
          class="text-xs font-semibold uppercase tracking-widest mb-3"
          style={{ color: "var(--text-dim)" }}
        >
          Confidence
        </h3>
        {confidenceLevels.map((item) => (
          <LegendItem
            key={item.id}
            label={item.label}
            color={item.color}
            lineStyle={item.lineStyle}
            opacity={item.opacity}
          />
        ))}
      </section>

      <Divider />

      {/* Orphan Toggle */}
      <div
        class={`flex items-center gap-2.5 py-2 px-3 -mx-3 cursor-pointer rounded-lg transition-all duration-200 ${
          showOrphanNodes ? "" : "opacity-35"
        }`}
        onClick={onToggleOrphanNodes}
        onMouseOver={(e) => (e.currentTarget.style.background = "var(--accent-dim)")}
        onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <div
          class="w-3 h-3 rounded-full border-2 border-dashed flex-shrink-0"
          style={{ borderColor: "var(--text-dim)", background: "var(--bg-surface)" }}
        />
        <span class="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
          Orphan nodes
        </span>
      </div>

      {/* Spacer */}
      <div class="flex-1 min-h-4" />

      {/* Export Buttons */}
      <div class="flex gap-2 mt-4">
        <Button
          variant="default"
          size="sm"
          onClick={() => onExport("json")}
          class="flex-1"
        >
          Export JSON
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={() => onExport("png")}
          class="flex-1"
        >
          Export PNG
        </Button>
      </div>
    </aside>
  );
}
