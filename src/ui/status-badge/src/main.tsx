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
import { useEffect, useRef, useState } from "preact/hooks";
import { Badge, Card, StateMessage } from "@casys/mcp-view/preact/components";
import { cx } from "../../components/utils";
import { type McpViewViewer, startMcpViewViewer } from "../../shared/mcp-view";
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
// Helpers
// ============================================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeStatusData(value: unknown): StatusData | null {
  if (Array.isArray(value)) return { items: value as StatusItem[] };
  if (typeof value === "boolean") return { valid: value };
  return isRecord(value) ? value as StatusData : null;
}

function normalizeStatus(
  status: StatusType | boolean | undefined,
  valid?: boolean,
): StatusType {
  if (typeof status === "boolean") return status ? "valid" : "invalid";
  if (status) return status;
  if (typeof valid === "boolean") return valid ? "valid" : "invalid";
  return "info";
}

const statusConfig: Record<StatusType, { icon: string }> = {
  valid: { icon: "\u2713" },
  invalid: { icon: "\u2717" },
  warning: { icon: "!" },
  info: { icon: "i" },
  pending: { icon: "\u25CB" },
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

function StatusItemCard(
  { item, onSelect }: {
    item: StatusItem;
    onSelect: (item: StatusItem, status: StatusType) => void;
  },
) {
  const status = normalizeStatus(item.status);
  const config = statusConfig[status];

  return (
    <div
      className="flex items-start gap-2 p-2 bg-bg-subtle rounded-md cursor-pointer transition-colors duration-150 hover:bg-bg-muted"
      role="button"
      tabIndex={0}
      onClick={() => onSelect(item, status)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(item, status);
        }
      }}
    >
      <div
        className={cx(
          "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0",
          statusBgColors[status],
        )}
      >
        <div className={cx("text-xs font-bold", statusTextColors[status])}>
          {config.icon}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex gap-2 items-center">
          {item.label && <div className="font-medium">{item.label}</div>}
          <Badge
            tone={status === "valid"
              ? "success"
              : status === "invalid"
              ? "danger"
              : status === "warning"
              ? "warning"
              : status === "info"
              ? "info"
              : "neutral"}
          >
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
  const viewer = useRef<McpViewViewer | null>(null);

  useEffect(() => {
    viewer.current = startMcpViewViewer({
      name: "Status Badge",
      version: "1.0.0",
      onToolResult(result) {
        setLoading(false);
        setData(normalizeStatusData(result));
      },
      onTeardown() {
        render(null, appRoot);
      },
    });

    return () => {
      const activeViewer = viewer.current;
      viewer.current = null;
      void activeViewer?.dispose();
    };
  }, []);

  if (loading) {
    return <StateMessage title="Waiting for status">…</StateMessage>;
  }

  if (!data) {
    return (
      <StateMessage title="No status">
        The tool returned no status data.
      </StateMessage>
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
  const validCount =
    items.filter((i) => normalizeStatus(i.status) === "valid").length;
  const invalidCount =
    items.filter((i) => normalizeStatus(i.status) === "invalid").length;
  const warningCount =
    items.filter((i) => normalizeStatus(i.status) === "warning").length;

  return (
    <Card title={data.title ?? "Status"}>
      {/* Summary for multiple items */}
      {items.length > 1 && (
        <div className="flex gap-3 mb-2 text-xs font-medium">
          {validCount > 0 && (
            <div className="text-green-600">✓ {validCount}</div>
          )}
          {invalidCount > 0 && (
            <div className="text-red-600">✗ {invalidCount}</div>
          )}
          {warningCount > 0 && (
            <div className="text-yellow-600">! {warningCount}</div>
          )}
        </div>
      )}

      {/* Badges */}
      <div className="flex flex-col gap-2">
        {items.map((item, i) => (
          <StatusItemCard
            key={i}
            item={item}
            onSelect={(selectedItem, status) => {
              viewer.current?.updateModelContext("click", {
                status,
                label: selectedItem.label,
                value: selectedItem.value,
              });
            }}
          />
        ))}
      </div>
    </Card>
  );
}

// ============================================================================
// Mount
// ============================================================================

const appRoot = document.getElementById("app")!;
render(<StatusBadge />, appRoot);
