/**
 * Table Viewer UI for MCP Apps
 *
 * Interactive table using Preact + Tailwind CSS.
 * Displays query results with sorting, filtering, pagination, and row selection.
 *
 * Stack: Preact + Tailwind CSS
 *
 * @module lib/std/src/ui/table-viewer
 */

import { render } from "preact";
import { useState, useEffect, useMemo, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { Button } from "../../components/ui/button";
import { Alert } from "../../components/ui/alert";
import { Tooltip } from "../../components/ui/tooltip";
import { cx, formatValue as fmtVal } from "../../components/utils";
import {
  TableSkeleton,
  interactive,
  typography,
  containers,
} from "../../shared";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface QueryResult {
  columns: string[];
  rows: unknown[][];
  totalCount?: number;
}

interface ContentItem {
  type: string;
  text?: string;
}

type SortDirection = "asc" | "desc";

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Table Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Table Component
// ============================================================================

function TableViewer() {
  const [data, setData] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<number>(-1);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [filterText, setFilterText] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);

  const pageSize = 50;

  // Connect to MCP host
  useEffect(() => {
    app.connect()
      .then(() => {
        appConnected = true;
      })
      .catch(() => {});

    app.ontoolresult = (result: { content?: ContentItem[]; isError?: boolean }) => {
      setLoading(false);
      setError(null);

      try {
        const textContent = result.content?.find((c) => c.type === "text") as
          | ContentItem
          | undefined;
        if (!textContent?.text) {
          setData(null);
          return;
        }

        const parsed = JSON.parse(textContent.text);
        const normalized = normalizeData(parsed);
        setData(normalized);
        setCurrentPage(0);
        setSelectedRow(null);
      } catch (e) {
        setError(`Failed to parse data: ${e instanceof Error ? e.message : "Unknown error"}`);
      }
    };

    app.ontoolinputpartial = () => {
      setLoading(true);
    };
  }, []);

  // Filter rows
  const filteredRows = useMemo(() => {
    if (!data?.rows) return [];
    if (!filterText) return data.rows;

    const search = filterText.toLowerCase();
    return data.rows.filter((row) =>
      row.some((cell) => String(cell ?? "").toLowerCase().includes(search))
    );
  }, [data?.rows, filterText]);

  // Sort rows
  const sortedRows = useMemo(() => {
    if (sortColumn < 0) return filteredRows;

    return [...filteredRows].sort((a, b) => {
      const va = a[sortColumn];
      const vb = b[sortColumn];

      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;

      let cmp: number;
      if (typeof va === "number" && typeof vb === "number") {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb));
      }

      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [filteredRows, sortColumn, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(sortedRows.length / pageSize);
  const pageRows = sortedRows.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const startIdx = currentPage * pageSize;

  // Handlers
  const handleSort = useCallback(
    (colIdx: number) => {
      if (sortColumn === colIdx) {
        const newDir = sortDirection === "asc" ? "desc" : "asc";
        setSortDirection(newDir);
        notifyModel("sort", { column: data?.columns[colIdx], direction: newDir });
      } else {
        setSortColumn(colIdx);
        setSortDirection("asc");
        notifyModel("sort", { column: data?.columns[colIdx], direction: "asc" });
      }
    },
    [sortColumn, sortDirection, data?.columns]
  );

  const handleFilter = useCallback((e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    setFilterText(value);
    setCurrentPage(0);
    if (value) notifyModel("filter", { text: value });
  }, []);

  const handleRowClick = useCallback(
    (rowIdx: number) => {
      const absoluteIdx = startIdx + rowIdx;
      if (selectedRow === absoluteIdx) {
        setSelectedRow(null);
      } else {
        setSelectedRow(absoluteIdx);
        if (data) {
          const row = data.rows[absoluteIdx];
          const rowObj: Record<string, unknown> = {};
          data.columns.forEach((col, i) => {
            rowObj[col] = row[i];
          });
          notifyModel("select", { rowIndex: absoluteIdx, row: rowObj });
        }
      }
    },
    [selectedRow, startIdx, data]
  );

  // Loading state with skeleton
  if (loading) {
    return <TableSkeleton rows={8} />;
  }

  // Error state with Alert
  if (error) {
    return (
      <div className={cx(containers.root, "max-w-full overflow-hidden")}>
        <Alert status="error" title="Error">{error}</Alert>
      </div>
    );
  }

  // Empty state
  if (!data || data.rows.length === 0) {
    return (
      <div className={cx(containers.root, "max-w-full overflow-hidden")}>
        <div className={containers.centered}>No data to display</div>
      </div>
    );
  }

  return (
    <div className={cx(containers.root, "max-w-full overflow-hidden")}>
      {/* Header */}
      <div className="flex gap-3 mb-3 items-center flex-wrap">
        <input
          type="text"
          placeholder="Filter rows..."
          value={filterText}
          onInput={handleFilter}
          className={cx(
            "flex-1 min-w-[200px] px-3 py-1.5 text-sm border border-border-default rounded-md bg-bg-canvas",
            interactive.focusRing
          )}
        />
        <div className={cx(typography.muted, "whitespace-nowrap")}>
          Showing {startIdx + 1}-{Math.min(startIdx + pageSize, sortedRows.length)} of{" "}
          {sortedRows.length}
          {filterText && ` (filtered from ${data.rows.length})`}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border-default">
              {data.columns.map((col, i) => (
                <th
                  key={i}
                  onClick={() => handleSort(i)}
                  onKeyDown={(e) => e.key === "Enter" && handleSort(i)}
                  tabIndex={0}
                  className={cx(
                    "px-3 py-2 text-left font-medium cursor-pointer select-none whitespace-nowrap",
                    "transition-colors duration-150 hover:bg-bg-muted",
                    interactive.focusRing,
                    sortColumn === i && "bg-bg-muted"
                  )}
                >
                  {col}
                  <span className="ml-1 opacity-50">
                    {sortColumn === i ? (sortDirection === "asc" ? "\u25B2" : "\u25BC") : "\u21C5"}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, rowIdx) => {
              const absoluteIdx = startIdx + rowIdx;
              const isSelected = selectedRow === absoluteIdx;
              return (
                <tr
                  key={absoluteIdx}
                  onClick={() => handleRowClick(rowIdx)}
                  className={cx(
                    "border-b border-border-subtle",
                    interactive.rowHover,
                    isSelected && "bg-blue-50 hover:bg-blue-100 dark:bg-blue-950 dark:hover:bg-blue-900"
                  )}
                >
                  {row.map((cell, cellIdx) => {
                    const isNull = cell == null;
                    const isNumber = typeof cell === "number";
                    const displayValue = isNull ? "NULL" : formatValue(cell);
                    const shouldTruncate = displayValue.length > 40;

                    const cellContent = (
                      <td
                        key={cellIdx}
                        className={cx(
                          "px-3 py-2 max-w-[300px] overflow-hidden text-ellipsis whitespace-nowrap",
                          isNull && "text-fg-muted italic",
                          isNumber && "font-mono text-right"
                        )}
                      >
                        {displayValue}
                      </td>
                    );

                    if (shouldTruncate) {
                      return (
                        <Tooltip key={cellIdx} content={displayValue}>
                          {cellContent}
                        </Tooltip>
                      );
                    }

                    return cellContent;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center mt-3 gap-3">
          <div className={typography.muted}>
            Page {currentPage + 1} of {totalPages}
          </div>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="xs"
              disabled={currentPage === 0}
              onClick={() => setCurrentPage(0)}
              className={interactive.scaleOnHover}
            >
              First
            </Button>
            <Button
              variant="outline"
              size="xs"
              disabled={currentPage === 0}
              onClick={() => setCurrentPage((p) => p - 1)}
              className={interactive.scaleOnHover}
            >
              Prev
            </Button>
            <Button
              variant="outline"
              size="xs"
              disabled={currentPage >= totalPages - 1}
              onClick={() => setCurrentPage((p) => p + 1)}
              className={interactive.scaleOnHover}
            >
              Next
            </Button>
            <Button
              variant="outline"
              size="xs"
              disabled={currentPage >= totalPages - 1}
              onClick={() => setCurrentPage(totalPages - 1)}
              className={interactive.scaleOnHover}
            >
              Last
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function normalizeData(parsed: unknown): QueryResult | null {
  if (parsed && typeof parsed === "object" && "content" in parsed) {
    const content = (parsed as { content: ContentItem[] }).content;
    const textItem = content?.find((c) => c.type === "text");
    if (textItem?.text) {
      try {
        const innerParsed = JSON.parse(textItem.text);
        return normalizeData(innerParsed);
      } catch {
        // Not JSON, treat as raw text
      }
    }
  }

  if (Array.isArray(parsed)) {
    if (parsed.length > 0 && typeof parsed[0] === "object" && parsed[0] !== null) {
      const columns = Object.keys(parsed[0]);
      const rows = parsed.map((item) => columns.map((col) => (item as Record<string, unknown>)[col]));
      return { columns, rows, totalCount: rows.length };
    }
    return { columns: ["value"], rows: parsed.map((v) => [v]), totalCount: parsed.length };
  }

  if (parsed && typeof parsed === "object") {
    if ("columns" in parsed && "rows" in parsed) {
      return parsed as QueryResult;
    }

    const entries = Object.entries(parsed);
    const arrayEntry = entries.find(
      ([, v]) => Array.isArray(v) && v.length > 0 && typeof v[0] === "object" && v[0] !== null
    );
    if (arrayEntry) {
      const [, arrayData] = arrayEntry;
      const arr = arrayData as Record<string, unknown>[];
      const columns = Object.keys(arr[0]);
      const rows = arr.map((item) => columns.map((col) => item[col]));
      return { columns, rows, totalCount: rows.length };
    }

    return {
      columns: ["key", "value"],
      rows: entries.map(([k, v]) => [k, formatValue(v)]),
      totalCount: entries.length,
    };
  }

  return null;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// ============================================================================
// Mount
// ============================================================================

render(<TableViewer />, document.getElementById("app")!);
