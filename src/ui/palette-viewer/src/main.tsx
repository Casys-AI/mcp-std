/**
 * Palette Viewer UI for MCP Apps
 *
 * Interactive palette display with:
 * - Color swatches preview
 * - Click to select/copy color
 * - Hover for HEX/RGB info
 * - Export CSS variables
 * - Contrast checker between adjacent colors
 * - Palette type display (complementary, analogous, etc.)
 *
 * @module lib/std/src/ui/palette-viewer
 */

import { render } from "preact";
import { useState, useEffect, useCallback, useMemo } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { cx } from "../../components/utils";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Code } from "../../components/ui/code";
import { Spinner } from "../../components/ui/spinner";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface ColorItem {
  hex: string;
  name?: string;
  rgb?: { r: number; g: number; b: number };
}

interface PaletteData {
  colors: ColorItem[];
  type?: "complementary" | "analogous" | "triadic" | "tetradic" | "split-complementary" | "custom";
  baseColor?: string;
}

interface ContentItem {
  type: string;
  text?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Palette Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace(/^#/, "");
  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(normalized);
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

function calculateContrast(hex1: string, hex2: string): number {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  const l1 = getLuminance(rgb1);
  const l2 = getLuminance(rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function getTextColor(hex: string): string {
  const rgb = hexToRgb(hex);
  const luminance = getLuminance(rgb);
  return luminance > 0.179 ? "#000000" : "#ffffff";
}

function getPaletteTypeLabel(type?: string): string {
  const labels: Record<string, string> = {
    complementary: "Complementary",
    analogous: "Analogous",
    triadic: "Triadic",
    tetradic: "Tetradic",
    "split-complementary": "Split-Complementary",
    custom: "Custom",
  };
  return labels[type || "custom"] || "Custom";
}

// ============================================================================
// Components
// ============================================================================

function ColorSwatch({
  color,
  index,
  isSelected,
  onClick,
}: {
  color: ColorItem;
  index: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [copied, setCopied] = useState(false);

  const rgb = color.rgb || hexToRgb(color.hex);
  const textColor = getTextColor(color.hex);

  const handleClick = useCallback(() => {
    navigator.clipboard.writeText(color.hex);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    onClick();
    notifyModel("select", { hex: color.hex, name: color.name, index });
  }, [color, index, onClick]);

  return (
    <div
      className="relative flex flex-col gap-0 cursor-pointer transition-transform duration-150 hover:-translate-y-1"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Swatch */}
      <div
        className={cx(
          "w-20 h-20 rounded-lg flex items-center justify-center transition-all duration-150",
          isSelected ? "border-3 border-blue-500 shadow-lg" : "border-3 border-transparent shadow-md"
        )}
        style={{ backgroundColor: color.hex }}
        onClick={handleClick}
      >
        {copied && (
          <div className="text-xs font-bold" style={{ color: textColor }}>
            Copied!
          </div>
        )}
      </div>

      {/* Label */}
      <div className="flex flex-col gap-0.5 mt-2 text-center">
        <Code size="sm">{color.hex.toUpperCase()}</Code>
        {color.name && (
          <div className="text-xs text-fg-muted">
            {color.name}
          </div>
        )}
      </div>

      {/* Hover Tooltip */}
      {isHovered && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-10 bg-bg-canvas border border-border-default rounded-lg shadow-lg p-2 whitespace-nowrap">
          <div className="font-semibold mb-1 text-xs">
            {color.hex.toUpperCase()}
          </div>
          <div className="text-fg-muted text-xs">
            RGB({rgb.r}, {rgb.g}, {rgb.b})
          </div>
          <div className="mt-1 text-fg-muted text-[10px]">
            Click to copy
          </div>
        </div>
      )}
    </div>
  );
}

function ContrastIndicator({ color1, color2 }: { color1: string; color2: string }) {
  const contrast = calculateContrast(color1, color2);
  const passAA = contrast >= 4.5;
  const passAALarge = contrast >= 3;

  return (
    <div className="flex flex-col gap-0 px-2 py-1 items-center justify-center">
      <div
        className={cx(
          "text-[10px] font-mono font-medium",
          passAA
            ? "text-green-600 dark:text-green-400"
            : passAALarge
              ? "text-yellow-600 dark:text-yellow-400"
              : "text-red-600 dark:text-red-400"
        )}
      >
        {contrast.toFixed(1)}:1
      </div>
      <div className="text-[8px] text-fg-muted">
        {passAA ? "AA" : passAALarge ? "AA Large" : "Fail"}
      </div>
    </div>
  );
}

function PaletteHeader({
  type,
  baseColor,
  colorCount,
}: {
  type?: string;
  baseColor?: string;
  colorCount: number;
}) {
  return (
    <div className="mb-4">
      <div className="flex gap-3 mb-2 items-center">
        <h2 className="text-lg font-semibold text-fg-default m-0">
          {getPaletteTypeLabel(type)} Palette
        </h2>
        <Badge variant="outline" size="sm">
          {colorCount} colors
        </Badge>
      </div>
      {baseColor && (
        <div className="flex gap-2 items-center">
          <div className="text-sm text-fg-muted">Base color:</div>
          <div
            className="w-4 h-4 rounded-sm border border-border-default"
            style={{ backgroundColor: baseColor }}
          />
          <Code size="sm">{baseColor.toUpperCase()}</Code>
        </div>
      )}
    </div>
  );
}

function CssExport({ colors }: { colors: ColorItem[] }) {
  const [copied, setCopied] = useState(false);

  const cssVariables = useMemo(() => {
    return colors
      .map((c, i) => {
        const name = c.name ? c.name.toLowerCase().replace(/\s+/g, "-") : `color-${i + 1}`;
        return `  --${name}: ${c.hex};`;
      })
      .join("\n");
  }, [colors]);

  const fullCss = `:root {\n${cssVariables}\n}`;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(fullCss);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    notifyModel("export", { format: "css", content: fullCss });
  }, [fullCss]);

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-fg-muted mb-2 uppercase tracking-wide">
        CSS Variables
      </h3>
      <div className="relative bg-bg-canvas border border-border-default rounded-lg overflow-hidden">
        <pre className="p-3 text-xs font-mono text-fg-default overflow-x-auto m-0">
          {fullCss}
        </pre>
        <Button
          onClick={handleCopy}
          variant="solid"
          size="sm"
          className="absolute top-2 right-2"
        >
          {copied ? "Copied!" : "Copy CSS"}
        </Button>
      </div>
    </div>
  );
}

