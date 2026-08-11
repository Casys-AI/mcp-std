/**
 * Metrics Panel UI - Grafana-style dashboard
 *
 * Grid of metrics with:
 * - Multiple visualization types (gauge, sparkline, stat, bar)
 * - Thresholds with color coding
 * - Time range display
 * - Auto-refresh indicator
 * - Responsive grid layout
 *
 * Stack: Preact + Tailwind CSS
 *
 * @module lib/std/src/ui/metrics-panel
 */

import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import {
  Badge as McpViewBadge,
  Card,
  StateMessage,
} from "@casys/mcp-view/preact/components";
import { Tooltip } from "../../components/ui/tooltip";
import { cx, formatNumber } from "../../components/utils";
import {
  interactive,
  MetricsSkeleton,
  typography,
  valueTransition,
} from "../../shared";
import { type McpViewViewer, startMcpViewViewer } from "../../shared/mcp-view";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface MetricData {
  id: string;
  label: string;
  value: number;
  unit?: string;
  history?: number[];
  min?: number;
  max?: number;
  thresholds?: {
    warning?: number;
    critical?: number;
  };
  type?: "gauge" | "sparkline" | "stat" | "bar";
  description?: string;
}

interface PanelData {
  title?: string;
  metrics: MetricData[];
  columns?: number;
  refreshInterval?: number;
  timestamp?: string;
}

// ============================================================================
// Helpers
// ============================================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePanelData(value: unknown): PanelData | null {
  if (Array.isArray(value)) return { metrics: value as MetricData[] };
  if (!isRecord(value)) return null;
  if (Array.isArray(value.metrics)) return value as unknown as PanelData;

  const entries = Object.entries(value).filter(
    ([, item]) => typeof item === "number" || typeof item === "string",
  );
  if (entries.length === 0) return null;
  return {
    metrics: entries.map(([key, item]) => ({
      id: key,
      label: key.replace(/([A-Z])/g, " $1").replace(/[_-]/g, " ").trim(),
      value: typeof item === "number" ? item : 0,
      type: "stat",
    })),
  };
}

function getColor(
  value: number,
  thresholds?: { warning?: number; critical?: number },
): string {
  if (!thresholds) return "#3b82f6";
  if (thresholds.critical !== undefined && value >= thresholds.critical) {
    return "#ef4444";
  }
  if (thresholds.warning !== undefined && value >= thresholds.warning) {
    return "#eab308";
  }
  return "#22c55e";
}

// ============================================================================
// Metric Components
// ============================================================================

function GaugeMetric({ metric }: { metric: MetricData }) {
  const { value, min = 0, max = 100, thresholds, label, unit, description } =
    metric;
  const percentage = Math.min(
    100,
    Math.max(0, ((value - min) / (max - min)) * 100),
  );
  const color = getColor(value, thresholds);

  const radius = 40;
  const circumference = 2 * Math.PI * radius * (270 / 360);
  const offset = circumference - (circumference * percentage) / 100;

  const gauge = (
    <div className="flex flex-col gap-0 items-center relative">
      <svg viewBox="0 0 100 100" className="w-20 h-20">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="var(--border-default, #e5e7eb)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          transform="rotate(135 50 50)"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          transform="rotate(135 50 50)"
          className={valueTransition}
        />
      </svg>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[40%] text-center">
        <div className={cx(typography.value, valueTransition)}>
          {formatNumber(value, unit)}
        </div>
      </div>
      <div className={typography.label}>{label}</div>
    </div>
  );

  return description ? <Tooltip content={description}>{gauge}</Tooltip> : gauge;
}

