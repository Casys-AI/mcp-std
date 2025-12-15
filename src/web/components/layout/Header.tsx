/**
 * Header Component - Extracted from dashboard.tsx
 * Contains: Logo/back link, Search slot (center), User info, Local badge, Settings link
 */

import type { ComponentChildren } from "preact";

interface HeaderProps {
  user?: {
    username: string;
    avatarUrl?: string;
  } | null;
  isCloudMode?: boolean;
  children?: ComponentChildren;
}

export default function Header({ user, isCloudMode, children }: HeaderProps) {
  return (
    <header
      class="flex items-center justify-between px-5 py-3"
      style={{
        background: "rgba(10, 9, 8, 0.9)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--border, rgba(255, 184, 111, 0.1))",
      }}
    >
      {/* Left: Back to Home */}
      <a
        href="/"
        class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex-shrink-0"
        style={{
          background: "var(--bg-elevated, #12110f)",
          border: "1px solid var(--border, rgba(255, 184, 111, 0.1))",
          color: "var(--text-muted, #d5c3b5)",
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.borderColor = "rgba(255, 184, 111, 0.2)";
          e.currentTarget.style.color = "#FFB86F";
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.borderColor = "var(--border, rgba(255, 184, 111, 0.1))";
          e.currentTarget.style.color = "var(--text-muted, #d5c3b5)";
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Casys PML
      </a>

      {/* Center: Search slot (portal target) */}
      <div id="header-search-slot" class="flex-1 flex justify-center px-4">
        {children}
      </div>

      {/* Right: User Info + Settings */}
      <div class="flex items-center gap-3">
        {user && (
          <div class="flex items-center gap-2">
            <img
              src={user.avatarUrl || "/default-avatar.svg"}
              alt={user.username}
              class="w-7 h-7 rounded-full object-cover"
              style={{ border: "1px solid var(--border, rgba(255, 184, 111, 0.1))" }}
            />
            <span
              class="text-sm font-medium"
              style={{ color: "var(--text, #f5f0ea)" }}
            >
              {user.username === "local" ? "Local User" : user.username}
            </span>
          </div>
        )}
        {!isCloudMode && (
          <span
            class="flex items-center gap-1 px-2 py-1 rounded text-xs font-mono"
            style={{
              color: "var(--success, #4ade80)",
              background: "rgba(74, 222, 128, 0.1)",
              border: "1px solid rgba(74, 222, 128, 0.2)",
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            Local
          </span>
        )}
        <a
          href="/dashboard/settings"
          class="flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200"
          style={{
            background: "var(--bg-elevated, #12110f)",
            border: "1px solid var(--border, rgba(255, 184, 111, 0.1))",
            color: "var(--text-muted, #d5c3b5)",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.borderColor = "rgba(255, 184, 111, 0.2)";
            e.currentTarget.style.color = "#FFB86F";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.borderColor = "var(--border, rgba(255, 184, 111, 0.1))";
            e.currentTarget.style.color = "var(--text-muted, #d5c3b5)";
          }}
          title="Settings"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </a>
      </div>
    </header>
  );
}
