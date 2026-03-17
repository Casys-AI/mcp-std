/**
 * Encoding and cipher tools
 *
 * Pure Deno implementations - no external dependencies.
 * Uses native TextEncoder/TextDecoder and crypto.subtle.
 *
 * @module lib/std/encoding
 */

import type { MiniTool } from "./types.ts";

// Morse code mapping
const MORSE_CODE: Record<string, string> = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.",
  G: "--.", H: "....", I: "..", J: ".---", K: "-.-", L: ".-..",
  M: "--", N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.",
  S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-",
  Y: "-.--", Z: "--..",
  "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-",
  "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
  ".": ".-.-.-", ",": "--..--", "?": "..--..", "'": ".----.",
  "!": "-.-.--", "/": "-..-.", "(": "-.--.", ")": "-.--.-",
  "&": ".-...", ":": "---...", ";": "-.-.-.", "=": "-...-",
  "+": ".-.-.", "-": "-....-", "_": "..--.-", '"': ".-..-.",
  "$": "...-..-", "@": ".--.-.", " ": "/",
};

const MORSE_REVERSE: Record<string, string> = Object.fromEntries(
  Object.entries(MORSE_CODE).map(([k, v]) => [v, k])
);

// NATO phonetic alphabet
const NATO_ALPHABET: Record<string, string> = {
  A: "Alpha", B: "Bravo", C: "Charlie", D: "Delta", E: "Echo",
  F: "Foxtrot", G: "Golf", H: "Hotel", I: "India", J: "Juliet",
  K: "Kilo", L: "Lima", M: "Mike", N: "November", O: "Oscar",
  P: "Papa", Q: "Quebec", R: "Romeo", S: "Sierra", T: "Tango",
  U: "Uniform", V: "Victor", W: "Whiskey", X: "X-ray", Y: "Yankee",
  Z: "Zulu",
  "0": "Zero", "1": "One", "2": "Two", "3": "Three", "4": "Four",
  "5": "Five", "6": "Six", "7": "Seven", "8": "Eight", "9": "Nine",
};

