/**
 * Stats Panel UI for MCP Apps
 *
 * Statistical visualization components with premium data visualization aesthetics:
 * - Histogram - Distribution in bars with gradient fills and glow effects
 * - Box plot - Min, Q1, median, Q3, max, outliers with progressive draw animation
 * - Summary stats - Glassmorphism cards with count-up animations
 * - Distribution curve - Normal curve overlay (optional)
 *
 * Design: DM Sans for labels, Space Mono for numbers
 * Colors: Casys Design System - Dark theme with golden accent (#ffb86f)
 *
 * Stack: Preact + Tailwind CSS 4
 *
 * @module lib/std/src/ui/stats-panel
 */

import { render } from "preact";
import { useState, useEffect, useMemo, useRef } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import * as Switch from "~/components/ui/switch";
import { Spinner } from "../../components/ui/spinner";
import { cx } from "../../components/utils";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface StatsData {
  data: number[];
  title?: string;
  bins?: number;
  showBoxPlot?: boolean;
  showHistogram?: boolean;
  showCurve?: boolean;
}

interface ContentItem {
  type: string;
  text?: string;
}

interface Stats {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  mode: number[];
  stdDev: number;
  variance: number;
  q1: number;
  q3: number;
  iqr: number;
  outliers: number[];
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Stats Panel", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Statistical Functions
// ============================================================================

function calculateStats(data: number[]): Stats {
  if (data.length === 0) {
    return {
      count: 0,
      min: 0,
      max: 0,
      mean: 0,
      median: 0,
      mode: [],
      stdDev: 0,
      variance: 0,
      q1: 0,
      q3: 0,
      iqr: 0,
      outliers: [],
    };
  }

  const sorted = [...data].sort((a, b) => a - b);
  const n = sorted.length;

  // Basic stats
  const min = sorted[0];
  const max = sorted[n - 1];
  const sum = data.reduce((a, b) => a + b, 0);
  const mean = sum / n;

  // Median
  const median = n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)];

  // Mode
  const frequency: Record<number, number> = {};
  data.forEach((v) => {
    frequency[v] = (frequency[v] || 0) + 1;
  });
  const maxFreq = Math.max(...Object.values(frequency));
  const mode = Object.entries(frequency)
    .filter(([_, freq]) => freq === maxFreq)
    .map(([val]) => parseFloat(val));

  // Variance and Standard Deviation
  const squaredDiffs = data.map((v) => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / n;
  const stdDev = Math.sqrt(variance);

  // Quartiles
  const q1Index = Math.floor(n * 0.25);
  const q3Index = Math.floor(n * 0.75);
  const q1 = sorted[q1Index];
  const q3 = sorted[q3Index];
  const iqr = q3 - q1;

  // Outliers (values beyond 1.5 * IQR from quartiles)
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;
  const outliers = data.filter((v) => v < lowerBound || v > upperBound);

  return {
    count: n,
    min,
    max,
    mean,
    median,
    mode,
    stdDev,
    variance,
    q1,
    q3,
    iqr,
    outliers,
  };
}

function createHistogramBins(data: number[], binCount: number): { start: number; end: number; count: number }[] {
  if (data.length === 0) return [];

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const binWidth = range / binCount;

  const bins: { start: number; end: number; count: number }[] = [];
  for (let i = 0; i < binCount; i++) {
    bins.push({
      start: min + i * binWidth,
      end: min + (i + 1) * binWidth,
      count: 0,
    });
  }

  data.forEach((value) => {
    let binIndex = Math.floor((value - min) / binWidth);
    if (binIndex >= binCount) binIndex = binCount - 1;
    if (binIndex < 0) binIndex = 0;
    bins[binIndex].count++;
  });

  return bins;
}

// Normal distribution PDF
function normalPDF(x: number, mean: number, stdDev: number): number {
  if (stdDev === 0) return x === mean ? 1 : 0;
  const exp = -0.5 * Math.pow((x - mean) / stdDev, 2);
  return (1 / (stdDev * Math.sqrt(2 * Math.PI))) * Math.exp(exp);
}

// ============================================================================
// Animation Hooks
// ============================================================================

