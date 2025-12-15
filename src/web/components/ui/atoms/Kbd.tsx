/**
 * Kbd Atom - Keyboard shortcut indicator
 * Used for: Displaying keyboard shortcuts like /, Esc, Ctrl+K
 */

interface KbdProps {
  children: string;
  class?: string;
}

export default function Kbd({ children, class: className }: KbdProps) {
  return (
    <kbd
      class={`px-2 py-0.5 rounded-md text-xs font-medium ${className || ""}`}
      style={{
        background: "var(--accent-dim)",
        border: "1px solid var(--border)",
        color: "var(--text-dim)",
        fontFamily: "var(--font-mono)",
      }}
    >
      {children}
    </kbd>
  );
}
