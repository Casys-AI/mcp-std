/**
 * Package Session Store
 *
 * In-memory store for active package sessions.
 * Handles registration, heartbeat, expiry cleanup.
 *
 * @module mcp/sessions/session-store
 */

import * as log from "@std/log";
import type {
  PackageSession,
  RegisterRequest,
  RegisterResponse,
} from "./types.ts";

/** Default session TTL: 5 minutes */
const DEFAULT_SESSION_TTL_MS = 5 * 60 * 1000;

/** Heartbeat interval: 1 minute */
const HEARTBEAT_INTERVAL_MS = 60 * 1000;

/** Cleanup interval: 1 minute */
const CLEANUP_INTERVAL_MS = 60 * 1000;

/**
 * Session store for package connections.
 *
 * Features:
 * - Register new package sessions
 * - Heartbeat to keep sessions alive
 * - Automatic expiry cleanup
 * - Lookup by sessionId or userId
 */
export class SessionStore {
  /** Active sessions by sessionId */
  private sessions = new Map<string, PackageSession>();

  /** Index: sessionId by userId (for quick lookup) */
  private sessionsByUser = new Map<string, Set<string>>();

  /** Cleanup timer */
  private cleanupTimer: number | null = null;

  /** Session TTL in ms */
  private readonly sessionTtlMs: number;

  constructor(options?: { sessionTtlMs?: number }) {
    this.sessionTtlMs = options?.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  }

  /**
   * Start automatic cleanup of expired sessions.
   */
  startCleanup(): void {
    if (this.cleanupTimer) return;

    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, CLEANUP_INTERVAL_MS);

    log.debug("[SessionStore] Cleanup started");
  }

  /**
   * Stop automatic cleanup.
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      log.debug("[SessionStore] Cleanup stopped");
    }
  }

  /**
   * Register a new package session.
   *
   * @param request - Registration request from package
   * @param userId - User ID from auth
   * @returns Registration response with session ID
   */
  register(
    request: RegisterRequest,
    userId: string,
  ): RegisterResponse {
    const sessionId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.sessionTtlMs);

    const session: PackageSession = {
      sessionId,
      clientId: request.clientId,
      userId,
      version: request.version,
      capabilities: request.capabilities,
      workspace: request.workspace,
      registeredAt: now,
      lastHeartbeat: now,
      expiresAt,
    };

    // Store session
    this.sessions.set(sessionId, session);

    // Index by user
    if (!this.sessionsByUser.has(userId)) {
      this.sessionsByUser.set(userId, new Set());
    }
    this.sessionsByUser.get(userId)!.add(sessionId);

    log.info("[SessionStore] Package registered", {
      sessionId: sessionId.slice(0, 8),
      clientId: request.clientId.slice(0, 8),
      userId,
      version: request.version,
    });

    return {
      sessionId,
      expiresAt: expiresAt.toISOString(),
      heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
      features: {
        hybridRouting: true,
        tracing: true,
      },
    };
  }

  /**
   * Process heartbeat from package.
   *
   * @param sessionId - Session ID
   * @returns New expiry time, or null if session not found/expired
   */
  heartbeat(sessionId: string): { valid: boolean; expiresAt: string } {
    const session = this.sessions.get(sessionId);

    if (!session) {
      log.debug("[SessionStore] Heartbeat for unknown session", { sessionId: sessionId.slice(0, 8) });
      return { valid: false, expiresAt: new Date().toISOString() };
    }

    const now = new Date();

    // Check if expired
    if (session.expiresAt < now) {
      this.remove(sessionId);
      return { valid: false, expiresAt: now.toISOString() };
    }

    // Refresh expiry
    session.lastHeartbeat = now;
    session.expiresAt = new Date(now.getTime() + this.sessionTtlMs);

    log.debug("[SessionStore] Heartbeat", {
      sessionId: sessionId.slice(0, 8),
      expiresAt: session.expiresAt.toISOString(),
    });

    return { valid: true, expiresAt: session.expiresAt.toISOString() };
  }

  /**
   * Unregister a session (graceful shutdown).
   *
   * @param sessionId - Session ID to remove
   * @returns true if session was found and removed
   */
  unregister(sessionId: string): boolean {
    const removed = this.remove(sessionId);
    if (removed) {
      log.info("[SessionStore] Package unregistered", { sessionId: sessionId.slice(0, 8) });
    }
    return removed;
  }

  /**
   * Get session by ID.
   *
   * @param sessionId - Session ID
   * @returns Session or undefined if not found/expired
   */
  get(sessionId: string): PackageSession | undefined {
    const session = this.sessions.get(sessionId);

    if (!session) return undefined;

    // Check expiry
    if (session.expiresAt < new Date()) {
      this.remove(sessionId);
      return undefined;
    }

    return session;
  }

  /**
   * Check if a session exists and is valid.
   *
   * @param sessionId - Session ID
   * @returns true if session is valid
   */
  isValid(sessionId: string): boolean {
    return this.get(sessionId) !== undefined;
  }

  /**
   * Check if a session is a package client (for hybrid routing).
   *
   * @param sessionId - Session ID (can be undefined)
   * @returns true if valid package session with hybrid routing capability
   */
  isPackageClient(sessionId: string | undefined): boolean {
    if (!sessionId) return false;

    const session = this.get(sessionId);
    return session?.capabilities.hybridRouting ?? false;
  }

  /**
   * Verify that a session belongs to a specific user.
   *
   * @param sessionId - Session ID to check
   * @param userId - User ID that should own the session
   * @returns true if session exists and belongs to the user
   */
  verifyOwnership(sessionId: string, userId: string): boolean {
    const session = this.get(sessionId);
    return session?.userId === userId;
  }

  /**
   * Get all sessions for a user.
   *
   * @param userId - User ID
   * @returns Array of active sessions
   */
  getByUser(userId: string): PackageSession[] {
    const sessionIds = this.sessionsByUser.get(userId);
    if (!sessionIds) return [];

    const sessions: PackageSession[] = [];
    for (const sessionId of sessionIds) {
      const session = this.get(sessionId);
      if (session) {
        sessions.push(session);
      }
    }
    return sessions;
  }

  /**
   * Get active session count.
   */
  get size(): number {
    return this.sessions.size;
  }

  /**
   * Remove a session.
   */
  private remove(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    this.sessions.delete(sessionId);

    // Remove from user index
    const userSessions = this.sessionsByUser.get(session.userId);
    if (userSessions) {
      userSessions.delete(sessionId);
      if (userSessions.size === 0) {
        this.sessionsByUser.delete(session.userId);
      }
    }

    return true;
  }

  /**
   * Cleanup expired sessions.
   */
  private cleanupExpired(): void {
    const now = new Date();
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions) {
      if (session.expiresAt < now) {
        this.remove(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      log.debug("[SessionStore] Cleaned expired sessions", { count: cleaned });
    }
  }

  /**
   * Shutdown: clear all sessions and stop cleanup.
   */
  shutdown(): void {
    this.stopCleanup();
    this.sessions.clear();
    this.sessionsByUser.clear();
    log.debug("[SessionStore] Shutdown complete");
  }
}

/** Singleton instance */
let instance: SessionStore | null = null;

/**
 * Get the singleton SessionStore instance.
 */
export function getSessionStore(): SessionStore {
  if (!instance) {
    instance = new SessionStore();
    instance.startCleanup();
  }
  return instance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetSessionStore(): void {
  if (instance) {
    instance.shutdown();
    instance = null;
  }
}
