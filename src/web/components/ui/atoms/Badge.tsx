/**
 * Badge Atom - Colored indicator dot with optional label
 * Used for: MCP server indicators, status badges
 */

interface BadgeProps {
  color: string;
  label?: string;
  active?: boolean;
  onClick?: () => void;
  class?: string;
}

export default function Badge(
  { color, label, active = true, onClick, class: className }: BadgeProps,
) {
  const isClickable = !!onClick;

  return (
    <div
      class={`flex items-center gap-2.5 py-2 px-3 -mx-3 rounded-lg transition-all duration-200 ${
        !active ? "opacity-35" : ""
      } ${isClickable ? "cursor-pointer" : ""} ${className || ""}`}
      onClick={onClick}
      onMouseOver={(e) => isClickable && (e.currentTarget.style.background = "var(--accent-dim)")}
      onMouseOut={(e) => isClickable && (e.currentTarget.style.background = "transparent")}
    >
      <div
        class="w-3 h-3 rounded-full transition-all duration-200 hover:scale-125 flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      {label && (
        <span class="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
      )}
    </div>
  );
}
