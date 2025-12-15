/**
 * Rate Limiter Helpers
 *
 * Provides utilities for generating rate limiting keys based on auth mode
 * and configuration.
 *
 * Cloud mode: Rate limiting per user_id
 * Local mode: Configurable (disabled, IP-based, or shared)
 *
 * @module lib/rate-limiter-helpers
 */

import type { AuthResult } from "./auth.ts";

/**
 * Generate rate limiting key based on auth result and mode
 *
 * Determines the appropriate rate limiting key based on:
 * - Authentication result (cloud vs local user)
 * - Environment configuration (RATE_LIMIT_LOCAL_MODE)
 * - Client IP address (fallback for IP-based limiting)
 *
 * @param authResult - Result from authentication (null if unauthenticated)
 * @param ip - Client IP address (optional, used in local IP mode)
 * @returns Rate limiting key string
 *
 * @example
 * ```typescript
 * // Cloud mode (authenticated user)
 * const key1 = getRateLimitKey({ user_id: "uuid-123", username: "alice" });
 * // Returns: "user:uuid-123"
 *
 * // Local mode (disabled - default)
 * const key2 = getRateLimitKey({ user_id: "local" });
 * // Returns: "local:shared"
 *
 * // Local mode (IP-based)
 * Deno.env.set("RATE_LIMIT_LOCAL_MODE", "ip");
 * const key3 = getRateLimitKey({ user_id: "local" }, "192.168.1.1");
 * // Returns: "ip:192.168.1.1"
 * ```
 */
export function getRateLimitKey(
  authResult: AuthResult | null,
  ip?: string,
): string {
  // Cloud mode: use user_id for per-user rate limiting
  if (authResult && authResult.user_id !== "local") {
    return `user:${authResult.user_id}`;
  }

  // Local mode: check configuration
  const localMode = Deno.env.get("RATE_LIMIT_LOCAL_MODE") || "disabled";

  if (localMode === "disabled") {
    // Default: all local requests share one counter
    return "local:shared";
  } else if (localMode === "ip" && ip) {
    // IP-based rate limiting
    return `ip:${ip}`;
  }

  // Fallback to shared if IP mode enabled but no IP provided
  return "local:shared";
}
