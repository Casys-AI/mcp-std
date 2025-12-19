/**
 * Algorithm and data structure tools
 *
 * Uses mnemonist for advanced data structures.
 *
 * @module lib/std/algo
 */

import {
  Heap,
  MinHeap,
  MaxHeap,
  FibonacciHeap,
  Trie,
  SuffixArray,
  LRUCache,
  LRUMap,
  BloomFilter,
  CircularBuffer,
  Queue,
  Stack,
  LinkedList,
  BiMap,
  DefaultMap,
  MultiSet,
  StaticDisjointSet,
} from "mnemonist";
import type { MiniTool } from "./types.ts";

// Instances for stateful operations
const instances = new Map<string, unknown>();

export const algoTools: MiniTool[] = [
  // Priority Queue / Heap operations
  {
    name: "algo_heap_create",
    description: "Create a min or max heap (priority queue)",
    category: "algo",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Unique identifier for this heap" },
        type: { type: "string", enum: ["min", "max"], description: "Heap type" },
        items: { type: "array", description: "Initial items" },
      },
      required: ["id", "type"],
    },
    handler: ({ id, type, items }) => {
      const heap = type === "min" ? new MinHeap<unknown>() : new MaxHeap<unknown>();
      if (items) {
        for (const item of items as unknown[]) {
          heap.push(item);
        }
      }
      instances.set(id as string, heap);
      return { created: id, size: heap.size };
    },
  },
  {
    name: "algo_heap_push",
    description: "Push item(s) to heap",
    category: "algo",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Heap ID" },
        items: { type: "array", description: "Items to push" },
      },
      required: ["id", "items"],
    },
    handler: ({ id, items }) => {
      const heap = instances.get(id as string) as Heap<unknown>;
      if (!heap) return { error: "Heap not found" };
      for (const item of items as unknown[]) {
        heap.push(item);
      }
      return { size: heap.size };
    },
  },
  {
    name: "algo_heap_pop",
    description: "Pop and return top item from heap",
    category: "algo",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Heap ID" },
        count: { type: "number", description: "Number of items to pop (default: 1)" },
      },
      required: ["id"],
    },
    handler: ({ id, count = 1 }) => {
      const heap = instances.get(id as string) as Heap<unknown>;
      if (!heap) return { error: "Heap not found" };
      const items: unknown[] = [];
      for (let i = 0; i < (count as number) && heap.size > 0; i++) {
        items.push(heap.pop());
      }
      return { items, remaining: heap.size };
    },
  },

  // Trie operations
  {
    name: "algo_trie_create",
    description: "Create a trie for prefix-based operations",
    category: "algo",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Unique identifier" },
        words: { type: "array", items: { type: "string" }, description: "Initial words" },
      },
      required: ["id"],
    },
    handler: ({ id, words }) => {
      const trie = new Trie<string>();
      if (words) {
        for (const word of words as string[]) {
          trie.add(word);
        }
      }
      instances.set(id as string, trie);
      return { created: id, size: trie.size };
    },
  },
  {
    name: "algo_trie_add",
    description: "Add word(s) to trie",
    category: "algo",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Trie ID" },
        words: { type: "array", items: { type: "string" }, description: "Words to add" },
      },
      required: ["id", "words"],
    },
    handler: ({ id, words }) => {
      const trie = instances.get(id as string) as Trie<string>;
      if (!trie) return { error: "Trie not found" };
      for (const word of words as string[]) {
        trie.add(word);
      }
      return { size: trie.size };
    },
  },
  {
    name: "algo_trie_find",
    description: "Find words by prefix in trie",
    category: "algo",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Trie ID" },
        prefix: { type: "string", description: "Prefix to search" },
      },
      required: ["id", "prefix"],
    },
    handler: ({ id, prefix }) => {
      const trie = instances.get(id as string) as Trie<string>;
      if (!trie) return { error: "Trie not found" };
      return { matches: trie.find(prefix as string) };
    },
  },

  // LRU Cache operations
  {
    name: "algo_lru_create",
    description: "Create an LRU cache with fixed capacity",
    category: "algo",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Unique identifier" },
        capacity: { type: "number", description: "Max items (default: 100)" },
      },
      required: ["id"],
    },
    handler: ({ id, capacity = 100 }) => {
      const lru = new LRUCache<string, unknown>(capacity as number);
      instances.set(id as string, lru);
      return { created: id, capacity };
    },
  },
  {
    name: "algo_lru_set",
    description: "Set value in LRU cache",
    category: "algo",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "LRU ID" },
        key: { type: "string", description: "Key" },
        value: { description: "Value" },
      },
      required: ["id", "key", "value"],
    },
    handler: ({ id, key, value }) => {
      const lru = instances.get(id as string) as LRUCache<string, unknown>;
      if (!lru) return { error: "LRU cache not found" };
      lru.set(key as string, value);
      return { size: lru.size };
    },
  },
  {
    name: "algo_lru_get",
    description: "Get value from LRU cache",
    category: "algo",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "LRU ID" },
        key: { type: "string", description: "Key" },
      },
      required: ["id", "key"],
    },
    handler: ({ id, key }) => {
      const lru = instances.get(id as string) as LRUCache<string, unknown>;
      if (!lru) return { error: "LRU cache not found" };
      const value = lru.get(key as string);
      return { value, found: value !== undefined };
    },
  },

  // Bloom Filter operations
  {
    name: "algo_bloom_create",
    description: "Create a Bloom filter for probabilistic membership",
    category: "algo",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Unique identifier" },
        capacity: { type: "number", description: "Expected items (default: 1000)" },
      },
      required: ["id"],
    },
    handler: ({ id, capacity = 1000 }) => {
      const bloom = new BloomFilter(capacity as number);
      instances.set(id as string, bloom);
      return { created: id, capacity };
    },
  },
  {
    name: "algo_bloom_add",
    description: "Add items to Bloom filter",
    category: "algo",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Bloom filter ID" },
        items: { type: "array", items: { type: "string" }, description: "Items to add" },
      },
      required: ["id", "items"],
    },
    handler: ({ id, items }) => {
      const bloom = instances.get(id as string) as BloomFilter;
      if (!bloom) return { error: "Bloom filter not found" };
      for (const item of items as string[]) {
        bloom.add(item);
      }
      return { success: true };
    },
  },
  {
    name: "algo_bloom_test",
    description: "Test if item might be in Bloom filter",
    category: "algo",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Bloom filter ID" },
        item: { type: "string", description: "Item to test" },
      },
      required: ["id", "item"],
    },
    handler: ({ id, item }) => {
      const bloom = instances.get(id as string) as BloomFilter;
      if (!bloom) return { error: "Bloom filter not found" };
      return { mightExist: bloom.test(item as string) };
    },
  },

  // Circular Buffer operations
  {
    name: "algo_circular_create",
    description: "Create a circular buffer (ring buffer)",
    category: "algo",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Unique identifier" },
        capacity: { type: "number", description: "Buffer capacity" },
      },
      required: ["id", "capacity"],
    },
    handler: ({ id, capacity }) => {
      const buffer = new CircularBuffer<unknown>(Array, capacity as number);
      instances.set(id as string, buffer);
      return { created: id, capacity };
    },
  },
  {
    name: "algo_circular_push",
    description: "Push to circular buffer",
    category: "algo",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Buffer ID" },
        items: { type: "array", description: "Items to push" },
      },
      required: ["id", "items"],
    },
    handler: ({ id, items }) => {
      const buffer = instances.get(id as string) as CircularBuffer<unknown>;
      if (!buffer) return { error: "Buffer not found" };
      for (const item of items as unknown[]) {
        buffer.push(item);
      }
      return { size: buffer.size };
    },
  },
  {
    name: "algo_circular_toArray",
    description: "Convert circular buffer to array",
    category: "algo",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Buffer ID" },
      },
      required: ["id"],
    },
    handler: ({ id }) => {
      const buffer = instances.get(id as string) as CircularBuffer<unknown>;
      if (!buffer) return { error: "Buffer not found" };
      return { items: buffer.toArray(), size: buffer.size };
    },
  },

  // Disjoint Set (Union-Find) operations
  {
    name: "algo_unionfind_create",
    description: "Create a disjoint set (union-find) structure",
    category: "algo",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Unique identifier" },
        size: { type: "number", description: "Number of elements" },
      },
      required: ["id", "size"],
    },
    handler: ({ id, size }) => {
      const ds = new StaticDisjointSet(size as number);
      instances.set(id as string, ds);
      return { created: id, size };
    },
  },
  {
    name: "algo_unionfind_union",
    description: "Union two sets",
    category: "algo",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Disjoint set ID" },
        a: { type: "number", description: "First element" },
        b: { type: "number", description: "Second element" },
      },
      required: ["id", "a", "b"],
    },
    handler: ({ id, a, b }) => {
      const ds = instances.get(id as string) as StaticDisjointSet;
      if (!ds) return { error: "Disjoint set not found" };
      ds.union(a as number, b as number);
      return { dimension: ds.dimension };
    },
  },
  {
    name: "algo_unionfind_connected",
    description: "Check if two elements are in the same set",
    category: "algo",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Disjoint set ID" },
        a: { type: "number", description: "First element" },
        b: { type: "number", description: "Second element" },
      },
      required: ["id", "a", "b"],
    },
    handler: ({ id, a, b }) => {
      const ds = instances.get(id as string) as StaticDisjointSet;
      if (!ds) return { error: "Disjoint set not found" };
      return { connected: ds.connected(a as number, b as number) };
    },
  },

  // General instance management
  {
    name: "algo_delete",
    description: "Delete an algorithm instance",
    category: "algo",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Instance ID to delete" },
      },
      required: ["id"],
    },
    handler: ({ id }) => {
      const deleted = instances.delete(id as string);
      return { deleted };
    },
  },
  {
    name: "algo_list",
    description: "List all algorithm instances",
    category: "algo",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: () => {
      return { instances: Array.from(instances.keys()) };
    },
  },
];

// Re-export unused imports for potential future use
export { FibonacciHeap, SuffixArray, LRUMap, Queue, Stack, LinkedList, BiMap, DefaultMap, MultiSet };
