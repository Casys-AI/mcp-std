/**
 * Sparkline UI - Inline mini chart
 *
 * Compact line/bar chart showing trend with:
 * - Min/max markers
 * - Current value highlight
 * - Optional label
 *
 * Stack: Preact + Tailwind CSS
 *
 * @module lib/std/src/ui/sparkline
 */

import { render } from "preact";
import { useState, useEffect, useMemo } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { cx } from "../../components/utils";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface SparklineData {
  values: number[];
  label?: string;
  type?: "line" | "bar" | "area";
  color?: string;
  showMinMax?: boolean;
  showCurrent?: boolean;
  height?: number;
  width?: number;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Sparkline", version: "1.0.0" });

// ============================================================================
// Main Component
// ============================================================================

function Sparkline() {
  const [data, setData] = useState<SparklineData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    app.connect().catch(() => {});

    app.ontoolresult = (result: { content?: Array<{ type: string; text?: string }> }) => {
      setLoading(false);
      try {
        const textContent = result.content?.find((c) => c.type === "text");
        if (textContent?.text) {
          const parsed = JSON.parse(textContent.text);
          // Handle array directly or object with values
          if (Array.isArray(parsed)) {
            setData({ values: parsed });
          } else {
            setData(parsed);
          }
        }
      } catch (e) {
        console.error("Failed to parse sparkline data", e);
      }
    };
  }, []);

  const computed = useMemo(() => {
    if (!data?.values?.length) return null;

    const { values } = data;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const current = values[values.length - 1];
    const prev = values.length > 1 ? values[values.length - 2] : current;
    const trend = current > prev ? "up" : current < prev ? "down" : "flat";

    return { min, max, range, current, trend };
  }, [data]);

  if (loading) {
    return (
      <div className="inline-flex gap-2 p-2 font-sans text-sm text-fg-default bg-bg-canvas">
        ...
      </div>
    );
  }

  if (!data?.values?.length || !computed) {
    return (
      <div className="inline-flex gap-2 p-2 font-sans text-sm text-fg-default bg-bg-canvas">
        No data
      </div>
    );
  }

  const {
    values,
    label,
    type = "line",
    color = "var(--colors-blue-500)",
    showMinMax = false,
    showCurrent = true,
    height = 32,
    width = 120,
  } = data;

  const { min, max, range, current, trend } = computed;
  const padding = 2;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  // Generate path or bars
  const points = values.map((v, i) => ({
    x: padding + (i / (values.length - 1)) * innerWidth,
    y: padding + innerHeight - ((v - min) / range) * innerHeight,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${padding} ${height - padding} Z`;

  const trendColorClass = trend === "up" ? "text-green-500" : trend === "down" ? "text-red-500" : "text-fg-muted";
  const trendArrow = trend === "up" ? "\u2191" : trend === "down" ? "\u2193" : "\u2192";

  return (
    <div className="inline-flex gap-2 p-2 font-sans text-sm text-fg-default bg-bg-canvas items-center">
      {label && (
        <div className="text-fg-muted text-xs min-w-[40px]">
          {label}
        </div>
      )}

      <div className="relative">
        <svg width={width} height={height} style={{ display: "block" }}>
          {type === "area" && (
            <path d={areaPath} fill={color} opacity={0.2} />
          )}

          {type === "line" || type === "area" ? (
            <path
              d={linePath}
              fill="none"
              stroke={color}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            // Bar chart
            values.map((v, i) => {
              const barWidth = (innerWidth / values.length) * 0.8;
              const barHeight = ((v - min) / range) * innerHeight;
              const x = padding + (i / values.length) * innerWidth + barWidth * 0.1;
              const y = height - padding - barHeight;
              return (
                <rect
                  key={i}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  fill={color}
                  opacity={i === values.length - 1 ? 1 : 0.6}
                  rx={1}
                />
              );
            })
          )}

          {/* Current point */}
          {(type === "line" || type === "area") && (
            <circle
              cx={points[points.length - 1].x}
              cy={points[points.length - 1].y}
              r={3}
              fill={color}
            />
          )}
        </svg>
      </div>

      {showCurrent && (
        <div className="flex gap-1 items-center font-mono font-semibold">
          <div className={cx("text-xs", trendColorClass)}>
            {trendArrow}
          </div>
          <div className="text-sm">
            {Number.isInteger(current) ? current : current.toFixed(1)}
          </div>
        </div>
      )}

      {showMinMax && (
        <div className="flex flex-col text-xs text-fg-muted leading-none">
          <span>{min.toFixed(0)}</span>
          <span>{max.toFixed(0)}</span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Mount
// ============================================================================

render(<Sparkline />, document.getElementById("app")!);
