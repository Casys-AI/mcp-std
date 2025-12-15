/**
 * OAuth Callback Route Handler
 *
 * GET /auth/callback
 *
 * Processes GitHub OAuth callback:
 * 1. Validates OAuth state/code (CSRF protection via kv-oauth)
 * 2. Fetches GitHub user profile + primary email
 * 3. Upserts user in database
 * 4. Generates API key for new users
 * 5. Creates session in Deno KV with 30-day TTL
 * 6. Redirects to dashboard
 *
 * Implements AC #3 (callback creates/updates user), AC #4 (session with 30-day TTL)
 *
 * @module web/routes/auth/callback
 */

import { handleCallback } from "../../../server/auth/oauth.ts";
import { getDb } from "../../../server/auth/db.ts";
import { getKv } from "../../../server/auth/kv.ts";
import { users } from "../../../db/schema/users.ts";
import { generateApiKey, hashApiKey } from "../../../lib/api-key.ts";
import { createSession, setFlashApiKey } from "../../../server/auth/session.ts";
import { eq } from "drizzle-orm";

/**
 * GitHub user profile from /user API
 */
interface GitHubUser {
  id: number;
  login: string;
  email: string | null;
  avatar_url: string;
}

/**
 * GitHub email from /user/emails API
 */
interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

/**
 * Check if user is allowed based on whitelist
 * If ALLOWED_GITHUB_USERS is not set or empty, all users are allowed
 *
 * @param username - GitHub username to check
 * @returns true if allowed, false if blocked
 */
function isUserAllowed(username: string): boolean {
  const allowedUsers = Deno.env.get("ALLOWED_GITHUB_USERS");

  // If not set or empty, allow all users
  if (!allowedUsers || allowedUsers.trim() === "") {
    return true;
  }

  // Parse comma-separated list and check membership
  const whitelist = allowedUsers
    .split(",")
    .map((u) => u.trim().toLowerCase())
    .filter((u) => u.length > 0);

  return whitelist.includes(username.toLowerCase());
}

export const handler = {
  /**
   * Handle OAuth callback from GitHub
   */
  async GET(ctx: { req: Request }) {
    try {
      // 1. Handle OAuth callback - get tokens and session ID
      const { response, tokens, sessionId } = await handleCallback(ctx.req);

      // 2. Fetch GitHub user profile + primary email in parallel
      const [ghUser, ghEmail] = await Promise.all([
        fetchGitHubUser(tokens.accessToken),
        fetchGitHubPrimaryEmail(tokens.accessToken),
      ]);

      // 2.5. Check whitelist (if configured)
      if (!isUserAllowed(ghUser.login)) {
        console.warn(`[OAuth] User ${ghUser.login} not in whitelist, access denied`);
        return new Response(null, {
          status: 302,
          headers: {
            Location: "/auth/signin?error=not_allowed",
          },
        });
      }

      // 3. Upsert user in database
      const db = await getDb();
      let userRows = await db
        .select()
        .from(users)
        .where(eq(users.githubId, ghUser.id.toString()))
        .limit(1);

      let isNewUser = false;
      const kv = await getKv();

      if (userRows.length === 0) {
        // First login: create user + generate API Key
        const { key, prefix } = generateApiKey();
        const keyHash = await hashApiKey(key);

        await db.insert(users).values({
          githubId: ghUser.id.toString(),
          username: ghUser.login,
          email: ghEmail,
          avatarUrl: ghUser.avatar_url,
          apiKeyHash: keyHash,
          apiKeyPrefix: prefix,
          apiKeyCreatedAt: new Date(),
        });

        isNewUser = true;

        // Refetch user to get generated ID
        userRows = await db
          .select()
          .from(users)
          .where(eq(users.githubId, ghUser.id.toString()))
          .limit(1);

        // Store API key in flash session (NOT in URL for security)
        await setFlashApiKey(kv, sessionId, key);
      } else {
        // Returning user: update profile if changed
        await db
          .update(users)
          .set({
            username: ghUser.login,
            email: ghEmail || userRows[0].email,
            avatarUrl: ghUser.avatar_url,
            updatedAt: new Date(),
          })
          .where(eq(users.githubId, ghUser.id.toString()));
      }

      // 4. Create session in Deno KV with 30-day TTL (AC #4)
      await createSession(kv, sessionId, {
        userId: userRows[0].id,
        username: userRows[0].username,
        avatarUrl: userRows[0].avatarUrl ?? undefined,
        createdAt: Date.now(),
      });

      // 5. Redirect to dashboard
      const redirectUrl = isNewUser ? "/dashboard?welcome=1" : "/dashboard";

      // Merge OAuth response headers with our redirect
      const headers = new Headers(response.headers);
      headers.set("Location", redirectUrl);

      return new Response(null, {
        status: 302,
        headers,
      });
    } catch (error) {
      console.error("[OAuth Callback] Error:", error);

      // Redirect to signin with error parameter
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/auth/signin?error=callback_failed",
        },
      });
    }
  },
};

/**
 * Fetch GitHub user profile
 *
 * @param accessToken - OAuth access token
 * @returns GitHub user profile
 */
async function fetchGitHubUser(accessToken: string): Promise<GitHubUser> {
  const resp = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "CasysPML-OAuth",
    },
  });
  if (!resp.ok) {
    throw new Error(`Failed to fetch GitHub user: ${resp.status}`);
  }
  return resp.json();
}

/**
 * Fetch primary verified email from GitHub
 * Requires user:email scope.
 *
 * @param accessToken - OAuth access token
 * @returns Primary verified email or null
 */
async function fetchGitHubPrimaryEmail(accessToken: string): Promise<string | null> {
  const resp = await fetch("https://api.github.com/user/emails", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "CasysPML-OAuth",
    },
  });
  if (!resp.ok) {
    return null;
  }
  const emails: GitHubEmail[] = await resp.json();
  const primary = emails.find((e) => e.primary && e.verified);
  return primary?.email ?? null;
}