function SparklineMetric({ metric }: { metric: MetricData }) {
  const {
    value,
    history = [],
    thresholds,
    label,
    unit,
    min,
    max,
    description,
  } = metric;
  const color = getColor(value, thresholds);

  const values = history.length ? history : [value];
  const dataMin = min ?? Math.min(...values);
  const dataMax = max ?? Math.max(...values);
  const range = dataMax - dataMin || 1;

  const width = 120;
  const height = 40;
  const padding = 2;

  const points = values.map((v, i) => ({
    x: padding + (i / (values.length - 1 || 1)) * (width - padding * 2),
    y: padding + (height - padding * 2) -
      ((v - dataMin) / range) * (height - padding * 2),
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${
    height - padding
  } L ${padding} ${height - padding} Z`;

  const sparkline = (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-baseline">
        <div className={typography.label}>{label}</div>
        <div
          className={cx(typography.value, valueTransition)}
          style={{ color }}
        >
          {formatNumber(value, unit)}
        </div>
      </div>
      <svg width={width} height={height} className="block w-full">
        <path
          d={areaPath}
          fill={color}
          opacity={0.15}
          className={valueTransition}
        />
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          className={valueTransition}
        />
        <circle
          cx={points[points.length - 1].x}
          cy={points[points.length - 1].y}
          r={3}
          fill={color}
          className={valueTransition}
        />
      </svg>
    </div>
  );

  return description
    ? <Tooltip content={description}>{sparkline}</Tooltip>
    : sparkline;
}

function StatMetric({ metric }: { metric: MetricData }) {
  const { value, thresholds, label, unit, description } = metric;
  const color = getColor(value, thresholds);

  const stat = (
    <div className="flex flex-col gap-0 text-center">
      <div className={typography.label}>{label}</div>
      <div
        className={cx(typography.value, valueTransition, "text-2xl my-1")}
        style={{ color }}
      >
        {formatNumber(value, unit)}
      </div>
    </div>
  );

  return description ? <Tooltip content={description}>{stat}</Tooltip> : stat;
}

function BarMetric({ metric }: { metric: MetricData }) {
  const { value, min = 0, max = 100, thresholds, label, unit, description } =
    metric;
  const percentage = Math.min(
    100,
    Math.max(0, ((value - min) / (max - min)) * 100),
  );
  const color = getColor(value, thresholds);

  const bar = (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-baseline">
        <div className={typography.label}>{label}</div>
        <div className={cx(typography.valueSmall, valueTransition)}>
          {formatNumber(value, unit)}
        </div>
      </div>
      <div className="relative h-2 bg-bg-muted rounded-full overflow-hidden">
        <div
          className={cx("h-full rounded-full", valueTransition)}
          style={{ width: `${percentage}%`, backgroundColor: color }}
        />
        {thresholds?.warning && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-yellow-500"
            style={{
              left: `${((thresholds.warning - min) / (max - min)) * 100}%`,
            }}
          />
        )}
        {thresholds?.critical && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500"
            style={{
              left: `${((thresholds.critical - min) / (max - min)) * 100}%`,
            }}
          />
        )}
      </div>
    </div>
  );

  return description ? <Tooltip content={description}>{bar}</Tooltip> : bar;
}

function MetricCard(
  { metric, onSelect }: {
    metric: MetricData;
    onSelect: (metric: MetricData) => void;
  },
) {
  const type = metric.type || (metric.history?.length ? "sparkline" : "stat");

  return (
    <div
      className={cx(
        "p-3 bg-bg-subtle rounded-lg border border-border-default cursor-pointer",
        interactive.cardHover,
        interactive.focusRing,
      )}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(metric)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(metric);
        }
      }}
    >
      {type === "gauge" && <GaugeMetric metric={metric} />}
      {type === "sparkline" && <SparklineMetric metric={metric} />}
      {type === "stat" && <StatMetric metric={metric} />}
      {type === "bar" && <BarMetric metric={metric} />}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function MetricsPanel() {
  const [data, setData] = useState<PanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const viewer = useRef<McpViewViewer | null>(null);

  useEffect(() => {
    viewer.current = startMcpViewViewer({
      name: "Metrics Panel",
      version: "1.0.0",
      onToolResult(result) {
        setLoading(false);
        setData(normalizePanelData(result));
      },
      onTeardown() {
        render(null, appRoot);
      },
    });

    return () => {
      const activeViewer = viewer.current;
      viewer.current = null;
      void activeViewer?.dispose();
    };
  }, []);

  if (loading) {
    return <MetricsSkeleton count={4} />;
  }

  if (!data?.metrics?.length) {
    return (
      <StateMessage title="No metrics">
        The tool returned no displayable metrics.
      </StateMessage>
    );
  }

  const columns = data.columns || Math.min(4, Math.max(2, data.metrics.length));

  return (
    <Card
      title={data.title}
      actions={data.refreshInterval || data.timestamp
        ? (
          <>
            {data.refreshInterval && (
              <McpViewBadge tone="neutral">
                ↻ {data.refreshInterval}s
              </McpViewBadge>
            )}
            {data.timestamp && (
              <McpViewBadge tone="neutral">{data.timestamp}</McpViewBadge>
            )}
          </>
        )
        : undefined}
    >
      {/* Metrics Grid */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
      >
        {data.metrics.map((metric) => (
          <MetricCard
            key={metric.id}
            metric={metric}
            onSelect={(selectedMetric) => {
              viewer.current?.updateModelContext("selectMetric", {
                id: selectedMetric.id,
                metric: selectedMetric,
              });
            }}
          />
        ))}
      </div>
    </Card>
  );
}

// ============================================================================
// Mount
// ============================================================================

const appRoot = document.getElementById("app")!;
render(<MetricsPanel />, appRoot);
