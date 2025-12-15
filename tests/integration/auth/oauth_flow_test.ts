/**
 * OAuth Flow Integration Tests
 *
 * Tests the complete OAuth authentication flow including:
 * - User creation on first login
 * - API key generation
 * - Session management
 * - User profile updates
 *
 * Uses mocked GitHub API responses.
 *
 * @module tests/integration/auth/oauth_flow_test
 */

import { assertEquals, assertExists, assertNotEquals } from "@std/assert";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { createDrizzleClient, runDrizzleMigrations } from "../../../src/db/drizzle.ts";
import { users } from "../../../src/db/schema/users.ts";
import { generateApiKey, hashApiKey, verifyApiKey } from "../../../src/lib/api-key.ts";
import {
  consumeFlashApiKey,
  createSession,
  destroySession,
  getSession,
  setFlashApiKey,
} from "../../../src/server/auth/session.ts";
import { eq } from "drizzle-orm";

/**
 * Test helper: Create an in-memory PGlite database for tests
 */
async function createTestDb() {
  const pglite = new PGlite({ extensions: { vector } });
  const db = createDrizzleClient(pglite);
  await runDrizzleMigrations(db);
  return { db, pglite };
}

Deno.test("Integration: New user creation with API key", async () => {
  const { db, pglite } = await createTestDb();

  try {
    // Simulate what callback.ts does for a new user
    const mockGitHubUser = {
      id: 12345,
      login: "testuser",
      email: "test@example.com",
      avatar_url: "https://github.com/avatars/123",
    };

    // Generate API key (as callback does)
    const { key, prefix } = generateApiKey();
    const keyHash = await hashApiKey(key);

    // Insert user
    await db.insert(users).values({
      githubId: mockGitHubUser.id.toString(),
      username: mockGitHubUser.login,
      email: mockGitHubUser.email,
      avatarUrl: mockGitHubUser.avatar_url,
      apiKeyHash: keyHash,
      apiKeyPrefix: prefix,
      apiKeyCreatedAt: new Date(),
    });

    // Verify user was created
    const userRows = await db
      .select()
      .from(users)
      .where(eq(users.githubId, "12345"))
      .limit(1);

    assertEquals(userRows.length, 1);
    assertEquals(userRows[0].username, "testuser");
    assertEquals(userRows[0].email, "test@example.com");
    assertEquals(userRows[0].avatarUrl, "https://github.com/avatars/123");
    assertEquals(userRows[0].apiKeyPrefix, prefix);

    // Verify API key can be verified
    const verified = await verifyApiKey(key, userRows[0].apiKeyHash!);
    assertEquals(verified, true);
  } finally {
    await pglite.close();
  }
});

Deno.test("Integration: Returning user profile update", async () => {
  const { db, pglite } = await createTestDb();

  try {
    // Create initial user
    const { key, prefix } = generateApiKey();
    const keyHash = await hashApiKey(key);

    await db.insert(users).values({
      githubId: "99999",
      username: "originaluser",
      email: "original@example.com",
      avatarUrl: "https://github.com/avatars/original",
      apiKeyHash: keyHash,
      apiKeyPrefix: prefix,
      apiKeyCreatedAt: new Date(),
    });

    // Simulate returning user with updated profile
    const updatedProfile = {
      login: "updateduser",
      email: "updated@example.com",
      avatar_url: "https://github.com/avatars/updated",
    };

    await db
      .update(users)
      .set({
        username: updatedProfile.login,
        email: updatedProfile.email,
        avatarUrl: updatedProfile.avatar_url,
        updatedAt: new Date(),
      })
      .where(eq(users.githubId, "99999"));

    // Verify profile was updated
    const userRows = await db
      .select()
      .from(users)
      .where(eq(users.githubId, "99999"))
      .limit(1);

    assertEquals(userRows[0].username, "updateduser");
    assertEquals(userRows[0].email, "updated@example.com");
    assertEquals(userRows[0].avatarUrl, "https://github.com/avatars/updated");

    // API key should NOT be changed
    assertEquals(userRows[0].apiKeyPrefix, prefix);
  } finally {
    await pglite.close();
  }
});

Deno.test("Integration: API key regeneration", async () => {
  const { db, pglite } = await createTestDb();

  try {
    // Create user with initial API key
    const { key: originalKey, prefix: originalPrefix } = generateApiKey();
    const originalHash = await hashApiKey(originalKey);

    await db.insert(users).values({
      githubId: "77777",
      username: "regenuser",
      email: "regen@example.com",
      apiKeyHash: originalHash,
      apiKeyPrefix: originalPrefix,
      apiKeyCreatedAt: new Date(),
    });

    // Regenerate API key (as regenerate.ts does)
    const { key: newKey, prefix: newPrefix } = generateApiKey();
    const newHash = await hashApiKey(newKey);

    await db
      .update(users)
      .set({
        apiKeyHash: newHash,
        apiKeyPrefix: newPrefix,
        apiKeyCreatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.githubId, "77777"));

    // Verify new key works
    const userRows = await db
      .select()
      .from(users)
      .where(eq(users.githubId, "77777"))
      .limit(1);

    assertEquals(userRows[0].apiKeyPrefix, newPrefix);
    assertNotEquals(userRows[0].apiKeyPrefix, originalPrefix);

    // New key should verify
    const newVerified = await verifyApiKey(newKey, userRows[0].apiKeyHash!);
    assertEquals(newVerified, true);

    // Old key should NOT verify
    const oldVerified = await verifyApiKey(originalKey, userRows[0].apiKeyHash!);
    assertEquals(oldVerified, false);
  } finally {
    await pglite.close();
  }
});

Deno.test("Integration: Session + flash API key flow", async () => {
  const kv = await Deno.openKv(":memory:");

  try {
    const sessionId = "test-session-oauth-flow";
    const apiKey = "ac_flash1234567890abcdefgh";

    // Create session
    await createSession(kv, sessionId, {
      userId: "user-123",
      username: "flashuser",
      avatarUrl: "https://example.com/avatar",
      createdAt: Date.now(),
    });

    // Set flash API key
    await setFlashApiKey(kv, sessionId, apiKey);

    // Verify session exists
    const session = await getSession(kv, sessionId);
    assertExists(session);
    assertEquals(session?.username, "flashuser");

    // Consume flash API key
    const flashKey = await consumeFlashApiKey(kv, sessionId);
    assertEquals(flashKey, apiKey);

    // Flash should be consumed
    const secondFlash = await consumeFlashApiKey(kv, sessionId);
    assertEquals(secondFlash, null);

    // Session should still exist
    const stillSession = await getSession(kv, sessionId);
    assertExists(stillSession);

    // Destroy session (logout)
    await destroySession(kv, sessionId);

    // Session should be gone
    const noSession = await getSession(kv, sessionId);
    assertEquals(noSession, null);
  } finally {
    kv.close();
  }
});
