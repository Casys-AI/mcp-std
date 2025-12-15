/**
 * Schema Cache Module
 *
 * Provides LRU (Least Recently Used) caching for frequently accessed tool schemas.
 * Reduces database queries and improves performance for repeated tool lookups.
 *
 * @module context/cache
 */

import type { MCPTool } from "../mcp/types.ts";

/**
 * Cache entry with hit tracking
 */
interface CacheEntry {
  schema: MCPTool;
  hits: number;
  lastAccessed: number; // timestamp in ms
}

/**
 * LRU Cache for Tool Schemas
 *
 * Features:
 * - Configurable max size with LRU eviction
 * - Hit count tracking for analytics
 * - Timestamp-based access tracking
 * - Cache statistics (hits, misses, hit rate)
 */
export class SchemaCache {
  private cache = new Map<string, CacheEntry>();
  private readonly maxSize: number;
  private hits = 0;
  private misses = 0;

  /**
   * Create a new schema cache
   *
   * @param maxSize Maximum number of schemas to cache (default: 50)
   */
  constructor(maxSize: number = 50) {
    if (maxSize <= 0) {
      throw new Error("Cache maxSize must be > 0");
    }
    this.maxSize = maxSize;
  }

  /**
   * Get schema from cache
   *
   * @param toolId Tool identifier
   * @returns Cached schema or undefined if not found
   */
  get(toolId: string): MCPTool | undefined {
    const entry = this.cache.get(toolId);

    if (entry) {
      // Cache hit: update access tracking
      entry.hits++;
      entry.lastAccessed = performance.now();
      this.hits++;
      return entry.schema;
    }

    // Cache miss
    this.misses++;
    return undefined;
  }

  /**
   * Add schema to cache
   *
   * Implements LRU eviction: if cache is full, removes least recently used entry
   *
   * @param toolId Tool identifier
   * @param schema Tool schema to cache
   */
  set(toolId: string, schema: MCPTool): void {
    // If already cached, update it (this also updates access time via get)
    if (this.cache.has(toolId)) {
      const entry = this.cache.get(toolId)!;
      entry.schema = schema;
      entry.lastAccessed = performance.now();
      return;
    }

    // If cache is full, evict LRU entry
    if (this.cache.size >= this.maxSize) {
      const lruKey = this.findLRU();
      this.cache.delete(lruKey);
    }

    // Add new entry
    this.cache.set(toolId, {
      schema,
      hits: 1,
      lastAccessed: performance.now(),
    });
  }

  /**
   * Check if tool is cached
   *
   * @param toolId Tool identifier
   * @returns true if cached, false otherwise
   */
  has(toolId: string): boolean {
    return this.cache.has(toolId);
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cache statistics
   *
   * @returns Object with cache metrics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    hitRate: number;
  } {
    const totalAccesses = this.hits + this.misses;
    const hitRate = totalAccesses > 0 ? this.hits / totalAccesses : 0;

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate,
    };
  }

  /**
   * Find least recently used entry for eviction
   *
   * Uses lastAccessed timestamp to determine LRU
   *
   * @returns Key of LRU entry
   */
  private findLRU(): string {
    let minTimestamp = Infinity;
    let lruKey = "";

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < minTimestamp) {
        minTimestamp = entry.lastAccessed;
        lruKey = key;
      }
    }

    return lruKey;
  }

  /**
   * Get most frequently accessed tools
   *
   * Useful for analytics and cache optimization
   *
   * @param limit Number of top tools to return (default: 10)
   * @returns Array of tool IDs sorted by hit count (descending)
   */
  getTopTools(limit: number = 10): Array<{ toolId: string; hits: number }> {
    const entries = Array.from(this.cache.entries()).map(([toolId, entry]) => ({
      toolId,
      hits: entry.hits,
    }));

    return entries
      .sort((a, b) => b.hits - a.hits)
      .slice(0, limit);
  }
}
