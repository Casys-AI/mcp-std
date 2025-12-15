/**
 * Shared Deno KV instance for auth operations
 *
 * Uses a lazy singleton pattern to avoid connection leaks.
 * All auth modules should use getKv() instead of Deno.openKv().
 *
 * @module server/auth/kv
 */

let _kv: Deno.Kv | null = null;

/**
 * Get shared Deno KV instance (singleton)
 * Lazily initialized on first call.
 *
 * @returns Shared Deno KV instance
 */
export async function getKv(): Promise<Deno.Kv> {
  if (!_kv) {
    _kv = await Deno.openKv();
  }
  return _kv;
}

/**
 * Close KV connection (for graceful shutdown/tests)
 */
export async function closeKv(): Promise<void> {
  if (_kv) {
    _kv.close();
    _kv = null;
  }
}