export const encodingTools: MiniTool[] = [
  {
    name: "encode_rot13",
    description:
      "Apply ROT13 cipher (rotate letters by 13 positions). Self-reversing: encode and decode use the same operation. Classic simple cipher for obfuscating text. Keywords: ROT13, Caesar cipher, rotate letters, simple cipher, obfuscate text.",
    category: "encoding",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to encode/decode" },
      },
      required: ["text"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/json-viewer",
        emits: ["copy"],
        accepts: [],
      },
    },
    handler: ({ text }) => {
      const result = (text as string).replace(/[a-zA-Z]/g, (char) => {
        const code = char.charCodeAt(0);
        const base = code >= 97 ? 97 : 65; // lowercase or uppercase
        return String.fromCharCode(((code - base + 13) % 26) + base);
      });
      return { original: text, encoded: result };
    },
  },
  {
    name: "encode_caesar",
    description:
      "Apply Caesar cipher with custom shift value. Shift letters by N positions in the alphabet. Use negative shift to decode. Classic substitution cipher. Keywords: Caesar cipher, shift cipher, letter rotation, encrypt text, substitution.",
    category: "encoding",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to encode" },
        shift: { type: "number", description: "Shift amount (1-25, negative to decode)" },
      },
      required: ["text", "shift"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/json-viewer",
        emits: ["copy"],
        accepts: [],
      },
    },
    handler: ({ text, shift }) => {
      const s = ((shift as number) % 26 + 26) % 26; // Normalize to 0-25
      const result = (text as string).replace(/[a-zA-Z]/g, (char) => {
        const code = char.charCodeAt(0);
        const base = code >= 97 ? 97 : 65;
        return String.fromCharCode(((code - base + s) % 26) + base);
      });
      return { original: text, shift: s, encoded: result };
    },
  },
  {
    name: "encode_morse",
    description:
      "Convert text to Morse code or decode Morse code to text. Uses international Morse code standard. Words separated by ' / ', letters by spaces. Keywords: Morse code, encode morse, decode morse, dots dashes, telegraph.",
    category: "encoding",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text or Morse code" },
        action: {
          type: "string",
          enum: ["encode", "decode"],
          description: "Action (default: encode)",
        },
      },
      required: ["text"],
    },
    handler: ({ text, action = "encode" }) => {
      const input = text as string;

      if (action === "decode") {
        // Decode Morse to text
        const words = input.split(" / ");
        const decoded = words
          .map((word) =>
            word
              .split(" ")
              .map((code) => MORSE_REVERSE[code] || "?")
              .join("")
          )
          .join(" ");
        return { morse: input, text: decoded };
      }

      // Encode text to Morse
      const morse = input
        .toUpperCase()
        .split("")
        .map((char) => MORSE_CODE[char] || char)
        .join(" ")
        .replace(/  +/g, " / "); // Replace multiple spaces with word separator

      return { text: input, morse };
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/json-viewer",
        emits: ["copy"],
        accepts: [],
      },
    },
  },
  {
    name: "encode_nato",
    description:
      "Convert text to NATO phonetic alphabet or decode back. Spell out letters using standard NATO/ICAO alphabet (Alpha, Bravo, Charlie...). Use for clear communication. Keywords: NATO phonetic, spell out, Alpha Bravo, ICAO alphabet, radio alphabet.",
    category: "encoding",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to convert" },
        action: {
          type: "string",
          enum: ["encode", "decode"],
          description: "Action (default: encode)",
        },
        separator: { type: "string", description: "Word separator (default: space)" },
      },
      required: ["text"],
    },
    handler: ({ text, action = "encode", separator = " " }) => {
      const input = text as string;
      const sep = separator as string;

      if (action === "decode") {
        // Decode NATO to text
        const natoReverse: Record<string, string> = {};
        for (const [char, word] of Object.entries(NATO_ALPHABET)) {
          natoReverse[word.toLowerCase()] = char;
        }
        const decoded = input
          .toLowerCase()
          .split(/[\s-]+/)
          .map((word) => natoReverse[word] || "")
          .join("");
        return { nato: input, text: decoded };
      }

      // Encode text to NATO
      const nato = input
        .toUpperCase()
        .split("")
        .map((char) => {
          if (char === " ") return "-";
          return NATO_ALPHABET[char] || char;
        })
        .join(sep);

      return { text: input, nato };
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/table-viewer",
        emits: ["copy"],
        accepts: [],
      },
    },
  },
  {
    name: "encode_binary",
    description:
      "Convert text to binary representation or decode binary to text. Each character becomes 8-bit binary. Use for learning, debugging, or encoding. Keywords: binary encode, text to binary, binary decode, 8-bit, ASCII binary.",
    category: "encoding",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text or binary string" },
        action: {
          type: "string",
          enum: ["encode", "decode"],
          description: "Action (default: encode)",
        },
        separator: { type: "string", description: "Byte separator (default: space)" },
      },
      required: ["text"],
    },
    handler: ({ text, action = "encode", separator = " " }) => {
      const input = text as string;
      const sep = separator as string;

      if (action === "decode") {
        // Decode binary to text
        const bytes = input.split(/[\s]+/).filter(Boolean);
        const decoded = bytes.map((b) => String.fromCharCode(parseInt(b, 2))).join("");
        return { binary: input, text: decoded };
      }

      // Encode text to binary
      const binary = Array.from(input)
        .map((char) => char.charCodeAt(0).toString(2).padStart(8, "0"))
        .join(sep);

      return { text: input, binary };
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/json-viewer",
        emits: ["copy"],
        accepts: [],
      },
    },
  },
  {
    name: "encode_hex",
    description:
      "Convert text to hexadecimal encoding or decode hex to text. Each byte becomes two hex digits. Common for debugging and data representation. Keywords: hex encode, hexadecimal, text to hex, hex decode, byte encoding.",
    category: "encoding",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text or hex string" },
        action: {
          type: "string",
          enum: ["encode", "decode"],
          description: "Action (default: encode)",
        },
        separator: { type: "string", description: "Byte separator (default: none)" },
        uppercase: { type: "boolean", description: "Uppercase hex (default: false)" },
      },
      required: ["text"],
    },
    handler: ({ text, action = "encode", separator = "", uppercase = false }) => {
      const input = text as string;
      const sep = separator as string;

      if (action === "decode") {
        // Decode hex to text - remove any separators first
        const cleanHex = input.replace(/[\s:-]/g, "");
        const bytes: number[] = [];
        for (let i = 0; i < cleanHex.length; i += 2) {
          bytes.push(parseInt(cleanHex.substr(i, 2), 16));
        }
        const decoded = new TextDecoder().decode(new Uint8Array(bytes));
        return { hex: input, text: decoded };
      }

      // Encode text to hex
      const encoder = new TextEncoder();
      const bytes = encoder.encode(input);
      let hex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(sep);

      if (uppercase) hex = hex.toUpperCase();

      return { text: input, hex };
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/json-viewer",
        emits: ["copy"],
        accepts: [],
      },
    },
  },
  {
    name: "encode_punycode",
    description:
      "Convert Unicode domain names to Punycode (IDN) or decode back. Handle internationalized domain names with non-ASCII characters. Keywords: Punycode, IDN, internationalized domain, Unicode domain, xn-- prefix.",
    category: "encoding",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Domain or Punycode" },
        action: {
          type: "string",
          enum: ["encode", "decode"],
          description: "Action (default: encode)",
        },
      },
      required: ["text"],
    },
    handler: ({ text, action = "encode" }) => {
      const input = text as string;

      try {
        if (action === "decode") {
          // Decode Punycode to Unicode
          const url = new URL(`http://${input}`);
          return { punycode: input, unicode: url.hostname };
        }

        // Encode Unicode to Punycode using URL API
        const url = new URL(`http://${input}`);
        // The URL API normalizes the hostname to punycode internally
        const ascii = url.hostname;

        return {
          unicode: input,
          punycode: ascii,
          isAscii: ascii === input.toLowerCase(),
        };
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/json-viewer",
        emits: ["copy"],
        accepts: [],
      },
    },
  },
  {
    name: "encode_base32",
    description:
      "Encode text to Base32 or decode Base32 to text. Uses RFC 4648 standard alphabet. Often used in TOTP secrets and file checksums. Keywords: Base32, encode base32, decode base32, RFC 4648, TOTP secret.",
    category: "encoding",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text or Base32 string" },
        action: {
          type: "string",
          enum: ["encode", "decode"],
          description: "Action (default: encode)",
        },
      },
      required: ["text"],
    },
    handler: ({ text, action = "encode" }) => {
      const input = text as string;
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

      if (action === "decode") {
        // Decode Base32
        const cleanInput = input.toUpperCase().replace(/=+$/, "");
        const bits: number[] = [];

        for (const char of cleanInput) {
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

        const decoded = new TextDecoder().decode(new Uint8Array(bytes));
        return { base32: input, text: decoded };
      }

      // Encode to Base32
      const encoder = new TextEncoder();
      const bytes = encoder.encode(input);
      const bits: number[] = [];

      for (const byte of bytes) {
        for (let i = 7; i >= 0; i--) {
          bits.push((byte >> i) & 1);
        }
      }

      // Pad bits to multiple of 5
      while (bits.length % 5 !== 0) {
        bits.push(0);
      }

      let base32 = "";
      for (let i = 0; i < bits.length; i += 5) {
        let val = 0;
        for (let j = 0; j < 5; j++) {
          val = (val << 1) | bits[i + j];
        }
        base32 += alphabet[val];
      }

      // Add padding
      while (base32.length % 8 !== 0) {
        base32 += "=";
      }

      return { text: input, base32 };
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/json-viewer",
        emits: ["copy"],
        accepts: [],
      },
    },
  },
  {
    name: "encode_url",
    description:
      "URL encode or decode text. Handle special characters for safe URL inclusion. Supports full URL or component encoding. Keywords: URL encode, percent encoding, urlencode, decode URL, escape URL.",
    category: "encoding",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to encode/decode" },
        action: {
          type: "string",
          enum: ["encode", "decode"],
          description: "Action (default: encode)",
        },
        mode: {
          type: "string",
          enum: ["component", "full", "path"],
          description: "Encoding mode (default: component)",
        },
      },
      required: ["text"],
    },
    handler: ({ text, action = "encode", mode = "component" }) => {
      const input = text as string;

      if (action === "decode") {
        try {
          const decoded = decodeURIComponent(input);
          return { encoded: input, decoded };
        } catch {
          return { error: "Invalid URL encoding" };
        }
      }

      let encoded: string;
      switch (mode) {
        case "full":
          encoded = encodeURI(input);
          break;
        case "path":
          // Encode but preserve slashes
          encoded = encodeURIComponent(input).replace(/%2F/g, "/");
          break;
        default:
          encoded = encodeURIComponent(input);
      }

      return { original: input, encoded, mode };
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/json-viewer",
        emits: ["copy"],
        accepts: [],
      },
    },
  },
  {
    name: "encode_html_entities",
    description:
      "Encode text to HTML entities or decode HTML entities to text. Handle all named and numeric entities. Essential for HTML safety. Keywords: HTML entities, encode HTML, decode entities, HTML escape, XSS prevention.",
    category: "encoding",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to encode/decode" },
        action: {
          type: "string",
          enum: ["encode", "decode"],
          description: "Action (default: encode)",
        },
        mode: {
          type: "string",
          enum: ["basic", "full", "numeric"],
          description: "Encoding mode: basic (<>&\"'), full (all non-ASCII), numeric (&#NNN;)",
        },
      },
      required: ["text"],
    },
    handler: ({ text, action = "encode", mode = "basic" }) => {
      const input = text as string;

      // Named entities
      const entities: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
        "©": "&copy;",
        "®": "&reg;",
        "™": "&trade;",
        "€": "&euro;",
        "£": "&pound;",
        "¥": "&yen;",
        "¢": "&cent;",
        "§": "&sect;",
        "°": "&deg;",
        "±": "&plusmn;",
        "×": "&times;",
        "÷": "&divide;",
        "—": "&mdash;",
        "–": "&ndash;",
        "…": "&hellip;",
        " ": "&nbsp;",
      };

      if (action === "decode") {
        let decoded = input;
        // Decode named entities
        for (const [char, entity] of Object.entries(entities)) {
          decoded = decoded.replaceAll(entity, char);
        }
        // Decode numeric entities &#NNN; and &#xHHH;
        decoded = decoded.replace(/&#(\d+);/g, (_, num) =>
          String.fromCharCode(parseInt(num, 10))
        );
        decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
          String.fromCharCode(parseInt(hex, 16))
        );
        return { encoded: input, decoded };
      }

      let encoded = input;
      if (mode === "numeric") {
        // Encode all non-ASCII as numeric
        encoded = Array.from(input)
          .map((char) => {
            const code = char.charCodeAt(0);
            if (code > 127 || "&<>\"'".includes(char)) {
              return `&#${code};`;
            }
            return char;
          })
          .join("");
      } else if (mode === "full") {
        // Encode using named entities where possible, numeric for rest
        encoded = Array.from(input)
          .map((char) => {
            if (entities[char]) return entities[char];
            const code = char.charCodeAt(0);
            if (code > 127) return `&#${code};`;
            return char;
          })
          .join("");
      } else {
        // Basic mode - only essential characters
        encoded = input
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      return { original: input, encoded, mode };
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/json-viewer",
        emits: ["copy"],
        accepts: [],
      },
    },
  },
  {
    name: "base64_image_preview",
    description:
      "Decode and analyze a base64-encoded image. Detects MIME type from magic bytes (PNG, JPEG, GIF, WebP), validates the image, extracts dimensions, and returns a data URI for display. Keywords: base64 image, decode image, image preview, image metadata, base64 decode, image analyze.",
    category: "encoding",
    inputSchema: {
      type: "object",
      properties: {
        data: {
          type: "string",
          description: "Base64 string (with or without data URI prefix like 'data:image/png;base64,')",
        },
      },
      required: ["data"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/image-preview",
        emits: ["download", "zoom"],
        accepts: [],
      },
    },
    handler: ({ data }) => {
      const input = data as string;

      try {
        // Strip data URI prefix if present
        let base64Data = input;
        let declaredMimeType: string | null = null;

        const dataUriMatch = input.match(/^data:([^;]+);base64,(.+)$/);
        if (dataUriMatch) {
          declaredMimeType = dataUriMatch[1];
          base64Data = dataUriMatch[2];
        }

        // Decode base64 to binary
        let binaryData: Uint8Array;
        try {
          // Use atob in browser/Deno
          const binaryString = atob(base64Data);
          binaryData = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            binaryData[i] = binaryString.charCodeAt(i);
          }
        } catch {
          return {
            valid: false,
            mimeType: "",
            size: 0,
            dataUri: "",
            error: "Invalid base64 encoding",
          };
        }

        // Detect MIME type from magic bytes
        const detectedMimeType = detectImageMimeType(binaryData);
        if (!detectedMimeType) {
          return {
            valid: false,
            mimeType: declaredMimeType || "unknown",
            size: binaryData.length,
            dataUri: "",
            error: "Not a recognized image format (PNG, JPEG, GIF, WebP)",
          };
        }

        // Use detected MIME type (more reliable than declared)
        const mimeType = detectedMimeType;

        // Try to extract dimensions
        const dimensions = extractImageDimensions(binaryData, mimeType);

        // Build data URI for display
        const dataUri = `data:${mimeType};base64,${base64Data}`;

        return {
          valid: true,
          mimeType,
          ...(dimensions.width ? { width: dimensions.width } : {}),
          ...(dimensions.height ? { height: dimensions.height } : {}),
          size: binaryData.length,
          dataUri,
        };
      } catch (e) {
        return {
          valid: false,
          mimeType: "",
          size: 0,
          dataUri: "",
          error: (e as Error).message,
        };
      }
    },
  },
];

