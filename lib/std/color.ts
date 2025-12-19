/**
 * Color manipulation tools
 *
 * Inspired by:
 * - IT-Tools MCP: https://github.com/wrenchpilot/it-tools-mcp
 *
 * @module lib/std/color
 */

import type { MiniTool } from "./types.ts";

export const colorTools: MiniTool[] = [
  {
    name: "color_hex_to_rgb",
    description: "Convert hex color code to RGB values",
    category: "color",
    inputSchema: {
      type: "object",
      properties: {
        hex: { type: "string", description: "Hex color (e.g., '#ff5733' or 'ff5733')" },
      },
      required: ["hex"],
    },
    handler: ({ hex }) => {
      let h = (hex as string).replace(/^#/, "");
      // Handle shorthand (e.g., "f00" -> "ff0000")
      if (h.length === 3) {
        h = h.split("").map((c) => c + c).join("");
      }
      if (!/^[0-9A-Fa-f]{6}$/.test(h)) {
        throw new Error(`Invalid hex color: ${hex}`);
      }
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
        css: `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`,
      };
    },
  },
  {
    name: "color_rgb_to_hex",
    description: "Convert RGB values to hex color code",
    category: "color",
    inputSchema: {
      type: "object",
      properties: {
        r: { type: "number", description: "Red (0-255)" },
        g: { type: "number", description: "Green (0-255)" },
        b: { type: "number", description: "Blue (0-255)" },
      },
      required: ["r", "g", "b"],
    },
    handler: ({ r, g, b }) => {
      const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
      const toHex = (n: number) => clamp(n).toString(16).padStart(2, "0");
      const hex = `#${toHex(r as number)}${toHex(g as number)}${toHex(b as number)}`;
      return { hex, hexUpper: hex.toUpperCase() };
    },
  },
  {
    name: "color_rgb_to_hsl",
    description: "Convert RGB values to HSL (Hue, Saturation, Lightness)",
    category: "color",
    inputSchema: {
      type: "object",
      properties: {
        r: { type: "number", description: "Red (0-255)" },
        g: { type: "number", description: "Green (0-255)" },
        b: { type: "number", description: "Blue (0-255)" },
      },
      required: ["r", "g", "b"],
    },
    handler: ({ r, g, b }) => {
      const rNorm = (r as number) / 255;
      const gNorm = (g as number) / 255;
      const bNorm = (b as number) / 255;

      const max = Math.max(rNorm, gNorm, bNorm);
      const min = Math.min(rNorm, gNorm, bNorm);
      const l = (max + min) / 2;
      let h = 0, s = 0;

      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case rNorm:
            h = ((gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0)) / 6;
            break;
          case gNorm:
            h = ((bNorm - rNorm) / d + 2) / 6;
            break;
          case bNorm:
            h = ((rNorm - gNorm) / d + 4) / 6;
            break;
        }
      }

      return {
        h: Math.round(h * 360),
        s: Math.round(s * 100),
        l: Math.round(l * 100),
        css: `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`,
      };
    },
  },
  {
    name: "color_hsl_to_rgb",
    description: "Convert HSL values to RGB",
    category: "color",
    inputSchema: {
      type: "object",
      properties: {
        h: { type: "number", description: "Hue (0-360)" },
        s: { type: "number", description: "Saturation (0-100)" },
        l: { type: "number", description: "Lightness (0-100)" },
      },
      required: ["h", "s", "l"],
    },
    handler: ({ h, s, l }) => {
      const hNorm = (h as number) / 360;
      const sNorm = (s as number) / 100;
      const lNorm = (l as number) / 100;

      let r, g, b;
      if (sNorm === 0) {
        r = g = b = lNorm;
      } else {
        const hue2rgb = (p: number, q: number, t: number) => {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1 / 6) return p + (q - p) * 6 * t;
          if (t < 1 / 2) return q;
          if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
          return p;
        };
        const q = lNorm < 0.5 ? lNorm * (1 + sNorm) : lNorm + sNorm - lNorm * sNorm;
        const p = 2 * lNorm - q;
        r = hue2rgb(p, q, hNorm + 1 / 3);
        g = hue2rgb(p, q, hNorm);
        b = hue2rgb(p, q, hNorm - 1 / 3);
      }

      return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255),
        css: `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`,
      };
    },
  },
];
