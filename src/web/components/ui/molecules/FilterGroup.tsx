/**
 * FilterGroup Molecule - Section with title and list of toggleable items
 * Used for: MCP Servers, Edge Types, Confidence filters
 */

interface FilterItem {
  id: string;
  label: string;
  color?: string;
  lineStyle?: "solid" | "dashed" | "dotted";
  active?: boolean;
}

interface FilterGroupProps {
  title: string;
  items: FilterItem[];
  onToggle?: (id: string) => void;
  showIndicator?: "dot" | "line" | "none";
}

export default function FilterGroup({
  title,
  items,
  onToggle,
  showIndicator = "dot",
}: FilterGroupProps) {
  const isClickable = !!onToggle;

  return (
    <section class="mb-4">
      <h3
        class="text-xs font-semibold uppercase tracking-widest mb-3"
        style={{ color: "var(--text-dim)" }}
      >
        {title}
      </h3>
      {items.map((item) => (
        <div
          key={item.id}
          class={`flex items-center gap-2.5 py-1.5 px-3 -mx-3 rounded-lg transition-all duration-200 ${
            item.active === false ? "opacity-35" : ""
          } ${isClickable ? "cursor-pointer" : ""}`}
          onClick={() => onToggle?.(item.id)}
          onMouseOver={(e) =>
            isClickable && (e.currentTarget.style.background = "var(--accent-dim)")}
          onMouseOut={(e) => isClickable && (e.currentTarget.style.background = "transparent")}
        >
          {/* Indicator */}
          {showIndicator === "dot" && (
            <div
              class="w-3 h-3 rounded-full flex-shrink-0 transition-transform hover:scale-125"
              style={{ backgroundColor: item.color || "var(--text-dim)" }}
            />
          )}
          {showIndicator === "line" && (
            <div
              class="w-6 h-0.5 flex-shrink-0"
              style={{
                background: item.lineStyle === "solid"
                  ? (item.color || "var(--text-dim)")
                  : "transparent",
                borderTop: item.lineStyle !== "solid"
                  ? `2px ${item.lineStyle || "solid"} ${item.color || "var(--text-dim)"}`
                  : "none",
                opacity: item.lineStyle === "dotted" ? 0.5 : 1,
              }}
            />
          )}

          {/* Label */}
          <span class="text-sm" style={{ color: "var(--text-muted)" }}>
            {item.label}
          </span>
        </div>
      ))}
    </section>
  );
}
