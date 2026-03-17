/**
 * Waterfall Viewer UI - HTTP timing visualization
 *
 * Chrome DevTools Network-style waterfall chart showing:
 * - DNS lookup
 * - TCP connect
 * - TLS handshake
 * - Time to first byte (TTFB)
 * - Content download
 *
 * @module lib/std/src/ui/waterfall-viewer
 */

import { render } from "preact";
import { useState, useEffect, useMemo, useRef } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { cx } from "../../components/utils";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface TimingPhases {
  dns?: number;      // DNS lookup (ms)
  connect?: number;  // TCP connect (ms)
  tls?: number;      // TLS handshake (ms)
  ttfb?: number;     // Time to first byte (ms)
  download?: number; // Content download (ms)
}

interface TimingData {
  url: string;
  method: string;
  status: number;
  totalTime: number;
  phases: TimingPhases;
}

interface WaterfallData {
  requests: TimingData[];
  title?: string;
}

// Phase configuration with colors matching Chrome DevTools
const PHASE_CONFIG = {
  dns: { label: "DNS", color: "#7BC47F", description: "DNS Lookup" },
  connect: { label: "Connect", color: "#F5A623", description: "TCP Connection" },
  tls: { label: "TLS", color: "#9B59B6", description: "TLS Handshake" },
  ttfb: { label: "TTFB", color: "#4CAF50", description: "Time to First Byte" },
  download: { label: "Download", color: "#4A90D9", description: "Content Download" },
} as const;

type PhaseKey = keyof typeof PHASE_CONFIG;

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "WaterfallViewer", version: "1.0.0" });

// ============================================================================
// Utility Functions
// ============================================================================

