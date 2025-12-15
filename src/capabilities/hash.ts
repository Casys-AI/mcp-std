/**
 * Code Hashing for Capability Deduplication (Epic 7 - Story 7.2a)
 *
 * Uses SHA-256 to generate collision-resistant hashes for code snippets.
 * Normalizes code before hashing to ensure consistent deduplication.
 *
 * @module capabilities/hash
 */

/**
 * Normalize code for consistent hashing
 *
 * - Trims leading/trailing whitespace
 * - Collapses consecutive whitespace to single space
 * - Does NOT remove comments (they may contain important logic hints)
 *
 * @param code Raw code string
 * @returns Normalized code string
 */
export function normalizeCode(code: string): string {
  return code
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Generate SHA-256 hash of code for deduplication
 *
 * Uses Web Crypto API (available in Deno) for secure hashing.
 * Code is normalized before hashing to ensure consistent deduplication
 * even with whitespace variations.
 *
 * @param code TypeScript code snippet
 * @returns 64-character hex string (SHA-256)
 *
 * @example
 * ```typescript
 * const hash = await hashCode("const x = 1;");
 * // "a7f5c3..." (64 hex chars)
 *
 * // Whitespace variations produce same hash
 * const hash2 = await hashCode("const x  =  1;  ");
 * // Same as hash1 after normalization
 * ```
 */
export async function hashCode(code: string): Promise<string> {
  const normalized = normalizeCode(code);
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate hash synchronously using djb2 algorithm (for tests/quick checks)
 *
 * NOT cryptographically secure - use hashCode() for production deduplication.
 * Useful for quick tests where async is inconvenient.
 *
 * @param code TypeScript code snippet
 * @returns djb2 hash as hex string
 */
export function hashCodeSync(code: string): string {
  const normalized = normalizeCode(code);
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) + hash) ^ normalized.charCodeAt(i);
  }
  // Convert to unsigned 32-bit integer and then to hex
  return (hash >>> 0).toString(16).padStart(8, "0");
}
