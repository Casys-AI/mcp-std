/**
 * Capability Dependency Store
 *
 * Manages dependency relationships between capabilities:
 * - dependency: A requires B
 * - contains: A calls B (hierarchy)
 * - provides: A's output feeds B's input (data flow)
 * - alternative: A or B can be used
 * - sequence: A then B
 *
 * Extracted from capability-store.ts for separation of concerns.
 *
 * @module capabilities/capability-dependency-store
 */

import type { DbClient } from "../db/types.ts";
import type { Row } from "../db/client.ts";
import {
  type CapabilityDependency,
  type CapabilityEdgeSource,
  type CapabilityEdgeType,
  type CreateCapabilityDependencyInput,
} from "./types.ts";
import { getLogger } from "../telemetry/logger.ts";
import { eventBus } from "../events/mod.ts";

const logger = getLogger("default");

/**
 * Threshold for edge_source upgrade from 'inferred' to 'observed'
 */
const OBSERVED_THRESHOLD = 3;

/**
 * Edge type weights for confidence score calculation
 * Story 10.3: Added "provides" for data flow relationships
 */
const EDGE_TYPE_WEIGHTS: Record<CapabilityEdgeType, number> = {
  dependency: 1.0,
  contains: 0.8,
  provides: 0.7, // Data flow (A's output feeds B's input)
  alternative: 0.6,
  sequence: 0.5,
};

/**
 * Edge source modifiers for confidence score calculation
 */
const EDGE_SOURCE_MODIFIERS: Record<CapabilityEdgeSource, number> = {
  observed: 1.0,
  inferred: 0.7,
  template: 0.5,
};

/**
 * CapabilityDependencyStore - Persistence layer for capability relationships
 *
 * Handles CRUD operations for capability_dependency table.
 *
 * @example
 * ```typescript
 * const depStore = new CapabilityDependencyStore(db);
 *
 * // Add a contains edge (A calls B)
 * await depStore.addDependency({
 *   fromCapabilityId: parentId,
 *   toCapabilityId: childId,
 *   edgeType: "contains",
 *   edgeSource: "inferred",
 * });
 *
 * // Get all dependencies for a capability
 * const deps = await depStore.getDependencies(capabilityId);
 * ```
 */
export class CapabilityDependencyStore {
  constructor(private db: DbClient) {
    logger.debug("CapabilityDependencyStore initialized");
  }

  /**
   * Add a dependency relationship between two capabilities
   *
   * @param input - Dependency creation input
   * @returns The created or updated dependency
   */
  async addDependency(input: CreateCapabilityDependencyInput): Promise<CapabilityDependency> {
    const { fromCapabilityId, toCapabilityId, edgeType, edgeSource = "inferred" } = input;

    // Calculate initial confidence score
    const typeWeight = EDGE_TYPE_WEIGHTS[edgeType];
    const sourceModifier = EDGE_SOURCE_MODIFIERS[edgeSource];
    const confidenceScore = typeWeight * sourceModifier;

    logger.debug("Adding capability dependency", {
      fromCapabilityId,
      toCapabilityId,
      edgeType,
      edgeSource,
      confidenceScore,
    });

    const result = await this.db.query(
      `INSERT INTO capability_dependency (
        from_capability_id, to_capability_id, observed_count, confidence_score,
        edge_type, edge_source, created_at, last_observed
      ) VALUES ($1, $2, 1, $3::real, $4, $5, NOW(), NOW())
      ON CONFLICT (from_capability_id, to_capability_id) DO UPDATE SET
        observed_count = capability_dependency.observed_count + 1,
        last_observed = NOW(),
        edge_source = CASE
          WHEN capability_dependency.observed_count + 1 >= $6::integer
            AND capability_dependency.edge_source = 'inferred'
          THEN 'observed'
          ELSE capability_dependency.edge_source
        END,
        confidence_score = $7::real * CASE
          WHEN capability_dependency.observed_count + 1 >= $6::integer
            AND capability_dependency.edge_source = 'inferred'
          THEN $8::real
          ELSE $9::real
        END
      RETURNING *`,
      [
        fromCapabilityId,
        toCapabilityId,
        confidenceScore,
        edgeType,
        edgeSource,
        OBSERVED_THRESHOLD,
        typeWeight,
        EDGE_SOURCE_MODIFIERS["observed"],
        sourceModifier,
      ],
    );

    if (result.length === 0) {
      throw new Error("Failed to add capability dependency - no result returned");
    }

    const dep = this.rowToDependency(result[0]);

    logger.info("Capability dependency added", {
      fromCapabilityId: dep.fromCapabilityId,
      toCapabilityId: dep.toCapabilityId,
      observedCount: dep.observedCount,
      edgeSource: dep.edgeSource,
    });

    // Warn if contains cycle detected (potential paradox)
    if (edgeType === "contains") {
      const reverseExists = await this.db.queryOne(
        `SELECT 1 FROM capability_dependency
         WHERE from_capability_id = $1 AND to_capability_id = $2 AND edge_type = 'contains'`,
        [toCapabilityId, fromCapabilityId],
      );
      if (reverseExists) {
        logger.warn(
          `Potential paradox: contains cycle detected between capabilities ${fromCapabilityId} <-> ${toCapabilityId}`,
        );
      }
    }

    // Emit event for graph sync
    eventBus.emit({
      type: "capability.dependency.created",
      source: "capability-dependency-store",
      payload: {
        from_capability_id: dep.fromCapabilityId,
        to_capability_id: dep.toCapabilityId,
        edge_type: dep.edgeType,
        edge_source: dep.edgeSource,
        observed_count: dep.observedCount,
      },
    });

    return dep;
  }

