/**
 * API Key Info Route Handler
 *
 * GET /api/user/api-key
 *
 * Returns the user's API key prefix (not the full key).
 * Used by Settings page to display masked key.
 *
 * @module web/routes/api/user/api-key
 */

import type { FreshContext } from "fresh";
import { getDb } from "../../../../server/auth/db.ts";
import { users } from "../../../../db/schema/users.ts";
import { eq } from "drizzle-orm";
import type { AuthState } from "../../_middleware.ts";

export const handler = {
  /**
   * Get API key prefix for authenticated user
   */
  async GET(ctx: FreshContext<AuthState>) {
    const { user, isCloudMode } = ctx.state;

    // Not available in local mode
    if (!isCloudMode) {
      return new Response(
        JSON.stringify({ error: "API keys not available in local mode" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Require authentication
    if (!user || user.id === "local") {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    try {
      const db = await getDb();
      const result = await db
        .select({ prefix: users.apiKeyPrefix, createdAt: users.apiKeyCreatedAt })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);

      if (result.length === 0) {
        return new Response(
          JSON.stringify({ error: "User not found" }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return new Response(
        JSON.stringify({
          prefix: result[0].prefix,
          createdAt: result[0].createdAt?.toISOString() ?? null,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("Error fetching API key info:", error);
      return new Response(
        JSON.stringify({ error: "Internal server error" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};
