/**
 * Environment Variables Viewer UI for MCP Apps
 *
 * Interactive environment variables viewer using Preact + Tailwind CSS.
 * Features:
 * - Sortable table display
 * - Sensitive value masking with reveal toggle
 * - Search/filter functionality
 * - Grouping by prefix (AWS_, NODE_, etc.)
 * - Copy to clipboard
 *
 * @module lib/std/src/ui/env-viewer
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

interface EnvData {
  env: Record<string, string>;
  sensitiveKeys?: string[];
  groupByPrefix?: boolean;
}

interface ContentItem {
  type: string;
  text?: string;
}

interface EnvEntry {
  key: string;
  value: string;
  isSensitive: boolean;
  prefix: string;
}

type SortDirection = "asc" | "desc";
type SortColumn = "key" | "value" | "prefix";

// ============================================================================
// Default Sensitive Patterns
// ============================================================================

const DEFAULT_SENSITIVE_PATTERNS = [
  "PASSWORD", "SECRET", "KEY", "TOKEN", "PRIVATE", "CREDENTIAL",
  "AUTH", "API_KEY", "APIKEY", "ACCESS_KEY", "ACCESSKEY",
];

// ============================================================================
// Prefix Detection
// ============================================================================

const COMMON_PREFIXES = [
  "AWS_", "AZURE_", "GCP_", "GOOGLE_", "NODE_", "NPM_", "PATH", "HOME", "USER",
  "SHELL", "LANG", "LC_", "XDG_", "DENO_", "BUN_", "DOCKER_", "K8S_", "KUBERNETES_",
  "CI_", "GITHUB_", "GITLAB_", "TRAVIS_", "CIRCLE_", "JENKINS_", "DATABASE_", "DB_",
  "REDIS_", "MONGO_", "POSTGRES_", "MYSQL_", "PG_", "SMTP_", "MAIL_", "EMAIL_",
  "S3_", "SQS_", "SNS_", "LOG_", "DEBUG", "VERBOSE", "SSL_", "TLS_", "HTTP_",
  "HTTPS_", "PROXY_", "NO_PROXY", "SSH_", "GPG_", "GIT_", "EDITOR", "VISUAL",
  "TERM", "DISPLAY", "HOSTNAME", "PWD", "OLDPWD", "SHLVL", "TMPDIR", "TEMP", "TMP",
];

function detectPrefix(key: string): string {
  if (["PATH", "HOME", "USER", "SHELL", "TERM", "EDITOR", "VISUAL", "DISPLAY", "HOSTNAME", "PWD", "OLDPWD", "SHLVL", "TMPDIR", "TEMP", "TMP", "DEBUG", "VERBOSE"].includes(key)) {
    return key;
  }
  for (const prefix of COMMON_PREFIXES) {
    if (key.startsWith(prefix)) {
      return prefix.endsWith("_") ? prefix.slice(0, -1) : prefix;
    }
  }
  const underscoreIdx = key.indexOf("_");
  if (underscoreIdx > 1 && underscoreIdx < key.length - 1) {
    return key.slice(0, underscoreIdx);
  }
  return "OTHER";
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Environment Variables Viewer", version: "1.0.0" });
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
    copy: "M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
    check: "M20 6L9 17l-5-5",
    search: "M21 21l-4.35-4.35M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
    eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
    "eye-off": "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22",
    folder: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z",
    "folder-open": "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v1M2 10l.67 9h18.66l.67-9H2z",
    "chevron-down": "M6 9l6 6 6-6",
    "chevron-right": "M9 18l6-6-6-6",
    shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
    lock: "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4",
  };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={icons[name] || icons["folder"]} />
    </svg>
  );
}

// ============================================================================
// Components
// ============================================================================

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async (e: MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      notifyModel("copy", { key: label || text });
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text, label]);

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

function RevealButton({ revealed, onToggle }: { revealed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      title={revealed ? "Hide value" : "Reveal value"}
      aria-label={revealed ? "Hide value" : "Reveal value"}
      className="p-1 rounded text-orange-600 dark:text-orange-400 opacity-70 hover:opacity-100 hover:bg-orange-50 dark:hover:bg-orange-950 transition-opacity"
    >
      <Icon name={revealed ? "eye" : "eye-off"} size={14} />
    </button>
  );
}

function MaskedValue({ value, revealed }: { value: string; revealed: boolean }) {
  if (revealed) {
    return <code className="font-mono text-sm break-all" title={value}>{value}</code>;
  }
  const maskedLength = Math.min(value.length, 20);
  const masked = "*".repeat(maskedLength);

  return (
    <code className="font-mono text-sm italic tracking-wider text-fg-muted" title="Value hidden">
      {masked}
      {value.length > 20 && <span className="ml-1 text-xs not-italic tracking-normal text-fg-muted">({value.length} chars)</span>}
    </code>
  );
}

function SortIndicator({ column, sortColumn, sortDirection }: { column: SortColumn; sortColumn: SortColumn; sortDirection: SortDirection }) {
  if (column !== sortColumn) {
    return <span className="ml-1 opacity-30 text-xs">&#8645;</span>;
  }
  return <span className="ml-1 text-xs">{sortDirection === "asc" ? "\u25B2" : "\u25BC"}</span>;
}

function EnvRow({ entry, revealed, onToggleReveal }: { entry: EnvEntry; revealed: boolean; onToggleReveal: () => void }) {
  return (
    <tr className="hover:bg-bg-subtle border-t border-border-default">
      <td className="p-3 align-top w-[35%] min-w-[180px]">
        <div className="flex items-center gap-1.5">
          <code className="font-mono text-sm font-medium break-all">{entry.key}</code>
          {entry.isSensitive && (
            <span className="text-orange-600 dark:text-orange-400 shrink-0" title="Sensitive value">
              <Icon name="lock" size={12} />
            </span>
          )}
          <CopyButton text={entry.key} label={entry.key} />
        </div>
      </td>
      <td className="p-3 align-top">
        <div className="flex items-start gap-2">
          {entry.isSensitive ? (
            <>
              <MaskedValue value={entry.value} revealed={revealed} />
              <RevealButton revealed={revealed} onToggle={onToggleReveal} />
            </>
          ) : (
            <code className="font-mono text-sm break-all max-w-[400px]" title={entry.value}>
              {entry.value}
            </code>
          )}
          <CopyButton text={entry.value} label={`${entry.key} value`} />
        </div>
      </td>
    </tr>
  );
}

function GroupSection({
  prefix, entries, isExpanded, onToggle, revealedKeys, onToggleReveal,
}: {
  prefix: string;
  entries: EnvEntry[];
  isExpanded: boolean;
  onToggle: () => void;
  revealedKeys: Set<string>;
  onToggleReveal: (key: string) => void;
}) {
  const sensitiveCount = entries.filter((e) => e.isSensitive).length;

  return (
    <div className="border border-border-default rounded-lg overflow-hidden">
      <button
        type="button"
        className="flex items-center gap-2 w-full p-3 bg-bg-subtle text-left text-fg-default text-sm font-medium hover:bg-bg-muted"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-controls={`group-${prefix}`}
      >
        <span className="text-fg-muted shrink-0">
          <Icon name={isExpanded ? "folder-open" : "folder"} size={16} />
        </span>
        <span className="flex-1 font-mono">{prefix}</span>
        <span className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-xs font-medium">
          {entries.length}
        </span>
        {sensitiveCount > 0 && (
          <span className="flex items-center gap-1 px-2 py-0.5 bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200 rounded-full text-xs font-medium" title={`${sensitiveCount} sensitive`}>
            <Icon name="shield" size={12} /> {sensitiveCount}
          </span>
        )}
        <span className="text-fg-muted shrink-0">
          <Icon name={isExpanded ? "chevron-down" : "chevron-right"} size={16} />
        </span>
      </button>
      {isExpanded && (
        <div id={`group-${prefix}`}>
          <table className="w-full text-sm">
            <thead className="sr-only">
              <tr>
                <th>Variable Name</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <EnvRow
                  key={entry.key}
                  entry={entry}
                  revealed={revealedKeys.has(entry.key)}
                  onToggleReveal={() => onToggleReveal(entry.key)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function EnvViewer() {
  const [data, setData] = useState<EnvData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [sortColumn, setSortColumn] = useState<SortColumn>("key");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [groupByPrefix, setGroupByPrefix] = useState(true);

  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
      console.log("[env-viewer] Connected to MCP host");
    }).catch(() => {
      console.log("[env-viewer] No MCP host (standalone mode)");
    });

    app.ontoolresult = (result: { content?: ContentItem[]; isError?: boolean }) => {
      setLoading(false);
      setError(null);
      try {
        const textContent = result.content?.find((c) => c.type === "text") as ContentItem | undefined;
        if (!textContent?.text) { setData(null); return; }
        const parsed = JSON.parse(textContent.text);
        const normalized = normalizeData(parsed);
        setData(normalized);
        if (normalized.groupByPrefix !== undefined) setGroupByPrefix(normalized.groupByPrefix);
        const entries = processEntries(normalized);
        const groups = new Set(entries.map((e) => e.prefix));
        setExpandedGroups(groups);
      } catch (e) {
        setError(`Failed to parse data: ${e instanceof Error ? e.message : "Unknown error"}`);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  const sensitivePatterns = useMemo(() => {
    const custom = data?.sensitiveKeys || [];
    return [...DEFAULT_SENSITIVE_PATTERNS, ...custom];
  }, [data?.sensitiveKeys]);

  const entries = useMemo(() => {
    if (!data?.env) return [];
    return processEntries(data, sensitivePatterns);
  }, [data, sensitivePatterns]);

  const filteredEntries = useMemo(() => {
    if (!filterText) return entries;
    const search = filterText.toLowerCase();
    return entries.filter((e) =>
      e.key.toLowerCase().includes(search) ||
      e.value.toLowerCase().includes(search) ||
      e.prefix.toLowerCase().includes(search)
    );
  }, [entries, filterText]);

  const sortedEntries = useMemo(() => {
    return [...filteredEntries].sort((a, b) => {
      let cmp: number;
      if (sortColumn === "key") cmp = a.key.localeCompare(b.key);
      else if (sortColumn === "value") cmp = a.value.localeCompare(b.value);
      else cmp = a.prefix.localeCompare(b.prefix) || a.key.localeCompare(b.key);
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [filteredEntries, sortColumn, sortDirection]);

  const groupedEntries = useMemo(() => {
    if (!groupByPrefix) return null;
    const groups = new Map<string, EnvEntry[]>();
    for (const entry of sortedEntries) {
      if (!groups.has(entry.prefix)) groups.set(entry.prefix, []);
      groups.get(entry.prefix)!.push(entry);
    }
    return new Map([...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])));
  }, [sortedEntries, groupByPrefix]);

  const stats = useMemo(() => {
    const total = entries.length;
    const sensitive = entries.filter((e) => e.isSensitive).length;
    const filtered = filteredEntries.length;
    return { total, sensitive, filtered };
  }, [entries, filteredEntries]);

  const handleFilter = useCallback((e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    setFilterText(value);
    if (value) notifyModel("filter", { text: value });
  }, []);

  const handleSort = useCallback((column: SortColumn) => {
    if (sortColumn === column) setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortColumn(column); setSortDirection("asc"); }
    notifyModel("sort", { column, direction: sortDirection });
  }, [sortColumn, sortDirection]);

  const toggleReveal = useCallback((key: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); notifyModel("hide", { key }); }
      else { next.add(key); notifyModel("reveal", { key }); }
      return next;
    });
  }, []);

  const toggleGroup = useCallback((prefix: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(prefix)) next.delete(prefix);
      else next.add(prefix);
      return next;
    });
  }, []);

  const revealAll = useCallback(() => {
    const sensitiveKeys = entries.filter((e) => e.isSensitive).map((e) => e.key);
    setRevealedKeys(new Set(sensitiveKeys));
    notifyModel("reveal_all", { count: sensitiveKeys.length });
  }, [entries]);

  const hideAll = useCallback(() => {
    setRevealedKeys(new Set());
    notifyModel("hide_all", {});
  }, []);

  const expandAllGroups = useCallback(() => {
    if (groupedEntries) setExpandedGroups(new Set(groupedEntries.keys()));
  }, [groupedEntries]);

  const collapseAllGroups = useCallback(() => {
    setExpandedGroups(new Set());
  }, []);

  if (loading) {
    return (
      <div className="p-4 max-w-full overflow-hidden font-sans text-sm text-fg-default bg-bg-canvas">
        <div className="flex items-center justify-center p-10 text-fg-muted">Loading environment variables...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 max-w-full overflow-hidden font-sans text-sm text-fg-default bg-bg-canvas">
        <div className="p-4 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 rounded-md">{error}</div>
      </div>
    );
  }

  if (!data || Object.keys(data.env).length === 0) {
    return (
      <div className="p-4 max-w-full overflow-hidden font-sans text-sm text-fg-default bg-bg-canvas">
        <div className="text-center p-10 text-fg-muted">No environment variables to display</div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-full overflow-hidden font-sans text-sm text-fg-default bg-bg-canvas">
      {/* Toolbar */}
      <div className="flex gap-3 mb-3 items-center flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none z-10">
            <Icon name="search" size={16} />
          </div>
          <input
            type="text"
            placeholder="Filter variables..."
            value={filterText}
            onChange={handleFilter}
            aria-label="Filter environment variables"
            className="w-full pl-10 pr-3 py-2 text-sm border border-border-default rounded-md bg-bg-canvas text-fg-default placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={groupByPrefix}
              onChange={(e) => setGroupByPrefix((e.target as HTMLInputElement).checked)}
              className="w-4 h-4 rounded border-gray-300"
            />
            <span className="text-xs text-fg-default select-none">Group by prefix</span>
          </label>
          {groupByPrefix && (
            <>
              <Button variant="outline" size="xs" onClick={expandAllGroups} title="Expand all groups">Expand</Button>
              <Button variant="outline" size="xs" onClick={collapseAllGroups} title="Collapse all groups">Collapse</Button>
            </>
          )}
          <Button variant="outline" size="xs" onClick={revealAll} title="Reveal all sensitive values">Reveal All</Button>
          <Button variant="outline" size="xs" onClick={hideAll} title="Hide all sensitive values">Hide All</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-3 mb-3 items-center text-xs text-fg-muted">
        <span className="whitespace-nowrap">
          {stats.filtered} variable{stats.filtered !== 1 ? "s" : ""}
          {filterText && ` (filtered from ${stats.total})`}
        </span>
        {stats.sensitive > 0 && (
          <span className="flex items-center gap-1 px-2 py-0.5 bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200 rounded-full text-xs font-medium">
            <Icon name="shield" size={12} /> {stats.sensitive} sensitive
          </span>
        )}
      </div>

      {/* Content */}
      {groupByPrefix && groupedEntries ? (
        <div className="flex flex-col gap-2">
          {Array.from(groupedEntries.entries()).map(([prefix, groupEntries]) => (
            <GroupSection
              key={prefix}
              prefix={prefix}
              entries={groupEntries}
              isExpanded={expandedGroups.has(prefix)}
              onToggle={() => toggleGroup(prefix)}
              revealedKeys={revealedKeys}
              onToggleReveal={toggleReveal}
            />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border-default">
          <table className="w-full text-sm">
            <thead className="bg-bg-subtle">
              <tr>
                <th
                  className="p-3 text-left cursor-pointer select-none hover:bg-bg-muted"
                  onClick={() => handleSort("key")}
                >
                  Variable
                  <SortIndicator column="key" sortColumn={sortColumn} sortDirection={sortDirection} />
                </th>
                <th
                  className="p-3 text-left cursor-pointer select-none hover:bg-bg-muted"
                  onClick={() => handleSort("value")}
                >
                  Value
                  <SortIndicator column="value" sortColumn={sortColumn} sortDirection={sortDirection} />
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedEntries.map((entry) => (
                <EnvRow
                  key={entry.key}
                  entry={entry}
                  revealed={revealedKeys.has(entry.key)}
                  onToggleReveal={() => toggleReveal(entry.key)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function normalizeData(parsed: unknown): EnvData {
  if (parsed && typeof parsed === "object" && "env" in parsed) {
    const data = parsed as EnvData;
    return { env: data.env || {}, sensitiveKeys: data.sensitiveKeys, groupByPrefix: data.groupByPrefix };
  }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return { env: parsed as Record<string, string> };
  }
  if (Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0])) {
    const env: Record<string, string> = {};
    for (const [key, value] of parsed) {
      env[String(key)] = String(value);
    }
    return { env };
  }
  return { env: {} };
}

function processEntries(data: EnvData, sensitivePatterns: string[] = DEFAULT_SENSITIVE_PATTERNS): EnvEntry[] {
  const entries: EnvEntry[] = [];
  for (const [key, value] of Object.entries(data.env)) {
    const upperKey = key.toUpperCase();
    const isSensitive = sensitivePatterns.some((pattern) => upperKey.includes(pattern.toUpperCase()));
    const prefix = detectPrefix(key);
    entries.push({ key, value: String(value), isSensitive, prefix });
  }
  return entries;
}

// ============================================================================
// Mount
// ============================================================================

render(<EnvViewer />, document.getElementById("app")!);
