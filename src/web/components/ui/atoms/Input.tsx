/**
 * Input Atom - Text input with Casys styling
 */

import type { JSX } from "preact";
import { useEffect, useRef } from "preact/hooks";

interface InputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  class?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  autoFocus?: boolean;
  type?: "text" | "search" | "email" | "password";
}

export default function Input({
  value,
  onChange,
  placeholder,
  class: className,
  onFocus,
  onBlur,
  autoFocus,
  type = "text",
}: InputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleFocus = (e: JSX.TargetedFocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "var(--accent)";
    e.currentTarget.style.boxShadow = "0 0 0 2px var(--accent-dim)";
    onFocus?.();
  };

  const handleBlur = (e: JSX.TargetedFocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "var(--border)";
    e.currentTarget.style.boxShadow = "none";
    onBlur?.();
  };

  return (
    <input
      ref={inputRef}
      type={type}
      class={`py-3 px-4 rounded-lg text-sm font-medium outline-none transition-all duration-200 placeholder:opacity-50 ${
        className || ""
      }`}
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        color: "var(--text)",
        fontFamily: "var(--font-sans)",
      }}
      placeholder={placeholder}
      value={value}
      onInput={(e) => onChange((e.target as HTMLInputElement).value)}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  );
}
