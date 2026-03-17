/**
 * Status Badge UI - Valid/Invalid/Warning display
 *
 * Compact badge showing validation status with:
 * - Color-coded status (green/red/yellow)
 * - Icon indicator
 * - Optional details/message
 * - Multiple statuses support
 *
 * Stack: Preact + Tailwind CSS
 *
 * @module lib/std/src/ui/status-badge
 */

import { render } from "preact";
import { useState, useEffect } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { Badge } from "../../components/ui/badge";
import { cx } from "../../components/utils";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

type StatusType = "valid" | "invalid" | "warning" | "info" | "pending";

interface StatusItem {
  status: StatusType | boolean;
  label?: string;
  message?: string;
  value?: string | number | boolean;
}

interface StatusData {
  // Single status
  valid?: boolean;
  status?: StatusType | boolean;
  label?: string;
  message?: string;
  value?: string | number | boolean;

  // Multiple statuses
  items?: StatusItem[];

  // Title
  title?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Status Badge", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Helpers
// ============================================================================

function normalizeStatus(status: StatusType | boolean | undefined, valid?: boolean): StatusType {
  if (typeof status === "boolean") return status ? "valid" : "invalid";
  if (status) return status;
  if (typeof valid === "boolean") return valid ? "valid" : "invalid";
  return "info";
}

const statusConfig: Record<StatusType, { icon: string; colorPalette: string }> = {
  valid: { icon: "\u2713", colorPalette: "green" },
  invalid: { icon: "\u2717", colorPalette: "red" },
  warning: { icon: "!", colorPalette: "orange" },
  info: { icon: "i", colorPalette: "blue" },
  pending: { icon: "\u25CB", colorPalette: "gray" },
};

const statusBgColors: Record<StatusType, string> = {
  valid: "bg-green-100 dark:bg-green-900/50",
  invalid: "bg-red-100 dark:bg-red-900/50",
  warning: "bg-yellow-100 dark:bg-yellow-900/50",
  info: "bg-blue-100 dark:bg-blue-900/50",
  pending: "bg-gray-100 dark:bg-gray-800",
};

const statusTextColors: Record<StatusType, string> = {
  valid: "text-green-700 dark:text-green-400",
  invalid: "text-red-700 dark:text-red-400",
  warning: "text-yellow-700 dark:text-yellow-400",
  info: "text-blue-700 dark:text-blue-400",
  pending: "text-gray-600 dark:text-gray-400",
};

// ============================================================================
// Components
// ============================================================================

function StatusItemCard({ item }: { item: StatusItem }) {
  const status = normalizeStatus(item.status);
  const config = statusConfig[status];

  const colorMap: Record<StatusType, "green" | "red" | "orange" | "blue" | "gray"> = {
    valid: "green",
    invalid: "red",
    warning: "orange",
    info: "blue",
    pending: "gray",
  };

  return (
    <div
      className="flex items-start gap-2 p-2 bg-bg-subtle rounded-md cursor-pointer transition-colors duration-150 hover:bg-bg-muted"
      onClick={() => notifyModel("click", { status, label: item.label, value: item.value })}
    >
      <div
        className={cx(
          "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0",
          statusBgColors[status]
        )}
      >
        <div className={cx("text-xs font-bold", statusTextColors[status])}>
          {config.icon}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex gap-2 items-center">
          {item.label && <div className="font-medium">{item.label}</div>}
          <Badge size="sm" variant="subtle" colorScheme={colorMap[status]}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Badge>
        </div>
        {item.value !== undefined && (
          <div className="font-mono text-xs text-fg-muted mt-0.5 overflow-hidden text-ellipsis">
            {String(item.value)}
          </div>
        )}
        {item.message && (
          <div className="text-xs text-fg-muted mt-0.5">
            {item.message}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function StatusBadge() {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
    }).catch(() => {});

    app.ontoolresult = (result: { content?: Array<{ type: string; text?: string }> }) => {
      setLoading(false);
      try {
        const textContent = result.content?.find((c) => c.type === "text");
        if (textContent?.text) {
          const parsed = JSON.parse(textContent.text);

          // Normalize various input formats
          if (Array.isArray(parsed)) {
            // Array of statuses
            setData({ items: parsed });
          } else if (typeof parsed === "boolean") {
            // Just a boolean
            setData({ valid: parsed });
          } else if (parsed.items) {
            // Already has items array
            setData(parsed);
          } else {
            // Single status object
            setData(parsed);
          }
        }
      } catch (e) {
        console.error("Failed to parse status data", e);
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="p-3 font-sans text-sm text-fg-default bg-bg-canvas">
        <div className="text-fg-muted">...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-3 font-sans text-sm text-fg-default bg-bg-canvas">
        <div className="text-fg-muted">No status</div>
      </div>
    );
  }

  // Convert single status to items array for uniform rendering
  const items: StatusItem[] = data.items || [{
    status: normalizeStatus(data.status, data.valid),
    label: data.label,
    message: data.message,
    value: data.value,
  }];

  // Calculate summary if multiple items
  const validCount = items.filter(i => normalizeStatus(i.status) === "valid").length;
  const invalidCount = items.filter(i => normalizeStatus(i.status) === "invalid").length;
  const warningCount = items.filter(i => normalizeStatus(i.status) === "warning").length;

  return (
    <div className="p-3 font-sans text-sm text-fg-default bg-bg-canvas">
      {/* Title */}
      {data.title && (
        <div className="text-sm font-semibold mb-2">
          {data.title}
        </div>
      )}

      {/* Summary for multiple items */}
      {items.length > 1 && (
        <div className="flex gap-3 mb-2 text-xs font-medium">
          {validCount > 0 && <div className="text-green-600">{"\u2713"} {validCount}</div>}
          {invalidCount > 0 && <div className="text-red-600">{"\u2717"} {invalidCount}</div>}
          {warningCount > 0 && <div className="text-yellow-600">! {warningCount}</div>}
        </div>
      )}

      {/* Badges */}
      <div className="flex flex-col gap-2">
        {items.map((item, i) => (
          <StatusItemCard key={i} item={item} />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Mount
// ============================================================================

render(<StatusBadge />, document.getElementById("app")!);
