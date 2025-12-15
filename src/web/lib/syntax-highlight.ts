/**
 * Syntax Highlighting Helper using Refractor
 * Story 8.4: Code Panel Integration
 *
 * Provides TypeScript/JavaScript syntax highlighting for code snippets
 * using refractor (Prism-based) with Preact JSX runtime compatibility.
 *
 * @module web/lib/syntax-highlight
 */

import { refractor } from "refractor";
import tsx from "refractor/lang/tsx";
import typescript from "refractor/lang/typescript";
import javascript from "refractor/lang/javascript";
import json from "refractor/lang/json";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { Fragment, jsx, jsxs } from "preact/jsx-runtime";
import type { ComponentChildren } from "preact";

// Register languages
refractor.register(tsx);
refractor.register(typescript);
refractor.register(javascript);
refractor.register(json);

/**
 * Highlight code with syntax coloring
 *
 * @param code - The source code to highlight
 * @param language - The language for highlighting (default: "typescript")
 * @returns JSX element with highlighted code
 *
 * @example
 * ```tsx
 * const highlighted = highlightCode("const x = 1;", "typescript");
 * return <pre><code>{highlighted}</code></pre>;
 * ```
 */
export function highlightCode(
  code: string,
  language: "typescript" | "tsx" | "javascript" | "json" = "typescript",
): ComponentChildren {
  try {
    // Check if language is registered
    if (!refractor.registered(language)) {
      console.warn(`[syntax-highlight] Language "${language}" not registered, returning plain text`);
      return code;
    }

    const tree = refractor.highlight(code, language);

    // Type cast needed due to refractor vs hast/preact type incompatibilities
    // deno-lint-ignore no-explicit-any
    return toJsxRuntime(tree as any, {
      Fragment,
      // deno-lint-ignore no-explicit-any
      jsx: jsx as any,
      // deno-lint-ignore no-explicit-any
      jsxs: jsxs as any,
    }) as ComponentChildren;
  } catch (error) {
    console.error("[syntax-highlight] Failed to highlight code:", error);
    // Fallback to plain text on error
    return code;
  }
}

/**
 * Detect language from code content (basic heuristics)
 *
 * @param code - The source code to analyze
 * @returns Detected language
 */
export function detectLanguage(code: string): "typescript" | "tsx" | "javascript" | "json" {
  const trimmed = code.trim();

  // JSON detection
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      // Not valid JSON, continue
    }
  }

  // TSX detection (React/Preact components)
  if (/<[A-Z][a-zA-Z]*/.test(code) || /return\s*\(?\s*</.test(code)) {
    return "tsx";
  }

  // TypeScript detection (type annotations, interfaces)
  if (
    /:\s*(string|number|boolean|void|any|never|unknown)/.test(code) ||
    /interface\s+\w+/.test(code) ||
    /type\s+\w+\s*=/.test(code) ||
    /<\w+>/.test(code) // Generics
  ) {
    return "typescript";
  }

  // Default to typescript (most common in this project)
  return "typescript";
}

/**
 * CSS styles for syntax highlighting (Prism token classes)
 * Based on Casys dark theme colors
 */
export const syntaxHighlightStyles = `
  /* Base code styling */
  .code-block {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    font-size: 13px;
    line-height: 1.5;
    tab-size: 2;
  }

  /* Token colors - Casys dark theme */
  .token.comment,
  .token.prolog,
  .token.doctype,
  .token.cdata {
    color: #6a6560;
    font-style: italic;
  }

  .token.punctuation {
    color: #d5c3b5;
  }

  .token.namespace {
    opacity: 0.7;
  }

  .token.property,
  .token.tag,
  .token.boolean,
  .token.number,
  .token.constant,
  .token.symbol,
  .token.deleted {
    color: #FF6B6B;
  }

  .token.selector,
  .token.attr-name,
  .token.string,
  .token.char,
  .token.builtin,
  .token.inserted {
    color: #95E1D3;
  }

  .token.operator,
  .token.entity,
  .token.url,
  .language-css .token.string,
  .style .token.string {
    color: #FFE66D;
  }

  .token.atrule,
  .token.attr-value,
  .token.keyword {
    color: #FFB86F;
  }

  .token.function,
  .token.class-name {
    color: #4ECDC4;
  }

  .token.regex,
  .token.important,
  .token.variable {
    color: #AA96DA;
  }

  .token.important,
  .token.bold {
    font-weight: bold;
  }

  .token.italic {
    font-style: italic;
  }

  .token.entity {
    cursor: help;
  }
`;
