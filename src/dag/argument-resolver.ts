/**
 * Argument Resolver for DAG Execution (Epic 10 - Story 10.5)
 *
 * Resolves arguments at runtime based on ArgumentsStructure from static analysis.
 * Supports three resolution strategies:
 * - literal: Direct value, use immediately
 * - reference: Resolve from previous task result
 * - parameter: Extract from execution context/parameters
 *
 * @module dag/argument-resolver
 */

import type { ArgumentsStructure, ArgumentValue } from "../capabilities/types.ts";
import type { TaskResult } from "./types.ts";
import { getLogger } from "../telemetry/logger.ts";

const logger = getLogger("default");

/**
 * Execution context for argument resolution
 *
 * Contains parameters passed to the execution and any
 * additional context values needed for resolution.
 */
export interface ExecutionContext {
  /** Named parameters for the execution (args.X, params.X, input.X) */
  parameters?: Record<string, unknown>;
  /** Additional context values */
  [key: string]: unknown;
}

/**
 * Resolve arguments from ArgumentsStructure at runtime
 *
 * Strategy (AC3):
 * - literal: Use value directly
 * - reference: Resolve from previousResults using expression path
 * - parameter: Extract from executionContext.parameters
 *
 * @param args ArgumentsStructure with resolution strategies
 * @param context ExecutionContext with parameters
 * @param previousResults Map of taskId -> TaskResult for reference resolution
 * @returns Resolved arguments ready for tool execution
 */
