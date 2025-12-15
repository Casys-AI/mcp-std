/**
 * Algorithm Feedback Route Handler (Story 7.6 - ADR-039)
 *
 * POST /api/algorithm-feedback
 *
 * Allows frontend to update trace outcomes when user interacts with suggestions.
 * This enables feedback loop for algorithm tuning.
 *
 * @module web/routes/api/algorithm-feedback
 */

import type { Context } from "fresh";
import { getDb } from "../../../db/client.ts";
import { AlgorithmTracer, type UserAction } from "../../../telemetry/algorithm-tracer.ts";
import type { AuthState } from "../_middleware.ts";

/**
 * Request body schema
 */
interface FeedbackRequest {
  traceId: string;
  userAction: UserAction;
  executionSuccess?: boolean;
  durationMs?: number;
}

/**
 * Validate user action
 */
function isValidUserAction(action: unknown): action is UserAction {
  return action === "selected" || action === "ignored" || action === "explicit_rejection";
}

export const handler = {
  /**
   * Update algorithm trace outcome
   *
   * Body:
   * - traceId: UUID of the trace to update
   * - userAction: "selected" | "ignored" | "explicit_rejection"
   * - executionSuccess?: boolean (optional, for "selected" actions)
   * - durationMs?: number (optional, execution duration)
   *
   * Protection: In cloud mode, requires authenticated user (AC6)
   */
  async POST(ctx: Context<AuthState>) {
    const { user, isCloudMode } = ctx.state;

    // AC6: Protected by auth in cloud mode
    if (isCloudMode && (!user || user.id === "local")) {
      return new Response(
        JSON.stringify({ error: "Authentication required in cloud mode" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    try {
      const body = await ctx.req.json() as Partial<FeedbackRequest>;

      // Validate required fields
      if (!body.traceId || typeof body.traceId !== "string") {
        return new Response(
          JSON.stringify({ error: "traceId is required and must be a string" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (!isValidUserAction(body.userAction)) {
        return new Response(
          JSON.stringify({
            error: "userAction must be 'selected', 'ignored', or 'explicit_rejection'",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(body.traceId)) {
        return new Response(
          JSON.stringify({ error: "traceId must be a valid UUID" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Get DB and tracer
      const db = await getDb();
      const tracer = new AlgorithmTracer(db);

      // Update outcome
      await tracer.updateOutcome(body.traceId, {
        userAction: body.userAction,
        executionSuccess: body.executionSuccess,
        durationMs: body.durationMs,
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: "Feedback recorded",
          traceId: body.traceId,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("Error recording algorithm feedback:", error);

      // Handle JSON parse errors
      if (error instanceof SyntaxError) {
        return new Response(
          JSON.stringify({ error: "Invalid JSON body" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return new Response(
        JSON.stringify({ error: "Failed to record feedback" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },

  /**
   * Get algorithm metrics
   *
   * Query params:
   * - windowHours: number (default: 24)
   * - mode: "active_search" | "passive_suggestion" (optional filter)
   *
   * Protection: In cloud mode, requires authenticated user
   */
  async GET(ctx: Context<AuthState>) {
    const { user, isCloudMode } = ctx.state;

    // Protected in cloud mode (metrics are sensitive data)
    if (isCloudMode && (!user || user.id === "local")) {
      return new Response(
        JSON.stringify({ error: "Authentication required in cloud mode" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    try {
      const url = new URL(ctx.req.url);
      const windowHoursParam = url.searchParams.get("windowHours");
      const modeParam = url.searchParams.get("mode");

      const windowHours = windowHoursParam ? parseInt(windowHoursParam, 10) : 24;

      // Validate windowHours
      if (isNaN(windowHours) || windowHours < 1 || windowHours > 168) {
        return new Response(
          JSON.stringify({ error: "windowHours must be between 1 and 168" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Validate mode if provided
      const validModes = ["active_search", "passive_suggestion"];
      if (modeParam && !validModes.includes(modeParam)) {
        return new Response(
          JSON.stringify({
            error: "mode must be 'active_search' or 'passive_suggestion'",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const db = await getDb();
      const tracer = new AlgorithmTracer(db);

      const metrics = await tracer.getMetrics(
        windowHours,
        modeParam as "active_search" | "passive_suggestion" | undefined,
      );

      return new Response(
        JSON.stringify({
          success: true,
          windowHours,
          mode: modeParam || "all",
          metrics,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("Error getting algorithm metrics:", error);
      return new Response(
        JSON.stringify({ error: "Failed to get metrics" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};
