/**
 * Date/time manipulation tools
 *
 * Uses date-fns for robust date handling.
 *
 * @module lib/primitives/datetime
 */

import {
  format,
  parse,
  parseISO,
  differenceInSeconds,
  differenceInMinutes,
  differenceInHours,
  differenceInDays,
  differenceInWeeks,
  differenceInMonths,
  differenceInYears,
  addSeconds,
  addMinutes,
  addHours,
  addDays,
  addWeeks,
  addMonths,
  addYears,
  getYear,
  getMonth,
  getDate,
  getHours,
  getMinutes,
  getSeconds,
  getDay,
  formatISO,
  getUnixTime,
} from "date-fns";
import type { MiniTool } from "./types.ts";

export const datetimeTools: MiniTool[] = [
  {
    name: "datetime_now",
    description: "Get current date/time in various formats",
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
      "Format a date using date-fns pattern (yyyy, MM, dd, HH, mm, ss, etc.)",
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
    description: "Calculate difference between two dates",
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
    description: "Add/subtract time from a date",
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
    description: "Parse a date string and return components",
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
];
