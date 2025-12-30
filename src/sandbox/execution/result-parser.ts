/**
 * Result Parser
 *
 * Parses subprocess output and errors from sandbox execution.
 *
 * @module sandbox/execution/result-parser
 */

import type { StructuredError } from "../types.ts";
import { pathSanitizer } from "../security/path-sanitizer.ts";

/**
 * Marker string used to identify results in subprocess output
 */
export const RESULT_MARKER = "__SANDBOX_RESULT__:";

/**
 * Parsed output from subprocess
 */
export interface ParsedOutput {
  result: unknown;
  memoryUsedMb?: number;
}

/**
 * Result Parser
 *
 * Handles parsing of subprocess stdout and error classification.
 */
export class ResultParser {
  /**
   * Parse subprocess output to extract result
   *
   * Looks for the result marker in stdout and parses the JSON payload.
   *
   * @param stdout - Raw stdout from subprocess
   * @returns Parsed result
   * @throws Error if result cannot be parsed or user code failed
   */
  parseOutput(stdout: string): ParsedOutput {
    const resultMatch = stdout.match(new RegExp(`${RESULT_MARKER}(.*)`));

    if (!resultMatch) {
      throw new Error("PARSE_ERROR: No result marker found in output");
    }

    try {
      const resultJson = JSON.parse(resultMatch[1]);

      if (!resultJson.success) {
        const error = resultJson.error;
        throw new Error(`USER_ERROR: ${JSON.stringify(error)}`);
      }

      return {
        result: resultJson.result,
      };
    } catch (parseError) {
      if (parseError instanceof Error && parseError.message.startsWith("USER_ERROR")) {
        throw parseError;
      }
      throw new Error(`PARSE_ERROR: Failed to parse result JSON: ${parseError}`);
    }
  }

  /**
   * Parse error into structured format
   *
   * Categorizes errors by type and sanitizes error messages to prevent
   * information leakage (e.g., host file paths).
   *
   * @param error - Raw error from execution
   * @param config - Configuration with timeout and memory limit
   * @returns Structured error object
   */
  parseError(
    error: unknown,
    config: { timeout: number; memoryLimit: number },
  ): StructuredError {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Timeout error
    if (errorMessage.includes("TIMEOUT")) {
      return {
        type: "TimeoutError",
        message: `Execution exceeded timeout of ${config.timeout}ms`,
      };
    }

    // Memory error (OOM)
    if (
      errorMessage.toLowerCase().includes("out of memory") ||
      errorMessage.toLowerCase().includes("heap limit") ||
      errorMessage.includes("max-old-space-size")
    ) {
      return {
        type: "MemoryError",
        message: `Memory limit of ${config.memoryLimit}MB exceeded`,
      };
    }

    // Permission error (security event)
    if (
      errorMessage.includes("PermissionDenied") ||
      errorMessage.includes("NotCapable") ||
      errorMessage.includes("Requires") ||
      errorMessage.includes("--allow-") ||
      errorMessage.toLowerCase().includes("permission")
    ) {
      return {
        type: "PermissionError",
        message: pathSanitizer.sanitizeErrorMessage(errorMessage),
      };
    }

    // User code error (syntax or runtime)
    if (errorMessage.includes("USER_ERROR")) {
      try {
        const userError = JSON.parse(errorMessage.replace("USER_ERROR: ", ""));
        return {
          type: userError.type === "SyntaxError" ? "SyntaxError" : "RuntimeError",
          message: userError.message,
          stack: pathSanitizer.sanitizeStackTrace(userError.stack),
        };
      } catch {
        return {
          type: "RuntimeError",
          message: pathSanitizer.sanitizeErrorMessage(errorMessage),
        };
      }
    }

    // Subprocess error
    if (errorMessage.includes("SUBPROCESS_ERROR")) {
      const cleanMessage = errorMessage.replace("SUBPROCESS_ERROR: ", "");

      if (
        cleanMessage.includes("SyntaxError") ||
        cleanMessage.includes("Unexpected token") ||
        cleanMessage.includes("Unexpected identifier") ||
        cleanMessage.includes("Unexpected end of input") ||
        cleanMessage.includes("Invalid or unexpected token")
      ) {
        return {
          type: "SyntaxError",
          message: pathSanitizer.sanitizeErrorMessage(cleanMessage),
        };
      }

      return {
        type: "RuntimeError",
        message: pathSanitizer.sanitizeErrorMessage(cleanMessage),
      };
    }

    // Generic runtime error
    return {
      type: "RuntimeError",
      message: pathSanitizer.sanitizeErrorMessage(errorMessage),
      stack: error instanceof Error
        ? pathSanitizer.sanitizeStackTrace(error.stack)
        : undefined,
    };
  }

  /**
   * Classify Worker error type from message patterns
   *
   * @param error - Error object with type and message
   * @returns Classified error with potentially updated type
   */
  classifyWorkerError(error: StructuredError): StructuredError {
    if (error.type !== "RuntimeError") {
      return error;
    }

    const msg = error.message.toLowerCase();

    // Detect permission errors from message patterns
    if (
      msg.includes("permission") ||
      msg.includes("permissiondenied") ||
      msg.includes("notcapable") ||
      (msg.includes("requires") && msg.includes("access"))
    ) {
      return { ...error, type: "PermissionError" };
    }

    // Detect syntax errors from message patterns
    if (
      msg.includes("unexpected") ||
      msg.includes("parse error") ||
      msg.includes("syntax") ||
      msg.includes("invalid or unexpected token")
    ) {
      return { ...error, type: "SyntaxError" };
    }

    return error;
  }
}

/**
 * Singleton instance for convenience
 */
export const resultParser = new ResultParser();
