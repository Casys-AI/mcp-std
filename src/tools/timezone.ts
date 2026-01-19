/**
 * Timezone tools
 *
 * Uses Deno native Intl.DateTimeFormat for timezone operations.
 * No external dependencies.
 *
 * @module lib/std/timezone
 */

import type { MiniTool } from "./types.ts";

// Common timezones with their IANA names
const COMMON_TIMEZONES: Record<string, string> = {
  // Americas
  EST: "America/New_York",
  EDT: "America/New_York",
  CST: "America/Chicago",
  CDT: "America/Chicago",
  MST: "America/Denver",
  MDT: "America/Denver",
  PST: "America/Los_Angeles",
  PDT: "America/Los_Angeles",
  AKST: "America/Anchorage",
  HST: "Pacific/Honolulu",
  // Europe
  GMT: "Europe/London",
  BST: "Europe/London",
  CET: "Europe/Paris",
  CEST: "Europe/Paris",
  EET: "Europe/Athens",
  EEST: "Europe/Athens",
  // Asia
  IST: "Asia/Kolkata",
  JST: "Asia/Tokyo",
  KST: "Asia/Seoul",
  CST_CHINA: "Asia/Shanghai",
  HKT: "Asia/Hong_Kong",
  SGT: "Asia/Singapore",
  // Pacific
  AEST: "Australia/Sydney",
  AEDT: "Australia/Sydney",
  NZST: "Pacific/Auckland",
  NZDT: "Pacific/Auckland",
  // UTC
  UTC: "UTC",
  Z: "UTC",
};