function useCountUp(end: number, duration: number = 800, decimals: number = 0): string {
  const [current, setCurrent] = useState(0);
  const frameRef = useRef<number>();
  const startTimeRef = useRef<number>();

  useEffect(() => {
    startTimeRef.current = performance.now();

    const animate = (now: number) => {
      const elapsed = now - (startTimeRef.current || now);
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (ease-out cubic)
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(end * eased);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [end, duration]);

  return current.toFixed(decimals);
}

function useAnimatedMount(delay: number = 0): boolean {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return mounted;
}

// ============================================================================
// Chart Components
// ============================================================================

// Casys Design System Colors
const COLORS = {
  // Primary accent - golden yellow
  accent: "#ffb86f",
  accentDim: "rgba(255, 184, 111, 0.1)",
  accentMedium: "rgba(255, 184, 111, 0.2)",
  // Semantic colors
  success: "#4ade80",
  warning: "#fbbf24",
  error: "#f87171",
  info: "#60a5fa",
  // Text colors
  muted: "#d5c3b5",
  dim: "#8a8078",
  // Gradient uses accent with variations
  gradientStart: "#ffb86f",
  gradientMid: "#e09850",
  gradientEnd: "#c27830",
};

interface ChartProps {
  data: number[];
  stats: Stats;
  bins: number;
  width: number;
  height: number;
  showCurve?: boolean;
}

function Histogram({ data, stats, bins, width, height, showCurve }: ChartProps) {
  const padding = { top: 24, right: 24, bottom: 48, left: 56 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const mounted = useAnimatedMount(100);

  const histogramBins = useMemo(() => createHistogramBins(data, bins), [data, bins]);
  const maxCount = Math.max(...histogramBins.map((b) => b.count), 1);
  const barWidth = chartWidth / histogramBins.length;

  // Generate normal curve points
  const curvePoints = useMemo(() => {
    if (!showCurve || stats.stdDev === 0) return "";

    const points: string[] = [];
    const step = (stats.max - stats.min) / 100;
    const binWidth = (stats.max - stats.min) / bins;

    for (let x = stats.min; x <= stats.max; x += step) {
      const pdfValue = normalPDF(x, stats.mean, stats.stdDev);
      // Scale to match histogram
      const scaledY = pdfValue * data.length * binWidth;
      const px = padding.left + ((x - stats.min) / (stats.max - stats.min)) * chartWidth;
      const py = height - padding.bottom - (scaledY / maxCount) * chartHeight;
      points.push(`${px},${py}`);
    }
    return points.join(" ");
  }, [showCurve, stats, data.length, bins, chartWidth, chartHeight, maxCount, width, height]);

  const gradientId = `histogram-gradient-${Math.random().toString(36).slice(2)}`;
  const glowId = `histogram-glow-${Math.random().toString(36).slice(2)}`;

  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      <defs>
        {/* Horizontal gradient for bars */}
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={COLORS.gradientStart} />
          <stop offset="50%" stopColor={COLORS.gradientMid} />
          <stop offset="100%" stopColor={COLORS.gradientEnd} />
        </linearGradient>
        {/* Glow filter */}
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="8" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background glow */}
      <rect
        x={padding.left - 20}
        y={padding.top - 20}
        width={chartWidth + 40}
        height={chartHeight + 40}
        fill={COLORS.gradientMid}
        fillOpacity={0.05}
        rx={16}
        filter={`url(#${glowId})`}
      />

      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = padding.top + chartHeight * (1 - ratio);
        return (
          <g key={ratio}>
            <line
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke="white"
              strokeOpacity={0.06}
              strokeDasharray="4 4"
            />
            <text
              x={padding.left - 12}
              y={y + 4}
              textAnchor="end"
              style={{
                fontSize: "11px",
                fontFamily: "'Space Mono', monospace",
                fill: "rgba(255, 255, 255, 0.4)",
              }}
            >
              {Math.round(maxCount * ratio)}
            </text>
          </g>
        );
      })}

      {/* Y axis */}
      <line
        x1={padding.left}
        y1={padding.top}
        x2={padding.left}
        y2={height - padding.bottom}
        stroke="white"
        strokeOpacity={0.1}
      />

      {/* X axis */}
      <line
        x1={padding.left}
        y1={height - padding.bottom}
        x2={width - padding.right}
        y2={height - padding.bottom}
        stroke="white"
        strokeOpacity={0.1}
      />

      {/* Bars with animation */}
      {histogramBins.map((bin, i) => {
        const barHeight = (bin.count / maxCount) * chartHeight;
        const x = padding.left + i * barWidth;
        const y = height - padding.bottom - barHeight;
        const delay = i * 30;

        return (
          <g key={i}>
            <rect
              x={x + 2}
              y={height - padding.bottom}
              width={barWidth - 4}
              height={barHeight}
              fill={`url(#${gradientId})`}
              fillOpacity={0.85}
              rx={4}
              style={{
                transform: mounted ? `scaleY(1)` : `scaleY(0)`,
                transformOrigin: `${x + barWidth / 2}px ${height - padding.bottom}px`,
                transition: `transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}ms`,
                cursor: "pointer",
              }}
              onClick={() => notifyModel("click", { bin: i, range: `${bin.start.toFixed(2)} - ${bin.end.toFixed(2)}`, count: bin.count })}
            >
              <title>{`${bin.start.toFixed(2)} - ${bin.end.toFixed(2)}: ${bin.count}`}</title>
            </rect>
            {/* Highlight on hover (positioned correctly) */}
            <rect
              x={x + 2}
              y={y}
              width={barWidth - 4}
              height={barHeight}
              fill="white"
              fillOpacity={0}
              rx={4}
              style={{
                cursor: "pointer",
                transition: "fill-opacity 0.2s ease",
              }}
              onMouseEnter={(e) => ((e.currentTarget as SVGRectElement).style.fillOpacity = "0.15")}
              onMouseLeave={(e) => ((e.currentTarget as SVGRectElement).style.fillOpacity = "0")}
            />
          </g>
        );
      })}

      {/* Normal curve overlay */}
      {showCurve && curvePoints && (
        <polyline
          fill="none"
          stroke={COLORS.info}
          strokeWidth={2.5}
          points={curvePoints}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            filter: "drop-shadow(0 0 6px rgba(96, 165, 250, 0.6))",
            opacity: mounted ? 1 : 0,
            transition: "opacity 0.8s ease 0.5s",
          }}
        />
      )}

      {/* Mean line */}
      {stats.count > 0 && (
        <g style={{ opacity: mounted ? 1 : 0, transition: "opacity 0.5s ease 0.8s" }}>
          <line
            x1={padding.left + ((stats.mean - stats.min) / (stats.max - stats.min)) * chartWidth}
            y1={padding.top}
            x2={padding.left + ((stats.mean - stats.min) / (stats.max - stats.min)) * chartWidth}
            y2={height - padding.bottom}
            stroke={COLORS.error}
            strokeWidth={2}
            strokeDasharray="6 4"
            style={{ filter: "drop-shadow(0 0 4px rgba(248, 113, 113, 0.5))" }}
          />
          <text
            x={padding.left + ((stats.mean - stats.min) / (stats.max - stats.min)) * chartWidth}
            y={padding.top - 8}
            textAnchor="middle"
            style={{
              fontSize: "10px",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 500,
              fill: COLORS.error,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            mean
          </text>
        </g>
      )}

      {/* X labels (bin ranges) */}
      {histogramBins.filter((_, i) => i % Math.ceil(bins / 5) === 0 || i === bins - 1).map((bin) => (
        <text
          key={bin.start}
          x={padding.left + histogramBins.indexOf(bin) * barWidth + barWidth / 2}
          y={height - padding.bottom + 20}
          textAnchor="middle"
          style={{
            fontSize: "10px",
            fontFamily: "'Space Mono', monospace",
            fill: "rgba(255, 255, 255, 0.5)",
          }}
        >
          {bin.start.toFixed(1)}
        </text>
      ))}
    </svg>
  );
}

