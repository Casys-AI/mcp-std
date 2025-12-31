/**
 * Nested Literal Extractor
 *
 * Extracts parameterizable literals from code content (e.g., inside template literals).
 * Used to transform hardcoded values into args.xxx parameters.
 *
 * Example:
 * ```typescript
 * // Input code content
 * `page.goto('http://localhost:8081/dashboard')`
 *
 * // Output
 * {
 *   transformedCode: `page.goto('\${args.url}')`,
 *   extractedLiterals: { url: "http://localhost:8081/dashboard" }
 * }
 * ```
 *
 * @module capabilities/nested-literal-extractor
 */

import { parse } from "https://deno.land/x/swc@0.2.1/mod.ts";
import type { JsonValue } from "./types.ts";
import { getLogger } from "../telemetry/logger.ts";

const logger = getLogger("default");

/**
 * Extracted literal with position and suggested parameter name
 */
export interface ExtractedNestedLiteral {
  /** Suggested parameter name based on context */
  paramName: string;
  /** The literal value */
  value: string | number | boolean;
  /** Type of literal */
  type: "string" | "number" | "boolean";
  /** Start position in the code content */
  start: number;
  /** End position in the code content */
  end: number;
  /** Context for debugging (e.g., "goto() argument") */
  context: string;
}

/**
 * Result of nested literal extraction
 */
export interface NestedLiteralResult {
  /** Transformed code with ${args.xxx} interpolations */
  transformedCode: string;
  /** Extracted literals as parameter map */
  extractedLiterals: Record<string, JsonValue>;
  /** Number of literals extracted */
  count: number;
}

/**
 * Configuration for literal extraction
 */
export interface ExtractionConfig {
  /** Minimum string length to extract (default: 1) */
  minStringLength?: number;
  /** Extract numbers (default: true) */
  extractNumbers?: boolean;
  /** Extract booleans (default: false - usually intentional) */
  extractBooleans?: boolean;
  /** Patterns to skip (e.g., common constants) */
  skipPatterns?: RegExp[];
}

const DEFAULT_CONFIG: ExtractionConfig = {
  minStringLength: 1,
  extractNumbers: true,
  extractBooleans: false,
  skipPatterns: [
    /^(true|false|null|undefined)$/,
    /^[a-z]$/, // Single letter variables
  ],
};

/**
 * Extract parameterizable literals from code content
 *
 * Parses the code with SWC and extracts string/number literals that appear in:
 * - Function call arguments (e.g., goto('url'), slice(0, 100))
 * - Object property values (e.g., { endpoint: "https://..." })
 *
 * @param codeContent - The code content to analyze
 * @param config - Extraction configuration
 * @returns Transformed code and extracted literals
 */
