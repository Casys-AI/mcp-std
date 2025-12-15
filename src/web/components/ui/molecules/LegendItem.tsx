/**
 * LegendItem Molecule - Single legend entry with line indicator
 * Used for: Edge types and confidence legends
 * Supports clickable toggle mode
 */

interface LegendItemProps {
  label: string;
  color: string;
  lineStyle?: "solid" | "dashed" | "dotted";
  opacity?: number;
  /** If provided, makes the item clickable as a toggle */
  active?: boolean;
  onClick?: () => void;
}

export default function LegendItem({
  label,
  color,
  lineStyle = "solid",
  opacity = 1,
  active,
  onClick,
}: LegendItemProps) {
  const isToggleable = active !== undefined && onClick !== undefined;
  const isActive = active ?? true;

  return (
    <div
      class={`flex items-center gap-2.5 py-1.5 px-3 -mx-3 rounded transition-all ${
        isToggleable ? "cursor-pointer hover:bg-white/5" : ""
      }`}
      onClick={onClick}
      style={{
        opacity: isActive ? 1 : 0.4,
      }}
    >
      {/* Checkbox indicator for toggleable items */}
      {isToggleable && (
        <div
          class="w-3 h-3 rounded border flex-shrink-0 flex items-center justify-center"
          style={{
            borderColor: color,
            background: isActive ? color : "transparent",
          }}
        >
          {isActive && (
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <path
                d="M1.5 4L3 5.5L6.5 2"
                stroke="#000"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          )}
        </div>
      )}
      <div
        class="w-6 h-0.5 flex-shrink-0"
        style={{
          background: lineStyle === "solid" ? color : "transparent",
          borderTop: lineStyle !== "solid" ? `2px ${lineStyle} ${color}` : "none",
          opacity,
        }}
      />
      <span class="text-xs" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
    </div>
  );
}
