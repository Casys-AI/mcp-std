import { ComponentChildren, JSX } from "preact";
import { cx } from "../utils";

export type ProgressSize = "xs" | "sm" | "md" | "lg";
export type ProgressColorScheme = "blue" | "green" | "yellow" | "orange" | "red" | "purple";

export interface ProgressProps {
  value?: number;
  min?: number;
  max?: number;
  size?: ProgressSize;
  colorScheme?: ProgressColorScheme;
  /** Alias for colorScheme (backward compatibility) */
  colorPalette?: ProgressColorScheme;
  isIndeterminate?: boolean;
  children?: ComponentChildren;
  className?: string;
  [key: string]: unknown;
}

const sizeStyles: Record<ProgressSize, string> = {
  xs: "h-1",
  sm: "h-2",
  md: "h-3",
  lg: "h-4",
};

const colorStyles: Record<ProgressColorScheme, string> = {
  blue: "bg-blue-600",
  green: "bg-green-600",
  yellow: "bg-yellow-500",
  orange: "bg-orange-500",
  red: "bg-red-600",
  purple: "bg-purple-600",
};

export function Progress({
  value = 0,
  min = 0,
  max = 100,
  size = "md",
  colorScheme,
  colorPalette,
  isIndeterminate = false,
  className,
  children,
  ...rest
}: ProgressProps) {
  const color = (colorScheme || colorPalette || "blue") as ProgressColorScheme;
  const percentage = Math.min(Math.max(((value - min) / (max - min)) * 100, 0), 100);

  return (
    <div
      role="progressbar"
      aria-valuenow={isIndeterminate ? undefined : value}
      aria-valuemin={min}
      aria-valuemax={max}
      className={cx("w-full", className)}
      {...rest}
    >
      {children}
      <div
        className={cx(
          "w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden",
          sizeStyles[size]
        )}
      >
        <div
          className={cx(
            "h-full rounded-full transition-all duration-300 ease-out",
            colorStyles[color],
            isIndeterminate && "animate-progress-indeterminate"
          )}
          style={{
            width: isIndeterminate ? "30%" : `${percentage}%`,
          }}
        />
      </div>
    </div>
  );
}

// Sub-components for compound component API compatibility
export interface ProgressRootProps extends ProgressProps {}

export function Root(props: ProgressRootProps) {
  return <Progress {...props} />;
}

export interface ProgressTrackProps extends JSX.HTMLAttributes<HTMLDivElement> {
  size?: ProgressSize;
}

export function Track({ size = "md", className, children, ...rest }: ProgressTrackProps) {
  return (
    <div
      className={cx(
        "w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden",
        sizeStyles[size],
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface ProgressRangeProps extends JSX.HTMLAttributes<HTMLDivElement> {
  value?: number;
  colorScheme?: ProgressColorScheme;
}

export function Range({ value = 0, colorScheme = "blue", className, ...rest }: ProgressRangeProps) {
  return (
    <div
      className={cx(
        "h-full rounded-full transition-all duration-300 ease-out",
        colorStyles[colorScheme],
        className
      )}
      style={{ width: `${value}%` }}
      {...rest}
    />
  );
}

export interface ProgressLabelProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  children: ComponentChildren;
}

export function Label({ children, className, ...rest }: ProgressLabelProps) {
  return (
    <span className={cx("text-sm font-medium text-gray-700 dark:text-gray-200", className)} {...rest}>
      {children}
    </span>
  );
}

export interface ProgressValueTextProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  children?: ComponentChildren;
  value?: number;
}

export function ValueText({ children, value, className, ...rest }: ProgressValueTextProps) {
  return (
    <span className={cx("text-sm text-gray-600 dark:text-gray-300", className)} {...rest}>
      {children ?? `${value}%`}
    </span>
  );
}

// Circular progress components
export interface CircleProps extends JSX.HTMLAttributes<SVGSVGElement> {
  value?: number;
  size?: number;
  strokeWidth?: number;
  colorScheme?: ProgressColorScheme;
  children?: ComponentChildren;
}

export function Circle({
  value = 0,
  size = 48,
  strokeWidth = 4,
  colorScheme = "blue",
  className,
  children,
  ...rest
}: CircleProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cx("transform -rotate-90", className)}
      {...rest}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-gray-200 dark:text-gray-700"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className={cx(
          "transition-all duration-300 ease-out",
          colorScheme === "blue" && "text-blue-600",
          colorScheme === "green" && "text-green-600",
          colorScheme === "yellow" && "text-yellow-500",
          colorScheme === "red" && "text-red-600",
          colorScheme === "purple" && "text-purple-600"
        )}
      />
      {children}
    </svg>
  );
}

export function CircleTrack(props: JSX.HTMLAttributes<SVGCircleElement>) {
  return <circle {...props} />;
}

export function CircleRange(props: JSX.HTMLAttributes<SVGCircleElement>) {
  return <circle {...props} />;
}

export function View({ children, className, ...rest }: JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("flex items-center gap-2", className)} {...rest}>
      {children}
    </div>
  );
}

export type RootProps = ProgressRootProps;
