/**
 * Slider Atom - Interactive range slider for numeric values
 * Used for Holten paper controls: straightening, smoothing
 */

interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  showValue?: boolean;
  onChange: (value: number) => void;
}

export default function Slider({
  value,
  min = 0,
  max = 1,
  step = 0.01,
  label,
  showValue = true,
  onChange,
}: SliderProps) {
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div class="w-full">
      {label && (
        <div class="flex justify-between items-center mb-1">
          <span
            class="text-[10px] uppercase tracking-wide"
            style={{ color: "var(--text-dim)" }}
          >
            {label}
          </span>
          {showValue && (
            <span
              class="text-[10px] font-semibold tabular-nums"
              style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}
            >
              {value.toFixed(2)}
            </span>
          )}
        </div>
      )}
      <div class="relative h-4 flex items-center">
        {/* Track background */}
        <div
          class="absolute inset-x-0 h-1 rounded-full"
          style={{ background: "var(--bg)" }}
        />
        {/* Filled track */}
        <div
          class="absolute left-0 h-1 rounded-full"
          style={{
            width: `${percentage}%`,
            background: "var(--accent)",
          }}
        />
        {/* Input (invisible but interactive) - z-10 ensures it's above visual elements */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onInput={(e) => onChange(parseFloat((e.target as HTMLInputElement).value))}
          class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          style={{ margin: 0 }}
        />
        {/* Thumb indicator */}
        <div
          class="absolute w-3 h-3 rounded-full border-2 pointer-events-none"
          style={{
            left: `calc(${percentage}% - 6px)`,
            background: "var(--bg-elevated)",
            borderColor: "var(--accent)",
          }}
        />
      </div>
    </div>
  );
}
