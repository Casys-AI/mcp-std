/**
 * Divider Atom - Gradient separator line
 */

interface DividerProps {
  class?: string;
  vertical?: boolean;
}

export default function Divider({ class: className, vertical = false }: DividerProps) {
  if (vertical) {
    return (
      <div
        class={`w-px my-2 ${className || ""}`}
        style={{
          background: "linear-gradient(to bottom, transparent, var(--border-strong), transparent)",
        }}
      />
    );
  }

  return (
    <div
      class={`h-px my-3 ${className || ""}`}
      style={{
        background: "linear-gradient(to right, transparent, var(--border-strong), transparent)",
      }}
    />
  );
}
