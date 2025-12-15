/**
 * Sentry Integration Module
 *
 * Provides error tracking and performance monitoring for Casys PML
 *
 * @module telemetry/sentry
 */

import * as Sentry from "@sentry/deno";
import * as log from "@std/log";

/**
 * Get git commit hash for release tracking
 */
async function getGitCommit(): Promise<string | undefined> {
  try {
    const command = new Deno.Command("git", {
      args: ["rev-parse", "--short", "HEAD"],
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stdout } = await command.output();

    if (code === 0) {
      return new TextDecoder().decode(stdout).trim();
    }
  } catch {
    // Git not available or not a git repo
  }

  return undefined;
}

/**
 * Initialize Sentry error tracking and performance monitoring
 *
 * Call this at application startup before any other code runs
 */
export async function initSentry(): Promise<void> {
  const dsn = Deno.env.get("SENTRY_DSN");

  if (!dsn) {
    log.info("Sentry disabled (SENTRY_DSN not set)");
    return;
  }

  const environment = Deno.env.get("SENTRY_ENVIRONMENT") || "development";
  const release = Deno.env.get("SENTRY_RELEASE") || await getGitCommit();
  const tracesSampleRate = parseFloat(
    Deno.env.get("SENTRY_TRACES_SAMPLE_RATE") || "0.1",
  );

  Sentry.init({
    dsn,
    environment,
    release: release ? `casys-pml@${release}` : undefined,
    tracesSampleRate,

    // Filter events before sending
    beforeSend(event) {
      // Add custom filtering logic here if needed
      // For example, filter out specific errors or add custom context

      // Don't send events in test environment
      if (Deno.env.get("DENO_TESTING") === "true") {
        return null;
      }

      return event;
    },

    // Configure breadcrumbs
    maxBreadcrumbs: 100,
  });

  log.info(
    `Sentry initialized: env=${environment}, release=${release}, sampleRate=${tracesSampleRate}`,
  );
}

/**
 * Capture an error with optional context
 *
 * @example
 * ```ts
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   captureError(error, {
 *     operation: "mcp_tool_call",
 *     tool: "filesystem:read_file",
 *     server_id: "filesystem"
 *   });
 *   throw error;
 * }
 * ```
 */
export function captureError(
  error: Error,
  context?: Record<string, unknown>,
): void {
  Sentry.withScope((scope) => {
    if (context) {
      // Set tags for filtering in Sentry UI
      const tags = extractTags(context);
      Object.entries(tags).forEach(([key, value]) => {
        scope.setTag(key, value);
      });

      // Set extra context for debugging
      const extra = extractExtra(context);
      Object.entries(extra).forEach(([key, value]) => {
        scope.setContext(key, value as Record<string, unknown>);
      });
    }

    Sentry.captureException(error);
  });
}

/**
 * Start a performance span and execute callback
 *
 * This uses Sentry's recommended `startSpan` API which automatically sends
 * performance data to Sentry.
 *
 * @example
 * ```ts
 * await startSpan("mcp.tools.call", "mcp", async (span) => {
 *   span.setAttribute("tool", "filesystem:read_file");
 *   await performOperation();
 * });
 * ```
 */
export async function startSpan<T>(
  name: string,
  op: string,
  callback: (span: Sentry.Span) => Promise<T> | T,
): Promise<T> {
  return await Sentry.startSpan({ name, op }, callback);
}

/**
 * Start a performance span (wrapper interface for backward compatibility)
 *
 * Returns a span-like object that collects metadata and creates a real Sentry span on finish().
 * For new code, prefer using `startSpan()` with a callback instead.
 *
 * @example
 * ```ts
 * const span = startTransaction("mcp.tools.call", "mcp");
 * span.setTag("tool", "filesystem:read_file");
 * try {
 *   await performOperation();
 *   span.finish();
 * } catch (error) {
 *   span.finish();
 *   throw error;
 * }
 * ```
 */
export function startTransaction(
  name: string,
  op: string,
): SpanWrapper {
  return new SpanWrapper(name, op);
}

/**
 * Span wrapper for compatibility with legacy transaction API
 *
 * Collects attributes and creates a Sentry span when finish() is called.
 */
class SpanWrapper {
  private attributes: Record<string, string | number | boolean> = {};
  private startTime: number = Date.now();

  constructor(
    private name: string,
    private op: string,
  ) {}

  setTag(key: string, value: string): void {
    this.attributes[key] = value;
  }

  setData(key: string, value: unknown): void {
    // Only store primitive values that Sentry accepts
    if (
      typeof value === "string" || typeof value === "number" ||
      typeof value === "boolean"
    ) {
      this.attributes[key] = value;
    } else {
      // Convert complex values to JSON string
      this.attributes[key] = JSON.stringify(value);
    }
  }

  finish(): void {
    const duration = Date.now() - this.startTime;

    // Use startSpan to create a proper transaction
    Sentry.startSpan(
      {
        name: this.name,
        op: this.op,
        attributes: {
          ...this.attributes as Record<string, string | number | boolean>,
          duration_ms: duration,
        },
      },
      () => {
        // Span automatically finishes when callback completes
      },
    );
  }
}

/**
 * Add a breadcrumb for debugging context
 *
 * Breadcrumbs help trace the steps leading to an error
 *
 * @example
 * ```ts
 * addBreadcrumb("mcp", "Connecting to server", { server_id: "filesystem" });
 * addBreadcrumb("dag", "Executing layer", { layer: 1, tasks: 3 });
 * ```
 */
export function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>,
  level: Sentry.SeverityLevel = "info",
): void {
  Sentry.addBreadcrumb({
    category,
    message,
    level,
    data,
    timestamp: Date.now() / 1000,
  });
}

