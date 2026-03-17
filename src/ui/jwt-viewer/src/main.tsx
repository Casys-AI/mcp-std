/**
 * JWT Viewer UI for MCP Apps
 *
 * Interactive JWT token viewer with:
 * - Header section (blue) with algorithm highlight
 * - Payload section (violet) with standard claims explained
 * - Signature section (gray)
 * - Expiration status badges with live countdown
 * - Copy functionality per section
 *
 * @module lib/std/src/ui/jwt-viewer
 */

import { render } from "preact";
import { useState, useEffect, useCallback } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { App } from "@modelcontextprotocol/ext-apps";
import { cx } from "../../components/utils";
import { Button } from "../../components/ui/button";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface JwtData {
  valid: boolean;
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
  isExpired: boolean;
  expiresAt?: string;
  issuedAt?: string;
  error?: string;
}

interface ContentItem {
  type: string;
  text?: string;
}

// Standard JWT claims with explanations and colors
const STANDARD_CLAIMS: Record<string, { label: string; icon: string; color: string }> = {
  iss: { label: "Issuer", icon: "building", color: "blue" },
  sub: { label: "Subject", icon: "user", color: "cyan" },
  aud: { label: "Audience", icon: "users", color: "violet" },
  exp: { label: "Expiration", icon: "clock", color: "red" },
  iat: { label: "Issued At", icon: "calendar", color: "green" },
  nbf: { label: "Not Before", icon: "calendar-check", color: "orange" },
  jti: { label: "JWT ID", icon: "fingerprint", color: "purple" },
};

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "JWT Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatFullDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString(undefined, {
    dateStyle: "full",
    timeStyle: "medium",
  });
}

interface TimeRemaining {
  text: string;
  shortText: string;
  status: "valid" | "expiring" | "expired";
  seconds: number;
  minutes: number;
  hours: number;
  days: number;
}

