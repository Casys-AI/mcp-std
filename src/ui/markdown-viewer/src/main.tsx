/**
 * Markdown Viewer UI for MCP Apps
 *
 * Renders Markdown content with:
 * - Headers (h1-h6)
 * - Bold, italic, strikethrough
 * - Links and images
 * - Code blocks with syntax highlighting
 * - Inline code
 * - Ordered and unordered lists
 * - Blockquotes
 * - Tables
 * - Horizontal rules
 * - Optional Table of Contents
 * - Copy button for code blocks
 *
 * @module lib/std/src/ui/markdown-viewer
 */

import { render, JSX, h } from "preact";
import { useState, useEffect, useMemo, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { cx } from "../../components/utils";
import { Button } from "../../components/ui/button";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface MarkdownViewerProps {
  content: string;
  showToc?: boolean;
  theme?: "light" | "dark";
}

interface TocItem {
  level: number;
  text: string;
  id: string;
}

interface ContentItem {
  type: string;
  text?: string;
}

// ============================================================================
// Syntax Highlighting (reused from diff-viewer)
// ============================================================================

type SupportedLanguage = "javascript" | "typescript" | "python" | "json" | "css" | "html" | "sql" | "bash" | "go" | "rust" | "yaml" | "markdown" | "plain";

interface SyntaxToken {
  type: "keyword" | "string" | "comment" | "number" | "operator" | "function" | "type" | "plain";
  value: string;
}

const LANGUAGE_ALIASES: Record<string, SupportedLanguage> = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  python3: "python",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  yml: "yaml",
  md: "markdown",
};

