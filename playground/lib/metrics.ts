/**
 * Metrics Visualization Helpers for Casys PML Playground
 *
 * ASCII-based metrics display for Jupyter notebooks.
 * Shows progress bars, metric comparisons, and speedup charts.
 *
 * @module playground/lib/metrics
 */

// ============================================================================
// Types
// ============================================================================

export interface ProgressBarOptions {
  /** Width of the progress bar in characters (default: 20) */
  width?: number;
  /** Show percentage (default: true) */
  showPercent?: boolean;
  /** Use ANSI colors (default: false for Jupyter compatibility) */
  colors?: boolean;
  /** Filled character (default: "█") */
  filledChar?: string;
  /** Empty character (default: "░") */
  emptyChar?: string;
}

export interface CompareMetricsOptions {
  /** Labels for before/after columns */
  labels?: { before: string; after: string };
  /** Use ANSI colors for improvements/regressions (default: false) */
  colors?: boolean;
  /** Show percentage change (default: true) */
  showPercent?: boolean;
}

export interface SpeedupChartOptions {
  /** Width of the bars in characters (default: 30) */
  width?: number;
  /** Use ANSI colors (default: false) */
  colors?: boolean;
  /** Unit for time display (default: "ms") */
  unit?: string;
}

// ============================================================================
// ANSI Color Codes
// ============================================================================

const ANSI = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
};

/**
 * Detect if we're in a Jupyter environment (colors should be disabled)
 */
export function isJupyter(): boolean {
  try {
    // @ts-ignore - Deno.jupyter exists in Jupyter runtime
    return typeof Deno !== "undefined" && Deno.jupyter !== undefined;
  } catch {
    // Deno.jupyter throws when accessed outside jupyter subcommand
    return false;
  }
}

/**
 * Apply ANSI color if enabled
 */
function colorize(text: string, color: string, useColors: boolean): string {
  if (!useColors) return text;
  return `${color}${text}${ANSI.reset}`;
}

// ============================================================================
// Exports
// ============================================================================

/**
 * Generate an ASCII progress bar
 *
 * @param current - Current value
 * @param total - Total value
 * @param label - Optional label to display
 * @param options - Display options
 * @returns Formatted progress bar string
 *
 * @example
 * ```typescript
 * console.log(progressBar(66, 100, "Loading"));
 * // [████████████░░░░░░░░] 66% Loading
 * ```
 */
export function progressBar(
  current: number,
  total: number,
  label?: string,
  options?: ProgressBarOptions,
): string {
  const width = options?.width ?? 20;
  const showPercent = options?.showPercent ?? true;
  const colors = options?.colors ?? false;
  const filledChar = options?.filledChar ?? "█";
  const emptyChar = options?.emptyChar ?? "░";

  // Calculate percentage (handle edge cases)
  let percent = total === 0 ? 0 : (current / total) * 100;
  percent = Math.max(0, Math.min(100, percent)); // Clamp to 0-100

  // Calculate filled width
  const filledWidth = Math.round((percent / 100) * width);
  const emptyWidth = width - filledWidth;

  // Build bar
  const filled = filledChar.repeat(filledWidth);
  const empty = emptyChar.repeat(emptyWidth);

  // Color the bar based on progress
  let bar = `[${filled}${empty}]`;
  if (colors) {
    if (percent >= 100) {
      bar = colorize(bar, ANSI.green, true);
    } else if (percent >= 50) {
      bar = colorize(bar, ANSI.cyan, true);
    } else {
      bar = colorize(bar, ANSI.yellow, true);
    }
  }

  // Build output
  const parts = [bar];
  if (showPercent) {
    parts.push(`${Math.round(percent)}%`);
  }
  if (label) {
    parts.push(label);
  }

  return parts.join(" ");
}

/**
 * Generate a side-by-side metric comparison table
 *
 * @param before - Metrics before (key-value pairs)
 * @param after - Metrics after (key-value pairs)
 * @param options - Display options
 * @returns Formatted comparison table string
 *
 * @example
 * ```typescript
 * console.log(compareMetrics(
 *   { tokens: 45000, latency: 2500 },
 *   { tokens: 12000, latency: 1800 },
 *   { labels: { before: "Without Gateway", after: "With Gateway" } }
 * ));
 * ```
 */
