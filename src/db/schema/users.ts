/**
 * Users Table Schema
 *
 * Stores user accounts for multi-tenant authentication.
 * Supports both GitHub OAuth and API key authentication.
 *
 * Security:
 * - API keys are hashed with Argon2id before storage
 * - Only prefix stored for O(1) lookup, full key never retrievable
 *
 * @module db/schema/users
 */

import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  // Primary key
  id: uuid("id").primaryKey().defaultRandom(),

  // GitHub OAuth fields
  githubId: text("github_id").unique(),
  username: text("username").notNull(),
  email: text("email"),
  avatarUrl: text("avatar_url"),
  role: text("role").default("user"),

  // API Key fields (for MCP Gateway authentication)
  apiKeyHash: text("api_key_hash"),
  apiKeyPrefix: text("api_key_prefix").unique(),
  apiKeyCreatedAt: timestamp("api_key_created_at", { withTimezone: true }),

  // Timestamps
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
