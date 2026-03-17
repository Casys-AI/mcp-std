/**
 * ERD Viewer UI for MCP Apps
 *
 * Interactive Entity-Relationship Diagram with:
 * - Visual table boxes with columns
 * - Foreign key relationship lines
 * - Pan and zoom support
 * - Table/relation selection
 *
 * @module lib/std/src/ui/erd-viewer
 */

import { render } from "preact";
import { useState, useEffect, useCallback, useRef, useMemo } from "preact/hooks";
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
  nullable: boolean;
  default: string | null;
  isPrimaryKey: boolean;
}

interface Table {
  name: string;
  columns: Column[];
}

interface Relationship {
  name: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

interface ERDData {
  schema: string;
  tables: Table[];
  relationships: Relationship[];
  tableCount: number;
  relationshipCount: number;
}

interface TablePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ContentItem {
  type: string;
  text?: string;
}

// ============================================================================
// Constants
// ============================================================================

const TABLE_WIDTH = 220;
const HEADER_HEIGHT = 32;
const ROW_HEIGHT = 24;
const TABLE_PADDING = 8;
const GRID_COLS = 3;
const GRID_GAP_X = 100;
const GRID_GAP_Y = 60;

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "ERD Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Layout Helpers
// ============================================================================

function calculateTablePositions(tables: Table[]): Map<string, TablePosition> {
  const positions = new Map<string, TablePosition>();

  tables.forEach((table, index) => {
    const col = index % GRID_COLS;
    const row = Math.floor(index / GRID_COLS);
    const height = HEADER_HEIGHT + table.columns.length * ROW_HEIGHT + TABLE_PADDING * 2;

    positions.set(table.name, {
      x: col * (TABLE_WIDTH + GRID_GAP_X) + 50,
      y: row * (Math.max(...tables.map((t) => HEADER_HEIGHT + t.columns.length * ROW_HEIGHT + TABLE_PADDING * 2)) + GRID_GAP_Y) + 50,
      width: TABLE_WIDTH,
      height,
    });
  });

  return positions;
}

function getConnectionPoints(
  fromPos: TablePosition,
  toPos: TablePosition,
  fromColumnIndex: number,
  toColumnIndex: number
): { x1: number; y1: number; x2: number; y2: number } {
  const fromY = fromPos.y + HEADER_HEIGHT + fromColumnIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
  const toY = toPos.y + HEADER_HEIGHT + toColumnIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
  const fromRight = fromPos.x + fromPos.width;
  const toRight = toPos.x + toPos.width;

  let x1: number, x2: number;

  if (fromRight < toPos.x) {
    x1 = fromRight;
    x2 = toPos.x;
  } else if (toRight < fromPos.x) {
    x1 = fromPos.x;
    x2 = toRight;
  } else {
    x1 = fromRight;
    x2 = toRight;
  }

  return { x1, y1: fromY, x2, y2: toY };
}

// ============================================================================
// Main Component
// ============================================================================

function ERDViewer() {
  const [data, setData] = useState<ERDData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [selectedRelation, setSelectedRelation] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
      console.log("[erd-viewer] Connected to MCP host");
    }).catch(() => {
      console.log("[erd-viewer] No MCP host (standalone mode)");
    });

    app.ontoolresult = (result: { content?: ContentItem[] }) => {
      setLoading(false);
      setError(null);
      try {
        const textContent = result.content?.find((c) => c.type === "text") as ContentItem | undefined;
        if (!textContent?.text) { setData(null); return; }
        const parsed = JSON.parse(textContent.text);
        setData(parsed);
        setSelectedTable(null);
        setSelectedRelation(null);
        setZoom(1);
        setPan({ x: 0, y: 0 });
      } catch (e) {
        setError(`Failed to parse ERD data: ${e instanceof Error ? e.message : "Unknown error"}`);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  const tablePositions = useMemo(() => {
    if (!data) return new Map();
    return calculateTablePositions(data.tables);
  }, [data]);

  const svgBounds = useMemo(() => {
    let maxX = 800;
    let maxY = 600;
    tablePositions.forEach((pos) => {
      maxX = Math.max(maxX, pos.x + pos.width + 50);
      maxY = Math.max(maxY, pos.y + pos.height + 50);
    });
    return { width: maxX, height: maxY };
  }, [tablePositions]);

  const handleSelectTable = useCallback((tableName: string) => {
    setSelectedTable(tableName === selectedTable ? null : tableName);
    setSelectedRelation(null);
    notifyModel("selectTable", { table: tableName });
  }, [selectedTable]);

  const handleSelectRelation = useCallback((relationName: string) => {
    setSelectedRelation(relationName === selectedRelation ? null : relationName);
    setSelectedTable(null);
    notifyModel("selectRelation", { relation: relationName });
  }, [selectedRelation]);

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(z + 0.2, 2));
    notifyModel("zoom", { level: zoom + 0.2 });
  }, [zoom]);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(z - 0.2, 0.4));
    notifyModel("zoom", { level: zoom - 0.2 });
  }, [zoom]);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (e.button === 0) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  }, [isPanning, panStart]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  if (loading) {
    return (
      <div className="p-4 font-sans text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 min-h-[400px] flex flex-col">
        <div className="p-10 text-center text-gray-500 dark:text-gray-400">Loading ERD...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 font-sans text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 min-h-[400px] flex flex-col">
        <div className="p-4 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 rounded-md">{error}</div>
      </div>
    );
  }

  if (!data || data.tables.length === 0) {
    return (
      <div className="p-4 font-sans text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 min-h-[400px] flex flex-col">
        <div className="p-10 text-center text-gray-500 dark:text-gray-400">No tables to display</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col p-4 font-sans text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 min-h-[400px] items-stretch gap-3">
      {/* Toolbar */}
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="font-bold text-lg">Schema: {data.schema}</div>
          <div className="text-gray-500 dark:text-gray-400 text-sm">{data.tableCount} tables, {data.relationshipCount} relationships</div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleZoomOut}>-</Button>
          <div className="min-w-[50px] text-center text-sm text-gray-500 dark:text-gray-400">{Math.round(zoom * 100)}%</div>
          <Button variant="outline" size="sm" onClick={handleZoomIn}>+</Button>
        </div>
      </div>

      {/* SVG Canvas */}
      <div
        ref={containerRef}
        className={cx(
          "flex-1 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 min-h-[350px]",
          isPanning ? "cursor-grabbing" : "cursor-grab"
        )}
        onMouseDown={handleMouseDown as any}
        onMouseMove={handleMouseMove as any}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${svgBounds.width} ${svgBounds.height}`}
          style={{
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            transformOrigin: "0 0",
          }}
        >
          {/* Relationship lines */}
          <g className="relationships">
            {data.relationships.map((rel) => {
              const fromPos = tablePositions.get(rel.fromTable);
              const toPos = tablePositions.get(rel.toTable);
              if (!fromPos || !toPos) return null;

              const fromTable = data.tables.find((t) => t.name === rel.fromTable);
              const toTable = data.tables.find((t) => t.name === rel.toTable);
              if (!fromTable || !toTable) return null;

              const fromColIdx = fromTable.columns.findIndex((c) => c.name === rel.fromColumn);
              const toColIdx = toTable.columns.findIndex((c) => c.name === rel.toColumn);
              const points = getConnectionPoints(fromPos, toPos, fromColIdx, toColIdx);
              const isSelected = selectedRelation === rel.name;
              const midX = (points.x1 + points.x2) / 2;
              const path = `M ${points.x1} ${points.y1} C ${midX} ${points.y1}, ${midX} ${points.y2}, ${points.x2} ${points.y2}`;

              return (
                <g key={rel.name} onClick={() => handleSelectRelation(rel.name)} style={{ cursor: "pointer" }}>
                  <path d={path} fill="none" stroke={isSelected ? "#3b82f6" : "#94a3b8"} strokeWidth={isSelected ? 3 : 2} />
                  <circle cx={points.x2} cy={points.y2} r={4} fill={isSelected ? "#3b82f6" : "#94a3b8"} />
                </g>
              );
            })}
          </g>

          {/* Tables */}
          <g className="tables">
            {data.tables.map((table) => {
              const pos = tablePositions.get(table.name);
              if (!pos) return null;

              const isSelected = selectedTable === table.name;
              const isConnected = data.relationships.some((r) => r.fromTable === table.name || r.toTable === table.name);

              return (
                <g key={table.name} transform={`translate(${pos.x}, ${pos.y})`} onClick={() => handleSelectTable(table.name)} style={{ cursor: "pointer" }}>
                  {/* Table box */}
                  <rect width={pos.width} height={pos.height} rx={6} fill={isSelected ? "#eff6ff" : "#ffffff"} stroke={isSelected ? "#3b82f6" : isConnected ? "#64748b" : "#e2e8f0"} strokeWidth={isSelected ? 2 : 1} />
                  {/* Header */}
                  <rect width={pos.width} height={HEADER_HEIGHT} rx={6} fill={isSelected ? "#3b82f6" : "#1e293b"} />
                  <rect y={HEADER_HEIGHT - 6} width={pos.width} height={6} fill={isSelected ? "#3b82f6" : "#1e293b"} />
                  <text x={pos.width / 2} y={HEADER_HEIGHT / 2 + 5} textAnchor="middle" fill="#ffffff" fontWeight="bold" fontSize="13">
                    {table.name}
                  </text>
                  {/* Columns */}
                  {table.columns.map((col, idx) => {
                    const y = HEADER_HEIGHT + idx * ROW_HEIGHT + TABLE_PADDING;
                    const isFk = data.relationships.some((r) => r.fromTable === table.name && r.fromColumn === col.name);

                    return (
                      <g key={col.name}>
                        <text x={TABLE_PADDING} y={y + ROW_HEIGHT / 2 + 4} fontSize="11" fill={col.isPrimaryKey ? "#d97706" : isFk ? "#7c3aed" : "#334155"} fontWeight={col.isPrimaryKey ? "bold" : "normal"}>
                          {col.isPrimaryKey ? "# " : isFk ? "> " : ""}{col.name}
                        </text>
                        <text x={pos.width - TABLE_PADDING} y={y + ROW_HEIGHT / 2 + 4} textAnchor="end" fontSize="10" fill="#94a3b8" fontFamily="monospace">
                          {col.type}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Selected Info Panel */}
      {(selectedTable || selectedRelation) && (
        <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          {selectedTable && (
            <div>
              <h4 className="font-semibold m-0">Table: {selectedTable}</h4>
              <div className="text-gray-500 dark:text-gray-400">{data.tables.find((t) => t.name === selectedTable)?.columns.length} columns</div>
            </div>
          )}
          {selectedRelation && (
            <div>
              {(() => {
                const rel = data.relationships.find((r) => r.name === selectedRelation);
                if (!rel) return null;
                return (
                  <>
                    <h4 className="font-semibold m-0">Relationship: {rel.name}</h4>
                    <div className="text-gray-500 dark:text-gray-400">{rel.fromTable}.{rel.fromColumn} - {rel.toTable}.{rel.toColumn}</div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Mount
// ============================================================================

render(<ERDViewer />, document.getElementById("app")!);