export async function extractNestedLiterals(
  codeContent: string,
  config: ExtractionConfig = {},
): Promise<NestedLiteralResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const literals: ExtractedNestedLiteral[] = [];

  try {
    // Wrap in async function to make it valid
    const wrappedCode = `(async () => { ${codeContent} })()`;
    const ast = await parse(wrappedCode, {
      syntax: "typescript",
      target: "es2022",
    });

    // Calculate offset dynamically from AST span
    // SWC maintains a global position counter, so we can't assume positions start at 0
    // deno-lint-ignore no-explicit-any
    const astAny = ast as any;
    const astSpanStart = astAny.span?.start ?? 0;
    // The content starts after "(async () => { " which is 15 chars
    // astSpanStart is already 1-indexed, so we add the wrapper length
    const wrapperOffset = astSpanStart + "(async () => { ".length;

    // Visit AST and extract literals
    // deno-lint-ignore no-explicit-any
    visitNode(ast as any, literals, cfg, wrapperOffset);
  } catch (error) {
    // If parsing fails, return original code unchanged
    logger.debug("Failed to parse code for nested literal extraction", {
      error: error instanceof Error ? error.message : String(error),
      codeLength: codeContent.length,
    });
    return {
      transformedCode: codeContent,
      extractedLiterals: {},
      count: 0,
    };
  }

  if (literals.length === 0) {
    return {
      transformedCode: codeContent,
      extractedLiterals: {},
      count: 0,
    };
  }

  // Deduplicate by position and resolve name conflicts
  const uniqueLiterals = deduplicateLiterals(literals);
  const namedLiterals = resolveNameConflicts(uniqueLiterals);

  // Sort by position descending to replace from end to start
  namedLiterals.sort((a, b) => b.start - a.start);

  // Transform code by replacing literals with ${args.xxx}
  let transformedCode = codeContent;
  const extractedLiterals: Record<string, JsonValue> = {};

  for (const lit of namedLiterals) {
    // Validate positions
    if (lit.start < 0 || lit.end > codeContent.length) {
      logger.debug("Skipping literal with invalid position", {
        paramName: lit.paramName,
        start: lit.start,
        end: lit.end,
        codeLength: codeContent.length,
      });
      continue;
    }

    // Replace the literal with interpolation
    const before = transformedCode.substring(0, lit.start);
    const after = transformedCode.substring(lit.end);

    // For strings, we need to preserve the quote style
    // The literal span includes quotes: 'value' or "value"
    // We want to replace just the inner content with an interpolation
    // Result: '${args.paramName}' (quotes preserved around interpolation)
    if (lit.type === "string") {
      // Get the original quote character from the code
      const originalLiteral = codeContent.substring(lit.start, lit.end);
      const quoteChar = originalLiteral[0]; // ' or "
      // Replace with: quote + interpolation + quote
      transformedCode = `${before}${quoteChar}\${args.${lit.paramName}}${quoteChar}${after}`;
    } else {
      // For numbers/booleans, just replace the value directly
      transformedCode = `${before}\${args.${lit.paramName}}${after}`;
    }

    extractedLiterals[lit.paramName] = lit.value;
  }

  logger.debug("Nested literal extraction complete", {
    count: namedLiterals.length,
    params: Object.keys(extractedLiterals),
  });

  return {
    transformedCode,
    extractedLiterals,
    count: namedLiterals.length,
  };
}

/**
 * Visit AST node and extract literals
 */
function visitNode(
  node: Record<string, unknown>,
  literals: ExtractedNestedLiteral[],
  config: ExtractionConfig,
  wrapperOffset: number,
  context: string = "",
): void {
  if (!node || typeof node !== "object") return;

  // Extract literals from function call arguments
  if (node.type === "CallExpression") {
    extractFromCallExpression(node, literals, config, wrapperOffset);
  }

  // Extract literals from object properties
  if (node.type === "KeyValueProperty") {
    extractFromKeyValueProperty(node, literals, config, wrapperOffset);
  }

  // Recurse through all properties
  for (const key of Object.keys(node)) {
    if (key === "span") continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        visitNode(item as Record<string, unknown>, literals, config, wrapperOffset, context);
      }
    } else if (value && typeof value === "object") {
      visitNode(value as Record<string, unknown>, literals, config, wrapperOffset, context);
    }
  }
}

/**
 * Extract literals from function call arguments
 */
function extractFromCallExpression(
  node: Record<string, unknown>,
  literals: ExtractedNestedLiteral[],
  config: ExtractionConfig,
  wrapperOffset: number,
): void {
  const callee = node.callee as Record<string, unknown>;
  let methodName = "";

  // Get method name for context
  if (callee?.type === "MemberExpression") {
    const prop = callee.property as Record<string, unknown>;
    if (prop?.type === "Identifier") {
      methodName = prop.value as string;
    }
  } else if (callee?.type === "Identifier") {
    methodName = callee.value as string;
  }

  const args = node.arguments as Array<Record<string, unknown>> | undefined;
  if (!args) return;

  args.forEach((arg, idx) => {
    // Handle ExpressionStatement wrapper
    const expr = arg.expression as Record<string, unknown> | undefined;
    const actualArg = expr || arg;

    const literal = extractLiteralFromNode(actualArg, config, wrapperOffset);
    if (literal) {
      // Suggest parameter name based on method and position
      literal.paramName = suggestParamName(methodName, idx, literal.value, literal.type);
      literal.context = methodName ? `${methodName}() argument ${idx}` : `argument ${idx}`;
      literals.push(literal);
    }
  });
}

/**
 * Extract literals from object key-value properties
 */
