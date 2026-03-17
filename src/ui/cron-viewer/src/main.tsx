/**
 * Cron Viewer UI - Parse and visualize cron expressions
 *
 * Features:
 * - Parse cron expressions to natural language
 * - Display next N scheduled executions
 * - Mini calendar visualization with marked execution days
 * - Interactive editor to modify cron expression
 *
 * @module lib/std/src/ui/cron-viewer
 */

import { render } from "preact";
import { useState, useEffect, useMemo, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { cx } from "../../components/utils";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { IconButton } from "../../components/ui/icon-button";
import { Code } from "../../components/ui/code";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface CronViewerProps {
  expression: string;
  timezone?: string;
  showCalendar?: boolean;
  showNextRuns?: number;
}

interface CronParts {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Cron Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Cron Parser
// ============================================================================

const FIELD_RANGES: Record<keyof CronParts, { min: number; max: number }> = {
  minute: { min: 0, max: 59 },
  hour: { min: 0, max: 23 },
  dayOfMonth: { min: 1, max: 31 },
  month: { min: 1, max: 12 },
  dayOfWeek: { min: 0, max: 6 },
};

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseField(field: string, min: number, max: number): number[] {
  const values = new Set<number>();

  // Handle special characters
  if (field === "*") {
    for (let i = min; i <= max; i++) values.add(i);
    return Array.from(values).sort((a, b) => a - b);
  }

  // Split by comma for lists
  const parts = field.split(",");

  for (const part of parts) {
    // Handle step values (e.g., */5, 1-10/2)
    const [rangePart, step] = part.split("/");
    const stepValue = step ? parseInt(step, 10) : 1;

    if (rangePart === "*") {
      for (let i = min; i <= max; i += stepValue) {
        values.add(i);
      }
    } else if (rangePart.includes("-")) {
      // Range (e.g., 1-5)
      const [startStr, endStr] = rangePart.split("-");
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      for (let i = start; i <= end && i <= max; i += stepValue) {
        if (i >= min) values.add(i);
      }
    } else {
      // Single value
      const val = parseInt(rangePart, 10);
      if (!isNaN(val) && val >= min && val <= max) {
        values.add(val);
      }
    }
  }

  return Array.from(values).sort((a, b) => a - b);
}

function parseCronExpression(expr: string): CronParts | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  return {
    minute: parts[0],
    hour: parts[1],
    dayOfMonth: parts[2],
    month: parts[3],
    dayOfWeek: parts[4],
  };
}

function describeField(
  field: string,
  fieldName: keyof CronParts,
  range: { min: number; max: number }
): string {
  if (field === "*") {
    switch (fieldName) {
      case "minute": return "every minute";
      case "hour": return "every hour";
      case "dayOfMonth": return "every day";
      case "month": return "every month";
      case "dayOfWeek": return "every day of the week";
    }
  }

  const values = parseField(field, range.min, range.max);

  if (fieldName === "dayOfWeek") {
    const dayNames = values.map((v) => DAY_NAMES[v]);
    if (dayNames.length === 5 && !dayNames.includes("Saturday") && !dayNames.includes("Sunday")) {
      return "weekdays";
    }
    if (dayNames.length === 2 && dayNames.includes("Saturday") && dayNames.includes("Sunday")) {
      return "weekends";
    }
    return dayNames.join(", ");
  }

  if (fieldName === "month") {
    return values.map((v) => MONTH_NAMES[v]).join(", ");
  }

  // Handle step patterns
  if (field.includes("/")) {
    const step = parseInt(field.split("/")[1], 10);
    switch (fieldName) {
      case "minute": return `every ${step} minutes`;
      case "hour": return `every ${step} hours`;
      case "dayOfMonth": return `every ${step} days`;
    }
  }

  if (values.length === 1) {
    return String(values[0]);
  }

  // Check for range
  if (field.includes("-") && !field.includes(",")) {
    return `${values[0]} to ${values[values.length - 1]}`;
  }

  return values.join(", ");
}

function describeCronExpression(parts: CronParts): string {
  const minute = parts.minute;
  const hour = parts.hour;
  const dayOfMonth = parts.dayOfMonth;
  const month = parts.month;
  const dayOfWeek = parts.dayOfWeek;

  const phrases: string[] = [];

  // Time description
  if (minute === "*" && hour === "*") {
    phrases.push("Every minute");
  } else if (minute === "0" && hour === "*") {
    phrases.push("At the start of every hour");
  } else if (minute.includes("/") && hour === "*") {
    const step = parseInt(minute.split("/")[1], 10);
    phrases.push(`Every ${step} minute${step > 1 ? "s" : ""}`);
  } else if (hour.includes("/") && minute === "0") {
    const step = parseInt(hour.split("/")[1], 10);
    phrases.push(`Every ${step} hour${step > 1 ? "s" : ""}`);
  } else {
    const minuteVals = parseField(minute, 0, 59);
    const hourVals = parseField(hour, 0, 23);

    if (hourVals.length === 1 && minuteVals.length === 1) {
      const h = hourVals[0];
      const m = minuteVals[0];
      const time = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
      phrases.push(`At ${time}`);
    } else if (hourVals.length === 1) {
      const h = hourVals[0];
      phrases.push(`At ${h.toString().padStart(2, "0")}:${minuteVals.join(", ")}`);
    } else {
      phrases.push(`At minute ${describeField(minute, "minute", FIELD_RANGES.minute)}`);
      phrases.push(`past hour ${describeField(hour, "hour", FIELD_RANGES.hour)}`);
    }
  }

  // Day of week description
  if (dayOfWeek !== "*") {
    const dow = describeField(dayOfWeek, "dayOfWeek", FIELD_RANGES.dayOfWeek);
    phrases.push(`on ${dow}`);
  }

  // Day of month description
  if (dayOfMonth !== "*") {
    const dom = describeField(dayOfMonth, "dayOfMonth", FIELD_RANGES.dayOfMonth);
    phrases.push(`on day ${dom} of the month`);
  }

  // Month description
  if (month !== "*") {
    const m = describeField(month, "month", FIELD_RANGES.month);
    phrases.push(`in ${m}`);
  }

  return phrases.join(" ");
}

// ============================================================================
// Next Runs Calculator
// ============================================================================

function getNextRuns(parts: CronParts, count: number, timezone?: string): Date[] {
  const runs: Date[] = [];
  const now = new Date();
  let current = new Date(now);

  const minuteVals = parseField(parts.minute, 0, 59);
  const hourVals = parseField(parts.hour, 0, 23);
  const dayOfMonthVals = parseField(parts.dayOfMonth, 1, 31);
  const monthVals = parseField(parts.month, 1, 12);
  const dayOfWeekVals = parseField(parts.dayOfWeek, 0, 6);

  const isDayOfWeekRestricted = parts.dayOfWeek !== "*";
  const isDayOfMonthRestricted = parts.dayOfMonth !== "*";

  // Start from next minute
  current.setSeconds(0, 0);
  current.setMinutes(current.getMinutes() + 1);

  const maxIterations = 366 * 24 * 60; // Max 1 year of minutes
  let iterations = 0;

  while (runs.length < count && iterations < maxIterations) {
    iterations++;

    const month = current.getMonth() + 1;
    const dayOfMonth = current.getDate();
    const dayOfWeek = current.getDay();
    const hour = current.getHours();
    const minute = current.getMinutes();

    // Check if this time matches
    const monthMatch = monthVals.includes(month);
    const minuteMatch = minuteVals.includes(minute);
    const hourMatch = hourVals.includes(hour);

    // Day matching: if both are restricted, either can match (OR logic)
    // If only one is restricted, that one must match
    let dayMatch = false;
    if (isDayOfWeekRestricted && isDayOfMonthRestricted) {
      dayMatch = dayOfWeekVals.includes(dayOfWeek) || dayOfMonthVals.includes(dayOfMonth);
    } else if (isDayOfWeekRestricted) {
      dayMatch = dayOfWeekVals.includes(dayOfWeek);
    } else if (isDayOfMonthRestricted) {
      dayMatch = dayOfMonthVals.includes(dayOfMonth);
    } else {
      dayMatch = true;
    }

    if (monthMatch && dayMatch && hourMatch && minuteMatch) {
      runs.push(new Date(current));
    }

    // Move to next minute
    current.setMinutes(current.getMinutes() + 1);
  }

  return runs;
}

function formatDateTime(date: Date, timezone?: string): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  if (timezone) {
    options.timeZone = timezone;
  }
  return date.toLocaleString("en-US", options);
}

