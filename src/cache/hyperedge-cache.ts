/**
 * Hyperedge KV Cache
 *
 * Persists hyperedge data (cap→cap and cap→tool "contains" relationships)
 * in Deno KV for shared access between SHGAT and tensor-entropy.
 *
 * This solves the dual data source problem where:
 * - SHGAT loads edges from DB at gateway startup
 * - db-sync creates edges in graph-engine's memory
 * - tensor-entropy needs the same data for entropy calculation
 *
 * @module cache/hyperedge-cache
 */

import { getKv } from "./kv.ts";
import * as log from "@std/log";

/**
 * Hyperedge structure stored in KV
 */
export interface CachedHyperedge {
  /** Capability ID that "contains" the members */
  capabilityId: string;
  /** Tool IDs or capability IDs contained */
  members: string[];
  /** Number of members (hyperedge order) */
  order: number;
  /** Edge type: cap→tool or cap→cap */
  type: "cap_to_tool" | "cap_to_cap";
  /** When this hyperedge was cached */
  cachedAt: number;
}

/**
 * Summary of all hyperedges
 */
export interface HyperedgeSummary {
  /** Total hyperedge count */
  total: number;
  /** cap→tool hyperedges count */
  capToTool: number;
  /** cap→cap hyperedges count */
  capToCap: number;
  /** When summary was computed */
  computedAt: number;
}

// KV key prefixes
const HYPEREDGE_PREFIX = ["graph", "hyperedges"];
const SUMMARY_KEY = ["graph", "hyperedges", "_summary"];

/**
 * Store hyperedges in KV cache
 *
 * Called by SHGAT after loading edges from DB.
 *
 * @param hyperedges - Array of hyperedges to cache
 */
export async function cacheHyperedges(
  hyperedges: CachedHyperedge[],
): Promise<void> {
  const kv = await getKv();
  const now = Date.now();

  // Store each hyperedge
  const atomic = kv.atomic();
  for (const he of hyperedges) {
    const key = [...HYPEREDGE_PREFIX, he.capabilityId];
    atomic.set(key, { ...he, cachedAt: now });
  }

  // Store summary
  const summary: HyperedgeSummary = {
    total: hyperedges.length,
    capToTool: hyperedges.filter((h) => h.type === "cap_to_tool").length,
    capToCap: hyperedges.filter((h) => h.type === "cap_to_cap").length,
    computedAt: now,
  };
  atomic.set(SUMMARY_KEY, summary);

  await atomic.commit();

  log.debug(
    `[HyperedgeCache] Cached ${hyperedges.length} hyperedges (${summary.capToTool} cap→tool, ${summary.capToCap} cap→cap)`,
  );
}

/**
 * Get all cached hyperedges
 *
 * @returns Array of cached hyperedges
 */
export async function getCachedHyperedges(): Promise<CachedHyperedge[]> {
  const kv = await getKv();
  const hyperedges: CachedHyperedge[] = [];

  const iter = kv.list<CachedHyperedge>({ prefix: HYPEREDGE_PREFIX });
  for await (const entry of iter) {
    // Skip the summary key
    if (entry.key.length === 3 && entry.key[2] === "_summary") continue;
    hyperedges.push(entry.value);
  }

  return hyperedges;
}

/**
 * Get hyperedge summary without loading all data
 *
 * @returns Summary or null if not cached
 */
export async function getHyperedgeSummary(): Promise<HyperedgeSummary | null> {
  const kv = await getKv();
  const result = await kv.get<HyperedgeSummary>(SUMMARY_KEY);
  return result.value;
}

/**
 * Clear all cached hyperedges
 * Call this when graph structure changes significantly.
 */
export async function clearHyperedgeCache(): Promise<void> {
  const kv = await getKv();
  const atomic = kv.atomic();

  const iter = kv.list({ prefix: HYPEREDGE_PREFIX });
  for await (const entry of iter) {
    atomic.delete(entry.key);
  }

  await atomic.commit();
  log.debug("[HyperedgeCache] Cleared hyperedge cache");
}