function getTimeRemaining(expTimestamp: number): TimeRemaining {
  const now = Date.now();
  const expMs = expTimestamp * 1000;
  const diff = expMs - now;

  if (diff < 0) {
    const elapsed = Math.abs(diff);
    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(elapsed / (1000 * 60));
    const hours = Math.floor(elapsed / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    let text: string;
    if (days > 0) {
      text = `Expired ${days}d ${hours % 24}h ago`;
    } else if (hours > 0) {
      text = `Expired ${hours}h ${minutes % 60}m ago`;
    } else if (minutes > 0) {
      text = `Expired ${minutes}m ${seconds % 60}s ago`;
    } else {
      text = `Expired ${seconds}s ago`;
    }

    return {
      text,
      shortText: days > 0 ? `${days}d ago` : hours > 0 ? `${hours}h ago` : `${minutes}m ago`,
      status: "expired",
      seconds: -seconds,
      minutes: -minutes,
      hours: -hours,
      days: -days,
    };
  }

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  const status = hours < 1 ? "expiring" : "valid";

  let text: string;
  let shortText: string;

  if (days > 0) {
    text = `${days}d ${hours % 24}h ${minutes}m remaining`;
    shortText = `${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    text = `${hours}h ${minutes}m ${seconds % 60}s remaining`;
    shortText = `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    text = `${minutes}m ${seconds % 60}s remaining`;
    shortText = `${minutes}m ${seconds % 60}s`;
  } else {
    text = `${seconds}s remaining`;
    shortText = `${seconds}s`;
  }

  return { text, shortText, status, seconds, minutes, hours, days };
}

function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

// ============================================================================
// Icon Component
// ============================================================================

function Icon({ name, className }: { name: string; className?: string }) {
  const icons: Record<string, string> = {
    building: "M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9h.01M9 13h.01M9 17h.01",
    user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
    users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
    clock: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10ZM12 6v6l4 2",
    calendar: "M16 2v4M8 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
    "calendar-check": "M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
    fingerprint: "M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4M14 13.12c0 2.38-.24 4.88-.54 6.88M6 6a8 8 0 0 1 12 0M18 12c0 .87-.05 1.73-.14 2.58M2 12a10 10 0 0 1 18-6M2 16c0 .73.03 1.45.09 2.15M22 16c-.12 1.37-.39 2.67-.81 3.88M12 2C6.477 2 2 6.477 2 12M22 12c0-1.18-.2-2.32-.57-3.38",
    copy: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z",
    check: "M20 6 9 17l-5-5",
    key: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4",
    shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
    lock: "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4",
    "alert-triangle": "M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z",
    "x-circle": "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM15 9l-6 6m0-6l6 6",
  };

  const path = icons[name] || icons.key;

  return (
    <svg
      className={className || "w-4 h-4 shrink-0"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );
}

// ============================================================================
// Live Countdown Component
// ============================================================================

function LiveCountdown({ exp }: { exp: number }) {
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining>(getTimeRemaining(exp));

  useEffect(() => {
    // Update immediately
    setTimeRemaining(getTimeRemaining(exp));

    // Update every second
    const interval = setInterval(() => {
      setTimeRemaining(getTimeRemaining(exp));
    }, 1000);

    return () => clearInterval(interval);
  }, [exp]);

  const { text, status } = timeRemaining;

  const statusColors = {
    valid: "text-green-600 dark:text-green-400",
    expiring: "text-orange-600 dark:text-orange-400",
    expired: "text-red-600 dark:text-red-400",
  };

  return (
    <span className={cx("font-mono text-sm font-medium", statusColors[status])}>
      {text}
    </span>
  );
}

// ============================================================================
// Expiration Badge Component
// ============================================================================

function ExpirationBadge({ exp }: { exp: number }) {
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining>(getTimeRemaining(exp));

  useEffect(() => {
    setTimeRemaining(getTimeRemaining(exp));
    const interval = setInterval(() => {
      setTimeRemaining(getTimeRemaining(exp));
    }, 1000);
    return () => clearInterval(interval);
  }, [exp]);

  const { status } = timeRemaining;

  const statusStyles = {
    valid: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700",
    expiring: "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700",
    expired: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700",
  };

  const icons = {
    valid: "check",
    expiring: "alert-triangle",
    expired: "x-circle",
  };

  const labels = {
    valid: "VALID",
    expiring: "EXPIRING",
    expired: "EXPIRED",
  };

  return (
    <span className={cx(
      "inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-bold uppercase border rounded-md",
      statusStyles[status]
    )}>
      <Icon name={icons[status]} className="w-3.5 h-3.5" />
      {labels[status]}
    </span>
  );
}

// ============================================================================
// Copy Button Component
// ============================================================================

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await copyToClipboard(text);
    setCopied(true);
    notifyModel(`copy${label}`, { section: label });
    setTimeout(() => setCopied(false), 2000);
  }, [text, label]);

  return (
    <Button variant="outline" size="xs" onClick={handleCopy} className="gap-1">
      <Icon name={copied ? "check" : "copy"} className="w-4 h-4" />
      {copied ? "Copied!" : `Copy`}
    </Button>
  );
}

// ============================================================================
// Claim Row Component
// ============================================================================

