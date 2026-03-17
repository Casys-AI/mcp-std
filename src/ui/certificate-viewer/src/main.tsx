/**
 * Certificate Viewer UI for MCP Apps
 *
 * Interactive SSL/TLS certificate viewer with:
 * - Status badge (VALID, EXPIRING SOON, EXPIRED)
 * - Days remaining display
 * - Subject and issuer details
 * - Validity period with progress bar
 * - Subject Alternative Names (SANs) list
 * - Certificate chain (collapsible)
 *
 * @module lib/std/src/ui/certificate-viewer
 */

import { render } from "preact";
import { useState, useEffect, useCallback } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { App } from "@modelcontextprotocol/ext-apps";
import { cx } from "../../components/utils";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import * as Card from "../../components/ui/card";
import * as Progress from "../../components/ui/progress";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface CertificateData {
  host: string;
  port: number;
  valid: boolean;
  certificate: {
    subject: Record<string, string>;
    issuer: Record<string, string>;
    validFrom: string;
    validTo: string;
    daysRemaining: number;
    serialNumber: string;
    signatureAlgorithm: string;
    sans: string[];
  };
  chain?: Array<{
    subject: string;
    issuer: string;
  }>;
  status: "valid" | "expiring" | "expired";
}

interface ContentItem {
  type: string;
  text?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Certificate Viewer", version: "1.0.0" });
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

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getValidityProgress(validFrom: string, validTo: string): number {
  const from = new Date(validFrom).getTime();
  const to = new Date(validTo).getTime();
  const now = Date.now();

  if (now < from) return 0;
  if (now > to) return 100;

  const total = to - from;
  const elapsed = now - from;
  return Math.round((elapsed / total) * 100);
}

function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

// ============================================================================
// Icon Component
// ============================================================================

function Icon({ name, size = 4 }: { name: string; size?: number }) {
  const icons: Record<string, string> = {
    lock: "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4",
    "lock-open": "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM8 11V7a4 4 0 0 1 8 0",
    shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
    "shield-check": "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4",
    "shield-alert": "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM12 8v4m0 4h.01",
    building: "M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9h.01M9 13h.01M9 17h.01",
    calendar: "M16 2v4M8 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
    clock: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10ZM12 6v6l4 2",
    globe: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10ZM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z",
    link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
    chevronDown: "M6 9l6 6 6-6",
    chevronUp: "M18 15l-6-6-6 6",
    copy: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z",
    check: "M20 6 9 17l-5-5",
    alertTriangle: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4m0 4h.01",
  };

  const path = icons[name] || icons.shield;

  return (
    <svg
      width={size * 4}
      height={size * 4}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d={path} />
    </svg>
  );
}

// ============================================================================
// Status Badge Component
// ============================================================================

function StatusBadge({ status, daysRemaining }: { status: string; daysRemaining: number }) {
  const config = {
    valid: {
      bgClass: "bg-green-100 dark:bg-green-900/30",
      colorClass: "text-green-800 dark:text-green-300",
      icon: "shield-check",
      label: "VALID",
    },
    expiring: {
      bgClass: "bg-orange-100 dark:bg-orange-900/30",
      colorClass: "text-orange-800 dark:text-orange-300",
      icon: "shield-alert",
      label: "EXPIRING SOON",
    },
    expired: {
      bgClass: "bg-red-100 dark:bg-red-900/30",
      colorClass: "text-red-800 dark:text-red-300",
      icon: "lock-open",
      label: "EXPIRED",
    },
  };

  const cfg = config[status as keyof typeof config] || config.valid;

  const daysText = daysRemaining >= 0
    ? `${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} remaining`
    : `${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) !== 1 ? "s" : ""} ago`;

  return (
    <div className={cx("p-4 rounded-xl mb-4", cfg.bgClass)}>
      <div className="flex items-center gap-3">
        <div className={cfg.colorClass}>
          <Icon name={cfg.icon} size={8} />
        </div>
        <div>
          <div className={cx("text-lg font-bold uppercase tracking-wide", cfg.colorClass)}>
            {cfg.label}
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {daysText}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Info Card Component
// ============================================================================

function InfoCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: ComponentChildren;
}) {
  return (
    <Card.Root>
      <Card.Header className="p-3 bg-gray-100 dark:bg-gray-800">
        <div className="flex items-center gap-2">
          <div className="text-gray-500 dark:text-gray-400">
            <Icon name={icon} />
          </div>
          <Card.Title className="text-sm">{title}</Card.Title>
        </div>
      </Card.Header>
      <Card.Body className="p-4">{children}</Card.Body>
    </Card.Root>
  );
}

// ============================================================================
// Key-Value Row Component
// ============================================================================

function KeyValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-2 py-1">
      <div className="text-gray-500 dark:text-gray-400 text-sm shrink-0">{label}</div>
      <div className="text-gray-900 dark:text-gray-100 text-sm font-medium text-right break-words">
        {value || "-"}
      </div>
    </div>
  );
}