const LANGUAGE_PATTERNS: Record<SupportedLanguage, { patterns: Array<{ regex: RegExp; type: SyntaxToken["type"] }> }> = {
  javascript: {
    patterns: [
      { regex: /\/\/.*$/gm, type: "comment" },
      { regex: /\/\*[\s\S]*?\*\//g, type: "comment" },
      { regex: /(["'`])(?:\\.|(?!\1)[^\\])*\1/g, type: "string" },
      { regex: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|new|class|extends|import|export|from|as|default|async|await|yield|typeof|instanceof|in|of|void|delete|this|super|static|get|set|null|undefined|true|false)\b/g, type: "keyword" },
      { regex: /\b(Array|Object|String|Number|Boolean|Function|Promise|Map|Set|WeakMap|WeakSet|Symbol|BigInt|Date|RegExp|Error|Math|JSON|console|window|document)\b/g, type: "type" },
      { regex: /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?=\()/g, type: "function" },
      { regex: /\b\d+\.?\d*(?:[eE][+-]?\d+)?\b/g, type: "number" },
      { regex: /[+\-*/%=<>!&|^~?:]+/g, type: "operator" },
    ],
  },
  typescript: {
    patterns: [
      { regex: /\/\/.*$/gm, type: "comment" },
      { regex: /\/\*[\s\S]*?\*\//g, type: "comment" },
      { regex: /(["'`])(?:\\.|(?!\1)[^\\])*\1/g, type: "string" },
      { regex: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|new|class|extends|implements|import|export|from|as|default|async|await|yield|typeof|instanceof|in|of|void|delete|this|super|static|get|set|null|undefined|true|false|type|interface|enum|namespace|module|declare|abstract|readonly|private|protected|public|keyof|infer|never|unknown|any)\b/g, type: "keyword" },
      { regex: /\b(Array|Object|String|Number|Boolean|Function|Promise|Map|Set|WeakMap|WeakSet|Symbol|BigInt|Date|RegExp|Error|Math|JSON|console|Partial|Required|Readonly|Pick|Omit|Record|Exclude|Extract|NonNullable|ReturnType|InstanceType)\b/g, type: "type" },
      { regex: /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?=\()/g, type: "function" },
      { regex: /\b\d+\.?\d*(?:[eE][+-]?\d+)?\b/g, type: "number" },
      { regex: /[+\-*/%=<>!&|^~?:]+/g, type: "operator" },
    ],
  },
  python: {
    patterns: [
      { regex: /#.*$/gm, type: "comment" },
      { regex: /("""[\s\S]*?"""|'''[\s\S]*?''')/g, type: "string" },
      { regex: /(["'])(?:\\.|(?!\1)[^\\])*\1/g, type: "string" },
      { regex: /\b(and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield|True|False|None)\b/g, type: "keyword" },
      { regex: /\b(int|float|str|bool|list|dict|tuple|set|frozenset|bytes|bytearray|type|object|range|enumerate|zip|map|filter|print|len|open|input)\b/g, type: "type" },
      { regex: /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=\()/g, type: "function" },
      { regex: /\b\d+\.?\d*(?:[eE][+-]?\d+)?j?\b/g, type: "number" },
      { regex: /[+\-*/%=<>!&|^~@]+/g, type: "operator" },
    ],
  },
  json: {
    patterns: [
      { regex: /(["'])(?:\\.|(?!\1)[^\\])*\1(?=\s*:)/g, type: "keyword" },
      { regex: /(["'])(?:\\.|(?!\1)[^\\])*\1/g, type: "string" },
      { regex: /\b(true|false|null)\b/g, type: "keyword" },
      { regex: /-?\b\d+\.?\d*(?:[eE][+-]?\d+)?\b/g, type: "number" },
    ],
  },
  css: {
    patterns: [
      { regex: /\/\*[\s\S]*?\*\//g, type: "comment" },
      { regex: /(["'])(?:\\.|(?!\1)[^\\])*\1/g, type: "string" },
      { regex: /(@[a-zA-Z-]+)\b/g, type: "keyword" },
      { regex: /([.#]?[a-zA-Z_-][a-zA-Z0-9_-]*)\s*(?=\{)/g, type: "function" },
      { regex: /\b(inherit|initial|unset|revert|none|auto|!important)\b/g, type: "keyword" },
      { regex: /#[0-9a-fA-F]{3,8}\b/g, type: "number" },
      { regex: /-?\b\d+\.?\d*(px|em|rem|%|vh|vw|deg|s|ms)?\b/g, type: "number" },
      { regex: /[:;{}(),]/g, type: "operator" },
    ],
  },
  html: {
    patterns: [
      { regex: /<!--[\s\S]*?-->/g, type: "comment" },
      { regex: /(["'])(?:\\.|(?!\1)[^\\])*\1/g, type: "string" },
      { regex: /<\/?([a-zA-Z][a-zA-Z0-9-]*)/g, type: "keyword" },
      { regex: /\b([a-zA-Z-]+)(?==)/g, type: "function" },
      { regex: /[<>\/=]/g, type: "operator" },
    ],
  },
  sql: {
    patterns: [
      { regex: /--.*$/gm, type: "comment" },
      { regex: /\/\*[\s\S]*?\*\//g, type: "comment" },
      { regex: /(["'])(?:\\.|(?!\1)[^\\])*\1/g, type: "string" },
      { regex: /\b(SELECT|FROM|WHERE|AND|OR|NOT|IN|LIKE|BETWEEN|IS|NULL|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|ON|AS|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|INDEX|DROP|ALTER|ADD|COLUMN|PRIMARY|KEY|FOREIGN|REFERENCES|UNIQUE|DEFAULT|CHECK|CONSTRAINT|CASCADE|TRUNCATE|UNION|ALL|DISTINCT|COUNT|SUM|AVG|MIN|MAX|EXISTS|CASE|WHEN|THEN|ELSE|END|WITH|RECURSIVE)\b/gi, type: "keyword" },
      { regex: /\b(INT|INTEGER|BIGINT|SMALLINT|TINYINT|FLOAT|DOUBLE|DECIMAL|NUMERIC|CHAR|VARCHAR|TEXT|BLOB|DATE|TIME|DATETIME|TIMESTAMP|BOOLEAN|BOOL|SERIAL|UUID)\b/gi, type: "type" },
      { regex: /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=\()/g, type: "function" },
      { regex: /\b\d+\.?\d*\b/g, type: "number" },
      { regex: /[+\-*/%=<>!&|^~,;()]+/g, type: "operator" },
    ],
  },
  bash: {
    patterns: [
      { regex: /#.*$/gm, type: "comment" },
      { regex: /(["'])(?:\\.|(?!\1)[^\\])*\1/g, type: "string" },
      { regex: /\$[a-zA-Z_][a-zA-Z0-9_]*/g, type: "function" },
      { regex: /\$\{[^}]+\}/g, type: "function" },
      { regex: /\b(if|then|else|elif|fi|for|while|do|done|case|esac|in|function|return|exit|break|continue|local|export|readonly|declare|typeset|unset|shift|source|alias|unalias|true|false)\b/g, type: "keyword" },
      { regex: /\b(echo|printf|read|cd|pwd|ls|cp|mv|rm|mkdir|rmdir|touch|cat|grep|sed|awk|find|xargs|sort|uniq|wc|head|tail|cut|tr|tee|chmod|chown|sudo|apt|yum|brew|npm|yarn|git|docker|curl|wget)\b/g, type: "type" },
      { regex: /\b\d+\b/g, type: "number" },
      { regex: /[|&;<>()$`\\!]+/g, type: "operator" },
    ],
  },
  go: {
    patterns: [
      { regex: /\/\/.*$/gm, type: "comment" },
      { regex: /\/\*[\s\S]*?\*\//g, type: "comment" },
      { regex: /(["'`])(?:\\.|(?!\1)[^\\])*\1/g, type: "string" },
      { regex: /\b(break|case|chan|const|continue|default|defer|else|fallthrough|for|func|go|goto|if|import|interface|map|package|range|return|select|struct|switch|type|var|nil|true|false|iota)\b/g, type: "keyword" },
      { regex: /\b(bool|byte|complex64|complex128|error|float32|float64|int|int8|int16|int32|int64|rune|string|uint|uint8|uint16|uint32|uint64|uintptr|any|comparable)\b/g, type: "type" },
      { regex: /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=\()/g, type: "function" },
      { regex: /\b\d+\.?\d*(?:[eE][+-]?\d+)?\b/g, type: "number" },
      { regex: /[+\-*/%=<>!&|^~:]+/g, type: "operator" },
    ],
  },
  rust: {
    patterns: [
      { regex: /\/\/.*$/gm, type: "comment" },
      { regex: /\/\*[\s\S]*?\*\//g, type: "comment" },
      { regex: /(["'])(?:\\.|(?!\1)[^\\])*\1/g, type: "string" },
      { regex: /\b(as|async|await|break|const|continue|crate|dyn|else|enum|extern|false|fn|for|if|impl|in|let|loop|match|mod|move|mut|pub|ref|return|self|Self|static|struct|super|trait|true|type|unsafe|use|where|while)\b/g, type: "keyword" },
      { regex: /\b(bool|char|f32|f64|i8|i16|i32|i64|i128|isize|str|u8|u16|u32|u64|u128|usize|Option|Result|String|Vec|Box|Rc|Arc|Cell|RefCell)\b/g, type: "type" },
      { regex: /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=\()/g, type: "function" },
      { regex: /\b\d+\.?\d*(?:[eE][+-]?\d+)?\b/g, type: "number" },
      { regex: /[+\-*/%=<>!&|^~:]+/g, type: "operator" },
    ],
  },
  yaml: {
    patterns: [
      { regex: /#.*$/gm, type: "comment" },
      { regex: /(["'])(?:\\.|(?!\1)[^\\])*\1/g, type: "string" },
      { regex: /^[\s-]*([a-zA-Z_][a-zA-Z0-9_-]*)(?=\s*:)/gm, type: "keyword" },
      { regex: /\b(true|false|null|yes|no|on|off)\b/gi, type: "keyword" },
      { regex: /\b\d+\.?\d*\b/g, type: "number" },
      { regex: /[:|\->]+/g, type: "operator" },
    ],
  },
  markdown: {
    patterns: [
      { regex: /^#{1,6}\s.+$/gm, type: "keyword" },
      { regex: /\*\*[^*]+\*\*/g, type: "keyword" },
      { regex: /\*[^*]+\*/g, type: "string" },
      { regex: /`[^`]+`/g, type: "function" },
      { regex: /\[[^\]]+\]\([^)]+\)/g, type: "type" },
    ],
  },
  plain: {
    patterns: [],
  },
};

function normalizeLanguage(lang: string): SupportedLanguage {
  const lower = lang.toLowerCase().trim();
  if (lower in LANGUAGE_ALIASES) {
    return LANGUAGE_ALIASES[lower];
  }
  if (lower in LANGUAGE_PATTERNS) {
    return lower as SupportedLanguage;
  }
  return "plain";
}

function tokenize(code: string, language: SupportedLanguage): SyntaxToken[] {
  if (language === "plain" || !LANGUAGE_PATTERNS[language]) {
    return [{ type: "plain", value: code }];
  }

  const { patterns } = LANGUAGE_PATTERNS[language];
  const tokens: Array<{ start: number; end: number; type: SyntaxToken["type"]; value: string }> = [];

  for (const { regex, type } of patterns) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(code)) !== null) {
      tokens.push({
        start: match.index,
        end: match.index + match[0].length,
        type,
        value: match[0],
      });
    }
  }

  tokens.sort((a, b) => a.start - b.start);

  const filtered: typeof tokens = [];
  let lastEnd = 0;
  for (const token of tokens) {
    if (token.start >= lastEnd) {
      filtered.push(token);
      lastEnd = token.end;
    }
  }

  const result: SyntaxToken[] = [];
  let pos = 0;
  for (const token of filtered) {
    if (token.start > pos) {
      result.push({ type: "plain", value: code.slice(pos, token.start) });
    }
    result.push({ type: token.type, value: token.value });
    pos = token.end;
  }
  if (pos < code.length) {
    result.push({ type: "plain", value: code.slice(pos) });
  }

  return result;
}

// ============================================================================
// Markdown Parsing
// ============================================================================

interface ParsedBlock {
  type: "heading" | "paragraph" | "code" | "blockquote" | "list" | "table" | "hr";
  content: string;
  level?: number; // for headings
  language?: string; // for code blocks
  items?: string[]; // for lists
  ordered?: boolean; // for lists
  rows?: string[][]; // for tables
  headers?: string[]; // for tables
  id?: string; // for headings (TOC anchor)
}

function generateId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

function parseMarkdown(content: string): { blocks: ParsedBlock[]; toc: TocItem[] } {
  const lines = content.split("\n");
  const blocks: ParsedBlock[] = [];
  const toc: TocItem[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const codeMatch = line.match(/^```(\w*)/);
    if (codeMatch) {
      const language = codeMatch[1] || "plain";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({
        type: "code",
        content: codeLines.join("\n"),
        language,
      });
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const id = generateId(text);
      blocks.push({
        type: "heading",
        content: text,
        level,
        id,
      });
      toc.push({ level, text, id });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push({ type: "hr", content: "" });
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && (lines[i].startsWith(">") || (lines[i].trim() !== "" && quoteLines.length > 0 && !lines[i].startsWith("#")))) {
        if (lines[i].startsWith(">")) {
          quoteLines.push(lines[i].replace(/^>\s?/, ""));
        } else {
          quoteLines.push(lines[i]);
        }
        i++;
      }
      blocks.push({
        type: "blockquote",
        content: quoteLines.join("\n"),
      });
      continue;
    }

    // Unordered list
    if (/^[\s]*[-*+]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[\s]*[-*+]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[\s]*[-*+]\s/, ""));
        i++;
      }
      blocks.push({
        type: "list",
        content: "",
        items,
        ordered: false,
      });
      continue;
    }

    // Ordered list
    if (/^[\s]*\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[\s]*\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[\s]*\d+\.\s/, ""));
        i++;
      }
      blocks.push({
        type: "list",
        content: "",
        items,
        ordered: true,
      });
      continue;
    }

    // Table
    if (line.includes("|") && i + 1 < lines.length && /^[\s|:-]+$/.test(lines[i + 1])) {
      const headers = line.split("|").map((h) => h.trim()).filter((h) => h);
      i += 2; // skip header and separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|")) {
        const row = lines[i].split("|").map((c) => c.trim()).filter((c) => c !== "");
        if (row.length > 0) {
          rows.push(row);
        }
        i++;
      }
      blocks.push({
        type: "table",
        content: "",
        headers,
        rows,
      });
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph (collect consecutive non-empty lines)
    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("#") &&
      !lines[i].startsWith(">") &&
      !lines[i].startsWith("```") &&
      !/^[-*+]\s/.test(lines[i]) &&
      !/^\d+\.\s/.test(lines[i]) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())
    ) {
      paragraphLines.push(lines[i]);
      i++;
    }
    if (paragraphLines.length > 0) {
      blocks.push({
        type: "paragraph",
        content: paragraphLines.join(" "),
      });
    }
  }

  return { blocks, toc };
}

// ============================================================================
// Inline Markdown Parsing
// ============================================================================

interface InlineToken {
  type: "text" | "bold" | "italic" | "strikethrough" | "code" | "link" | "image";
  content: string;
  href?: string;
  alt?: string;
  children?: InlineToken[];
}

function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Image: ![alt](url)
    const imageMatch = remaining.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    if (imageMatch) {
      tokens.push({
        type: "image",
        content: "",
        alt: imageMatch[1],
        href: imageMatch[2],
      });
      remaining = remaining.slice(imageMatch[0].length);
      continue;
    }

    // Link: [text](url)
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      tokens.push({
        type: "link",
        content: linkMatch[1],
        href: linkMatch[2],
      });
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // Inline code: `code`
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      tokens.push({
        type: "code",
        content: codeMatch[1],
      });
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Bold: **text** or __text__
    const boldMatch = remaining.match(/^(\*\*|__)([^*_]+)\1/);
    if (boldMatch) {
      tokens.push({
        type: "bold",
        content: boldMatch[2],
        children: parseInline(boldMatch[2]),
      });
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Italic: *text* or _text_
    const italicMatch = remaining.match(/^(\*|_)([^*_]+)\1/);
    if (italicMatch) {
      tokens.push({
        type: "italic",
        content: italicMatch[2],
        children: parseInline(italicMatch[2]),
      });
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Strikethrough: ~~text~~
    const strikeMatch = remaining.match(/^~~([^~]+)~~/);
    if (strikeMatch) {
      tokens.push({
        type: "strikethrough",
        content: strikeMatch[1],
        children: parseInline(strikeMatch[1]),
      });
      remaining = remaining.slice(strikeMatch[0].length);
      continue;
    }

    // Plain text until next special character
    const nextSpecial = remaining.search(/[!\[`*_~]/);
    if (nextSpecial === -1) {
      tokens.push({ type: "text", content: remaining });
      break;
    } else if (nextSpecial === 0) {
      // Special char at start but no pattern matched, treat as text
      tokens.push({ type: "text", content: remaining[0] });
      remaining = remaining.slice(1);
    } else {
      tokens.push({ type: "text", content: remaining.slice(0, nextSpecial) });
      remaining = remaining.slice(nextSpecial);
    }
  }

  return tokens;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Markdown Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Syntax Highlighting Styles
// ============================================================================

const syntaxColors: Record<SyntaxToken["type"], string> = {
  keyword: "text-purple-600 dark:text-purple-400 font-medium",
  string: "text-green-700 dark:text-green-400",
  comment: "text-gray-500 dark:text-gray-400 italic",
  number: "text-orange-600 dark:text-orange-400",
  operator: "text-fg-default",
  function: "text-blue-600 dark:text-blue-400",
  type: "text-cyan-700 dark:text-cyan-400",
  plain: "text-inherit",
};

// ============================================================================
// Components
// ============================================================================

function HighlightedCode({ content, language }: { content: string; language: SupportedLanguage }) {
  const tokens = useMemo(() => tokenize(content, language), [content, language]);

  return (
    <>
      {tokens.map((token, i) => (
        <span
          key={i}
          className={syntaxColors[token.type]}
        >
          {token.value}
        </span>
      ))}
    </>
  );
}

function InlineContent({ tokens }: { tokens: InlineToken[] }) {
  return (
    <>
      {tokens.map((token, i) => {
        switch (token.type) {
          case "text":
            return <span key={i}>{token.content}</span>;
          case "bold":
            return (
              <strong key={i} className="font-bold">
                {token.content}
              </strong>
            );
          case "italic":
            return (
              <em key={i} className="italic">
                {token.content}
              </em>
            );
          case "strikethrough":
            return (
              <del key={i} className="line-through opacity-70">
                {token.content}
              </del>
            );
          case "code":
            return (
              <code key={i} className="text-sm font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                {token.content}
              </code>
            );
          case "link":
            return (
              <a
                key={i}
                href={token.href}
                className="text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-300"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => notifyModel("linkClick", { href: token.href })}
              >
                {token.content}
              </a>
            );
          case "image":
            return (
              <img
                key={i}
                src={token.href}
                alt={token.alt || ""}
                className="max-w-full h-auto rounded-md my-4"
              />
            );
          default:
            return null;
        }
      })}
    </>
  );
}

function CodeBlock({ content, language }: { content: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const normalizedLang = normalizeLanguage(language);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      notifyModel("codeCopy", { language });
    });
  }, [content, language]);

  return (
    <div className="my-4 rounded-lg overflow-hidden border border-border-default bg-gray-50 dark:bg-gray-900">
      <div className="flex justify-between items-center px-3 py-2 bg-gray-100 dark:bg-gray-800 border-b border-border-default">
        <span className="text-xs font-medium text-fg-muted uppercase">
          {language || "plain"}
        </span>
        <Button variant="outline" size="xs" onClick={handleCopy} title="Copy code">
          {copied ? "Copied!" : "Copy"}
        </Button>
      </div>
      <pre className="p-4 overflow-x-auto text-sm leading-relaxed">
        <code className="font-mono">
          <HighlightedCode content={content} language={normalizedLang} />
        </code>
      </pre>
    </div>
  );
}

function TableOfContents({ items, onNavigate }: { items: TocItem[]; onNavigate: (id: string) => void }) {
  if (items.length === 0) return null;

  return (
    <div className="mb-6 border border-border-default rounded-lg bg-white dark:bg-gray-900">
      <div className="p-4">
        <div className="text-sm font-semibold mb-3 text-fg-default uppercase tracking-wide">
          Table of Contents
        </div>
        <ul className="list-none p-0 m-0 flex flex-col gap-1">
          {items.map((item, i) => (
            <li key={i} style={{ paddingLeft: `${(item.level - 1) * 12}px` }}>
              <a
                href={`#${item.id}`}
                className="text-sm text-fg-muted no-underline hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate(item.id);
                  notifyModel("tocClick", { id: item.id, text: item.text });
                }}
              >
                {item.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MarkdownBlock({ block }: { block: ParsedBlock }) {
  switch (block.type) {
    case "heading": {
      const headingSizes: Record<number, string> = {
        1: "text-3xl",
        2: "text-2xl",
        3: "text-xl",
        4: "text-lg",
        5: "text-base",
        6: "text-sm",
      };
      const level = block.level || 1;
      const headingTag = `h${level}`;
      return h(
        headingTag,
        {
          id: block.id,
          className: cx(
            headingSizes[level],
            level <= 2 ? "font-bold" : "font-semibold",
            level <= 2 ? "mb-4" : level <= 4 ? "mb-3" : "mb-2",
            level === 1 ? "mt-6" : level === 2 ? "mt-5" : level <= 4 ? "mt-4" : "mt-3",
            level <= 2 ? "pb-2 border-b" : "",
            level === 1 ? "border-border-default" : "border-border-subtle",
            level === 6 ? "text-fg-muted" : "text-fg-default",
            "scroll-mt-4"
          ),
        },
        h(InlineContent, { tokens: parseInline(block.content) })
      );
    }

    case "paragraph":
      return (
        <p className="mb-4 leading-relaxed">
          <InlineContent tokens={parseInline(block.content)} />
        </p>
      );

    case "code":
      return <CodeBlock content={block.content} language={block.language || "plain"} />;

    case "blockquote":
      return (
        <blockquote className="pl-4 py-2 my-4 border-l-4 border-gray-300 dark:border-gray-600 text-fg-muted italic">
          <InlineContent tokens={parseInline(block.content)} />
        </blockquote>
      );

    case "list":
      if (block.ordered) {
        return (
          <ol className="pl-6 mb-4 list-decimal">
            {block.items?.map((item, i) => (
              <li key={i} className="mb-1 leading-relaxed">
                <InlineContent tokens={parseInline(item)} />
              </li>
            ))}
          </ol>
        );
      }
      return (
        <ul className="pl-6 mb-4 list-disc">
          {block.items?.map((item, i) => (
            <li key={i} className="mb-1 leading-relaxed">
              <InlineContent tokens={parseInline(item)} />
            </li>
          ))}
        </ul>
      );

    case "table":
      return (
        <div className="overflow-x-auto my-4">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {block.headers?.map((header, i) => (
                  <th
                    key={i}
                    className="px-3 py-2 text-left font-semibold bg-gray-100 dark:bg-gray-800 border-b-2 border-border-default"
                  >
                    <InlineContent tokens={parseInline(header)} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows?.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2 border-b border-border-subtle">
                      <InlineContent tokens={parseInline(cell)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "hr":
      return <hr className="my-6 border-t border-border-default" />;

    default:
      return null;
  }
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cx("animate-spin h-5 w-5", className)}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function MarkdownViewer() {
  const [data, setData] = useState<MarkdownViewerProps | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Parse markdown
  const { blocks, toc } = useMemo(() => {
    if (!data?.content) return { blocks: [], toc: [] };
    return parseMarkdown(data.content);
  }, [data?.content]);

  // Handle TOC navigation
  const handleTocNavigate = useCallback((id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  // Apply theme
  useEffect(() => {
    if (data?.theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [data?.theme]);

  // Connect to MCP host
  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
      console.log("[markdown-viewer] Connected to MCP host");
    }).catch(() => {
      console.log("[markdown-viewer] No MCP host (standalone mode)");
    });

    app.ontoolresult = (result: { content?: ContentItem[] }) => {
      setLoading(false);
      setError(null);

      try {
        const textContent = result.content?.find((c) => c.type === "text") as ContentItem | undefined;
        if (!textContent?.text) {
          setData(null);
          return;
        }

        // Try to parse as JSON first
        let parsedData: MarkdownViewerProps;
        try {
          parsedData = JSON.parse(textContent.text);
        } catch {
          // If not JSON, treat as raw markdown
          parsedData = { content: textContent.text };
        }

        setData(parsedData);
      } catch (e) {
        setError(`Failed to parse content: ${e instanceof Error ? e.message : "Unknown"}`);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // Render
  if (loading) {
    return (
      <div className="p-4 font-sans text-base text-fg-default bg-bg-canvas leading-relaxed">
        <div className="p-10 flex justify-center items-center flex-col gap-2">
          <Spinner />
          <span className="text-fg-muted">Loading markdown...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 font-sans text-base text-fg-default bg-bg-canvas leading-relaxed">
        <div className="p-4 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 rounded-md">
          {error}
        </div>
      </div>
    );
  }

  if (!data?.content) {
    return (
      <div className="p-4 font-sans text-base text-fg-default bg-bg-canvas leading-relaxed">
        <div className="p-10 text-center text-fg-muted">
          No content to display
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 font-sans text-base text-fg-default bg-bg-canvas leading-relaxed">
      {data.showToc && toc.length > 0 && (
        <TableOfContents items={toc} onNavigate={handleTocNavigate} />
      )}
      <div className="max-w-prose mx-auto">
        {blocks.map((block, i) => (
          <MarkdownBlock key={i} block={block} />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Mount
// ============================================================================

render(<MarkdownViewer />, document.getElementById("app")!);
