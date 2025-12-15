/**
 * SearchBar Molecule - Input with keyboard shortcut indicator
 * Combines: Input + Kbd atoms
 */

import { useEffect, useRef } from "preact/hooks";
import Kbd from "../atoms/Kbd.tsx";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  shortcut?: string;
  class?: string;
}

export default function SearchBar({
  value,
  onChange,
  onFocus,
  onBlur,
  placeholder = "Search...",
  shortcut = "/",
  class: className,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus on shortcut key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key === "/" && !e.ctrlKey && document.activeElement?.tagName !== "INPUT") ||
        (e.ctrlKey && e.key === "k")
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div class={`relative ${className || ""}`}>
      <input
        ref={inputRef}
        type="text"
        class="w-full py-3 px-4 pr-12 rounded-xl text-sm font-medium outline-none transition-all duration-200 placeholder:opacity-50"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          color: "var(--text)",
          fontFamily: "var(--font-sans)",
        }}
        placeholder={placeholder}
        value={value}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--accent)";
          e.currentTarget.style.boxShadow = "0 0 0 2px var(--accent-dim)";
          onFocus?.();
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "var(--border)";
          e.currentTarget.style.boxShadow = "none";
          onBlur?.();
        }}
      />
      <span class="absolute right-3 top-1/2 -translate-y-1/2">
        <Kbd>{shortcut}</Kbd>
      </span>
    </div>
  );
}
