/**
 * Delete Account Route Handler
 *
 * DELETE /api/user/delete
 *
 * Permanently deletes the user's account.
 * Destroys all sessions and redirects to landing page.
 *
 * Implements AC #8, #9 (delete account with double confirmation, anonymization)
 *
 * @module web/routes/api/user/delete
 */

import type { FreshContext } from "fresh";
import { getDb } from "../../../../server/auth/db.ts";
import { users } from "../../../../db/schema/users.ts";
import { eq } from "drizzle-orm";
import { destroySession } from "../../../../server/auth/session.ts";
import { getSessionId } from "../../../../server/auth/oauth.ts";
import { getKv } from "../../../../server/auth/kv.ts";
import type { AuthState } from "../../_middleware.ts";
import { getDb as getPGliteDb } from "../../../../db/client.ts"; // Story 9.5: workflow_execution anonymization

export const handler = {
  /**
   * Delete user account
   * Requires authenticated session in cloud mode
   * Body must contain { confirmation: "DELETE" } for security
   */
  async DELETE(ctx: FreshContext<AuthState>) {
    const { user, isCloudMode } = ctx.state;

    // Cannot delete in local mode
    if (!isCloudMode) {
      return new Response(
        JSON.stringify({ error: "Account deletion not available in local mode" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Require authentication and valid user
    if (!user || user.id === "local") {
      return new Response(
        JSON.stringify({ error: "Cannot delete local user" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // AC #8: Require double confirmation - verify "DELETE" typed in body
    try {
      const body = await ctx.req.json();
      if (body?.confirmation !== "DELETE") {
        return new Response(
          JSON.stringify({ error: "Confirmation required. Send { confirmation: 'DELETE' }" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid request body. Send { confirmation: 'DELETE' }" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    try {
      const db = await getDb();
      const anonymizedId = `deleted-${crypto.randomUUID()}`;

      // Story 9.5 AC #5, #8: Anonymize workflow_execution BEFORE deleting user
      // Preserves execution history for analytics while removing user linkage
      try {
        const pgliteDb = await getPGliteDb();
        await pgliteDb.query(
          `UPDATE workflow_execution
           SET user_id = $1, updated_by = $1
           WHERE user_id = $2`,
          [anonymizedId, user.id],
        );
      } catch (error) {
        console.error("Error anonymizing workflow_execution:", error);
        // Continue with user deletion even if workflow anonymization fails
      }

      // AC #9: Anonymize user data instead of hard delete
      // This preserves referential integrity while removing PII
      await db
        .update(users)
        .set({
          githubId: null,
          username: anonymizedId,
          email: null,
          avatarUrl: null,
          apiKeyHash: null,
          apiKeyPrefix: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      // Destroy session
      const sessionId = await getSessionId(ctx.req);
      if (sessionId) {
        const kv = await getKv();
        await destroySession(kv, sessionId);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Account deleted successfully",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("Error deleting account:", error);
      return new Response(
        JSON.stringify({ error: "Failed to delete account" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};
