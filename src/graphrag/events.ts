/**
 * Event types emitted by GraphRAGEngine for real-time monitoring
 * Story 6.1: Real-time Events Stream (SSE)
 */

export interface GraphSyncedEvent {
  type: "graph_synced";
  data: {
    nodeCount: number;
    edgeCount: number;
    syncDurationMs: number;
    timestamp: string;
  };
}

export interface EdgeCreatedEvent {
  type: "edge_created";
  data: {
    fromToolId: string;
    toToolId: string;
    confidenceScore: number;
    observedCount: number; // ADR-041
    edgeType: string; // ADR-041: 'contains', 'sequence', or 'dependency'
    edgeSource: string; // ADR-041: 'observed', 'inferred', or 'template'
    timestamp: string;
  };
}

export interface EdgeUpdatedEvent {
  type: "edge_updated";
  data: {
    fromToolId: string;
    toToolId: string;
    oldConfidence: number;
    newConfidence: number;
    observedCount: number;
    edgeType: string; // ADR-041: 'contains', 'sequence', or 'dependency'
    edgeSource: string; // ADR-041: 'observed', 'inferred', or 'template'
    timestamp: string;
  };
}

export interface WorkflowExecutedEvent {
  type: "workflow_executed";
  data: {
    workflowId: string;
    toolIds: string[];
    success: boolean;
    executionTimeMs: number;
    timestamp: string;
  };
}

export interface MetricsUpdatedEvent {
  type: "metrics_updated";
  data: {
    edgeCount: number;
    nodeCount: number;
    density: number;
    pagerankTop10: Array<{ toolId: string; score: number }>;
    communitiesCount: number;
    timestamp: string;
  };
}

export interface HeartbeatEvent {
  type: "heartbeat";
  data: {
    connectedClients: number;
    uptimeSeconds: number;
    timestamp: string;
  };
}

/**
 * Union type representing all possible graph events
 */
export type GraphEvent =
  | GraphSyncedEvent
  | EdgeCreatedEvent
  | EdgeUpdatedEvent
  | WorkflowExecutedEvent
  | MetricsUpdatedEvent
  | HeartbeatEvent;
