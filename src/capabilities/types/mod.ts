/**
 * Capability types module - Re-exports all capability types
 *
 * This file provides a unified import point for all capability types.
 * Import from here for convenience, or from individual files for minimal imports.
 *
 * @example
 * ```typescript
 * // Import all types
 * import type { Capability, ExecutionTrace, StaticStructure } from "@/capabilities/types/mod.ts";
 *
 * // Or import from specific modules
 * import type { Capability } from "@/capabilities/types/capability.ts";
 * ```
 *
 * @module capabilities/types
 */

// Schema and JSON types (base types)
export * from "./schema.ts";

// Permission types
export * from "./permission.ts";

// Static analysis types
export * from "./static-analysis.ts";

// Execution trace types
export * from "./execution.ts";

// Core capability types
export * from "./capability.ts";

// Graph visualization types
export * from "./graph.ts";

// FQDN and registry types
export * from "./fqdn.ts";
