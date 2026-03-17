/**
 * Headers Viewer UI for MCP Apps
 *
 * Interactive HTTP headers viewer using Preact + Tailwind CSS.
 * Displays headers grouped by category with explanations and tooltips.
 *
 * @module lib/std/src/ui/headers-viewer
 */

import { render } from "preact";
import { useState, useEffect, useMemo, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { cx } from "../../components/utils";
import { Button } from "../../components/ui/button";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface HeadersData {
  url?: string;
  status?: number;
  headers: Record<string, string>;
  type?: "request" | "response";
}

interface ContentItem {
  type: string;
  text?: string;
}

interface HeaderEntry {
  name: string;
  value: string;
  category: HeaderCategory;
  info?: string;
  badge?: { text: string; color: BadgeColor };
}

type HeaderCategory = "security" | "caching" | "content" | "auth" | "cors" | "other";
type BadgeColor = "green" | "orange" | "red" | "blue" | "gray";

// ============================================================================
// Header Metadata
// ============================================================================

const HEADER_INFO: Record<string, string> = {
  // Content headers
  "content-type": "MIME type of the response body (e.g., text/html, application/json)",
  "content-length": "Size of the response body in bytes",
  "content-encoding": "Compression algorithm used (e.g., gzip, br, deflate)",
  "content-language": "Natural language of the intended audience",
  "content-disposition": "How the content should be displayed (inline or attachment)",
  "content-range": "Indicates which part of a document is being sent",
  "transfer-encoding": "Encoding used to transfer the payload body",
  "accept": "Media types acceptable for the response",
  "accept-encoding": "Encoding algorithms the client accepts",
  "accept-language": "Natural languages the client prefers",

  // Caching headers
  "cache-control": "Caching directives for both requests and responses",
  "etag": "Unique identifier for a specific version of a resource",
  "expires": "Date/time after which the response is considered stale",
  "last-modified": "Date when the resource was last modified",
  "if-modified-since": "Makes request conditional based on modification date",
  "if-none-match": "Makes request conditional based on ETag",
  "age": "Time in seconds the object has been in a proxy cache",
  "vary": "Determines how to match future requests to cached responses",
  "pragma": "Legacy HTTP/1.0 caching directive (use Cache-Control instead)",

  // Security headers
  "strict-transport-security": "Force HTTPS connections (HSTS) - prevents downgrade attacks",
  "content-security-policy": "XSS and injection protection - controls allowed resource sources",
  "x-content-type-options": "Prevents MIME type sniffing (use nosniff)",
  "x-frame-options": "Clickjacking protection - controls iframe embedding",
  "x-xss-protection": "Legacy XSS filter (deprecated, use CSP instead)",
  "referrer-policy": "Controls how much referrer info is sent with requests",
  "permissions-policy": "Controls which browser features can be used",
  "cross-origin-opener-policy": "Isolates browsing context for security",
  "cross-origin-embedder-policy": "Controls cross-origin resource embedding",
  "cross-origin-resource-policy": "Controls who can load the resource",

  // CORS headers
  "access-control-allow-origin": "Specifies which origins can access the resource",
  "access-control-allow-methods": "HTTP methods allowed for cross-origin requests",
  "access-control-allow-headers": "Headers allowed in cross-origin requests",
  "access-control-allow-credentials": "Whether credentials can be exposed to requesting client",
  "access-control-expose-headers": "Headers that can be exposed to the client",
  "access-control-max-age": "How long preflight results can be cached",
  "origin": "Where the request originated from",

  // Auth headers
  "authorization": "Credentials for authenticating with the server",
  "www-authenticate": "Authentication method to access the resource",
  "proxy-authenticate": "Authentication method for proxy access",
  "proxy-authorization": "Credentials for authenticating with a proxy",
  "set-cookie": "Server sending cookies to the client",
  "cookie": "Cookies previously sent by the server",

  // Connection headers
  "connection": "Control options for the current connection",
  "keep-alive": "Parameters for persistent connections",
  "upgrade": "Request to switch to a different protocol",

  // Request context
  "host": "Domain name and port of the server",
  "user-agent": "Client application information",
  "referer": "URL of the previous page (note: intentionally misspelled)",
  "server": "Server software information",
  "date": "Date and time the message was sent",
  "x-request-id": "Unique identifier for request tracing",
  "x-correlation-id": "ID for correlating related requests",

  // Rate limiting
  "retry-after": "How long to wait before making a new request",
  "x-ratelimit-limit": "Maximum number of requests allowed",
  "x-ratelimit-remaining": "Remaining requests in the current window",
  "x-ratelimit-reset": "When the rate limit resets",

  // Miscellaneous
  "location": "URL for redirects or newly created resources",
  "link": "Relationship to other resources",
  "x-powered-by": "Technology stack information (often hidden for security)",
  "x-robots-tag": "Indexing directives for search engines",
};

const CATEGORY_PATTERNS: Record<HeaderCategory, RegExp[]> = {
  security: [
    /^strict-transport-security$/i,
    /^content-security-policy/i,
    /^x-content-type-options$/i,
    /^x-frame-options$/i,
    /^x-xss-protection$/i,
    /^referrer-policy$/i,
    /^permissions-policy$/i,
    /^cross-origin-opener-policy$/i,
    /^cross-origin-embedder-policy$/i,
    /^cross-origin-resource-policy$/i,
  ],
  cors: [
    /^access-control-/i,
    /^origin$/i,
  ],
  caching: [
    /^cache-control$/i,
    /^etag$/i,
    /^expires$/i,
    /^last-modified$/i,
    /^if-modified-since$/i,
    /^if-none-match$/i,
    /^age$/i,
    /^vary$/i,
    /^pragma$/i,
  ],
  content: [
    /^content-/i,
    /^accept/i,
    /^transfer-encoding$/i,
  ],
  auth: [
    /^authorization$/i,
    /^www-authenticate$/i,
    /^proxy-auth/i,
    /^set-cookie$/i,
    /^cookie$/i,
  ],
  other: [],
};

const CATEGORY_META: Record<HeaderCategory, { label: string; icon: string; order: number }> = {
  security: { label: "Security", icon: "shield", order: 1 },
  cors: { label: "CORS", icon: "globe", order: 2 },
  auth: { label: "Authentication", icon: "key", order: 3 },
  caching: { label: "Caching", icon: "database", order: 4 },
  content: { label: "Content", icon: "file-text", order: 5 },
  other: { label: "Other", icon: "more-horizontal", order: 6 },
};

// Badge rules for specific header values
function getBadge(name: string, value: string): { text: string; color: BadgeColor } | undefined {
  const lowerName = name.toLowerCase();
  const lowerValue = value.toLowerCase();

  // Cache-Control badges
  if (lowerName === "cache-control") {
    if (lowerValue.includes("no-store") || lowerValue.includes("no-cache")) {
      return { text: "No Cache", color: "orange" };
    }
    if (lowerValue.includes("private")) {
      return { text: "Private", color: "blue" };
    }
    if (lowerValue.includes("public")) {
      return { text: "Public", color: "green" };
    }
    const maxAgeMatch = lowerValue.match(/max-age=(\d+)/);
    if (maxAgeMatch) {
      const seconds = parseInt(maxAgeMatch[1], 10);
      if (seconds === 0) return { text: "Immediate", color: "orange" };
      if (seconds < 3600) return { text: `${Math.round(seconds / 60)}m`, color: "blue" };
      if (seconds < 86400) return { text: `${Math.round(seconds / 3600)}h`, color: "blue" };
      return { text: `${Math.round(seconds / 86400)}d`, color: "green" };
    }
  }

  // CORS badges
  if (lowerName === "access-control-allow-origin") {
    if (value === "*") return { text: "Open", color: "orange" };
    return { text: "Restricted", color: "green" };
  }

  // Security badges
  if (lowerName === "strict-transport-security") {
    return { text: "HSTS", color: "green" };
  }
  if (lowerName === "content-security-policy") {
    return { text: "CSP", color: "green" };
  }
  if (lowerName === "x-frame-options") {
    if (lowerValue === "deny") return { text: "Blocked", color: "green" };
    if (lowerValue === "sameorigin") return { text: "Same Origin", color: "blue" };
    return { text: "Allowed", color: "orange" };
  }
  if (lowerName === "x-content-type-options" && lowerValue === "nosniff") {
    return { text: "Protected", color: "green" };
  }

  // Status-related
  if (lowerName === "retry-after") {
    return { text: "Rate Limited", color: "red" };
  }

  return undefined;
}

function categorizeHeader(name: string): HeaderCategory {
  const lowerName = name.toLowerCase();
  for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    if (category === "other") continue;
    for (const pattern of patterns) {
      if (pattern.test(lowerName)) {
        return category as HeaderCategory;
      }
    }
  }
  return "other";
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Headers Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Icon Components
// ============================================================================

function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const icons: Record<string, string> = {
    shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
    globe: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z",
    key: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4",
    database: "M12 2c4.97 0 9 1.34 9 3s-4.03 3-9 3-9-1.34-9-3 4.03-3 9-3zM3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3",
    "file-text": "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
    "more-horizontal": "M12 12m-1 0a1 1 0 1 0 2 0 1 1 0 1 0-2 0M19 12m-1 0a1 1 0 1 0 2 0 1 1 0 1 0-2 0M5 12m-1 0a1 1 0 1 0 2 0 1 1 0 1 0-2 0",
    "chevron-down": "M6 9l6 6 6-6",
    "chevron-right": "M9 18l6-6-6-6",
    copy: "M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
    check: "M20 6L9 17l-5-5",
    search: "M21 21l-4.35-4.35M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
    info: "M12 16v-4M12 8h.01M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z",
  };

  const path = icons[name] || icons["more-horizontal"];

  return (
    <svg
      width={size}
      height={size}
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
// Components
// ============================================================================

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async (e: MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      notifyModel("copy", { text });
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? "Copied!" : "Copy to clipboard"}
      aria-label={copied ? "Copied to clipboard" : "Copy to clipboard"}
      className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 opacity-50 hover:opacity-100 transition-opacity"
    >
      <Icon name={copied ? "check" : "copy"} size={14} />
    </button>
  );
}