function BoxPlot({ stats, width, height }: { stats: Stats; width: number; height: number }) {
  const padding = { top: 36, right: 48, bottom: 40, left: 48 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const mounted = useAnimatedMount(200);

  if (stats.count === 0) {
    return (
      <svg width={width} height={height}>
        <text
          x={width / 2}
          y={height / 2}
          textAnchor="middle"
          style={{
            fontSize: "13px",
            fontFamily: "'DM Sans', sans-serif",
            fill: "rgba(255, 255, 255, 0.4)",
          }}
        >
          No data
        </text>
      </svg>
    );
  }

  const range = stats.max - stats.min || 1;
  const scale = (value: number) => padding.left + ((value - stats.min) / range) * chartWidth;

  const boxY = padding.top + chartHeight * 0.25;
  const boxHeight = chartHeight * 0.5;

  const gradientId = `boxplot-gradient-${Math.random().toString(36).slice(2)}`;
  const glowId = `boxplot-glow-${Math.random().toString(36).slice(2)}`;

  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={COLORS.gradientStart} />
          <stop offset="50%" stopColor={COLORS.gradientMid} />
          <stop offset="100%" stopColor={COLORS.gradientEnd} />
        </linearGradient>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Main axis line */}
      <line
        x1={padding.left}
        y1={boxY + boxHeight / 2}
        x2={width - padding.right}
        y2={boxY + boxHeight / 2}
        stroke="white"
        strokeOpacity={0.08}
      />

      {/* Animated elements container */}
      <g style={{
        opacity: mounted ? 1 : 0,
        transition: "opacity 0.6s ease",
      }}>
        {/* Whisker: min to Q1 */}
        <line
          x1={scale(stats.min)}
          y1={boxY + boxHeight / 2}
          x2={scale(stats.q1)}
          y2={boxY + boxHeight / 2}
          stroke={`url(#${gradientId})`}
          strokeWidth={2}
          style={{
            strokeDasharray: mounted ? "0" : `${scale(stats.q1) - scale(stats.min)}`,
            strokeDashoffset: mounted ? "0" : `${scale(stats.q1) - scale(stats.min)}`,
            transition: "stroke-dashoffset 0.8s ease 0.2s",
          }}
        />
        {/* Min cap */}
        <line
          x1={scale(stats.min)}
          y1={boxY + boxHeight * 0.2}
          x2={scale(stats.min)}
          y2={boxY + boxHeight * 0.8}
          stroke={COLORS.gradientStart}
          strokeWidth={2}
          strokeLinecap="round"
        />

        {/* Whisker: Q3 to max */}
        <line
          x1={scale(stats.q3)}
          y1={boxY + boxHeight / 2}
          x2={scale(stats.max)}
          y2={boxY + boxHeight / 2}
          stroke={`url(#${gradientId})`}
          strokeWidth={2}
        />
        {/* Max cap */}
        <line
          x1={scale(stats.max)}
          y1={boxY + boxHeight * 0.2}
          x2={scale(stats.max)}
          y2={boxY + boxHeight * 0.8}
          stroke={COLORS.gradientEnd}
          strokeWidth={2}
          strokeLinecap="round"
        />

        {/* Box: Q1 to Q3 */}
        <rect
          x={scale(stats.q1)}
          y={boxY}
          width={Math.max(scale(stats.q3) - scale(stats.q1), 4)}
          height={boxHeight}
          fill={`url(#${gradientId})`}
          fillOpacity={0.25}
          stroke={`url(#${gradientId})`}
          strokeWidth={2}
          rx={6}
          filter={`url(#${glowId})`}
          style={{
            transform: mounted ? "scaleX(1)" : "scaleX(0)",
            transformOrigin: `${scale((stats.q1 + stats.q3) / 2)}px ${boxY + boxHeight / 2}px`,
            transition: "transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s",
          }}
        />

        {/* Median line */}
        <line
          x1={scale(stats.median)}
          y1={boxY}
          x2={scale(stats.median)}
          y2={boxY + boxHeight}
          stroke={COLORS.success}
          strokeWidth={3}
          strokeLinecap="round"
          style={{ filter: "drop-shadow(0 0 6px rgba(74, 222, 128, 0.6))" }}
        />

        {/* Mean marker */}
        <circle
          cx={scale(stats.mean)}
          cy={boxY + boxHeight / 2}
          r={5}
          fill={COLORS.error}
          style={{ filter: "drop-shadow(0 0 4px rgba(248, 113, 113, 0.6))" }}
        >
          <title>Mean: {stats.mean.toFixed(2)}</title>
        </circle>

        {/* Outliers */}
        {stats.outliers.map((outlier, i) => (
          <circle
            key={i}
            cx={scale(outlier)}
            cy={boxY + boxHeight / 2}
            r={4}
            fill="none"
            stroke={COLORS.warning}
            strokeWidth={2}
            style={{
              cursor: "pointer",
              filter: "drop-shadow(0 0 3px rgba(251, 191, 36, 0.5))",
              transition: "r 0.2s ease, stroke-width 0.2s ease",
            }}
            onClick={() => notifyModel("outlier-click", { value: outlier })}
            onMouseEnter={(e) => {
              (e.currentTarget as SVGCircleElement).setAttribute("r", "6");
              (e.currentTarget as SVGCircleElement).setAttribute("stroke-width", "2.5");
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as SVGCircleElement).setAttribute("r", "4");
              (e.currentTarget as SVGCircleElement).setAttribute("stroke-width", "2");
            }}
          >
            <title>Outlier: {outlier.toFixed(2)}</title>
          </circle>
        ))}
      </g>

      {/* Labels */}
      <g style={{ opacity: mounted ? 1 : 0, transition: "opacity 0.5s ease 0.6s" }}>
        <text
          x={scale(stats.min)}
          y={boxY + boxHeight + 20}
          textAnchor="middle"
          style={{
            fontSize: "10px",
            fontFamily: "'Space Mono', monospace",
            fill: "rgba(255, 255, 255, 0.5)",
          }}
        >
          {stats.min.toFixed(1)}
        </text>
        <text
          x={scale(stats.q1)}
          y={boxY - 10}
          textAnchor="middle"
          style={{
            fontSize: "10px",
            fontFamily: "'DM Sans', sans-serif",
            fill: "rgba(255, 255, 255, 0.6)",
          }}
        >
          Q1: {stats.q1.toFixed(1)}
        </text>
        <text
          x={scale(stats.median)}
          y={boxY + boxHeight + 20}
          textAnchor="middle"
          style={{
            fontSize: "10px",
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 500,
            fill: COLORS.success,
          }}
        >
          Med: {stats.median.toFixed(1)}
        </text>
        <text
          x={scale(stats.q3)}
          y={boxY - 10}
          textAnchor="middle"
          style={{
            fontSize: "10px",
            fontFamily: "'DM Sans', sans-serif",
            fill: "rgba(255, 255, 255, 0.6)",
          }}
        >
          Q3: {stats.q3.toFixed(1)}
        </text>
        <text
          x={scale(stats.max)}
          y={boxY + boxHeight + 20}
          textAnchor="middle"
          style={{
            fontSize: "10px",
            fontFamily: "'Space Mono', monospace",
            fill: "rgba(255, 255, 255, 0.5)",
          }}
        >
          {stats.max.toFixed(1)}
        </text>
      </g>

      {/* Legend */}
      <g
        transform={`translate(${padding.left}, ${height - 10})`}
        style={{ opacity: mounted ? 1 : 0, transition: "opacity 0.5s ease 0.8s" }}
      >
        <circle cx={0} cy={0} r={4} fill={COLORS.error} />
        <text
          x={10}
          y={3}
          style={{
            fontSize: "9px",
            fontFamily: "'DM Sans', sans-serif",
            fill: "rgba(255, 255, 255, 0.5)",
          }}
        >
          Mean
        </text>
        <line x1={50} y1={0} x2={65} y2={0} stroke={COLORS.success} strokeWidth={2} />
        <text
          x={72}
          y={3}
          style={{
            fontSize: "9px",
            fontFamily: "'DM Sans', sans-serif",
            fill: "rgba(255, 255, 255, 0.5)",
          }}
        >
          Median
        </text>
        <circle cx={130} cy={0} r={4} fill="none" stroke={COLORS.warning} strokeWidth={2} />
        <text
          x={140}
          y={3}
          style={{
            fontSize: "9px",
            fontFamily: "'DM Sans', sans-serif",
            fill: "rgba(255, 255, 255, 0.5)",
          }}
        >
          Outlier
        </text>
      </g>
    </svg>
  );
}

