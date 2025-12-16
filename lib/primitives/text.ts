/**
 * Text manipulation tools
 *
 * @module lib/primitives/text
 */

import * as changeCase from "change-case";
import type { MiniTool } from "./types.ts";

export const textTools: MiniTool[] = [
  {
    name: "text_split",
    description: "Split a string by delimiter into an array",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to split" },
        delimiter: { type: "string", description: "Delimiter (default: ',')" },
      },
      required: ["text"],
    },
    handler: ({ text, delimiter = "," }) => (text as string).split(delimiter as string),
  },
  {
    name: "text_join",
    description: "Join an array of strings with a delimiter",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        items: { type: "array", items: { type: "string" }, description: "Items to join" },
        delimiter: { type: "string", description: "Delimiter (default: ',')" },
      },
      required: ["items"],
    },
    handler: ({ items, delimiter = "," }) => (items as string[]).join(delimiter as string),
  },
  {
    name: "text_template",
    description: "Replace {{placeholders}} in a template string",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        template: { type: "string", description: "Template with {{placeholders}}" },
        values: { type: "object", description: "Key-value pairs for replacement" },
      },
      required: ["template", "values"],
    },
    handler: ({ template, values }) => {
      let result = template as string;
      for (const [key, value] of Object.entries(values as Record<string, string>)) {
        result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value));
      }
      return result;
    },
  },
  {
    name: "text_case",
    description:
      "Convert text case (upper, lower, title, camel, snake, kebab, pascal, constant, dot, path, sentence)",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to convert" },
        case: {
          type: "string",
          enum: [
            "upper",
            "lower",
            "title",
            "camel",
            "snake",
            "kebab",
            "pascal",
            "constant",
            "dot",
            "path",
            "sentence",
          ],
          description: "Target case",
        },
      },
      required: ["text", "case"],
    },
    handler: ({ text, case: targetCase }) => {
      const s = text as string;
      switch (targetCase) {
        case "upper":
          return s.toUpperCase();
        case "lower":
          return s.toLowerCase();
        case "title":
          return changeCase.capitalCase(s);
        case "camel":
          return changeCase.camelCase(s);
        case "snake":
          return changeCase.snakeCase(s);
        case "kebab":
          return changeCase.kebabCase(s);
        case "pascal":
          return changeCase.pascalCase(s);
        case "constant":
          return changeCase.constantCase(s);
        case "dot":
          return changeCase.dotCase(s);
        case "path":
          return changeCase.pathCase(s);
        case "sentence":
          return changeCase.sentenceCase(s);
        default:
          return s;
      }
    },
  },
  {
    name: "text_regex",
    description: "Match or replace using regular expression",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Input text" },
        pattern: { type: "string", description: "Regex pattern" },
        replacement: { type: "string", description: "Replacement (if replacing)" },
        flags: { type: "string", description: "Regex flags (default: 'g')" },
      },
      required: ["text", "pattern"],
    },
    handler: ({ text, pattern, replacement, flags = "g" }) => {
      const regex = new RegExp(pattern as string, flags as string);
      if (replacement !== undefined) {
        return (text as string).replace(regex, replacement as string);
      }
      return (text as string).match(regex) || [];
    },
  },
  {
    name: "text_trim",
    description: "Trim whitespace from text (start, end, or both)",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to trim" },
        side: { type: "string", enum: ["both", "start", "end"], description: "Side to trim" },
      },
      required: ["text"],
    },
    handler: ({ text, side = "both" }) => {
      const s = text as string;
      switch (side) {
        case "start":
          return s.trimStart();
        case "end":
          return s.trimEnd();
        default:
          return s.trim();
      }
    },
  },
  {
    name: "text_count",
    description: "Count words, characters, or lines in text",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Input text" },
        unit: { type: "string", enum: ["words", "chars", "lines"], description: "What to count" },
      },
      required: ["text"],
    },
    handler: ({ text, unit = "words" }) => {
      const s = text as string;
      switch (unit) {
        case "chars":
          return s.length;
        case "lines":
          return s.split("\n").length;
        default:
          return s.trim().split(/\s+/).filter(Boolean).length;
      }
    },
  },
  {
    name: "text_pad",
    description: "Pad text to a specified length",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to pad" },
        length: { type: "number", description: "Target length" },
        char: { type: "string", description: "Padding character (default: ' ')" },
        side: { type: "string", enum: ["start", "end", "both"], description: "Side to pad" },
      },
      required: ["text", "length"],
    },
    handler: ({ text, length, char = " ", side = "end" }) => {
      const s = text as string;
      const len = length as number;
      const c = (char as string)[0] || " ";
      switch (side) {
        case "start":
          return s.padStart(len, c);
        case "both": {
          const totalPad = len - s.length;
          const padStart = Math.floor(totalPad / 2);
          return s.padStart(s.length + padStart, c).padEnd(len, c);
        }
        default:
          return s.padEnd(len, c);
      }
    },
  },
];
