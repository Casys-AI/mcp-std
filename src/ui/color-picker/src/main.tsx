/**
 * Color Picker UI for MCP Apps
 *
 * Interactive color display with:
 * - Color swatch preview
 * - Multiple format display (HEX, RGB, HSL)
 * - Palette visualization
 * - Copy to clipboard
 * - Contrast checker
 *
 * @module lib/std/src/ui/color-picker
 */

import { render } from "preact";
import { useState, useEffect, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { cx } from "../../components/utils";
import { Code } from "../../components/ui/code";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface ColorData {
  // Single color
  hex?: string;
  rgb?: { r: number; g: number; b: number };
  hsl?: { h: number; s: number; l: number };

  // Palette
  palette?: string[];
  colors?: Array<{
    hex: string;
    name?: string;
    rgb?: { r: number; g: number; b: number };
  }>;

  // Contrast
  foreground?: string;
  background?: string;
  contrast?: number;
  wcagAA?: boolean;
  wcagAAA?: boolean;
}

interface ContentItem {
  type: string;
  text?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Color Picker", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Components
// ============================================================================

function ColorSwatch({
  color,
  size = "md",
  label,
  onClick,
}: {
  color: string;
  size?: "sm" | "md" | "lg";
  label?: string;
  onClick?: () => void;
}) {
  const sizes = {
    sm: "w-8 h-8",
    md: "w-16 h-16",
    lg: "w-24 h-24",
  };

  return (
    <div
      className={cx(
        "flex flex-col items-center gap-1",
        onClick && "cursor-pointer"
      )}
      onClick={onClick}
    >
      <div
        className={cx(
          sizes[size],
          "rounded-lg border-2 border-border-default shadow-sm transition-transform duration-150",
          onClick && "hover:scale-105"
        )}
        style={{ backgroundColor: color }}
        title={color}
      />
      {label && (
        <div className="text-xs text-fg-muted text-center">
          {label}
        </div>
      )}
    </div>
  );
}

function ColorFormats({ hex, rgb, hsl }: { hex?: string; rgb?: ColorData["rgb"]; hsl?: ColorData["hsl"] }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = useCallback((format: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(format);
    setTimeout(() => setCopied(null), 1500);
    notifyModel("copy", { format, value });
  }, []);

  const formats = [
    { name: "HEX", value: hex || "" },
    { name: "RGB", value: rgb ? `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` : "" },
    { name: "HSL", value: hsl ? `hsl(${Math.round(hsl.h)}, ${Math.round(hsl.s)}%, ${Math.round(hsl.l)}%)` : "" },
  ].filter((f) => f.value);

  return (
    <div className="flex flex-col gap-2">
      {formats.map((format) => (
        <div
          key={format.name}
          className="flex items-center gap-2 p-2 bg-bg-subtle rounded-md cursor-pointer hover:bg-bg-muted"
          onClick={() => copyToClipboard(format.name, format.value)}
        >
          <div className="w-10 text-xs font-medium text-fg-muted">
            {format.name}
          </div>
          <Code className="flex-1 text-sm">
            {format.value}
          </Code>
          <div className="text-xs text-fg-muted">
            {copied === format.name ? "Copied" : "Click to copy"}
          </div>
        </div>
      ))}
    </div>
  );
}

function ContrastChecker({
  foreground,
  background,
  contrast,
  wcagAA,
  wcagAAA,
}: {
  foreground: string;
  background: string;
  contrast?: number;
  wcagAA?: boolean;
  wcagAAA?: boolean;
}) {
  const ratio = contrast || calculateContrast(foreground, background);
  const passAA = wcagAA ?? ratio >= 4.5;
  const passAAA = wcagAAA ?? ratio >= 7;

  return (
    <div className="border border-border-default rounded-lg overflow-hidden">
      {/* Preview */}
      <div
        className="p-6 text-center"
        style={{ backgroundColor: background, color: foreground }}
      >
        <div className="text-lg font-semibold">Sample Text</div>
        <div className="text-sm">The quick brown fox jumps over the lazy dog</div>
      </div>

      {/* Results */}
      <div className="flex p-3 bg-bg-subtle justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="text-sm text-fg-muted">Contrast:</div>
          <div className="font-bold font-mono">{ratio.toFixed(2)}:1</div>
        </div>
        <div className="flex gap-2">
          <div
            className={cx(
              "px-2 py-0.5 rounded-full text-xs font-medium",
              passAA
                ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                : "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300"
            )}
          >
            AA {passAA ? "Pass" : "Fail"}
          </div>
          <div
            className={cx(
              "px-2 py-0.5 rounded-full text-xs font-medium",
              passAAA
                ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                : "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300"
            )}
          >
            AAA {passAAA ? "Pass" : "Fail"}
          </div>
        </div>
      </div>
    </div>
  );
}

function Palette({ colors }: { colors: Array<{ hex: string; name?: string }> }) {
  const handleColorClick = useCallback((color: { hex: string; name?: string }, index: number) => {
    navigator.clipboard.writeText(color.hex);
    notifyModel("select", { color: color.hex, name: color.name, index });
  }, []);

  return (
    <div className="flex flex-wrap gap-3">
      {colors.map((color, i) => (
        <ColorSwatch
          key={i}
          color={color.hex}
          size="md"
          label={color.name || color.hex}
          onClick={() => handleColorClick(color, i)}
        />
      ))}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function ColorPicker() {
  const [colorData, setColorData] = useState<ColorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Connect to MCP host
  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
      console.log("[color-picker] Connected to MCP host");
    }).catch(() => {
      console.log("[color-picker] No MCP host (standalone mode)");
    });

    app.ontoolresult = (result: { content?: ContentItem[] }) => {
      setLoading(false);
      setError(null);

      try {
        const textContent = result.content?.find((c) => c.type === "text") as ContentItem | undefined;
        if (!textContent?.text) {
          setColorData(null);
          return;
        }

        const data = JSON.parse(textContent.text) as ColorData;

        // Normalize palette format
        if (data.palette && !data.colors) {
          data.colors = data.palette.map((hex) => ({ hex }));
        }

        setColorData(data);
      } catch (e) {
        setError(`Failed to parse color data: ${e instanceof Error ? e.message : "Unknown"}`);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // Render
  if (loading) {
    return (
      <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas">
        <div className="p-10 text-center text-fg-muted">Loading colors...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas">
        <div className="p-4 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 rounded-md">
          {error}
        </div>
      </div>
    );
  }

  if (!colorData) {
    return (
      <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas">
        <div className="p-10 text-center text-fg-muted">No color data</div>
      </div>
    );
  }

  const hasMainColor = colorData.hex || colorData.rgb;
  const hasPalette = colorData.colors && colorData.colors.length > 0;
  const hasContrast = colorData.foreground && colorData.background;

  return (
    <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas">
      {/* Main color display */}
      {hasMainColor && (
        <div className="mb-6">
          <div className="text-sm font-semibold text-fg-muted mb-3 uppercase tracking-wide">
            Color
          </div>
          <div className="flex gap-4 items-start">
            <ColorSwatch
              color={colorData.hex || rgbToHex(colorData.rgb!)}
              size="lg"
            />
            <ColorFormats
              hex={colorData.hex}
              rgb={colorData.rgb}
              hsl={colorData.hsl}
            />
          </div>
        </div>
      )}

      {/* Palette */}
      {hasPalette && (
        <div className="mb-6">
          <div className="text-sm font-semibold text-fg-muted mb-3 uppercase tracking-wide">
            Palette ({colorData.colors!.length} colors)
          </div>
          <Palette colors={colorData.colors!} />
        </div>
      )}

      {/* Contrast checker */}
      {hasContrast && (
        <div>
          <div className="text-sm font-semibold text-fg-muted mb-3 uppercase tracking-wide">
            Contrast Check
          </div>
          <ContrastChecker
            foreground={colorData.foreground!}
            background={colorData.background!}
            contrast={colorData.contrast}
            wcagAA={colorData.wcagAA}
            wcagAAA={colorData.wcagAAA}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function rgbToHex(rgb: { r: number; g: number; b: number }): string {
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 0, g: 0, b: 0 };
}

function getLuminance(rgb: { r: number; g: number; b: number }): number {
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function calculateContrast(fg: string, bg: string): number {
  const fgRgb = hexToRgb(fg);
  const bgRgb = hexToRgb(bg);
  const l1 = getLuminance(fgRgb);
  const l2 = getLuminance(bgRgb);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ============================================================================
// Mount
// ============================================================================

render(<ColorPicker />, document.getElementById("app")!);
