/**
 * Utility functions for MCP Apps UI
 * Preact + Tailwind CSS stack
 */

/**
 * Combine class names (like clsx/cx)
 * Accepts any type for flexibility with Preact's Signalish types
 */
export function cx(
  ...classes: unknown[]
): string {
  return classes
    .filter((c): c is string => typeof c === "string" && c.length > 0)
    .join(" ");
}

/**
 * Format any value to string for display
 */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Format numbers with K/M/G suffixes
 */
export function formatNumber(value: number, unit?: string): string {
  let formatted: string;
  if (value >= 1_000_000_000) {
    formatted = (value / 1_000_000_000).toFixed(1) + "G";
  } else if (value >= 1_000_000) {
    formatted = (value / 1_000_000).toFixed(1) + "M";
  } else if (value >= 1_000) {
    formatted = (value / 1_000).toFixed(1) + "K";
  } else if (Number.isInteger(value)) {
    formatted = String(value);
  } else {
    formatted = value.toFixed(1);
  }
  return unit ? `${formatted}${unit}` : formatted;
}

/**
 * Format a percentage value
 */
export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