function formatTime(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}us`;
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function getStatusColor(status: number): string {
  if (status >= 200 && status < 300) return "var(--colors-green-600)";
  if (status >= 300 && status < 400) return "var(--colors-blue-600)";
  if (status >= 400 && status < 500) return "var(--colors-yellow-600)";
  if (status >= 500) return "var(--colors-red-600)";
  return "var(--colors-fg-muted)";
}

function truncateUrl(url: string, maxLength: number = 60): string {
  if (url.length <= maxLength) return url;
  const parsed = new URL(url);
  const path = parsed.pathname + parsed.search;
  if (path.length > maxLength - 3) {
    return "..." + path.slice(-(maxLength - 3));
  }
  return url.slice(0, maxLength - 3) + "...";
}

function getMethodColor(method: string): string {
  const colors: Record<string, string> = {
    GET: "var(--colors-green-600)",
    POST: "var(--colors-blue-600)",
    PUT: "var(--colors-yellow-600)",
    PATCH: "var(--colors-purple-600)",
    DELETE: "var(--colors-red-600)",
    HEAD: "var(--colors-fg-muted)",
    OPTIONS: "var(--colors-fg-muted)",
  };
  return colors[method.toUpperCase()] || "var(--colors-fg-default)";
}

// ============================================================================
// Components
// ============================================================================

function TimeScale({ maxTime, width }: { maxTime: number; width: number }) {
  const tickCount = 5;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => (maxTime / tickCount) * i);

  return (
    <div className="w-full">
      <svg width={width} height={20} style={{ display: "block" }}>
        {ticks.map((tick, i) => {
          const x = (tick / maxTime) * width;
          return (
            <g key={i}>
              <line x1={x} y1={15} x2={x} y2={20} stroke="var(--colors-border-default)" strokeWidth="1" />
              <text
                x={x}
                y={12}
                fill="var(--colors-fg-muted)"
                fontSize="10"
                textAnchor={i === 0 ? "start" : i === tickCount ? "end" : "middle"}
              >
                {formatTime(tick)}
              </text>
            </g>
          );
        })}
        <line x1={0} y1={20} x2={width} y2={20} stroke="var(--colors-border-default)" strokeWidth="1" />
      </svg>
    </div>
  );
}

function WaterfallBar({
  phases,
  totalTime,
  maxTime,
  width,
}: {
  phases: TimingPhases;
  totalTime: number;
  maxTime: number;
  width: number;
}) {
  const [hoveredPhase, setHoveredPhase] = useState<PhaseKey | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const phaseOrder: PhaseKey[] = ["dns", "connect", "tls", "ttfb", "download"];
  let currentX = 0;
  const barHeight = 16;

  const bars = phaseOrder
    .filter((key) => phases[key] !== undefined && phases[key]! > 0)
    .map((key) => {
      const duration = phases[key]!;
      const barWidth = (duration / maxTime) * width;
      const x = currentX;
      currentX += barWidth;
      return { key, x, width: barWidth, duration, config: PHASE_CONFIG[key] };
    });

  const handleMouseEnter = (phase: PhaseKey, event: MouseEvent) => {
    setHoveredPhase(phase);
    const rect = (event.target as SVGElement).getBoundingClientRect();
    setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top });
  };

  const handleMouseLeave = () => {
    setHoveredPhase(null);
  };

  return (
    <div className="relative">
      <svg width={width} height={barHeight + 4} style={{ display: "block", width: "100%" }}>
        {/* Background track */}
        <rect x={0} y={2} width={width} height={barHeight} fill="var(--colors-bg-subtle)" rx={2} />
        {/* Phase bars */}
        {bars.map(({ key, x, width: barWidth, config }) => (
          <rect
            key={key}
            x={x}
            y={2}
            width={Math.max(barWidth, 1)}
            height={barHeight}
            fill={config.color}
            rx={x === 0 ? 2 : 0}
            className="cursor-pointer transition-opacity duration-150 hover:opacity-80"
            onMouseEnter={(e) => handleMouseEnter(key, e as unknown as MouseEvent)}
            onMouseLeave={handleMouseLeave}
          />
        ))}
      </svg>
      {hoveredPhase && (
        <div
          className="fixed bg-bg-default border border-border-default rounded-md px-2 py-1 text-xs text-fg-default shadow-lg z-[1000] pointer-events-none whitespace-nowrap"
          style={{
            top: `${tooltipPos.y - 40}px`,
            left: `${Math.min(tooltipPos.x, window.innerWidth - 320)}px`,
            transform: "translateX(-50%)",
          }}
        >
          <strong>{PHASE_CONFIG[hoveredPhase].description}</strong>
          <br />
          {formatTime(phases[hoveredPhase]!)}
        </div>
      )}
    </div>
  );
}

function RequestRow({
  request,
  maxTime,
  barWidth,
  index,
}: {
  request: TimingData;
  maxTime: number;
  barWidth: number;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="flex flex-wrap items-center py-2 border-b border-border-subtle hover:bg-bg-subtle"
      data-index={index}
    >
      <div className="w-[200px] shrink-0 flex items-center gap-2 cursor-pointer pr-2" onClick={() => setExpanded(!expanded)}>
        <span className="text-xs font-bold font-mono shrink-0" style={{ color: getMethodColor(request.method) }}>
          {request.method}
        </span>
        <span className="text-xs font-mono shrink-0" style={{ color: getStatusColor(request.status) }}>
          {request.status}
        </span>
        <span className="text-sm text-fg-default overflow-hidden text-ellipsis whitespace-nowrap" title={request.url}>
          {truncateUrl(request.url)}
        </span>
      </div>
      <div className="flex-1 min-w-[200px] relative">
        <WaterfallBar phases={request.phases} totalTime={request.totalTime} maxTime={maxTime} width={barWidth} />
      </div>
      <div className="w-20 shrink-0 text-right text-sm font-mono text-fg-muted">
        {formatTime(request.totalTime)}
      </div>
      {expanded && (
        <div className="w-full mt-2 pl-4 pr-4">
          <PhaseDetails phases={request.phases} totalTime={request.totalTime} />
        </div>
      )}
    </div>
  );
}

function PhaseDetails({ phases, totalTime }: { phases: TimingPhases; totalTime: number }) {
  const phaseOrder: PhaseKey[] = ["dns", "connect", "tls", "ttfb", "download"];

  return (
    <div className="flex flex-col gap-1 bg-bg-subtle rounded-md p-3">
      {phaseOrder.map((key) => {
        const duration = phases[key];
        if (duration === undefined || duration <= 0) return null;
        const config = PHASE_CONFIG[key];
        const percentage = ((duration / totalTime) * 100).toFixed(1);
        return (
          <div className="flex items-center gap-2" key={key}>
            <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: config.color }} />
            <div className="flex-1 text-sm text-fg-default">{config.description}</div>
            <div className="text-sm font-mono text-fg-default font-medium">{formatTime(duration)}</div>
            <div className="text-xs text-fg-muted w-[50px] text-right">({percentage}%)</div>
          </div>
        );
      })}
    </div>
  );
}

function Legend() {
  const phases: PhaseKey[] = ["dns", "connect", "tls", "ttfb", "download"];
  return (
    <div className="flex flex-wrap gap-3 mb-3 pb-3 border-b border-border-default">
      {phases.map((key) => (
        <div className="flex items-center gap-1.5" key={key}>
          <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: PHASE_CONFIG[key].color }} />
          <div className="text-xs text-fg-muted">{PHASE_CONFIG[key].label}</div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function WaterfallViewer() {
  const [data, setData] = useState<WaterfallData | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(600);

  useEffect(() => {
    app.connect().catch(() => {});

    app.ontoolresult = (result: { content?: Array<{ type: string; text?: string }> }) => {
      setLoading(false);
      try {
        const textContent = result.content?.find((c) => c.type === "text");
        if (textContent?.text) {
          const parsed = JSON.parse(textContent.text);
          // Support both single request and array of requests
          if (Array.isArray(parsed)) {
            setData({ requests: parsed });
          } else if (parsed.requests) {
            setData(parsed);
          } else {
            setData({ requests: [parsed] });
          }
        }
      } catch (e) {
        console.error("Failed to parse waterfall data", e);
      }
    };

    // Handle resize
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, []);

  const { maxTime, barWidth } = useMemo(() => {
    if (!data || data.requests.length === 0) {
      return { maxTime: 1000, barWidth: 300 };
    }
    const maxTime = Math.max(...data.requests.map((r) => r.totalTime));
    // Reserve space for info column (200px) and total time column (80px)
    const barWidth = Math.max(200, containerWidth - 300);
    return { maxTime: maxTime * 1.1, barWidth }; // Add 10% padding to max
  }, [data, containerWidth]);

  if (loading) {
    return (
      <div className="p-4 font-sans text-fg-default bg-bg-canvas min-w-[500px] max-w-full" ref={containerRef}>
        <div className="p-4 text-fg-muted text-center">Loading...</div>
      </div>
    );
  }

  if (!data || data.requests.length === 0) {
    return (
      <div className="p-4 font-sans text-fg-default bg-bg-canvas min-w-[500px] max-w-full" ref={containerRef}>
        <div className="p-4 text-fg-muted text-center">No timing data available</div>
      </div>
    );
  }

  return (
    <div className="p-4 font-sans text-fg-default bg-bg-canvas min-w-[500px] max-w-full" ref={containerRef}>
      {data.title && <h2 className="text-lg font-semibold mb-3 text-fg-default">{data.title}</h2>}
      <Legend />
      <div className="flex items-end border-b border-border-default pb-1 mb-1">
        <div className="w-[200px] shrink-0 text-xs font-medium text-fg-muted uppercase tracking-wider">
          Request
        </div>
        <div className="flex-1 min-w-[200px]">
          <TimeScale maxTime={maxTime} width={barWidth} />
        </div>
        <div className="w-20 shrink-0 text-right text-xs font-medium text-fg-muted uppercase tracking-wider">
          Time
        </div>
      </div>
      <div className="flex flex-col gap-0">
        {data.requests.map((request, index) => (
          <RequestRow key={index} request={request} maxTime={maxTime} barWidth={barWidth} index={index} />
        ))}
      </div>
      <div className="flex gap-4 mt-3 pt-3 border-t border-border-default">
        <div className="text-sm text-fg-muted">
          <strong>{data.requests.length}</strong> request{data.requests.length !== 1 ? "s" : ""}
        </div>
        <div className="text-sm text-fg-muted">
          Total: <strong>{formatTime(data.requests.reduce((sum, r) => sum + r.totalTime, 0))}</strong>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Mount
// ============================================================================

render(<WaterfallViewer />, document.getElementById("app")!);
