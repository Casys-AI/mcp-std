/**
 * Contrast Checker UI - WCAG Color Accessibility Checker
 *
 * Luxury/Editorial Magazine Design with Tailwind CSS
 *
 * Features:
 * - Playfair Display serif for headings, Inter for body
 * - Warm off-white/deep black color scheme
 * - Gold/bronze accents with olive/bordeaux badges
 * - Asymmetric editorial layout with 3:2 color swatches
 * - Soft diffuse shadows and fine borders
 * - Elegant animations and hover states
 * - Light/dark mode toggle
 *
 * @module lib/std/src/ui/contrast-checker
 */

import { render } from "preact";
import { useState, useEffect, useCallback, useRef } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { cx } from "../../components/utils";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface WCAGLevels {
  aa: { normal: boolean; large: boolean };
  aaa: { normal: boolean; large: boolean };
}

interface ColorSuggestion {
  color: string;
  contrastRatio: number;
  rating: string;
}

interface ContrastData {
  foreground: string;
  background: string;
  contrastRatio: number;
  wcag: WCAGLevels;
  rating: "Fail" | "AA Large" | "AA" | "AAA";
  isLargeText: boolean;
  fontSize: number;
  fontWeight: string;
  suggestions?: ColorSuggestion[];
}

interface ContentItem {
  type: string;
  text?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Contrast Checker", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Helpers
// ============================================================================

function getTextColor(bgHex: string): string {
  const rgb = hexToRgb(bgHex);
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.5 ? "#1a1a1a" : "#faf9f7";
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

// ============================================================================
// Animated Counter Hook
// ============================================================================

function useAnimatedNumber(target: number, duration: number = 800): number {
  const [value, setValue] = useState(0);
  const startTime = useRef<number | null>(null);
  const startValue = useRef(0);

  useEffect(() => {
    startValue.current = value;
    startTime.current = null;

    const animate = (timestamp: number) => {
      if (!startTime.current) startTime.current = timestamp;
      const elapsed = timestamp - startTime.current;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startValue.current + (target - startValue.current) * eased;

      setValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [target, duration]);

  return value;
}

// ============================================================================
// Theme Colors (Editorial Magazine)
// ============================================================================

const theme = {
  light: {
    bg: "#faf9f7",
    bgSubtle: "#f5f4f2",
    text: "#1a1a1a",
    textMuted: "#6b6b6b",
    accent: "#b8860b",
    border: "rgba(0, 0, 0, 0.08)",
    borderFine: "rgba(0, 0, 0, 0.06)",
    passOlive: { bg: "#f0f4ec", text: "#4a5d23", border: "#c8d6b8" },
    failBordeaux: { bg: "#fdf2f2", text: "#8b2942", border: "#e8c4cb" },
    shadow: "0 4px 24px rgba(0, 0, 0, 0.06), 0 1px 4px rgba(0, 0, 0, 0.04)",
    shadowHover: "0 8px 32px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)",
  },
  dark: {
    bg: "#0d0d0d",
    bgSubtle: "#1a1a1a",
    text: "#faf9f7",
    textMuted: "#8a8a8a",
    accent: "#d4a017",
    border: "rgba(255, 255, 255, 0.08)",
    borderFine: "rgba(255, 255, 255, 0.06)",
    passOlive: { bg: "#1a2310", text: "#a4c45a", border: "#3d4a28" },
    failBordeaux: { bg: "#1f1012", text: "#e07a8a", border: "#4a2a32" },
    shadow: "0 4px 24px rgba(0, 0, 0, 0.4), 0 1px 4px rgba(0, 0, 0, 0.3)",
    shadowHover: "0 8px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.4)",
  },
};

// ============================================================================
// SVG Icons
// ============================================================================

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

// ============================================================================
// Components
// ============================================================================

function ThemeToggle({
  isDark,
  onToggle,
  colors
}: {
  isDark: boolean;
  onToggle: () => void;
  colors: typeof theme.light;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      className="absolute top-6 right-6 w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-all duration-300"
      onClick={onToggle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        borderWidth: "0.5px",
        borderStyle: "solid",
        borderColor: colors.borderFine,
        background: colors.bgSubtle,
        color: isHovered ? colors.accent : colors.textMuted,
        boxShadow: isHovered ? colors.shadowHover : colors.shadow,
      }}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function ColorSwatch({
  color,
  label,
  onCopy,
  colors,
}: {
  color: string;
  label: string;
  onCopy?: () => void;
  colors: typeof theme.light;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div className="flex-1">
      <div
        className="text-[10px] font-medium tracking-widest uppercase mb-3"
        style={{ color: colors.textMuted }}
      >
        {label}
      </div>
      <div
        className={cx(
          "w-full aspect-[3/2] rounded-sm flex flex-col items-center justify-center gap-2 overflow-hidden transition-all duration-300",
          onCopy && "cursor-pointer"
        )}
        onClick={onCopy}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          borderWidth: "0.5px",
          borderStyle: "solid",
          borderColor: colors.borderFine,
          backgroundColor: color,
          transform: isHovered ? "scale(1.02)" : "scale(1)",
          boxShadow: isHovered ? colors.shadowHover : colors.shadow,
        }}
        title={onCopy ? "Click to copy" : undefined}
      >
        <div
          className="text-sm font-medium tracking-wider opacity-90"
          style={{ color: getTextColor(color) }}
        >
          {color.toUpperCase()}
        </div>
      </div>
    </div>
  );
}

function ContrastRatioDisplay({
  ratio,
  colors
}: {
  ratio: number;
  colors: typeof theme.light;
}) {
  const animatedRatio = useAnimatedNumber(ratio);

  return (
    <div className="flex flex-col items-center gap-1 py-8">
      <div
        className="text-[10px] font-medium tracking-widest uppercase"
        style={{ color: colors.textMuted }}
      >
        Contrast Ratio
      </div>
      <div className="flex items-baseline gap-0.5">
        <div
          className="font-serif text-6xl font-semibold leading-none tracking-tight"
          style={{ color: colors.text }}
        >
          {animatedRatio.toFixed(2)}
        </div>
        <div
          className="font-serif text-2xl font-normal ml-1"
          style={{ color: colors.textMuted }}
        >
          :1
        </div>
      </div>
    </div>
  );
}

function Separator({ colors }: { colors: typeof theme.light }) {
  return (
    <div
      className="h-px my-6"
      style={{
        background: `linear-gradient(to right, transparent, ${colors.border}, transparent)`,
      }}
    />
  );
}

function RatingBadge({
  rating,
  colors
}: {
  rating: string;
  colors: typeof theme.light;
}) {
  const isPass = rating !== "Fail";
  const badgeColors = isPass ? colors.passOlive : colors.failBordeaux;

  return (
    <div
      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-semibold tracking-wider"
      style={{
        borderWidth: "0.5px",
        borderStyle: "solid",
        background: badgeColors.bg,
        color: badgeColors.text,
        borderColor: badgeColors.border,
      }}
    >
      {isPass ? <CheckIcon /> : <XIcon />}
      {rating}
    </div>
  );
}

function WCAGBadge({
  level,
  size,
  pass,
  colors,
}: {
  level: "AA" | "AAA";
  size: "normal" | "large";
  pass: boolean;
  colors: typeof theme.light;
}) {
  const badgeColors = pass ? colors.passOlive : colors.failBordeaux;

  return (
    <div
      className="flex items-center justify-between px-4 py-3 rounded-sm text-[10px] font-medium transition-all duration-300"
      style={{
        borderWidth: "0.5px",
        borderStyle: "solid",
        background: badgeColors.bg,
        borderColor: badgeColors.border,
      }}
    >
      <div className="flex items-center gap-2">
        <span className="font-bold tracking-wider" style={{ color: badgeColors.text }}>
          {level}
        </span>
        <span className="opacity-70 tracking-wide" style={{ color: badgeColors.text }}>
          {size === "large" ? "Large Text" : "Normal Text"}
        </span>
      </div>
      <span style={{ color: badgeColors.text }}>
        {pass ? <CheckIcon /> : <XIcon />}
      </span>
    </div>
  );
}

function TextPreview({
  foreground,
  background,
  fontSize,
  fontWeight,
  colors,
}: {
  foreground: string;
  background: string;
  fontSize: number;
  fontWeight: string;
  colors: typeof theme.light;
}) {
  return (
    <div
      className="rounded-sm overflow-hidden"
      style={{
        borderWidth: "0.5px",
        borderStyle: "solid",
        borderColor: colors.borderFine,
        boxShadow: colors.shadow,
      }}
    >
      <div
        className="p-8 text-center"
        style={{ backgroundColor: background, color: foreground }}
      >
        <div
          className="font-serif mb-3 leading-tight"
          style={{
            fontSize: `${fontSize}px`,
            fontWeight: fontWeight === "bold" ? 700 : 400,
          }}
        >
          Sample Text
        </div>
        <div className="text-sm leading-relaxed opacity-90">
          The quick brown fox jumps over the lazy dog
        </div>
      </div>
      <div
        className="px-4 py-2.5 text-[10px] font-medium tracking-wide uppercase flex justify-center"
        style={{
          borderTopWidth: "0.5px",
          borderTopStyle: "solid",
          background: colors.bgSubtle,
          color: colors.textMuted,
          borderColor: colors.borderFine,
        }}
      >
        {fontSize}px {fontWeight}
      </div>
    </div>
  );
}

function SuggestionCard({
  suggestion,
  background,
  onSelect,
  colors,
}: {
  suggestion: ColorSuggestion;
  background: string;
  onSelect: (color: string) => void;
  colors: typeof theme.light;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const isAAA = suggestion.rating === "AAA";

  return (
    <div
      className="flex items-center gap-4 p-4 rounded-sm cursor-pointer transition-all duration-300"
      onClick={() => onSelect(suggestion.color)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        borderWidth: "0.5px",
        borderStyle: "solid",
        background: isHovered ? colors.bgSubtle : "transparent",
        borderColor: isHovered ? colors.border : "transparent",
      }}
    >
      <div
        className="w-16 h-10 rounded-xs flex items-center justify-center text-sm font-serif font-semibold transition-transform duration-300"
        style={{
          borderWidth: "0.5px",
          borderStyle: "solid",
          borderColor: colors.borderFine,
          backgroundColor: background,
          color: suggestion.color,
          boxShadow: colors.shadow,
          transform: isHovered ? "scale(1.05)" : "scale(1)",
        }}
      >
        Aa
      </div>

      <div className="flex-1">
        <div className="text-sm font-medium tracking-wider" style={{ color: colors.text }}>
          {suggestion.color.toUpperCase()}
        </div>
        <div className="text-[10px] mt-0.5" style={{ color: colors.textMuted }}>
          {suggestion.contrastRatio}:1
        </div>
      </div>

      <div
        className="px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wider"
        style={{
          borderWidth: "0.5px",
          borderStyle: "solid",
          background: isAAA ? colors.passOlive.bg : colors.bgSubtle,
          color: isAAA ? colors.passOlive.text : colors.accent,
          borderColor: isAAA ? colors.passOlive.border : colors.border,
        }}
      >
        {suggestion.rating}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function ContrastChecker() {
  const [data, setData] = useState<ContrastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const colors = isDark ? theme.dark : theme.light;

  // Fade-in animation on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Connect to MCP host
  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
      console.log("[contrast-checker] Connected to MCP host");
    }).catch(() => {
      console.log("[contrast-checker] No MCP host (standalone mode)");
      // Demo data for standalone mode
      setData({
        foreground: "#1a1a1a",
        background: "#faf9f7",
        contrastRatio: 15.2,
        wcag: {
          aa: { normal: true, large: true },
          aaa: { normal: true, large: true },
        },
        rating: "AAA",
        isLargeText: false,
        fontSize: 16,
        fontWeight: "normal",
        suggestions: [
          { color: "#2d2d2d", contrastRatio: 12.5, rating: "AAA" },
          { color: "#444444", contrastRatio: 8.2, rating: "AA" },
        ],
      });
      setLoading(false);
    });

    app.ontoolresult = (result: { content?: ContentItem[] }) => {
      setLoading(false);
      setError(null);

      try {
        const textContent = result.content?.find((c) => c.type === "text") as ContentItem | undefined;
        if (!textContent?.text) {
          setData(null);
          return;
        }

        const parsed = JSON.parse(textContent.text) as ContrastData;
        setData(parsed);
      } catch (e) {
        setError(`Failed to parse data: ${e instanceof Error ? e.message : "Unknown"}`);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  const handleCopy = useCallback((value: string, label: string) => {
    navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
    notifyModel("copy", { value, label });
  }, []);

  const handleSelectSuggestion = useCallback((color: string) => {
    navigator.clipboard.writeText(color);
    setCopied("suggestion");
    setTimeout(() => setCopied(null), 2000);
    notifyModel("selectSuggestion", { color });
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => !prev);
    notifyModel("toggleTheme", { isDark: !isDark });
  }, [isDark]);

  // Loading state
  if (loading) {
    return (
      <div
        className="p-12 min-h-screen flex items-center justify-center text-sm tracking-wide uppercase"
        style={{ color: colors.textMuted, background: colors.bg }}
      >
        Checking contrast...
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-12 font-sans text-sm min-h-screen" style={{ background: colors.bg }}>
        <div
          className="p-5 rounded-sm"
          style={{
            borderWidth: "0.5px",
            borderStyle: "solid",
            background: colors.failBordeaux.bg,
            color: colors.failBordeaux.text,
            borderColor: colors.failBordeaux.border,
          }}
        >
          {error}
        </div>
      </div>
    );
  }

  // Empty state
  if (!data) {
    return (
      <div
        className="p-12 min-h-screen flex items-center justify-center text-sm tracking-wide uppercase"
        style={{ color: colors.textMuted, background: colors.bg }}
      >
        No contrast data
      </div>
    );
  }

  const hasSuggestions = data.suggestions && data.suggestions.length > 0;

  return (
    <div
      className="p-12 font-sans text-sm min-h-screen relative transition-all duration-300"
      style={{
        color: colors.text,
        background: colors.bg,
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(8px)",
      }}
    >
      {/* Theme toggle */}
      <ThemeToggle isDark={isDark} onToggle={toggleTheme} colors={colors} />

      {/* Header */}
      <header className="mb-10 max-w-[400px]">
        <h1
          className="font-serif text-3xl font-semibold mb-2 tracking-tight"
          style={{ color: colors.text }}
        >
          Contrast Checker
        </h1>
        <div
          className="text-xs tracking-wide leading-relaxed"
          style={{ color: colors.textMuted }}
        >
          WCAG 2.1 Color Accessibility Analysis
        </div>
      </header>

      {/* Color swatches - asymmetric layout */}
      <div className="flex gap-6 mb-2">
        <ColorSwatch
          color={data.foreground}
          label="Foreground"
          onCopy={() => handleCopy(data.foreground, "foreground")}
          colors={colors}
        />
        <ColorSwatch
          color={data.background}
          label="Background"
          onCopy={() => handleCopy(data.background, "background")}
          colors={colors}
        />
      </div>

      <Separator colors={colors} />

      {/* Contrast ratio - large editorial typography */}
      <div className="text-center">
        <ContrastRatioDisplay ratio={data.contrastRatio} colors={colors} />
        <RatingBadge rating={data.rating} colors={colors} />
      </div>

      <Separator colors={colors} />

      {/* Text preview */}
      <div className="mb-8">
        <div
          className="text-[10px] font-medium tracking-widest uppercase mb-4"
          style={{ color: colors.textMuted }}
        >
          Preview
        </div>
        <TextPreview
          foreground={data.foreground}
          background={data.background}
          fontSize={data.fontSize}
          fontWeight={data.fontWeight}
          colors={colors}
        />
      </div>

      {/* WCAG compliance badges */}
      <div className="mb-8">
        <div
          className="text-[10px] font-medium tracking-widest uppercase mb-4"
          style={{ color: colors.textMuted }}
        >
          WCAG Compliance
        </div>
        <div className="grid grid-cols-2 gap-2">
          <WCAGBadge level="AA" size="normal" pass={data.wcag.aa.normal} colors={colors} />
          <WCAGBadge level="AA" size="large" pass={data.wcag.aa.large} colors={colors} />
          <WCAGBadge level="AAA" size="normal" pass={data.wcag.aaa.normal} colors={colors} />
          <WCAGBadge level="AAA" size="large" pass={data.wcag.aaa.large} colors={colors} />
        </div>
      </div>

      {/* Suggestions section */}
      {hasSuggestions && (
        <div>
          <Separator colors={colors} />
          <div
            className="text-[10px] font-medium tracking-widest uppercase mb-4"
            style={{ color: colors.textMuted }}
          >
            Suggested Alternatives
          </div>
          <div className="flex flex-col gap-1">
            {data.suggestions!.map((suggestion, i) => (
              <SuggestionCard
                key={i}
                suggestion={suggestion}
                background={data.background}
                onSelect={handleSelectSuggestion}
                colors={colors}
              />
            ))}
          </div>
        </div>
      )}

      {/* Copy feedback toast */}
      {copied && (
        <div
          className="fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full text-[10px] font-medium tracking-wider z-50 animate-pulse"
          style={{
            background: colors.text,
            color: colors.bg,
            boxShadow: colors.shadow,
          }}
        >
          Copied {copied}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Mount
// ============================================================================

render(<ContrastChecker />, document.getElementById("app")!);
