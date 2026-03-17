/**
 * Resource Monitor UI - Dashboard for CPU, Memory, Network monitoring
 *
 * Displays resource usage with:
 * - Circular gauges for CPU and Memory
 * - Progress bars with color thresholds (green < 70%, orange < 90%, red >= 90%)
 * - Network I/O formatted (KB/s, MB/s)
 * - Sparklines for history when available
 * - Refresh indicator
 * - Support for multiple resources (list)
 *
 * @module lib/std/src/ui/resource-monitor
 */

import { render } from "preact";
import { useState, useEffect } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { cx } from "../../components/utils";
import { Badge } from "../../components/ui/badge";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface ResourceData {
  name: string;
  cpu: {
    percent: number;
    cores?: number;
  };
  memory: {
    used: number;
    limit: number;
    percent: number;
  };
  network?: {
    rxBytes: number;
    txBytes: number;
    rxRate?: number;
    txRate?: number;
  };
  blockIO?: {
    read: number;
    write: number;
  };
  timestamp?: number;
}

interface MonitorData {
  title?: string;
  resources: ResourceData[];
  refreshInterval?: number;
  timestamp?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Resource Monitor", version: "1.0.0" });
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

function getThresholdColor(percent: number): string {
  if (percent >= 90) return "var(--colors-red-500)";
  if (percent >= 70) return "var(--colors-yellow-500)";
  return "var(--colors-green-500)";
}

function formatBytes(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + " " + sizes[i];
}

function formatRate(bytesPerSec: number): string {
  return formatBytes(bytesPerSec) + "/s";
}

function formatPercent(percent: number): string {
  return percent.toFixed(1) + "%";
}

// ============================================================================
// Gauge Component
// ============================================================================

function CircularGauge({ percent, label, size = 80 }: { percent: number; label: string; size?: number }) {
  const color = getThresholdColor(percent);
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius * (270 / 360);
  const offset = circumference - (circumference * Math.min(100, percent)) / 100;

  return (
    <div className="flex flex-col items-center gap-1 relative">
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, display: "block" }}>
        {/* Background arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--colors-border-default)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          transform={`rotate(135 ${size / 2} ${size / 2})`}
        />
        {/* Value arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          transform={`rotate(135 ${size / 2} ${size / 2})`}
          className="transition-all duration-500 ease-out"
        />
      </svg>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
        <div className="text-lg font-bold font-mono" style={{ color }}>
          {formatPercent(percent)}
        </div>
      </div>
      <div className="text-xs text-fg-muted font-medium uppercase tracking-wide mt-1">
        {label}
      </div>
    </div>
  );
}

// ============================================================================
// Progress Bar Component
// ============================================================================

function ProgressBar({ percent, label, sublabel }: { percent: number; label: string; sublabel?: string }) {
  const color = getThresholdColor(percent);
  const clampedPercent = Math.min(100, Math.max(0, percent));

  return (
    <div className="w-full min-w-[120px]">
      <div className="flex justify-between items-baseline mb-1">
        <div className="text-xs text-fg-muted font-medium uppercase tracking-wide">
          {label}
        </div>
        <div className="text-sm font-bold font-mono" style={{ color }}>
          {formatPercent(percent)}
        </div>
      </div>
      <div className="relative h-2 bg-bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${clampedPercent}%`, backgroundColor: color }}
        />
        {/* Threshold markers */}
        <div className="absolute top-0 bottom-0 left-[70%] w-px bg-yellow-500 opacity-50" />
        <div className="absolute top-0 bottom-0 left-[90%] w-px bg-red-500 opacity-50" />
      </div>
      {sublabel && (
        <div className="text-xs text-fg-muted mt-1 text-center">{sublabel}</div>
      )}
    </div>
  );
}

// ============================================================================
// Network I/O Component
// ============================================================================

