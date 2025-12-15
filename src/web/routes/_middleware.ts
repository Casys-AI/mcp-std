/**
 * Fresh Authentication Middleware
 *
 * Protects dashboard and settings routes with session-based auth.
 * In local mode, auth is bypassed and user_id = "local".
 *
 * Protected routes:
 * - /dashboard/*
 * - /settings/*
 *
 * Public routes:
 * - /
 * - /auth/*
 * - /blog/*
 *
 * @module web/routes/_middleware
 */

import type { FreshContext } from "fresh";
import { isCloudMode } from "../../lib/auth.ts";
import { getSessionFromRequest } from "../../server/auth/session.ts";
import { isProtectedRoute, isPublicRoute } from "../route-guards.ts";

/**
 * User state injected into Fresh context
 */
export interface AuthState {
  user: {
    id: string;
    username: string;
    avatarUrl?: string;
  } | null;
  isCloudMode: boolean;
}

/**
 * Fresh 2.x middleware handler
 * Note: Fresh 2.x uses single argument ctx with ctx.req
 */
export async function handler(
  ctx: FreshContext<AuthState>,
): Promise<Response> {
  const url = new URL(ctx.req.url);
  const pathname = url.pathname;

  // Initialize state
  ctx.state.isCloudMode = isCloudMode();
  ctx.state.user = null;

  // Local mode: bypass auth, inject local user
  if (!isCloudMode()) {
    ctx.state.user = {
      id: "local",
      username: "local",
      avatarUrl: undefined,
    };
    return ctx.next();
  }

  // Cloud mode: check session for protected routes
  if (isProtectedRoute(pathname)) {
    const session = await getSessionFromRequest(ctx.req);

    if (!session) {
      // Redirect to signin with return URL
      const returnUrl = encodeURIComponent(pathname + url.search);
      return new Response(null, {
        status: 302,
        headers: { Location: `/auth/signin?return=${returnUrl}` },
      });
    }

    // Inject user into context
    ctx.state.user = {
      id: session.userId,
      username: session.username,
      avatarUrl: session.avatarUrl,
    };
  } else if (!isPublicRoute(pathname)) {
    // For non-protected, non-public routes, try to get session but don't require it
    const session = await getSessionFromRequest(ctx.req);
    if (session) {
      ctx.state.user = {
        id: session.userId,
        username: session.username,
        avatarUrl: session.avatarUrl,
      };
    }
  }

  return ctx.next();
}
