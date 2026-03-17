/**
 * Plan Viewer UI for MCP Apps
 *
 * Displays PostgreSQL EXPLAIN ANALYZE query plans with:
 * - Tree visualization of operations
 * - Actual time, rows, loops for each node
 * - Relative cost bar (% of total)
 * - Highlighting for slow operations (>50% of time)
 * - Expandable details (buffers, filter, etc.)
 *
 * @module lib/std/src/ui/plan-viewer
 */

import { render } from "preact";
import { useState, useEffect, useCallback, useMemo } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { cx } from "../../components/utils";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { IconButton } from "../../components/ui/icon-button";
import * as Card from "../../components/ui/card";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface PlanNode {
  "Node Type": string;
  "Relation Name"?: string;
  "Index Name"?: string;
  "Alias"?: string;
  "Startup Cost"?: number;
  "Total Cost"?: number;
  "Plan Rows"?: number;
  "Plan Width"?: number;
  "Actual Startup Time"?: number;
  "Actual Total Time"?: number;
  "Actual Rows"?: number;
  "Actual Loops"?: number;
  "Filter"?: string;
  "Rows Removed by Filter"?: number;
  "Index Cond"?: string;
  "Hash Cond"?: string;
  "Join Type"?: string;
  "Sort Key"?: string[];
  "Sort Method"?: string;
  "Sort Space Used"?: number;
  "Sort Space Type"?: string;
  "Shared Hit Blocks"?: number;
  "Shared Read Blocks"?: number;
  "Shared Dirtied Blocks"?: number;
  "Shared Written Blocks"?: number;
  "Local Hit Blocks"?: number;
  "Local Read Blocks"?: number;
  "Temp Read Blocks"?: number;
  "Temp Written Blocks"?: number;
  "I/O Read Time"?: number;
  "I/O Write Time"?: number;
  "Plans"?: PlanNode[];
  [key: string]: unknown;
}

interface ExplainResult {
  "Plan": PlanNode;
  "Planning Time"?: number;
  "Execution Time"?: number;
  "Triggers"?: unknown[];
}

interface PlanData {
  plan: ExplainResult[] | ExplainResult | string;
  query: string;
  analyzed: boolean;
}

interface ContentItem {
  type: string;
  text?: string;
}

