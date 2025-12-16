/**
 * JSON manipulation tools
 *
 * @module lib/primitives/json
 */

import jmespath from "jmespath";
import type { MiniTool } from "./types.ts";

export const jsonTools: MiniTool[] = [
  {
    name: "json_parse",
    description: "Parse JSON string into object",
    category: "json",
    inputSchema: {
      type: "object",
      properties: {
        json: { type: "string", description: "JSON string to parse" },
      },
      required: ["json"],
    },
    handler: ({ json }) => JSON.parse(json as string),
  },
  {
    name: "json_stringify",
    description: "Convert object to JSON string",
    category: "json",
    inputSchema: {
      type: "object",
      properties: {
        data: { description: "Data to stringify" },
        pretty: { type: "boolean", description: "Pretty print (default: false)" },
      },
      required: ["data"],
    },
    handler: ({ data, pretty = false }) => JSON.stringify(data, null, pretty ? 2 : 0),
  },
  {
    name: "json_query",
    description:
      "Query JSON data using JMESPath expressions (e.g., 'people[?age > `20`].name')",
    category: "json",
    inputSchema: {
      type: "object",
      properties: {
        data: { description: "JSON data to query" },
        expression: {
          type: "string",
          description: "JMESPath expression (e.g., 'user.name', 'items[0]', 'people[?active].name')",
        },
      },
      required: ["data", "expression"],
    },
    handler: ({ data, expression }) => {
      try {
        return jmespath.search(data, expression as string);
      } catch {
        // Fallback to simple dot notation for backward compatibility
        const parts = (expression as string).split(".");
        let result: unknown = data;
        for (const part of parts) {
          if (result === null || result === undefined) return undefined;
          result = (result as Record<string, unknown>)[part];
        }
        return result;
      }
    },
  },
  {
    name: "json_merge",
    description: "Deep merge multiple objects",
    category: "json",
    inputSchema: {
      type: "object",
      properties: {
        objects: { type: "array", items: { type: "object" }, description: "Objects to merge" },
      },
      required: ["objects"],
    },
    handler: ({ objects }) => {
      const deepMerge = (
        target: Record<string, unknown>,
        source: Record<string, unknown>,
      ): Record<string, unknown> => {
        const result = { ...target };
        for (const key of Object.keys(source)) {
          if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
            result[key] = deepMerge(
              (result[key] as Record<string, unknown>) || {},
              source[key] as Record<string, unknown>,
            );
          } else {
            result[key] = source[key];
          }
        }
        return result;
      };
      return (objects as Record<string, unknown>[]).reduce(
        (acc, obj) => deepMerge(acc, obj),
        {} as Record<string, unknown>,
      );
    },
  },
  {
    name: "json_keys",
    description: "Get all keys from an object (optionally nested)",
    category: "json",
    inputSchema: {
      type: "object",
      properties: {
        data: { type: "object", description: "Object to get keys from" },
        nested: { type: "boolean", description: "Include nested keys with dot notation" },
      },
      required: ["data"],
    },
    handler: ({ data, nested = false }) => {
      if (!nested) return Object.keys(data as Record<string, unknown>);
      const keys: string[] = [];
      const walk = (obj: Record<string, unknown>, prefix = "") => {
        for (const key of Object.keys(obj)) {
          const path = prefix ? `${prefix}.${key}` : key;
          keys.push(path);
          if (obj[key] && typeof obj[key] === "object" && !Array.isArray(obj[key])) {
            walk(obj[key] as Record<string, unknown>, path);
          }
        }
      };
      walk(data as Record<string, unknown>);
      return keys;
    },
  },
];
