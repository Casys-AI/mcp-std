/**
 * Shared Authentication Module
 *
 * Provides mode detection and validation helpers used by both:
 * - Fresh Dashboard (port 8080) - session-based auth
 * - API Server (port 3003) - API Key auth
 *
 * Mode Detection:
 * - Cloud mode: GITHUB_CLIENT_ID is set → full auth required
 * - Local mode: No GITHUB_CLIENT_ID → auth bypassed, user_id = "local"
 *
 * @module lib/auth
 */

import * as log from "@std/log";
import { getApiKeyPrefix, verifyApiKey } from "./api-key.ts";
import { getDb } from "../server/auth/db.ts";
import { users } from "../db/schema/users.ts";
import { eq } from "drizzle-orm";

/**
 * Check if user is in ALLOWED_GITHUB_USERS whitelist
 * If whitelist is not set or empty, all users are allowed.
 *
 * @param username - GitHub username to check
 * @returns true if allowed, false if blocked
 */
export function isUserAllowed(username: string | undefined): boolean {
  if (!username) return false;

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

/**
 * Check if running in cloud mode (multi-tenant with auth)
 * Cloud mode is enabled when GITHUB_CLIENT_ID is set.
 */
export function isCloudMode(): boolean {
  return !!Deno.env.get("GITHUB_CLIENT_ID");
}

/**
 * Get default user ID for local mode
 * Returns "local" in local mode, null in cloud mode (requires auth)
 */
export function getDefaultUserId(): string | null {
  return isCloudMode() ? null : "local";
}

/**
 * Auth result from request validation
 */
export interface AuthResult {
  user_id: string;
  username?: string;
}

/**
 * Validate request authentication
 * Used by API Server (port 3003) for MCP and API routes.
 *
 * Supports two auth methods:
 * 1. API Key header (x-api-key) - for PML package/CLI
 * 2. Session cookie - for dashboard (via getSessionFromRequest)
 *
 * @param req - HTTP Request
 * @returns AuthResult if valid, null if invalid/missing
 */
export async function validateRequest(
  req: Request,
): Promise<AuthResult | null> {
  // Local mode: bypass auth, return default user
  if (!isCloudMode()) {
    return { user_id: "local", username: "local" };
  }

  // Try API Key first (preferred for programmatic access)
  const apiKey = req.headers.get("x-api-key");
  if (apiKey) {
    const result = await validateApiKeyFromDb(apiKey);
    // Check whitelist even for API key auth
    if (result && !isUserAllowed(result.username)) {
      log.warn("API key user not in whitelist", { username: result.username });
      return null;
    }
    return result;
  }

  // Fallback to session cookie (for dashboard)
  try {
    const { getSessionFromRequest } = await import("../server/auth/session.ts");
    const session = await getSessionFromRequest(req);
    if (session) {
      // Check whitelist for session auth
      if (!isUserAllowed(session.username)) {
        log.warn("Session user not in whitelist", { username: session.username });
        return null;
      }
      return {
        user_id: session.userId,
        username: session.username,
      };
    }
  } catch (error) {
    log.debug("Session validation failed", { error });
  }

  log.debug("No valid auth found (no API key or session)");
  return null;
}

/**
 * Validate API Key against database
 * 1. Validate format (ac_ + 24 chars)
 * 2. Extract prefix for O(1) lookup
 * 3. Find user by prefix
 * 4. Verify full key against stored hash
 *
 * @param apiKey - Full API key (ac_xxx)
 * @returns AuthResult if valid, null if invalid
 */
export async function validateApiKeyFromDb(
  apiKey: string,
): Promise<AuthResult | null> {
  try {
    // Validate format before DB lookup (fail fast)
    if (!apiKey.startsWith("ac_") || apiKey.length !== 27) {
      log.debug("Invalid API key format");
      return null;
    }

    // Extract prefix for lookup
    const prefix = getApiKeyPrefix(apiKey);

    // Find user by prefix
    const db = await getDb();
    const result = await db
      .select()
      .from(users)
      .where(eq(users.apiKeyPrefix, prefix))
      .limit(1);

    if (result.length === 0) {
      log.debug("No user found for API key prefix");
      return null;
    }

    const user = result[0];

    // Verify full key against hash
    if (!user.apiKeyHash) {
      log.debug("User has no API key hash");
      return null;
    }

    const isValid = await verifyApiKey(apiKey, user.apiKeyHash);
    if (!isValid) {
      log.debug("API key verification failed");
      return null;
    }

    return {
      user_id: user.id,
      username: user.username,
    };
  } catch (error) {
    log.error("Error validating API key", { error });
    return null;
  }
}

/**
 * Log auth mode at startup
 * Call this from both servers during initialization.
 */
export function logAuthMode(serverName: string): void {
  const mode = isCloudMode() ? "CLOUD" : "LOCAL";
  log.info(`[${serverName}] Auth mode: ${mode}`);
  if (!isCloudMode()) {
    log.info(
      `[${serverName}] Running in local mode - auth bypassed, user_id = "local"`,
    );
  }
}

/**
 * Validate auth configuration at startup
 *
 * SECURITY: Prevents accidental deployment without authentication.
 * - Production (DENO_ENV=production): FAILS if no GITHUB_CLIENT_ID
 * - Development: Shows WARNING but allows startup
 *
 * @param serverName - Name of the server for logging
 * @throws Error in production if auth not configured
 */
export function validateAuthConfig(serverName: string): void {
  const isProduction = Deno.env.get("DENO_ENV") === "production";
  const hasAuth = isCloudMode();

  if (!hasAuth && isProduction) {
    const errorMsg = `
╔══════════════════════════════════════════════════════════════════════════════╗
║  🚨 SECURITY ERROR: REFUSING TO START IN PRODUCTION WITHOUT AUTHENTICATION  ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  DENO_ENV=production but GITHUB_CLIENT_ID is not set!                        ║
║                                                                              ║
║  This would expose ALL endpoints without any authentication.                 ║
║  Anyone could access the MCP gateway and filesystem.                         ║
║                                                                              ║
║  TO FIX:                                                                     ║
║  1. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .env.production         ║
║  2. Or remove DENO_ENV=production for local development                      ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
`;
    log.critical(errorMsg);
    console.error(errorMsg);
    throw new Error(
      `[${serverName}] SECURITY: Cannot start in production without authentication configured`,
    );
  }

  if (!hasAuth && !isProduction) {
    const warningMsg = `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  ⚠️  WARNING: RUNNING IN LOCAL MODE - NO AUTHENTICATION                      ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                                                                              ┃
┃  All endpoints are accessible without authentication.                        ┃
┃  This is OK for local development but NEVER deploy like this!                ┃
┃                                                                              ┃
┃  To enable auth: Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET               ┃
┃                                                                              ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
`;
    log.warn(warningMsg);
    console.warn(warningMsg);
  }
}

/**
 * User filter for data isolation queries
 * Story 9.5: Multi-tenant data isolation
 */
export interface UserFilter {
  /** WHERE clause fragment (e.g., "user_id = $1"), null if no filtering */
  where: string | null;
  /** Parameters for WHERE clause */
  params: string[];
}

/**
 * Build WHERE clause filter for user_id isolation (Story 9.5)
 *
 * Cloud mode: Returns SQL filter `user_id = $1` with user_id param
 * Local mode: Returns null (no filtering, all data visible)
 *
 * @param authResult - Authentication result (null if unauthenticated)
 * @returns UserFilter object with where clause and params
 *
 * @example
 * ```typescript
 * // Cloud mode
 * const filter = buildUserFilter({ user_id: "uuid-123", username: "alice" });
 * // filter.where = "user_id = $1"
 * // filter.params = ["uuid-123"]
 *
 * // Local mode
 * const filter = buildUserFilter({ user_id: "local", username: "local" });
 * // filter.where = null
 * // filter.params = []
 * ```
 */
export function buildUserFilter(authResult: AuthResult | null): UserFilter {
  // Local mode: no filtering (all executions visible)
  if (!isCloudMode() || !authResult || authResult.user_id === "local") {
    return { where: null, params: [] };
  }

  // Cloud mode: filter by user_id
  return {
    where: "user_id = $1",
    params: [authResult.user_id],
  };
}
