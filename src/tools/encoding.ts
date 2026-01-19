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
  },
];