/**
 * Build hyperedges from SHGAT data
 *
 * Converts SHGAT's children/tools_used maps into CachedHyperedge format.
 *
 * @param capabilities - Map of capabilityId → { children?: string[], toolsUsed?: string[] }
 * @returns Array of hyperedges ready for caching
 */
export function buildHyperedgesFromSHGAT(
  capabilities: Array<{
    id: string;
    children?: string[];
    toolsUsed?: string[];
  }>,
): CachedHyperedge[] {
  const hyperedges: CachedHyperedge[] = [];

  for (const cap of capabilities) {
    // cap→cap hyperedges (from capability_dependency.contains)
    if (cap.children && cap.children.length >= 2) {
      hyperedges.push({
        capabilityId: cap.id,
        members: cap.children,
        order: cap.children.length,
        type: "cap_to_cap",
        cachedAt: Date.now(),
      });
    }

    // cap→tool hyperedges (from dag_structure.tools_used)
    if (cap.toolsUsed && cap.toolsUsed.length >= 2) {
      hyperedges.push({
        capabilityId: cap.id,
        members: cap.toolsUsed,
        order: cap.toolsUsed.length,
        type: "cap_to_tool",
        cachedAt: Date.now(),
      });
    }
  }

  return hyperedges;
}

/**
 * Update or add a single hyperedge incrementally
 *
 * Called when a new capability is created or updated.
 * Updates both the hyperedge entry and the summary counts.
 *
 * @param capabilityId - The capability ID
 * @param toolsUsed - Tools used by this capability
 * @param children - Child capabilities (for cap→cap hyperedges)
 */
export async function updateHyperedge(
  capabilityId: string,
  toolsUsed: string[],
  children?: string[],
): Promise<void> {
  const kv = await getKv();
  const now = Date.now();

  // Determine if this creates a hyperedge (need 2+ members)
  const hasToolHyperedge = toolsUsed.length >= 2;
  const hasCapHyperedge = children && children.length >= 2;

  // If no hyperedge, nothing to cache
  if (!hasToolHyperedge && !hasCapHyperedge) {
    log.debug(`[HyperedgeCache] No hyperedge for ${capabilityId} (tools=${toolsUsed.length}, children=${children?.length ?? 0})`);
    return;
  }

  // Get current summary to update counts
  const currentSummary = await kv.get<HyperedgeSummary>(SUMMARY_KEY);
  const summary: HyperedgeSummary = currentSummary.value ?? {
    total: 0,
    capToTool: 0,
    capToCap: 0,
    computedAt: now,
  };

  // Check if this capability already had a hyperedge
  const existingKey = [...HYPEREDGE_PREFIX, capabilityId];
  const existing = await kv.get<CachedHyperedge>(existingKey);
  const hadExisting = existing.value !== null;

  // Build new hyperedge (prefer cap→tool if both exist)
  const hyperedge: CachedHyperedge = hasToolHyperedge
    ? {
        capabilityId,
        members: toolsUsed,
        order: toolsUsed.length,
        type: "cap_to_tool",
        cachedAt: now,
      }
    : {
        capabilityId,
        members: children!,
        order: children!.length,
        type: "cap_to_cap",
        cachedAt: now,
      };

  // Update summary counts
  if (hadExisting) {
    // Decrement old type count
    if (existing.value!.type === "cap_to_tool") {
      summary.capToTool--;
    } else {
      summary.capToCap--;
    }
    summary.total--;
  }

  // Increment new type count
  if (hyperedge.type === "cap_to_tool") {
    summary.capToTool++;
  } else {
    summary.capToCap++;
  }
  summary.total++;
  summary.computedAt = now;

  // Atomic update
  const atomic = kv.atomic();
  atomic.set(existingKey, hyperedge);
  atomic.set(SUMMARY_KEY, summary);
  await atomic.commit();

  log.debug(
    `[HyperedgeCache] Updated hyperedge for ${capabilityId}: ${hyperedge.type} order=${hyperedge.order} (total=${summary.total})`,
  );
}