// Animated stat card component
function StatCard({ label, value, decimals = 4, delay = 0 }: { label: string; value: number | string; decimals?: number; delay?: number }) {
  const mounted = useAnimatedMount(delay);
  const isNumber = typeof value === "number";
  const displayValue = isNumber ? useCountUp(value as number, 800, decimals) : value;
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={cx(
        "flex flex-col gap-1.5 p-3.5 rounded-xl cursor-default",
        "bg-white/[0.03] backdrop-blur-[12px] border border-white/[0.06]"
      )}
      style={{
        opacity: mounted ? 1 : 0,
        transform: mounted ? "translateY(0)" : "translateY(8px)",
        transition: `all 0.4s ease ${delay}ms`,
        boxShadow: hovered ? "0 8px 32px rgba(255, 184, 111, 0.15)" : "none",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="text-[10px] font-['DM_Sans',sans-serif] font-medium uppercase tracking-[0.08em]"
        style={{
          color: "rgba(255, 255, 255, 0.45)",
          opacity: hovered ? 0.8 : 0.45,
          transition: "opacity 0.2s ease",
        }}
      >
        {label}
      </div>
      <div className="text-[15px] font-['Space_Mono',monospace] font-medium tracking-[-0.02em] text-white/90">
        {displayValue}
      </div>
    </div>
  );
}

function SummaryStats({ stats }: { stats: Stats }) {
  const items = [
    { label: "Count", value: stats.count, decimals: 0 },
    { label: "Min", value: stats.min, decimals: 4 },
    { label: "Max", value: stats.max, decimals: 4 },
    { label: "Mean", value: stats.mean, decimals: 4 },
    { label: "Median", value: stats.median, decimals: 4 },
    { label: "Mode", value: stats.mode.length <= 3 ? stats.mode.map((m) => m.toFixed(2)).join(", ") : `${stats.mode.length} values`, decimals: 0 },
    { label: "Std Dev", value: stats.stdDev, decimals: 4 },
    { label: "Variance", value: stats.variance, decimals: 4 },
    { label: "Q1", value: stats.q1, decimals: 4 },
    { label: "Q3", value: stats.q3, decimals: 4 },
    { label: "IQR", value: stats.iqr, decimals: 4 },
    { label: "Outliers", value: stats.outliers.length, decimals: 0 },
  ];

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2.5 mb-6">
      {items.map((item, i) => (
        <StatCard
          key={item.label}
          label={item.label}
          value={item.value}
          decimals={item.decimals}
          delay={50 + i * 40}
        />
      ))}
    </div>
  );
}

