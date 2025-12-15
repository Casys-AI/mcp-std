/**
 * Session Management for OAuth Authentication
 *
 * Stores user sessions in Deno KV with TTL.
 * Also provides flash session for one-time API key display.
 *
 * @module server/auth/session
 */

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days (AC #4)
const FLASH_TTL_MS = 5 * 60 * 1000; // 5 minutes for API key flash

/**
 * User session data stored in Deno KV
 */
export interface Session {
  userId: string;
  username: string;
  avatarUrl?: string;
  createdAt: number;
}

/**
 * Create a new session in Deno KV
 *
 * @param kv - Deno KV instance
 * @param sessionId - Session ID from OAuth flow
 * @param user - Session data to store
 */
export async function createSession(
  kv: Deno.Kv,
  sessionId: string,
  user: Session,
): Promise<void> {
  await kv.set(["sessions", sessionId], user, { expireIn: SESSION_TTL_MS });
}

/**
 * Get session from Deno KV
 *
 * @param kv - Deno KV instance
 * @param sessionId - Session ID to retrieve
 * @returns Session data or null if not found/expired
 */
export async function getSession(
  kv: Deno.Kv,
  sessionId: string,
): Promise<Session | null> {
  const result = await kv.get<Session>(["sessions", sessionId]);
  return result.value;
}

/**
 * Destroy a session (for logout)
 *
 * @param kv - Deno KV instance
 * @param sessionId - Session ID to destroy
 */
export async function destroySession(
  kv: Deno.Kv,
  sessionId: string,
): Promise<void> {
  await kv.delete(["sessions", sessionId]);
}

/**
 * Store API key in flash session (shown once to user)
 * Expires after 5 minutes for security.
 *
 * @param kv - Deno KV instance
 * @param sessionId - Session ID to associate flash with
 * @param apiKey - Full API key to store temporarily
 */
export async function setFlashApiKey(
  kv: Deno.Kv,
  sessionId: string,
  apiKey: string,
): Promise<void> {
  await kv.set(["flash_api_key", sessionId], apiKey, {
    expireIn: FLASH_TTL_MS,
  });
}

/**
 * Peek at flash API key without consuming it.
 * Key remains available until TTL expires (5 minutes).
 * Use this for displaying the key on Settings page.
 *
 * @param kv - Deno KV instance
 * @param sessionId - Session ID to retrieve flash from
 * @returns API key if available, null otherwise
 */
export async function peekFlashApiKey(
  kv: Deno.Kv,
  sessionId: string,
): Promise<string | null> {
  const result = await kv.get<string>(["flash_api_key", sessionId]);
  return result.value;
}

/**
 * Get and consume flash API key (returns null if already consumed)
 * This ensures the API key is shown only once.
 * Use this when you want to explicitly invalidate the flash key.
 *
 * @param kv - Deno KV instance
 * @param sessionId - Session ID to retrieve flash from
 * @returns API key if available, null otherwise
 */
export async function consumeFlashApiKey(
  kv: Deno.Kv,
  sessionId: string,
): Promise<string | null> {
  const result = await kv.get<string>(["flash_api_key", sessionId]);
  if (result.value) {
    await kv.delete(["flash_api_key", sessionId]);
  }
  return result.value;
}

/**
 * Get session from request cookie
 * Combines getSessionId from OAuth and getSession to provide complete flow.
 *
 * @param req - HTTP Request object
 * @returns Session data or null if not authenticated
 */
export async function getSessionFromRequest(
  req: Request,
): Promise<Session | null> {
  const { getSessionId } = await import("./oauth.ts");
  const { getKv } = await import("./kv.ts");
  const sessionId = await getSessionId(req);
  if (!sessionId) return null;

  const kv = await getKv();
  return await getSession(kv, sessionId);
}