export function resolveArguments(
  args: ArgumentsStructure | undefined,
  context: ExecutionContext,
  previousResults: Map<string, TaskResult>,
): Record<string, unknown> {
  if (!args || Object.keys(args).length === 0) {
    return {};
  }

  const resolved: Record<string, unknown> = {};

  for (const [key, argValue] of Object.entries(args)) {
    try {
      const value = resolveArgumentValue(argValue, context, previousResults);
      if (value !== undefined) {
        resolved[key] = value;
      }
    } catch (error) {
      logger.warn(`Failed to resolve argument '${key}'`, {
        type: argValue.type,
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue with other arguments, don't fail entirely
    }
  }

  logger.debug("Arguments resolved", {
    inputCount: Object.keys(args).length,
    resolvedCount: Object.keys(resolved).length,
  });

  return resolved;
}

/**
 * Resolve a single ArgumentValue
 *
 * @param argValue The argument value to resolve
 * @param context Execution context with parameters
 * @param previousResults Previous task results for reference resolution
 * @returns Resolved value or undefined if resolution fails
 */
function resolveArgumentValue(
  argValue: ArgumentValue,
  context: ExecutionContext,
  previousResults: Map<string, TaskResult>,
): unknown {
  switch (argValue.type) {
    case "literal":
      return argValue.value;

    case "parameter":
      return resolveParameter(argValue.parameterName, context);

    case "reference":
      return resolveReference(argValue.expression, previousResults, context);

    default:
      logger.warn("Unknown argument type", { type: (argValue as ArgumentValue).type });
      return undefined;
  }
}

/**
 * Resolve a parameter from execution context
 *
 * Looks up the parameter in context.parameters (for args.X, params.X, input.X patterns)
 *
 * @param parameterName Name of the parameter to resolve
 * @param context Execution context
 * @returns Parameter value or undefined if not found
 */
function resolveParameter(
  parameterName: string | undefined,
  context: ExecutionContext,
): unknown {
  if (!parameterName) {
    return undefined;
  }

  // Try context.parameters first (most common case)
  if (context.parameters && parameterName in context.parameters) {
    return context.parameters[parameterName];
  }

  // Try direct context lookup (for backwards compatibility)
  if (parameterName in context) {
    return context[parameterName];
  }

  logger.debug(`Parameter '${parameterName}' not found in context`);
  return undefined;
}

/**
 * Resolve a reference expression from previous task results
 *
 * Supports expressions like:
 * - "n1.content" → previousResults.get("task_n1").output.content
 * - "result.items[0].value" → previousResults.get("task_result").output.items[0].value
 * - "localVar" → context[localVar] (fallback for local variables)
 *
 * @param expression Reference expression to resolve
 * @param previousResults Map of task results
 * @param context Execution context (fallback for local variables)
 * @returns Resolved value or undefined if reference not found
 */
function resolveReference(
  expression: string | undefined,
  previousResults: Map<string, TaskResult>,
  context: ExecutionContext,
): unknown {
  if (!expression) {
    return undefined;
  }

  // Parse the expression: "n1.content" → ["n1", "content"]
  const parts = parseExpression(expression);
  if (parts.length === 0) {
    return undefined;
  }

  const [rootPart, ...pathParts] = parts;

  // Try to find the root in previous results
  // Task IDs are prefixed with "task_" in the converter
  const taskId = `task_${rootPart}`;
  const taskResult = previousResults.get(taskId);

  if (taskResult && taskResult.status === "success" && taskResult.output !== undefined) {
    // Navigate the path within the output
    if (pathParts.length === 0) {
      return taskResult.output;
    }
    return navigatePath(taskResult.output, pathParts);
  }

  // Fallback: try to resolve from context
  if (rootPart in context) {
    const contextValue = context[rootPart];
    if (pathParts.length === 0) {
      return contextValue;
    }
    return navigatePath(contextValue, pathParts);
  }

  logger.debug(`Reference '${expression}' not resolved`, { taskId, rootPart });
  return undefined;
}

/**
 * Parse an expression into path parts
 *
 * Handles:
 * - "n1.content" → ["n1", "content"]
 * - "result.items[0].value" → ["result", "items", "0", "value"]
 * - "data['key']" → ["data", "key"]
 *
 * @param expression Expression string to parse
 * @returns Array of path parts
 */
function parseExpression(expression: string): string[] {
  // Remove template literal backticks if present
  let cleaned = expression;
  if (cleaned.startsWith("`") && cleaned.endsWith("`")) {
    cleaned = cleaned.slice(1, -1);
  }

  // Split by dots and brackets
  const parts: string[] = [];
  let current = "";

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];

    if (char === ".") {
      if (current) {
        parts.push(current);
        current = "";
      }
    } else if (char === "[") {
      if (current) {
        parts.push(current);
        current = "";
      }
      // Find the closing bracket
      const closeBracket = cleaned.indexOf("]", i);
      if (closeBracket > i) {
        let indexPart = cleaned.slice(i + 1, closeBracket);
        // Remove quotes if present
        if (
          (indexPart.startsWith("'") && indexPart.endsWith("'")) ||
          (indexPart.startsWith('"') && indexPart.endsWith('"'))
        ) {
          indexPart = indexPart.slice(1, -1);
        }
        parts.push(indexPart);
        i = closeBracket;
      }
    } else if (char !== "]") {
      current += char;
    }
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

/**
 * Navigate a path within an object/array
 *
 * @param obj Starting object/array
 * @param path Path parts to navigate
 * @returns Value at the path or undefined
 */
function navigatePath(obj: unknown, path: string[]): unknown {
  let current = obj;

  for (const part of path) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (Array.isArray(current)) {
      const index = parseInt(part, 10);
      if (isNaN(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
    } else if (typeof current === "object") {
      const objCurrent = current as Record<string, unknown>;
      if (!(part in objCurrent)) {
        return undefined;
      }
      current = objCurrent[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Merge resolved arguments with explicit arguments
 *
 * Explicit arguments (from the DAG task definition) take precedence
 * over arguments resolved from static analysis.
 *
 * @param resolved Arguments resolved from static analysis
 * @param explicit Explicit arguments from task definition
 * @returns Merged arguments
 */
export function mergeArguments(
  resolved: Record<string, unknown>,
  explicit: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...resolved,
    ...explicit, // Explicit takes precedence
  };
}

/**
 * Validate that all required arguments are resolved
 *
 * Checks if any required arguments (based on schema) are missing.
 * Returns list of missing argument names for error reporting.
 *
 * @param resolved Resolved arguments
 * @param requiredArgs List of required argument names
 * @returns Array of missing argument names (empty if all present)
 */
export function validateRequiredArguments(
  resolved: Record<string, unknown>,
  requiredArgs: string[],
): string[] {
  const missing: string[] = [];

  for (const arg of requiredArgs) {
    if (!(arg in resolved) || resolved[arg] === undefined) {
      missing.push(arg);
    }
  }

  return missing;
}

/**
 * Build a summary of argument resolution for debugging/logging
 *
 * @param args Original ArgumentsStructure
 * @param resolved Resolved arguments
 * @returns Summary object
 */
export function buildResolutionSummary(
  args: ArgumentsStructure | undefined,
  resolved: Record<string, unknown>,
): {
  total: number;
  literals: number;
  references: number;
  parameters: number;
  resolved: number;
  failed: number;
} {
  if (!args) {
    return { total: 0, literals: 0, references: 0, parameters: 0, resolved: 0, failed: 0 };
  }

  let literals = 0;
  let references = 0;
  let parameters = 0;

  for (const argValue of Object.values(args)) {
    switch (argValue.type) {
      case "literal":
        literals++;
        break;
      case "reference":
        references++;
        break;
      case "parameter":
        parameters++;
        break;
    }
  }

  const total = Object.keys(args).length;
  const resolvedCount = Object.keys(resolved).length;

  return {
    total,
    literals,
    references,
    parameters,
    resolved: resolvedCount,
    failed: total - resolvedCount,
  };
}
