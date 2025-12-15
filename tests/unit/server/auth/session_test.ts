/**
 * Session Management Tests
 *
 * Tests for src/server/auth/session.ts
 * Uses in-memory Deno KV for testing.
 *
 * @module tests/unit/server/auth/session_test
 */

import { assertEquals, assertExists } from "@std/assert";
import {
  consumeFlashApiKey,
  createSession,
  destroySession,
  getSession,
  type Session,
  setFlashApiKey,
} from "../../../../src/server/auth/session.ts";

Deno.test("createSession/getSession - roundtrip", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const session: Session = {
      userId: "test-user-id-123",
      username: "testuser",
      avatarUrl: "https://example.com/avatar.png",
      createdAt: Date.now(),
    };

    await createSession(kv, "session-abc123", session);
    const retrieved = await getSession(kv, "session-abc123");

    assertExists(retrieved, "Session should be retrieved");
    assertEquals(retrieved?.userId, session.userId);
    assertEquals(retrieved?.username, session.username);
    assertEquals(retrieved?.avatarUrl, session.avatarUrl);
  } finally {
    kv.close();
  }
});

Deno.test("getSession - returns null for non-existent session", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const retrieved = await getSession(kv, "non-existent-session");
    assertEquals(retrieved, null);
  } finally {
    kv.close();
  }
});

Deno.test("destroySession - removes session", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const session: Session = {
      userId: "test-user-id",
      username: "testuser",
      createdAt: Date.now(),
    };

    await createSession(kv, "session-to-destroy", session);

    // Verify session exists
    const beforeDestroy = await getSession(kv, "session-to-destroy");
    assertExists(beforeDestroy, "Session should exist before destroy");

    // Destroy session
    await destroySession(kv, "session-to-destroy");

    // Verify session is gone
    const afterDestroy = await getSession(kv, "session-to-destroy");
    assertEquals(afterDestroy, null, "Session should be null after destroy");
  } finally {
    kv.close();
  }
});

Deno.test("setFlashApiKey/consumeFlashApiKey - roundtrip", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const apiKey = "ac_test1234567890abcdefgh";
    await setFlashApiKey(kv, "flash-session-123", apiKey);

    // First consume should return the key
    const retrieved = await consumeFlashApiKey(kv, "flash-session-123");
    assertEquals(retrieved, apiKey, "Flash API key should be returned");

    // Second consume should return null (already consumed)
    const secondRetrieve = await consumeFlashApiKey(kv, "flash-session-123");
    assertEquals(secondRetrieve, null, "Flash API key should be consumed (null on second call)");
  } finally {
    kv.close();
  }
});

Deno.test("consumeFlashApiKey - returns null for non-existent flash", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const retrieved = await consumeFlashApiKey(kv, "non-existent-flash");
    assertEquals(retrieved, null);
  } finally {
    kv.close();
  }
});

Deno.test("Session interface - optional avatarUrl", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    // Session without avatarUrl
    const session: Session = {
      userId: "user-no-avatar",
      username: "noavatar",
      createdAt: Date.now(),
    };

    await createSession(kv, "session-no-avatar", session);
    const retrieved = await getSession(kv, "session-no-avatar");

    assertExists(retrieved);
    assertEquals(retrieved?.avatarUrl, undefined);
  } finally {
    kv.close();
  }
});
