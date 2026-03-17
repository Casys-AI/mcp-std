/**
 * Log Viewer UI - Advanced filterable log display
 *
 * Features:
 * - Level filtering with counters (debug, info, warn, error)
 * - Real-time text search with highlighting
 * - Timestamp display
 * - Auto-scroll toggle
 * - Export/copy filtered logs
 * - Keyboard shortcuts
 *
 * @module lib/std/src/ui/log-viewer
 */

import { render } from "preact";
import { useState, useEffect, useRef, useMemo, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { cx } from "../../components/utils";
import { Button } from "../../components/ui/button";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface LogEntry {
  timestamp?: string;
  level?: "debug" | "info" | "warn" | "error";
  message: string;
  source?: string;
}

interface LogData {
  logs: LogEntry[] | string[];
  title?: string;
  maxLines?: number;
}

type LogLevel = "debug" | "info" | "warn" | "error";

interface LevelCounts {
  debug: number;
  info: number;
  warn: number;
  error: number;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Log Viewer", version: "1.0.0" });
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

function parseLogLine(line: string | LogEntry): LogEntry {
  if (typeof line !== "string") return line;

  // Try to parse common log formats
  // Format: [TIMESTAMP] [LEVEL] MESSAGE
  const bracketMatch = line.match(/^\[([^\]]+)\]\s*\[(\w+)\]\s*(.+)$/);
  if (bracketMatch) {
    return {
      timestamp: bracketMatch[1],
      level: bracketMatch[2].toLowerCase() as LogLevel,
      message: bracketMatch[3],
    };
  }

  // Format: TIMESTAMP LEVEL MESSAGE
  const spaceMatch = line.match(/^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[^\s]*)\s+(\w+)\s+(.+)$/);
  if (spaceMatch) {
    return {
      timestamp: spaceMatch[1],
      level: spaceMatch[2].toLowerCase() as LogLevel,
      message: spaceMatch[3],
    };
  }

  // Detect level from keywords
  const lowerLine = line.toLowerCase();
  let level: LogLevel = "info";
  if (lowerLine.includes("error") || lowerLine.includes("err")) level = "error";
  else if (lowerLine.includes("warn")) level = "warn";
  else if (lowerLine.includes("debug")) level = "debug";

  return { message: line, level };
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ============================================================================
// Components
// ============================================================================

/** Highlights search matches in text */
function HighlightedText({ text, search }: { text: string; search: string }) {
  if (!search) {
    return <>{text}</>;
  }

  const regex = new RegExp(`(${escapeRegExp(search)})`, "gi");
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark
            key={i}
            className="bg-yellow-300 dark:bg-yellow-700 text-yellow-900 dark:text-yellow-100 px-0.5 rounded-sm font-medium"
          >
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

const levelColors: Record<LogLevel, { text: string; bg: string }> = {
  debug: { text: "text-gray-600 dark:text-gray-400", bg: "bg-gray-50 dark:bg-gray-950/50" },
  info: { text: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/50" },
  warn: { text: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-50/50 dark:bg-yellow-950/30" },
  error: { text: "text-red-600 dark:text-red-400", bg: "bg-red-50/50 dark:bg-red-950/30" },
};

function LogLine({
  entry,
  index,
  searchTerm,
  originalIndex,
}: {
  entry: LogEntry;
  index: number;
  searchTerm: string;
  originalIndex: number;
}) {
  const level = entry.level || "info";
  const levelStyle = levelColors[level];
  const hasMatch = searchTerm && entry.message.toLowerCase().includes(searchTerm.toLowerCase());

  return (
    <div
      className={cx(
        "flex items-start py-0.5 px-2 border-b border-border-subtle cursor-pointer",
        "hover:bg-bg-subtle",
        hasMatch
          ? "bg-yellow-50 dark:bg-yellow-950/50"
          : level === "error" || level === "warn"
            ? levelStyle.bg
            : ""
      )}
      onClick={() => notifyModel("selectLine", { index: originalIndex, entry })}
    >
      <span className="w-8 text-fg-muted text-right pr-2 select-none shrink-0">
        {originalIndex + 1}
      </span>
      {entry.timestamp && (
        <span className="text-fg-muted mr-2 shrink-0">
          {entry.timestamp}
        </span>
      )}
      <span className={cx("mr-2 font-medium shrink-0 w-12", levelStyle.text)}>
        {level.toUpperCase().padEnd(5)}
      </span>
      <span className="whitespace-pre-wrap break-all">
        <HighlightedText text={entry.message} search={searchTerm} />
      </span>
    </div>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cx("animate-spin h-5 w-5", className)}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function LogViewer() {
  const [data, setData] = useState<LogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [levelFilter, setLevelFilter] = useState<Set<LogLevel>>(
    new Set(["debug", "info", "warn", "error"])
  );
  const [autoScroll, setAutoScroll] = useState(true);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    app
      .connect()
      .then(() => {
        appConnected = true;
      })
      .catch(() => {});

    app.ontoolresult = (result: { content?: Array<{ type: string; text?: string }> }) => {
      setLoading(false);
      try {
        const textContent = result.content?.find((c) => c.type === "text");
        if (textContent?.text) {
          const parsed = JSON.parse(textContent.text);
          // Handle string (raw logs), array, or object
          if (typeof parsed === "string") {
            setData({ logs: parsed.split("\n").filter(Boolean) });
          } else if (Array.isArray(parsed)) {
            setData({ logs: parsed });
          } else {
            setData(parsed);
          }
        }
      } catch {
        // Treat as raw text
        const textContent = result.content?.find((c) => c.type === "text");
        if (textContent?.text) {
          setData({ logs: textContent.text.split("\n").filter(Boolean) });
        }
      }
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + F to focus search
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      // Escape to clear search
      if (e.key === "Escape" && searchTerm) {
        setSearchTerm("");
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchTerm]);

  // Auto-scroll effect
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [data, autoScroll]);

  // Parse logs
  const parsedLogs = useMemo(() => {
    if (!data?.logs) return [];
    return data.logs.map(parseLogLine);
  }, [data]);

  // Count logs by level
  const levelCounts = useMemo((): LevelCounts => {
    const counts: LevelCounts = { debug: 0, info: 0, warn: 0, error: 0 };
    for (const log of parsedLogs) {
      const level = log.level || "info";
      counts[level]++;
    }
    return counts;
  }, [parsedLogs]);

  // Filter logs with original indices
  const filteredLogs = useMemo(() => {
    const result: Array<{ entry: LogEntry; originalIndex: number }> = [];
    const searchLower = searchTerm.toLowerCase();

    for (let i = 0; i < parsedLogs.length; i++) {
      const log = parsedLogs[i];
      // Level filter
      if (!levelFilter.has(log.level || "info")) continue;
      // Text filter
      if (searchTerm && !log.message.toLowerCase().includes(searchLower)) continue;
      result.push({ entry: log, originalIndex: i });
    }
    return result;
  }, [parsedLogs, searchTerm, levelFilter]);

  // Count matches in filtered logs
  const matchCount = useMemo(() => {
    if (!searchTerm) return 0;
    return filteredLogs.length;
  }, [filteredLogs, searchTerm]);

  const toggleLevel = useCallback((level: LogLevel) => {
    setLevelFilter((prev) => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      notifyModel("filterLevel", { levels: Array.from(next) });
      return next;
    });
  }, []);

  const handleSearchChange = useCallback((e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    setSearchTerm(value);
    notifyModel("filterText", { text: value });
  }, []);

  const clearSearch = useCallback(() => {
    setSearchTerm("");
    searchInputRef.current?.focus();
  }, []);

  const handleExport = useCallback(async () => {
    const exportText = filteredLogs
      .map(({ entry }) => {
        const parts: string[] = [];
        if (entry.timestamp) parts.push(`[${entry.timestamp}]`);
        parts.push(`[${(entry.level || "info").toUpperCase()}]`);
        parts.push(entry.message);
        return parts.join(" ");
      })
      .join("\n");

    try {
      await navigator.clipboard.writeText(exportText);
      setCopyStatus("copied");
      notifyModel("exportLogs", { count: filteredLogs.length });
      setTimeout(() => setCopyStatus("idle"), 2000);
    } catch {
      // Fallback for browsers without clipboard API
      const textarea = document.createElement("textarea");
      textarea.value = exportText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 2000);
    }
  }, [filteredLogs]);

  const toggleAutoScroll = useCallback(() => {
    setAutoScroll((prev) => {
      const next = !prev;
      notifyModel("toggleAutoScroll", { enabled: next });
      if (next && containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
      return next;
    });
  }, []);

  const showAllLevels = useCallback(() => {
    setLevelFilter(new Set(["debug", "info", "warn", "error"]));
    notifyModel("filterLevel", { levels: ["debug", "info", "warn", "error"] });
  }, []);

  const showOnlyLevel = useCallback((level: LogLevel) => {
    setLevelFilter(new Set([level]));
    notifyModel("filterLevel", { levels: [level] });
  }, []);

  if (loading) {
    return (
      <div className="font-mono text-xs text-fg-default bg-bg-canvas flex flex-col max-h-[400px] border border-border-default rounded-lg overflow-hidden p-4 justify-center items-center">
        <Spinner />
        <div className="mt-2 text-fg-muted">Loading logs...</div>
      </div>
    );
  }

  if (!data?.logs?.length) {
    return (
      <div className="font-mono text-xs text-fg-default bg-bg-canvas flex flex-col max-h-[400px] border border-border-default rounded-lg overflow-hidden p-4 justify-center items-center">
        <div className="text-fg-muted">No logs</div>
      </div>
    );
  }

  const levels: LogLevel[] = ["error", "warn", "info", "debug"];

  return (
    <div className="font-mono text-xs text-fg-default bg-bg-canvas flex flex-col max-h-[400px] border border-border-default rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center p-2 bg-bg-subtle border-b border-border-default w-full flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {data.title && (
            <h3 className="text-sm font-semibold font-sans m-0">
              {data.title}
            </h3>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Search input with clear button */}
          <div className="flex items-center bg-bg-canvas border border-border-default rounded-md px-2 gap-1 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200">
            <span className="text-fg-muted text-sm shrink-0">&#128269;</span>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search... (Ctrl+F)"
              value={searchTerm}
              onChange={handleSearchChange}
              className="border-none bg-transparent py-1 text-xs w-[140px] focus:outline-none placeholder:text-fg-muted"
            />
            {searchTerm && (
              <button
                onClick={clearSearch}
                title="Clear search (Esc)"
                className="p-0.5 text-fg-muted hover:text-fg-default"
              >
                x
              </button>
            )}
          </div>

          {/* Auto-scroll toggle */}
          <button
            onClick={toggleAutoScroll}
            title={autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
            className={cx(
              "p-1.5 rounded border text-sm",
              autoScroll
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-transparent text-fg-default border-border-default hover:bg-bg-subtle"
            )}
          >
            {autoScroll ? "\u2193" : "\u2016"}
          </button>

          {/* Export button */}
          <button
            onClick={handleExport}
            title="Copy filtered logs to clipboard"
            className={cx(
              "p-1.5 rounded border text-sm",
              copyStatus === "copied"
                ? "bg-green-100 dark:bg-green-900 border-green-400 dark:border-green-600 text-green-700 dark:text-green-300"
                : "bg-transparent text-fg-default border-border-default hover:bg-bg-subtle"
            )}
          >
            {copyStatus === "copied" ? "\u2713" : "\u2398"}
          </button>
        </div>
      </div>

      {/* Level filters with counts */}
      <div className="flex gap-1 px-2 py-1.5 bg-bg-canvas border-b border-border-subtle flex-wrap w-full">
        <Button variant="ghost" size="xs" onClick={showAllLevels} title="Show all levels">
          All
        </Button>
        {levels.map((level) => {
          const levelStyle = levelColors[level];
          return (
            <button
              key={level}
              onClick={() => toggleLevel(level)}
              onDblClick={() => showOnlyLevel(level)}
              title={`Toggle ${level} (double-click to show only)`}
              className={cx(
                "flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-all",
                levelFilter.has(level) ? "opacity-100 font-medium" : "opacity-50 font-normal",
                "hover:opacity-80",
                levelStyle.text
              )}
            >
              <span className="uppercase tracking-wide">
                {level.toUpperCase()}
              </span>
              <span className="px-1.5 py-0.5 text-[10px] bg-bg-subtle text-fg-muted rounded-full border border-border-subtle">
                {levelCounts[level]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Stats bar */}
      <div className="flex justify-between items-center px-2 py-1 text-xs text-fg-muted bg-bg-subtle border-b border-border-subtle w-full">
        <span>
          {filteredLogs.length} / {parsedLogs.length} lines
        </span>
        {searchTerm && (
          <span className="text-yellow-700 dark:text-yellow-400 font-medium">
            {matchCount} match{matchCount !== 1 ? "es" : ""} for "{searchTerm}"
          </span>
        )}
      </div>

      {/* Log content */}
      <div className="flex-1 overflow-y-auto overflow-x-auto w-full" ref={containerRef}>
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col gap-2 p-4 text-fg-muted text-center items-center">
            <span>No logs match the current filters</span>
            {searchTerm && (
              <Button variant="ghost" size="sm" onClick={clearSearch}>
                Clear search
              </Button>
            )}
          </div>
        ) : (
          filteredLogs.map(({ entry, originalIndex }, i) => (
            <LogLine
              key={originalIndex}
              entry={entry}
              index={i}
              originalIndex={originalIndex}
              searchTerm={searchTerm}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Mount
// ============================================================================

render(<LogViewer />, document.getElementById("app")!);