// Major world timezones
const WORLD_TIMEZONES = [
  "Pacific/Midway",
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Atlantic/Azores",
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Europe/Athens",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

export const timezoneTools: MiniTool[] = [
  {
    name: "tz_convert",
    description:
      "Convert time between timezones using native Intl API. Supports IANA timezone names and common abbreviations. Keywords: timezone convert, time zone, convert time, world clock, time difference.",
    category: "timezone",
    inputSchema: {
      type: "object",
      properties: {
        time: {
          type: "string",
          description: "Time to convert (ISO 8601 or 'now'). Default: now",
        },
        from: {
          type: "string",
          description: "Source timezone (IANA name like 'America/New_York' or abbreviation like 'EST')",
        },
        to: {
          type: "string",
          description: "Target timezone (IANA name or abbreviation)",
        },
      },
      required: ["from", "to"],
    },
    handler: ({ time = "now", from, to }) => {
      // Resolve timezone abbreviations to IANA names
      const fromTz = COMMON_TIMEZONES[(from as string).toUpperCase()] || (from as string);
      const toTz = COMMON_TIMEZONES[(to as string).toUpperCase()] || (to as string);

      try {
        // Parse input time
        let date: Date;
        if (time === "now") {
          date = new Date();
        } else {
          date = new Date(time as string);
          if (isNaN(date.getTime())) {
            return { error: "Invalid date format" };
          }
        }

        // Format in source timezone
        const sourceFormatter = new Intl.DateTimeFormat("en-US", {
          timeZone: fromTz,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
          timeZoneName: "short",
        });

        // Format in target timezone
        const targetFormatter = new Intl.DateTimeFormat("en-US", {
          timeZone: toTz,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
          timeZoneName: "short",
        });

        // Get ISO strings
        const sourceIso = new Intl.DateTimeFormat("sv-SE", {
          timeZone: fromTz,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(date).replace(" ", "T");

        const targetIso = new Intl.DateTimeFormat("sv-SE", {
          timeZone: toTz,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(date).replace(" ", "T");

        // Get offsets
        const getOffset = (tz: string): string => {
          const parts = new Intl.DateTimeFormat("en-US", {
            timeZone: tz,
            timeZoneName: "longOffset",
          }).formatToParts(date);
          const offsetPart = parts.find((p) => p.type === "timeZoneName");
          return offsetPart?.value || "";
        };

        return {
          input: time === "now" ? date.toISOString() : time,
          from: {
            timezone: fromTz,
            formatted: sourceFormatter.format(date),
            iso: sourceIso,
            offset: getOffset(fromTz),
          },
          to: {
            timezone: toTz,
            formatted: targetFormatter.format(date),
            iso: targetIso,
            offset: getOffset(toTz),
          },
          utc: date.toISOString(),
        };
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
  },
  {
    name: "tz_world_clock",
    description:
      "Show current time in multiple timezones around the world. Get a quick overview of global times. Use for scheduling across timezones. Keywords: world clock, global time, multiple timezones, time around world.",
    category: "timezone",
    inputSchema: {
      type: "object",
      properties: {
        timezones: {
          type: "array",
          items: { type: "string" },
          description: "Timezones to show (default: major world cities)",
        },
        format: {
          type: "string",
          enum: ["12h", "24h"],
          description: "Time format (default: 24h)",
        },
      },
    },
    handler: ({ timezones, format = "24h" }) => {
      const tzList = (timezones as string[]) || WORLD_TIMEZONES;
      const now = new Date();
      const hour12 = format === "12h";

      const results: Array<{
        timezone: string;
        city: string;
        time: string;
        date: string;
        offset: string;
        dayPeriod: string;
      }> = [];

      for (const tz of tzList) {
        const tzName = COMMON_TIMEZONES[tz.toUpperCase()] || tz;
        try {
          const timeFormatter = new Intl.DateTimeFormat("en-US", {
            timeZone: tzName,
            hour: "2-digit",
            minute: "2-digit",
            hour12,
          });

          const dateFormatter = new Intl.DateTimeFormat("en-US", {
            timeZone: tzName,
            weekday: "short",
            month: "short",
            day: "numeric",
          });

          const offsetFormatter = new Intl.DateTimeFormat("en-US", {
            timeZone: tzName,
            timeZoneName: "shortOffset",
          });

          const offsetParts = offsetFormatter.formatToParts(now);
          const offset = offsetParts.find((p) => p.type === "timeZoneName")?.value || "";

          // Extract city name from IANA timezone
          const city = tzName.split("/").pop()?.replace(/_/g, " ") || tzName;

          // Determine day period (morning, afternoon, evening, night)
          const hourFormatter = new Intl.DateTimeFormat("en-US", {
            timeZone: tzName,
            hour: "numeric",
            hour12: false,
          });
          const hour = parseInt(hourFormatter.format(now), 10);
          let dayPeriod: string;
          if (hour >= 5 && hour < 12) dayPeriod = "morning";
          else if (hour >= 12 && hour < 17) dayPeriod = "afternoon";
          else if (hour >= 17 && hour < 21) dayPeriod = "evening";
          else dayPeriod = "night";

          results.push({
            timezone: tzName,
            city,
            time: timeFormatter.format(now),
            date: dateFormatter.format(now),
            offset,
            dayPeriod,
          });
        } catch {
          // Skip invalid timezone
        }
      }

      return {
        referenceTime: now.toISOString(),
        locations: results,
        count: results.length,
      };
    },
  },
  {
    name: "tz_offset",
    description:
      "Get UTC offset for a timezone at a specific time. Handles daylight saving time automatically. Keywords: timezone offset, UTC offset, DST, daylight saving, time difference.",
    category: "timezone",
    inputSchema: {
      type: "object",
      properties: {
        timezone: { type: "string", description: "Timezone (IANA name or abbreviation)" },
        date: { type: "string", description: "Date to check offset (default: now)" },
      },
      required: ["timezone"],
    },
    handler: ({ timezone, date }) => {
      const tz = COMMON_TIMEZONES[(timezone as string).toUpperCase()] || (timezone as string);
      const targetDate = date ? new Date(date as string) : new Date();

      if (isNaN(targetDate.getTime())) {
        return { error: "Invalid date" };
      }

      try {
        // Get offset parts
        const formatter = new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          timeZoneName: "longOffset",
        });
        const parts = formatter.formatToParts(targetDate);
        const offsetStr = parts.find((p) => p.type === "timeZoneName")?.value || "";

        // Parse offset to minutes
        const offsetMatch = offsetStr.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
        let offsetMinutes = 0;
        if (offsetMatch) {
          const sign = offsetMatch[1] === "+" ? 1 : -1;
          const hours = parseInt(offsetMatch[2], 10);
          const mins = parseInt(offsetMatch[3] || "0", 10);
          offsetMinutes = sign * (hours * 60 + mins);
        }

        // Check if DST is active
        const jan = new Date(targetDate.getFullYear(), 0, 1);
        const jul = new Date(targetDate.getFullYear(), 6, 1);

        const janFormatter = new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          timeZoneName: "longOffset",
        });
        const julFormatter = new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          timeZoneName: "longOffset",
        });

        const janOffset = janFormatter.formatToParts(jan).find((p) => p.type === "timeZoneName")?.value || "";
        const julOffset = julFormatter.formatToParts(jul).find((p) => p.type === "timeZoneName")?.value || "";

        const hasDst = janOffset !== julOffset;
        const isDst = hasDst && offsetStr === (offsetMinutes > 0 ? julOffset : janOffset);

        return {
          timezone: tz,
          date: targetDate.toISOString(),
          offset: offsetStr,
          offsetMinutes,
          offsetHours: offsetMinutes / 60,
          hasDst,
          isDstActive: isDst,
        };
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
  },
  {
    name: "tz_list",
    description:
      "List available timezones, optionally filtered by region. Get IANA timezone names for use in other tools. Keywords: timezone list, IANA timezones, available timezones, timezone names.",
    category: "timezone",
    inputSchema: {
      type: "object",
      properties: {
        region: {
          type: "string",
          enum: ["Africa", "America", "Antarctica", "Asia", "Atlantic", "Australia", "Europe", "Indian", "Pacific", "all"],
          description: "Filter by region (default: all)",
        },
        includeAbbreviations: {
          type: "boolean",
          description: "Include common abbreviations (default: true)",
        },
      },
    },
    handler: ({ region = "all", includeAbbreviations = true }) => {
      // Get supported timezones (Deno supports all IANA timezones)
      const allTimezones = Intl.supportedValuesOf("timeZone");

      let filtered = allTimezones;
      if (region !== "all") {
        filtered = allTimezones.filter((tz) => tz.startsWith(region as string));
      }

      // Group by region
      const byRegion: Record<string, string[]> = {};
      for (const tz of filtered) {
        const parts = tz.split("/");
        const reg = parts[0];
        if (!byRegion[reg]) byRegion[reg] = [];
        byRegion[reg].push(tz);
      }

      const result: {
        timezones: string[];
        byRegion: Record<string, string[]>;
        count: number;
        abbreviations?: Record<string, string>;
      } = {
        timezones: filtered,
        byRegion,
        count: filtered.length,
      };

      if (includeAbbreviations) {
        result.abbreviations = COMMON_TIMEZONES;
      }

      return result;
    },
  },
  {
    name: "tz_meeting_planner",
    description:
      "Find suitable meeting times across multiple timezones. Suggest times that work for all participants within working hours. Keywords: meeting planner, schedule meeting, working hours, cross-timezone, best time.",
    category: "timezone",
    inputSchema: {
      type: "object",
      properties: {
        timezones: {
          type: "array",
          items: { type: "string" },
          description: "Participant timezones",
        },
        date: { type: "string", description: "Target date (default: today)" },
        workStart: { type: "number", description: "Work day start hour (default: 9)" },
        workEnd: { type: "number", description: "Work day end hour (default: 17)" },
        duration: { type: "number", description: "Meeting duration in minutes (default: 60)" },
      },
      required: ["timezones"],
    },
    handler: ({ timezones, date, workStart = 9, workEnd = 17, duration = 60 }) => {
      const tzList = (timezones as string[]).map(
        (tz) => COMMON_TIMEZONES[tz.toUpperCase()] || tz
      );
      const targetDate = date ? new Date(date as string) : new Date();
      targetDate.setHours(0, 0, 0, 0);

      const start = workStart as number;
      const end = workEnd as number;
      const dur = duration as number;

      // Check each hour slot
      const goodSlots: Array<{
        utc: string;
        times: Array<{ timezone: string; time: string; withinWorkHours: boolean }>;
        allWithinWorkHours: boolean;
      }> = [];

      for (let hour = 0; hour < 24; hour++) {
        const slotStart = new Date(targetDate);
        slotStart.setUTCHours(hour, 0, 0, 0);

        const times: Array<{ timezone: string; time: string; withinWorkHours: boolean }> = [];
        let allWithin = true;

        for (const tz of tzList) {
          try {
            const formatter = new Intl.DateTimeFormat("en-US", {
              timeZone: tz,
              hour: "numeric",
              minute: "2-digit",
              hour12: false,
            });
            const localTime = formatter.format(slotStart);
            const localHour = parseInt(localTime.split(":")[0], 10);
            const withinWorkHours = localHour >= start && localHour + dur / 60 <= end;

            if (!withinWorkHours) allWithin = false;

            times.push({
              timezone: tz,
              time: localTime,
              withinWorkHours,
            });
          } catch {
            // Skip invalid timezone
          }
        }

        goodSlots.push({
          utc: slotStart.toISOString(),
          times,
          allWithinWorkHours: allWithin,
        });
      }

      // Filter to only slots where everyone is within work hours
      const recommendedSlots = goodSlots.filter((s) => s.allWithinWorkHours);

      return {
        date: targetDate.toISOString().split("T")[0],
        workHours: { start, end },
        duration: dur,
        participants: tzList.length,
        recommendedSlots: recommendedSlots.slice(0, 5),
        allSlots: goodSlots,
        noOverlap: recommendedSlots.length === 0,
      };
    },
  },
];
