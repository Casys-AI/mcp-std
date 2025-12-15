/**
 * Sign In Route Handler
 *
 * GET /auth/signin
 *
 * Initiates GitHub OAuth flow using @deno/kv-oauth.
 * Redirects user to GitHub authorization page.
 *
 * @module web/routes/auth/signin
 */

import { signIn } from "../../../server/auth/oauth.ts";

export const handler = {
  /**
   * Handle sign in request
   * Redirects to GitHub OAuth authorization page
   */
  GET(ctx: { req: Request }) {
    return signIn(ctx.req);
  },
};