function extractFromKeyValueProperty(
  node: Record<string, unknown>,
  literals: ExtractedNestedLiteral[],
  config: ExtractionConfig,
  wrapperOffset: number,
): void {
  const key = node.key as Record<string, unknown>;
  const value = node.value as Record<string, unknown>;

  // Get property name
  let keyName = "";
  if (key?.type === "Identifier") {
    keyName = key.value as string;
  } else if (key?.type === "StringLiteral") {
    keyName = key.value as string;
  }

  if (!keyName) return;

  const literal = extractLiteralFromNode(value, config, wrapperOffset);
  if (literal) {
    literal.paramName = keyName; // Use property name directly
    literal.context = `property "${keyName}"`;
    literals.push(literal);
  }
}

/**
 * Extract a single literal from a node
 */
function extractLiteralFromNode(
  node: Record<string, unknown>,
  config: ExtractionConfig,
  wrapperOffset: number,
): ExtractedNestedLiteral | null {
  if (!node) return null;

  const span = node.span as { start: number; end: number } | undefined;
  if (!span) return null;

  // Adjust position for wrapper
  const start = span.start - wrapperOffset;
  const end = span.end - wrapperOffset;

  if (node.type === "StringLiteral") {
    const value = node.value as string;

    // Skip if too short
    if (config.minStringLength && value.length < config.minStringLength) {
      return null;
    }

    // Skip if matches skip pattern
    if (config.skipPatterns?.some((p) => p.test(value))) {
      return null;
    }

    return {
      paramName: "", // Will be set by caller
      value,
      type: "string",
      start,
      end,
      context: "",
    };
  }

  if (node.type === "NumericLiteral" && config.extractNumbers) {
    return {
      paramName: "",
      value: node.value as number,
      type: "number",
      start,
      end,
      context: "",
    };
  }

  if (node.type === "BooleanLiteral" && config.extractBooleans) {
    return {
      paramName: "",
      value: node.value as boolean,
      type: "boolean",
      start,
      end,
      context: "",
    };
  }

  return null;
}

/**
 * Suggest parameter name based on context
 */
function suggestParamName(
  methodName: string,
  argIndex: number,
  value: string | number | boolean,
  type: string,
): string {
  // URL detection
  if (type === "string" && typeof value === "string") {
    if (value.startsWith("http://") || value.startsWith("https://")) {
      return "url";
    }
    if (value.startsWith("/") && value.includes(".")) {
      return "path";
    }
  }

  // Method-specific naming
  const methodHints: Record<string, Record<number, string>> = {
    goto: { 0: "url" },
    navigate: { 0: "url" },
    fetch: { 0: "url" },
    open: { 0: "path" },
    read: { 0: "path" },
    write: { 0: "path" },
    slice: { 0: "sliceStart", 1: "sliceEnd" },
    substring: { 0: "startIndex", 1: "endIndex" },
    substr: { 0: "startIndex", 1: "length" },
    split: { 0: "separator" },
    join: { 0: "separator" },
    replace: { 0: "pattern", 1: "replacement" },
    waitForSelector: { 0: "selector" },
    querySelector: { 0: "selector" },
    querySelectorAll: { 0: "selector" },
    waitForLoadState: { 0: "state" },
    click: { 0: "selector" },
    fill: { 0: "selector", 1: "value" },
    type: { 0: "selector", 1: "text" },
    evaluate: { 0: "script" },
    setTimeout: { 1: "timeout" },
    setInterval: { 1: "interval" },
  };

  if (methodName && methodHints[methodName]?.[argIndex]) {
    return methodHints[methodName][argIndex];
  }

  // Default: methodArg0, methodArg1, etc.
  if (methodName) {
    return `${methodName}Arg${argIndex}`;
  }

  return `param${argIndex}`;
}

/**
 * Remove duplicate literals (same position)
 */
function deduplicateLiterals(
  literals: ExtractedNestedLiteral[],
): ExtractedNestedLiteral[] {
  const seen = new Set<string>();
  return literals.filter((lit) => {
    const key = `${lit.start}-${lit.end}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Resolve naming conflicts by adding suffixes
 */
function resolveNameConflicts(
  literals: ExtractedNestedLiteral[],
): ExtractedNestedLiteral[] {
  const nameCount = new Map<string, number>();
  const result: ExtractedNestedLiteral[] = [];

  for (const lit of literals) {
    const baseName = lit.paramName;
    const count = nameCount.get(baseName) || 0;

    if (count > 0) {
      lit.paramName = `${baseName}${count + 1}`;
    }

    nameCount.set(baseName, count + 1);
    result.push(lit);
  }

  return result;
}
