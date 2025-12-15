/**
 * API Key management utilities
 *
 * Security Requirements:
 * - Keys must have high entropy (24 random alphanumeric chars)
 * - Keys must be hashed using Argon2id (memory-hard)
 * - Prefix-based lookup for O(1) database access
 * - Full key shown ONCE to user, never retrievable
 *
 * @module lib/api-key
 */

import { hash, verify } from "@ts-rex/argon2";

const API_KEY_PREFIX = "ac_";
const API_KEY_LENGTH = 24;
const LOOKUP_PREFIX_LENGTH = 11; // "ac_" + 8 chars

/**
 * Generate a new API key
 * @returns Object with full key (show once) and prefix (store for lookup)
 */
export function generateApiKey(): { key: string; prefix: string } {
  // Generate 24 random alphanumeric characters
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const randomPart = Array.from(
    crypto.getRandomValues(new Uint8Array(API_KEY_LENGTH)),
    (byte) => chars[byte % chars.length],
  ).join("");

  const key = `${API_KEY_PREFIX}${randomPart}`;
  const prefix = key.substring(0, LOOKUP_PREFIX_LENGTH);

  return { key, prefix };
}

/**
 * Hash API key for secure storage
 * Uses Argon2id (memory-hard, side-channel resistant)
 *
 * @param key Full API key (ac_xxx)
 * @returns Argon2 hash string
 */
export async function hashApiKey(key: string): Promise<string> {
  // Argon2id is the default mode in @ts-rex/argon2
  return await hash(key);
}

/**
 * Verify API key against stored hash
 *
 * @param key Full API key to verify
 * @param hashedKey Stored Argon2 hash
 * @returns true if match, false otherwise
 */
export async function verifyApiKey(key: string, hashedKey: string): Promise<boolean> {
  try {
    return await verify(key, hashedKey);
  } catch {
    return false;
  }
}

/**
 * Extract lookup prefix from API key
 * Used for O(1) database lookup before expensive hash verification
 *
 * @param key Full API key
 * @returns First 11 characters (e.g., "ac_a1b2c3d4")
 */
export function getApiKeyPrefix(key: string): string {
  return key.substring(0, LOOKUP_PREFIX_LENGTH);
}
