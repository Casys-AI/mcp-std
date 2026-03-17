/**
 * StatusBadge - Enhanced badge with status-specific styling
 *
 * Uses Tailwind CSS with semi-transparent background colors
 * matching the design patterns.
 *
 * @module lib/std/src/ui/shared/StatusBadge
 */

import { ComponentChildren } from "preact";
import { cx } from "../components/utils";
import { interactive } from "./interactions";

export type StatusVariant = "success" | "warning" | "error" | "info" | "neutral";

export interface StatusBadgeProps {
  /** Status determines the color scheme */
  status: StatusVariant;
  /** Badge content */
  children: ComponentChildren;
  /** Optional icon to display before text */
  icon?: ComponentChildren;
  /** Enable hover scale effect */
  interactive?: boolean;
  /** Additional CSS classes */
  className?: string;
}

const statusStyles: Record<StatusVariant, string> = {
  success: "text-green-600 bg-green-500/15 dark:text-green-400 dark:bg-green-500/20",
  warning: "text-yellow-600 bg-yellow-500/15 dark:text-yellow-400 dark:bg-yellow-500/20",
  error: "text-red-600 bg-red-500/15 dark:text-red-400 dark:bg-red-500/20",
  info: "text-blue-600 bg-blue-500/15 dark:text-blue-400 dark:bg-blue-500/20",
  neutral: "text-gray-600 bg-gray-500/10 dark:text-gray-400 dark:bg-gray-500/15",
};

const baseStyle = "inline-flex items-center gap-1 font-medium px-2 py-1 rounded-md text-xs";

export function StatusBadge({
  status,
  icon,
  interactive: isInteractive = false,
  children,
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cx(
        baseStyle,
        statusStyles[status],
        isInteractive && interactive.scaleOnHover,
        className
      )}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </span>
  );
}

/**
 * Status icons for common use cases
 */
export const StatusIcons = {
  success: "\u2713",
  warning: "\u26A0",
  error: "\u2717",
  info: "i",
  neutral: "\u2022",
} as const;
