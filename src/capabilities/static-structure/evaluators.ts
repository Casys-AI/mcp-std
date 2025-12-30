/**
 * AST Evaluators for Static Structure Builder
 *
 * Functions that evaluate AST expressions to literal values.
 * Used for static analysis of constant expressions.
 *
 * @module capabilities/static-structure/evaluators
 */

import type { JsonValue } from "../types.ts";

/**
 * Evaluate a binary expression statically (Story 10.2b)
 *
 * Supports: +, -, *, /, %, **, &&, ||, ==, ===, !=, !==, <, >, <=, >=
 * Only works if both operands can be resolved to literal values.
 *
 * @param left Left operand value
 * @param right Right operand value
 * @param operator Binary operator
 * @returns Evaluated result or undefined if not evaluable
 */
export function evaluateBinaryOp(
  left: JsonValue | undefined,
  right: JsonValue | undefined,
  operator: string,
): JsonValue | undefined {
  if (left === undefined || right === undefined) {
    return undefined;
  }

  // Type-safe evaluation of binary operations
  switch (operator) {
    // Arithmetic (numbers)
    case "+":
      if (typeof left === "number" && typeof right === "number") return left + right;
      if (typeof left === "string" || typeof right === "string") {
        return String(left) + String(right);
      }
      return undefined;
    case "-":
      if (typeof left === "number" && typeof right === "number") return left - right;
      return undefined;
    case "*":
      if (typeof left === "number" && typeof right === "number") return left * right;
      return undefined;
    case "/":
      if (typeof left === "number" && typeof right === "number" && right !== 0) {
        return left / right;
      }
      return undefined;
    case "%":
      if (typeof left === "number" && typeof right === "number" && right !== 0) {
        return left % right;
      }
      return undefined;
    case "**":
      if (typeof left === "number" && typeof right === "number") return left ** right;
      return undefined;

    // Comparison
    case "==":
      return left == right;
    case "===":
      return left === right;
    case "!=":
      return left != right;
    case "!==":
      return left !== right;
    case "<":
      if (typeof left === "number" && typeof right === "number") return left < right;
      if (typeof left === "string" && typeof right === "string") return left < right;
      return undefined;
    case ">":
      if (typeof left === "number" && typeof right === "number") return left > right;
      if (typeof left === "string" && typeof right === "string") return left > right;
      return undefined;
    case "<=":
      if (typeof left === "number" && typeof right === "number") return left <= right;
      if (typeof left === "string" && typeof right === "string") return left <= right;
      return undefined;
    case ">=":
      if (typeof left === "number" && typeof right === "number") return left >= right;
      if (typeof left === "string" && typeof right === "string") return left >= right;
      return undefined;

    // Logical
    case "&&":
      return left && right;
    case "||":
      return left || right;

    default:
      return undefined;
  }
}

/**
 * Evaluate a unary expression statically (Story 10.2b)
 *
 * Supports: -, +, !, typeof
 *
 * @param argument Argument value
 * @param operator Unary operator
 * @returns Evaluated result or undefined if not evaluable
 */
export function evaluateUnaryOp(
  argument: JsonValue | undefined,
  operator: string,
): JsonValue | undefined {
  if (argument === undefined) {
    return undefined;
  }

  switch (operator) {
    case "-":
      if (typeof argument === "number") return -argument;
      return undefined;
    case "+":
      if (typeof argument === "number") return +argument;
      return undefined;
    case "!":
      return !argument;
    case "typeof":
      return typeof argument;
    default:
      return undefined;
  }
}