export function compareMetrics(
  before: Record<string, number>,
  after: Record<string, number>,
  options?: CompareMetricsOptions,
): string {
  const labels = options?.labels ?? { before: "Before", after: "After" };
  const colors = options?.colors ?? false;
  const showPercent = options?.showPercent ?? true;

  // Get all keys
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];

  // Calculate column widths
  const metricWidth = Math.max(8, ...keys.map((k) => k.length));
  const valueWidth = 12;
  const deltaWidth = showPercent ? 16 : 12;

  // Build header
  const lines: string[] = [];
  const header = [
    "Metric".padEnd(metricWidth),
    labels.before.padStart(valueWidth),
    labels.after.padStart(valueWidth),
    "Delta".padStart(deltaWidth),
  ].join(" │ ");

  const separator = "─".repeat(header.length);

  lines.push(separator);
  lines.push(header);
  lines.push(separator);

  // Build rows
  for (const key of keys) {
    const beforeVal = before[key] ?? 0;
    const afterVal = after[key] ?? 0;
    const delta = afterVal - beforeVal;
    const percentChange = beforeVal === 0 ? 0 : (delta / beforeVal) * 100;

    // Format delta string
    let deltaStr = delta >= 0 ? `+${delta}` : `${delta}`;
    if (showPercent && beforeVal !== 0) {
      const sign = percentChange >= 0 ? "+" : "";
      deltaStr += ` (${sign}${percentChange.toFixed(1)}%)`;
    }

    // Color based on improvement (lower is usually better for metrics like latency/tokens)
    if (colors) {
      if (delta < 0) {
        deltaStr = colorize(deltaStr, ANSI.green, true); // Improvement
      } else if (delta > 0) {
        deltaStr = colorize(deltaStr, ANSI.red, true); // Regression
      }
    }

    const row = [
      key.padEnd(metricWidth),
      formatNumber(beforeVal).padStart(valueWidth),
      formatNumber(afterVal).padStart(valueWidth),
      deltaStr.padStart(deltaWidth),
    ].join(" │ ");

    lines.push(row);
  }

  lines.push(separator);

  return lines.join("\n");
}

/**
 * Generate a speedup visualization chart
 *
 * @param sequential - Time for sequential execution
 * @param parallel - Time for parallel execution
 * @param options - Display options
 * @returns Formatted speedup chart string
 *
 * @example
 * ```typescript
 * console.log(speedupChart(2500, 1800));
 * // Sequential: [██████████████████████████████] 2500ms
 * // Parallel:   [█████████████████████░░░░░░░░░] 1800ms
 * //
 * // Speedup: 1.39x faster
 * // Time saved: 700ms (28%)
 * ```
 */
export function speedupChart(
  sequential: number,
  parallel: number,
  options?: SpeedupChartOptions,
): string {
  const width = options?.width ?? 30;
  const colors = options?.colors ?? false;
  const unit = options?.unit ?? "ms";

  // Calculate speedup
  const speedup = parallel === 0 ? Infinity : sequential / parallel;
  const timeSaved = sequential - parallel;
  const percentSaved = sequential === 0 ? 0 : (timeSaved / sequential) * 100;

  // Calculate bar widths (sequential is always full width)
  const maxTime = Math.max(sequential, parallel);
  const seqWidth = maxTime === 0 ? 0 : Math.round((sequential / maxTime) * width);
  const parWidth = maxTime === 0 ? 0 : Math.round((parallel / maxTime) * width);

  // Build bars
  const seqBar = "█".repeat(seqWidth) + "░".repeat(width - seqWidth);
  const parBar = "█".repeat(parWidth) + "░".repeat(width - parWidth);

  // Build output
  const lines: string[] = [];

  // Sequential line
  let seqLine = `Sequential: [${seqBar}] ${formatNumber(sequential)}${unit}`;
  if (colors) {
    seqLine = colorize(seqLine, ANSI.dim, true);
  }
  lines.push(seqLine);

  // Parallel line
  let parLine = `Parallel:   [${parBar}] ${formatNumber(parallel)}${unit}`;
  if (colors && parallel < sequential) {
    parLine = colorize(parLine, ANSI.green, true);
  }
  lines.push(parLine);

  lines.push("");

  // Speedup summary
  let speedupStr: string;
  if (speedup === Infinity) {
    speedupStr = "Speedup: ∞ (parallel = 0)";
  } else if (speedup >= 1) {
    speedupStr = `Speedup: ${speedup.toFixed(2)}x faster`;
  } else {
    speedupStr = `Slowdown: ${(1 / speedup).toFixed(2)}x slower`;
  }
  if (colors && speedup > 1) {
    speedupStr = colorize(speedupStr, ANSI.green + ANSI.bold, true);
  }
  lines.push(speedupStr);

  // Time saved
  if (timeSaved > 0) {
    let savedStr = `Time saved: ${formatNumber(timeSaved)}${unit} (${percentSaved.toFixed(0)}%)`;
    if (colors) {
      savedStr = colorize(savedStr, ANSI.cyan, true);
    }
    lines.push(savedStr);
  } else if (timeSaved < 0) {
    let lostStr = `Time lost: ${formatNumber(Math.abs(timeSaved))}${unit} (${
      Math.abs(percentSaved).toFixed(0)
    }%)`;
    if (colors) {
      lostStr = colorize(lostStr, ANSI.red, true);
    }
    lines.push(lostStr);
  }

  return lines.join("\n");
}

