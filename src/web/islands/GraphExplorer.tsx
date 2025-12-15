/**
 * GraphExplorer Island - Search and explore graph with advanced features
 *
 * Story 6.4: Graph Explorer & Search Interface
 * Story 8.3: Hypergraph View Mode with capability zones
 * Enhanced: Compound nodes, expand/collapse, view modes
 * Styled with Casys.ai design system
 */

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { createPortal } from "preact/compat";
import CytoscapeGraph, {
  type CapabilityData,
  type ToolData,
  type ViewMode,
} from "./CytoscapeGraph.tsx";
import CodePanel from "./CodePanel.tsx";
import GraphLegendPanel from "../components/ui/molecules/GraphLegendPanel.tsx";

interface ToolSearchResult {
  tool_id: string;
  name: string;
  server: string;
  description: string;
  score: number;
  pagerank: number;
}

interface RelatedTool {
  tool_id: string;
  name: string;
  server: string;
  adamic_adar_score: number;
  edge_confidence: number | null;
}

interface PathResult {
  path: string[];
  total_hops: number;
  from: string;
  to: string;
}

interface BreadcrumbItem {
  id: string;
  label: string;
  server: string;
}

interface GraphExplorerProps {
  apiBase?: string;
}

export default function GraphExplorer({ apiBase: apiBaseProp }: GraphExplorerProps) {
  const apiBase = apiBaseProp || "http://localhost:3003";

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ToolSearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [highlightedNode, setHighlightedNode] = useState<string | null>(null);
  const [pathNodes, setPathNodes] = useState<string[] | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [relatedTools, setRelatedTools] = useState<RelatedTool[]>([]);
  const [showPathFinder, setShowPathFinder] = useState(false);
  const [pathFrom, setPathFrom] = useState("");
  const [pathTo, setPathTo] = useState("");
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  // Story 8.4: Selected capability for CodePanel
  const [selectedCapability, setSelectedCapability] = useState<CapabilityData | null>(null);
  // Selected tool for CodePanel (tool info display)
  const [selectedTool, setSelectedTool] = useState<ToolData | null>(null);

  // New: View mode and expand/collapse state
  const [viewMode, setViewMode] = useState<ViewMode>("capabilities");
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [highlightDepth, setHighlightDepth] = useState(1);
  const [layoutDirection, setLayoutDirection] = useState<"TB" | "LR">("TB");

  // Server filtering state (for GraphLegendPanel)
  const [servers, setServers] = useState<Set<string>>(new Set());
  const [hiddenServers, setHiddenServers] = useState<Set<string>>(new Set());
  const [showOrphanNodes, setShowOrphanNodes] = useState(true);

  // SSE refresh trigger for incremental graph updates
  const [graphRefreshKey, setGraphRefreshKey] = useState(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<number | null>(null);
  const graphRef = useRef<HTMLDivElement>(null);

  // Server color mapping
  const serverColorsRef = useRef<Map<string, string>>(new Map());
  const SERVER_COLORS = [
    "#FFB86F",
    "#FF6B6B",
    "#4ECDC4",
    "#FFE66D",
    "#95E1D3",
    "#F38181",
    "#AA96DA",
    "#FCBAD3",
  ];

  const getServerColor = useCallback((server: string): string => {
    if (server === "unknown") return "#8a8078";
    if (!serverColorsRef.current.has(server)) {
      const index = serverColorsRef.current.size % SERVER_COLORS.length;
      serverColorsRef.current.set(server, SERVER_COLORS[index]);
    }
    return serverColorsRef.current.get(server)!;
  }, []);

  // Load servers list from API
  useEffect(() => {
    const loadServers = async () => {
      try {
        const response = await fetch(`${apiBase}/api/graph/hypergraph`);
        if (response.ok) {
          const data = await response.json();
          const serverSet = new Set<string>();

          // API returns nodes array with both capabilities and tools
          for (const node of data.nodes || []) {
            const d = node.data;
            if (d.type === "tool" && d.server) {
              serverSet.add(d.server);
            }
          }

          setServers(serverSet);
        }
      } catch (error) {
        console.error("Failed to load servers:", error);
      }
    };
    loadServers();
  }, [apiBase]);

  // SSE listener for incremental graph updates (Story 8.3)
  useEffect(() => {
    const eventSource = new EventSource(`${apiBase}/events/stream`);

    // Handle capability zone events - trigger graph refresh
    const handleCapabilityEvent = () => {
      console.log("[SSE] Capability event received, refreshing graph...");
      setGraphRefreshKey((prev) => prev + 1);
    };

    eventSource.addEventListener("capability.zone.created", handleCapabilityEvent);
    eventSource.addEventListener("capability.zone.updated", handleCapabilityEvent);
    eventSource.addEventListener("capability.learned", handleCapabilityEvent);

    eventSource.onerror = (err) => {
      console.warn("[SSE] EventSource error:", err);
    };

    return () => {
      eventSource.close();
    };
  }, [apiBase]);

  // Toggle server visibility
  const handleToggleServer = useCallback((server: string) => {
    setHiddenServers((prev) => {
      const next = new Set(prev);
      if (next.has(server)) {
        next.delete(server);
      } else {
        next.add(server);
      }
      return next;
    });
  }, []);

  // Export handlers (placeholder)
  const handleExportJson = useCallback(() => {
    console.log("Export JSON not yet implemented");
  }, []);

  const handleExportPng = useCallback(() => {
    console.log("Export PNG not yet implemented");
  }, []);

  // Find header slot for portal
  useEffect(() => {
    const slot = document.getElementById("header-search-slot");
    if (slot) setHeaderSlot(slot);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey && e.key === "k") ||
        (e.key === "/" && !e.ctrlKey && document.activeElement?.tagName !== "INPUT")
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === "Escape") {
        setSearchQuery("");
        setShowResults(false);
        setHighlightedNode(null);
        setPathNodes(null);
        searchInputRef.current?.blur();
      }
      if (e.ctrlKey && e.key === "p") {
        e.preventDefault();
        setShowPathFinder(!showPathFinder);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showPathFinder]);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (searchQuery.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `${apiBase}/api/tools/search?q=${encodeURIComponent(searchQuery)}&limit=10`,
        );
        const data = await response.json();
        setSearchResults(data.results || []);
        setShowResults(true);
      } catch (error) {
        console.error("Search failed:", error);
        setSearchResults([]);
      }
    }, 200) as unknown as number;

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery]);

  // Story 8.4: Handle capability selection from hull click
  const handleCapabilitySelect = (capability: CapabilityData | null) => {
    setSelectedCapability(capability);
    if (capability) setSelectedTool(null); // Clear tool when capability selected
  };

  // Handle tool selection from node click
  const handleToolSelect = (tool: ToolData | null) => {
    setSelectedTool(tool);
    if (tool) setSelectedCapability(null); // Clear capability when tool selected
  };

  const handleNodeSelect = async (node: { id: string; label: string; server: string } | null) => {
    if (!node) {
      setRelatedTools([]);
      return;
    }

    setBreadcrumbs((prev) => {
      const existing = prev.findIndex((b) => b.id === node.id);
      if (existing >= 0) return prev.slice(0, existing + 1);
      return [...prev, { id: node.id, label: node.label, server: node.server }];
    });

    try {
      const response = await fetch(
        `${apiBase}/api/graph/related?tool_id=${encodeURIComponent(node.id)}&limit=5`,
      );
      const data = await response.json();
      setRelatedTools(data.related || []);
    } catch (error) {
      console.error("Failed to fetch related tools:", error);
      setRelatedTools([]);
    }
  };

  const selectSearchResult = (result: ToolSearchResult) => {
    setHighlightedNode(result.tool_id);
    setShowResults(false);
    setSearchQuery("");

    setBreadcrumbs((prev) => {
      const existing = prev.findIndex((b) => b.id === result.tool_id);
      if (existing >= 0) return prev.slice(0, existing + 1);
      return [...prev, { id: result.tool_id, label: result.name, server: result.server }];
    });
  };

  const findPath = async () => {
    if (!pathFrom || !pathTo) return;

    try {
      const response = await fetch(
        `${apiBase}/api/graph/path?from=${encodeURIComponent(pathFrom)}&to=${
          encodeURIComponent(pathTo)
        }`,
      );
      const data: PathResult = await response.json();

      if (data.path && data.path.length > 0) {
        setPathNodes(data.path);
        setHighlightedNode(null);
      } else {
        alert("No path found between these tools");
      }
    } catch (error) {
      console.error("Path finding failed:", error);
    }
  };

  const navigateBreadcrumb = (item: BreadcrumbItem, index: number) => {
    setHighlightedNode(item.id);
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
    setPathNodes(null);
  };

  const clearPath = () => {
    setPathNodes(null);
    setPathFrom("");
    setPathTo("");
  };

  // Casys design tokens
  const styles = {
    panel: {
      background: "var(--bg-elevated, #12110f)",
      border: "1px solid var(--border, rgba(255, 184, 111, 0.1))",
      backdropFilter: "blur(12px)",
    },
    input: {
      background: "var(--bg-surface, #1a1816)",
      border: "1px solid var(--border, rgba(255, 184, 111, 0.1))",
      color: "var(--text, #f5f0ea)",
    },
    inputFocus: {
      borderColor: "var(--accent, #FFB86F)",
      boxShadow: "0 0 0 2px var(--accent-dim, rgba(255, 184, 111, 0.1))",
    },
    button: {
      background: "var(--bg-surface, #1a1816)",
      border: "1px solid var(--border, rgba(255, 184, 111, 0.1))",
      color: "var(--text-muted, #d5c3b5)",
    },
    buttonActive: {
      background: "var(--accent-dim, rgba(255, 184, 111, 0.1))",
      borderColor: "var(--accent, #FFB86F)",
      color: "var(--accent, #FFB86F)",
    },
    buttonPrimary: {
      background: "var(--accent, #FFB86F)",
      color: "var(--bg, #0a0908)",
    },
    kbd: {
      background: "var(--accent-dim, rgba(255, 184, 111, 0.1))",
      border: "1px solid var(--border, rgba(255, 184, 111, 0.1))",
      color: "var(--text-dim, #8a8078)",
    },
  };

  // SearchBar component to portal into header
  const searchBarContent = (
    <div class="flex gap-3 items-center">
      <div class="relative">
        <input
          ref={searchInputRef}
          type="text"
          class="w-[420px] py-2.5 px-4 pr-[60px] rounded-xl text-sm font-medium outline-none transition-all duration-200 placeholder:opacity-50"
          style={{
            ...styles.input,
            fontFamily: "var(--font-sans)",
          }}
          placeholder="Search tools... (/ or Ctrl+K)"
          value={searchQuery}
          onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
          onFocus={(e) => {
            searchQuery.length >= 2 && setShowResults(true);
            Object.assign(e.currentTarget.style, styles.inputFocus);
          }}
          onBlur={(e) => {
            setTimeout(() => setShowResults(false), 200);
            e.currentTarget.style.borderColor = "var(--border)";
            e.currentTarget.style.boxShadow = "none";
          }}
        />
        <span class="absolute right-3 top-1/2 -translate-y-1/2">
          <kbd class="px-2 py-0.5 rounded-md text-xs font-medium" style={styles.kbd}>/</kbd>
        </span>

        {/* Autocomplete Results - dropdown below search */}
        {showResults && searchResults.length > 0 && (
          <div
            class="absolute top-full left-0 right-0 mt-2 rounded-xl overflow-hidden max-h-[400px] overflow-y-auto shadow-2xl z-50"
            style={styles.panel}
          >
            {searchResults.map((result) => (
              <div
                key={result.tool_id}
                class="px-4 py-3 cursor-pointer flex justify-between items-center transition-colors"
                style={{ borderBottom: "1px solid var(--border)" }}
                onClick={() => selectSearchResult(result)}
                onMouseOver={(e) => e.currentTarget.style.background = "var(--accent-dim)"}
                onMouseOut={(e) => e.currentTarget.style.background = "transparent"}
              >
                <div class="flex gap-3 items-center">
                  <span style={{ color: "var(--text)", fontWeight: 600, fontSize: "0.875rem" }}>
                    {result.name}
                  </span>
                  <span
                    class="text-xs px-2 py-1 rounded-md font-medium"
                    style={{ background: "var(--bg-surface)", color: "var(--text-dim)" }}
                  >
                    {result.server}
                  </span>
                </div>
                <div class="flex gap-3 text-xs">
                  <span style={{ color: "var(--success)", fontWeight: 600 }}>
                    {(result.score * 100).toFixed(0)}%
                  </span>
                  <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                    PR: {result.pagerank.toFixed(3)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Path Finder Toggle */}
      <button
        class="py-2.5 px-4 rounded-xl text-sm font-semibold transition-all duration-200"
        style={showPathFinder ? styles.buttonActive : styles.button}
        onClick={() => setShowPathFinder(!showPathFinder)}
        title="Find Path (Ctrl+P)"
        onMouseOver={(e) =>
          !showPathFinder && (e.currentTarget.style.borderColor = "var(--accent-medium)")}
        onMouseOut={(e) => !showPathFinder && (e.currentTarget.style.borderColor = "var(--border)")}
      >
        Path
      </button>
    </div>
  );

  return (
    <div
      class="w-full h-full relative overflow-hidden"
      style={{ display: "flex", flexDirection: "column" }}
    >
      {/* SearchBar rendered in header via portal */}
      {headerSlot && createPortal(searchBarContent, headerSlot)}

      {/* Path Finder Panel */}
      {showPathFinder && (
        <div
          class="absolute top-20 left-1/2 -translate-x-1/2 z-[90] p-4 px-5 rounded-xl shadow-2xl mt-2"
          style={styles.panel}
        >
          <div class="flex gap-3 items-center">
            <input
              type="text"
              class="w-[200px] py-3 px-4 rounded-lg text-sm font-medium outline-none transition-all"
              style={styles.input}
              placeholder="From tool..."
              value={pathFrom}
              onInput={(e) => setPathFrom((e.target as HTMLInputElement).value)}
              onFocus={(e) => Object.assign(e.currentTarget.style, styles.inputFocus)}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
            <span style={{ color: "var(--accent)", fontSize: "1.25rem" }}>→</span>
            <input
              type="text"
              class="w-[200px] py-3 px-4 rounded-lg text-sm font-medium outline-none transition-all"
              style={styles.input}
              placeholder="To tool..."
              value={pathTo}
              onInput={(e) => setPathTo((e.target as HTMLInputElement).value)}
              onFocus={(e) => Object.assign(e.currentTarget.style, styles.inputFocus)}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
            <button
              onClick={findPath}
              class="py-3 px-5 rounded-lg text-sm font-semibold cursor-pointer transition-all duration-200 hover:brightness-110"
              style={styles.buttonPrimary}
            >
              Find Path
            </button>
            {pathNodes && (
              <button
                onClick={clearPath}
                class="py-3 px-4 rounded-lg text-sm font-medium cursor-pointer transition-all"
                style={{
                  background: "rgba(248, 113, 113, 0.1)",
                  border: "1px solid rgba(248, 113, 113, 0.2)",
                  color: "var(--error)",
                }}
              >
                Clear
              </button>
            )}
          </div>
          {pathNodes && pathNodes.length > 0 && (
            <div class="mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
              <span style={{ color: "var(--success)", fontSize: "0.875rem", fontWeight: 600 }}>
                Path ({pathNodes.length - 1} hops):
              </span>
              <div class="mt-2.5 flex flex-wrap gap-1.5 items-center">
                {pathNodes.map((nodeId, i) => (
                  <span key={nodeId}>
                    {i > 0 && (
                      <span
                        style={{ color: "var(--accent)", margin: "0 0.25rem", fontWeight: 600 }}
                      >
                        →
                      </span>
                    )}
                    <span
                      class="cursor-pointer px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all"
                      style={{
                        color: "var(--accent)",
                        background: "var(--accent-dim)",
                        border: "1px solid var(--accent-medium)",
                      }}
                      onClick={() => setHighlightedNode(nodeId)}
                      onMouseOver={(e) =>
                        e.currentTarget.style.background = "var(--accent-medium)"}
                      onMouseOut={(e) =>
                        e.currentTarget.style.background = "var(--accent-dim)"}
                    >
                      {nodeId.split(":")[1] || nodeId}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Breadcrumbs - positioned to avoid legend panel */}
      {breadcrumbs.length > 0 && (
        <div
          class="absolute top-5 left-[240px] z-[80] py-2.5 px-4 rounded-xl flex items-center gap-2.5 text-sm"
          style={styles.panel}
        >
          <span style={{ color: "var(--text-dim)", fontWeight: 500 }}>History:</span>
          {breadcrumbs.map((item, index) => (
            <span key={item.id}>
              {index > 0 && <span style={{ color: "var(--text-dim)", opacity: 0.5 }}>/</span>}
              <span
                class="cursor-pointer px-2.5 py-1 rounded-md font-medium transition-all"
                style={{
                  color: index === breadcrumbs.length - 1 ? "var(--accent)" : "var(--text-muted)",
                  background: index === breadcrumbs.length - 1
                    ? "var(--accent-dim)"
                    : "transparent",
                }}
                onClick={() => navigateBreadcrumb(item, index)}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = "var(--accent-dim)";
                  e.currentTarget.style.color = "var(--text)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = index === breadcrumbs.length - 1
                    ? "var(--accent-dim)"
                    : "transparent";
                  e.currentTarget.style.color = index === breadcrumbs.length - 1
                    ? "var(--accent)"
                    : "var(--text-muted)";
                }}
              >
                {item.label}
              </span>
            </span>
          ))}
          <button
            class="border-none cursor-pointer ml-2 px-2 py-1 rounded transition-all"
            style={{ background: "transparent", color: "var(--text-dim)" }}
            onClick={() => setBreadcrumbs([])}
            title="Clear history"
            onMouseOver={(e) => {
              e.currentTarget.style.color = "var(--error)";
              e.currentTarget.style.background = "rgba(248, 113, 113, 0.1)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.color = "var(--text-dim)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Related Tools Panel */}
      {relatedTools.length > 0 && (
        <div
          class="absolute top-[300px] right-5 z-[80] p-4 px-5 rounded-xl min-w-[260px] max-w-[300px] max-h-[280px] overflow-y-auto shadow-xl"
          style={styles.panel}
        >
          <h4
            class="text-xs uppercase tracking-widest mb-3 font-semibold"
            style={{ color: "var(--text-dim)" }}
          >
            Related Tools (Adamic-Adar)
          </h4>
          <div class="flex flex-col gap-2">
            {relatedTools.map((tool) => (
              <div
                key={tool.tool_id}
                class="flex justify-between items-center p-2.5 px-3 rounded-xl cursor-pointer transition-all duration-200"
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid transparent",
                }}
                onClick={() => setHighlightedNode(tool.tool_id)}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = "var(--accent-dim)";
                  e.currentTarget.style.borderColor = "var(--accent-medium)";
                  e.currentTarget.style.transform = "translateX(4px)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = "var(--bg-surface)";
                  e.currentTarget.style.borderColor = "transparent";
                  e.currentTarget.style.transform = "translateX(0)";
                }}
              >
                <span style={{ color: "var(--text)", fontSize: "0.875rem", fontWeight: 500 }}>
                  {tool.name}
                </span>
                <span
                  style={{ color: "var(--text-dim)", fontSize: "0.75rem", marginLeft: "0.5rem" }}
                >
                  {tool.server}
                </span>
                <span style={{ color: "var(--accent)", fontSize: "0.75rem", fontWeight: 600 }}>
                  AA: {tool.adamic_adar_score.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Graph Visualization (Cytoscape.js) */}
      <div ref={graphRef} style={{ flex: 1, position: "relative", minHeight: 0 }}>
        <CytoscapeGraph
          apiBase={apiBase}
          onNodeSelect={handleNodeSelect}
          onCapabilitySelect={handleCapabilitySelect}
          onToolSelect={handleToolSelect}
          highlightedNodeId={highlightedNode}
          pathNodes={pathNodes}
          highlightDepth={highlightDepth}
          viewMode={viewMode}
          expandedNodes={expandedNodes}
          onExpandedNodesChange={setExpandedNodes}
          layoutDirection={layoutDirection}
          refreshKey={graphRefreshKey}
        />

        {/* GraphLegendPanel with all controls */}
        <GraphLegendPanel
          servers={servers}
          hiddenServers={hiddenServers}
          showOrphanNodes={showOrphanNodes}
          getServerColor={getServerColor}
          onToggleServer={handleToggleServer}
          onToggleOrphans={() => setShowOrphanNodes(!showOrphanNodes)}
          onExportJson={handleExportJson}
          onExportPng={handleExportPng}
          highlightDepth={highlightDepth}
          onHighlightDepthChange={setHighlightDepth}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          layoutDirection={layoutDirection}
          onLayoutDirectionChange={setLayoutDirection}
        />
      </div>

      {/* Story 8.4: Code Panel (bottom panel when capability or tool selected) */}
      {(selectedCapability || selectedTool) && (
        <CodePanel
          capability={selectedCapability}
          tool={selectedTool}
          onClose={() => {
            setSelectedCapability(null);
            setSelectedTool(null);
          }}
          onToolClick={(toolId) => {
            setHighlightedNode(toolId);
          }}
        />
      )}
    </div>
  );
}
