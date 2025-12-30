/**
 * CapabilityRepository Adapter
 *
 * Wraps CapabilityStore to implement the DI CapabilityRepository token.
 * Delegates directly to CapabilityStore since it already implements
 * the required interface.
 *
 * @module infrastructure/di/adapters/capability-repository-adapter
 */

import { CapabilityRepository } from "../container.ts";
import type { CapabilityStore } from "../../../capabilities/capability-store.ts";

/**
 * Adapter that wraps CapabilityStore for DI registration.
 *
 * CapabilityStore already implements the ICapabilityRepository interface,
 * so this adapter simply delegates all calls.
 */
export class CapabilityRepositoryAdapter extends CapabilityRepository {
  constructor(private readonly store: CapabilityStore) {
    super();
  }

  // Direct delegation - CapabilityStore implements the interface
  saveCapability = (...args: Parameters<CapabilityRepository["saveCapability"]>) =>
    this.store.saveCapability(...args);

  findById = (id: string) => this.store.findById(id);

  findByCodeHash = (hash: string) => this.store.findByCodeHash(hash);

  searchByIntent = (...args: Parameters<CapabilityRepository["searchByIntent"]>) =>
    this.store.searchByIntent(...args);

  updateUsage = (...args: Parameters<CapabilityRepository["updateUsage"]>) =>
    this.store.updateUsage(...args);

  getCapabilityCount = () => this.store.getCapabilityCount();

  getStats = () => this.store.getStats();

  getStaticStructure = (id: string) => this.store.getStaticStructure(id);

  addDependency = (...args: Parameters<CapabilityRepository["addDependency"]>) =>
    this.store.addDependency(...args);

  removeDependency = (fromId: string, toId: string) =>
    this.store.removeDependency(fromId, toId);

  getAllDependencies = (minConfidence?: number) =>
    this.store.getAllDependencies(minConfidence);

  /** Access underlying store for methods not in interface */
  get underlying(): CapabilityStore {
    return this.store;
  }
}
