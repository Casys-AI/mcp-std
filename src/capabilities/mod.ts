/**
 * Capabilities Module (Epic 7 - Emergent Capabilities & Learning)
 *
 * Provides capability storage, hashing, and retrieval for learned code patterns.
 *
 * @module capabilities
 */

export { CapabilityStore } from "./capability-store.ts";
export { ExecutionTraceStore } from "./execution-trace-store.ts";
export type { SaveTraceInput } from "./execution-trace-store.ts";
export { CapabilityMatcher } from "./matcher.ts";
export { SchemaInferrer } from "./schema-inferrer.ts";
export { StaticStructureBuilder } from "./static-structure-builder.ts";
export {
  getToolPermissionConfig,
  initMcpPermissions,
  isToolAllowed,
  isToolDenied,
  reloadMcpPermissions,
  toolRequiresHil,
} from "./permission-inferrer.ts";
// Story 13.9: Routing inference from tools_used
export {
  checkAndSyncRouting,
  extractServerName,
  getToolRouting,
  initRoutingConfig,
  isCloudServer,
  isLocalServer,
  reloadRoutingConfig,
  resolveRouting,
  syncCapabilityRouting,
} from "./routing-resolver.ts";
export { CapabilityCodeGenerator } from "./code-generator.ts";
// Story 7.2c: Variable name normalization for semantic deduplication
export { normalizeVariableNames } from "./code-transformer.ts";
export type { NormalizeVariablesResult } from "./code-transformer.ts";
export { CapabilityExecutor } from "./executor.ts";
export { CapabilityDataService } from "./data-service.ts";
export { HypergraphBuilder } from "./hypergraph-builder.ts";
export type { HypergraphResult } from "./hypergraph-builder.ts";
// Story 7.7c: Permission escalation
export {
  getValidEscalationTargets,
  isSecurityCritical,
  isValidEscalation,
  suggestEscalation,
} from "./permission-escalation.ts";
export { PermissionAuditStore } from "./permission-audit-store.ts";
export type { AuditLogFilters, LogEscalationInput } from "./permission-audit-store.ts";
export {
  formatEscalationRequest,
  PermissionEscalationHandler,
} from "./permission-escalation-handler.ts";
export type { EscalationResult, HILApprovalCallback } from "./permission-escalation-handler.ts";
// Note: hashCodeSync is intentionally not exported - it uses djb2 (32-bit)
// which has higher collision probability. Use hashCode (SHA-256) for production.
export { hashCode, hashSemanticStructure, normalizeCode } from "./hash.ts";
// Story 11.2: Default priority constant for cold start traces
export { DEFAULT_TRACE_PRIORITY } from "./types.ts";
export type {
  ArgumentsStructure, // Story 10.2 - Argument extraction for speculative execution
  ArgumentValue, // Story 10.2 - Single argument resolution strategy
  BranchDecision,
  CacheConfig,
  Capability,
  CapabilityFilters,
  CapabilityListResponseInternal,
  CapabilityMatch,
  CapabilityResponseInternal,
  CapabilitySearchResult,
  CapabilityZone, // Story 8.2 - Hull zone metadata
  CytoscapeEdge, // @deprecated - use GraphEdge
  CytoscapeNode, // @deprecated - use GraphNode
  // Story 11.2 - Execution traces
  ExecutionTrace,
  GraphEdge,
  GraphNode,
  HypergraphOptions,
  HypergraphResponseInternal,
  JSONSchema,
  PermissionAuditLogEntry, // Story 7.7c - Permission escalation audit
  PermissionConfig, // Story 10.1 - For getToolPermissionConfig return type
  PermissionEscalationRequest, // Story 7.7c - HIL permission escalation
  PermissionSet, // Story 7.7a - Permission set profiles
  ProvidesCoverage, // Story 10.1 - Static structure coverage
  SaveCapabilityInput,
  StaticStructure, // Story 10.1 - Static code analysis
  StaticStructureEdge, // Story 10.1 - Static structure edges
  StaticStructureNode, // Story 10.1 - Static structure nodes
  TraceTaskResult,
} from "./types.ts";