  /**
   * Update a dependency's observation count
   *
   * @param fromId - Source capability ID
   * @param toId - Target capability ID
   * @param incrementBy - Amount to increment observed_count (default: 1)
   */
  async updateDependency(fromId: string, toId: string, incrementBy = 1): Promise<void> {
    await this.db.query(
      `UPDATE capability_dependency SET
        observed_count = observed_count + $1,
        last_observed = NOW(),
        edge_source = CASE
          WHEN observed_count + $1 >= $2 AND edge_source = 'inferred'
          THEN 'observed'
          ELSE edge_source
        END,
        confidence_score = (
          CASE edge_type
            WHEN 'dependency' THEN 1.0
            WHEN 'contains' THEN 0.8
            WHEN 'alternative' THEN 0.6
            ELSE 0.5
          END
        ) * (
          CASE
            WHEN observed_count + $1 >= $2 AND edge_source = 'inferred' THEN 1.0
            WHEN edge_source = 'observed' THEN 1.0
            WHEN edge_source = 'inferred' THEN 0.7
            ELSE 0.5
          END
        )
      WHERE from_capability_id = $3 AND to_capability_id = $4`,
      [incrementBy, OBSERVED_THRESHOLD, fromId, toId],
    );

    logger.debug("Capability dependency updated", { fromId, toId, incrementBy });
  }

  /**
   * Get dependencies for a capability
   *
   * @param capabilityId - Capability ID
   * @param direction - 'from' (outgoing), 'to' (incoming), or 'both'
   * @returns List of dependency relationships
   */
  async getDependencies(
    capabilityId: string,
    direction: "from" | "to" | "both" = "both",
  ): Promise<CapabilityDependency[]> {
    let query: string;
    let params: string[];

    switch (direction) {
      case "from":
        query =
          `SELECT * FROM capability_dependency WHERE from_capability_id = $1 ORDER BY confidence_score DESC`;
        params = [capabilityId];
        break;
      case "to":
        query =
          `SELECT * FROM capability_dependency WHERE to_capability_id = $1 ORDER BY confidence_score DESC`;
        params = [capabilityId];
        break;
      case "both":
        query = `SELECT * FROM capability_dependency
          WHERE from_capability_id = $1 OR to_capability_id = $1
          ORDER BY confidence_score DESC`;
        params = [capabilityId];
        break;
    }

    const result = await this.db.query(query, params);
    return result.map((row) => this.rowToDependency(row));
  }

  /**
   * Get count of dependencies for a capability
   *
   * @param capabilityId - Capability ID
   * @returns Number of dependencies (both directions)
   */
  async getDependenciesCount(capabilityId: string): Promise<number> {
    const result = await this.db.queryOne(
      `SELECT COUNT(*) as count FROM capability_dependency
       WHERE from_capability_id = $1 OR to_capability_id = $1`,
      [capabilityId],
    );
    return Number(result?.count ?? 0);
  }

  /**
   * Remove a dependency relationship
   *
   * @param fromId - Source capability ID
   * @param toId - Target capability ID
   */
  async removeDependency(fromId: string, toId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM capability_dependency WHERE from_capability_id = $1 AND to_capability_id = $2`,
      [fromId, toId],
    );

    logger.info("Capability dependency removed", { fromId, toId });

    eventBus.emit({
      type: "capability.dependency.removed",
      source: "capability-dependency-store",
      payload: {
        from_capability_id: fromId,
        to_capability_id: toId,
      },
    });
  }

  /**
   * Get all capability dependencies (for graph sync)
   *
   * @param minConfidence - Minimum confidence score (default: 0.3)
   * @returns All dependencies above threshold
   */
  async getAllDependencies(minConfidence = 0.3): Promise<CapabilityDependency[]> {
    const result = await this.db.query(
      `SELECT * FROM capability_dependency WHERE confidence_score > $1`,
      [minConfidence],
    );
    return result.map((row) => this.rowToDependency(row));
  }

  /**
   * Get children (contained capabilities) for a parent
   *
   * @param parentId - Parent capability ID
   * @returns Child capability IDs
   */
  async getChildren(parentId: string): Promise<string[]> {
    const result = await this.db.query(
      `SELECT to_capability_id FROM capability_dependency
       WHERE from_capability_id = $1 AND edge_type = 'contains'
       ORDER BY confidence_score DESC`,
      [parentId],
    );
    return result.map((row) => row.to_capability_id as string);
  }

  /**
   * Get parents (capabilities that contain this one)
   *
   * @param childId - Child capability ID
   * @returns Parent capability IDs
   */
  async getParents(childId: string): Promise<string[]> {
    const result = await this.db.query(
      `SELECT from_capability_id FROM capability_dependency
       WHERE to_capability_id = $1 AND edge_type = 'contains'
       ORDER BY confidence_score DESC`,
      [childId],
    );
    return result.map((row) => row.from_capability_id as string);
  }

  /**
   * Convert database row to CapabilityDependency object
   */
  private rowToDependency(row: Row): CapabilityDependency {
    return {
      fromCapabilityId: row.from_capability_id as string,
      toCapabilityId: row.to_capability_id as string,
      observedCount: row.observed_count as number,
      confidenceScore: row.confidence_score as number,
      edgeType: row.edge_type as CapabilityEdgeType,
      edgeSource: row.edge_source as CapabilityEdgeSource,
      createdAt: new Date(row.created_at as string),
      lastObserved: new Date(row.last_observed as string),
    };
  }
}