interface FlatNode {
  node: PlanNode;
  depth: number;
  id: string;
  actualTime: number;
  percentOfTotal: number;
  isSlow: boolean;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Plan Viewer", version: "1.0.0" });
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

function extractPlan(data: PlanData): ExplainResult | null {
  if (!data.plan) return null;

  // Handle string format (text output)
  if (typeof data.plan === "string") return null;

  // Handle array format (standard EXPLAIN JSON output)
  if (Array.isArray(data.plan) && data.plan.length > 0) {
    return data.plan[0] as ExplainResult;
  }

  // Handle direct object format
  if (typeof data.plan === "object" && "Plan" in data.plan) {
    return data.plan as ExplainResult;
  }

  return null;
}

function flattenPlan(
  node: PlanNode,
  depth: number,
  totalTime: number,
  parentId: string = ""
): FlatNode[] {
  const id = parentId ? `${parentId}-${depth}` : `node-${depth}`;
  const actualTime = (node["Actual Total Time"] ?? 0) * (node["Actual Loops"] ?? 1);
  const percentOfTotal = totalTime > 0 ? (actualTime / totalTime) * 100 : 0;
  const isSlow = percentOfTotal > 50;

  const result: FlatNode[] = [{
    node,
    depth,
    id,
    actualTime,
    percentOfTotal,
    isSlow,
  }];

  if (node.Plans) {
    node.Plans.forEach((child, index) => {
      result.push(...flattenPlan(child, depth + 1, totalTime, `${id}-${index}`));
    });
  }

  return result;
}

function formatTime(ms: number | undefined): string {
  if (ms === undefined) return "-";
  if (ms < 1) return `${(ms * 1000).toFixed(2)} us`;
  if (ms < 1000) return `${ms.toFixed(2)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function formatRows(rows: number | undefined): string {
  if (rows === undefined) return "-";
  if (rows >= 1000000) return `${(rows / 1000000).toFixed(1)}M`;
  if (rows >= 1000) return `${(rows / 1000).toFixed(1)}K`;
  return rows.toString();
}

function getNodeIcon(nodeType: string): string {
  const icons: Record<string, string> = {
    "Seq Scan": "T",
    "Index Scan": "I",
    "Index Only Scan": "IO",
    "Bitmap Index Scan": "BI",
    "Bitmap Heap Scan": "BH",
    "Hash Join": "HJ",
    "Merge Join": "MJ",
    "Nested Loop": "NL",
    "Hash": "H",
    "Sort": "S",
    "Aggregate": "A",
    "Group": "G",
    "Limit": "L",
    "Unique": "U",
    "Append": "AP",
    "Result": "R",
    "Materialize": "M",
    "CTE Scan": "CT",
    "Subquery Scan": "SQ",
    "Function Scan": "F",
    "Values Scan": "V",
    "Gather": "GA",
    "Gather Merge": "GM",
  };
  return icons[nodeType] || nodeType.substring(0, 2).toUpperCase();
}

function getNodeColorClass(nodeType: string): string {
  if (nodeType.includes("Scan")) return "scan";
  if (nodeType.includes("Join")) return "join";
  if (nodeType.includes("Sort") || nodeType.includes("Aggregate")) return "sort";
  if (nodeType.includes("Hash")) return "hash";
  return "default";
}

const nodeBadgeColors: Record<string, { bg: string; text: string; darkBg: string; darkText: string }> = {
  scan: { bg: "bg-blue-100", text: "text-blue-800", darkBg: "dark:bg-blue-900", darkText: "dark:text-blue-200" },
  join: { bg: "bg-purple-100", text: "text-purple-800", darkBg: "dark:bg-purple-900", darkText: "dark:text-purple-200" },
  sort: { bg: "bg-orange-100", text: "text-orange-800", darkBg: "dark:bg-orange-900", darkText: "dark:text-orange-200" },
  hash: { bg: "bg-green-100", text: "text-green-800", darkBg: "dark:bg-green-900", darkText: "dark:text-green-200" },
  default: { bg: "bg-gray-100", text: "text-gray-800", darkBg: "dark:bg-gray-800", darkText: "dark:text-gray-200" },
};

// ============================================================================
// Components
// ============================================================================

interface PlanNodeRowProps {
  flatNode: FlatNode;
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onSelect: () => void;
}

function PlanNodeRow({ flatNode, isExpanded, isSelected, onToggle, onSelect }: PlanNodeRowProps) {
  const { node, depth, percentOfTotal, isSlow } = flatNode;
  const hasChildren = node.Plans && node.Plans.length > 0;
  const nodeColor = getNodeColorClass(node["Node Type"]);
  const badgeStyle = nodeBadgeColors[nodeColor];

  return (
    <div
      className={cx(
        "flex items-center p-2 border-b border-border-subtle cursor-pointer transition-colors duration-100 hover:bg-bg-subtle",
        isSelected && "bg-blue-50 dark:bg-blue-950",
        isSlow && "border-l-[3px] border-l-red-500"
      )}
      onClick={onSelect}
    >
      {/* Indentation and expand toggle */}
      <div className="flex items-center" style={{ paddingLeft: `${depth * 20}px` }}>
        {hasChildren ? (
          <IconButton
            variant="outline"
            size="xs"
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className="w-[18px] h-[18px] mr-2 min-w-[18px]"
          >
            {isExpanded ? "-" : "+"}
          </IconButton>
        ) : (
          <div className="w-[18px] mr-2" />
        )}
      </div>

      {/* Node type badge */}
      <div
        className={cx(
          "w-7 h-5 flex items-center justify-center rounded-sm text-xs font-bold mr-2 shrink-0",
          badgeStyle.bg,
          badgeStyle.text,
          badgeStyle.darkBg,
          badgeStyle.darkText
        )}
      >
        {getNodeIcon(node["Node Type"])}
      </div>

      {/* Node info */}
      <div className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
        <span className="font-medium text-fg-default">{node["Node Type"]}</span>
        {node["Relation Name"] && (
          <span className="text-blue-600 dark:text-blue-400"> on {node["Relation Name"]}</span>
        )}
        {node["Index Name"] && (
          <span className="text-green-600 dark:text-green-400 text-xs"> using {node["Index Name"]}</span>
        )}
        {node["Alias"] && node["Alias"] !== node["Relation Name"] && (
          <span className="text-fg-muted text-xs"> ({node["Alias"]})</span>
        )}
      </div>

      {/* Stats */}
      <div className="flex gap-3 w-[200px] shrink-0">
        <div className="flex flex-col items-end gap-0">
          <div className="text-xs text-fg-muted">Time</div>
          <div
            className={cx(
              "font-mono text-xs",
              isSlow ? "text-red-600 dark:text-red-400 font-bold" : "text-fg-default"
            )}
          >
            {formatTime(node["Actual Total Time"])}
          </div>
        </div>
        <div className="flex flex-col items-end gap-0">
          <div className="text-xs text-fg-muted">Rows</div>
          <div className="font-mono text-xs text-fg-default">{formatRows(node["Actual Rows"])}</div>
        </div>
        <div className="flex flex-col items-end gap-0">
          <div className="text-xs text-fg-muted">Loops</div>
          <div className="font-mono text-xs text-fg-default">{node["Actual Loops"] ?? "-"}</div>
        </div>
      </div>

      {/* Cost bar */}
      <div className="flex w-[120px] items-center gap-2 shrink-0">
        <div
          className={cx("h-2 rounded-full transition-all duration-200", isSlow ? "bg-red-500" : "bg-blue-400")}
          style={{ width: `${Math.min(percentOfTotal, 100)}%` }}
        />
        <div className="text-xs font-mono text-fg-muted min-w-[45px] text-right">
          {percentOfTotal.toFixed(1)}%
        </div>
      </div>
    </div>
  );
}

interface NodeDetailsProps {
  node: PlanNode;
}

function NodeDetails({ node }: NodeDetailsProps) {
  const details: Array<{ label: string; value: string | number }> = [];

  // Planning estimates
  if (node["Plan Rows"] !== undefined) {
    details.push({ label: "Est. Rows", value: formatRows(node["Plan Rows"]) });
  }
  if (node["Plan Width"] !== undefined) {
    details.push({ label: "Est. Width", value: `${node["Plan Width"]} bytes` });
  }
  if (node["Startup Cost"] !== undefined) {
    details.push({ label: "Startup Cost", value: node["Startup Cost"].toFixed(2) });
  }
  if (node["Total Cost"] !== undefined) {
    details.push({ label: "Total Cost", value: node["Total Cost"].toFixed(2) });
  }

  // Filter info
  if (node["Filter"]) {
    details.push({ label: "Filter", value: node["Filter"] });
  }
  if (node["Rows Removed by Filter"] !== undefined) {
    details.push({ label: "Rows Removed", value: formatRows(node["Rows Removed by Filter"]) });
  }
  if (node["Index Cond"]) {
    details.push({ label: "Index Cond", value: node["Index Cond"] });
  }
  if (node["Hash Cond"]) {
    details.push({ label: "Hash Cond", value: node["Hash Cond"] });
  }

  // Sort info
  if (node["Sort Key"]) {
    details.push({ label: "Sort Key", value: node["Sort Key"].join(", ") });
  }
  if (node["Sort Method"]) {
    details.push({ label: "Sort Method", value: node["Sort Method"] });
  }
  if (node["Sort Space Used"] !== undefined) {
    details.push({ label: "Sort Space", value: `${node["Sort Space Used"]} KB (${node["Sort Space Type"]})` });
  }

  // Buffer stats
  const bufferStats: string[] = [];
  if (node["Shared Hit Blocks"]) bufferStats.push(`Hit: ${node["Shared Hit Blocks"]}`);
  if (node["Shared Read Blocks"]) bufferStats.push(`Read: ${node["Shared Read Blocks"]}`);
  if (node["Shared Dirtied Blocks"]) bufferStats.push(`Dirtied: ${node["Shared Dirtied Blocks"]}`);
  if (node["Shared Written Blocks"]) bufferStats.push(`Written: ${node["Shared Written Blocks"]}`);
  if (bufferStats.length > 0) {
    details.push({ label: "Shared Buffers", value: bufferStats.join(", ") });
  }

  // I/O timing
  if (node["I/O Read Time"] !== undefined || node["I/O Write Time"] !== undefined) {
    const ioTimes: string[] = [];
    if (node["I/O Read Time"]) ioTimes.push(`Read: ${formatTime(node["I/O Read Time"])}`);
    if (node["I/O Write Time"]) ioTimes.push(`Write: ${formatTime(node["I/O Write Time"])}`);
    if (ioTimes.length > 0) {
      details.push({ label: "I/O Time", value: ioTimes.join(", ") });
    }
  }

  if (details.length === 0) {
    return <div className="p-3 text-fg-muted italic">No additional details</div>;
  }

  return (
    <div className="p-3 bg-bg-subtle rounded-lg border border-border-default mb-4">
      <h4 className="text-sm font-semibold text-fg-default mb-2">
        Details: {node["Node Type"]}
      </h4>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
        {details.map(({ label, value }) => (
          <div key={label} className="flex flex-col gap-0">
            <div className="text-xs text-fg-muted">{label}</div>
            <div className="font-mono text-sm text-fg-default break-all">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function PlanViewer() {
  const [data, setData] = useState<PlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Connect to MCP host
  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
      console.log("[plan-viewer] Connected to MCP host");
    }).catch(() => {
      console.log("[plan-viewer] No MCP host (standalone mode)");
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
        const parsed = JSON.parse(textContent.text) as PlanData;
        setData(parsed);
        setSelectedNodeId(null);
        // Expand root by default
        setExpandedNodes(new Set(["node-0"]));
      } catch (e) {
        setError(`Failed to parse plan: ${e instanceof Error ? e.message : "Unknown error"}`);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // Extract and flatten plan
  const { flatNodes, planResult, totalTime } = useMemo(() => {
    if (!data) return { flatNodes: [], planResult: null, totalTime: 0 };

    const result = extractPlan(data);
    if (!result) return { flatNodes: [], planResult: null, totalTime: 0 };

    const execTime = result["Execution Time"] ?? result.Plan["Actual Total Time"] ?? 0;
    const nodes = flattenPlan(result.Plan, 0, execTime);

    return { flatNodes: nodes, planResult: result, totalTime: execTime };
  }, [data]);

  // Filter visible nodes based on expansion state
  const visibleNodes = useMemo(() => {
    const visible: FlatNode[] = [];
    const collapsedPrefixes: string[] = [];

    for (const flatNode of flatNodes) {
      // Check if this node is hidden by a collapsed parent
      const isHidden = collapsedPrefixes.some((prefix) => flatNode.id.startsWith(prefix + "-"));
      if (isHidden) continue;

      visible.push(flatNode);

      // If this node has children but is not expanded, mark its children as hidden
      const hasChildren = flatNode.node.Plans && flatNode.node.Plans.length > 0;
      if (hasChildren && !expandedNodes.has(flatNode.id)) {
        collapsedPrefixes.push(flatNode.id);
      }
    }

    return visible;
  }, [flatNodes, expandedNodes]);

  // Handlers
  const handleToggleExpand = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
    notifyModel(expandedNodes.has(nodeId) ? "collapseNode" : "expandNode", { nodeId });
  }, [expandedNodes]);

  const handleSelectNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId === selectedNodeId ? null : nodeId);
    notifyModel("selectNode", { nodeId });
  }, [selectedNodeId]);

  const handleExpandAll = useCallback(() => {
    const allIds = flatNodes.map((n) => n.id);
    setExpandedNodes(new Set(allIds));
  }, [flatNodes]);

  const handleCollapseAll = useCallback(() => {
    setExpandedNodes(new Set(["node-0"]));
  }, []);

  // Get selected node for details panel
  const selectedNode = selectedNodeId
    ? flatNodes.find((n) => n.id === selectedNodeId)?.node
    : null;

  // Render states
  if (loading) {
    return (
      <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-[300px]">
        <div className="p-10 text-center text-fg-muted">Loading query plan...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-[300px]">
        <div className="p-4 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 rounded-md">{error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-[300px]">
        <div className="p-10 text-center text-fg-muted">No plan data</div>
      </div>
    );
  }

  // Handle text format (non-JSON)
  if (typeof data.plan === "string") {
    return (
      <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-[300px]">
        <div className="flex justify-between items-center mb-3">
          <div className="font-bold text-lg text-fg-default">Query Plan (Text)</div>
        </div>
        <pre className="font-mono text-xs p-3 bg-bg-subtle rounded-md border border-border-default overflow-auto whitespace-pre">
          {data.plan}
        </pre>
      </div>
    );
  }

  if (!planResult) {
    return (
      <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-[300px]">
        <div className="p-10 text-center text-fg-muted">Invalid plan format</div>
      </div>
    );
  }

  return (
    <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-[300px]">
      {/* Header */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          <div className="font-bold text-lg text-fg-default">Query Execution Plan</div>
          {data.analyzed && (
            <Badge variant="solid" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">ANALYZED</Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="xs" onClick={handleExpandAll}>Expand All</Button>
          <Button variant="outline" size="xs" onClick={handleCollapseAll}>Collapse All</Button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="flex gap-4 mb-4 p-3 bg-bg-subtle rounded-lg border border-border-default">
        {planResult["Planning Time"] !== undefined && (
          <div className="flex flex-col gap-0.5">
            <div className="text-xs text-fg-muted uppercase">Planning Time</div>
            <div className="text-lg font-semibold text-fg-default">{formatTime(planResult["Planning Time"])}</div>
          </div>
        )}
        {planResult["Execution Time"] !== undefined && (
          <div className="flex flex-col gap-0.5">
            <div className="text-xs text-fg-muted uppercase">Execution Time</div>
            <div className="text-lg font-semibold text-fg-default">{formatTime(planResult["Execution Time"])}</div>
          </div>
        )}
        <div className="flex flex-col gap-0.5">
          <div className="text-xs text-fg-muted uppercase">Total Nodes</div>
          <div className="text-lg font-semibold text-fg-default">{flatNodes.length}</div>
        </div>
      </div>

      {/* Plan tree */}
      <div className="border border-border-default rounded-lg overflow-hidden mb-4">
        <div className="flex items-center p-2 bg-bg-subtle border-b border-border-default">
          <div className="flex-1 text-xs font-semibold text-fg-muted uppercase">Operation</div>
          <div className="w-[200px] text-xs font-semibold text-fg-muted uppercase">Stats</div>
          <div className="w-[120px] text-xs font-semibold text-fg-muted uppercase">Cost %</div>
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {visibleNodes.map((flatNode) => (
            <PlanNodeRow
              key={flatNode.id}
              flatNode={flatNode}
              isExpanded={expandedNodes.has(flatNode.id)}
              isSelected={selectedNodeId === flatNode.id}
              onToggle={() => handleToggleExpand(flatNode.id)}
              onSelect={() => handleSelectNode(flatNode.id)}
            />
          ))}
        </div>
      </div>

      {/* Selected node details */}
      {selectedNode && <NodeDetails node={selectedNode} />}

      {/* Query display */}
      <div className="mt-4">
        <h4 className="text-sm font-semibold text-fg-muted mb-2">Query</h4>
        <pre className="font-mono text-xs p-3 bg-bg-subtle rounded-md border border-border-default overflow-auto whitespace-pre-wrap break-all">
          {data.query}
        </pre>
      </div>
    </div>
  );
}

// ============================================================================
// Mount
// ============================================================================

render(<PlanViewer />, document.getElementById("app")!);
