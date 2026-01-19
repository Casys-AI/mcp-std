/**
 * Security and JWT tools
 *
 * Uses Deno native crypto.subtle for cryptographic operations.
 * Pure implementations - no external dependencies.
 *
 * @module lib/std/security
 */

import type { MiniTool } from "./types.ts";

// Helper: Base64URL encode (URL-safe base64)
function base64UrlEncode(data: Uint8Array | string): string {
  const str = typeof data === "string" ? data : new TextDecoder().decode(data);
  return btoa(str)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlEncodeBytes(data: Uint8Array): string {
  let binary = "";
  for (const byte of data) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Helper: Base64URL decode
function base64UrlDecode(str: string): Uint8Array {
  // Add padding if needed
  let padded = str.replace(/-/g, "+").replace(/_/g, "/");
  while (padded.length % 4) {
    padded += "=";
  }
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export const securityTools: MiniTool[] = [
  {
    name: "jwt_generate",
    description:
      "Generate a JSON Web Token (JWT) with custom payload. Uses HMAC-SHA256 (HS256) algorithm with Deno native crypto. Set expiration, issuer, audience, and custom claims. Keywords: JWT create, generate token, HS256, JSON Web Token, auth token, sign JWT.",
    category: "security",
    inputSchema: {
      type: "object",
      properties: {
        payload: {
          type: "object",
          description: "JWT payload (claims). Standard claims: sub, iss, aud, exp, iat, nbf",
        },
        secret: { type: "string", description: "Secret key for signing (min 32 chars recommended)" },
        expiresIn: {
          type: "number",
          description: "Expiration time in seconds from now (e.g., 3600 for 1 hour)",
        },
        issuer: { type: "string", description: "Token issuer (iss claim)" },
        audience: { type: "string", description: "Token audience (aud claim)" },
        subject: { type: "string", description: "Token subject (sub claim)" },
      },
      required: ["payload", "secret"],
    },
    handler: async ({ payload, secret, expiresIn, issuer, audience, subject }) => {
      const header = {
        alg: "HS256",
        typ: "JWT",
      };

      const now = Math.floor(Date.now() / 1000);
      const claims: Record<string, unknown> = {
        ...(payload as Record<string, unknown>),
        iat: now, // Issued at
      };

      if (expiresIn) {
        claims.exp = now + (expiresIn as number);
      }
      if (issuer) claims.iss = issuer;
      if (audience) claims.aud = audience;
      if (subject) claims.sub = subject;

      // Encode header and payload
      const encodedHeader = base64UrlEncode(JSON.stringify(header));
      const encodedPayload = base64UrlEncode(JSON.stringify(claims));
      const message = `${encodedHeader}.${encodedPayload}`;

      // Sign with HMAC-SHA256 using crypto.subtle
      const encoder = new TextEncoder();
      const keyData = encoder.encode(secret as string);
      const messageData = encoder.encode(message);

      const key = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );

      const signature = await crypto.subtle.sign("HMAC", key, messageData);
      const encodedSignature = base64UrlEncodeBytes(new Uint8Array(signature));

      const token = `${message}.${encodedSignature}`;

      return {
        token,
        header,
        payload: claims,
        expiresAt: claims.exp ? new Date((claims.exp as number) * 1000).toISOString() : null,
      };
    },
  },
  {
    name: "jwt_verify",
    description:
      "Verify and decode a JWT token. Checks signature validity and expiration. Uses HMAC-SHA256 (HS256). Returns decoded payload if valid. Keywords: JWT verify, validate token, check JWT, decode token, verify signature.",
    category: "security",
    inputSchema: {
      type: "object",
      properties: {
        token: { type: "string", description: "JWT token to verify" },
        secret: { type: "string", description: "Secret key used to sign the token" },
        ignoreExpiration: {
          type: "boolean",
          description: "Skip expiration check (default: false)",
        },
      },
      required: ["token", "secret"],
    },
    handler: async ({ token, secret, ignoreExpiration = false }) => {
      try {
        const parts = (token as string).split(".");
        if (parts.length !== 3) {
          return { valid: false, error: "Invalid JWT format" };
        }

        const [encodedHeader, encodedPayload, encodedSignature] = parts;

        // Decode header and payload
        const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedHeader)));
        const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload)));

        // Check algorithm
        if (header.alg !== "HS256") {
          return { valid: false, error: `Unsupported algorithm: ${header.alg}` };
        }

        // Verify signature
        const message = `${encodedHeader}.${encodedPayload}`;
        const encoder = new TextEncoder();
        const keyData = encoder.encode(secret as string);
        const messageData = encoder.encode(message);

        const key = await crypto.subtle.importKey(
          "raw",
          keyData,
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["verify"]
        );

        const signatureBytes = base64UrlDecode(encodedSignature);
        // Use Uint8Array directly - Deno's crypto.subtle accepts it
        const isValid = await crypto.subtle.verify("HMAC", key, new Uint8Array(signatureBytes), messageData);

        if (!isValid) {
          return { valid: false, error: "Invalid signature" };
        }

        // Check expiration
        if (!ignoreExpiration && payload.exp) {
          const now = Math.floor(Date.now() / 1000);
          if (payload.exp < now) {
            return {
              valid: false,
              error: "Token expired",
              expiredAt: new Date(payload.exp * 1000).toISOString(),
              header,
              payload,
            };
          }
        }

        return {
          valid: true,
          header,
          payload,
          expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
        };
      } catch (e) {
        return { valid: false, error: (e as Error).message };
      }
    },
  },
  {
    name: "password_strength",
    description:
      "Analyze password strength and provide detailed feedback. Checks length, character variety, common patterns, and entropy. Returns score 0-100 and recommendations. Keywords: password strength, check password, password security, password score, entropy.",
    category: "security",
    inputSchema: {
      type: "object",
      properties: {
        password: { type: "string", description: "Password to analyze" },
      },
      required: ["password"],
    },
    handler: ({ password }) => {
      const pwd = password as string;
      const checks = {
        length: pwd.length,
        hasLowercase: /[a-z]/.test(pwd),
        hasUppercase: /[A-Z]/.test(pwd),
        hasDigits: /\d/.test(pwd),
        hasSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd),
        hasSpaces: /\s/.test(pwd),
        hasRepeating: /(.)\1{2,}/.test(pwd),
        hasSequential: /(abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz|012|123|234|345|456|567|678|789)/i.test(pwd),
      };

      // Common weak passwords
      const commonPasswords = [
        "password", "123456", "12345678", "qwerty", "abc123",
        "monkey", "1234567", "letmein", "trustno1", "dragon",
        "baseball", "iloveyou", "master", "sunshine", "ashley",
        "password1", "Password1", "password123",
      ];
      const isCommon = commonPasswords.includes(pwd.toLowerCase());

      // Calculate entropy (bits)
      let charsetSize = 0;
      if (checks.hasLowercase) charsetSize += 26;
      if (checks.hasUppercase) charsetSize += 26;
      if (checks.hasDigits) charsetSize += 10;
      if (checks.hasSpecial) charsetSize += 32;
      if (checks.hasSpaces) charsetSize += 1;

      const entropy = charsetSize > 0 ? pwd.length * Math.log2(charsetSize) : 0;

      // Calculate score (0-100)
      let score = 0;

      // Length scoring
      if (pwd.length >= 8) score += 20;
      if (pwd.length >= 12) score += 10;
      if (pwd.length >= 16) score += 10;

      // Character variety scoring
      if (checks.hasLowercase) score += 10;
      if (checks.hasUppercase) score += 10;
      if (checks.hasDigits) score += 10;
      if (checks.hasSpecial) score += 15;

      // Penalties
      if (checks.hasRepeating) score -= 10;
      if (checks.hasSequential) score -= 10;
      if (isCommon) score -= 30;
      if (pwd.length < 8) score -= 20;

      // Entropy bonus
      if (entropy > 60) score += 15;
      else if (entropy > 40) score += 10;

      score = Math.max(0, Math.min(100, score));

      // Strength rating
      let rating: string;
      if (score >= 80) rating = "Very Strong";
      else if (score >= 60) rating = "Strong";
      else if (score >= 40) rating = "Moderate";
      else if (score >= 20) rating = "Weak";
      else rating = "Very Weak";

      // Recommendations
      const recommendations: string[] = [];
      if (pwd.length < 12) recommendations.push("Use at least 12 characters");
      if (!checks.hasUppercase) recommendations.push("Add uppercase letters");
      if (!checks.hasLowercase) recommendations.push("Add lowercase letters");
      if (!checks.hasDigits) recommendations.push("Add numbers");
      if (!checks.hasSpecial) recommendations.push("Add special characters (!@#$%...)");
      if (checks.hasRepeating) recommendations.push("Avoid repeating characters");
      if (checks.hasSequential) recommendations.push("Avoid sequential characters");
      if (isCommon) recommendations.push("Avoid common passwords");

      return {
        score,
        rating,
        entropy: Math.round(entropy * 100) / 100,
        checks,
        isCommon,
        recommendations,
        crackTime: estimateCrackTime(entropy),
      };
    },
  },
  {
    name: "hash_checksum",
    description:
      "Calculate various checksums and hashes using Deno native crypto. Supports SHA-1, SHA-256, SHA-384, SHA-512, and MD5. Use for file integrity, data verification. Keywords: checksum, hash, SHA256, MD5, file hash, integrity check.",
    category: "security",
    inputSchema: {
      type: "object",
      properties: {
        data: { type: "string", description: "Data to hash" },
        algorithm: {
          type: "string",
          enum: ["SHA-1", "SHA-256", "SHA-384", "SHA-512", "MD5"],
          description: "Hash algorithm (default: SHA-256)",
        },
        encoding: {
          type: "string",
          enum: ["hex", "base64"],
          description: "Output encoding (default: hex)",
        },
      },
      required: ["data"],
    },
    handler: async ({ data, algorithm = "SHA-256", encoding = "hex" }) => {
      const encoder = new TextEncoder();
      const dataBytes = encoder.encode(data as string);

      // MD5 not in subtle crypto, implement manually
      if (algorithm === "MD5") {
        const hash = await md5(dataBytes);
        const output = encoding === "base64"
          ? btoa(String.fromCharCode(...hash))
          : Array.from(hash).map(b => b.toString(16).padStart(2, "0")).join("");
        return { algorithm, hash: output, encoding };
      }

      const hashBuffer = await crypto.subtle.digest(algorithm as string, dataBytes);
      const hashArray = new Uint8Array(hashBuffer);

      let hash: string;
      if (encoding === "base64") {
        hash = btoa(String.fromCharCode(...hashArray));
      } else {
        hash = Array.from(hashArray)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      }

      return { algorithm, hash, encoding, length: hashArray.length * 8 };
    },
  },
  {
    name: "crc32",
    description:
      "Calculate CRC32 checksum of data. Common checksum for file integrity and data validation. Returns 32-bit checksum. Keywords: CRC32, checksum, file integrity, data checksum, error detection.",
    category: "security",
    inputSchema: {
      type: "object",
      properties: {
        data: { type: "string", description: "Data to checksum" },
        format: {
          type: "string",
          enum: ["hex", "decimal"],
          description: "Output format (default: hex)",
        },
      },
      required: ["data"],
    },
    handler: ({ data, format = "hex" }) => {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(data as string);

      // CRC32 lookup table
      const table = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
          c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[i] = c;
      }

      let crc = 0xffffffff;
      for (const byte of bytes) {
        crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
      }
      crc = (crc ^ 0xffffffff) >>> 0;

      return {
        crc32: format === "hex" ? crc.toString(16).padStart(8, "0") : crc,
        format,
      };
    },
  },
  {
    name: "random_bytes",
    description:
      "Generate cryptographically secure random bytes using Deno native crypto. Output as hex, base64, or array. Use for tokens, keys, nonces. Keywords: random bytes, secure random, crypto random, generate token, random key.",
    category: "security",
    inputSchema: {
      type: "object",
      properties: {
        length: { type: "number", description: "Number of bytes (default: 32)" },
        encoding: {
          type: "string",
          enum: ["hex", "base64", "array"],
          description: "Output encoding (default: hex)",
        },
      },
    },
    handler: ({ length = 32, encoding = "hex" }) => {
      const bytes = new Uint8Array(length as number);
      crypto.getRandomValues(bytes);

      let output: string | number[];
      if (encoding === "base64") {
        output = btoa(String.fromCharCode(...bytes));
      } else if (encoding === "array") {
        output = Array.from(bytes);
      } else {
        output = Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      }

      return { bytes: output, length, encoding };
    },
  },
];

