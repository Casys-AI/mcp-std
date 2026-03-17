/**
 * JSON Viewer UI for MCP Apps
 *
 * Interactive JSON tree viewer with:
 * - Collapsible nodes
 * - Syntax highlighting
 * - Path copying
 * - Search/filter
 *
 * @module lib/std/src/ui/json-viewer
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

interface JsonNode {
  key: string;
  value: unknown;
  path: string;
  type: "object" | "array" | "string" | "number" | "boolean" | "null";
  children?: JsonNode[];
}

interface ContentItem {
  type: string;
  text?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "JSON Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// JSON Tree Component
// ============================================================================

function JsonTreeNode({
  node,
  depth,
  expanded,
  onToggle,
  onSelect,
  searchTerm,
}: {
  node: JsonNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (path: string, value: unknown) => void;
  searchTerm: string;
}) {
  const isExpanded = expanded.has(node.path);
  const hasChildren = node.children && node.children.length > 0;
  const matchesSearch = searchTerm &&
    (node.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
     String(node.value).toLowerCase().includes(searchTerm.toLowerCase()));

  const typeColorClass: Record<string, string> = {
    string: "text-green-600 dark:text-green-400",
    number: "text-blue-600 dark:text-blue-400",
    boolean: "text-purple-600 dark:text-purple-400",
    null: "text-gray-500 dark:text-gray-400",
    object: "text-fg-default",
    array: "text-fg-default",
  };

  return (
    <div className={depth > 0 ? "pl-4" : ""}>
      <div
        className={cx(
          "flex items-center gap-1 py-0.5 px-1 rounded cursor-pointer",
          matchesSearch ? "bg-yellow-100 dark:bg-yellow-900/30" : "bg-transparent",
          "hover:bg-bg-subtle"
        )}
        onClick={() => {
          if (hasChildren) onToggle(node.path);
          else onSelect(node.path, node.value);
        }}
      >
        {/* Expand/collapse icon */}
        {hasChildren ? (
          <span className="w-4 text-fg-muted text-xs">
            {isExpanded ? "▼" : "▶"}
          </span>
        ) : (
          <span className="w-4" />
        )}

        {/* Key */}
        <span className="text-fg-default font-medium">
          {node.key}
        </span>

        <span className="text-fg-muted">:</span>

        {/* Value preview */}
        {hasChildren ? (
          <span className="text-fg-muted text-xs">
            {node.type === "array"
              ? `[${node.children!.length}]`
              : `{${node.children!.length}}`}
          </span>
        ) : (
          <span className={cx("font-mono text-sm", typeColorClass[node.type])}>
            {formatValue(node.value, node.type)}
          </span>
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {node.children!.map((child) => (
            <JsonTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              searchTerm={searchTerm}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function JsonViewer() {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["$"]));
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  // Connect to MCP host
  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
      console.log("[json-viewer] Connected to MCP host");
    }).catch(() => {
      console.log("[json-viewer] No MCP host (standalone mode)");
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
        setData(JSON.parse(textContent.text));
        setExpanded(new Set(["$"]));
      } catch (e) {
        setError(`Failed to parse JSON: ${e instanceof Error ? e.message : "Unknown error"}`);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // Build tree
  const tree = useMemo(() => {
    if (data === null || data === undefined) return null;
    return buildTree("$", data, "$");
  }, [data]);

  // Handlers
  const handleToggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleSelect = useCallback((path: string, value: unknown) => {
    setSelectedPath(path);
    notifyModel("select", { path, value });
  }, []);

  const handleExpandAll = useCallback(() => {
    if (!tree) return;
    const paths = collectPaths(tree);
    setExpanded(new Set(paths));
  }, [tree]);

  const handleCollapseAll = useCallback(() => {
    setExpanded(new Set(["$"]));
  }, []);

  const handleCopyPath = useCallback(() => {
    if (selectedPath) {
      navigator.clipboard.writeText(selectedPath);
      notifyModel("copy", { path: selectedPath });
    }
  }, [selectedPath]);

  // Render
  if (loading) {
    return (
      <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-[200px]">
        <div className="p-10 text-center text-fg-muted">Loading JSON...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-[200px]">
        <div className="p-4 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 rounded-md">
          {error}
        </div>
      </div>
    );
  }

  if (!tree) {
    return (
      <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-[200px]">
        <div className="p-10 text-center text-fg-muted">No JSON data</div>
      </div>
    );
  }

  return (
    <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-[200px]">
      {/* Toolbar */}
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <input
          type="text"
          placeholder="Search keys or values..."
          value={searchTerm}
          onChange={(e) => setSearchTerm((e.target as HTMLInputElement).value)}
          className="flex-1 min-w-[150px] px-3 py-1.5 text-sm border border-border-default rounded-md bg-bg-canvas text-fg-default placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <Button variant="outline" size="sm" onClick={handleExpandAll}>Expand All</Button>
        <Button variant="outline" size="sm" onClick={handleCollapseAll}>Collapse</Button>
        {selectedPath && (
          <Button variant="outline" size="sm" onClick={handleCopyPath}>Copy Path</Button>
        )}
      </div>

      {/* Selected path */}
      {selectedPath && (
        <div className="flex gap-2 items-center mb-2 p-2 bg-bg-subtle rounded-md">
          <span className="text-fg-muted text-xs">Path:</span>
          <code className="text-xs text-blue-600 dark:text-blue-400 font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
            {selectedPath}
          </code>
        </div>
      )}

      {/* Tree */}
      <div
        className="border border-border-default rounded-lg p-3 bg-white dark:bg-gray-900 overflow-x-auto font-mono text-sm"
      >
        <JsonTreeNode
          node={tree}
          depth={0}
          expanded={expanded}
          onToggle={handleToggle}
          onSelect={handleSelect}
          searchTerm={searchTerm}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function buildTree(key: string, value: unknown, path: string): JsonNode {
  const type = getType(value);
  const node: JsonNode = { key, value, path, type };

  if (type === "object" && value !== null) {
    node.children = Object.entries(value as Record<string, unknown>).map(([k, v]) =>
      buildTree(k, v, `${path}.${k}`)
    );
  } else if (type === "array") {
    node.children = (value as unknown[]).map((v, i) =>
      buildTree(String(i), v, `${path}[${i}]`)
    );
  }

  return node;
}

function getType(value: unknown): JsonNode["type"] {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value as JsonNode["type"];
}

function formatValue(value: unknown, type: string): string {
  if (type === "string") return `"${String(value).slice(0, 50)}${String(value).length > 50 ? "..." : ""}"`;
  if (type === "null") return "null";
  return String(value);
}

function collectPaths(node: JsonNode): string[] {
  const paths = [node.path];
  if (node.children) {
    node.children.forEach((child) => paths.push(...collectPaths(child)));
  }
  return paths;
}

// ============================================================================
// Mount
// ============================================================================

render(<JsonViewer />, document.getElementById("app")!);
