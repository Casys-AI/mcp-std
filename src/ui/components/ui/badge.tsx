import { ComponentChildren } from "preact";
import { cx } from "../utils";

export type BadgeVariant = "subtle" | "solid" | "outline";
export type BadgeSize = "sm" | "md" | "lg";
export type BadgeColorScheme = "gray" | "red" | "orange" | "amber" | "yellow" | "green" | "teal" | "blue" | "purple";

export interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  colorScheme?: BadgeColorScheme;
  /** Alias for colorScheme (backward compatibility) */
  colorPalette?: BadgeColorScheme;
  children: ComponentChildren;
  className?: string;
  [key: string]: unknown;
}

const sizeStyles: Record<BadgeSize, string> = {
  sm: "px-1.5 py-0.5 text-xs",
  md: "px-2 py-0.5 text-xs",
  lg: "px-2.5 py-1 text-sm",
};

const colorStyles: Record<BadgeColorScheme, Record<BadgeVariant, string>> = {
  gray: {
    subtle: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
    solid: "bg-gray-600 text-white",
    outline: "border border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-300",
  },
  red: {
    subtle: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200",
    solid: "bg-red-600 text-white",
    outline: "border border-red-300 text-red-700 dark:border-red-600 dark:text-red-300",
  },
  orange: {
    subtle: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-200",
    solid: "bg-orange-600 text-white",
    outline: "border border-orange-300 text-orange-700 dark:border-orange-600 dark:text-orange-300",
  },
  amber: {
    subtle: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
    solid: "bg-amber-600 text-white",
    outline: "border border-amber-300 text-amber-700 dark:border-amber-600 dark:text-amber-300",
  },
  yellow: {
    subtle: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-200",
    solid: "bg-yellow-600 text-white",
    outline: "border border-yellow-300 text-yellow-700 dark:border-yellow-600 dark:text-yellow-300",
  },
  green: {
    subtle: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200",
    solid: "bg-green-600 text-white",
    outline: "border border-green-300 text-green-700 dark:border-green-600 dark:text-green-300",
  },
  teal: {
    subtle: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-200",
    solid: "bg-teal-600 text-white",
    outline: "border border-teal-300 text-teal-700 dark:border-teal-600 dark:text-teal-300",
  },
  blue: {
    subtle: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200",
    solid: "bg-blue-600 text-white",
    outline: "border border-blue-300 text-blue-700 dark:border-blue-600 dark:text-blue-300",
  },
  purple: {
    subtle: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-200",
    solid: "bg-purple-600 text-white",
    outline: "border border-purple-300 text-purple-700 dark:border-purple-600 dark:text-purple-300",
  },
};

export function Badge({
  variant = "subtle",
  size = "md",
  colorScheme,
  colorPalette,
  children,
  className,
  ...rest
}: BadgeProps) {
  const color = (colorScheme || colorPalette || "gray") as BadgeColorScheme;
  return (
    <span
      className={cx(
        "inline-flex items-center font-medium rounded-md whitespace-nowrap",
        sizeStyles[size],
        colorStyles[color][variant],
        className
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

export type BadgeProps_Alias = BadgeProps;
