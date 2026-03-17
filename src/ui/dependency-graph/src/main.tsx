/**
 * Dependency Graph UI for MCP Apps
 *
 * Visualizes project dependencies with:
 * - Production/Dev/Peer grouping
 * - Search/filter
 * - Click to select
 *
 * @module lib/std/src/ui/dependency-graph
 */

import { render } from "preact";
import { useState, useEffect } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { cx } from "../../components/utils";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface Dependency {
  name: string;
  version: string;
  type: "prod" | "dev" | "peer" | "optional";
  dependencies?: string[];
}

interface DependencyData {
  name: string;
  version: string;
  dependencies: Dependency[];
  devDependencies?: Dependency[];
  totalCount?: number;
}

interface ContentItem {
  type: string;
  text?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Dependency Graph", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Component
// ============================================================================

function DependencyGraph() {
  const [data, setData] = useState<DependencyData | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Connect to MCP host
    app.connect().then(() => {
      appConnected = true;
      console.log("[dependency-graph] Connected to MCP host");
    }).catch(() => {
      console.log("[dependency-graph] No MCP host (standalone mode)");
      // Demo data for standalone mode
      setData({
        name: "my-project",
        version: "1.0.0",
        dependencies: [
          { name: "preact", version: "^10.19.0", type: "prod" },
          { name: "express", version: "^4.18.0", type: "prod" },
          { name: "lodash", version: "^4.17.21", type: "prod" },
        ],
        devDependencies: [
          { name: "typescript", version: "^5.3.0", type: "dev" },
          { name: "vite", version: "^5.0.0", type: "dev" },
          { name: "eslint", version: "^8.55.0", type: "dev" },
        ],
        totalCount: 6,
      });
      setLoading(false);
    });

    // Handle tool results
    app.ontoolresult = (result: { content?: ContentItem[] }) => {
      setLoading(false);
      if (result.content) {
        for (const item of result.content) {
          if (item.type === "text" && item.text) {
            try {
              const parsed = JSON.parse(item.text);
              setData(parsed as DependencyData);
              return;
            } catch {
              // Not JSON, continue
            }
          }
        }
      }
      // Try direct result
      if (typeof result === "object" && "name" in (result as object)) {
        setData(result as unknown as DependencyData);
      }
    };
  }, []);

  const handleSelect = (dep: Dependency) => {
    notifyModel("selected", { dependency: dep });
  };

  if (loading && !data) {
    return (
      <div className="p-4 max-w-[900px] mx-auto text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 min-h-screen font-sans">
        <div className="text-center p-10 text-gray-500 dark:text-gray-400">Loading dependencies...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 max-w-[900px] mx-auto text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 min-h-screen font-sans">
        <div className="text-center p-10 text-gray-500 dark:text-gray-400">No data received</div>
      </div>
    );
  }

  const allDeps = [
    ...(data.dependencies || []),
    ...(data.devDependencies || []),
  ];

  const filteredDeps = allDeps.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  const prodDeps = filteredDeps.filter(d => d.type === "prod");
  const devDeps = filteredDeps.filter(d => d.type === "dev");
  const peerDeps = filteredDeps.filter(d => d.type === "peer");

  return (
    <div className="p-4 max-w-[900px] mx-auto text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 min-h-screen font-sans">
      {/* Header */}
      <div className="mb-5">
        <div className="text-lg font-semibold mb-1 text-gray-900 dark:text-gray-100">
          {data.name}
        </div>
        <div className="text-gray-500 dark:text-gray-400 text-sm">v{data.version}</div>
      </div>

      {/* Stats */}
      <div className="flex gap-4 mb-5 flex-wrap">
        <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg text-center border border-gray-200 dark:border-gray-700">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {data.dependencies?.length || 0}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Production</div>
        </div>
        <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg text-center border border-gray-200 dark:border-gray-700">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {data.devDependencies?.length || 0}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Development</div>
        </div>
        <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg text-center border border-gray-200 dark:border-gray-700">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {data.totalCount || allDeps.length}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Total</div>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <Input
          type="text"
          placeholder="Search dependencies..."
          value={search}
          onChange={(e) => setSearch((e.target as HTMLInputElement).value)}
        />
      </div>

      {/* Production Dependencies */}
      {prodDeps.length > 0 && (
        <div className="flex flex-col gap-3 mb-6 items-stretch">
          <div className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Production Dependencies
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
            {prodDeps.map((dep) => (
              <div
                key={dep.name}
                className="p-2.5 bg-gray-100 dark:bg-gray-800 rounded-md border-l-[3px] border-l-blue-500 cursor-pointer transition-all duration-150 hover:bg-gray-200 dark:hover:bg-gray-700"
                onClick={() => handleSelect(dep)}
              >
                <div className="font-medium text-sm mb-0.5 text-gray-900 dark:text-gray-100">
                  {dep.name}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                  {dep.version}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dev Dependencies */}
      {devDeps.length > 0 && (
        <div className="flex flex-col gap-3 mb-6 items-stretch">
          <div className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Dev Dependencies
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
            {devDeps.map((dep) => (
              <div
                key={dep.name}
                className="p-2.5 bg-gray-100 dark:bg-gray-800 rounded-md border-l-[3px] border-l-purple-500 cursor-pointer transition-all duration-150 hover:bg-gray-200 dark:hover:bg-gray-700"
                onClick={() => handleSelect(dep)}
              >
                <div className="font-medium text-sm mb-0.5 text-gray-900 dark:text-gray-100">
                  {dep.name}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                  {dep.version}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Peer Dependencies */}
      {peerDeps.length > 0 && (
        <div className="flex flex-col gap-3 mb-6 items-stretch">
          <div className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Peer Dependencies
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
            {peerDeps.map((dep) => (
              <div
                key={dep.name}
                className="p-2.5 bg-gray-100 dark:bg-gray-800 rounded-md border-l-[3px] border-l-yellow-500 cursor-pointer transition-all duration-150 hover:bg-gray-200 dark:hover:bg-gray-700"
                onClick={() => handleSelect(dep)}
              >
                <div className="font-medium text-sm mb-0.5 text-gray-900 dark:text-gray-100">
                  {dep.name}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                  {dep.version}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {filteredDeps.length === 0 && (
        <div className="text-center p-10 text-gray-500 dark:text-gray-400">No dependencies found</div>
      )}
    </div>
  );
}

render(<DependencyGraph />, document.getElementById("app")!);
