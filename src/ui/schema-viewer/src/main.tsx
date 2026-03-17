/**
 * Schema Viewer UI for MCP Apps
 *
 * Displays database table schema with:
 * - Column names, types, constraints
 * - Primary key indicators
 * - Nullable/default values
 * - Copy DDL functionality
 *
 * @module lib/std/src/ui/schema-viewer
 */

import { render } from "preact";
import { useState, useEffect, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { cx } from "../../components/utils";
import { Button } from "../../components/ui/button";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface Column {
  name: string;
  type: string;
  maxLength?: number | null;
  nullable: boolean;
  default: string | null;
  isPrimaryKey?: boolean;
}

interface SchemaData {
  table: string;
  columns: Column[];
}

interface ContentItem {
  type: string;
  text?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Schema Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Helpers
// ============================================================================

function generateDDL(data: SchemaData): string {
  const columns = data.columns.map((col) => {
    let line = `  "${col.name}" ${col.type.toUpperCase()}`;
    if (col.maxLength) line += `(${col.maxLength})`;
    if (!col.nullable) line += " NOT NULL";
    if (col.default) line += ` DEFAULT ${col.default}`;
    if (col.isPrimaryKey) line += " PRIMARY KEY";
    return line;
  });
  return `CREATE TABLE "${data.table}" (\n${columns.join(",\n")}\n);`;
}

// ============================================================================
// Main Component
// ============================================================================

function SchemaViewer() {
  const [data, setData] = useState<SchemaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");

  // Connect to MCP host
  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
      console.log("[schema-viewer] Connected to MCP host");
    }).catch(() => {
      console.log("[schema-viewer] No MCP host (standalone mode)");
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
        const parsed = JSON.parse(textContent.text);
        setData(parsed);
        setSelectedColumn(null);
      } catch (e) {
        setError(`Failed to parse schema: ${e instanceof Error ? e.message : "Unknown error"}`);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // Handlers
  const handleSelectColumn = useCallback((columnName: string) => {
    setSelectedColumn(columnName === selectedColumn ? null : columnName);
    notifyModel("selectColumn", { column: columnName });
  }, [selectedColumn]);

  const handleCopyDDL = useCallback(() => {
    if (!data) return;
    const ddl = generateDDL(data);
    navigator.clipboard.writeText(ddl);
    notifyModel("copyDDL", { table: data.table });
  }, [data]);

  // Filter columns
  const filteredColumns = data?.columns.filter((col) =>
    col.name.toLowerCase().includes(filterText.toLowerCase()) ||
    col.type.toLowerCase().includes(filterText.toLowerCase())
  ) ?? [];

  // Render
  if (loading) {
    return (
      <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-[200px]">
        <div className="p-10 text-center text-fg-muted">Loading schema...</div>
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

  if (!data || data.columns.length === 0) {
    return (
      <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-[200px]">
        <div className="p-10 text-center text-fg-muted">No schema data</div>
      </div>
    );
  }

  return (
    <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-[200px]">
      {/* Header */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-fg-muted">T</span>
          <span className="font-bold text-lg text-fg-default">{data.table}</span>
          <span className="text-fg-muted text-sm">{data.columns.length} columns</span>
        </div>
        <Button variant="outline" size="sm" onClick={handleCopyDDL}>Copy DDL</Button>
      </div>

      {/* Filter */}
      <input
        type="text"
        placeholder="Filter columns..."
        value={filterText}
        onChange={(e) => setFilterText((e.target as HTMLInputElement).value)}
        className="w-full mb-3 px-3 py-2 text-sm border border-border-default rounded-md bg-bg-canvas text-fg-default placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {/* Schema Table */}
      <div className="rounded-lg overflow-hidden border border-border-default">
        <table className="w-full text-sm">
          <thead className="bg-bg-subtle">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-fg-default">Column</th>
              <th className="px-4 py-3 text-left font-medium text-fg-default">Type</th>
              <th className="px-4 py-3 text-left font-medium text-fg-default">Nullable</th>
              <th className="px-4 py-3 text-left font-medium text-fg-default">Default</th>
            </tr>
          </thead>
          <tbody>
            {filteredColumns.map((col) => (
              <tr
                key={col.name}
                onClick={() => handleSelectColumn(col.name)}
                className={cx(
                  "cursor-pointer hover:bg-bg-subtle border-t border-border-default",
                  selectedColumn === col.name && "bg-blue-50 dark:bg-blue-950"
                )}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {col.isPrimaryKey && (
                      <span className="px-1.5 py-0.5 text-xs font-bold bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded-sm">
                        PK
                      </span>
                    )}
                    <span className={col.isPrimaryKey ? "font-bold" : "font-normal"}>
                      {col.name}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <code className="font-mono text-sm text-blue-600 dark:text-blue-400">
                    {col.type}
                    {col.maxLength && `(${col.maxLength})`}
                  </code>
                </td>
                <td className="px-4 py-3">
                  <span className={cx(
                    col.nullable
                      ? "text-green-600 dark:text-green-400 font-normal"
                      : "text-red-600 dark:text-red-400 font-medium"
                  )}>
                    {col.nullable ? "YES" : "NO"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <code className="font-mono text-sm text-fg-muted">
                    {col.default ?? <span className="italic">NULL</span>}
                  </code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Selected Column Details */}
      {selectedColumn && (
        <div className="mt-4 p-3 bg-bg-subtle rounded-lg border border-border-default">
          <h4 className="mb-2 font-medium">Column Details: {selectedColumn}</h4>
          {(() => {
            const col = data.columns.find((c) => c.name === selectedColumn);
            if (!col) return null;
            return (
              <pre className="font-mono text-xs p-2 bg-bg-canvas rounded-md overflow-auto">
{`{
  "name": "${col.name}",
  "type": "${col.type}${col.maxLength ? `(${col.maxLength})` : ""}",
  "nullable": ${col.nullable},
  "default": ${col.default ? `"${col.default}"` : "null"},
  "isPrimaryKey": ${col.isPrimaryKey ?? false}
}`}
              </pre>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Mount
// ============================================================================

render(<SchemaViewer />, document.getElementById("app")!);
