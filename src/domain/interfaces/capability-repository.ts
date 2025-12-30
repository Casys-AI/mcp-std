/**
 * Capability Repository Interface
 *
 * Defines the contract for capability storage operations.
 * Implementations: CapabilityStore
 *
 * Phase 2.1: Foundation for DI with diod
 *
 * @module domain/interfaces/capability-repository
 */

import type {
  Capability,
  CapabilityDependency,
  CreateCapabilityDependencyInput,
  SaveCapabilityInput,
  StaticStructure,
} from "../../capabilities/types/mod.ts";

/**
 * Result from saving a capability
 */
export interface SaveCapabilityResult {
  capability: Capability;
  trace?: unknown; // ExecutionTrace - avoid circular import
}

/**
 * Statistics about capability storage
 */
export interface CapabilityStats {
  totalCapabilities: number;
  totalExecutions: number;
  avgSuccessRate: number;
  avgDurationMs: number;
}

/**
 * Interface for capability storage operations
 *
 * This interface abstracts the data access layer for capabilities,
 * allowing for different implementations (PGlite, PostgreSQL, etc.)
 * and easy mocking in tests.
 */
export interface ICapabilityRepository {
  /**
   * Save a capability after execution
   * Uses ON CONFLICT upsert for existing capabilities
   */
  saveCapability(input: SaveCapabilityInput): Promise<SaveCapabilityResult>;

  /**
   * Find a capability by its unique ID
   */
  findById(id: string): Promise<Capability | null>;

  /**
   * Find a capability by its code hash
   */
  findByCodeHash(codeHash: string): Promise<Capability | null>;

  /**
   * Search capabilities by semantic intent
   */
  searchByIntent(
    intent: string,
    limit?: number,
    minSemanticScore?: number,
  ): Promise<Array<{ capability: Capability; semanticScore: number }>>;

  /**
   * Update usage statistics after execution
   */
  updateUsage(id: string, success: boolean, durationMs: number): Promise<void>;

  /**
   * Get total capability count
   */
  getCapabilityCount(): Promise<number>;

  /**
   * Get aggregate statistics
   */
  getStats(): Promise<CapabilityStats>;

  /**
   * Get static structure for a capability
   */
  getStaticStructure(capabilityId: string): Promise<StaticStructure | null>;

  /**
   * Add a dependency between capabilities
   */
  addDependency(input: CreateCapabilityDependencyInput): Promise<CapabilityDependency>;

  /**
   * Remove a dependency between capabilities
   */
  removeDependency(fromId: string, toId: string): Promise<void>;

  /**
   * Get all dependencies with minimum confidence
   */
  getAllDependencies(minConfidence?: number): Promise<CapabilityDependency[]>;
}
