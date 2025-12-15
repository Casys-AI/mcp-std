/**
 * GradientBar Atom - Color gradient legend for heatmap visualization
 * Holten paper: shows edge density color mapping
 */

interface GradientBarProps {
  colors: string[];
  labels?: [string, string];
  height?: number;
}

export default function GradientBar({
  colors,
  labels = ["low", "high"],
  height = 8,
}: GradientBarProps) {
  const gradientStyle = colors.length > 0
    ? `linear-gradient(to right, ${colors.join(", ")})`
    : "var(--bg)";

  return (
    <div class="w-full">
      <div
        class="w-full rounded-sm"
        style={{
          height: `${height}px`,
          background: gradientStyle,
        }}
      />
      {labels && (
        <div class="flex justify-between mt-1">
          <span
            class="text-[9px] uppercase tracking-wide"
            style={{ color: "var(--text-dim)" }}
          >
            {labels[0]}
          </span>
          <span
            class="text-[9px] uppercase tracking-wide"
            style={{ color: "var(--text-dim)" }}
          >
            {labels[1]}
          </span>
        </div>
      )}
    </div>
  );
}