function formatRelative(date: Date): string {
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 60) {
    return `in ${minutes} minute${minutes !== 1 ? "s" : ""}`;
  } else if (hours < 24) {
    return `in ${hours} hour${hours !== 1 ? "s" : ""} ${minutes % 60} min`;
  } else {
    return `in ${days} day${days !== 1 ? "s" : ""}`;
  }
}

// ============================================================================
// Calendar Component
// ============================================================================

function MiniCalendar({
  parts,
  timezone,
}: {
  parts: CronParts;
  timezone?: string;
}) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const calendarData = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Get next runs for this month
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);

    // Get all runs in this month window
    const allRuns = getNextRuns(parts, 100, timezone);
    const runsThisMonth = allRuns.filter(
      (d) => d >= monthStart && d <= monthEnd
    );
    const runDays = new Set(runsThisMonth.map((d) => d.getDate()));

    // Build calendar grid
    const weeks: (number | null)[][] = [];
    let week: (number | null)[] = [];

    // Add empty cells for days before first day of month
    for (let i = 0; i < firstDay; i++) {
      week.push(null);
    }

    // Add days of month
    for (let day = 1; day <= daysInMonth; day++) {
      week.push(day);
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
    }

    // Fill remaining week
    while (week.length > 0 && week.length < 7) {
      week.push(null);
    }
    if (week.length > 0) {
      weeks.push(week);
    }

    return { weeks, runDays, year, month };
  }, [currentMonth, parts, timezone]);

  const today = new Date();
  const isCurrentMonth =
    calendarData.year === today.getFullYear() &&
    calendarData.month === today.getMonth();

  const prevMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)
    );
  };

  const nextMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
    );
  };

  const monthLabel = currentMonth.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="bg-bg-canvas border border-border-default rounded-lg overflow-hidden">
      <div className="flex justify-between items-center p-2 bg-bg-subtle border-b border-border-default">
        <IconButton variant="ghost" size="sm" onClick={prevMonth} aria-label="Previous month">
          {"<"}
        </IconButton>
        <div className="text-sm font-semibold">{monthLabel}</div>
        <IconButton variant="ghost" size="sm" onClick={nextMonth} aria-label="Next month">
          {">"}
        </IconButton>
      </div>

      <div className="grid grid-cols-7 gap-px p-2">
        {/* Day headers */}
        {DAY_NAMES_SHORT.map((day) => (
          <div
            key={day}
            className="text-center text-xs font-semibold text-fg-muted py-1"
          >
            {day}
          </div>
        ))}

        {/* Calendar days */}
        {calendarData.weeks.flat().map((day, idx) => {
          const isActive = day !== null && calendarData.runDays.has(day);
          const isToday = isCurrentMonth && day === today.getDate();

          return (
            <div
              key={idx}
              className={cx(
                "text-center text-sm py-1.5 rounded-sm cursor-default",
                day === null && "invisible",
                isActive && "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300",
                (isActive || isToday) && "font-medium",
                isToday && "border-2 border-green-500"
              )}
            >
              {day}
            </div>
          );
        })}
      </div>

      <div className="flex gap-4 p-2 border-t border-border-default text-xs text-fg-muted">
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-sm bg-blue-100 dark:bg-blue-900/50 border border-blue-300 dark:border-blue-700" />
          Scheduled
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-sm bg-transparent border-2 border-green-500" />
          Today
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Editor Component
// ============================================================================

