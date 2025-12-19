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
  {
    name: "color_palette",
    description: "Generate color palettes (complementary, triadic, analogous, split-complementary, tetradic)",
    category: "color",
    inputSchema: {
      type: "object",
      properties: {
        color: { type: "string", description: "Base color in hex (e.g., '#ff5733')" },
        type: {
          type: "string",
          enum: ["complementary", "triadic", "analogous", "split", "tetradic", "monochromatic"],
          description: "Palette type (default: complementary)",
        },
        count: { type: "number", description: "Number of colors for analogous/monochromatic (default: 5)" },
      },
      required: ["color"],
    },
    handler: ({ color, type = "complementary", count = 5 }) => {
      // Parse hex to HSL
      let hex = (color as string).replace(/^#/, "");
      if (hex.length === 3) {
        hex = hex.split("").map((c) => c + c).join("");
      }
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0;
      const l = (max + min) / 2;
      let s = 0;

      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
          case g: h = ((b - r) / d + 2) / 6; break;
          case b: h = ((r - g) / d + 4) / 6; break;
        }
      }

      // HSL to Hex helper
      const hslToHex = (h: number, s: number, l: number): string => {
        h = ((h % 1) + 1) % 1; // Normalize hue
        let r, g, b;
        if (s === 0) {
          r = g = b = l;
        } else {
          const hue2rgb = (p: number, q: number, t: number) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
          };
          const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
          const p = 2 * l - q;
          r = hue2rgb(p, q, h + 1/3);
          g = hue2rgb(p, q, h);
          b = hue2rgb(p, q, h - 1/3);
        }
        const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0");
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
      };

      const baseHex = hslToHex(h, s, l);
      let palette: string[] = [];

      switch (type) {
        case "complementary":
          palette = [baseHex, hslToHex(h + 0.5, s, l)];
          break;

        case "triadic":
          palette = [baseHex, hslToHex(h + 1/3, s, l), hslToHex(h + 2/3, s, l)];
          break;

        case "analogous":
          const step = 0.083; // ~30 degrees
          for (let i = 0; i < (count as number); i++) {
            const offset = (i - Math.floor((count as number) / 2)) * step;
            palette.push(hslToHex(h + offset, s, l));
          }
          break;

        case "split":
          palette = [baseHex, hslToHex(h + 0.417, s, l), hslToHex(h + 0.583, s, l)];
          break;

        case "tetradic":
          palette = [baseHex, hslToHex(h + 0.25, s, l), hslToHex(h + 0.5, s, l), hslToHex(h + 0.75, s, l)];
          break;

        case "monochromatic":
          for (let i = 0; i < (count as number); i++) {
            const newL = 0.1 + (0.8 * i / ((count as number) - 1));
            palette.push(hslToHex(h, s, newL));
          }
          break;

        default:
          palette = [baseHex];
      }

      return {
        base: baseHex,
        type,
        palette,
        hsl: { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) },
      };
    },
  },
  {
    name: "color_blend",
    description: "Blend two colors together",
    category: "color",
    inputSchema: {
      type: "object",
      properties: {
        color1: { type: "string", description: "First color in hex" },
        color2: { type: "string", description: "Second color in hex" },
        ratio: { type: "number", description: "Blend ratio 0-1 (default: 0.5)" },
        steps: { type: "number", description: "Generate gradient steps (optional)" },
      },
      required: ["color1", "color2"],
    },
    handler: ({ color1, color2, ratio = 0.5, steps }) => {
      const parseHex = (hex: string) => {
        let h = hex.replace(/^#/, "");
        if (h.length === 3) h = h.split("").map((c) => c + c).join("");
        return {
          r: parseInt(h.slice(0, 2), 16),
          g: parseInt(h.slice(2, 4), 16),
          b: parseInt(h.slice(4, 6), 16),
        };
      };

      const toHex = (r: number, g: number, b: number) => {
        const h = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
        return `#${h(r)}${h(g)}${h(b)}`;
      };

      const c1 = parseHex(color1 as string);
      const c2 = parseHex(color2 as string);

      const blend = (r: number) => ({
        r: c1.r + (c2.r - c1.r) * r,
        g: c1.g + (c2.g - c1.g) * r,
        b: c1.b + (c2.b - c1.b) * r,
      });

      if (steps && (steps as number) > 2) {
        const gradient = [];
        for (let i = 0; i < (steps as number); i++) {
          const r = i / ((steps as number) - 1);
          const c = blend(r);
          gradient.push(toHex(c.r, c.g, c.b));
        }
        return { gradient, steps };
      }

      const blended = blend(ratio as number);
      return {
        color1,
        color2,
        ratio,
        result: toHex(blended.r, blended.g, blended.b),
      };
    },
  },
  {
    name: "color_contrast",
    description: "Calculate contrast ratio between two colors (WCAG)",
    category: "color",
    inputSchema: {
      type: "object",
      properties: {
        foreground: { type: "string", description: "Foreground color in hex" },
        background: { type: "string", description: "Background color in hex" },
      },
      required: ["foreground", "background"],
    },
    handler: ({ foreground, background }) => {
      const parseHex = (hex: string) => {
        let h = (hex as string).replace(/^#/, "");
        if (h.length === 3) h = h.split("").map((c) => c + c).join("");
        return {
          r: parseInt(h.slice(0, 2), 16) / 255,
          g: parseInt(h.slice(2, 4), 16) / 255,
          b: parseInt(h.slice(4, 6), 16) / 255,
        };
      };

      const luminance = (c: { r: number; g: number; b: number }) => {
        const adjust = (v: number) => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        return 0.2126 * adjust(c.r) + 0.7152 * adjust(c.g) + 0.0722 * adjust(c.b);
      };

      const fg = parseHex(foreground as string);
      const bg = parseHex(background as string);
      const l1 = luminance(fg);
      const l2 = luminance(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

      return {
        foreground,
        background,
        ratio: Math.round(ratio * 100) / 100,
        wcag: {
          aa: ratio >= 4.5,
          aaLarge: ratio >= 3,
          aaa: ratio >= 7,
          aaaLarge: ratio >= 4.5,
        },
        rating: ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA Large" : "Fail",
      };
    },
  },
];
