/**
 * Graph Sync Module
 *
 * Event-driven incremental graph updates for GraphRAG.
 * Listens to capability lifecycle events and synchronizes:
 * - GraphRAGEngine (tool-capability relationships)
 * - Hyperedge KV cache (for fast lookups)
 * - SHGAT algorithm (capability embeddings)
 *
 * ## Architecture
 *
 * ```
 * EventBus ──────────────────────────────────────────────────────┐
 *    │                                                           │
 *    ├─ capability.zone.created ──► GraphSyncController ────────►│
 *    ├─ capability.zone.updated ──►       │                      │
 *    └─ capability.merged ────────►       │                      │
 *                                         ▼                      │
 *                            ┌────────────────────────┐          │
 *                            │  GraphRAGEngine        │          │
 *                            │  Hyperedge Cache       │          │
 *                            │  SHGAT                 │          │
 *                            └────────────────────────┘          │
 * ```
 *
 * ## Usage
 *
 * ```typescript
 * import { GraphSyncController } from "./graph-sync/mod.ts";
 *
 * const controller = new GraphSyncController(graphEngine, db, getSHGAT);
 * controller.start(); // Subscribe to events
 * // ... application runs ...
 * controller.stop();  // Cleanup on shutdown
 * ```
 *
 * ## Events Handled
 *
 * - `capability.zone.created`: New capability registered
 * - `capability.zone.updated`: Capability tools/metadata changed
 * - `capability.merged`: Two capabilities merged into one
 *
 * @module mcp/graph-sync
 * @see {@link GraphSyncController}
 */

export {
  type CapabilityMergedPayload,
  type CapabilityZoneCreatedPayload,
  type CapabilityZoneUpdatedPayload,
  GraphSyncController,
} from "./controller.ts";