function ContrastMatrix({ colors }: { colors: ColorItem[] }) {
  if (colors.length < 2 || colors.length > 8) return null;

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-fg-muted mb-2 uppercase tracking-wide">
        Adjacent Contrast
      </h3>
      <div className="flex items-center gap-1 flex-wrap">
        {colors.slice(0, -1).map((color, i) => (
          <div key={i} className="flex gap-0 items-center">
            <div
              className="w-6 h-6 rounded-sm"
              style={{ backgroundColor: color.hex }}
            />
            <ContrastIndicator color1={color.hex} color2={colors[i + 1].hex} />
            {i === colors.length - 2 && (
              <div
                className="w-6 h-6 rounded-sm"
                style={{ backgroundColor: colors[i + 1].hex }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function PaletteViewer() {
  const [paletteData, setPaletteData] = useState<PaletteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // Connect to MCP host
  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
      console.log("[palette-viewer] Connected to MCP host");
    }).catch(() => {
      console.log("[palette-viewer] No MCP host (standalone mode)");
    });

    app.ontoolresult = (result: { content?: ContentItem[] }) => {
      setLoading(false);
      setError(null);

      try {
        const textContent = result.content?.find((c) => c.type === "text") as ContentItem | undefined;
        if (!textContent?.text) {
          setPaletteData(null);
          return;
        }

        const data = JSON.parse(textContent.text) as PaletteData;

        // Normalize: ensure colors array exists
        if (!data.colors || !Array.isArray(data.colors)) {
          setError("Invalid palette data: missing colors array");
          return;
        }

        // Normalize hex values
        data.colors = data.colors.map((c) => ({
          ...c,
          hex: c.hex.startsWith("#") ? c.hex : `#${c.hex}`,
        }));

        setPaletteData(data);
        setSelectedIndex(null);
      } catch (e) {
        setError(`Failed to parse palette data: ${e instanceof Error ? e.message : "Unknown"}`);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // Render states
  if (loading) {
    return (
      <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-full">
        <div className="p-10 flex flex-col gap-2 items-center justify-center">
          <Spinner size="md" />
          <div className="text-fg-muted">Loading palette...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-full">
        <div className="p-4 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 rounded-md">
          {error}
        </div>
      </div>
    );
  }

  if (!paletteData || paletteData.colors.length === 0) {
    return (
      <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-full">
        <div className="p-10 flex items-center justify-center text-fg-muted">No palette data</div>
      </div>
    );
  }

  return (
    <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-full">
      {/* Header */}
      <PaletteHeader
        type={paletteData.type}
        baseColor={paletteData.baseColor}
        colorCount={paletteData.colors.length}
      />

      {/* Color Swatches */}
      <div className="flex flex-wrap gap-4 justify-center">
        {paletteData.colors.map((color, i) => (
          <ColorSwatch
            key={i}
            color={color}
            index={i}
            isSelected={selectedIndex === i}
            onClick={() => setSelectedIndex(i)}
          />
        ))}
      </div>

      {/* Contrast Matrix */}
      <ContrastMatrix colors={paletteData.colors} />

      {/* CSS Export */}
      <CssExport colors={paletteData.colors} />
    </div>
  );
}

// ============================================================================
// Mount
// ============================================================================

render(<PaletteViewer />, document.getElementById("app")!);
