/**
 * Sign Out Route Handler
 *
 * GET /auth/signout
 *
 * Destroys the OAuth session and redirects to landing page (AC #5).
 *
 * @module web/routes/auth/signout
 */

import { getSessionId, signOut } from "../../../server/auth/oauth.ts";
import { destroySession } from "../../../server/auth/session.ts";
import { getKv } from "../../../server/auth/kv.ts";

export const handler = {
  /**
   * Handle sign out request
   * Destroys session in Deno KV and OAuth tokens, redirects to landing
   */
  async GET(ctx: { req: Request }) {
    try {
      // Get session ID before signOut clears it
      const sessionId = await getSessionId(ctx.req);

      // Destroy our custom session in Deno KV
      if (sessionId) {
        const kv = await getKv();
        await destroySession(kv, sessionId);
      }

      // Let kv-oauth handle the OAuth session cleanup and redirect
      return signOut(ctx.req);
    } catch (error) {
      console.error("[Signout] Error:", error);

      // Redirect to landing page anyway
      return new Response(null, {
        status: 302,
        headers: { Location: "/" },
      });
    }
  },
};