// ============================================================================
// Toggle Switch Component (using Park UI Switch)
// ============================================================================

function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <Switch.Root
      checked={checked}
      onCheckedChange={(e) => onChange(e.checked)}
      size="sm"
      className="px-2 py-1"
    >
      <Switch.Control />
      <Switch.Label className="text-xs font-medium">{label}</Switch.Label>
      <Switch.HiddenInput />
    </Switch.Root>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function StatsPanel() {
  const [statsData, setStatsData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Display toggles
  const [showHistogram, setShowHistogram] = useState(true);
  const [showBoxPlot, setShowBoxPlot] = useState(true);
  const [showCurve, setShowCurve] = useState(false);

  // Connect to MCP host
  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
      console.log("[stats-panel] Connected to MCP host");
    }).catch(() => {
      console.log("[stats-panel] No MCP host (standalone mode)");
    });

    app.ontoolresult = (result: { content?: ContentItem[] }) => {
      setLoading(false);
      setError(null);

      try {
        const textContent = result.content?.find((c) => c.type === "text") as ContentItem | undefined;
        if (!textContent?.text) {
          setStatsData(null);
          return;
        }
        const data = JSON.parse(textContent.text) as StatsData;
        setStatsData(data);

        // Apply initial display settings from data
        if (data.showHistogram !== undefined) setShowHistogram(data.showHistogram);
        if (data.showBoxPlot !== undefined) setShowBoxPlot(data.showBoxPlot);
        if (data.showCurve !== undefined) setShowCurve(data.showCurve);
      } catch (e) {
        setError(`Failed to parse stats data: ${e instanceof Error ? e.message : "Unknown"}`);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // Calculate statistics
  const stats = useMemo(() => {
    if (!statsData?.data) return null;
    return calculateStats(statsData.data);
  }, [statsData?.data]);

  const bins = statsData?.bins ?? 10;
  const width = 520;
  const histogramHeight = 260;
  const boxPlotHeight = 140;

  // Casys Design System - Dark background with subtle grid
  const containerStyle = {
    background: "linear-gradient(180deg, #0a0908 0%, #12110f 100%)",
    backgroundImage: `
      linear-gradient(180deg, #0a0908 0%, #12110f 100%),
      repeating-linear-gradient(
        0deg,
        transparent,
        transparent 40px,
        rgba(255, 184, 111, 0.02) 40px,
        rgba(255, 184, 111, 0.02) 41px
      ),
      repeating-linear-gradient(
        90deg,
        transparent,
        transparent 40px,
        rgba(255, 184, 111, 0.02) 40px,
        rgba(255, 184, 111, 0.02) 41px
      )
    `,
  };

  if (loading) {
    return (
      <div
        className="p-7 font-['DM_Sans',sans-serif] text-sm text-white/90 max-w-[580px] min-h-screen"
        style={containerStyle}
      >
        <div className="flex flex-col items-center justify-center p-[60px] text-white/40">
          <Spinner size="lg" colorPalette="orange" />
          <div className="mt-4">Loading statistics...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="p-7 font-['DM_Sans',sans-serif] text-sm text-white/90 max-w-[580px] min-h-screen"
        style={containerStyle}
      >
        <div className="flex items-center justify-center p-[60px] text-red-400">{error}</div>
      </div>
    );
  }

  if (!statsData || !stats) {
    return (
      <div
        className="p-7 font-['DM_Sans',sans-serif] text-sm text-white/90 max-w-[580px] min-h-screen"
        style={containerStyle}
      >
        <div className="flex items-center justify-center p-[60px] text-white/40">No data provided</div>
      </div>
    );
  }

  return (
    <div
      className="p-7 font-['DM_Sans',sans-serif] text-sm text-white/90 max-w-[580px] min-h-screen"
      style={containerStyle}
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-7 flex-wrap gap-4">
        <div>
          {statsData.title && (
            <h2
              className="text-[22px] font-semibold m-0 tracking-[-0.02em]"
              style={{
                background: "linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.7) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              {statsData.title}
            </h2>
          )}
          <div className="text-xs font-['Space_Mono',monospace] text-white/40 mt-1.5">
            {stats.count.toLocaleString()} data points analyzed
          </div>
        </div>
        <div className="flex gap-1 flex-wrap bg-white/[0.02] rounded-xl p-1 border border-white/[0.04]">
          <ToggleSwitch checked={showHistogram} onChange={setShowHistogram} label="Histogram" />
          <ToggleSwitch checked={showBoxPlot} onChange={setShowBoxPlot} label="Box Plot" />
          <ToggleSwitch checked={showCurve} onChange={setShowCurve} label="Normal Curve" />
        </div>
      </div>

      {/* Summary Statistics */}
      <SummaryStats stats={stats} />

      {/* Charts */}
      <div className="flex flex-col gap-5">
        {showHistogram && (
          <div className="bg-white/[0.02] backdrop-blur-[12px] border border-white/[0.06] rounded-2xl p-5 shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
            <div className="text-[11px] font-semibold text-white/50 mb-4 uppercase tracking-[0.1em]">
              Distribution Histogram
            </div>
            <Histogram
              data={statsData.data}
              stats={stats}
              bins={bins}
              width={width}
              height={histogramHeight}
              showCurve={showCurve}
            />
          </div>
        )}

        {showBoxPlot && (
          <div className="bg-white/[0.02] backdrop-blur-[12px] border border-white/[0.06] rounded-2xl p-5 shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
            <div className="text-[11px] font-semibold text-white/50 mb-4 uppercase tracking-[0.1em]">
              Box Plot Analysis
            </div>
            <BoxPlot stats={stats} width={width} height={boxPlotHeight} />
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Mount
// ============================================================================

render(<StatsPanel />, document.getElementById("app")!);
