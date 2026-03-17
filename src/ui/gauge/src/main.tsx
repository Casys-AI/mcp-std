/**
 * Gauge UI - Metric display with thresholds
 *
 * Circular or linear gauge showing a value with:
 * - Min/max range
 * - Color thresholds (green/yellow/red)
 * - Optional label and unit
 * - Smooth animations and loading states
 *
 * Stack: Preact + Tailwind CSS
 *
 * @module lib/std/src/ui/gauge
 */

import { render } from "preact";
import { useState, useEffect, useMemo } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { Tooltip } from "../../components/ui/tooltip";
import { cx } from "../../components/utils";
import {
  GaugeSkeleton,
  StatusBadge,
  typography,
  valueTransition,
  containers,
  interactive,
} from "../../shared";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface GaugeData {
  value: number;
  min?: number;
  max?: number;
  label?: string;
  unit?: string;
  thresholds?: {
    warning?: number;
    critical?: number;
  };
  format?: "circular" | "linear" | "compact";
}

type ThresholdStatus = "normal" | "warning" | "critical";

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Gauge", version: "1.0.0" });

// ============================================================================
// Styles
// ============================================================================

const colorMap: Record<ThresholdStatus, string> = {
  normal: "#22c55e",
  warning: "#eab308",
  critical: "#ef4444",
};

const statusMap: Record<ThresholdStatus, "success" | "warning" | "error"> = {
  normal: "success",
  warning: "warning",
  critical: "error",
};

// ============================================================================
// Components
// ============================================================================

interface GaugeProps {
  value: number;
  min: number;
  max: number;
  status: ThresholdStatus;
  label?: string;
  unit?: string;
  displayValue: string;
}

function CircularGauge({ value, min, max, status, label, unit, displayValue }: GaugeProps) {
  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const radius = 45;
  const circumference = 2 * Math.PI * radius * (270 / 360);
  const offset = circumference - (circumference * percentage) / 100;
  const color = colorMap[status];

  return (
    <Tooltip content={`${displayValue}${unit ? ` ${unit}` : ""} (${percentage.toFixed(0)}%)`}>
      <div className="flex flex-col gap-0 items-center relative w-[120px]">
        <svg
          viewBox="0 0 120 120"
          className={cx("w-full h-auto", interactive.scaleOnHover)}
        >
          {/* Background arc */}
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="var(--border-default, #e5e7eb)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            transform="rotate(135 60 60)"
          />
          {/* Value arc with animation */}
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={offset}
            transform="rotate(135 60 60)"
            className={valueTransition}
          />
        </svg>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
          <div className="flex flex-col gap-0 items-center">
            <div className={cx(typography.value, valueTransition)}>{displayValue}</div>
            {unit && <div className={typography.muted}>{unit}</div>}
          </div>
        </div>
        {label && (
          <div className={cx(typography.muted, "mt-1 text-center")}>
            {label}
          </div>
        )}
      </div>
    </Tooltip>
  );
}

function LinearGauge({ value, min, max, status, label, unit, displayValue }: GaugeProps) {
  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const color = colorMap[status];

  return (
    <div className="w-[200px]">
      <div className="flex justify-between items-baseline mb-1">
        {label && <div className={typography.label}>{label}</div>}
        <Tooltip content={`${percentage.toFixed(1)}% of max`}>
          <div className={cx("flex gap-0.5 items-center", interactive.scaleOnHover)}>
            <div className={cx(typography.valueSmall, valueTransition)}>{displayValue}</div>
            {unit && <div className={typography.muted}>{unit}</div>}
          </div>
        </Tooltip>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-bg-subtle rounded-full overflow-hidden">
        <div
          className={cx("h-full rounded-full", valueTransition)}
          style={{ width: `${percentage}%`, backgroundColor: color }}
        />
      </div>

      <div className="flex justify-between mt-1">
        <div className={typography.muted}>{min}</div>
        <div className={typography.muted}>{max}</div>
      </div>
    </div>
  );
}

function CompactGauge({ status, label, unit, displayValue }: GaugeProps) {
  const color = colorMap[status];

  return (
    <div className={cx("flex gap-2 items-center", interactive.scaleOnHover)}>
      <div
        className={cx("w-3 h-3 rounded-full flex-shrink-0", valueTransition)}
        style={{ backgroundColor: color }}
      />
      <div className="flex flex-col gap-0 items-start">
        {label && <div className={typography.muted}>{label}</div>}
        <div className="flex gap-0.5 items-center">
          <div className={cx(typography.valueSmall, valueTransition)}>{displayValue}</div>
          {unit && <div className={typography.muted}>{unit}</div>}
        </div>
      </div>
      <StatusBadge status={statusMap[status]}>
        {status === "normal" ? "OK" : status === "warning" ? "Warn" : "Crit"}
      </StatusBadge>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function Gauge() {
  const [data, setData] = useState<GaugeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    app.connect().catch(() => {});

    app.ontoolresult = (result: { content?: Array<{ type: string; text?: string }> }) => {
      setLoading(false);
      try {
        const textContent = result.content?.find((c) => c.type === "text");
        if (textContent?.text) {
          const parsed = JSON.parse(textContent.text);
          setData(parsed);
        }
      } catch (e) {
        console.error("Failed to parse gauge data", e);
      }
    };
  }, []);

  const { status, displayValue } = useMemo(() => {
    if (!data) return { status: "normal" as ThresholdStatus, displayValue: "-" };

    const { value, thresholds } = data;
    let status: ThresholdStatus = "normal";

    if (thresholds) {
      if (thresholds.critical !== undefined && value >= thresholds.critical) {
        status = "critical";
      } else if (thresholds.warning !== undefined && value >= thresholds.warning) {
        status = "warning";
      }
    }

    const displayValue = Number.isInteger(value) ? String(value) : value.toFixed(1);

    return { status, displayValue };
  }, [data]);

  // Loading state with skeleton
  if (loading) {
    const format = data?.format ?? "circular";
    return <GaugeSkeleton variant={format === "linear" ? "linear" : "circular"} />;
  }

  // No data state
  if (!data) {
    return (
      <div className={cx(containers.root, "inline-flex")}>
        <div className={containers.centered}>No data</div>
      </div>
    );
  }

  const { value, min = 0, max = 100, label, unit, format = "circular" } = data;
  const props: GaugeProps = { value, min, max, status, label, unit, displayValue };

  return (
    <div className="p-3 font-sans text-fg-default bg-bg-canvas inline-flex">
      {format === "circular" && <CircularGauge {...props} />}
      {format === "linear" && <LinearGauge {...props} />}
      {format === "compact" && <CompactGauge {...props} />}
    </div>
  );
}

// ============================================================================
// Mount
// ============================================================================

render(<Gauge />, document.getElementById("app")!);
