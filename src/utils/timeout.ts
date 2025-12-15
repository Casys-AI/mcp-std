/**
 * Timeout Utility
 *
 * Provides a generic timeout wrapper for async operations to prevent
 * hanging indefinitely and ensure responsive error handling.
 *
 * @module utils/timeout
 */

import { TimeoutError } from "../errors/error-types.ts";

/**
 * Execute operation with timeout
 *
 * Races the provided operation against a timeout. If the operation
 * doesn't complete within the timeout period, throws a TimeoutError.
 *
 * @param operation - Promise to execute with timeout
 * @param timeoutMs - Timeout in milliseconds (default: 30000ms / 30s)
 * @param operationName - Human-readable name for the operation (for error messages)
 * @returns Result of the operation if completed within timeout
 * @throws TimeoutError if operation exceeds timeout
 *
 * @example
 * ```typescript
 * // Basic usage
 * const result = await withTimeout(
 *   client.callTool("slow-tool", args),
 *   30000,
 *   "slow-tool execution"
 * );
 *
 * // With custom timeout
 * const data = await withTimeout(
 *   fetch("https://api.example.com/data"),
 *   5000,
 *   "API fetch"
 * );
 * ```
 */
export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  operationName: string,
): Promise<T> {
  let timeoutId: number | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(operationName, timeoutMs));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([operation, timeoutPromise]);
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    return result;
  } catch (error) {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    throw error;
  }
}