function CronEditor({
  parts,
  onChange,
}: {
  parts: CronParts;
  onChange: (newParts: CronParts) => void;
}) {
  const [editValues, setEditValues] = useState(parts);

  useEffect(() => {
    setEditValues(parts);
  }, [parts]);

  const handleFieldChange = (field: keyof CronParts, value: string) => {
    const newParts = { ...editValues, [field]: value };
    setEditValues(newParts);
    onChange(newParts);
  };

  const fieldLabels: Record<keyof CronParts, string> = {
    minute: "Minute (0-59)",
    hour: "Hour (0-23)",
    dayOfMonth: "Day of Month (1-31)",
    month: "Month (1-12)",
    dayOfWeek: "Day of Week (0-6, Sun=0)",
  };

  const fieldPlaceholders: Record<keyof CronParts, string> = {
    minute: "*, */5, 0, 0-30",
    hour: "*, */2, 9, 9-17",
    dayOfMonth: "*, 1, 1-15",
    month: "*, 1, 1-6",
    dayOfWeek: "*, 1-5, 0,6",
  };

  return (
    <div className="p-4 bg-orange-50 dark:bg-orange-950/30 border-b border-orange-200 dark:border-orange-800">
      <div className="text-sm font-semibold mb-3 text-orange-800 dark:text-orange-300">
        Edit Expression
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 mb-3">
        {(Object.keys(fieldLabels) as (keyof CronParts)[]).map((field) => (
          <div key={field} className="flex flex-col gap-1">
            <label className="text-xs font-medium text-fg-muted">
              {fieldLabels[field]}
            </label>
            <Input
              type="text"
              size="sm"
              value={editValues[field]}
              placeholder={fieldPlaceholders[field]}
              onChange={(e) =>
                handleFieldChange(field, (e.target as HTMLInputElement).value)
              }
              className="font-mono"
            />
          </div>
        ))}
      </div>
      <div className="text-sm text-fg-muted">
        Expression:{" "}
        <Code className="font-bold text-orange-700 dark:text-orange-400">
          {Object.values(editValues).join(" ")}
        </Code>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function CronViewer() {
  const [props, setProps] = useState<CronViewerProps | null>(null);
  const [loading, setLoading] = useState(true);
  const [customParts, setCustomParts] = useState<CronParts | null>(null);
  const [showEditor, setShowEditor] = useState(false);

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
          // Normalize props
          const normalized: CronViewerProps = {
            expression: parsed.expression || "* * * * *",
            timezone: parsed.timezone,
            showCalendar: parsed.showCalendar !== false,
            showNextRuns: parsed.showNextRuns ?? 5,
          };
          setProps(normalized);
        }
      } catch {
        // Default fallback
        setProps({
          expression: "* * * * *",
          showCalendar: true,
          showNextRuns: 5,
        });
      }
    };
  }, []);

  const parts = useMemo(() => {
    if (customParts) return customParts;
    if (!props) return null;
    return parseCronExpression(props.expression);
  }, [props, customParts]);

  const description = useMemo(() => {
    if (!parts) return "Invalid cron expression";
    return describeCronExpression(parts);
  }, [parts]);

  const nextRuns = useMemo(() => {
    if (!parts || !props) return [];
    return getNextRuns(parts, props.showNextRuns ?? 5, props.timezone);
  }, [parts, props]);

  const handleEditorChange = useCallback((newParts: CronParts) => {
    setCustomParts(newParts);
    notifyModel("updateExpression", {
      expression: Object.values(newParts).join(" "),
    });
  }, []);

  const toggleEditor = useCallback(() => {
    setShowEditor((prev) => !prev);
    notifyModel("toggleEditor", { visible: !showEditor });
  }, [showEditor]);

  if (loading) {
    return (
      <div className="font-sans text-sm text-fg-default bg-bg-canvas border border-border-default rounded-lg">
        <div className="p-4 text-center text-fg-muted">Loading cron viewer...</div>
      </div>
    );
  }

  if (!props || !parts) {
    return (
      <div className="font-sans text-sm text-fg-default bg-bg-canvas border border-border-default rounded-lg">
        <div className="p-4 text-center text-red-600 dark:text-red-400">
          Invalid cron expression
        </div>
      </div>
    );
  }

  const currentExpression = customParts
    ? Object.values(customParts).join(" ")
    : props.expression;

  return (
    <div className="font-sans text-sm text-fg-default bg-bg-canvas flex flex-col max-h-[600px] border border-border-default rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center p-3 bg-bg-subtle border-b border-border-default flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Code className="text-lg font-bold text-blue-600 dark:text-blue-400 bg-bg-canvas px-3 py-1.5 rounded-md border border-border-default">
            {currentExpression}
          </Code>
          <Button variant="outline" size="sm" onClick={toggleEditor}>
            {showEditor ? "Hide Editor" : "Edit"}
          </Button>
        </div>
        {props.timezone && (
          <div className="text-xs text-fg-muted bg-bg-canvas px-2 py-1 rounded-sm font-mono">
            Timezone: {props.timezone}
          </div>
        )}
      </div>

      {/* Description */}
      <div className="p-4 text-base font-medium bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-200 border-b border-border-default">
        {description}
      </div>

      {/* Editor */}
      {showEditor && <CronEditor parts={parts} onChange={handleEditorChange} />}

      {/* Content */}
      <div className="flex flex-wrap flex-1 overflow-y-auto">
        {/* Next Runs */}
        {(props.showNextRuns ?? 5) > 0 && (
          <div className="flex-1 min-w-[300px] p-4 border-r border-border-default last:border-r-0">
            <div className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-3">
              Next {props.showNextRuns ?? 5} Executions
            </div>
            <div className="flex flex-col gap-2">
              {nextRuns.map((run, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 p-2 rounded-md bg-bg-subtle"
                >
                  <div className="text-xs font-bold text-fg-muted w-5">
                    {idx + 1}.
                  </div>
                  <div className="flex-1 font-mono text-sm">
                    {formatDateTime(run, props.timezone)}
                  </div>
                  <div className="text-xs text-fg-muted italic">
                    {formatRelative(run)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Calendar */}
        {props.showCalendar !== false && (
          <div className="flex-1 min-w-[280px] p-4">
            <div className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-3">
              Calendar View
            </div>
            <MiniCalendar parts={parts} timezone={props.timezone} />
          </div>
        )}
      </div>

      {/* Field breakdown */}
      <div className="p-4 border-t border-border-default bg-bg-subtle">
        <div className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-3">
          Field Breakdown
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {(Object.keys(parts) as (keyof CronParts)[]).map((field) => {
            const labels: Record<keyof CronParts, string> = {
              minute: "Minute",
              hour: "Hour",
              dayOfMonth: "Day (month)",
              month: "Month",
              dayOfWeek: "Day (week)",
            };
            return (
              <div
                key={field}
                className="flex flex-col gap-1 p-2 bg-bg-canvas rounded-md border border-border-default"
              >
                <div className="text-xs font-semibold text-fg-muted">
                  {labels[field]}
                </div>
                <Code className="text-base font-bold text-blue-600 dark:text-blue-400">
                  {parts[field]}
                </Code>
                <div className="text-xs text-fg-muted">
                  {describeField(field, field, FIELD_RANGES[field])}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Mount
// ============================================================================

render(<CronViewer />, document.getElementById("app")!);