/**
 * Set user context for the current scope
 *
 * NOTE: Do NOT include PII (email, name, etc.) without user consent
 *
 * @example
 * ```ts
 * setUser({ id: "user-123" });
 * ```
 */
export function setUser(user: { id: string; [key: string]: unknown }): void {
  Sentry.setUser(user);
}

/**
 * Clear user context
 */
export function clearUser(): void {
  Sentry.setUser(null);
}

/**
 * Flush pending events to Sentry
 *
 * Call this before application shutdown to ensure all events are sent
 *
 * @param timeout - Maximum time to wait in milliseconds (default: 2000ms)
 */
export async function flushSentry(timeout = 2000): Promise<boolean> {
  return await Sentry.close(timeout);
}

/**
 * Extract tags from context (for filtering in Sentry UI)
 *
 * Tags should be low-cardinality strings (server_id, tool_type, etc.)
 */
function extractTags(
  context: Record<string, unknown>,
): Record<string, string> {
  const tags: Record<string, string> = {};

  // Known tag fields
  const tagFields = [
    "server_id",
    "tool",
    "operation",
    "environment",
    "cache_hit",
    "pii_detected",
  ];

  for (const field of tagFields) {
    if (field in context) {
      const value = context[field];
      if (typeof value === "string" || typeof value === "boolean") {
        tags[field] = String(value);
      }
    }
  }

  return tags;
}

/**
 * Extract extra context (for debugging details)
 *
 * Extra can be high-cardinality data (DAG structure, error details, etc.)
 */
function extractExtra(
  context: Record<string, unknown>,
): Record<string, unknown> {
  const extra: Record<string, unknown> = {};

  // Exclude tag fields (already set as tags)
  const excludeFields = new Set([
    "server_id",
    "tool",
    "operation",
    "environment",
    "cache_hit",
    "pii_detected",
  ]);

  for (const [key, value] of Object.entries(context)) {
    if (!excludeFields.has(key)) {
      extra[key] = value;
    }
  }

  return extra;
}
