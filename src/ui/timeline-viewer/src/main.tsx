/**
 * Timeline Viewer UI - Temporal event display
 *
 * Displays events on a vertical timeline with:
 * - Colored nodes by type (info, warning, error, success)
 * - Date grouping (Today, Yesterday, Older)
 * - Type filtering
 * - Text search in titles/descriptions
 * - Auto-scroll to most recent
 * - Expand/collapse for long descriptions
 *
 * @module lib/std/src/ui/timeline-viewer
 */

import { render } from "preact";
import { useState, useEffect, useRef, useMemo, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { cx } from "../../components/utils";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { IconButton } from "../../components/ui/icon-button";
import { Badge } from "../../components/ui/badge";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface TimelineEvent {
  timestamp: string | number; // ISO date or unix timestamp
  type: string; // "info", "warning", "error", "success"
  title: string;
  description?: string;
  source?: string; // e.g., pod name, service name
  metadata?: Record<string, unknown>;
}

interface TimelineData {
  events: TimelineEvent[];
  title?: string;
}

type EventType = "info" | "warning" | "error" | "success";

interface GroupedEvents {
  label: string;
  date: Date;
  events: TimelineEvent[];
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Timeline Viewer", version: "1.0.0" });
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

function parseTimestamp(timestamp: string | number): Date {
  if (typeof timestamp === "number") {
    // Unix timestamp (seconds or milliseconds)
    return new Date(timestamp > 1e12 ? timestamp : timestamp * 1000);
  }
  return new Date(timestamp);
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getDateGroup(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const eventDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (eventDate.getTime() === today.getTime()) {
    return "Today";
  } else if (eventDate.getTime() === yesterday.getTime()) {
    return "Yesterday";
  } else {
    return formatDate(date);
  }
}

function groupEventsByDate(events: TimelineEvent[]): GroupedEvents[] {
  const groups = new Map<string, GroupedEvents>();

  // Sort events by timestamp descending (most recent first)
  const sorted = [...events].sort((a, b) => {
    const dateA = parseTimestamp(a.timestamp);
    const dateB = parseTimestamp(b.timestamp);
    return dateB.getTime() - dateA.getTime();
  });

  for (const event of sorted) {
    const date = parseTimestamp(event.timestamp);
    const label = getDateGroup(date);
    const dateKey = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();

    if (!groups.has(dateKey)) {
      groups.set(dateKey, {
        label,
        date: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
        events: [],
      });
    }
    groups.get(dateKey)!.events.push(event);
  }

  // Sort groups by date descending
  return Array.from(groups.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
}

function normalizeEventType(type: string): EventType {
  const normalized = type.toLowerCase();
  if (normalized === "warn" || normalized === "warning") return "warning";
  if (normalized === "err" || normalized === "error") return "error";
  if (normalized === "ok" || normalized === "success") return "success";
  return "info";
}

// ============================================================================
// Style mappings
// ============================================================================

const dotColors: Record<EventType, string> = {
  info: "bg-blue-500",
  warning: "bg-orange-500",
  error: "bg-red-500",
  success: "bg-green-500",
};

const typeBtnColors: Record<EventType, { light: string; dark: string }> = {
  error: { light: "text-red-600", dark: "dark:text-red-400" },
  warning: { light: "text-orange-600", dark: "dark:text-orange-400" },
  info: { light: "text-blue-600", dark: "dark:text-blue-400" },
  success: { light: "text-green-600", dark: "dark:text-green-400" },
};

// ============================================================================
// Components
// ============================================================================

function EventNode({ event, expanded, onToggle, highlight }: {
  event: TimelineEvent;
  expanded: boolean;
  onToggle: () => void;
  highlight: boolean;
}) {
  const date = parseTimestamp(event.timestamp);
  const type = normalizeEventType(event.type);
  const hasDescription = !!event.description;
  const hasMetadata = event.metadata && Object.keys(event.metadata).length > 0;

  const typeConfig: Record<EventType, { colorScheme: "blue" | "orange" | "red" | "green" }> = {
    info: { colorScheme: "blue" },
    warning: { colorScheme: "orange" },
    error: { colorScheme: "red" },
    success: { colorScheme: "green" },
  };

  const config = typeConfig[type];

  return (
    <div
      className={cx(
        "flex items-start gap-3 p-2 rounded-md cursor-pointer transition-colors duration-150",
        highlight ? "bg-yellow-50 hover:bg-yellow-100 dark:bg-yellow-950/50 dark:hover:bg-yellow-950/70" : "hover:bg-bg-subtle"
      )}
      onClick={() => {
        if (hasDescription || hasMetadata) {
          onToggle();
        }
        notifyModel("selectEvent", { event });
      }}
    >
      {/* Timeline connector */}
      <div className="flex flex-col items-center pt-1 w-4 shrink-0 relative">
        <div className="w-0.5 h-full min-h-5 bg-border-default absolute top-0 bottom-0" />
        <div
          className={cx(
            "w-3 h-3 rounded-full border-2 border-bg-canvas shadow-sm relative z-10",
            dotColors[type]
          )}
        />
      </div>

      {/* Time */}
      <div className="text-xs font-mono text-fg-muted w-[70px] shrink-0 pt-0.5">
        {formatTime(date)}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-wrap items-start gap-2">
        {/* Type badge */}
        <Badge size="sm" variant="subtle" colorScheme={config.colorScheme}>
          {type}
        </Badge>

        {/* Title */}
        <div className="font-medium flex-1 min-w-[150px]">
          {event.title}
        </div>

        {/* Source */}
        {event.source && (
          <Badge size="sm" variant="outline" colorScheme="gray">
            {event.source}
          </Badge>
        )}

        {/* Expand indicator */}
        {(hasDescription || hasMetadata) && (
          <div
            className="text-xs text-fg-muted cursor-pointer transition-transform duration-150"
            style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
          >
            {"\u25B6"}
          </div>
        )}

        {/* Description (collapsible) */}
        {expanded && hasDescription && (
          <div className="w-full mt-2 p-2 bg-bg-subtle rounded-md text-sm text-fg-muted whitespace-pre-wrap leading-relaxed">
            {event.description}
          </div>
        )}

        {/* Metadata (collapsible) */}
        {expanded && hasMetadata && (
          <div className="w-full mt-2 p-2 bg-bg-subtle rounded-md text-xs font-mono">
            {Object.entries(event.metadata!).map(([key, value]) => (
              <div key={key} className="flex gap-2 py-0.5">
                <div className="text-fg-muted font-medium">{key}:</div>
                <div className="text-fg-default break-all">
                  {typeof value === "object" ? JSON.stringify(value) : String(value)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DateGroup({ group, expandedIds, toggleExpand, searchFilter }: {
  group: GroupedEvents;
  expandedIds: Set<string>;
  toggleExpand: (id: string) => void;
  searchFilter: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 h-px bg-border-default" />
        <div className="text-xs font-semibold text-fg-muted uppercase tracking-wide px-2">
          {group.label}
        </div>
        <div className="flex-1 h-px bg-border-default" />
      </div>
      <div className="flex flex-col gap-1">
        {group.events.map((event, idx) => {
          const eventId = `${group.date.toISOString()}-${idx}`;
          const isHighlighted = searchFilter && (
            event.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
            (event.description?.toLowerCase().includes(searchFilter.toLowerCase()))
          );
          return (
            <EventNode
              key={eventId}
              event={event}
              expanded={expandedIds.has(eventId)}
              onToggle={() => toggleExpand(eventId)}
              highlight={!!isHighlighted}
            />
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function TimelineViewer() {
  const [data, setData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<Set<EventType>>(
    new Set(["info", "warning", "error", "success"])
  );
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

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
          // Handle array of events or object with events property
          if (Array.isArray(parsed)) {
            setData({ events: parsed });
          } else if (parsed.events && Array.isArray(parsed.events)) {
            setData(parsed);
          } else {
            // Try to wrap single event in array
            setData({ events: [parsed] });
          }
        }
      } catch {
        // Failed to parse
        setData({ events: [] });
      }
    };
  }, []);

  // Auto-scroll effect
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = 0; // Scroll to top (most recent)
    }
  }, [data, autoScroll]);

  const filteredEvents = useMemo(() => {
    if (!data?.events) return [];
    return data.events.filter((event) => {
      // Type filter
      const type = normalizeEventType(event.type);
      if (!typeFilter.has(type)) return false;

      // Search filter
      if (searchFilter) {
        const search = searchFilter.toLowerCase();
        const matchTitle = event.title.toLowerCase().includes(search);
        const matchDesc = event.description?.toLowerCase().includes(search);
        const matchSource = event.source?.toLowerCase().includes(search);
        if (!matchTitle && !matchDesc && !matchSource) return false;
      }

      return true;
    });
  }, [data, typeFilter, searchFilter]);

  const groupedEvents = useMemo(() => {
    return groupEventsByDate(filteredEvents);
  }, [filteredEvents]);

  const toggleType = useCallback((type: EventType) => {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      notifyModel("filterType", { types: Array.from(next) });
      return next;
    });
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const allIds = new Set<string>();
    groupedEvents.forEach((group) => {
      group.events.forEach((_, idx) => {
        allIds.add(`${group.date.toISOString()}-${idx}`);
      });
    });
    setExpandedIds(allIds);
  }, [groupedEvents]);

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  const handleSearchChange = useCallback((e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    setSearchFilter(value);
    notifyModel("search", { text: value });
  }, []);

  if (loading) {
    return (
      <div className="font-sans text-sm text-fg-default bg-bg-canvas flex flex-col max-h-[500px] border border-border-default rounded-lg overflow-hidden">
        <div className="p-4 text-center text-fg-muted">Loading timeline...</div>
      </div>
    );
  }

  if (!data?.events?.length) {
    return (
      <div className="font-sans text-sm text-fg-default bg-bg-canvas flex flex-col max-h-[500px] border border-border-default rounded-lg overflow-hidden">
        <div className="p-4 text-center text-fg-muted">No events</div>
      </div>
    );
  }

  const eventTypes: EventType[] = ["error", "warning", "info", "success"];

  return (
    <div className="font-sans text-sm text-fg-default bg-bg-canvas flex flex-col max-h-[500px] border border-border-default rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center p-3 bg-bg-subtle border-b border-border-default flex-wrap gap-2">
        {data.title && (
          <h3 className="text-base font-semibold m-0">
            {data.title}
          </h3>
        )}

        <div className="flex gap-2 items-center flex-wrap">
          {/* Type filters */}
          <div className="flex gap-1">
            {eventTypes.map((type) => {
              const colors = typeBtnColors[type];
              return (
                <Button
                  key={type}
                  variant={typeFilter.has(type) ? "outline" : "ghost"}
                  size="xs"
                  onClick={() => toggleType(type)}
                  className={cx(
                    typeFilter.has(type) ? "opacity-100 font-medium" : "opacity-50 font-normal",
                    "capitalize transition-all duration-150 hover:opacity-80",
                    colors.light,
                    colors.dark
                  )}
                >
                  {type}
                </Button>
              );
            })}
          </div>

          {/* Search filter */}
          <Input
            type="text"
            placeholder="Search..."
            value={searchFilter}
            onInput={handleSearchChange}
            size="sm"
            className="w-[150px]"
          />

          {/* Expand/Collapse buttons */}
          <IconButton
            variant="outline"
            size="sm"
            onClick={expandAll}
            title="Expand all"
          >
            +
          </IconButton>
          <IconButton
            variant="outline"
            size="sm"
            onClick={collapseAll}
            title="Collapse all"
          >
            -
          </IconButton>

          {/* Auto-scroll toggle */}
          <IconButton
            variant={autoScroll ? "solid" : "outline"}
            size="sm"
            onClick={() => setAutoScroll(!autoScroll)}
            title="Auto-scroll to recent"
          >
            {"\u2191"}
          </IconButton>
        </div>
      </div>

      {/* Stats */}
      <div className="px-3 py-1.5 text-xs text-fg-muted bg-bg-subtle border-b border-border-subtle">
        {filteredEvents.length} / {data.events.length} events
        {searchFilter && ` matching "${searchFilter}"`}
      </div>

      {/* Timeline content */}
      <div className="flex-1 overflow-y-auto p-3" ref={containerRef}>
        {groupedEvents.map((group) => (
          <DateGroup
            key={group.date.toISOString()}
            group={group}
            expandedIds={expandedIds}
            toggleExpand={toggleExpand}
            searchFilter={searchFilter}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Mount
// ============================================================================

render(<TimelineViewer />, document.getElementById("app")!);