// ============================================================================
// Progress Bar Component
// ============================================================================

function ValidityProgressBar({ progress, status }: { progress: number; status: string }) {
  const colorMap = {
    valid: "green",
    expiring: "orange",
    expired: "red",
  } as const;

  const colorPalette = colorMap[status as keyof typeof colorMap] || "green";

  return (
    <div className="mb-2">
      <Progress.Root value={progress} colorPalette={colorPalette}>
        <Progress.Track>
          <Progress.Range />
        </Progress.Track>
      </Progress.Root>
      <div className="flex justify-end mt-1">
        <div className="text-xs text-gray-500 dark:text-gray-400">{progress}% elapsed</div>
      </div>
    </div>
  );
}

// ============================================================================
// SANs List Component
// ============================================================================

function SansList({ sans }: { sans: string[] }) {
  if (!sans || sans.length === 0) {
    return <div className="text-gray-500 dark:text-gray-400 italic">None</div>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {sans.map((san) => (
        <Badge
          key={san}
          size="sm"
          variant="outline"
          colorPalette="blue"
          className="font-mono"
        >
          {san}
        </Badge>
      ))}
    </div>
  );
}

// ============================================================================
// Certificate Chain Component
// ============================================================================

function CertificateChain({
  chain,
}: {
  chain: Array<{ subject: string; issuer: string }>;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!chain || chain.length === 0) {
    return null;
  }

  return (
    <InfoCard title="Certificate Chain" icon="link">
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setExpanded(!expanded);
          notifyModel("toggleChain", { expanded: !expanded });
        }}
        className="w-full justify-start"
      >
        <Icon name={expanded ? "chevronUp" : "chevronDown"} />
        <span>
          {chain.length} certificate{chain.length !== 1 ? "s" : ""} in chain
        </span>
      </Button>

      {expanded && (
        <div className="flex flex-col gap-2 mt-3">
          {chain.map((cert, index) => (
            <div
              key={index}
              className="p-3 bg-gray-100 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 relative"
            >
              <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                {index + 1}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Subject</div>
              <div className="text-sm font-mono text-gray-900 dark:text-gray-100 break-all mb-2">
                {cert.subject}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Issuer</div>
              <div className="text-sm font-mono text-gray-500 dark:text-gray-400 break-all">
                {cert.issuer}
              </div>
            </div>
          ))}
        </div>
      )}
    </InfoCard>
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
    notifyModel("copy", { section: label });
    setTimeout(() => setCopied(false), 2000);
  }, [text, label]);

  return (
    <Button variant="outline" size="xs" onClick={handleCopy}>
      <Icon name={copied ? "check" : "copy"} />
      {copied ? "Copied!" : label}
    </Button>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function CertificateViewer() {
  const [data, setData] = useState<CertificateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Connect to MCP host
  useEffect(() => {
    app
      .connect()
      .then(() => {
        appConnected = true;
        console.log("[certificate-viewer] Connected to MCP host");
      })
      .catch(() => {
        console.log("[certificate-viewer] No MCP host (standalone mode)");
      });

    app.ontoolresult = (result: { content?: ContentItem[] }) => {
      setLoading(false);
      setError(null);

      try {
        const textContent = result.content?.find((c) => c.type === "text") as
          | ContentItem
          | undefined;
        if (!textContent?.text) {
          setData(null);
          return;
        }
        const parsed = JSON.parse(textContent.text);
        setData(parsed);
      } catch (e) {
        setError(
          `Failed to parse certificate data: ${e instanceof Error ? e.message : "Unknown error"}`
        );
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // Render states
  if (loading) {
    return (
      <div className="p-4 font-sans text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 min-h-[200px]">
        <div className="p-10 text-center text-gray-500 dark:text-gray-400">Loading certificate...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 font-sans text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 min-h-[200px]">
        <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 rounded-md">
          <Icon name="alertTriangle" />
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 font-sans text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 min-h-[200px]">
        <div className="p-10 text-center text-gray-500 dark:text-gray-400">No certificate data</div>
      </div>
    );
  }

  const cert = data.certificate;
  const progress = getValidityProgress(cert.validFrom, cert.validTo);

  // Format subject display
  const subjectDisplay = cert.subject.CN || Object.values(cert.subject)[0] || "Unknown";
  const orgDisplay = cert.subject.O || cert.subject.OU || "";

  // Format issuer display
  const issuerDisplay = cert.issuer.CN || cert.issuer.O || "Unknown";
  const issuerOrgDisplay = cert.issuer.O || "";

  return (
    <div className="p-4 font-sans text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 min-h-[200px]">
      {/* Header with host info */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon name="lock" />
          <div className="font-mono font-medium">
            {data.host}:{data.port}
          </div>
        </div>
        <CopyButton text={JSON.stringify(data, null, 2)} label="Copy All" />
      </div>

      {/* Status Badge */}
      <StatusBadge status={data.status} daysRemaining={cert.daysRemaining} />

      {/* Main Grid */}
      <div className="grid gap-4">
        {/* Subject Section */}
        <InfoCard title="Subject" icon="shield">
          <div className="mb-2">
            <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {subjectDisplay}
            </div>
            {orgDisplay && (
              <div className="text-sm text-gray-500 dark:text-gray-400">{orgDisplay}</div>
            )}
          </div>
          <div className="border-t border-gray-100 dark:border-gray-800 pt-2">
            {Object.entries(cert.subject).map(([key, value]) => (
              <KeyValueRow key={key} label={key} value={value} />
            ))}
          </div>
        </InfoCard>

        {/* Issuer Section */}
        <InfoCard title="Issuer" icon="building">
          <div className="mb-2">
            <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {issuerDisplay}
            </div>
            {issuerOrgDisplay && issuerOrgDisplay !== issuerDisplay && (
              <div className="text-sm text-gray-500 dark:text-gray-400">{issuerOrgDisplay}</div>
            )}
          </div>
          <div className="border-t border-gray-100 dark:border-gray-800 pt-2">
            {Object.entries(cert.issuer).map(([key, value]) => (
              <KeyValueRow key={key} label={key} value={value} />
            ))}
          </div>
        </InfoCard>

        {/* Validity Section */}
        <InfoCard title="Validity Period" icon="calendar">
          <div className="flex justify-between items-center mb-3">
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">From</div>
              <div className="text-sm font-medium">
                {formatDate(cert.validFrom)}
              </div>
            </div>
            <div className="text-gray-500 dark:text-gray-400">-&gt;</div>
            <div className="text-right">
              <div className="text-xs text-gray-500 dark:text-gray-400">To</div>
              <div className="text-sm font-medium">
                {formatDate(cert.validTo)}
              </div>
            </div>
          </div>
          <ValidityProgressBar progress={progress} status={data.status} />
        </InfoCard>

        {/* SANs Section */}
        <InfoCard title="Subject Alternative Names (SANs)" icon="globe">
          <SansList sans={cert.sans} />
        </InfoCard>

        {/* Technical Details */}
        <InfoCard title="Technical Details" icon="clock">
          <KeyValueRow label="Serial Number" value={cert.serialNumber} />
          <KeyValueRow label="Signature Algorithm" value={cert.signatureAlgorithm} />
        </InfoCard>

        {/* Certificate Chain */}
        {data.chain && <CertificateChain chain={data.chain} />}
      </div>
    </div>
  );
}

// ============================================================================
// Mount
// ============================================================================

render(<CertificateViewer />, document.getElementById("app")!);
