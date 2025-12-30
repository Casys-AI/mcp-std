/**
 * Permission types for capability execution
 *
 * Defines permission scopes, approval modes, and escalation handling.
 * Based on ADR-035 (Story 7.7a).
 *
 * @module capabilities/types/permission
 */

/**
 * Permission scope profiles defining resource access levels
 * (Refactored from PermissionSet - now represents only the scope axis)
 *
 * Note: 'trusted' is deprecated - use explicit PermissionConfig with approvalMode: 'auto'
 */
export type PermissionScope =
  | "minimal"
  | "readonly"
  | "filesystem"
  | "network-api"
  | "mcp-standard";

/**
 * Approval mode for permission escalation
 * - auto: Automatically approve (default - OAuth-like model)
 * - hil: Human-in-the-loop approval required (explicit opt-in)
 */
export type ApprovalMode = "hil" | "auto";

/**
 * Permission configuration for MCP tools
 *
 * This is METADATA only - not enforced in sandbox.
 * Worker sandbox always runs with permissions: "none".
 * MCP servers run as separate processes with their own permissions.
 *
 * @example
 * ```yaml
 * github:
 *   scope: network-api    # Metadata for audit
 *   approvalMode: auto    # Controls per-layer validation
 * ```
 */
export interface PermissionConfig {
  /** Resource scope level (metadata for audit/documentation) */
  scope: PermissionScope;
  /** Approval mode: auto = works freely, hil = requires human approval */
  approvalMode: ApprovalMode;
}

/**
 * Permission set profiles as defined in ADR-035 (Story 7.7a)
 * @deprecated Use PermissionConfig for new code. This type is kept for backward compatibility.
 */
export type PermissionSet =
  | "minimal"
  | "readonly"
  | "filesystem"
  | "network-api"
  | "mcp-standard"
  | "trusted";

/**
 * Convert legacy PermissionSet to PermissionConfig
 * @param set - Legacy permission set string
 * @returns PermissionConfig with defaults (approvalMode=auto)
 */
export function permissionSetToConfig(set: PermissionSet): PermissionConfig {
  // 'trusted' maps to mcp-standard with auto approval
  const scope: PermissionScope = set === "trusted" ? "mcp-standard" : set;
  return {
    scope,
    approvalMode: "auto",
  };
}

/**
 * Permission escalation request (Story 7.7c - HIL Permission Escalation)
 *
 * When a capability fails with PermissionDenied, the system creates this request
 * to ask for human approval before upgrading the capability's permission set.
 *
 * Flow:
 * 1. Execution fails with PermissionDenied
 * 2. suggestEscalation() parses error and creates PermissionEscalationRequest
 * 3. ControlledExecutor emits decision_required event
 * 4. Human approves/rejects via CommandQueue
 * 5. If approved: update capability's permission_set in DB, retry execution
 */
export interface PermissionEscalationRequest {
  /** UUID of the capability requesting escalation */
  capabilityId: string;
  /** Current permission set (e.g., "minimal") */
  currentSet: PermissionSet;
  /** Requested permission set after escalation (e.g., "network-api") */
  requestedSet: PermissionSet;
  /** Reason for escalation (e.g., "PermissionDenied: net access to api.example.com") */
  reason: string;
  /** Detected operation that requires elevated permissions (e.g., "fetch", "read", "write") */
  detectedOperation: string;
  /** Confidence score (0-1) for the escalation suggestion */
  confidence: number;
}

/**
 * Audit log entry for permission escalation decisions (Story 7.7c)
 *
 * Every escalation request (approved or rejected) is logged for audit purposes.
 * Stored in permission_audit_log table (migration 018).
 */
export interface PermissionAuditLogEntry {
  /** Unique ID for the audit entry */
  id: string;
  /** Timestamp when the escalation was requested */
  timestamp: Date;
  /** UUID of the capability requesting escalation */
  capabilityId: string;
  /** Permission set before escalation */
  fromSet: PermissionSet;
  /** Permission set requested/granted */
  toSet: PermissionSet;
  /** Whether the escalation was approved */
  approved: boolean;
  /** Who approved (user_id or "system") */
  approvedBy?: string;
  /** Original error message that triggered escalation */
  reason?: string;
  /** Detected operation (e.g., "fetch", "read", "write") */
  detectedOperation?: string;
}
