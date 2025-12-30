/**
 * Code Wrapper
 *
 * Wraps user code for sandbox execution with context injection.
 *
 * @module sandbox/tools/code-wrapper
 */

import { RESULT_MARKER } from "../execution/result-parser.ts";

/**
 * Code Wrapper
 *
 * Handles wrapping user code in execution wrapper with context injection.
 */
export class CodeWrapper {
  /**
   * Wrap user code in execution wrapper
   *
   * The wrapper:
   * - Injects context variables into scope (if provided)
   * - Wraps code in async IIFE to support top-level await
   * - Captures the return value
   * - Serializes result to JSON
   * - Captures and serializes errors
   * - Outputs result with marker for parsing
   *
   * @param code - User code to wrap
   * @param context - Optional context object to inject as variables
   * @returns Wrapped code ready for execution
   */
  wrapCode(code: string, context?: Record<string, unknown>): string {
    // Build context injection code
    const contextInjection = context
      ? Object.entries(context)
        .map(([key, value]) => {
          // Validate variable name is safe (alphanumeric + underscore only)
          if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
            throw new Error(`Invalid context variable name: ${key}`);
          }
          // Serialize value to JSON and inject as const
          return `const ${key} = ${JSON.stringify(value)};`;
        })
        .join("\n    ")
      : "";

    // ADR-016: REPL-style auto-return with heuristic detection
    // Check if code contains statement keywords
    const hasStatements =
      /(^|\n|\s)(const|let|var|function|class|if|for|while|do|switch|try|return|throw|break|continue)\s/
        .test(code.trim());

    // If code has statements, execute as-is (requires explicit return)
    // If code is pure expression, wrap in return for auto-return
    const wrappedUserCode = hasStatements ? code : `return (${code});`;

    return `
(async () => {
  try {
    // Execute user code in async context with injected context (ADR-016: REPL-style auto-return)
    const __result = await (async () => {
      ${contextInjection ? contextInjection + "\n      " : ""}${wrappedUserCode}
    })();

    // Serialize result (must be JSON-compatible)
    // Convert undefined to null for proper JSON serialization
    const __serialized = JSON.stringify({
      success: true,
      result: __result === undefined ? null : __result,
    });

    console.log("${RESULT_MARKER}" + __serialized);
  } catch (error) {
    // Capture execution error
    const __serialized = JSON.stringify({
      success: false,
      error: {
        type: error?.constructor?.name || "Error",
        message: error?.message || String(error),
        stack: error?.stack,
      },
    });

    console.log("${RESULT_MARKER}" + __serialized);
  }
})();
`;
  }

  /**
   * Validate context variable name
   *
   * @param name - Variable name to validate
   * @returns true if valid
   */
  isValidVariableName(name: string): boolean {
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
  }

  /**
   * Check if code contains statements (vs pure expression)
   *
   * @param code - Code to check
   * @returns true if code contains statement keywords
   */
  hasStatements(code: string): boolean {
    return /(^|\n|\s)(const|let|var|function|class|if|for|while|do|switch|try|return|throw|break|continue)\s/
      .test(code.trim());
  }
}

/**
 * Singleton instance for convenience
 */
export const codeWrapper = new CodeWrapper();
