/**
 * Session Store Unit Tests
 *
 * Tests for package session management (handshake).
 */

import { assertEquals, assertExists, assert } from "jsr:@std/assert@1";
import {
  SessionStore,
  resetSessionStore,
  getSessionStore,
} from "../../../../src/mcp/sessions/mod.ts";

// Reset singleton between tests
function createFreshStore(): SessionStore {
  resetSessionStore();
  return new SessionStore({ sessionTtlMs: 5000 }); // 5s TTL for tests
}

Deno.test("SessionStore: register creates valid session", () => {
  const store = createFreshStore();

  const response = store.register(
    {
      clientId: "test-client-123",
      version: "0.2.0",
      capabilities: {
        sandbox: true,
        clientTools: true,
        hybridRouting: true,
      },
      workspace: "/tmp/test",
    },
    "user-abc",
  );

  // Verify response
  assertExists(response.sessionId);
  assertEquals(response.sessionId.length, 36); // UUID format
  assertExists(response.expiresAt);
  assertEquals(response.heartbeatIntervalMs, 60000);
  assertEquals(response.features.hybridRouting, true);

  // Verify session stored
  const session = store.get(response.sessionId);
  assertExists(session);
  assertEquals(session.clientId, "test-client-123");
  assertEquals(session.userId, "user-abc");
  assertEquals(session.version, "0.2.0");

  store.shutdown();
});

Deno.test("SessionStore: isPackageClient returns true for valid session", () => {
  const store = createFreshStore();

  const response = store.register(
    {
      clientId: "client-1",
      version: "0.1.0",
      capabilities: { sandbox: true, clientTools: true, hybridRouting: true },
    },
    "user-1",
  );

  // Valid session with hybridRouting capability
  assertEquals(store.isPackageClient(response.sessionId), true);

  // Invalid session
  assertEquals(store.isPackageClient("nonexistent-session"), false);

  // Undefined
  assertEquals(store.isPackageClient(undefined), false);

  store.shutdown();
});

Deno.test("SessionStore: heartbeat extends session", async () => {
  const store = createFreshStore();

  const response = store.register(
    {
      clientId: "client-hb",
      version: "0.1.0",
      capabilities: { sandbox: true, clientTools: true, hybridRouting: true },
    },
    "user-hb",
  );

  const initialExpiry = response.expiresAt;

  // Wait a bit
  await new Promise((r) => setTimeout(r, 100));

  // Heartbeat
  const hbResponse = store.heartbeat(response.sessionId);
  assertEquals(hbResponse.valid, true);

  // Expiry should be extended
  assert(hbResponse.expiresAt > initialExpiry);

  store.shutdown();
});

Deno.test("SessionStore: heartbeat returns invalid for unknown session", () => {
  const store = createFreshStore();

  const response = store.heartbeat("unknown-session-id");
  assertEquals(response.valid, false);

  store.shutdown();
});

Deno.test("SessionStore: unregister removes session", () => {
  const store = createFreshStore();

  const response = store.register(
    {
      clientId: "client-unreg",
      version: "0.1.0",
      capabilities: { sandbox: true, clientTools: true, hybridRouting: true },
    },
    "user-unreg",
  );

  // Session exists
  assertEquals(store.isPackageClient(response.sessionId), true);
  assertEquals(store.size, 1);

  // Unregister
  const removed = store.unregister(response.sessionId);
  assertEquals(removed, true);

  // Session gone
  assertEquals(store.isPackageClient(response.sessionId), false);
  assertEquals(store.size, 0);

  store.shutdown();
});

Deno.test("SessionStore: expired session is invalid", async () => {
  // Very short TTL for this test
  const store = new SessionStore({ sessionTtlMs: 100 });

  const response = store.register(
    {
      clientId: "client-exp",
      version: "0.1.0",
      capabilities: { sandbox: true, clientTools: true, hybridRouting: true },
    },
    "user-exp",
  );

  // Valid immediately
  assertEquals(store.isPackageClient(response.sessionId), true);

  // Wait for expiry
  await new Promise((r) => setTimeout(r, 150));

  // Now expired
  assertEquals(store.isPackageClient(response.sessionId), false);
  assertEquals(store.get(response.sessionId), undefined);

  store.shutdown();
});

Deno.test("SessionStore: multiple sessions per user", () => {
  const store = createFreshStore();

  // Same user, different clients (e.g., multiple terminals)
  const r1 = store.register(
    {
      clientId: "client-a",
      version: "0.1.0",
      capabilities: { sandbox: true, clientTools: true, hybridRouting: true },
    },
    "same-user",
  );

  const r2 = store.register(
    {
      clientId: "client-b",
      version: "0.1.0",
      capabilities: { sandbox: true, clientTools: true, hybridRouting: true },
    },
    "same-user",
  );

  // Both valid
  assertEquals(store.isPackageClient(r1.sessionId), true);
  assertEquals(store.isPackageClient(r2.sessionId), true);
  assertEquals(store.size, 2);

  // Get by user
  const userSessions = store.getByUser("same-user");
  assertEquals(userSessions.length, 2);

  store.shutdown();
});

Deno.test("SessionStore: singleton via getSessionStore", () => {
  resetSessionStore();

  const store1 = getSessionStore();
  const store2 = getSessionStore();

  // Same instance
  assertEquals(store1, store2);

  // Register via one, visible via other
  const response = store1.register(
    {
      clientId: "singleton-test",
      version: "0.1.0",
      capabilities: { sandbox: true, clientTools: true, hybridRouting: true },
    },
    "user-single",
  );

  assertEquals(store2.isPackageClient(response.sessionId), true);

  resetSessionStore();
});

Deno.test("SessionStore: session without hybridRouting capability", () => {
  const store = createFreshStore();

  const response = store.register(
    {
      clientId: "no-hybrid",
      version: "0.1.0",
      capabilities: {
        sandbox: true,
        clientTools: true,
        hybridRouting: false, // <-- No hybrid routing
      },
    },
    "user-no-hybrid",
  );

  // Session exists but isPackageClient checks hybridRouting capability
  assertExists(store.get(response.sessionId));
  assertEquals(store.isPackageClient(response.sessionId), false);

  store.shutdown();
});

Deno.test("SessionStore: verifyOwnership checks user ID", () => {
  const store = createFreshStore();

  // User A creates a session
  const response = store.register(
    {
      clientId: "client-owner",
      version: "0.1.0",
      capabilities: { sandbox: true, clientTools: true, hybridRouting: true },
    },
    "user-a",
  );

  // User A can verify ownership
  assertEquals(store.verifyOwnership(response.sessionId, "user-a"), true);

  // User B cannot access User A's session
  assertEquals(store.verifyOwnership(response.sessionId, "user-b"), false);

  // Unknown session returns false
  assertEquals(store.verifyOwnership("unknown-session", "user-a"), false);

  store.shutdown();
});

console.log("\n🧪 Session Store Tests - Package/Server Handshake\n");
