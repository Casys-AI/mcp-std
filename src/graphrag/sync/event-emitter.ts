/**
 * Graph Event Emitter Module
 *
 * Handles emission of graph events to both legacy EventTarget
 * and unified EventBus (ADR-036).
 *
 * Story 6.5: EventBus integration for unified event system
 *
 * @module graphrag/sync/event-emitter
 */

import type { GraphEvent } from "../events.ts";
import { eventBus } from "../../events/mod.ts";

/**
 * Graph event emitter that bridges legacy and new event systems
 */
export class GraphEventEmitter {
  private eventTarget: EventTarget;
  private listenerMap: Map<(event: GraphEvent) => void, EventListener>;

  constructor() {
    this.eventTarget = new EventTarget();
    this.listenerMap = new Map();
  }

  /**
   * Subscribe to graph events
   *
   * @param event - Event name (always "graph_event")
   * @param listener - Event listener function
   */
  on(event: "graph_event", listener: (event: GraphEvent) => void): void {
    const wrappedListener = ((e: CustomEvent<GraphEvent>) => {
      listener(e.detail);
    }) as EventListener;

    this.listenerMap.set(listener, wrappedListener);
    this.eventTarget.addEventListener(event, wrappedListener);
  }

  /**
   * Unsubscribe from graph events
   *
   * @param event - Event name (always "graph_event")
   * @param listener - Event listener function to remove
   */
  off(event: "graph_event", listener: (event: GraphEvent) => void): void {
    const wrappedListener = this.listenerMap.get(listener);
    if (wrappedListener) {
      this.eventTarget.removeEventListener(event, wrappedListener);
      this.listenerMap.delete(listener);
    }
  }

  /**
   * Emit a graph event
   *
   * Story 6.5: Also emits to unified EventBus (ADR-036)
   *
   * @param event - Graph event to emit
   */
  emit(event: GraphEvent): void {
    // Legacy: dispatch to local EventTarget for backward compat (EventsStreamManager)
    const customEvent = new CustomEvent("graph_event", { detail: event });
    this.eventTarget.dispatchEvent(customEvent);

    // Story 6.5: Also emit to unified EventBus with mapped event types
    this.emitToEventBus(event);
  }

  /**
   * Map legacy GraphEvent to new EventBus event types
   * Story 6.5: Bridge between old and new event systems
   */
  private emitToEventBus(event: GraphEvent): void {
    switch (event.type) {
      case "graph_synced":
        eventBus.emit({
          type: "graph.synced",
          source: "graphrag",
          payload: {
            nodeCount: event.data.nodeCount,
            edgeCount: event.data.edgeCount,
            syncDurationMs: event.data.syncDurationMs,
          },
        });
        break;

      case "edge_created":
        eventBus.emit({
          type: "graph.edge.created",
          source: "graphrag",
          payload: {
            fromToolId: event.data.fromToolId,
            toToolId: event.data.toToolId,
            confidenceScore: event.data.confidenceScore,
          },
        });
        break;

      case "edge_updated":
        eventBus.emit({
          type: "graph.edge.updated",
          source: "graphrag",
          payload: {
            fromToolId: event.data.fromToolId,
            toToolId: event.data.toToolId,
            oldConfidence: event.data.oldConfidence,
            newConfidence: event.data.newConfidence,
            observedCount: event.data.observedCount,
          },
        });
        break;

      case "metrics_updated":
        eventBus.emit({
          type: "graph.metrics.computed",
          source: "graphrag",
          payload: {
            nodeCount: event.data.nodeCount,
            edgeCount: event.data.edgeCount,
            density: event.data.density,
            communitiesCount: event.data.communitiesCount,
          },
        });
        break;

      // heartbeat and workflow_executed are handled elsewhere
      default:
        // Unknown event type, skip EventBus emission
        break;
    }
  }

  /**
   * Create graph_synced event
   */
  emitGraphSynced(data: {
    nodeCount: number;
    edgeCount: number;
    syncDurationMs: number;
  }): void {
    this.emit({
      type: "graph_synced",
      data: {
        ...data,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Create edge_created event
   */
  emitEdgeCreated(data: {
    fromToolId: string;
    toToolId: string;
    confidenceScore: number;
    observedCount: number;
    edgeType: string;
    edgeSource: string;
  }): void {
    this.emit({
      type: "edge_created",
      data: {
        ...data,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Create edge_updated event
   */
  emitEdgeUpdated(data: {
    fromToolId: string;
    toToolId: string;
    oldConfidence: number;
    newConfidence: number;
    observedCount: number;
    edgeType: string;
    edgeSource: string;
  }): void {
    this.emit({
      type: "edge_updated",
      data: {
        ...data,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Create workflow_executed event
   */
  emitWorkflowExecuted(data: {
    workflowId: string;
    toolIds: string[];
    success: boolean;
    executionTimeMs: number;
  }): void {
    this.emit({
      type: "workflow_executed",
      data: {
        ...data,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Create metrics_updated event
   */
  emitMetricsUpdated(data: {
    nodeCount: number;
    edgeCount: number;
    density: number;
    pagerankTop10: Array<{ toolId: string; score: number }>;
    communitiesCount: number;
  }): void {
    this.emit({
      type: "metrics_updated",
      data: {
        ...data,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * Factory function to create a new GraphEventEmitter
 */
export function createGraphEventEmitter(): GraphEventEmitter {
  return new GraphEventEmitter();
}