// Helper: Estimate crack time based on entropy
function estimateCrackTime(entropy: number): string {
  // Assume 10 billion guesses per second (high-end attack)
  const guessesPerSecond = 10_000_000_000;
  const totalGuesses = Math.pow(2, entropy);
  const seconds = totalGuesses / guessesPerSecond / 2; // Average case

  if (seconds < 1) return "Instant";
  if (seconds < 60) return `${Math.round(seconds)} seconds`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hours`;
  if (seconds < 31536000) return `${Math.round(seconds / 86400)} days`;
  if (seconds < 31536000 * 100) return `${Math.round(seconds / 31536000)} years`;
  if (seconds < 31536000 * 1000000) return `${Math.round(seconds / 31536000 / 1000)} thousand years`;
  return "Millions of years+";
}

// Simple MD5 implementation (for legacy compatibility)
async function md5(data: Uint8Array): Promise<Uint8Array> {
  // MD5 constants
  const K = new Uint32Array([
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a,
    0xa8304613, 0xfd469501, 0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
    0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821, 0xf61e2562, 0xc040b340,
    0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8,
    0x676f02d9, 0x8d2a4c8a, 0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
    0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70, 0x289b7ec6, 0xeaa127fa,
    0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92,
    0xffeff47d, 0x85845dd1, 0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
    0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
  ]);

  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];

  // Padding
  const msgLen = data.length;
  const bitLen = msgLen * 8;
  const padLen = ((msgLen + 8) % 64 === 0) ? 64 : 64 - ((msgLen + 8) % 64);
  const paddedLen = msgLen + padLen + 8;
  const padded = new Uint8Array(paddedLen);
  padded.set(data);
  padded[msgLen] = 0x80;
  // Length in bits as 64-bit little-endian
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, bitLen >>> 0, true);
  view.setUint32(paddedLen - 4, Math.floor(bitLen / 0x100000000), true);

  // Initialize
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  // Process blocks
  for (let i = 0; i < paddedLen; i += 64) {
    const M = new Uint32Array(16);
    for (let j = 0; j < 16; j++) {
      M[j] = view.getUint32(i + j * 4, true);
    }

    let A = a0, B = b0, C = c0, D = d0;

    for (let j = 0; j < 64; j++) {
      let F: number, g: number;
      if (j < 16) {
        F = (B & C) | (~B & D);
        g = j;
      } else if (j < 32) {
        F = (D & B) | (~D & C);
        g = (5 * j + 1) % 16;
      } else if (j < 48) {
        F = B ^ C ^ D;
        g = (3 * j + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * j) % 16;
      }
      F = (F + A + K[j] + M[g]) >>> 0;
      A = D;
      D = C;
      C = B;
      B = (B + ((F << S[j]) | (F >>> (32 - S[j])))) >>> 0;
    }

    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  // Output
  const result = new Uint8Array(16);
  const resultView = new DataView(result.buffer);
  resultView.setUint32(0, a0, true);
  resultView.setUint32(4, b0, true);
  resultView.setUint32(8, c0, true);
  resultView.setUint32(12, d0, true);

  return result;
}
