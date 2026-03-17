/**
 * Date/time manipulation tools
 *
 * Uses date-fns for robust date handling.
 *
 * Inspired by:
 * - IT-Tools MCP: https://github.com/wrenchpilot/it-tools-mcp
 *
 * @module lib/std/datetime
 */

import {
  addDays,
  addHours,
  addMinutes,
  addMonths,
  addSeconds,
  addWeeks,
  addYears,
  differenceInDays,
  differenceInHours,
  differenceInMinutes,
  differenceInMonths,
  differenceInSeconds,
  differenceInWeeks,
  differenceInYears,
  format,
  formatISO,
  getDate,
  getDay,
  getHours,
  getMinutes,
  getMonth,
  getSeconds,
  getUnixTime,
  getYear,
  parse,
  parseISO,
} from "date-fns";
import type { MiniTool } from "./types.ts";

export const datetimeTools: MiniTool[] = [
  {
    name: "datetime_now",
    description:
      "Get current date and time in various formats. Returns ISO, Unix timestamp, date-only, time-only, or custom pattern. Essential for timestamps, logging, or time-based operations. Keywords: current time, now, today date, timestamp, current datetime.",
    category: "datetime",
    inputSchema: {
      type: "object",
      properties: {
        format: {
          type: "string",
          enum: ["iso", "unix", "date", "time", "full"],
          description: "Output format",
        },
        pattern: {
          type: "string",
          description: "Custom format pattern (e.g., 'yyyy-MM-dd HH:mm:ss')",
        },
      },
    },
    handler: ({ format: fmt = "iso", pattern }) => {
      const now = new Date();
      if (pattern) {
        return format(now, pattern as string);
      }
      switch (fmt) {
        case "unix":
          return getUnixTime(now);
        case "date":
          return format(now, "yyyy-MM-dd");
        case "time":
          return format(now, "HH:mm:ss");
        case "full":
          return format(now, "PPpp"); // date-fns locale-aware full format
        default:
          return formatISO(now);
      }
    },
  },
  {
    name: "datetime_format",
    description:
      "Format a date using date-fns patterns. Use yyyy for year, MM for month, dd for day, HH for hours, mm for minutes. Create custom date displays like 'EEEE, MMMM do yyyy'. Keywords: format date, date pattern, date display, custom date format, date-fns.",
    category: "datetime",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date string or ISO timestamp" },
        pattern: {
          type: "string",
          description: "Format pattern (e.g., 'yyyy-MM-dd HH:mm', 'EEEE, MMMM do yyyy')",
        },
      },
      required: ["date", "pattern"],
    },
    handler: ({ date, pattern }) => {
      const d = typeof date === "number" ? new Date(date) : parseISO(date as string);
      return format(d, pattern as string);
    },
  },
  {
    name: "datetime_diff",
    description:
      "Calculate time difference between two dates in any unit. Get difference in seconds, minutes, hours, days, weeks, months, or years. Use for age calculation, duration, or elapsed time. Keywords: date difference, time between, days since, duration, elapsed time, age calculation.",
    category: "datetime",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Start date" },
        to: { type: "string", description: "End date (default: now)" },
        unit: {
          type: "string",
          enum: ["seconds", "minutes", "hours", "days", "weeks", "months", "years"],
          description: "Unit for result",
        },
      },
      required: ["from"],
    },
    handler: ({ from, to, unit = "days" }) => {
      const fromDate = parseISO(from as string);
      const toDate = to ? parseISO(to as string) : new Date();

      switch (unit) {
        case "seconds":
          return differenceInSeconds(toDate, fromDate);
        case "minutes":
          return differenceInMinutes(toDate, fromDate);
        case "hours":
          return differenceInHours(toDate, fromDate);
        case "days":
          return differenceInDays(toDate, fromDate);
        case "weeks":
          return differenceInWeeks(toDate, fromDate);
        case "months":
          return differenceInMonths(toDate, fromDate);
        case "years":
          return differenceInYears(toDate, fromDate);
        default:
          return differenceInDays(toDate, fromDate);
      }
    },
  },
  {
    name: "datetime_add",
    description:
      "Add or subtract time from a date. Add days, hours, months, or any unit to calculate future/past dates. Use negative values to subtract. Essential for scheduling and date calculations. Keywords: add days, add months, subtract time, date arithmetic, future date, past date.",
    category: "datetime",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Base date (default: now)" },
        amount: { type: "number", description: "Amount to add (negative to subtract)" },
        unit: {
          type: "string",
          enum: ["seconds", "minutes", "hours", "days", "weeks", "months", "years"],
          description: "Unit",
        },
      },
      required: ["amount", "unit"],
    },
    handler: ({ date, amount, unit }) => {
      const d = date ? parseISO(date as string) : new Date();
      const amt = amount as number;

      let result: Date;
      switch (unit) {
        case "seconds":
          result = addSeconds(d, amt);
          break;
        case "minutes":
          result = addMinutes(d, amt);
          break;
        case "hours":
          result = addHours(d, amt);
          break;
        case "days":
          result = addDays(d, amt);
          break;
        case "weeks":
          result = addWeeks(d, amt);
          break;
        case "months":
          result = addMonths(d, amt);
          break;
        case "years":
          result = addYears(d, amt);
          break;
        default:
          result = d;
      }
      return formatISO(result);
    },
  },
  {
    name: "datetime_parse",
    description:
      "Parse a date string and extract all components. Returns year, month, day, hour, minute, second, day of week, and both ISO and Unix formats. Use for date validation or component extraction. Keywords: parse date, extract date parts, date components, validate date, date breakdown.",
    category: "datetime",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date string to parse" },
        inputFormat: {
          type: "string",
          description: "Input format pattern (if not ISO)",
        },
      },
      required: ["date"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/json-viewer",
        emits: ["copy"],
        accepts: [],
      },
    },
    handler: ({ date, inputFormat }) => {
      let d: Date;
      if (inputFormat) {
        d = parse(date as string, inputFormat as string, new Date());
      } else {
        d = parseISO(date as string);
      }

      const dayNames = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ];

      return {
        year: getYear(d),
        month: getMonth(d) + 1,
        day: getDate(d),
        hour: getHours(d),
        minute: getMinutes(d),
        second: getSeconds(d),
        dayOfWeek: getDay(d),
        dayName: dayNames[getDay(d)],
        iso: formatISO(d),
        unix: getUnixTime(d),
      };
    },
  },
  // Inspired by IT-Tools MCP: https://github.com/wrenchpilot/it-tools-mcp
  {
    name: "cron_parse",
    description:
      "Parse a cron expression and explain it in human-readable format. Shows field breakdown, natural language description, and calculates next scheduled runs. Supports standard 5-field cron (minute hour dayOfMonth month dayOfWeek). Keywords: cron parse, cron expression, cron schedule, cron explain, scheduled tasks, crontab.",
    category: "datetime",
    inputSchema: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "Cron expression (e.g., '0 9 * * 1-5' for 9 AM Monday-Friday)",
        },
        timezone: {
          type: "string",
          description: "Timezone for next runs calculation (e.g., 'America/New_York', 'Europe/Paris'). Defaults to UTC.",
        },
        count: {
          type: "number",
          description: "Number of next runs to show (default: 5, max: 20)",
        },
      },
      required: ["expression"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/cron-viewer",
        emits: ["edit"],
        accepts: [],
      },
    },
    handler: ({ expression, timezone, count = 5 }) => {
      const expr = (expression as string).trim();
      const parts = expr.split(/\s+/);

      // Validate: must have exactly 5 fields
      if (parts.length !== 5) {
        return {
          expression: expr,
          explanation: "Invalid cron expression",
          parts: { minute: "", hour: "", dayOfMonth: "", month: "", dayOfWeek: "" },
          nextRuns: [],
          isValid: false,
          error: `Expected 5 fields (minute hour dayOfMonth month dayOfWeek), got ${parts.length}`,
        };
      }

      const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

      // Validate each field
      const fieldConfigs = [
        { name: "minute", value: minute, min: 0, max: 59 },
        { name: "hour", value: hour, min: 0, max: 23 },
        { name: "dayOfMonth", value: dayOfMonth, min: 1, max: 31 },
        { name: "month", value: month, min: 1, max: 12 },
        { name: "dayOfWeek", value: dayOfWeek, min: 0, max: 7 }, // 0 and 7 both = Sunday
      ];

      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const monthNames = ["", "January", "February", "March", "April", "May", "June",
                          "July", "August", "September", "October", "November", "December"];

      // Parse a cron field and return expanded values
      const parseField = (field: string, min: number, max: number): number[] | null => {
        try {
          const values = new Set<number>();

          for (const part of field.split(",")) {
            if (part === "*") {
              for (let i = min; i <= max; i++) values.add(i);
            } else if (part.includes("/")) {
              const [range, stepStr] = part.split("/");
              const step = parseInt(stepStr, 10);
              if (isNaN(step) || step <= 0) return null;

              let start = min, end = max;
              if (range !== "*") {
                if (range.includes("-")) {
                  const [s, e] = range.split("-").map((n) => parseInt(n, 10));
                  start = s;
                  end = e;
                } else {
                  start = parseInt(range, 10);
                }
              }
              for (let i = start; i <= end; i += step) values.add(i);
            } else if (part.includes("-")) {
              const [start, end] = part.split("-").map((n) => parseInt(n, 10));
              if (isNaN(start) || isNaN(end)) return null;
              for (let i = start; i <= end; i++) values.add(i);
            } else {
              const num = parseInt(part, 10);
              if (isNaN(num)) return null;
              values.add(num);
            }
          }

          // Validate range
          for (const v of values) {
            if (v < min || v > max) return null;
          }

          return Array.from(values).sort((a, b) => a - b);
        } catch {
          return null;
        }
      };

      // Describe a field in human-readable form
      const describeField = (field: string, name: string, _min: number, _max: number): string => {
        if (field === "*") return `every ${name}`;

        if (field.includes("/")) {
          const [range, step] = field.split("/");
          if (range === "*") return `every ${step} ${name}s`;
          return `every ${step} ${name}s in ${range}`;
        }

        if (field.includes("-")) {
          const [start, end] = field.split("-");
          if (name === "dayOfWeek") {
            const s = parseInt(start, 10);
            const e = parseInt(end, 10);
            return `${dayNames[s % 7]} through ${dayNames[e % 7]}`;
          }
          if (name === "month") {
            const s = parseInt(start, 10);
            const e = parseInt(end, 10);
            return `${monthNames[s]} through ${monthNames[e]}`;
          }
          return `${start} through ${end}`;
        }

        if (field.includes(",")) {
          const vals = field.split(",");
          if (name === "dayOfWeek") {
            return vals.map((v) => dayNames[parseInt(v, 10) % 7]).join(", ");
          }
          if (name === "month") {
            return vals.map((v) => monthNames[parseInt(v, 10)]).join(", ");
          }
          return vals.join(", ");
        }

        // Single value
        const num = parseInt(field, 10);
        if (name === "dayOfWeek") return dayNames[num % 7];
        if (name === "month") return monthNames[num];
        return field;
      };

      // Parse all fields
      const parsedFields: Record<string, number[] | null> = {};
      let isValid = true;

      for (const config of fieldConfigs) {
        parsedFields[config.name] = parseField(config.value, config.min, config.max);
        if (!parsedFields[config.name]) isValid = false;
      }

      if (!isValid) {
        return {
          expression: expr,
          explanation: "Invalid cron expression (field out of range or malformed)",
          parts: {
            minute: { value: minute, explanation: describeField(minute, "minute", 0, 59) },
            hour: { value: hour, explanation: describeField(hour, "hour", 0, 23) },
            dayOfMonth: { value: dayOfMonth, explanation: describeField(dayOfMonth, "day of month", 1, 31) },
            month: { value: month, explanation: describeField(month, "month", 1, 12) },
            dayOfWeek: { value: dayOfWeek, explanation: describeField(dayOfWeek, "dayOfWeek", 0, 7) },
          },
          nextRuns: [],
          isValid: false,
          error: "One or more fields contain invalid values",
        };
      }

      // Build human-readable explanation
      const buildExplanation = (): string => {
        let timeStr = "";
        if (hour !== "*" && minute !== "*") {
          const h = parseInt(hour, 10);
          const m = minute.padStart(2, "0");
          const period = h >= 12 ? "PM" : "AM";
          const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
          timeStr = `At ${h12}:${m} ${period}`;
        } else if (hour !== "*") {
          timeStr = `At ${hour}:00`;
        } else if (minute !== "*") {
          timeStr = `At minute ${minute}`;
        }

        let dayStr = "";
        if (dayOfMonth !== "*" && dayOfWeek === "*") {
          dayStr = `on day ${dayOfMonth} of the month`;
        } else if (dayOfMonth === "*" && dayOfWeek !== "*") {
          dayStr = `on ${describeField(dayOfWeek, "dayOfWeek", 0, 7)}`;
        } else if (dayOfMonth !== "*" && dayOfWeek !== "*") {
          dayStr = `on day ${dayOfMonth} and ${describeField(dayOfWeek, "dayOfWeek", 0, 7)}`;
        }

        let monthStr = "";
        if (month !== "*") {
          monthStr = `in ${describeField(month, "month", 1, 12)}`;
        }

        const parts = [timeStr, dayStr, monthStr].filter(Boolean);
        return parts.length > 0 ? parts.join(", ") : "Every minute";
      };

      // Calculate next runs
      const calculateNextRuns = (numRuns: number, tz?: string): string[] => {
        const runs: string[] = [];
        const maxIterations = 366 * 24 * 60; // Max 1 year of minutes

        // Start from now
        let current = new Date();
        // Round to next minute
        current.setSeconds(0, 0);
        current.setMinutes(current.getMinutes() + 1);

        const minutes = parsedFields.minute!;
        const hours = parsedFields.hour!;
        const daysOfMonth = parsedFields.dayOfMonth!;
        const months = parsedFields.month!;
        const daysOfWeek = parsedFields.dayOfWeek!.map((d) => d % 7); // Normalize 7 to 0

        let iterations = 0;
        while (runs.length < numRuns && iterations < maxIterations) {
          iterations++;

          const m = current.getMinutes();
          const h = current.getHours();
          const dom = current.getDate();
          const mon = current.getMonth() + 1; // 1-12
          const dow = current.getDay(); // 0-6

          const minuteMatch = minutes.includes(m);
          const hourMatch = hours.includes(h);
          const monthMatch = months.includes(mon);

          // Day matching: if both dayOfMonth and dayOfWeek are restricted, either can match (OR)
          // If only one is restricted, that one must match
          const domRestricted = !(daysOfMonth.length === 31 && daysOfMonth[0] === 1);
          const dowRestricted = !(daysOfWeek.length === 7);

          let dayMatch = false;
          if (!domRestricted && !dowRestricted) {
            dayMatch = true;
          } else if (domRestricted && !dowRestricted) {
            dayMatch = daysOfMonth.includes(dom);
          } else if (!domRestricted && dowRestricted) {
            dayMatch = daysOfWeek.includes(dow);
          } else {
            // Both restricted - OR behavior (standard cron)
            dayMatch = daysOfMonth.includes(dom) || daysOfWeek.includes(dow);
          }

          if (minuteMatch && hourMatch && dayMatch && monthMatch) {
            // Format with timezone if provided
            if (tz) {
              try {
                runs.push(current.toLocaleString("en-US", {
                  timeZone: tz,
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: false,
                  timeZoneName: "short",
                }));
              } catch {
                // Invalid timezone, fall back to ISO
                runs.push(current.toISOString());
              }
            } else {
              runs.push(current.toISOString());
            }
          }

          // Advance by 1 minute
          current.setMinutes(current.getMinutes() + 1);
        }

        return runs;
      };

      const numRuns = Math.min(Math.max(1, count as number || 5), 20);
      const tz = timezone as string | undefined;

      return {
        expression: expr,
        explanation: buildExplanation(),
        parts: {
          minute: { value: minute, explanation: describeField(minute, "minute", 0, 59) },
          hour: { value: hour, explanation: describeField(hour, "hour", 0, 23) },
          dayOfMonth: { value: dayOfMonth, explanation: describeField(dayOfMonth, "day of month", 1, 31) },
          month: { value: month, explanation: describeField(month, "month", 1, 12) },
          dayOfWeek: { value: dayOfWeek, explanation: describeField(dayOfWeek, "dayOfWeek", 0, 7) },
        },
        nextRuns: calculateNextRuns(numRuns, tz),
        isValid: true,
        timezone: tz || "UTC",
      };
    },
  },
  {
    name: "datetime_unix",
    description:
      "Convert between Unix timestamp (seconds since 1970) and ISO date string. Handle both seconds and milliseconds. Essential for API timestamps and epoch time. Keywords: unix timestamp, epoch time, timestamp convert, from unix, to unix, seconds since 1970.",
    category: "datetime",
    inputSchema: {
      type: "object",
      properties: {
        value: {
          type: ["string", "number"],
          description: "Unix timestamp (number) or ISO date string",
        },
        action: {
          type: "string",
          enum: ["to_unix", "from_unix"],
          description: "Conversion direction",
        },
      },
      required: ["value", "action"],
    },
    handler: ({ value, action }) => {
      if (action === "to_unix") {
        const d = typeof value === "string" ? parseISO(value as string) : new Date(value as number);
        return {
          unix: getUnixTime(d),
          unixMs: d.getTime(),
          iso: formatISO(d),
        };
      }
      // from_unix
      const timestamp = typeof value === "string"
        ? parseInt(value as string, 10)
        : (value as number);
      // Detect if it's seconds or milliseconds
      const ms = timestamp > 1e12 ? timestamp : timestamp * 1000;
      const d = new Date(ms);
      return {
        iso: formatISO(d),
        formatted: format(d, "PPpp"),
        unix: Math.floor(ms / 1000),
        unixMs: ms,
      };
    },
  },
  {
    name: "duration_parse",
    description:
      "Parse a human-readable duration string into various formats. Supports formats like '2h 30m', '1d 12h', '90s', '1w2d', ISO 8601 durations 'P1DT2H30M'. Returns milliseconds, breakdown by unit, human-readable string, and ISO 8601 duration. Keywords: parse duration, time duration, human duration, ISO 8601 duration, convert duration.",
    category: "datetime",
    inputSchema: {
      type: "object",
      properties: {
        duration: {
          type: "string",
          description: "Duration string (e.g., '2h 30m', '1d 12h', '90s', 'P1DT2H30M', '1w2d')",
        },
      },
      required: ["duration"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/json-viewer",
        emits: ["copy"],
        accepts: [],
      },
    },
    handler: ({ duration }) => {
      const input = (duration as string).trim();

      // Time unit constants in milliseconds
      const MS_PER_SECOND = 1000;
      const MS_PER_MINUTE = 60 * MS_PER_SECOND;
      const MS_PER_HOUR = 60 * MS_PER_MINUTE;
      const MS_PER_DAY = 24 * MS_PER_HOUR;
      const MS_PER_WEEK = 7 * MS_PER_DAY;

      // Try to parse the duration
      let totalMs = 0;
      let parsed = false;

      // ISO 8601 duration format: P[n]Y[n]M[n]DT[n]H[n]M[n]S or P[n]W
      const iso8601Regex = /^P(?:(\d+)W)?(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i;
      const isoMatch = input.match(iso8601Regex);

      if (isoMatch) {
        const [, weeks, years, months, days, hours, minutes, seconds] = isoMatch;
        if (weeks) totalMs += parseInt(weeks, 10) * MS_PER_WEEK;
        if (years) totalMs += parseInt(years, 10) * 365 * MS_PER_DAY; // Approximate
        if (months) totalMs += parseInt(months, 10) * 30 * MS_PER_DAY; // Approximate
        if (days) totalMs += parseInt(days, 10) * MS_PER_DAY;
        if (hours) totalMs += parseInt(hours, 10) * MS_PER_HOUR;
        if (minutes) totalMs += parseInt(minutes, 10) * MS_PER_MINUTE;
        if (seconds) totalMs += parseFloat(seconds) * MS_PER_SECOND;
        parsed = true;
      }

      // Human-readable formats: "2h", "2h30m", "2 hours 30 minutes", "1d12h", etc.
      if (!parsed) {
        // Normalize: add spaces between number and unit if missing
        const normalized = input
          .toLowerCase()
          .replace(/(\d+)\s*(weeks?|w)\b/gi, (_, n) => `${n}w `)
          .replace(/(\d+)\s*(days?|d)\b/gi, (_, n) => `${n}d `)
          .replace(/(\d+)\s*(hours?|h)\b/gi, (_, n) => `${n}h `)
          .replace(/(\d+)\s*(minutes?|mins?|m)\b/gi, (_, n) => `${n}m `)
          .replace(/(\d+)\s*(seconds?|secs?|s)\b/gi, (_, n) => `${n}s `)
          .replace(/(\d+)\s*(milliseconds?|ms)\b/gi, (_, n) => `${n}ms `)
          .trim();

        // Parse each component
        const weekMatch = normalized.match(/(\d+)w/);
        const dayMatch = normalized.match(/(\d+)d/);
        const hourMatch = normalized.match(/(\d+)h/);
        const minMatch = normalized.match(/(\d+)m(?!s)/);
        const secMatch = normalized.match(/(\d+)s(?!$|\s)/);
        const msMatch = normalized.match(/(\d+)ms/);
        // Also handle plain seconds like "90s"
        const plainSecMatch = normalized.match(/^(\d+)s$/);

        if (weekMatch || dayMatch || hourMatch || minMatch || secMatch || msMatch || plainSecMatch) {
          if (weekMatch) totalMs += parseInt(weekMatch[1], 10) * MS_PER_WEEK;
          if (dayMatch) totalMs += parseInt(dayMatch[1], 10) * MS_PER_DAY;
          if (hourMatch) totalMs += parseInt(hourMatch[1], 10) * MS_PER_HOUR;
          if (minMatch) totalMs += parseInt(minMatch[1], 10) * MS_PER_MINUTE;
          if (secMatch) totalMs += parseInt(secMatch[1], 10) * MS_PER_SECOND;
          if (msMatch) totalMs += parseInt(msMatch[1], 10);
          if (plainSecMatch) totalMs += parseInt(plainSecMatch[1], 10) * MS_PER_SECOND;
          parsed = true;
        }
      }

      if (!parsed || totalMs === 0) {
        return {
          valid: false,
          milliseconds: 0,
          seconds: 0,
          minutes: 0,
          hours: 0,
          days: 0,
          weeks: 0,
          breakdown: { weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0, milliseconds: 0 },
          human: "",
          iso: "",
          error: `Unable to parse duration: "${input}". Supported formats: "2h 30m", "1d 12h", "90s", "P1DT2H30M", "1w2d"`,
        };
      }

      // Calculate breakdown
      let remaining = totalMs;
      const weeks = Math.floor(remaining / MS_PER_WEEK);
      remaining %= MS_PER_WEEK;
      const days = Math.floor(remaining / MS_PER_DAY);
      remaining %= MS_PER_DAY;
      const hours = Math.floor(remaining / MS_PER_HOUR);
      remaining %= MS_PER_HOUR;
      const minutes = Math.floor(remaining / MS_PER_MINUTE);
      remaining %= MS_PER_MINUTE;
      const seconds = Math.floor(remaining / MS_PER_SECOND);
      const milliseconds = remaining % MS_PER_SECOND;

      // Build human-readable string
      const humanParts: string[] = [];
      if (weeks > 0) humanParts.push(`${weeks} week${weeks !== 1 ? "s" : ""}`);
      if (days > 0) humanParts.push(`${days} day${days !== 1 ? "s" : ""}`);
      if (hours > 0) humanParts.push(`${hours} hour${hours !== 1 ? "s" : ""}`);
      if (minutes > 0) humanParts.push(`${minutes} minute${minutes !== 1 ? "s" : ""}`);
      if (seconds > 0) humanParts.push(`${seconds} second${seconds !== 1 ? "s" : ""}`);
      if (milliseconds > 0) humanParts.push(`${milliseconds} millisecond${milliseconds !== 1 ? "s" : ""}`);
      const human = humanParts.length > 0 ? humanParts.join(", ") : "0 seconds";

      // Build ISO 8601 duration string
      let iso = "P";
      if (weeks > 0 && days === 0 && hours === 0 && minutes === 0 && seconds === 0 && milliseconds === 0) {
        iso += `${weeks}W`;
      } else {
        const totalDays = weeks * 7 + days;
        if (totalDays > 0) iso += `${totalDays}D`;
        if (hours > 0 || minutes > 0 || seconds > 0 || milliseconds > 0) {
          iso += "T";
          if (hours > 0) iso += `${hours}H`;
          if (minutes > 0) iso += `${minutes}M`;
          if (seconds > 0 || milliseconds > 0) {
            const totalSec = seconds + milliseconds / 1000;
            iso += `${totalSec % 1 === 0 ? totalSec : totalSec.toFixed(3)}S`;
          }
        }
      }
      if (iso === "P") iso = "PT0S";

      return {
        valid: true,
        milliseconds: totalMs,
        seconds: totalMs / MS_PER_SECOND,
        minutes: totalMs / MS_PER_MINUTE,
        hours: totalMs / MS_PER_HOUR,
        days: totalMs / MS_PER_DAY,
        weeks: totalMs / MS_PER_WEEK,
        breakdown: { weeks, days, hours, minutes, seconds, milliseconds },
        human,
        iso,
      };
    },
  },
  {
    name: "duration_between",
    description:
      "Calculate the duration between two dates. Returns the duration in various units with a breakdown. Supports ISO date strings and Unix timestamps. Keywords: time between dates, duration between, date difference, elapsed time, time span.",
    category: "datetime",
    inputSchema: {
      type: "object",
      properties: {
        start: {
          type: "string",
          description: "Start date (ISO string or Unix timestamp)",
        },
        end: {
          type: "string",
          description: "End date (ISO string or Unix timestamp)",
        },
      },
      required: ["start", "end"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/json-viewer",
        emits: ["copy"],
        accepts: [],
      },
    },
    handler: ({ start, end }) => {
      // Time unit constants in milliseconds
      const MS_PER_SECOND = 1000;
      const MS_PER_MINUTE = 60 * MS_PER_SECOND;
      const MS_PER_HOUR = 60 * MS_PER_MINUTE;
      const MS_PER_DAY = 24 * MS_PER_HOUR;
      const MS_PER_WEEK = 7 * MS_PER_DAY;

      // Parse dates
      const parseDate = (value: string): Date | null => {
        // Try as Unix timestamp (number string)
        const numValue = Number(value);
        if (!isNaN(numValue)) {
          // Detect if milliseconds or seconds
          const ms = numValue > 1e12 ? numValue : numValue * 1000;
          return new Date(ms);
        }
        // Try as ISO date string
        try {
          const d = parseISO(value);
          if (!isNaN(d.getTime())) return d;
        } catch {
          // Fall through
        }
        return null;
      };

      const startDate = parseDate(start as string);
      const endDate = parseDate(end as string);

      if (!startDate) {
        return {
          valid: false,
          negative: false,
          milliseconds: 0,
          seconds: 0,
          minutes: 0,
          hours: 0,
          days: 0,
          weeks: 0,
          breakdown: { weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0, milliseconds: 0 },
          human: "",
          iso: "",
          error: `Invalid start date: "${start}". Provide an ISO date string or Unix timestamp.`,
        };
      }

      if (!endDate) {
        return {
          valid: false,
          negative: false,
          milliseconds: 0,
          seconds: 0,
          minutes: 0,
          hours: 0,
          days: 0,
          weeks: 0,
          breakdown: { weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0, milliseconds: 0 },
          human: "",
          iso: "",
          error: `Invalid end date: "${end}". Provide an ISO date string or Unix timestamp.`,
        };
      }

      // Calculate difference
      const diffMs = endDate.getTime() - startDate.getTime();
      const negative = diffMs < 0;
      const totalMs = Math.abs(diffMs);

      // Calculate breakdown
      let remaining = totalMs;
      const weeks = Math.floor(remaining / MS_PER_WEEK);
      remaining %= MS_PER_WEEK;
      const days = Math.floor(remaining / MS_PER_DAY);
      remaining %= MS_PER_DAY;
      const hours = Math.floor(remaining / MS_PER_HOUR);
      remaining %= MS_PER_HOUR;
      const minutes = Math.floor(remaining / MS_PER_MINUTE);
      remaining %= MS_PER_MINUTE;
      const seconds = Math.floor(remaining / MS_PER_SECOND);
      const milliseconds = remaining % MS_PER_SECOND;

      // Build human-readable string
      const humanParts: string[] = [];
      if (weeks > 0) humanParts.push(`${weeks} week${weeks !== 1 ? "s" : ""}`);
      if (days > 0) humanParts.push(`${days} day${days !== 1 ? "s" : ""}`);
      if (hours > 0) humanParts.push(`${hours} hour${hours !== 1 ? "s" : ""}`);
      if (minutes > 0) humanParts.push(`${minutes} minute${minutes !== 1 ? "s" : ""}`);
      if (seconds > 0) humanParts.push(`${seconds} second${seconds !== 1 ? "s" : ""}`);
      if (milliseconds > 0) humanParts.push(`${milliseconds} millisecond${milliseconds !== 1 ? "s" : ""}`);
      let human = humanParts.length > 0 ? humanParts.join(", ") : "0 seconds";
      if (negative) human = `-${human}`;

      // Build ISO 8601 duration string
      let iso = negative ? "-P" : "P";
      if (weeks > 0 && days === 0 && hours === 0 && minutes === 0 && seconds === 0 && milliseconds === 0) {
        iso += `${weeks}W`;
      } else {
        const totalDays = weeks * 7 + days;
        if (totalDays > 0) iso += `${totalDays}D`;
        if (hours > 0 || minutes > 0 || seconds > 0 || milliseconds > 0) {
          iso += "T";
          if (hours > 0) iso += `${hours}H`;
          if (minutes > 0) iso += `${minutes}M`;
          if (seconds > 0 || milliseconds > 0) {
            const totalSec = seconds + milliseconds / 1000;
            iso += `${totalSec % 1 === 0 ? totalSec : totalSec.toFixed(3)}S`;
          }
        }
      }
      if (iso === "P" || iso === "-P") iso = negative ? "-PT0S" : "PT0S";

      return {
        valid: true,
        negative,
        milliseconds: negative ? -totalMs : totalMs,
        seconds: (negative ? -totalMs : totalMs) / MS_PER_SECOND,
        minutes: (negative ? -totalMs : totalMs) / MS_PER_MINUTE,
        hours: (negative ? -totalMs : totalMs) / MS_PER_HOUR,
        days: (negative ? -totalMs : totalMs) / MS_PER_DAY,
        weeks: (negative ? -totalMs : totalMs) / MS_PER_WEEK,
        breakdown: { weeks, days, hours, minutes, seconds, milliseconds },
        human,
        iso,
        startDate: formatISO(startDate),
        endDate: formatISO(endDate),
      };
    },
  },
];