/**
 * Generate a simple metric summary line
 *
 * @param label - Metric label
 * @param value - Metric value
 * @param unit - Optional unit
 * @param options - Display options
 * @returns Formatted metric line
 *
 * @example
 * ```typescript
 * console.log(metricLine("Tokens saved", 33000, "tokens"));
 * // Tokens saved: 33,000 tokens
 * ```
 */
export function metricLine(
  label: string,
  value: number,
  unit?: string,
  options?: { colors?: boolean; positive?: boolean },
): string {
  const colors = options?.colors ?? false;
  const positive = options?.positive ?? true;

  let line = `${label}: ${formatNumber(value)}`;
  if (unit) {
    line += ` ${unit}`;
  }

  if (colors) {
    line = colorize(line, positive ? ANSI.green : ANSI.red, true);
  }

  return line;
}

/**
 * Generate a reduction summary (e.g., "25 tools → 3 tools = 88% reduction")
 *
 * @param before - Value before
 * @param after - Value after
 * @param unit - Unit label
 * @param options - Display options
 * @returns Formatted reduction string
 *
 * @example
 * ```typescript
 * console.log(reductionSummary(25, 3, "tools"));
 * // 25 tools → 3 tools = 88% reduction
 * ```
 */
export function reductionSummary(
  before: number,
  after: number,
  unit: string,
  options?: { colors?: boolean },
): string {
  const colors = options?.colors ?? false;
  const reduction = before === 0 ? 0 : ((before - after) / before) * 100;

  let line = `${before} ${unit} → ${after} ${unit} = ${reduction.toFixed(0)}% reduction`;

  if (colors && reduction > 0) {
    line = colorize(line, ANSI.green, true);
  }

  return line;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format a number with thousands separators
 */
function formatNumber(num: number): string {
  if (Number.isInteger(num)) {
    return num.toLocaleString("en-US");
  }
  return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// ============================================================================
// CLI Entry Point
// ============================================================================

if (import.meta.main) {
  console.log("🎯 Metrics Visualization Demo\n");

  // Progress bar demo
  console.log("=== Progress Bars ===\n");
  console.log(progressBar(0, 100, "Starting"));
  console.log(progressBar(33, 100, "Loading"));
  console.log(progressBar(66, 100, "Processing"));
  console.log(progressBar(100, 100, "Complete"));
  console.log(progressBar(150, 100, "Overflow"));

  // Compare metrics demo
  console.log("\n=== Metric Comparison ===\n");
  console.log(compareMetrics(
    { tokens: 45000, latency: 2500, tools: 25 },
    { tokens: 12000, latency: 1800, tools: 3 },
    { labels: { before: "Without Gateway", after: "With Gateway" } },
  ));

  // Speedup chart demo
  console.log("\n=== Speedup Chart ===\n");
  console.log(speedupChart(2500, 1800));

  // Reduction summary
  console.log("\n=== Reduction Summary ===\n");
  console.log(reductionSummary(25, 3, "tools"));
  console.log(reductionSummary(45000, 12000, "tokens"));
}
