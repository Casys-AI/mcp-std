/**
 * Settings Page
 *
 * Displays user settings including:
 * - API Key management (cloud mode only)
 * - MCP Gateway configuration
 * - Danger zone: Regenerate key, Delete account
 *
 * @module web/routes/dashboard/settings
 */

import { page } from "fresh";
import type { FreshContext } from "fresh";
import { Head } from "fresh/runtime";
import type { AuthState } from "../_middleware.ts";
import { getDb } from "../../../server/auth/db.ts";
import { users } from "../../../db/schema/users.ts";
import { eq } from "drizzle-orm";
import { peekFlashApiKey } from "../../../server/auth/session.ts";
import { getSessionId } from "../../../server/auth/oauth.ts";
import { getKv } from "../../../server/auth/kv.ts";
import SettingsIsland from "../../islands/SettingsIsland.tsx";
import ConfigCopyButton from "../../islands/ConfigCopyButton.tsx";
import DangerZoneIsland from "../../islands/DangerZoneIsland.tsx";

interface SettingsData {
  user: NonNullable<AuthState["user"]>;
  isCloudMode: boolean;
  apiKeyPrefix: string | null;
  flashApiKey: string | null;
}

export const handler = {
  async GET(ctx: FreshContext<AuthState>) {
    const { user, isCloudMode } = ctx.state;

    // Redirect to signin if not authenticated (cloud mode)
    if (!user) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/auth/signin?return=/dashboard/settings" },
      });
    }

    let apiKeyPrefix: string | null = null;
    let flashApiKey: string | null = null;

    // Get API key info (cloud mode only)
    if (isCloudMode && user.id !== "local") {
      try {
        const db = await getDb();
        const result = await db
          .select({ prefix: users.apiKeyPrefix })
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1);

        apiKeyPrefix = result[0]?.prefix ?? null;

        // Check for flash API key (shown once after login/regenerate)
        const sessionId = await getSessionId(ctx.req);
        if (sessionId) {
          const kv = await getKv();
          flashApiKey = await peekFlashApiKey(kv, sessionId);
        }
      } catch (error) {
        console.error("Error fetching API key info:", error);
      }
    }

    return page({
      user,
      isCloudMode,
      apiKeyPrefix,
      flashApiKey,
    });
  },
};

