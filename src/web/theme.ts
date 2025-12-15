/**
 * Casys.ai Design System
 * Shared theme tokens for consistent styling across all components
 */

export const theme = {
  colors: {
    bg: "#0a0908",
    bgElevated: "#12110f",
    bgSurface: "#1a1816",

    accent: "#FFB86F",
    accentDim: "rgba(255, 184, 111, 0.1)",
    accentMedium: "rgba(255, 184, 111, 0.2)",
    accentStrong: "rgba(255, 184, 111, 0.3)",

    text: "#f5f0ea",
    textMuted: "#d5c3b5",
    textDim: "#8a8078",

    border: "rgba(255, 184, 111, 0.1)",
    borderStrong: "rgba(255, 184, 111, 0.2)",

    success: "#4ade80",
    warning: "#fbbf24",
    error: "#f87171",
    info: "#60a5fa",
  },

  fonts: {
    sans: "'DM Sans', -apple-system, sans-serif",
    mono: "'JetBrains Mono', monospace",
  },

  // Graph node colors - high contrast palette for visibility
  nodeColors: [
    "#FFB86F", // accent orange (primary)
    "#FF6B6B", // coral red
    "#4ECDC4", // teal
    "#FFE66D", // bright yellow
    "#95E1D3", // mint green
    "#F38181", // salmon pink
    "#AA96DA", // lavender
    "#FCBAD3", // light pink
    "#A8D8EA", // sky blue
    "#FF9F43", // bright orange
    "#6C5CE7", // purple
    "#00CEC9", // cyan
  ],
} as const;

// CSS variables for use in style blocks
export const cssVariables = `
  :root {
    --bg: ${theme.colors.bg};
    --bg-elevated: ${theme.colors.bgElevated};
    --bg-surface: ${theme.colors.bgSurface};
    --accent: ${theme.colors.accent};
    --accent-dim: ${theme.colors.accentDim};
    --accent-medium: ${theme.colors.accentMedium};
    --accent-strong: ${theme.colors.accentStrong};
    --text: ${theme.colors.text};
    --text-muted: ${theme.colors.textMuted};
    --text-dim: ${theme.colors.textDim};
    --border: ${theme.colors.border};
    --border-strong: ${theme.colors.borderStrong};
    --success: ${theme.colors.success};
    --warning: ${theme.colors.warning};
    --error: ${theme.colors.error};
    --info: ${theme.colors.info};
    --font-sans: ${theme.fonts.sans};
    --font-mono: ${theme.fonts.mono};
  }
`;

// Reusable style objects
export const styles = {
  panel: {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    backdropFilter: "blur(12px)",
    borderRadius: "12px",
  },

  card: {
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: "12px",
  },

  input: {
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    color: "var(--text)",
    borderRadius: "8px",
    outline: "none",
  },

  inputFocus: {
    borderColor: "var(--accent)",
    boxShadow: "0 0 0 2px var(--accent-dim)",
  },

  button: {
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    color: "var(--text-muted)",
    borderRadius: "8px",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },

  buttonPrimary: {
    background: "var(--accent)",
    border: "1px solid var(--accent)",
    color: "var(--bg)",
    borderRadius: "8px",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },

  buttonActive: {
    background: "var(--accent-dim)",
    border: "1px solid var(--accent)",
    color: "var(--accent)",
  },
} as const;
