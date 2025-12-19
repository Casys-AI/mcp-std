/**
 * Formatting tools
 *
 * String and data formatting utilities.
 *
 * Inspired by:
 * - IT-Tools MCP: https://github.com/wrenchpilot/it-tools-mcp
 *
 * @module lib/std/format
 */

import * as yaml from "npm:yaml@2.3.4";
import type { MiniTool } from "./types.ts";

export const formatTools: MiniTool[] = [
  {
    name: "format_number",
    description: "Format number with locale and options",
    category: "format",
    inputSchema: {
      type: "object",
      properties: {
        value: { type: "number", description: "Number to format" },
        locale: { type: "string", description: "Locale (e.g., 'en-US', 'fr-FR')" },
        style: {
          type: "string",
          enum: ["decimal", "currency", "percent", "unit"],
          description: "Format style",
        },
        currency: { type: "string", description: "Currency code (e.g., 'USD', 'EUR')" },
        unit: { type: "string", description: "Unit (e.g., 'kilometer', 'celsius')" },
        minimumFractionDigits: { type: "number", description: "Min decimal places" },
        maximumFractionDigits: { type: "number", description: "Max decimal places" },
      },
      required: ["value"],
    },
    handler: ({ value, locale = "en-US", style, currency, unit, minimumFractionDigits, maximumFractionDigits }) => {
      const options: Intl.NumberFormatOptions = {};
      if (style) options.style = style as "decimal" | "currency" | "percent" | "unit";
      if (currency) options.currency = currency as string;
      if (unit) options.unit = unit as string;
      if (minimumFractionDigits !== undefined) options.minimumFractionDigits = minimumFractionDigits as number;
      if (maximumFractionDigits !== undefined) options.maximumFractionDigits = maximumFractionDigits as number;

      return new Intl.NumberFormat(locale as string, options).format(value as number);
    },
  },
  {
    name: "format_bytes",
    description: "Format bytes to human readable size",
    category: "format",
    inputSchema: {
      type: "object",
      properties: {
        bytes: { type: "number", description: "Number of bytes" },
        decimals: { type: "number", description: "Decimal places (default: 2)" },
        binary: { type: "boolean", description: "Use binary units (KiB vs KB)" },
      },
      required: ["bytes"],
    },
    handler: ({ bytes, decimals = 2, binary = false }) => {
      const b = bytes as number;
      if (b === 0) return "0 Bytes";

      const k = binary ? 1024 : 1000;
      const units = binary
        ? ["Bytes", "KiB", "MiB", "GiB", "TiB", "PiB"]
        : ["Bytes", "KB", "MB", "GB", "TB", "PB"];

      const i = Math.floor(Math.log(b) / Math.log(k));
      const formatted = parseFloat((b / Math.pow(k, i)).toFixed(decimals as number));
      return `${formatted} ${units[i]}`;
    },
  },
  {
    name: "format_duration",
    description: "Format duration in milliseconds to human readable",
    category: "format",
    inputSchema: {
      type: "object",
      properties: {
        ms: { type: "number", description: "Duration in milliseconds" },
        format: {
          type: "string",
          enum: ["short", "long", "clock"],
          description: "Output format",
        },
      },
      required: ["ms"],
    },
    handler: ({ ms, format = "short" }) => {
      const milliseconds = ms as number;
      const seconds = Math.floor(milliseconds / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      const s = seconds % 60;
      const m = minutes % 60;
      const h = hours % 24;

      switch (format) {
        case "clock":
          if (days > 0) return `${days}:${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
          if (hours > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
          return `${m}:${s.toString().padStart(2, "0")}`;
        case "long":
          const parts = [];
          if (days) parts.push(`${days} day${days > 1 ? "s" : ""}`);
          if (h) parts.push(`${h} hour${h > 1 ? "s" : ""}`);
          if (m) parts.push(`${m} minute${m > 1 ? "s" : ""}`);
          if (s || parts.length === 0) parts.push(`${s} second${s !== 1 ? "s" : ""}`);
          return parts.join(", ");
        default: // short
          if (days) return `${days}d ${h}h`;
          if (hours) return `${h}h ${m}m`;
          if (minutes) return `${m}m ${s}s`;
          if (seconds) return `${s}s`;
          return `${milliseconds}ms`;
      }
    },
  },
  {
    name: "format_percent",
    description: "Format number as percentage",
    category: "format",
    inputSchema: {
      type: "object",
      properties: {
        value: { type: "number", description: "Value (0.5 = 50%)" },
        decimals: { type: "number", description: "Decimal places" },
        locale: { type: "string", description: "Locale" },
      },
      required: ["value"],
    },
    handler: ({ value, decimals = 0, locale = "en-US" }) =>
      new Intl.NumberFormat(locale as string, {
        style: "percent",
        minimumFractionDigits: decimals as number,
        maximumFractionDigits: decimals as number,
      }).format(value as number),
  },
  {
    name: "format_ordinal",
    description: "Format number as ordinal (1st, 2nd, 3rd, etc.)",
    category: "format",
    inputSchema: {
      type: "object",
      properties: {
        value: { type: "number", description: "Number to format" },
      },
      required: ["value"],
    },
    handler: ({ value }) => {
      const n = value as number;
      const pr = new Intl.PluralRules("en-US", { type: "ordinal" });
      const suffixes: Record<string, string> = {
        one: "st",
        two: "nd",
        few: "rd",
        other: "th",
      };
      return `${n}${suffixes[pr.select(n)]}`;
    },
  },
  {
    name: "format_list",
    description: "Format array as localized list (e.g., 'a, b, and c')",
    category: "format",
    inputSchema: {
      type: "object",
      properties: {
        items: { type: "array", items: { type: "string" }, description: "Items to format" },
        style: {
          type: "string",
          enum: ["long", "short", "narrow"],
          description: "List style",
        },
        type: {
          type: "string",
          enum: ["conjunction", "disjunction", "unit"],
          description: "List type (and/or/unit)",
        },
        locale: { type: "string", description: "Locale" },
      },
      required: ["items"],
    },
    handler: ({ items, style = "long", type = "conjunction", locale = "en-US" }) =>
      new Intl.ListFormat(locale as string, {
        style: style as "long" | "short" | "narrow",
        type: type as "conjunction" | "disjunction" | "unit",
      }).format(items as string[]),
  },
  {
    name: "format_relative_time",
    description: "Format relative time (e.g., '2 days ago')",
    category: "format",
    inputSchema: {
      type: "object",
      properties: {
        value: { type: "number", description: "Relative value (negative for past)" },
        unit: {
          type: "string",
          enum: ["second", "minute", "hour", "day", "week", "month", "year"],
          description: "Time unit",
        },
        style: {
          type: "string",
          enum: ["long", "short", "narrow"],
          description: "Output style",
        },
        locale: { type: "string", description: "Locale" },
      },
      required: ["value", "unit"],
    },
    handler: ({ value, unit, style = "long", locale = "en-US" }) =>
      new Intl.RelativeTimeFormat(locale as string, {
        style: style as "long" | "short" | "narrow",
      }).format(value as number, unit as Intl.RelativeTimeFormatUnit),
  },
  {
    name: "format_plural",
    description: "Select plural form based on count",
    category: "format",
    inputSchema: {
      type: "object",
      properties: {
        count: { type: "number", description: "Count" },
        forms: {
          type: "object",
          description: "Plural forms { one: 'item', other: 'items' }",
        },
        locale: { type: "string", description: "Locale" },
      },
      required: ["count", "forms"],
    },
    handler: ({ count, forms, locale = "en-US" }) => {
      const pr = new Intl.PluralRules(locale as string);
      const f = forms as Record<string, string>;
      const category = pr.select(count as number);
      return f[category] || f.other || Object.values(f)[0];
    },
  },
  {
    name: "format_truncate",
    description: "Truncate text with ellipsis",
    category: "format",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to truncate" },
        length: { type: "number", description: "Max length" },
        end: { type: "string", description: "End string (default: '...')" },
        wordBoundary: { type: "boolean", description: "Break at word boundary" },
      },
      required: ["text", "length"],
    },
    handler: ({ text, length, end = "...", wordBoundary = false }) => {
      const t = text as string;
      const l = length as number;
      const e = end as string;

      if (t.length <= l) return t;

      const trimmedLength = l - e.length;
      let trimmed = t.slice(0, trimmedLength);

      if (wordBoundary) {
        const lastSpace = trimmed.lastIndexOf(" ");
        if (lastSpace > trimmedLength / 2) {
          trimmed = trimmed.slice(0, lastSpace);
        }
      }

      return trimmed + e;
    },
  },
  // Inspired by IT-Tools MCP: https://github.com/wrenchpilot/it-tools-mcp
  {
    name: "format_yaml_to_json",
    description: "Convert YAML to JSON",
    category: "format",
    inputSchema: {
      type: "object",
      properties: {
        yaml: { type: "string", description: "YAML string to convert" },
        pretty: { type: "boolean", description: "Pretty print JSON (default: true)" },
      },
      required: ["yaml"],
    },
    handler: ({ yaml: yamlStr, pretty = true }) => {
      const parsed = yaml.parse(yamlStr as string);
      return pretty ? JSON.stringify(parsed, null, 2) : JSON.stringify(parsed);
    },
  },
  {
    name: "format_json_to_yaml",
    description: "Convert JSON to YAML",
    category: "format",
    inputSchema: {
      type: "object",
      properties: {
        json: { type: "string", description: "JSON string to convert" },
        indent: { type: "number", description: "Indentation spaces (default: 2)" },
      },
      required: ["json"],
    },
    handler: ({ json, indent = 2 }) => {
      const parsed = JSON.parse(json as string);
      return yaml.stringify(parsed, { indent: indent as number });
    },
  },
  {
    name: "format_markdown_to_html",
    description: "Convert Markdown to HTML (basic conversion)",
    category: "format",
    inputSchema: {
      type: "object",
      properties: {
        markdown: { type: "string", description: "Markdown text" },
      },
      required: ["markdown"],
    },
    handler: ({ markdown }) => {
      let html = markdown as string;

      // Headers
      html = html.replace(/^###### (.+)$/gm, "<h6>$1</h6>");
      html = html.replace(/^##### (.+)$/gm, "<h5>$1</h5>");
      html = html.replace(/^#### (.+)$/gm, "<h4>$1</h4>");
      html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
      html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
      html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

      // Bold and italic
      html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
      html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
      html = html.replace(/___(.+?)___/g, "<strong><em>$1</em></strong>");
      html = html.replace(/__(.+?)__/g, "<strong>$1</strong>");
      html = html.replace(/_(.+?)_/g, "<em>$1</em>");

      // Code
      html = html.replace(/```(\w*)\n([\s\S]*?)```/g, "<pre><code class=\"language-$1\">$2</code></pre>");
      html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

      // Links and images
      html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
      html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

      // Lists
      html = html.replace(/^\* (.+)$/gm, "<li>$1</li>");
      html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
      html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");

      // Horizontal rule
      html = html.replace(/^---$/gm, "<hr>");
      html = html.replace(/^\*\*\*$/gm, "<hr>");

      // Blockquotes
      html = html.replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>");

      // Paragraphs (simple: wrap non-tag lines)
      html = html.replace(/^(?!<[a-z]|$)(.+)$/gm, "<p>$1</p>");

      return html;
    },
  },
  {
    name: "format_html_to_markdown",
    description: "Convert HTML to Markdown (basic conversion)",
    category: "format",
    inputSchema: {
      type: "object",
      properties: {
        html: { type: "string", description: "HTML text" },
      },
      required: ["html"],
    },
    handler: ({ html }) => {
      let md = html as string;

      // Headers
      md = md.replace(/<h1[^>]*>([^<]+)<\/h1>/gi, "# $1\n");
      md = md.replace(/<h2[^>]*>([^<]+)<\/h2>/gi, "## $1\n");
      md = md.replace(/<h3[^>]*>([^<]+)<\/h3>/gi, "### $1\n");
      md = md.replace(/<h4[^>]*>([^<]+)<\/h4>/gi, "#### $1\n");
      md = md.replace(/<h5[^>]*>([^<]+)<\/h5>/gi, "##### $1\n");
      md = md.replace(/<h6[^>]*>([^<]+)<\/h6>/gi, "###### $1\n");

      // Bold and italic
      md = md.replace(/<strong>([^<]+)<\/strong>/gi, "**$1**");
      md = md.replace(/<b>([^<]+)<\/b>/gi, "**$1**");
      md = md.replace(/<em>([^<]+)<\/em>/gi, "*$1*");
      md = md.replace(/<i>([^<]+)<\/i>/gi, "*$1*");

      // Code
      md = md.replace(/<pre><code[^>]*>([^<]+)<\/code><\/pre>/gi, "```\n$1```\n");
      md = md.replace(/<code>([^<]+)<\/code>/gi, "`$1`");

      // Links and images
      md = md.replace(/<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi, "[$2]($1)");
      md = md.replace(/<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, "![$2]($1)");
      md = md.replace(/<img[^>]+alt="([^"]*)"[^>]*src="([^"]+)"[^>]*\/?>/gi, "![$1]($2)");

      // Lists
      md = md.replace(/<li>([^<]+)<\/li>/gi, "- $1\n");

      // Horizontal rule
      md = md.replace(/<hr\s*\/?>/gi, "---\n");

      // Blockquotes
      md = md.replace(/<blockquote>([^<]+)<\/blockquote>/gi, "> $1\n");

      // Paragraphs and breaks
      md = md.replace(/<p>([^<]+)<\/p>/gi, "$1\n\n");
      md = md.replace(/<br\s*\/?>/gi, "\n");

      // Remove remaining tags
      md = md.replace(/<[^>]+>/g, "");

      // Clean up whitespace
      md = md.replace(/\n{3,}/g, "\n\n").trim();

      return md;
    },
  },
  {
    name: "format_json_pretty",
    description: "Pretty print or minify JSON",
    category: "format",
    inputSchema: {
      type: "object",
      properties: {
        json: { type: "string", description: "JSON string" },
        minify: { type: "boolean", description: "Minify instead of prettify" },
        indent: { type: "number", description: "Indentation spaces (default: 2)" },
      },
      required: ["json"],
    },
    handler: ({ json, minify = false, indent = 2 }) => {
      const parsed = JSON.parse(json as string);
      return minify ? JSON.stringify(parsed) : JSON.stringify(parsed, null, indent as number);
    },
  },
  {
    name: "format_json_to_csv",
    description: "Convert JSON array to CSV format",
    category: "format",
    inputSchema: {
      type: "object",
      properties: {
        json: { type: "string", description: "JSON array string" },
        delimiter: { type: "string", description: "Column delimiter (default: ',')" },
        includeHeaders: { type: "boolean", description: "Include header row (default: true)" },
      },
      required: ["json"],
    },
    handler: ({ json, delimiter = ",", includeHeaders = true }) => {
      const data = JSON.parse(json as string);
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error("Input must be a non-empty JSON array");
      }

      const delim = delimiter as string;
      const escapeCell = (val: unknown): string => {
        const str = val === null || val === undefined ? "" : String(val);
        if (str.includes(delim) || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const headers = Object.keys(data[0]);
      const rows: string[] = [];

      if (includeHeaders) {
        rows.push(headers.map(escapeCell).join(delim));
      }

      for (const item of data) {
        const row = headers.map((h) => escapeCell((item as Record<string, unknown>)[h]));
        rows.push(row.join(delim));
      }

      return rows.join("\n");
    },
  },
  {
    name: "format_sql",
    description: "Format SQL query for readability",
    category: "format",
    inputSchema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "SQL query to format" },
        uppercase: { type: "boolean", description: "Uppercase keywords (default: true)" },
        indent: { type: "number", description: "Indentation spaces (default: 2)" },
      },
      required: ["sql"],
    },
    handler: ({ sql, uppercase = true, indent = 2 }) => {
      const keywords = [
        "SELECT", "FROM", "WHERE", "AND", "OR", "ORDER BY", "GROUP BY", "HAVING",
        "JOIN", "LEFT JOIN", "RIGHT JOIN", "INNER JOIN", "OUTER JOIN", "FULL JOIN",
        "ON", "AS", "INSERT INTO", "VALUES", "UPDATE", "SET", "DELETE FROM",
        "CREATE TABLE", "ALTER TABLE", "DROP TABLE", "CREATE INDEX", "DROP INDEX",
        "LIMIT", "OFFSET", "UNION", "UNION ALL", "DISTINCT", "COUNT", "SUM", "AVG",
        "MIN", "MAX", "CASE", "WHEN", "THEN", "ELSE", "END", "NULL", "NOT NULL",
        "PRIMARY KEY", "FOREIGN KEY", "REFERENCES", "IN", "LIKE", "BETWEEN", "IS",
      ];

      let formatted = sql as string;
      const indentStr = " ".repeat(indent as number);

      // Normalize whitespace
      formatted = formatted.replace(/\s+/g, " ").trim();

      // Add newlines before major keywords
      const majorKeywords = [
        "SELECT", "FROM", "WHERE", "ORDER BY", "GROUP BY", "HAVING",
        "JOIN", "LEFT JOIN", "RIGHT JOIN", "INNER JOIN", "OUTER JOIN",
        "LIMIT", "UNION", "INSERT INTO", "UPDATE", "DELETE FROM", "SET",
      ];

      for (const kw of majorKeywords) {
        const regex = new RegExp(`\\b${kw}\\b`, "gi");
        formatted = formatted.replace(regex, `\n${kw}`);
      }

      // Add newlines after commas in SELECT
      formatted = formatted.replace(/,\s*/g, ",\n" + indentStr);

      // Indent after major keywords
      const lines = formatted.split("\n").map((line) => line.trim()).filter(Boolean);
      const result: string[] = [];

      for (const line of lines) {
        const upperLine = line.toUpperCase();
        if (upperLine.startsWith("SELECT") || upperLine.startsWith("FROM") ||
            upperLine.startsWith("WHERE") || upperLine.startsWith("ORDER") ||
            upperLine.startsWith("GROUP") || upperLine.startsWith("HAVING") ||
            upperLine.startsWith("LIMIT")) {
          result.push(line);
        } else if (upperLine.includes("JOIN")) {
          result.push(line);
        } else {
          result.push(indentStr + line);
        }
      }

      formatted = result.join("\n");

      // Uppercase keywords if requested
      if (uppercase) {
        for (const kw of keywords) {
          const regex = new RegExp(`\\b${kw}\\b`, "gi");
          formatted = formatted.replace(regex, kw);
        }
      }

      return formatted.trim();
    },
  },
  {
    name: "format_phone",
    description: "Format phone number to standard format",
    category: "format",
    inputSchema: {
      type: "object",
      properties: {
        phone: { type: "string", description: "Phone number to format" },
        format: {
          type: "string",
          enum: ["international", "national", "e164"],
          description: "Output format (default: international)",
        },
        defaultCountry: { type: "string", description: "Default country code (default: US)" },
      },
      required: ["phone"],
    },
    handler: ({ phone, format = "international", defaultCountry = "US" }) => {
      // Remove all non-digit characters except leading +
      let cleaned = (phone as string).replace(/[^\d+]/g, "");

      // Extract country code if present
      let countryCode = "";
      let nationalNumber = cleaned;

      if (cleaned.startsWith("+")) {
        // Has country code
        if (cleaned.startsWith("+1")) {
          countryCode = "+1";
          nationalNumber = cleaned.slice(2);
        } else if (cleaned.length > 10) {
          // Assume 2-3 digit country code
          const ccLength = cleaned.length > 12 ? 3 : 2;
          countryCode = cleaned.slice(0, ccLength + 1);
          nationalNumber = cleaned.slice(ccLength + 1);
        }
      } else if (defaultCountry === "US" && cleaned.length === 10) {
        countryCode = "+1";
        nationalNumber = cleaned;
      } else if (cleaned.length === 11 && cleaned.startsWith("1")) {
        countryCode = "+1";
        nationalNumber = cleaned.slice(1);
      }

      // Format based on requested format
      switch (format) {
        case "e164":
          return countryCode + nationalNumber;
        case "national":
          if (nationalNumber.length === 10) {
            return `(${nationalNumber.slice(0, 3)}) ${nationalNumber.slice(3, 6)}-${nationalNumber.slice(6)}`;
          }
          return nationalNumber;
        case "international":
        default:
          if (nationalNumber.length === 10 && countryCode) {
            return `${countryCode} (${nationalNumber.slice(0, 3)}) ${nationalNumber.slice(3, 6)}-${nationalNumber.slice(6)}`;
          }
          return countryCode + " " + nationalNumber;
      }
    },
  },
];