function ClaimRow({
  claimKey,
  value,
  isLast,
}: {
  claimKey: string;
  value: unknown;
  isLast: boolean;
}) {
  const standardClaim = STANDARD_CLAIMS[claimKey];
  const formattedValue = formatJsonValue(value);

  const claimColorStyles: Record<string, string> = {
    blue: "text-blue-600 dark:text-blue-400",
    cyan: "text-cyan-600 dark:text-cyan-400",
    violet: "text-violet-600 dark:text-violet-400",
    red: "text-red-600 dark:text-red-400",
    green: "text-green-600 dark:text-green-400",
    orange: "text-orange-600 dark:text-orange-400",
    purple: "text-purple-600 dark:text-purple-400",
  };

  const keyStyle = standardClaim
    ? claimColorStyles[standardClaim.color]
    : "text-fg-default";

  return (
    <div className="flex items-start gap-2 py-1">
      {standardClaim && (
        <span className={cx("mt-0.5 shrink-0", keyStyle)}>
          <Icon name={standardClaim.icon} className="w-4 h-4" />
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline flex-wrap gap-1">
          <span className={cx(standardClaim ? "font-bold" : "font-medium", keyStyle)}>
            "{claimKey}"
          </span>
          <span className="text-fg-muted">:</span>
          <span className={getValueColorClass(value)} style={{ wordBreak: "break-word" }}>
            {formattedValue}
          </span>
          {!isLast && <span className="text-fg-muted">,</span>}
        </div>
        {standardClaim && (
          <div className="text-xs text-fg-muted italic">
            {standardClaim.label}
            {["exp", "iat", "nbf"].includes(claimKey) && typeof value === "number" && (
              <> - {formatDate(value)}</>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// JSON Display Component
// ============================================================================

function JsonDisplay({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data);

  return (
    <div className="font-mono text-sm leading-relaxed">
      <div className="text-fg-muted">{"{"}</div>
      <div className="pl-4">
        {entries.map(([key, value], index) => (
          <ClaimRow
            key={key}
            claimKey={key}
            value={value}
            isLast={index === entries.length - 1}
          />
        ))}
      </div>
      <div className="text-fg-muted">{"}"}</div>
    </div>
  );
}

function formatJsonValue(value: unknown): string {
  if (typeof value === "string") {
    return `"${value}"`;
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "boolean") {
    return String(value);
  }
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function getValueColorClass(value: unknown): string {
  if (typeof value === "string") return "text-green-600 dark:text-green-400";
  if (typeof value === "number") return "text-blue-600 dark:text-blue-400";
  if (typeof value === "boolean") return "text-purple-600 dark:text-purple-400";
  if (value === null) return "text-gray-500";
  return "text-fg-default";
}

// ============================================================================
// Section Card Component
// ============================================================================

function SectionCard({
  title,
  color,
  icon,
  children,
  copyText,
  copyLabel,
  badge,
  countdown,
}: {
  title: string;
  color: "blue" | "violet" | "gray";
  icon: string;
  children: ComponentChildren;
  copyText: string;
  copyLabel: string;
  badge?: ComponentChildren;
  countdown?: ComponentChildren;
}) {
  const colorStyles = {
    blue: {
      border: "border-blue-200 dark:border-blue-800",
      header: "bg-blue-50 dark:bg-blue-950/50",
      title: "text-blue-700 dark:text-blue-300",
    },
    violet: {
      border: "border-purple-200 dark:border-purple-800",
      header: "bg-purple-50 dark:bg-purple-950/50",
      title: "text-purple-700 dark:text-purple-300",
    },
    gray: {
      border: "border-gray-200 dark:border-gray-700",
      header: "bg-gray-50 dark:bg-gray-900/50",
      title: "text-gray-700 dark:text-gray-300",
    },
  };

  const style = colorStyles[color];

  return (
    <div className={cx("border rounded-lg overflow-hidden bg-bg-canvas", style.border)}>
      {/* Header */}
      <div className={cx(
        "flex items-center justify-between flex-wrap gap-2 px-4 py-3 border-b border-inherit",
        style.header
      )}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={style.title}>
            <Icon name={icon} className="w-4 h-4" />
          </span>
          <span className={cx("text-sm font-semibold", style.title)}>
            {title}
          </span>
          {badge}
        </div>
        <CopyButton text={copyText} label={copyLabel} />
      </div>

      {/* Countdown bar (for payload with exp) */}
      {countdown && (
        <div className="flex items-center gap-2 px-4 py-2 bg-bg-subtle border-b border-inherit">
          <Icon name="clock" className="w-4 h-4 text-fg-muted" />
          {countdown}
        </div>
      )}

      {/* Content */}
      <div className="p-4 overflow-x-auto">
        {children}
      </div>
    </div>
  );
}

// ============================================================================
// Error Display Component
// ============================================================================

function ErrorDisplay({ error }: { error: string }) {
  return (
    <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-red-800 dark:text-red-300">
      <Icon name="x-circle" className="w-5 h-5 shrink-0 mt-0.5" />
      <div>
        <div className="font-semibold mb-1">Invalid JWT Token</div>
        <div className="text-sm">{error}</div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function JwtViewer() {
  const [data, setData] = useState<JwtData | null>(null);
  const [loading, setLoading] = useState(true);
  const [parseError, setParseError] = useState<string | null>(null);

  // Connect to MCP host
  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
      console.log("[jwt-viewer] Connected to MCP host");
    }).catch(() => {
      console.log("[jwt-viewer] No MCP host (standalone mode)");
    });

    app.ontoolresult = (result: { content?: ContentItem[] }) => {
      setLoading(false);
      setParseError(null);

      try {
        const textContent = result.content?.find((c) => c.type === "text") as ContentItem | undefined;
        if (!textContent?.text) {
          setData(null);
          return;
        }
        const parsed = JSON.parse(textContent.text);
        setData(parsed);
      } catch (e) {
        setParseError(`Failed to parse JWT data: ${e instanceof Error ? e.message : "Unknown error"}`);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // Render states
  if (loading) {
    return (
      <div className="flex flex-col gap-4 p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-[200px]">
        <div className="flex items-center justify-center p-10 text-fg-muted">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-border-default border-t-blue-500 rounded-full animate-spin" />
            Loading JWT...
          </div>
        </div>
      </div>
    );
  }

  if (parseError) {
    return (
      <div className="flex flex-col gap-4 p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-[200px]">
        <ErrorDisplay error={parseError} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-4 p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-[200px]">
        <div className="p-10 text-center text-fg-muted">No JWT data received</div>
      </div>
    );
  }

  // Handle invalid JWT from the tool
  if (!data.valid && data.error) {
    return (
      <div className="flex flex-col gap-4 p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-[200px]">
        <ErrorDisplay error={data.error} />
      </div>
    );
  }

  const hasExp = typeof data.payload?.exp === "number";
  const expTimestamp = data.payload?.exp as number;

  return (
    <div className="flex flex-col gap-4 p-4 font-sans text-sm text-fg-default bg-bg-canvas min-h-[200px]">
      {/* Header Section */}
      <SectionCard
        title="Header"
        color="blue"
        icon="key"
        copyText={JSON.stringify(data.header, null, 2)}
        copyLabel="Header"
      >
        <JsonDisplay data={data.header} />
      </SectionCard>

      {/* Payload Section */}
      <SectionCard
        title="Payload"
        color="violet"
        icon="shield"
        copyText={JSON.stringify(data.payload, null, 2)}
        copyLabel="Payload"
        badge={hasExp ? <ExpirationBadge exp={expTimestamp} /> : undefined}
        countdown={hasExp ? <LiveCountdown exp={expTimestamp} /> : undefined}
      >
        <JsonDisplay data={data.payload} />

        {/* Time details */}
        {(data.expiresAt || data.issuedAt) && (
          <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-border-subtle text-xs text-fg-muted">
            {data.issuedAt && (
              <div className="flex items-center gap-2">
                <Icon name="calendar" className="w-4 h-4" />
                <span>Issued: {formatFullDate(data.issuedAt)}</span>
              </div>
            )}
            {data.expiresAt && (
              <div className="flex items-center gap-2">
                <Icon name="clock" className="w-4 h-4" />
                <span>Expires: {formatFullDate(data.expiresAt)}</span>
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* Signature Section */}
      <SectionCard
        title="Signature"
        color="gray"
        icon="lock"
        copyText={data.signature}
        copyLabel="Signature"
      >
        <div className="font-mono text-sm">
          <code className="block break-all text-fg-muted mb-3 p-3 bg-bg-subtle rounded-md border border-border-subtle">
            {data.signature}
          </code>
          <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-md text-xs text-yellow-800 dark:text-yellow-300">
            <Icon name="alert-triangle" className="w-4 h-4 shrink-0" />
            <span>Signature verification requires the secret key. This view is for inspection only.</span>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

// ============================================================================
// Mount
// ============================================================================

render(<JwtViewer />, document.getElementById("app")!);
