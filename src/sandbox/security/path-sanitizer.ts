/**
 * Path Sanitizer
 *
 * Sanitizes file paths and error messages to prevent information leakage.
 *
 * @module sandbox/security/path-sanitizer
 */

/**
 * Path Sanitizer
 *
 * Provides utilities to sanitize file paths, error messages, and stack traces
 * to prevent sensitive information leakage (e.g., host file paths, usernames).
 */
export class PathSanitizer {
  /**
   * Sanitize error message to remove host file paths
   *
   * Replaces absolute paths with generic markers to prevent information leakage.
   *
   * @param message - Raw error message
   * @returns Sanitized error message
   */
  sanitizeErrorMessage(message: string): string {
    return message
      .replace(/\/[^\s]+\/sandbox-[^\s]+\.ts/g, "<temp-file>")
      .replace(/[A-Z]:\\[^\s]+\\sandbox-[^\s]+\.ts/g, "<temp-file>")
      .replace(/\/home\/[^\/]+/g, "<home>")
      .replace(/[A-Z]:\\Users\\[^\\]+/g, "<home>");
  }

  /**
   * Sanitize stack trace to remove host file paths
   *
   * @param stack - Raw stack trace
   * @returns Sanitized stack trace
   */
  sanitizeStackTrace(stack?: string): string | undefined {
    if (!stack) return undefined;
    return this.sanitizeErrorMessage(stack);
  }

  /**
   * Sanitize file path for logging (remove sensitive parts)
   *
   * @param path - File path
   * @returns Sanitized path suitable for logging
   */
  sanitizePath(path: string): string {
    return path
      .replace(/\/home\/[^\/]+/g, "~")
      .replace(/[A-Z]:\\Users\\[^\\]+/g, "~");
  }
}

/**
 * Singleton instance for convenience
 */
export const pathSanitizer = new PathSanitizer();
