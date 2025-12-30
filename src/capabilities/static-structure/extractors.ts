/**
 * AST Extractors for Static Structure Builder
 *
 * Stateless functions that extract values from SWC AST nodes.
 * These are pure functions that don't depend on builder state.
 *
 * @module capabilities/static-structure/extractors
 */

import type { JsonValue } from "../types.ts";

/**
 * Extract member expression chain: mcp.filesystem.read → ["mcp", "filesystem", "read"]
 */
export function extractMemberChain(
  node: Record<string, unknown>,
  parts: string[] = [],
): string[] {
  if (node.type === "Identifier") {
    return [node.value as string, ...parts];
  }

  if (node.type === "MemberExpression") {
    const obj = node.object as Record<string, unknown>;
    const prop = node.property as Record<string, unknown>;

    // Handle dot notation: capabilities.name → prop.type = "Identifier"
    if (prop?.type === "Identifier" && typeof prop?.value === "string") {
      parts.unshift(prop.value);
    } // Handle bracket notation: capabilities["name"] → prop.type = "Computed" with StringLiteral expression
    else if (prop?.type === "Computed") {
      const expr = (prop as Record<string, unknown>).expression as Record<string, unknown>;
      if (expr?.type === "StringLiteral" && typeof expr?.value === "string") {
        parts.unshift(expr.value);
      }
    } // Handle direct StringLiteral (fallback)
    else if (prop?.type === "StringLiteral" && typeof prop?.value === "string") {
      parts.unshift(prop.value);
    }

    return extractMemberChain(obj, parts);
  }

  return parts;
}

/**
 * Extract condition text from AST node
 */
export function extractConditionText(node: Record<string, unknown> | undefined): string {
  if (!node) return "unknown";

  // Simple identifier
  if (node.type === "Identifier") {
    return node.value as string;
  }

  // Member expression: obj.prop
  if (node.type === "MemberExpression") {
    const chain = extractMemberChain(node);
    return chain.join(".");
  }

  // Binary expression: a === b
  if (node.type === "BinaryExpression") {
    const left = extractConditionText(node.left as Record<string, unknown>);
    const op = node.operator as string;
    const right = extractConditionText(node.right as Record<string, unknown>);
    return `${left} ${op} ${right}`;
  }

  // Unary expression: !a
  if (node.type === "UnaryExpression") {
    const op = node.operator as string;
    const arg = extractConditionText(node.argument as Record<string, unknown>);
    return `${op}${arg}`;
  }

  // Literal values
  if (node.type === "BooleanLiteral") {
    return String(node.value);
  }
  if (node.type === "NumericLiteral" || node.type === "StringLiteral") {
    return String(node.value);
  }

  // Call expression
  if (node.type === "CallExpression") {
    const callee = node.callee as Record<string, unknown>;
    const calleeText = extractConditionText(callee);
    return `${calleeText}()`;
  }

  return "...";
}

/**
 * Extract text representation of a template literal
 *
 * @param node TemplateLiteral AST node
 * @returns String representation with ${...} placeholders
 */
export function extractTemplateLiteralText(node: Record<string, unknown>): string {
  const quasis = node.quasis as Array<Record<string, unknown>> | undefined;
  const expressions = node.expressions as Array<Record<string, unknown>> | undefined;

  if (!quasis || quasis.length === 0) {
    return "`...template...`";
  }

  let result = "`";
  for (let i = 0; i < quasis.length; i++) {
    const quasi = quasis[i];
    const cooked = (quasi.cooked as Record<string, unknown>)?.value as string | undefined;
    result += cooked ?? "";

    if (expressions && i < expressions.length) {
      const exprText = extractConditionText(expressions[i]);
      result += `\${${exprText}}`;
    }
  }
  result += "`";

  return result;
}

/**
 * Extract object literal as a plain JavaScript object
 *
 * @param node ObjectExpression AST node
 * @param extractLiteralValue Function to extract literal values (passed for recursion)
 * @returns Plain object with extracted values
 */
export function extractObjectLiteral(
  node: Record<string, unknown>,
  extractLiteralValue: (node: Record<string, unknown>) => JsonValue | undefined,
): Record<string, JsonValue> {
  const result: Record<string, JsonValue> = {};
  const properties = node.properties as Array<Record<string, unknown>> | undefined;

  if (!properties) {
    return result;
  }

  for (const prop of properties) {
    if (prop.type === "KeyValueProperty") {
      const keyNode = prop.key as Record<string, unknown>;
      const valueNode = prop.value as Record<string, unknown>;

      let keyName: string | undefined;
      if (keyNode?.type === "Identifier") {
        keyName = keyNode.value as string;
      } else if (keyNode?.type === "StringLiteral") {
        keyName = keyNode.value as string;
      }

      if (keyName && valueNode) {
        const extractedValue = extractLiteralValue(valueNode);
        if (extractedValue !== undefined) {
          result[keyName] = extractedValue;
        }
      }
    }
  }

  return result;
}

/**
 * Extract array literal as a plain JavaScript array
 *
 * @param node ArrayExpression AST node
 * @param extractLiteralValue Function to extract literal values (passed for recursion)
 * @returns Plain array with extracted values
 */
export function extractArrayLiteral(
  node: Record<string, unknown>,
  extractLiteralValue: (node: Record<string, unknown>) => JsonValue | undefined,
): JsonValue[] {
  const result: JsonValue[] = [];
  const elements = node.elements as Array<Record<string, unknown>> | undefined;

  if (!elements) {
    return result;
  }

  for (const element of elements) {
    // SWC wraps array elements in { spread, expression } structure
    const expr = (element?.expression as Record<string, unknown>) ?? element;
    if (expr) {
      const extractedValue = extractLiteralValue(expr);
      if (extractedValue !== undefined) {
        result.push(extractedValue);
      }
    }
  }

  return result;
}

/**
 * Check if a node is a literal expression
 */
export function isLiteralExpression(node: Record<string, unknown>): boolean {
  if (!node || !node.type) return false;

  // Direct literal types
  if (
    node.type === "StringLiteral" ||
    node.type === "NumericLiteral" ||
    node.type === "BooleanLiteral" ||
    node.type === "NullLiteral"
  ) {
    return true;
  }

  // Array literal - check if all elements are literals
  if (node.type === "ArrayExpression") {
    const elements = node.elements as Array<Record<string, unknown>> | undefined;
    if (!elements) return true; // Empty array is literal
    return elements.every((el) => {
      const expr = (el?.expression as Record<string, unknown>) ?? el;
      return expr ? isLiteralExpression(expr) : true;
    });
  }

  // Object literal - check if all values are literals
  if (node.type === "ObjectExpression") {
    const properties = node.properties as Array<Record<string, unknown>> | undefined;
    if (!properties) return true; // Empty object is literal
    return properties.every((prop) => {
      if (prop.type !== "KeyValueProperty") return false;
      const valueNode = prop.value as Record<string, unknown>;
      return valueNode ? isLiteralExpression(valueNode) : false;
    });
  }

  return false;
}
