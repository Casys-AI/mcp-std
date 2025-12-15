/**
 * API Key Regeneration Route Handler
 *
 * POST /auth/regenerate
 *
 * Invalidates old API key and generates a new one.
 * User must be authenticated via session.
 * New key is shown ONCE and never retrievable afterward.
 *
 * Implements AC #6 (regenerate invalidates old key and generates new one)
 *
 * @module web/routes/auth/regenerate
 */

import { getDb } from "../../../server/auth/db.ts";
import { getSessionFromRequest, setFlashApiKey } from "../../../server/auth/session.ts";
import { getSessionId } from "../../../server/auth/oauth.ts";
import { getKv } from "../../../server/auth/kv.ts";
import { users } from "../../../db/schema/users.ts";
import { generateApiKey, hashApiKey } from "../../../lib/api-key.ts";
import { eq } from "drizzle-orm";

export const handler = {
  /**
   * Handle API key regeneration
   * Requires authenticated session
   */
  async POST(ctx: { req: Request }) {
    // 1. Verify session exists (authentication check)
    const session = await getSessionFromRequest(ctx.req);
    if (!session) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // 2. Generate new API Key
    const { key, prefix } = generateApiKey();
    const keyHash = await hashApiKey(key);

    // 3. Update user in database (invalidates old key by replacing hash/prefix)
    const db = await getDb();
    await db
      .update(users)
      .set({
        apiKeyHash: keyHash,
        apiKeyPrefix: prefix,
        apiKeyCreatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, session.userId));

    // 4. Store key in flash session for Settings page display
    const sessionId = await getSessionId(ctx.req);
    if (sessionId) {
      const kv = await getKv();
      await setFlashApiKey(kv, sessionId, key);
    }

    // 5. Return new key (shown ONCE - never retrievable after this response)
    return new Response(
      JSON.stringify({
        key,
        prefix,
        message: "API Key regenerated. Save this key - it won't be shown again.",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  },
};