function HeaderBadge({ text, color }: { text: string; color: BadgeColor }) {
  const colorClasses: Record<BadgeColor, string> = {
    green: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    orange: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    red: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    blue: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    gray: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  };
  return (
    <span className={cx("px-2 py-0.5 text-xs font-medium rounded-full", colorClasses[color])}>
      {text}
    </span>
  );
}

function HeaderRow({ entry }: { entry: HeaderEntry }) {
  return (
    <tr className="hover:bg-bg-subtle border-t border-border-default">
      <td className="p-3 align-top w-[35%] min-w-[150px]">
        <div className="flex items-center gap-1.5">
          <code className="font-mono text-sm font-medium text-fg-default break-all">
            {entry.name}
          </code>
          {entry.info && (
            <span className="text-fg-muted cursor-help shrink-0 hover:text-fg-default" title={entry.info}>
              <Icon name="info" size={14} />
            </span>
          )}
        </div>
      </td>
      <td className="p-3 align-top">
        <div className="flex gap-2 items-start">
          <code className="flex-1 font-mono text-sm text-fg-muted break-all whitespace-pre-wrap" title={entry.value}>
            {entry.value}
          </code>
          {entry.badge && <HeaderBadge text={entry.badge.text} color={entry.badge.color} />}
          <CopyButton text={`${entry.name}: ${entry.value}`} />
        </div>
      </td>
    </tr>
  );
}

