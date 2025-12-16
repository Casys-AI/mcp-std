/**
 * Pattern Import/Export Module
 *
 * Extracted from dag-suggester.ts for managing learned patterns.
 * Handles agent hints, pattern export, and pattern import for portability.
 *
 * @module graphrag/learning/pattern-io
 */

import * as log from "@std/log";
import type { DagScoringConfig } from "../dag-scoring-config.ts";
import type { GraphRAGEngine } from "../graph-engine.ts";

/**
 * Learned pattern structure
 */
export interface LearnedPatternData {
  from: string;
  to: string;
  weight: number;
  count: number;
  source: string;
}

/**
 * Pattern for import
 */
export interface PatternImport {
  from: string;
  to: string;
  weight: number;
  count: number;
  source?: string;
}

/**
 * Register agent hint for graph bootstrap (Story 3.5-1 AC #12)
 *
 * Allows agents to hint expected tool sequences before patterns are learned.
 * Useful for:
 * - Initial bootstrap of new workflows
 * - Explicit knowledge injection
 * - Testing speculation behavior
 *
 * @param toToolId - Tool that typically follows
 * @param fromToolId - Tool that typically precedes
 * @param graphEngine - Graph engine for edge operations
 * @param config - Scoring configuration
 * @param confidence - Optional confidence override
 */
export async function registerAgentHint(
  toToolId: string,
  fromToolId: string,
  graphEngine: GraphRAGEngine,
  config: DagScoringConfig,
  confidence?: number,
): Promise<void> {
  // Use config default if not provided
  const effectiveConfidence = confidence ?? config.caps.defaultNodeConfidence;

  try {
    log.debug(
      `[pattern-io] Registering agent hint: ${fromToolId} -> ${toToolId} (confidence: ${effectiveConfidence})`,
    );

    // Add or update edge in graph
    await graphEngine.addEdge(fromToolId, toToolId, {
      weight: effectiveConfidence,
      count: 1,
      source: "hint",
    });

    log.debug(`[pattern-io] Agent hint registered successfully`);
  } catch (error) {
    log.error(`[pattern-io] Failed to register agent hint: ${error}`);
    throw error;
  }
}

/**
 * Export learned patterns for portability (Story 3.5-1 AC #13)
 *
 * Returns all learned tool-to-tool patterns from the graph.
 * Useful for:
 * - Sharing patterns between instances
 * - Debugging speculation behavior
 * - Cold-start initialization
 *
 * @param graphEngine - Graph engine for edge retrieval
 * @returns Array of learned patterns with metadata
 */
export function exportLearnedPatterns(graphEngine: GraphRAGEngine): LearnedPatternData[] {
  const patterns: LearnedPatternData[] = [];

  try {
    // Get all edges from graph
    const edges = graphEngine.getEdges();

    for (const { source: from, target: to, attributes } of edges) {
      patterns.push({
        from,
        to,
        weight: (attributes.weight as number) ?? 0.5,
        count: (attributes.count as number) ?? 1,
        source: (attributes.source as string) ?? "learned",
      });
    }

    log.info(`[pattern-io] Exported ${patterns.length} learned patterns`);
    return patterns;
  } catch (error) {
    log.error(`[pattern-io] Failed to export patterns: ${error}`);
    return [];
  }
}

/**
 * Import learned patterns (Story 3.5-1 AC #13)
 *
 * Imports patterns exported from another instance.
 * Useful for cold-start initialization.
 *
 * @param patterns - Patterns to import
 * @param graphEngine - Graph engine for edge operations
 * @param mergeStrategy - How to handle existing patterns ("replace" | "merge")
 * @returns Number of successfully imported patterns
 */
export async function importLearnedPatterns(
  patterns: PatternImport[],
  graphEngine: GraphRAGEngine,
  mergeStrategy: "replace" | "merge" = "merge",
): Promise<number> {
  let imported = 0;

  for (const pattern of patterns) {
    try {
      const existingEdge = graphEngine.getEdgeData(pattern.from, pattern.to);

      if (existingEdge && mergeStrategy === "merge") {
        // Merge: Average weights, sum counts
        const newWeight = (existingEdge.weight + pattern.weight) / 2;
        const newCount = existingEdge.count + pattern.count;

        await graphEngine.addEdge(pattern.from, pattern.to, {
          weight: newWeight,
          count: newCount,
          source: "merged",
        });
      } else {
        // Replace or new edge
        await graphEngine.addEdge(pattern.from, pattern.to, {
          weight: pattern.weight,
          count: pattern.count,
          source: pattern.source ?? "imported",
        });
      }

      imported++;
    } catch (error) {
      log.error(
        `[pattern-io] Failed to import pattern ${pattern.from} -> ${pattern.to}: ${error}`,
      );
    }
  }

  log.info(`[pattern-io] Imported ${imported}/${patterns.length} patterns`);
  return imported;
}
