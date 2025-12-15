/**
 * SectionCard Atom - Collapsible section container
 */

import { useState } from "preact/hooks";
import type { ComponentChildren } from "preact";

interface SectionCardProps {
  title: string;
  badge?: string | number;
  defaultOpen?: boolean;
  children: ComponentChildren;
}

export function SectionCard({ title, badge, defaultOpen = true, children }: SectionCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      class="rounded-lg overflow-hidden"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
    >
      <button
        class="w-full flex items-center justify-between px-2 py-1.5 text-left"
        style={{ background: open ? "var(--accent-dim)" : "transparent" }}
        onClick={() => setOpen(!open)}
      >
        <span class="text-[10px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-dim)" }}>
          {title}
        </span>
        <div class="flex items-center gap-1.5">
          {badge !== undefined && (
            <span
              class="text-[9px] px-1.5 py-0.5 rounded"
              style={{ background: "var(--bg)", color: "var(--text-muted)" }}
            >
              {badge}
            </span>
          )}
          <svg
            class="w-3 h-3 transition-transform"
            style={{ color: "var(--text-dim)", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {open && <div class="p-2 pt-1">{children}</div>}
    </div>
  );
}
