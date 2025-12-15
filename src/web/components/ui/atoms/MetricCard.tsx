/**
 * MetricCard Atom - Compact metric display
 */

interface MetricCardProps {
  label: string;
  value: string | number;
  icon?: string;
  color?: string;
  trend?: "up" | "down" | "neutral";
  compact?: boolean;
}

export function MetricCard({ label, value, color, trend, compact }: MetricCardProps) {
  const trendIcon = trend === "up" ? "↑" : trend === "down" ? "↓" : "";
  const trendColor = trend === "up" ? "var(--success)" : trend === "down" ? "var(--error)" : "";

  if (compact) {
    return (
      <div
        class="flex items-center justify-between px-2 py-1.5 rounded-lg"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
      >
        <span class="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>
          {label}
        </span>
        <span
          class="text-sm font-bold tabular-nums"
          style={{ color: color || "var(--text)", fontFamily: "var(--font-mono)" }}
        >
          {value}
          {trendIcon && <span style={{ color: trendColor, marginLeft: 2 }}>{trendIcon}</span>}
        </span>
      </div>
    );
  }

  return (
    <div
      class="p-3 rounded-lg transition-all duration-200"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
    >
      <span class="block text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--text-dim)" }}>
        {label}
      </span>
      <span
        class="block text-xl font-bold tabular-nums"
        style={{ color: color || "var(--text)", fontFamily: "var(--font-mono)" }}
      >
        {value}
        {trendIcon && <span class="text-sm ml-1" style={{ color: trendColor }}>{trendIcon}</span>}
      </span>
    </div>
  );
}
