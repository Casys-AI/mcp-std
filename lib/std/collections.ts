/**
 * Collection/array manipulation tools
 *
 * Uses lodash-es for robust implementations.
 *
 * @module lib/std/collections
 */

import {
  map,
  filter,
  sortBy,
  orderBy,
  uniq,
  uniqBy,
  groupBy,
  flatten,
  flattenDeep,
  chunk,
  compact,
  difference,
  intersection,
  union,
  keyBy,
  partition,
  shuffle,
  sample,
  sampleSize,
  take,
  takeRight,
  drop,
  dropRight,
  zip,
  zipObject,
  countBy,
} from "lodash-es";
import type { MiniTool } from "./types.ts";

export const collectionsTools: MiniTool[] = [
  {
    name: "array_map",
    description: "Transform each element by extracting a property path",
    category: "collections",
    inputSchema: {
      type: "object",
      properties: {
        items: { type: "array", description: "Array to transform" },
        path: { type: "string", description: "Property path to extract (e.g., 'name', 'user.email')" },
      },
      required: ["items", "path"],
    },
    handler: ({ items, path }) => map(items as unknown[], path as string),
  },
  {
    name: "array_filter",
    description: "Filter elements matching properties",
    category: "collections",
    inputSchema: {
      type: "object",
      properties: {
        items: { type: "array", description: "Array to filter" },
        predicate: {
          type: "object",
          description: "Object with properties to match (e.g., { active: true })",
        },
      },
      required: ["items", "predicate"],
    },
    handler: ({ items, predicate }) => filter(items as unknown[], predicate as object),
  },
  {
    name: "array_sort",
    description: "Sort array by one or more keys",
    category: "collections",
    inputSchema: {
      type: "object",
      properties: {
        items: { type: "array", description: "Array to sort" },
        keys: {
          type: "array",
          items: { type: "string" },
          description: "Keys to sort by (e.g., ['name', 'age'])",
        },
        orders: {
          type: "array",
          items: { type: "string", enum: ["asc", "desc"] },
          description: "Sort orders for each key",
        },
      },
      required: ["items"],
    },
    handler: ({ items, keys, orders }) => {
      if (!keys) return sortBy(items as unknown[]);
      return orderBy(
        items as unknown[],
        keys as string[],
        (orders as ("asc" | "desc")[]) || [],
      );
    },
  },
  {
    name: "array_unique",
    description: "Remove duplicate values from array",
    category: "collections",
    inputSchema: {
      type: "object",
      properties: {
        items: { type: "array", description: "Array to deduplicate" },
        key: { type: "string", description: "Key to compare (for objects)" },
      },
      required: ["items"],
    },
    handler: ({ items, key }) => {
      if (!key) return uniq(items as unknown[]);
      return uniqBy(items as unknown[], key as string);
    },
  },
  {
    name: "array_group",
    description: "Group array elements by a key",
    category: "collections",
    inputSchema: {
      type: "object",
      properties: {
        items: { type: "array", description: "Array to group" },
        key: { type: "string", description: "Key to group by" },
      },
      required: ["items", "key"],
    },
    handler: ({ items, key }) => groupBy(items as unknown[], key as string),
  },
  {
    name: "array_flatten",
    description: "Flatten nested arrays",
    category: "collections",
    inputSchema: {
      type: "object",
      properties: {
        items: { type: "array", description: "Nested array to flatten" },
        deep: { type: "boolean", description: "Flatten recursively (default: false)" },
      },
      required: ["items"],
    },
    handler: ({ items, deep = false }) =>
      deep ? flattenDeep(items as unknown[]) : flatten(items as unknown[]),
  },
  {
    name: "array_chunk",
    description: "Split array into chunks of specified size",
    category: "collections",
    inputSchema: {
      type: "object",
      properties: {
        items: { type: "array", description: "Array to chunk" },
        size: { type: "number", description: "Chunk size" },
      },
      required: ["items", "size"],
    },
    handler: ({ items, size }) => chunk(items as unknown[], size as number),
  },
  {
    name: "array_compact",
    description: "Remove falsy values (null, undefined, 0, '', false) from array",
    category: "collections",
    inputSchema: {
      type: "object",
      properties: {
        items: { type: "array", description: "Array to compact" },
      },
      required: ["items"],
    },
    handler: ({ items }) => compact(items as unknown[]),
  },
  {
    name: "array_difference",
    description: "Get values in first array that are not in the others",
    category: "collections",
    inputSchema: {
      type: "object",
      properties: {
        items: { type: "array", description: "Primary array" },
        exclude: { type: "array", description: "Values to exclude" },
      },
      required: ["items", "exclude"],
    },
    handler: ({ items, exclude }) => difference(items as unknown[], exclude as unknown[]),
  },
  {
    name: "array_intersection",
    description: "Get values that exist in all arrays",
    category: "collections",
    inputSchema: {
      type: "object",
      properties: {
        arrays: { type: "array", items: { type: "array" }, description: "Arrays to intersect" },
      },
      required: ["arrays"],
    },
    handler: ({ arrays }) => {
      const arrs = arrays as unknown[][];
      return arrs.reduce((acc, arr) => intersection(acc, arr), arrs[0] || []);
    },
  },
  {
    name: "array_union",
    description: "Combine arrays and remove duplicates",
    category: "collections",
    inputSchema: {
      type: "object",
      properties: {
        arrays: { type: "array", items: { type: "array" }, description: "Arrays to combine" },
      },
      required: ["arrays"],
    },
    handler: ({ arrays }) => {
      const arrs = arrays as unknown[][];
      return arrs.reduce((acc, arr) => union(acc, arr), []);
    },
  },
  {
    name: "array_keyby",
    description: "Create object keyed by a property of array elements",
    category: "collections",
    inputSchema: {
      type: "object",
      properties: {
        items: { type: "array", description: "Array of objects" },
        key: { type: "string", description: "Property to use as key" },
      },
      required: ["items", "key"],
    },
    handler: ({ items, key }) => keyBy(items as unknown[], key as string),
  },
  {
    name: "array_partition",
    description: "Split array into two groups based on predicate",
    category: "collections",
    inputSchema: {
      type: "object",
      properties: {
        items: { type: "array", description: "Array to partition" },
        predicate: { type: "object", description: "Properties to match for truthy group" },
      },
      required: ["items", "predicate"],
    },
    handler: ({ items, predicate }) => {
      const [truthy, falsy] = partition(items as unknown[], predicate as object);
      return { truthy, falsy };
    },
  },
  {
    name: "array_shuffle",
    description: "Randomly shuffle array elements",
    category: "collections",
    inputSchema: {
      type: "object",
      properties: {
        items: { type: "array", description: "Array to shuffle" },
      },
      required: ["items"],
    },
    handler: ({ items }) => shuffle(items as unknown[]),
  },
  {
    name: "array_sample",
    description: "Get random element(s) from array",
    category: "collections",
    inputSchema: {
      type: "object",
      properties: {
        items: { type: "array", description: "Array to sample from" },
        count: { type: "number", description: "Number of samples (default: 1)" },
      },
      required: ["items"],
    },
    handler: ({ items, count = 1 }) => {
      if (count === 1) return sample(items as unknown[]);
      return sampleSize(items as unknown[], count as number);
    },
  },
  {
    name: "array_take",
    description: "Take first or last N elements",
    category: "collections",
    inputSchema: {
      type: "object",
      properties: {
        items: { type: "array", description: "Array" },
        count: { type: "number", description: "Number of elements" },
        from: { type: "string", enum: ["start", "end"], description: "Where to take from" },
      },
      required: ["items", "count"],
    },
    handler: ({ items, count, from = "start" }) =>
      from === "end"
        ? takeRight(items as unknown[], count as number)
        : take(items as unknown[], count as number),
  },
  {
    name: "array_drop",
    description: "Drop first or last N elements",
    category: "collections",
    inputSchema: {
      type: "object",
      properties: {
        items: { type: "array", description: "Array" },
        count: { type: "number", description: "Number of elements to drop" },
        from: { type: "string", enum: ["start", "end"], description: "Where to drop from" },
      },
      required: ["items", "count"],
    },
    handler: ({ items, count, from = "start" }) =>
      from === "end"
        ? dropRight(items as unknown[], count as number)
        : drop(items as unknown[], count as number),
  },
  {
    name: "array_zip",
    description: "Combine multiple arrays into array of tuples",
    category: "collections",
    inputSchema: {
      type: "object",
      properties: {
        arrays: { type: "array", items: { type: "array" }, description: "Arrays to zip" },
      },
      required: ["arrays"],
    },
    handler: ({ arrays }) => zip(...(arrays as unknown[][])),
  },
  {
    name: "array_zip_object",
    description: "Create object from arrays of keys and values",
    category: "collections",
    inputSchema: {
      type: "object",
      properties: {
        keys: { type: "array", items: { type: "string" }, description: "Array of keys" },
        values: { type: "array", description: "Array of values" },
      },
      required: ["keys", "values"],
    },
    handler: ({ keys, values }) => zipObject(keys as string[], values as unknown[]),
  },
  {
    name: "array_count_by",
    description: "Count elements by a key or iteratee",
    category: "collections",
    inputSchema: {
      type: "object",
      properties: {
        items: { type: "array", description: "Array to count" },
        key: { type: "string", description: "Property to count by" },
      },
      required: ["items", "key"],
    },
    handler: ({ items, key }) => countBy(items as unknown[], key as string),
  },
];
