/**
 * Shared micro-interactions for MCP Apps UIs - Tailwind CSS version
 *
 * Provides consistent hover, focus, and transition effects
 * across all components following the design patterns.
 *
 * @module lib/std/src/ui/shared/interactions
 */

/**
 * Micro-interactions for interactive elements (Tailwind classes)
 */
export const interactive = {
  /** Subtle scale effect for buttons, badges, chips */
  scaleOnHover: "transition-transform duration-150 ease-out cursor-pointer hover:scale-[1.02] active:scale-[0.98]",

  /** Larger scale effect for small elements (thumbs, dots, icons) */
  scaleOnHoverLarge: "transition-transform duration-100 ease-out cursor-pointer hover:scale-[1.15]",

  /** Focus ring for keyboard navigation */
  focusRing: "focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30",

  /** Row hover for tables and lists */
  rowHover: "transition-colors duration-150 cursor-pointer hover:bg-bg-subtle",

  /** Selected row state */
  rowSelected: "bg-blue-50 hover:bg-blue-100 dark:bg-blue-950 dark:hover:bg-blue-900",

  /** Card with shadow on hover */
  cardHover: "transition-all duration-200 hover:shadow-lg hover:-translate-y-px",

  /** Clickable element base */
  clickable: "cursor-pointer select-none transition-opacity duration-150 hover:opacity-80 active:opacity-60",
};

/**
 * Status badge styles with semi-transparent backgrounds (Tailwind classes)
 */
export const statusStyles = {
  success: "text-green-600 bg-green-500/15 dark:text-green-400 dark:bg-green-500/20",
  warning: "text-yellow-600 bg-yellow-500/15 dark:text-yellow-400 dark:bg-yellow-500/20",
  error: "text-red-600 bg-red-500/15 dark:text-red-400 dark:bg-red-500/20",
  info: "text-blue-600 bg-blue-500/15 dark:text-blue-400 dark:bg-blue-500/20",
  neutral: "text-gray-600 bg-gray-500/10 dark:text-gray-400 dark:bg-gray-500/15",
};

/**
 * Value transitions for animated numbers (gauges, progress)
 */
export const valueTransition = "transition-all duration-500 ease-out";

/**
 * Typography scale for visual hierarchy (Tailwind classes)
 */
export const typography = {
  /** Section titles */
  sectionTitle: "text-lg font-semibold text-fg-default",

  /** Primary labels */
  label: "text-sm font-medium text-fg-default",

  /** Large metric values */
  value: "text-2xl font-bold font-mono tabular-nums",

  /** Small metric values */
  valueSmall: "text-lg font-semibold font-mono tabular-nums",

  /** Secondary/muted text */
  muted: "text-xs text-fg-muted",

  /** Amounts and currencies */
  amount: "text-sm font-mono tabular-nums",
};

/**
 * Common container styles (Tailwind classes)
 */
export const containers = {
  /** Base container for UI components */
  root: "p-4 font-sans text-sm text-fg-default bg-bg-canvas",

  /** Card-like container with subtle background */
  card: "p-4 bg-bg-subtle rounded-lg border border-border-default",

  /** Centered content container */
  centered: "flex items-center justify-center p-10 text-fg-muted",
};
