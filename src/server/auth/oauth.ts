/**
 * OAuth Configuration for GitHub Authentication
 *
 * Uses @deno/kv-oauth for:
 * - Built-in CSRF protection via state parameter (AC #7)
 * - PKCE flow support
 * - Session management with Deno KV
 *
 * IMPORTANT: Uses lazy initialization to avoid requiring env vars at module load.
 * This allows tests to import the module without setting GITHUB_CLIENT_ID/SECRET.
 *
 * @module server/auth/oauth
 */

import { createGitHubOAuthConfig, createHelpers, type Tokens } from "@deno/kv-oauth";

/**
 * Re-export types for use in route handlers
 */
export type { Tokens } from "@deno/kv-oauth";

/**
 * OAuth helpers type definition
 */
interface OAuthHelpers {
  signIn: (request: Request) => Promise<Response>;
  handleCallback: (request: Request) => Promise<{
    response: Response;
    tokens: Tokens;
    sessionId: string;
  }>;
  signOut: (request: Request) => Promise<Response>;
  getSessionId: (request: Request) => Promise<string | undefined>;
}

// Lazy-initialized helpers (created on first use)
let _helpers: OAuthHelpers | null = null;

/**
 * Get OAuth helpers, lazily initializing on first call.
 * This pattern avoids requiring env vars at module load time.
 */
function getHelpers(): OAuthHelpers {
  if (!_helpers) {
    const oauthConfig = createGitHubOAuthConfig({
      scope: ["read:user", "user:email"],
    });
    _helpers = createHelpers(oauthConfig);
  }
  return _helpers;
}

/**
 * Initiate OAuth sign-in flow.
 * Redirects user to GitHub authorization page.
 */
export function signIn(request: Request): Promise<Response> {
  return getHelpers().signIn(request);
}

/**
 * Handle OAuth callback from GitHub.
 * Validates state/code and returns tokens + session ID.
 */
export function handleCallback(request: Request): Promise<{
  response: Response;
  tokens: Tokens;
  sessionId: string;
}> {
  return getHelpers().handleCallback(request);
}

/**
 * Sign out user and destroy OAuth session.
 */
export function signOut(request: Request): Promise<Response> {
  return getHelpers().signOut(request);
}

/**
 * Get session ID from request cookies.
 */
export function getSessionId(request: Request): Promise<string | undefined> {
  return getHelpers().getSessionId(request);
}