/**
 * Detect image MIME type from magic bytes
 */
function detectImageMimeType(data: Uint8Array): string | null {
  if (data.length < 4) return null;

  // PNG: \x89PNG (89 50 4E 47)
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47) {
    return "image/png";
  }

  // JPEG: \xFF\xD8\xFF
  if (data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF) {
    return "image/jpeg";
  }

  // GIF: GIF89a or GIF87a
  if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46 &&
      data[3] === 0x38 && (data[4] === 0x39 || data[4] === 0x37) && data[5] === 0x61) {
    return "image/gif";
  }

  // WebP: RIFF....WEBP
  if (data.length >= 12 &&
      data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 &&
      data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) {
    return "image/webp";
  }

  return null;
}

/**
 * Extract image dimensions from binary data
 */
function extractImageDimensions(data: Uint8Array, mimeType: string): { width?: number; height?: number } {
  try {
    if (mimeType === "image/png" && data.length >= 24) {
      // PNG: IHDR chunk at offset 16, width at 16-19, height at 20-23 (big-endian)
      const width = (data[16] << 24) | (data[17] << 16) | (data[18] << 8) | data[19];
      const height = (data[20] << 24) | (data[21] << 16) | (data[22] << 8) | data[23];
      return { width, height };
    }

    if (mimeType === "image/jpeg") {
      // JPEG: Find SOF0/SOF2 marker (FF C0 or FF C2), dimensions follow
      for (let i = 0; i < data.length - 9; i++) {
        if (data[i] === 0xFF && (data[i + 1] === 0xC0 || data[i + 1] === 0xC2)) {
          const height = (data[i + 5] << 8) | data[i + 6];
          const width = (data[i + 7] << 8) | data[i + 8];
          return { width, height };
        }
      }
    }

    if (mimeType === "image/gif" && data.length >= 10) {
      // GIF: Width at 6-7, height at 8-9 (little-endian)
      const width = data[6] | (data[7] << 8);
      const height = data[8] | (data[9] << 8);
      return { width, height };
    }

    if (mimeType === "image/webp" && data.length >= 30) {
      // WebP VP8: dimensions at different offsets depending on format
      // Simple approach: look for VP8 chunk
      for (let i = 12; i < data.length - 10; i++) {
        if (data[i] === 0x56 && data[i + 1] === 0x50 && data[i + 2] === 0x38) {
          // VP8 (lossy) - at offset +10 from VP8, width and height are 14-bit values
          if (data[i + 3] === 0x20 && data.length > i + 14) {
            // VP8 bitstream
            const w = ((data[i + 10] | (data[i + 11] << 8)) & 0x3FFF);
            const h = ((data[i + 12] | (data[i + 13] << 8)) & 0x3FFF);
            if (w > 0 && h > 0) return { width: w, height: h };
          }
          // VP8L (lossless) - signature 0x2F, then width-1 and height-1
          if (data[i + 3] === 0x4C && data.length > i + 9) {
            const b0 = data[i + 5];
            const b1 = data[i + 6];
            const b2 = data[i + 7];
            const b3 = data[i + 8];
            const width = 1 + ((b1 & 0x3F) << 8 | b0);
            const height = 1 + ((b3 & 0xF) << 10 | b2 << 2 | (b1 >> 6));
            if (width > 0 && height > 0) return { width, height };
          }
        }
      }
    }
  } catch {
    // Ignore dimension extraction errors
  }

  return {};
}
