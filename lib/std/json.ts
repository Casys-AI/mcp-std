/**
 * JSON manipulation tools
 *
 * @module lib/std/json
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
  {
    name: "json_flatten",
    description: "Flatten nested object to dot notation keys (e.g., { a: { b: 1 } } → { 'a.b': 1 })",
    category: "json",
    inputSchema: {
      type: "object",
      properties: {
        data: { type: "object", description: "Nested object to flatten" },
        delimiter: { type: "string", description: "Key delimiter (default: '.')" },
      },
      required: ["data"],
    },
    handler: ({ data, delimiter = "." }) => {
      const result: Record<string, unknown> = {};
      const flatten = (obj: Record<string, unknown>, prefix = "") => {
        for (const key of Object.keys(obj)) {
          const path = prefix ? `${prefix}${delimiter}${key}` : key;
          const value = obj[key];
          if (value && typeof value === "object" && !Array.isArray(value)) {
            flatten(value as Record<string, unknown>, path);
          } else {
            result[path] = value;
          }
        }
      };
      flatten(data as Record<string, unknown>);
      return result;
    },
  },
  {
    name: "json_unflatten",
    description: "Unflatten dot notation keys to nested object (e.g., { 'a.b': 1 } → { a: { b: 1 } })",
    category: "json",
    inputSchema: {
      type: "object",
      properties: {
        data: { type: "object", description: "Flat object to unflatten" },
        delimiter: { type: "string", description: "Key delimiter (default: '.')" },
      },
      required: ["data"],
    },
    handler: ({ data, delimiter = "." }) => {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        const parts = key.split(delimiter as string);
        let current = result;
        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i];
          if (!(part in current)) {
            current[part] = {};
          }
          current = current[part] as Record<string, unknown>;
        }
        current[parts[parts.length - 1]] = value;
      }
      return result;
    },
  },
  {
    name: "json_pick",
    description: "Pick only specified keys from object",
    category: "json",
    inputSchema: {
      type: "object",
      properties: {
        data: { type: "object", description: "Source object" },
        keys: { type: "array", items: { type: "string" }, description: "Keys to pick" },
      },
      required: ["data", "keys"],
    },
    handler: ({ data, keys }) => {
      const result: Record<string, unknown> = {};
      for (const key of keys as string[]) {
        if (key in (data as Record<string, unknown>)) {
          result[key] = (data as Record<string, unknown>)[key];
        }
      }
      return result;
    },
  },
  {
    name: "json_omit",
    description: "Omit specified keys from object",
    category: "json",
    inputSchema: {
      type: "object",
      properties: {
        data: { type: "object", description: "Source object" },
        keys: { type: "array", items: { type: "string" }, description: "Keys to omit" },
      },
      required: ["data", "keys"],
    },
    handler: ({ data, keys }) => {
      const keysSet = new Set(keys as string[]);
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        if (!keysSet.has(key)) {
          result[key] = value;
        }
      }
      return result;
    },
  },
  {
    name: "json_compare",
    description: "Compare two JSON objects and show differences",
    category: "json",
    inputSchema: {
      type: "object",
      properties: {
        obj1: { description: "First object to compare" },
        obj2: { description: "Second object to compare" },
        ignoreOrder: { type: "boolean", description: "Ignore array order (default: false)" },
      },
      required: ["obj1", "obj2"],
    },
    handler: ({ obj1, obj2, ignoreOrder = false }) => {
      type Diff = {
        path: string;
        type: "added" | "removed" | "changed" | "type_changed";
        oldValue?: unknown;
        newValue?: unknown;
      };

      const diffs: Diff[] = [];

      const compare = (a: unknown, b: unknown, path: string) => {
        // Same reference or both null/undefined
        if (a === b) return;

        // Type mismatch
        const typeA = Array.isArray(a) ? "array" : typeof a;
        const typeB = Array.isArray(b) ? "array" : typeof b;

        if (typeA !== typeB) {
          diffs.push({ path, type: "type_changed", oldValue: a, newValue: b });
          return;
        }

        // Arrays
        if (Array.isArray(a) && Array.isArray(b)) {
          if (ignoreOrder) {
            // Compare as sets (simplified)
            const setA = new Set(a.map((x) => JSON.stringify(x)));
            const setB = new Set(b.map((x) => JSON.stringify(x)));

            for (const item of a) {
              const key = JSON.stringify(item);
              if (!setB.has(key)) {
                diffs.push({ path: `${path}[]`, type: "removed", oldValue: item });
              }
            }
            for (const item of b) {
              const key = JSON.stringify(item);
              if (!setA.has(key)) {
                diffs.push({ path: `${path}[]`, type: "added", newValue: item });
              }
            }
          } else {
            const maxLen = Math.max(a.length, b.length);
            for (let i = 0; i < maxLen; i++) {
              if (i >= a.length) {
                diffs.push({ path: `${path}[${i}]`, type: "added", newValue: b[i] });
              } else if (i >= b.length) {
                diffs.push({ path: `${path}[${i}]`, type: "removed", oldValue: a[i] });
              } else {
                compare(a[i], b[i], `${path}[${i}]`);
              }
            }
          }
          return;
        }

        // Objects
        if (typeA === "object" && a !== null && b !== null) {
          const keysA = new Set(Object.keys(a as object));
          const keysB = new Set(Object.keys(b as object));

          // Keys in A but not in B (removed)
          for (const key of keysA) {
            if (!keysB.has(key)) {
              diffs.push({
                path: path ? `${path}.${key}` : key,
                type: "removed",
                oldValue: (a as Record<string, unknown>)[key],
              });
            }
          }

          // Keys in B but not in A (added)
          for (const key of keysB) {
            if (!keysA.has(key)) {
              diffs.push({
                path: path ? `${path}.${key}` : key,
                type: "added",
                newValue: (b as Record<string, unknown>)[key],
              });
            }
          }

          // Keys in both - compare values
          for (const key of keysA) {
            if (keysB.has(key)) {
              compare(
                (a as Record<string, unknown>)[key],
                (b as Record<string, unknown>)[key],
                path ? `${path}.${key}` : key
              );
            }
          }
          return;
        }

        // Primitives
        if (a !== b) {
          diffs.push({ path, type: "changed", oldValue: a, newValue: b });
        }
      };

      compare(obj1, obj2, "");

      return {
        equal: diffs.length === 0,
        diffCount: diffs.length,
        diffs,
        summary: {
          added: diffs.filter((d) => d.type === "added").length,
          removed: diffs.filter((d) => d.type === "removed").length,
          changed: diffs.filter((d) => d.type === "changed").length,
          typeChanged: diffs.filter((d) => d.type === "type_changed").length,
        },
      };
    },
  },
];
