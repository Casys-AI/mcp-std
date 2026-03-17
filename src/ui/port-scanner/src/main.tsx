/**
 * Port Scanner UI for MCP Apps
 *
 * Displays port scan results with visual status indicators.
 * Features:
 * - Color-coded port status (open/closed/filtered)
 * - Summary statistics
 * - Filter by status
 * - Service name display
 *
 * @module lib/std/src/ui/port-scanner
 */

import { render } from "preact";
import { useState, useEffect, useMemo, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { cx } from "../../components/utils";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import * as Table from "../../components/ui/table";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface PortResult {
  port: number;
  status: "open" | "closed" | "filtered" | "timeout";
  service?: string;
  banner?: string;
}

interface ScanResult {
  host: string;
  ports: PortResult[];
  scanTime?: number;
  timestamp?: string;
}

interface ContentItem {
  type: string;
  text?: string;
}

type FilterStatus = "all" | "open" | "closed" | "filtered";

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Port Scanner", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Status Badge Component
// ============================================================================

function PortStatusBadge({ status }: { status: PortResult["status"] }) {
  const colorMap: Record<string, "green" | "red" | "orange" | "gray"> = {
    open: "green",
    closed: "red",
    filtered: "orange",
    timeout: "gray",
  };

  return (
    <Badge variant="subtle" colorPalette={colorMap[status] || "gray"} size="sm">
      {status.toUpperCase()}
    </Badge>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function PortScanner() {
  const [data, setData] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>("all");

  // Connect to MCP host
  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
      console.log("[port-scanner] Connected to MCP host");
    }).catch(() => {
      console.log("[port-scanner] No MCP host (standalone mode)");
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
        const normalized = normalizeData(parsed);
        setData(normalized);
        setFilter("all");
      } catch (e) {
        setError(`Failed to parse scan results: ${e instanceof Error ? e.message : "Unknown error"}`);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // Filter ports
  const filteredPorts = useMemo(() => {
    if (!data?.ports) return [];
    if (filter === "all") return data.ports;
    return data.ports.filter((p) => p.status === filter);
  }, [data?.ports, filter]);

  // Statistics
  const stats = useMemo(() => {
    if (!data?.ports) return { total: 0, open: 0, closed: 0, filtered: 0 };
    return {
      total: data.ports.length,
      open: data.ports.filter((p) => p.status === "open").length,
      closed: data.ports.filter((p) => p.status === "closed").length,
      filtered: data.ports.filter((p) => p.status === "filtered" || p.status === "timeout").length,
    };
  }, [data?.ports]);

  // Handlers
  const handlePortClick = useCallback((port: PortResult) => {
    notifyModel("select", { port: port.port, status: port.status, service: port.service });
  }, []);

  // Render states
  if (loading) {
    return (
      <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-[200px]">
        <div className="flex items-center justify-center p-10 text-fg-muted">Scanning ports...</div>
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

  if (!data || data.ports.length === 0) {
    return (
      <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-[200px]">
        <div className="flex items-center justify-center p-10 text-fg-muted">No scan results</div>
      </div>
    );
  }

  return (
    <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-[200px]">
      {/* Header */}
      <div className="mb-4">
        <div className="text-lg font-semibold mb-1">{data.host}</div>
        {data.timestamp && (
          <div className="text-xs text-fg-muted">
            Scanned: {new Date(data.timestamp).toLocaleString()}
            {data.scanTime && ` (${data.scanTime}ms)`}
          </div>
        )}
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard label="Total" value={stats.total} color="blue" />
        <StatCard label="Open" value={stats.open} color="green" />
        <StatCard label="Closed" value={stats.closed} color="red" />
        <StatCard label="Filtered" value={stats.filtered} color="orange" />
      </div>

      {/* Filter buttons */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {(["all", "open", "closed", "filtered"] as FilterStatus[]).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "solid" : "outline"}
            size="xs"
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f !== "all" && ` (${stats[f as keyof typeof stats]})`}
          </Button>
        ))}
      </div>

      {/* Results table */}
      <div className="overflow-x-auto rounded-lg">
        <Table.Root size="sm" variant="outline">
          <Table.Head>
            <Table.Row>
              <Table.Header className="w-20">Port</Table.Header>
              <Table.Header className="w-[100px]">Status</Table.Header>
              <Table.Header>Service</Table.Header>
              <Table.Header>Banner</Table.Header>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            {filteredPorts.map((port) => (
              <Table.Row
                key={port.port}
                onClick={() => handlePortClick(port)}
                className="cursor-pointer hover:bg-bg-subtle"
              >
                <Table.Cell className="font-mono font-medium">
                  {port.port}
                </Table.Cell>
                <Table.Cell>
                  <PortStatusBadge status={port.status} />
                </Table.Cell>
                <Table.Cell className={port.service ? "text-fg-default" : "text-fg-muted"}>
                  {port.service || "-"}
                </Table.Cell>
                <Table.Cell
                  className="text-fg-muted text-xs max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap"
                  title={port.banner}
                >
                  {port.banner || "-"}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </div>

      {/* Summary for open ports */}
      {stats.open > 0 && filter === "all" && (
        <div className="mt-3 p-3 bg-bg-subtle rounded-md">
          <div className="text-xs text-fg-muted mb-1">Open ports:</div>
          <div className="flex gap-2 flex-wrap">
            {data.ports
              .filter((p) => p.status === "open")
              .map((p) => (
                <Badge key={p.port} variant="outline" size="sm">
                  {p.port}{p.service ? ` (${p.service})` : ""}
                </Badge>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Stat Card Component
// ============================================================================

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const bgColorMap: Record<string, string> = {
    blue: "bg-blue-50 dark:bg-blue-950",
    green: "bg-green-50 dark:bg-green-950",
    red: "bg-red-50 dark:bg-red-950",
    orange: "bg-orange-50 dark:bg-orange-950",
  };

  const textColorMap: Record<string, string> = {
    blue: "text-blue-700 dark:text-blue-300",
    green: "text-green-700 dark:text-green-300",
    red: "text-red-700 dark:text-red-300",
    orange: "text-orange-700 dark:text-orange-300",
  };

  return (
    <div className={cx("p-3 rounded-md text-center", bgColorMap[color] || "bg-gray-50 dark:bg-gray-900")}>
      <div className={cx("text-2xl font-bold", textColorMap[color] || "text-gray-700 dark:text-gray-300")}>{value}</div>
      <div className="text-xs text-fg-muted">{label}</div>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function normalizeData(parsed: unknown): ScanResult | null {
  // Handle direct ScanResult format
  if (parsed && typeof parsed === "object" && "host" in parsed && "ports" in parsed) {
    return parsed as ScanResult;
  }

  // Handle array of port results
  if (Array.isArray(parsed)) {
    // Array of {port, status, ...}
    if (parsed.length > 0 && typeof parsed[0] === "object" && "port" in parsed[0]) {
      return {
        host: "Unknown",
        ports: parsed as PortResult[],
        timestamp: new Date().toISOString(),
      };
    }

    // Simple array of port numbers (assume all open)
    if (parsed.length > 0 && typeof parsed[0] === "number") {
      return {
        host: "Unknown",
        ports: parsed.map((p) => ({ port: p as number, status: "open" as const })),
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Handle object with results array
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;

    // Look for common patterns
    if ("results" in obj && Array.isArray(obj.results)) {
      return normalizeData(obj.results);
    }
    if ("openPorts" in obj && Array.isArray(obj.openPorts)) {
      return {
        host: (obj.host as string) || "Unknown",
        ports: (obj.openPorts as number[]).map((p) => ({ port: p, status: "open" as const })),
        timestamp: new Date().toISOString(),
      };
    }
  }

  return null;
}

// ============================================================================
// Well-known ports service names
// ============================================================================

const WELL_KNOWN_PORTS: Record<number, string> = {
  21: "FTP",
  22: "SSH",
  23: "Telnet",
  25: "SMTP",
  53: "DNS",
  80: "HTTP",
  110: "POP3",
  143: "IMAP",
  443: "HTTPS",
  465: "SMTPS",
  587: "Submission",
  993: "IMAPS",
  995: "POP3S",
  1433: "MSSQL",
  1521: "Oracle",
  3000: "Dev Server",
  3306: "MySQL",
  3389: "RDP",
  5432: "PostgreSQL",
  5672: "AMQP",
  6379: "Redis",
  8080: "HTTP Alt",
  8443: "HTTPS Alt",
  9200: "Elasticsearch",
  27017: "MongoDB",
};

// ============================================================================
// Mount
// ============================================================================

render(<PortScanner />, document.getElementById("app")!);
