/**
 * Route Classification for Fresh Middleware
 *
 * Defines which routes are protected (require auth in cloud mode)
 * and which are always public.
 *
 * Separated from _middleware.ts to enable unit testing without Fresh imports.
 *
 * @module web/route-guards
 */

// Routes that require authentication in cloud mode
const PROTECTED_PREFIXES = ["/dashboard", "/settings"];

// Routes that are always public
const PUBLIC_PREFIXES = ["/auth", "/blog", "/_frsh"];

/**
 * Check if path requires authentication
 */
export function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Check if path is always public
 */
export function isPublicRoute(pathname: string): boolean {
  // Root path is public
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
