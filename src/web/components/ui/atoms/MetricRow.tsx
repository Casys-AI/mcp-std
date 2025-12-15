/**
 * MetricRow Atom - Single metric row for lists
 */

interface MetricRowProps {
  label: string;
  value: string | number;
  color?: string;
  showBorder?: boolean;
}

export function MetricRow({ label, value, color, showBorder = true }: MetricRowProps) {
  return (
    <div
      class="flex justify-between items-center py-1.5"
      style={{ borderBottom: showBorder ? "1px solid var(--border)" : "none" }}
    >
      <span class="text-[11px]" style={{ color: "var(--text-dim)" }}>{label}</span>
      <span
        class="text-[11px] font-semibold tabular-nums"
        style={{ color: color || "var(--text)", fontFamily: "var(--font-mono)" }}
      >
        {value}
      </span>
    </div>
  );
}