function CategorySection({
  category,
  entries,
  isExpanded,
  onToggle,
}: {
  category: HeaderCategory;
  entries: HeaderEntry[];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const meta = CATEGORY_META[category];

  return (
    <div className="border border-border-default rounded-lg overflow-hidden">
      <button
        type="button"
        className="flex items-center gap-2 w-full p-3 bg-bg-subtle text-left text-fg-default text-sm font-medium hover:bg-bg-muted"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-controls={`section-${category}`}
      >
        <span className="text-fg-muted shrink-0">
          <Icon name={meta.icon} size={16} />
        </span>
        <span className="flex-1">{meta.label}</span>
        <span className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-xs font-medium">
          {entries.length}
        </span>
        <span className="text-fg-muted shrink-0">
          <Icon name={isExpanded ? "chevron-down" : "chevron-right"} size={16} />
        </span>
      </button>
      {isExpanded && (
        <div id={`section-${category}`}>
          <table className="w-full">
            <thead className="sr-only">
              <tr>
                <th>Header Name</th>
                <th>Header Value</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <HeaderRow key={entry.name} entry={entry} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: number }) {
  let color: BadgeColor = "gray";
  if (status >= 200 && status < 300) color = "green";
  else if (status >= 300 && status < 400) color = "blue";
  else if (status >= 400 && status < 500) color = "orange";
  else if (status >= 500) color = "red";

  return <HeaderBadge text={String(status)} color={color} />;
}

// ============================================================================
// Main Component
// ============================================================================

function HeadersViewer() {
  const [data, setData] = useState<HeadersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<HeaderCategory>>(
    new Set(["security", "cors", "auth", "caching", "content", "other"])
  );

  // Connect to MCP host
  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
      console.log("[headers-viewer] Connected to MCP host");
    }).catch(() => {
      console.log("[headers-viewer] No MCP host (standalone mode)");
    });

    app.ontoolresult = (result: { content?: ContentItem[]; isError?: boolean }) => {
      setLoading(false);
      setError(null);

      try {
        const textContent = result.content?.find((c) => c.type === "text") as ContentItem | undefined;
        if (!textContent?.text) {
          setData(null);
          return;
        }

        const parsed = JSON.parse(textContent.text);
        const normalized = normalizeData(parsed);
        setData(normalized);
      } catch (e) {
        setError(`Failed to parse data: ${e instanceof Error ? e.message : "Unknown error"}`);
      }
    };

    app.ontoolinputpartial = () => {
      setLoading(true);
    };
  }, []);

  // Process headers into categorized entries
  const categorizedHeaders = useMemo(() => {
    if (!data?.headers) return new Map<HeaderCategory, HeaderEntry[]>();

    const categories = new Map<HeaderCategory, HeaderEntry[]>();
    const search = filterText.toLowerCase();

    for (const [name, value] of Object.entries(data.headers)) {
      // Filter
      if (search && !name.toLowerCase().includes(search) && !value.toLowerCase().includes(search)) {
        continue;
      }

      const category = categorizeHeader(name);
      const entry: HeaderEntry = {
        name,
        value,
        category,
        info: HEADER_INFO[name.toLowerCase()],
        badge: getBadge(name, value),
      };

      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category)!.push(entry);
    }

    // Sort categories by order and entries alphabetically
    const sorted = new Map<HeaderCategory, HeaderEntry[]>();
    const categoryOrder = Object.entries(CATEGORY_META)
      .sort(([, a], [, b]) => a.order - b.order)
      .map(([cat]) => cat as HeaderCategory);

    for (const category of categoryOrder) {
      const entries = categories.get(category);
      if (entries && entries.length > 0) {
        entries.sort((a, b) => a.name.localeCompare(b.name));
        sorted.set(category, entries);
      }
    }

    return sorted;
  }, [data?.headers, filterText]);

  const totalHeaders = useMemo(() => {
    let count = 0;
    for (const entries of categorizedHeaders.values()) {
      count += entries.length;
    }
    return count;
  }, [categorizedHeaders]);

  // Handlers
  const handleFilter = useCallback((e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    setFilterText(value);
    if (value) notifyModel("filter", { text: value });
  }, []);

  const toggleSection = useCallback((category: HeaderCategory) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      notifyModel("toggle", { category, expanded: next.has(category) });
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedSections(new Set(["security", "cors", "auth", "caching", "content", "other"]));
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedSections(new Set());
  }, []);

  // Render states
  if (loading) {
    return (
      <div className="p-4 max-w-full overflow-hidden font-sans text-sm text-fg-default bg-bg-canvas">
        <div className="flex items-center justify-center p-10 text-fg-muted">
          Loading headers...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 max-w-full overflow-hidden font-sans text-sm text-fg-default bg-bg-canvas">
        <div className="p-4 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 rounded-md">
          {error}
        </div>
      </div>
    );
  }

  if (!data || Object.keys(data.headers).length === 0) {
    return (
      <div className="p-4 max-w-full overflow-hidden font-sans text-sm text-fg-default bg-bg-canvas">
        <div className="text-center p-10 text-fg-muted">
          No headers to display
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-full overflow-hidden font-sans text-sm text-fg-default bg-bg-canvas">
      {/* Meta info */}
      {(data.url || data.status !== undefined) && (
        <div className="flex items-center gap-2 mb-3 p-3 bg-bg-subtle rounded-lg border border-border-default overflow-hidden">
          {data.type && (
            <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-sm text-xs font-medium uppercase">
              {data.type === "request" ? "Request" : "Response"}
            </span>
          )}
          {data.status !== undefined && <StatusBadge status={data.status} />}
          {data.url && (
            <code className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-fg-muted text-xs font-mono" title={data.url}>
              {data.url}
            </code>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex gap-3 mb-3 items-center flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none z-10">
            <Icon name="search" size={16} />
          </div>
          <input
            type="text"
            placeholder="Filter headers..."
            value={filterText}
            onChange={handleFilter}
            aria-label="Filter headers"
            className="w-full pl-10 pr-3 py-2 text-sm border border-border-default rounded-md bg-bg-canvas text-fg-default placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-1">
          <Button variant="outline" size="xs" onClick={expandAll} title="Expand all sections">
            Expand All
          </Button>
          <Button variant="outline" size="xs" onClick={collapseAll} title="Collapse all sections">
            Collapse All
          </Button>
        </div>
        <span className="text-fg-muted text-xs whitespace-nowrap">
          {totalHeaders} header{totalHeaders !== 1 ? "s" : ""}
          {filterText && ` (filtered from ${Object.keys(data.headers).length})`}
        </span>
      </div>

      {/* Sections */}
      <div className="flex flex-col gap-2">
        {Array.from(categorizedHeaders.entries()).map(([category, entries]) => (
          <CategorySection
            key={category}
            category={category}
            entries={entries}
            isExpanded={expandedSections.has(category)}
            onToggle={() => toggleSection(category)}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function normalizeData(parsed: unknown): HeadersData | null {
  // Direct HeadersData format
  if (parsed && typeof parsed === "object" && "headers" in parsed) {
    const data = parsed as HeadersData;
    return {
      url: data.url,
      status: data.status,
      headers: data.headers || {},
      type: data.type,
    };
  }

  // Plain object of headers
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return {
      headers: parsed as Record<string, string>,
    };
  }

  // Array of [key, value] pairs
  if (Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0])) {
    const headers: Record<string, string> = {};
    for (const [key, value] of parsed) {
      headers[String(key)] = String(value);
    }
    return { headers };
  }

  return null;
}

// ============================================================================
// Mount
// ============================================================================

render(<HeadersViewer />, document.getElementById("app")!);
