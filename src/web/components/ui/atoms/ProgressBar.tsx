/**
 * ProgressBar Atom - Compact progress indicator
 */

interface ProgressBarProps {
  value: number; // 0-1
  label?: string;
  showValue?: boolean;
  color?: string;
  height?: number;
}

export function ProgressBar({ value, label, showValue = true, color, height = 4 }: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, value * 100));

  return (
    <div class="w-full">
      {label && (
        <div class="flex justify-between items-center mb-1">
          <span class="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>
            {label}
          </span>
          {showValue && (
            <span
              class="text-[10px] font-semibold tabular-nums"
              style={{ color: color || "var(--accent)", fontFamily: "var(--font-mono)" }}
            >
              {percentage.toFixed(1)}%
            </span>
          )}
        </div>
      )}
      <div
        class="rounded-full overflow-hidden"
        style={{ background: "var(--bg)", height: `${height}px` }}
      >
        <div
          class="h-full rounded-full transition-all duration-300"
          style={{
            width: `${percentage}%`,
            background: color || "var(--accent)",
          }}
        />
      </div>
    </div>
  );
}
