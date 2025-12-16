/**
 * Crypto/hashing tools
 *
 * Uses Web Crypto API (built into Deno).
 *
 * @module lib/primitives/crypto
 */

import type { MiniTool } from "./types.ts";

export const cryptoTools: MiniTool[] = [
  {
    name: "crypto_hash",
    description: "Generate hash of text (SHA-256, SHA-1, SHA-384, SHA-512)",
    category: "crypto",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to hash" },
        algorithm: {
          type: "string",
          enum: ["SHA-256", "SHA-1", "SHA-384", "SHA-512"],
          description: "Hash algorithm (default: SHA-256)",
        },
      },
      required: ["text"],
    },
    handler: async ({ text, algorithm = "SHA-256" }) => {
      const encoder = new TextEncoder();
      const data = encoder.encode(text as string);
      const hashBuffer = await crypto.subtle.digest(algorithm as string, data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    },
  },
  {
    name: "crypto_uuid",
    description: "Generate UUID(s)",
    category: "crypto",
    inputSchema: {
      type: "object",
      properties: {
        count: { type: "number", description: "How many UUIDs (default: 1)" },
      },
    },
    handler: ({ count = 1 }) => {
      const cnt = count as number;
      const uuids = Array.from({ length: cnt }, () => crypto.randomUUID());
      return cnt === 1 ? uuids[0] : uuids;
    },
  },
  {
    name: "crypto_base64",
    description: "Encode or decode Base64",
    category: "crypto",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to encode/decode" },
        action: { type: "string", enum: ["encode", "decode"], description: "Action" },
      },
      required: ["text", "action"],
    },
    handler: ({ text, action }) => {
      if (action === "encode") {
        return btoa(text as string);
      }
      return atob(text as string);
    },
  },
  {
    name: "crypto_hex",
    description: "Encode or decode hexadecimal",
    category: "crypto",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to encode/decode" },
        action: { type: "string", enum: ["encode", "decode"], description: "Action" },
      },
      required: ["text", "action"],
    },
    handler: ({ text, action }) => {
      if (action === "encode") {
        return Array.from(new TextEncoder().encode(text as string))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      }
      const hex = text as string;
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
      }
      return new TextDecoder().decode(bytes);
    },
  },
  {
    name: "crypto_random_bytes",
    description: "Generate random bytes as hex string",
    category: "crypto",
    inputSchema: {
      type: "object",
      properties: {
        length: { type: "number", description: "Number of bytes (default: 16)" },
      },
    },
    handler: ({ length = 16 }) => {
      const bytes = crypto.getRandomValues(new Uint8Array(length as number));
      return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    },
  },
];