function NetworkIO({ network }: { network: NonNullable<ResourceData["network"]> }) {
  return (
    <div className="p-2 bg-bg-muted rounded-md min-w-[100px]">
      <div className="text-xs text-fg-muted font-medium uppercase tracking-wide mb-1">
        Network
      </div>
      <div className="flex items-center gap-2">
        <div className="text-sm text-fg-muted font-bold">{"\u2193"}</div>
        <div className="text-xs text-fg-muted w-7">RX</div>
        <div className="text-sm font-semibold font-mono text-fg-default">
          {network.rxRate !== undefined ? formatRate(network.rxRate) : formatBytes(network.rxBytes)}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="text-sm text-fg-muted font-bold">{"\u2191"}</div>
        <div className="text-xs text-fg-muted w-7">TX</div>
        <div className="text-sm font-semibold font-mono text-fg-default">
          {network.txRate !== undefined ? formatRate(network.txRate) : formatBytes(network.txBytes)}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Block I/O Component
// ============================================================================

function BlockIO({ blockIO }: { blockIO: NonNullable<ResourceData["blockIO"]> }) {
  return (
    <div className="p-2 bg-bg-muted rounded-md min-w-[100px]">
      <div className="text-xs text-fg-muted font-medium uppercase tracking-wide mb-1">
        Block I/O
      </div>
      <div className="flex items-center gap-2">
        <div className="text-xs text-fg-muted w-7">Read</div>
        <div className="text-sm font-semibold font-mono text-fg-default">
          {formatBytes(blockIO.read)}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="text-xs text-fg-muted w-7">Write</div>
        <div className="text-sm font-semibold font-mono text-fg-default">
          {formatBytes(blockIO.write)}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Sparkline Component
// ============================================================================

function Sparkline({ data, color, height = 30 }: { data: number[]; color: string; height?: number }) {
  if (!data.length) return null;

  const width = 100;
  const padding = 2;
  const dataMin = Math.min(...data);
  const dataMax = Math.max(...data);
  const range = dataMax - dataMin || 1;

  const points = data.map((v, i) => ({
    x: padding + (i / (data.length - 1 || 1)) * (width - padding * 2),
    y: padding + (height - padding * 2) - ((v - dataMin) / range) * (height - padding * 2),
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${padding} ${height - padding} Z`;

  return (
    <svg width={width} height={height} style={{ display: "block", width: "100%" }}>
      <path d={areaPath} fill={color} opacity={0.15} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={2} fill={color} />
    </svg>
  );
}

// ============================================================================
// Resource Card Component
// ============================================================================

function ResourceCard({ resource, history }: { resource: ResourceData; history?: { cpu: number[]; memory: number[] } }) {
  const memoryUsed = formatBytes(resource.memory.used);
  const memoryLimit = formatBytes(resource.memory.limit);
  const memorySublabel = `${memoryUsed} / ${memoryLimit}`;

  return (
    <div
      className="p-3 bg-bg-subtle border border-border-default rounded-lg cursor-pointer transition-all duration-150 hover:border-border-emphasized hover:shadow-sm"
      onClick={() => notifyModel("selectResource", { name: resource.name, resource })}
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-3 pb-2 border-b border-border-subtle">
        <div className="text-base font-semibold font-mono">{resource.name}</div>
        {resource.cpu.cores && (
          <Badge size="sm" variant="outline">{resource.cpu.cores} cores</Badge>
        )}
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-4">
        {/* CPU Section */}
        <div className="flex flex-col items-center gap-2">
          <CircularGauge percent={resource.cpu.percent} label="CPU" />
          {history?.cpu && history.cpu.length > 1 && (
            <Sparkline data={history.cpu} color={getThresholdColor(resource.cpu.percent)} />
          )}
        </div>

        {/* Memory Section */}
        <div className="flex flex-col items-center gap-2">
          <ProgressBar
            percent={resource.memory.percent}
            label="Memory"
            sublabel={memorySublabel}
          />
          {history?.memory && history.memory.length > 1 && (
            <Sparkline data={history.memory} color={getThresholdColor(resource.memory.percent)} />
          )}
        </div>

        {/* Network Section */}
        {resource.network && (
          <div className="flex flex-col items-center gap-2">
            <NetworkIO network={resource.network} />
          </div>
        )}

        {/* Block I/O Section */}
        {resource.blockIO && (
          <div className="flex flex-col items-center gap-2">
            <BlockIO blockIO={resource.blockIO} />
          </div>
        )}
      </div>

      {/* Timestamp */}
      {resource.timestamp && (
        <div className="mt-2 pt-2 border-t border-border-subtle text-xs text-fg-muted text-right">
          {new Date(resource.timestamp).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function ResourceMonitor() {
  const [data, setData] = useState<MonitorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyMap, setHistoryMap] = useState<Map<string, { cpu: number[]; memory: number[] }>>(new Map());

  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
    }).catch(() => {});

    app.ontoolresult = (result: { content?: Array<{ type: string; text?: string }> }) => {
      setLoading(false);
      try {
        const textContent = result.content?.find((c) => c.type === "text");
        if (textContent?.text) {
          const parsed = JSON.parse(textContent.text);

          // Handle different input formats
          let monitorData: MonitorData;
          if (Array.isArray(parsed)) {
            monitorData = { resources: parsed };
          } else if (parsed.resources) {
            monitorData = parsed;
          } else if (parsed.name && parsed.cpu && parsed.memory) {
            // Single resource object
            monitorData = { resources: [parsed] };
          } else {
            console.error("Invalid resource data format");
            return;
          }

          setData(monitorData);

          // Update history for sparklines
          setHistoryMap((prev) => {
            const next = new Map(prev);
            for (const resource of monitorData.resources) {
              const existing = next.get(resource.name) || { cpu: [], memory: [] };
              const maxHistory = 20;
              next.set(resource.name, {
                cpu: [...existing.cpu.slice(-maxHistory + 1), resource.cpu.percent],
                memory: [...existing.memory.slice(-maxHistory + 1), resource.memory.percent],
              });
            }
            return next;
          });
        }
      } catch (e) {
        console.error("Failed to parse resource data", e);
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="font-sans text-sm text-fg-default bg-bg-canvas p-3 min-w-[320px]">
        <div className="p-6 text-center text-fg-muted">Loading resources...</div>
      </div>
    );
  }

  if (!data?.resources?.length) {
    return (
      <div className="font-sans text-sm text-fg-default bg-bg-canvas p-3 min-w-[320px]">
        <div className="p-6 text-center text-fg-muted">No resources to monitor</div>
      </div>
    );
  }

  return (
    <div className="font-sans text-sm text-fg-default bg-bg-canvas p-3 min-w-[320px]">
      {/* Header */}
      {(data.title || data.refreshInterval || data.timestamp) && (
        <div className="flex justify-between items-center mb-3 pb-2 border-b border-border-subtle">
          {data.title && <h2 className="text-lg font-semibold m-0">{data.title}</h2>}
          <div className="flex items-center gap-3">
            {data.refreshInterval && (
              <Badge size="sm" variant="outline">
                {"\u21BB"} {data.refreshInterval}s
              </Badge>
            )}
            {data.timestamp && (
              <div className="text-xs text-fg-muted">{data.timestamp}</div>
            )}
          </div>
        </div>
      )}

      {/* Resources List */}
      <div className="flex flex-col gap-3">
        {data.resources.map((resource) => (
          <ResourceCard
            key={resource.name}
            resource={resource}
            history={historyMap.get(resource.name)}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Mount
// ============================================================================

render(<ResourceMonitor />, document.getElementById("app")!);
