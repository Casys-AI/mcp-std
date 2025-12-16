/**
 * Formatting tools
 *
 * String and data formatting utilities.
 *
 * @module lib/primitives/format
 */

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
];
