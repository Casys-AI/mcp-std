import { JSX } from "preact";
import { cx } from "../utils";

export type SpinnerSize = "xs" | "sm" | "md" | "lg" | "xl" | "inherit";

export type SpinnerColorPalette = "blue" | "green" | "red" | "yellow" | "orange" | "purple" | "gray";

export interface SpinnerProps {
  size?: SpinnerSize;
  color?: string;
  colorPalette?: SpinnerColorPalette;
  borderWidth?: string;
  speed?: string;
  label?: string;
  className?: string;
  style?: JSX.CSSProperties;
  [key: string]: unknown;
}

const sizeStyles: Record<SpinnerSize, string> = {
  xs: "w-3 h-3",
  sm: "w-4 h-4",
  md: "w-6 h-6",
  lg: "w-8 h-8",
  xl: "w-12 h-12",
  inherit: "w-[1em] h-[1em]",
};

const colorPaletteMap: Record<SpinnerColorPalette, string> = {
  blue: "#3b82f6",
  green: "#22c55e",
  red: "#ef4444",
  yellow: "#eab308",
  orange: "#f97316",
  purple: "#a855f7",
  gray: "#6b7280",
};

export function Spinner({
  size = "md",
  color,
  colorPalette,
  borderWidth = "2px",
  speed = "0.65s",
  label = "Loading...",
  className,
  style,
  ...rest
}: SpinnerProps) {
  const resolvedColor = color || (colorPalette ? colorPaletteMap[colorPalette] : "currentColor");

  return (
    <span
      role="status"
      aria-label={label}
      className={cx(
        "inline-block rounded-full border-solid border-current animate-spin",
        "border-t-transparent border-r-transparent",
        sizeStyles[size],
        className
      )}
      style={{
        borderWidth,
        animationDuration: speed,
        color: resolvedColor,
        ...(style || {}),
      }}
      {...rest}
    >
      <span className="sr-only">{label}</span>
    </span>
  );
}

export type SpinnerProps_Alias = SpinnerProps;
