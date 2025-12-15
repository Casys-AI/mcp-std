/**
 * DashboardLayout - Template for dashboard pages
 * Structure: Header (top) + Sidebar (left) + Main (center) + Panel (right)
 */

import { ComponentChildren } from "preact";
import Header from "./Header.tsx";

interface DashboardLayoutProps {
  children: ComponentChildren;
  sidebar?: ComponentChildren;
  rightPanel?: ComponentChildren;
  user?: {
    username: string;
    avatarUrl?: string;
  } | null;
  isCloudMode?: boolean;
}

export default function DashboardLayout({
  children,
  sidebar,
  rightPanel,
  user,
  isCloudMode,
}: DashboardLayoutProps) {
  return (
    <div
      class="flex flex-col w-screen h-screen overflow-hidden font-sans"
      style={{
        background: "var(--bg, #0a0908)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* Header - Top */}
      <Header user={user} isCloudMode={isCloudMode} />

      {/* Main content area */}
      <div class="flex flex-1 min-h-0">
        {/* Sidebar - Left */}
        {sidebar && (
          <div class="flex-shrink-0">
            {sidebar}
          </div>
        )}

        {/* Main - Center (flex-1 to take remaining space) */}
        <main
          class="flex-1 relative min-w-0"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(255, 184, 111, 0.02) 0%, transparent 70%)",
          }}
        >
          {children}
        </main>

        {/* Right Panel */}
        {rightPanel && (
          <div class="flex-shrink-0 h-full overflow-hidden">
            {rightPanel}
          </div>
        )}
      </div>
    </div>
  );
}