export default function SettingsPage({ data }: { data: SettingsData }) {
  const { user, isCloudMode, apiKeyPrefix, flashApiKey } = data;

  // MCP configuration based on mode
  const mcpConfigCloud = {
    mcpServers: {
      "mcp-gateway": {
        type: "http",
        url: "https://pml.casys.ai/mcp",
        headers: {
          "x-api-key": "${CAI_API_KEY}",
        },
      },
    },
  };

  const mcpConfigLocal = {
    mcpServers: {
      "mcp-gateway": {
        type: "stdio",
        command: "deno",
        args: ["task", "mcp"],
        cwd: "/path/to/casys-pml",
      },
    },
  };

  return (
    <>
      <Head>
        <title>Settings - Casys PML</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div class="settings-page">
        {/* Header */}
        <header class="settings-header">
          <div class="header-left">
            <a href="/dashboard" class="back-link">
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
              Back to Dashboard
            </a>
          </div>
          <div class="header-right">
            <div class="user-info">
              <img
                src={user.avatarUrl || "/default-avatar.svg"}
                alt={user.username}
                class="avatar"
              />
              <span class="username">
                {user.username === "local" ? "Local User" : user.username}
              </span>
            </div>
            {!isCloudMode && (
              <span class="badge-local">
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
                Local Mode
              </span>
            )}
          </div>
        </header>

        {/* Main Content */}
        <main class="settings-content">
          <h1 class="page-title">Settings</h1>

          {/* API Key Section (Cloud Mode Only) */}
          {isCloudMode && (
            <section class="settings-section">
              <h2 class="section-title">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                </svg>
                Your API Key
              </h2>
              <div class="section-content">
                <SettingsIsland
                  flashApiKey={flashApiKey}
                  apiKeyPrefix={apiKeyPrefix}
                />
              </div>
            </section>
          )}

          {/* MCP Gateway Configuration */}
          <section class="settings-section">
            <h2 class="section-title">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
              MCP Gateway Configuration
            </h2>
            <div class="section-content">
              <p class="config-description">
                {isCloudMode
                  ? "Add this configuration to your Claude Code or Windsurf setup:"
                  : "Add this configuration to run Casys PML locally:"}
              </p>

              <div class="config-block">
                <div class="config-header">
                  <span class="config-label">
                    {isCloudMode ? "Claude Code / Windsurf (HTTP)" : "Local Mode (stdio)"}
                  </span>
                  <ConfigCopyButton
                    config={JSON.stringify(isCloudMode ? mcpConfigCloud : mcpConfigLocal, null, 2)}
                  />
                </div>
                <pre class="config-code"><code>{JSON.stringify(isCloudMode ? mcpConfigCloud : mcpConfigLocal, null, 2)}</code></pre>
              </div>

              {isCloudMode && (
                <div class="config-instructions">
                  <h3>Setup Instructions</h3>
                  <ol>
                    <li>Copy the configuration above</li>
                    <li>
                      Add it to <code>.mcp.json</code> (project scope) or{" "}
                      <code>~/.claude.json</code> (user scope)
                    </li>
                    <li>
                      Set your API key as an environment variable:
                      <pre><code>export CAI_API_KEY="your_api_key_here"</code></pre>
                    </li>
                    <li>Restart Claude Code / Windsurf</li>
                  </ol>
                  <p class="security-note">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    Security: The API key is never stored in plain text. Use{" "}
                    <code>$&#123;CAI_API_KEY&#125;</code> for environment variable expansion.
                  </p>
                </div>
              )}

              {!isCloudMode && (
                <div class="config-instructions">
                  <h3>Setup Instructions</h3>
                  <ol>
                    <li>Copy the configuration above</li>
                    <li>
                      Update the <code>cwd</code> path to your Casys PML installation directory
                    </li>
                    <li>
                      Add it to <code>.mcp.json</code>
                    </li>
                    <li>Restart Claude Code / Windsurf</li>
                  </ol>
                  <p class="local-note">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    No API key required in local mode.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Danger Zone (Cloud Mode Only) */}
          {isCloudMode && (
            <section class="settings-section danger-zone">
              <h2 class="section-title danger">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Danger Zone
              </h2>
              <div class="section-content">
                <DangerZoneIsland />
              </div>
            </section>
          )}

          {/* Footer */}
          <footer class="settings-footer">
            <span class="mode-indicator">
              {isCloudMode
                ? "Running in cloud mode"
                : "Running in local mode - no authentication required"}
            </span>
          </footer>
        </main>

        <style>
          {`
          :root {
            --bg: #08080a;
            --bg-elevated: #0f0f12;
            --bg-card: #141418;
            --accent: #FFB86F;
            --accent-dim: rgba(255, 184, 111, 0.1);
            --accent-medium: rgba(255, 184, 111, 0.2);
            --green: #4ade80;
            --red: #f87171;
            --text: #f0ede8;
            --text-muted: #a8a29e;
            --text-dim: #6b6560;
            --border: rgba(255, 184, 111, 0.08);
            --border-strong: rgba(255, 184, 111, 0.15);
            --font-display: 'Instrument Serif', Georgia, serif;
            --font-sans: 'Geist', -apple-system, system-ui, sans-serif;
            --font-mono: 'Geist Mono', monospace;
          }

          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          .settings-page {
            min-height: 100vh;
            background: var(--bg);
            color: var(--text);
            font-family: var(--font-sans);
          }

          /* Header */
          .settings-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1rem 2rem;
            background: var(--bg-elevated);
            border-bottom: 1px solid var(--border);
          }

          .back-link {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            color: var(--text-muted);
            text-decoration: none;
            font-size: 0.875rem;
            font-weight: 500;
            padding: 0.5rem 1rem;
            border-radius: 8px;
            background: var(--bg);
            border: 1px solid var(--border);
            transition: all 0.2s;
          }

          .back-link:hover {
            color: var(--accent);
            border-color: var(--accent-medium);
          }

          .header-right {
            display: flex;
            align-items: center;
            gap: 1rem;
          }

          .user-info {
            display: flex;
            align-items: center;
            gap: 0.5rem;
          }

          .avatar {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            border: 1px solid var(--border);
          }

          .username {
            font-size: 0.875rem;
            font-weight: 500;
          }

          .badge-local {
            display: flex;
            align-items: center;
            gap: 0.25rem;
            padding: 0.25rem 0.5rem;
            font-size: 0.75rem;
            font-family: var(--font-mono);
            color: var(--green);
            background: rgba(74, 222, 128, 0.1);
            border: 1px solid rgba(74, 222, 128, 0.2);
            border-radius: 4px;
          }

          /* Content */
          .settings-content {
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
          }

          .page-title {
            font-family: var(--font-display);
            font-size: 2rem;
            font-weight: 400;
            margin-bottom: 2rem;
          }

          /* Sections */
          .settings-section {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 12px;
            margin-bottom: 1.5rem;
            overflow: hidden;
          }

          .section-title {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 1rem 1.5rem;
            font-size: 1rem;
            font-weight: 600;
            background: var(--bg-elevated);
            border-bottom: 1px solid var(--border);
          }

          .section-title.danger {
            color: var(--red);
          }

          .section-content {
            padding: 1.5rem;
          }

          /* API Key Display */
          .api-key-display {
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 1rem;
            background: var(--bg);
            border: 1px solid var(--border);
            border-radius: 8px;
            margin-bottom: 1rem;
          }

          .api-key-value {
            flex: 1;
            font-family: var(--font-mono);
            font-size: 0.875rem;
            color: var(--text-muted);
          }

          .api-key-actions {
            display: flex;
            gap: 0.5rem;
          }

          .btn-sm {
            padding: 0.375rem 0.75rem;
            font-size: 0.75rem;
            font-weight: 600;
            border-radius: 6px;
            border: 1px solid var(--border);
            background: var(--bg-elevated);
            color: var(--text-muted);
            cursor: pointer;
            transition: all 0.2s;
          }

          .btn-sm:hover {
            border-color: var(--accent);
            color: var(--accent);
          }

          .api-key-note {
            font-size: 0.8rem;
            color: var(--text-dim);
          }

          .flash-key-alert {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 1rem;
            background: rgba(74, 222, 128, 0.1);
            border: 1px solid rgba(74, 222, 128, 0.2);
            border-radius: 8px;
            margin-bottom: 1rem;
          }

          .flash-key-alert svg {
            color: var(--green);
            flex-shrink: 0;
          }

          .flash-key-text {
            flex: 1;
          }

          .flash-key-text strong {
            display: block;
            color: var(--green);
            margin-bottom: 0.25rem;
          }

          .flash-key-text code {
            font-family: var(--font-mono);
            font-size: 0.875rem;
            color: var(--text);
            background: var(--bg);
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
          }

          /* Config Block */
          .config-description {
            color: var(--text-muted);
            margin-bottom: 1rem;
          }

          .config-block {
            background: var(--bg);
            border: 1px solid var(--border);
            border-radius: 8px;
            overflow: hidden;
            margin-bottom: 1.5rem;
          }

          .config-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.75rem 1rem;
            background: var(--bg-elevated);
            border-bottom: 1px solid var(--border);
          }

          .config-label {
            font-size: 0.75rem;
            font-weight: 600;
            color: var(--accent);
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }

          .btn-copy {
            padding: 0.25rem 0.75rem;
            font-size: 0.75rem;
            font-weight: 600;
            border-radius: 4px;
            border: 1px solid var(--border);
            background: var(--bg);
            color: var(--text-muted);
            cursor: pointer;
            transition: all 0.2s;
          }

          .btn-copy:hover {
            border-color: var(--accent);
            color: var(--accent);
          }

          .config-code {
            padding: 1rem;
            margin: 0;
            font-family: var(--font-mono);
            font-size: 0.8rem;
            line-height: 1.6;
            color: var(--text-muted);
            overflow-x: auto;
          }

          .config-instructions {
            padding: 1rem;
            background: var(--bg);
            border: 1px solid var(--border);
            border-radius: 8px;
          }

          .config-instructions h3 {
            font-size: 0.875rem;
            font-weight: 600;
            margin-bottom: 0.75rem;
          }

          .config-instructions ol {
            padding-left: 1.25rem;
            margin-bottom: 1rem;
          }

          .config-instructions li {
            color: var(--text-muted);
            font-size: 0.875rem;
            margin-bottom: 0.5rem;
          }

          .config-instructions code {
            font-family: var(--font-mono);
            font-size: 0.8rem;
            background: var(--bg-elevated);
            padding: 0.125rem 0.375rem;
            border-radius: 4px;
          }

          .config-instructions pre {
            margin: 0.5rem 0;
            padding: 0.5rem;
            background: var(--bg-elevated);
            border-radius: 4px;
            overflow-x: auto;
          }

          .security-note, .local-note {
            display: flex;
            align-items: flex-start;
            gap: 0.5rem;
            padding: 0.75rem;
            background: rgba(255, 184, 111, 0.05);
            border: 1px solid rgba(255, 184, 111, 0.1);
            border-radius: 6px;
            font-size: 0.8rem;
            color: var(--text-muted);
          }

          .local-note {
            background: rgba(74, 222, 128, 0.05);
            border-color: rgba(74, 222, 128, 0.1);
          }

          .security-note svg, .local-note svg {
            flex-shrink: 0;
            margin-top: 0.125rem;
            color: var(--accent);
          }

          .local-note svg {
            color: var(--green);
          }

          /* Danger Zone */
          .danger-zone {
            border-color: rgba(248, 113, 113, 0.2);
          }

          .danger-content {
            display: flex;
            flex-direction: column;
            gap: 1rem;
          }

          .danger-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 1rem;
            padding: 1rem;
            background: var(--bg);
            border: 1px solid rgba(248, 113, 113, 0.1);
            border-radius: 8px;
          }

          .danger-info h3 {
            font-size: 0.9rem;
            font-weight: 600;
            margin-bottom: 0.25rem;
          }

          .danger-info p {
            font-size: 0.8rem;
            color: var(--text-muted);
          }

          .btn {
            padding: 0.625rem 1.25rem;
            font-size: 0.875rem;
            font-weight: 600;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
            white-space: nowrap;
          }

          .btn-danger {
            background: var(--red);
            color: white;
            border: none;
          }

          .btn-danger:hover {
            filter: brightness(1.1);
          }

          .btn-danger-outline {
            background: transparent;
            color: var(--red);
            border: 1px solid var(--red);
          }

          .btn-danger-outline:hover {
            background: rgba(248, 113, 113, 0.1);
          }

          .btn-ghost {
            background: transparent;
            color: var(--text-muted);
            border: 1px solid var(--border);
          }

          .btn-ghost:hover {
            border-color: var(--text-muted);
          }

          /* Footer */
          .settings-footer {
            text-align: center;
            padding: 2rem;
            color: var(--text-dim);
            font-size: 0.8rem;
          }

          .mode-indicator {
            padding: 0.5rem 1rem;
            background: var(--bg-elevated);
            border-radius: 20px;
          }

          /* Modal */
          .modal {
            padding: 0;
            border: none;
            border-radius: 12px;
            background: var(--bg-card);
            max-width: 450px;
            width: 90%;
          }

          .modal::backdrop {
            background: rgba(0, 0, 0, 0.8);
          }

          .modal-content {
            padding: 1.5rem;
          }

          .modal-content h2 {
            font-size: 1.25rem;
            font-weight: 600;
            margin-bottom: 1rem;
          }

          .modal-content p {
            color: var(--text-muted);
            font-size: 0.9rem;
            margin-bottom: 1rem;
          }

          .confirm-text {
            font-weight: 500;
            color: var(--text);
          }

          .confirm-input {
            width: 100%;
            padding: 0.75rem;
            font-family: var(--font-mono);
            font-size: 0.9rem;
            background: var(--bg);
            border: 1px solid var(--border);
            border-radius: 8px;
            color: var(--text);
            margin-bottom: 1rem;
          }

          .confirm-input:focus {
            outline: none;
            border-color: var(--red);
          }

          .modal-actions {
            display: flex;
            justify-content: flex-end;
            gap: 0.75rem;
          }

          @media (max-width: 640px) {
            .settings-header {
              flex-direction: column;
              gap: 1rem;
            }

            .danger-item {
              flex-direction: column;
              align-items: flex-start;
            }

            .danger-item .btn {
              width: 100%;
            }
          }
          `}
        </style>
      </div>
    </>
  );
}
