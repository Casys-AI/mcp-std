/**
 * Settings Island - Interactive API Key Management
 *
 * Handles:
 * - Showing/hiding API key
 * - Copying API key to clipboard
 * - Toast notifications
 *
 * @module web/islands/SettingsIsland
 */

import { useSignal } from "@preact/signals";

interface SettingsIslandProps {
  flashApiKey: string | null;
  apiKeyPrefix: string | null;
}

export default function SettingsIsland({
  flashApiKey,
  apiKeyPrefix,
}: SettingsIslandProps) {
  const showKey = useSignal(false);
  const copied = useSignal(false);
  const toastMessage = useSignal<string | null>(null);

  // Mask the API key for display
  const getMaskedKey = () => {
    if (flashApiKey && showKey.value) {
      return flashApiKey;
    }
    if (apiKeyPrefix) {
      return `${apiKeyPrefix}${"•".repeat(16)}`;
    }
    return "No API key generated";
  };

  const handleCopy = async () => {
    const keyToCopy = flashApiKey || apiKeyPrefix;
    if (keyToCopy) {
      try {
        await navigator.clipboard.writeText(flashApiKey || keyToCopy);
        copied.value = true;
        toastMessage.value = flashApiKey
          ? "Full API key copied!"
          : "API key prefix copied (full key not available)";
        setTimeout(() => {
          copied.value = false;
          toastMessage.value = null;
        }, 3000);
      } catch {
        toastMessage.value = "Failed to copy to clipboard";
        setTimeout(() => {
          toastMessage.value = null;
        }, 3000);
      }
    }
  };

  const handleToggleShow = () => {
    if (flashApiKey) {
      showKey.value = !showKey.value;
    }
  };

  return (
    <div class="api-key-section">
      {/* Flash API Key Alert - shown once after login/regenerate */}
      {flashApiKey && (
        <div class="flash-key-alert">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
          <div class="flash-key-text">
            <strong>New API Key Generated!</strong>
            <span>
              Save this key now - it won't be shown again after you leave this page.
            </span>
          </div>
        </div>
      )}

      {/* API Key Display */}
      <div class="api-key-display">
        <code class="api-key-value">{getMaskedKey()}</code>
        <div class="api-key-actions">
          {flashApiKey && (
            <button
              type="button"
              class="btn-sm"
              onClick={handleToggleShow}
              title={showKey.value ? "Hide key" : "Show key"}
            >
              {showKey.value
                ? (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                )
                : (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              <span>{showKey.value ? "Hide" : "Show"}</span>
            </button>
          )}
          <button
            type="button"
            class="btn-sm"
            onClick={handleCopy}
            disabled={!apiKeyPrefix && !flashApiKey}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <span>{copied.value ? "Copied!" : "Copy"}</span>
          </button>
        </div>
      </div>

      {/* Note about key visibility */}
      <p class="api-key-note">
        {flashApiKey
          ? "This is your full API key. Copy it now - it won't be visible after you leave this page."
          : "The full API key is only shown once when generated. You can regenerate a new key if needed."}
      </p>

      {/* Toast notification */}
      {toastMessage.value && (
        <div class="toast">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          {toastMessage.value}
        </div>
      )}

      <style>
        {`
          .api-key-section {
            position: relative;
          }

          .flash-key-alert {
            display: flex;
            align-items: flex-start;
            gap: 0.75rem;
            padding: 1rem;
            background: rgba(74, 222, 128, 0.1);
            border: 1px solid rgba(74, 222, 128, 0.2);
            border-radius: 8px;
            margin-bottom: 1rem;
          }

          .flash-key-alert svg {
            color: #4ade80;
            flex-shrink: 0;
            margin-top: 0.125rem;
          }

          .flash-key-text {
            flex: 1;
          }

          .flash-key-text strong {
            display: block;
            color: #4ade80;
            margin-bottom: 0.25rem;
            font-size: 0.9rem;
          }

          .flash-key-text span {
            color: #a8a29e;
            font-size: 0.8rem;
          }

          .api-key-display {
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 1rem;
            background: #08080a;
            border: 1px solid rgba(255, 184, 111, 0.08);
            border-radius: 8px;
            margin-bottom: 0.75rem;
          }

          .api-key-value {
            flex: 1;
            font-family: 'Geist Mono', monospace;
            font-size: 0.9rem;
            color: #a8a29e;
            word-break: break-all;
          }

          .api-key-actions {
            display: flex;
            gap: 0.5rem;
            flex-shrink: 0;
          }

          .btn-sm {
            display: inline-flex;
            align-items: center;
            gap: 0.375rem;
            padding: 0.375rem 0.75rem;
            font-size: 0.75rem;
            font-weight: 600;
            font-family: 'Geist', sans-serif;
            border-radius: 6px;
            border: 1px solid rgba(255, 184, 111, 0.08);
            background: #0f0f12;
            color: #a8a29e;
            cursor: pointer;
            transition: all 0.2s;
          }

          .btn-sm:hover:not(:disabled) {
            border-color: #FFB86F;
            color: #FFB86F;
          }

          .btn-sm:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .api-key-note {
            font-size: 0.8rem;
            color: #6b6560;
          }

          .toast {
            position: fixed;
            bottom: 2rem;
            right: 2rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.75rem 1.25rem;
            background: #141418;
            border: 1px solid rgba(74, 222, 128, 0.2);
            border-radius: 8px;
            color: #4ade80;
            font-size: 0.875rem;
            font-weight: 500;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
            animation: slide-in 0.3s ease-out;
            z-index: 1000;
          }

          @keyframes slide-in {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}
      </style>
    </div>
  );
}
