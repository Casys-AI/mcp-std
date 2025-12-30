/**
 * Schema and JSON types for capabilities
 *
 * Base types used across the capability system.
 * Must be imported first as other type files depend on these.
 *
 * @module capabilities/types/schema
 */

/**
 * JSON primitive types for JSON-serializable values
 */
export type JsonPrimitive = string | number | boolean | null;

/**
 * JSON-serializable value type
 *
 * Used for data that needs to be stored in JSONB columns (PostgreSQL)
 * or serialized for caching/transmission.
 *
 * @example
 * const literal: JsonValue = "hello";
 * const object: JsonValue = { key: [1, 2, 3] };
 */
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

/**
 * JSON Schema type (simplified for capability parameters)
 *
 * Note: 'type' is optional to support unconstrained schemas ({})
 * which accept any value when no type can be inferred.
 */
export interface JSONSchema {
  $schema?: string;
  type?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  description?: string;
  default?: JsonValue;
  examples?: JsonValue[];
}

/**
 * Cache configuration for a capability
 */
export interface CacheConfig {
  /** Time-to-live in milliseconds (default: 3600000 = 1 hour) */
  ttl_ms: number;
  /** Whether this capability can be cached (default: true) */
  cacheable: boolean;
}
