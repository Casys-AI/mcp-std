/**
 * Rate Limiter Utility
 *
 * Implements a sliding window rate limiter to prevent MCP server overload
 * by limiting the number of requests per time window per server.
 *
 * @module utils/rate-limiter
 */

/**
 * Rate limiter using sliding window algorithm
 *
 * Tracks requests per server ID and enforces a maximum request rate
 * to prevent overwhelming MCP servers.
 *
 * Features:
 * - Per-server rate limiting
 * - Sliding window for smooth rate enforcement
 * - Automatic cleanup of old timestamps
 * - Backoff waiting when limit exceeded
 */
export class RateLimiter {
  private requestCounts = new Map<string, number[]>();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  /**
   * Create a new rate limiter
   *
   * @param maxRequests - Maximum number of requests allowed per window (default: 10)
   * @param windowMs - Time window in milliseconds (default: 1000ms / 1 second)
   *
   * @example
   * ```typescript
   * const limiter = new RateLimiter(10, 1000); // 10 requests per second
   * ```
   */
  constructor(maxRequests: number = 10, windowMs: number = 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * Check if request is allowed for the given server
   *
   * Returns true if the request can proceed, false if rate limit exceeded.
   * Automatically cleans up old request timestamps outside the window.
   *
   * @param serverId - ID of the server to check rate limit for
   * @returns true if request is allowed, false if rate limit exceeded
   *
   * @example
   * ```typescript
   * if (await rateLimiter.checkLimit("filesystem-server")) {
   *   // Execute request
   * } else {
   *   // Rate limit exceeded, wait or skip
   * }
   * ```
   */
  async checkLimit(serverId: string): Promise<boolean> {
    const now = Date.now();
    const requests = this.requestCounts.get(serverId) || [];

    // Remove old requests outside the sliding window
    const validRequests = requests.filter((time) => now - time < this.windowMs);

    if (validRequests.length >= this.maxRequests) {
      return false; // Rate limit exceeded
    }

    // Add current request timestamp
    validRequests.push(now);
    this.requestCounts.set(serverId, validRequests);

    return true;
  }

  /**
   * Wait until request slot is available (with backoff)
   *
   * Blocks until a request can be made within the rate limit.
   * Uses exponential backoff to avoid busy-waiting.
   *
   * @param serverId - ID of the server to wait for
   *
   * @example
   * ```typescript
   * await rateLimiter.waitForSlot("github-server");
   * // Now safe to execute request
   * ```
   */
  async waitForSlot(serverId: string): Promise<void> {
    let retries = 0;
    const baseDelay = 100; // Start with 100ms delay

    while (!(await this.checkLimit(serverId))) {
      // Exponential backoff: 100ms, 200ms, 400ms, 800ms, then cap at 1000ms
      const delay = Math.min(baseDelay * Math.pow(2, retries), 1000);
      await new Promise((resolve) => setTimeout(resolve, delay));
      retries++;
    }
  }

  /**
   * Clear rate limit history for a specific server
   *
   * Useful for testing or resetting state.
   *
   * @param serverId - ID of the server to clear
   */
  clear(serverId: string): void {
    this.requestCounts.delete(serverId);
  }

  /**
   * Clear all rate limit history
   */
  clearAll(): void {
    this.requestCounts.clear();
  }

  /**
   * Get current request count for a server
   *
   * Returns the number of requests made within the current window.
   *
   * @param serverId - ID of the server to check
   * @returns Number of requests in current window
   */
  getCurrentCount(serverId: string): number {
    const now = Date.now();
    const requests = this.requestCounts.get(serverId) || [];
    return requests.filter((time) => now - time < this.windowMs).length;
  }
}
