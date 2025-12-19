/**
 * Crypto/hashing tools
 *
 * Uses Web Crypto API (built into Deno).
 *
 * Inspired by:
 * - IT-Tools MCP: https://github.com/wrenchpilot/it-tools-mcp
 * - TextToolkit MCP: https://github.com/Cicatriiz/text-toolkit
 *
 * @module lib/std/crypto
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
  // Inspired by IT-Tools MCP: https://github.com/wrenchpilot/it-tools-mcp
  {
    name: "crypto_url",
    description: "Encode or decode URL (percent encoding)",
    category: "crypto",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to encode/decode" },
        action: { type: "string", enum: ["encode", "decode"], description: "Action" },
        component: {
          type: "boolean",
          description: "Use component encoding (encodes more chars, default: true)",
        },
      },
      required: ["text", "action"],
    },
    handler: ({ text, action, component = true }) => {
      if (action === "encode") {
        return component ? encodeURIComponent(text as string) : encodeURI(text as string);
      }
      return component ? decodeURIComponent(text as string) : decodeURI(text as string);
    },
  },
  {
    name: "crypto_html",
    description: "Encode or decode HTML entities",
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
      const htmlEntities: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
        "/": "&#x2F;",
        "`": "&#x60;",
        "=": "&#x3D;",
      };

      if (action === "encode") {
        return (text as string).replace(/[&<>"'`=/]/g, (c) => htmlEntities[c] || c);
      }
      // Decode: reverse the mapping
      const reverseEntities: Record<string, string> = {};
      for (const [char, entity] of Object.entries(htmlEntities)) {
        reverseEntities[entity] = char;
      }
      return (text as string).replace(
        /&(?:amp|lt|gt|quot|#39|#x2F|#x60|#x3D);/g,
        (entity) => reverseEntities[entity] || entity,
      );
    },
  },
  {
    name: "crypto_password",
    description: "Generate a strong random password",
    category: "crypto",
    inputSchema: {
      type: "object",
      properties: {
        length: { type: "number", description: "Password length (default: 16)" },
        uppercase: { type: "boolean", description: "Include uppercase (default: true)" },
        lowercase: { type: "boolean", description: "Include lowercase (default: true)" },
        numbers: { type: "boolean", description: "Include numbers (default: true)" },
        symbols: { type: "boolean", description: "Include symbols (default: true)" },
        excludeSimilar: {
          type: "boolean",
          description: "Exclude similar chars (0O, 1lI) (default: false)",
        },
      },
    },
    handler: ({
      length = 16,
      uppercase = true,
      lowercase = true,
      numbers = true,
      symbols = true,
      excludeSimilar = false,
    }) => {
      let chars = "";
      const upper = excludeSimilar ? "ABCDEFGHJKLMNPQRSTUVWXYZ" : "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const lower = excludeSimilar ? "abcdefghjkmnpqrstuvwxyz" : "abcdefghijklmnopqrstuvwxyz";
      const nums = excludeSimilar ? "23456789" : "0123456789";
      const syms = "!@#$%^&*()_+-=[]{}|;:,.<>?";

      if (uppercase) chars += upper;
      if (lowercase) chars += lower;
      if (numbers) chars += nums;
      if (symbols) chars += syms;

      if (!chars) chars = lower + nums; // Fallback

      const len = length as number;
      const randomValues = crypto.getRandomValues(new Uint8Array(len));
      return Array.from(randomValues, (byte) => chars[byte % chars.length]).join("");
    },
  },
  {
    name: "crypto_jwt_decode",
    description: "Decode a JWT token (without verification) to inspect its contents",
    category: "crypto",
    inputSchema: {
      type: "object",
      properties: {
        token: { type: "string", description: "JWT token to decode" },
      },
      required: ["token"],
    },
    handler: ({ token }) => {
      const parts = (token as string).split(".");
      if (parts.length !== 3) {
        throw new Error("Invalid JWT format: expected 3 parts separated by dots");
      }

      const decodeBase64Url = (str: string) => {
        // Convert base64url to base64
        let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
        // Add padding if needed
        while (base64.length % 4) base64 += "=";
        return JSON.parse(atob(base64));
      };

      try {
        const header = decodeBase64Url(parts[0]);
        const payload = decodeBase64Url(parts[1]);

        // Check expiration
        let expired = false;
        let expiresAt = null;
        if (payload.exp) {
          expiresAt = new Date(payload.exp * 1000).toISOString();
          expired = Date.now() > payload.exp * 1000;
        }

        return {
          header,
          payload,
          signature: parts[2],
          expired,
          expiresAt,
          issuedAt: payload.iat ? new Date(payload.iat * 1000).toISOString() : null,
        };
      } catch (e) {
        throw new Error(`Failed to decode JWT: ${(e as Error).message}`);
      }
    },
  },
  {
    name: "crypto_ulid",
    description: "Generate ULID(s) - Universally Unique Lexicographically Sortable Identifier",
    category: "crypto",
    inputSchema: {
      type: "object",
      properties: {
        count: { type: "number", description: "How many ULIDs (default: 1)" },
      },
    },
    handler: ({ count = 1 }) => {
      // ULID: 10 chars timestamp (48 bits) + 16 chars randomness (80 bits)
      const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford's Base32

      const encodeTime = (time: number, len: number) => {
        let str = "";
        for (let i = len; i > 0; i--) {
          const mod = time % 32;
          str = ENCODING[mod] + str;
          time = Math.floor(time / 32);
        }
        return str;
      };

      const encodeRandom = (len: number) => {
        const bytes = crypto.getRandomValues(new Uint8Array(len));
        let str = "";
        for (const byte of bytes) {
          str += ENCODING[byte % 32];
        }
        return str;
      };

      const generateULID = () => {
        const time = Date.now();
        return encodeTime(time, 10) + encodeRandom(16);
      };

      const cnt = count as number;
      const ulids = Array.from({ length: cnt }, generateULID);
      return cnt === 1 ? ulids[0] : ulids;
    },
  },
  {
    name: "crypto_hmac",
    description: "Generate HMAC (Hash-based Message Authentication Code)",
    category: "crypto",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Message to authenticate" },
        key: { type: "string", description: "Secret key" },
        algorithm: {
          type: "string",
          enum: ["SHA-256", "SHA-384", "SHA-512"],
          description: "Hash algorithm (default: SHA-256)",
        },
      },
      required: ["message", "key"],
    },
    handler: async ({ message, key, algorithm = "SHA-256" }) => {
      const encoder = new TextEncoder();
      const keyData = encoder.encode(key as string);
      const messageData = encoder.encode(message as string);

      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: algorithm as string },
        false,
        ["sign"],
      );

      const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
      const hashArray = Array.from(new Uint8Array(signature));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    },
  },
  {
    name: "crypto_totp",
    description: "Generate TOTP (Time-based One-Time Password) code",
    category: "crypto",
    inputSchema: {
      type: "object",
      properties: {
        secret: { type: "string", description: "Base32 encoded secret key" },
        digits: { type: "number", description: "Number of digits (default: 6)" },
        period: { type: "number", description: "Time step in seconds (default: 30)" },
        algorithm: {
          type: "string",
          enum: ["SHA-1", "SHA-256", "SHA-512"],
          description: "Hash algorithm (default: SHA-1)",
        },
      },
      required: ["secret"],
    },
    handler: async ({ secret, digits = 6, period = 30, algorithm = "SHA-1" }) => {
      // Base32 decode
      const base32Decode = (encoded: string): Uint8Array => {
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        const cleanedInput = encoded.toUpperCase().replace(/[^A-Z2-7]/g, "");
        const bits: number[] = [];

        for (const char of cleanedInput) {
          const val = alphabet.indexOf(char);
          if (val === -1) continue;
          for (let i = 4; i >= 0; i--) {
            bits.push((val >> i) & 1);
          }
        }

        const bytes: number[] = [];
        for (let i = 0; i + 8 <= bits.length; i += 8) {
          let byte = 0;
          for (let j = 0; j < 8; j++) {
            byte = (byte << 1) | bits[i + j];
          }
          bytes.push(byte);
        }
        return new Uint8Array(bytes);
      };

      const secretBytes = base32Decode(secret as string);
      const counter = Math.floor(Date.now() / 1000 / (period as number));

      // Convert counter to 8-byte big-endian
      const counterBytes = new Uint8Array(8);
      let temp = counter;
      for (let i = 7; i >= 0; i--) {
        counterBytes[i] = temp & 0xff;
        temp = Math.floor(temp / 256);
      }

      // Generate HMAC
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        secretBytes.buffer as ArrayBuffer,
        { name: "HMAC", hash: algorithm as string },
        false,
        ["sign"],
      );

      const signature = await crypto.subtle.sign("HMAC", cryptoKey, counterBytes);
      const hash = new Uint8Array(signature);

      // Dynamic truncation
      const offset = hash[hash.length - 1] & 0x0f;
      const binary =
        ((hash[offset] & 0x7f) << 24) |
        ((hash[offset + 1] & 0xff) << 16) |
        ((hash[offset + 2] & 0xff) << 8) |
        (hash[offset + 3] & 0xff);

      const otp = binary % Math.pow(10, digits as number);
      const code = otp.toString().padStart(digits as number, "0");

      const timeRemaining = (period as number) - (Math.floor(Date.now() / 1000) % (period as number));

      return {
        code,
        expiresIn: timeRemaining,
        period: period as number,
      };
    },
  },
  {
    name: "crypto_text_to_binary",
    description: "Convert text to binary representation",
    category: "crypto",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to convert" },
        separator: { type: "string", description: "Separator between bytes (default: ' ')" },
      },
      required: ["text"],
    },
    handler: ({ text, separator = " " }) => {
      const bytes = new TextEncoder().encode(text as string);
      return Array.from(bytes)
        .map((b) => b.toString(2).padStart(8, "0"))
        .join(separator as string);
    },
  },
  {
    name: "crypto_binary_to_text",
    description: "Convert binary representation back to text",
    category: "crypto",
    inputSchema: {
      type: "object",
      properties: {
        binary: { type: "string", description: "Binary string (space or no separator)" },
      },
      required: ["binary"],
    },
    handler: ({ binary }) => {
      const cleaned = (binary as string).replace(/\s/g, "");
      if (!/^[01]+$/.test(cleaned) || cleaned.length % 8 !== 0) {
        throw new Error("Invalid binary string");
      }
      const bytes = new Uint8Array(cleaned.length / 8);
      for (let i = 0; i < cleaned.length; i += 8) {
        bytes[i / 8] = parseInt(cleaned.slice(i, i + 8), 2);
      }
      return new TextDecoder().decode(bytes);
    },
  },
  {
    name: "crypto_text_to_unicode",
    description: "Convert text to Unicode code points",
    category: "crypto",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to convert" },
        format: {
          type: "string",
          enum: ["decimal", "hex", "escaped"],
          description: "Output format (default: hex)",
        },
      },
      required: ["text"],
    },
    handler: ({ text, format = "hex" }) => {
      const codePoints = [...(text as string)].map((c) => c.codePointAt(0)!);
      switch (format) {
        case "decimal":
          return codePoints.join(" ");
        case "escaped":
          return codePoints.map((cp) => cp > 127 ? `\\u${cp.toString(16).padStart(4, "0")}` : String.fromCodePoint(cp)).join("");
        case "hex":
        default:
          return codePoints.map((cp) => `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`).join(" ");
      }
    },
  },
  {
    name: "crypto_generate_token",
    description: "Generate a secure random token",
    category: "crypto",
    inputSchema: {
      type: "object",
      properties: {
        length: { type: "number", description: "Token length in bytes (default: 32)" },
        format: {
          type: "string",
          enum: ["hex", "base64", "base64url"],
          description: "Output format (default: hex)",
        },
      },
    },
    handler: ({ length = 32, format = "hex" }) => {
      const bytes = crypto.getRandomValues(new Uint8Array(length as number));

      switch (format) {
        case "base64":
          return btoa(String.fromCharCode(...bytes));
        case "base64url":
          return btoa(String.fromCharCode(...bytes))
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=/g, "");
        case "hex":
        default:
          return Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
      }
    },
  },
  {
    name: "crypto_basic_auth",
    description: "Generate or decode HTTP Basic Auth header",
    category: "crypto",
    inputSchema: {
      type: "object",
      properties: {
        username: { type: "string", description: "Username (for encoding)" },
        password: { type: "string", description: "Password (for encoding)" },
        header: { type: "string", description: "Basic auth header to decode" },
        action: {
          type: "string",
          enum: ["encode", "decode"],
          description: "Action (default: encode)",
        },
      },
    },
    handler: ({ username, password, header, action = "encode" }) => {
      if (action === "decode") {
        if (!header) throw new Error("Header required for decode");
        const h = (header as string).replace(/^Basic\s+/i, "");
        const decoded = atob(h);
        const colonIndex = decoded.indexOf(":");
        if (colonIndex === -1) {
          return { username: decoded, password: "" };
        }
        return {
          username: decoded.slice(0, colonIndex),
          password: decoded.slice(colonIndex + 1),
        };
      }

      if (!username) throw new Error("Username required for encode");
      const credentials = `${username}:${password || ""}`;
      const encoded = btoa(credentials);
      return {
        header: `Basic ${encoded}`,
        encoded,
        credentials,
      };
    },
  },
];
