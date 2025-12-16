/**
 * Graph Synchronization Module
 *
 * Exports database sync and event emission functionality.
 *
 * @module graphrag/sync
 */

export {
  syncGraphFromDatabase,
  persistEdgesToDatabase,
  persistCapabilityDependency,
  persistWorkflowExecution,
  type SyncableGraph,
  type SyncResult,
} from "./db-sync.ts";

export {
  GraphEventEmitter,
  createGraphEventEmitter,
} from "./event-emitter.ts";
