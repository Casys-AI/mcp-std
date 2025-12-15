/**
 * Button Atom - Reusable button with variants
 * Variants: default, primary, ghost, danger
 */

import type { JSX } from "preact";

type ButtonVariant = "default" | "primary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps {
  children: JSX.Element | string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  class?: string;
  type?: "button" | "submit" | "reset";
}

const variantStyles: Record<ButtonVariant, { base: string; hover: string }> = {
  default: {
    base:
      "background: var(--accent-dim); border: 1px solid var(--border-strong); color: var(--text-muted);",
    hover: "background: var(--accent-medium); border-color: var(--accent); color: var(--accent);",
  },
  primary: {
    base: "background: var(--accent); border: 1px solid var(--accent); color: var(--bg);",
    hover: "filter: brightness(1.1);",
  },
  ghost: {
    base: "background: transparent; border: 1px solid transparent; color: var(--text-muted);",
    hover: "background: var(--accent-dim); color: var(--text);",
  },
  danger: {
    base:
      "background: rgba(248, 113, 113, 0.1); border: 1px solid rgba(248, 113, 113, 0.2); color: var(--error);",
    hover: "background: rgba(248, 113, 113, 0.2); border-color: var(--error);",
  },
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "py-1.5 px-3 text-xs",
  md: "py-2 px-4 text-sm",
  lg: "py-3 px-5 text-base",
};

export default function Button({
  children,
  variant = "default",
  size = "md",
  onClick,
  disabled,
  title,
  class: className,
  type = "button",
}: ButtonProps) {
  const styles = variantStyles[variant];

  return (
    <button
      type={type}
      class={`rounded-lg font-medium cursor-pointer transition-all duration-200 ${
        sizeStyles[size]
      } ${className || ""}`}
      style={styles.base}
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseOver={(e) => {
        if (!disabled) {
          const hoverParts = styles.hover.split(";").filter(Boolean);
          hoverParts.forEach((part) => {
            const [prop, val] = part.split(":").map((s) => s.trim());
            if (prop && val) {
              (e.currentTarget.style as any)[prop.replace(/-([a-z])/g, (_, l) => l.toUpperCase())] =
                val;
            }
          });
        }
      }}
      onMouseOut={(e) => {
        if (!disabled) {
          const baseParts = styles.base.split(";").filter(Boolean);
          baseParts.forEach((part) => {
            const [prop, val] = part.split(":").map((s) => s.trim());
            if (prop && val) {
              (e.currentTarget.style as any)[prop.replace(/-([a-z])/g, (_, l) => l.toUpperCase())] =
                val;
            }
          });
        }
      }}
    >
      {children}
    </button>
  );
}
