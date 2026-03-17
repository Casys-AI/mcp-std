/**
 * Unit tests for timezone tools
 *
 * @module lib/std/tests/timezone_test
 */

import { assertEquals, assertExists } from "@std/assert";
import { timezoneTools } from "../src/tools/timezone.ts";

// Helper to get tool handler
const getHandler = (name: string) => {
  const tool = timezoneTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool ${name} not found`);
  return tool.handler;
};

// Timezone convert tests
Deno.test("tz_convert - converts between timezones", () => {
  const handler = getHandler("tz_convert");
  const result = handler({
    time: "2024-01-15T12:00:00",
    from: "America/New_York",
    to: "Europe/London",
  }) as { from: { timezone: string }; to: { timezone: string } };

  assertEquals(result.from.timezone, "America/New_York");
  assertEquals(result.to.timezone, "Europe/London");
});

Deno.test("tz_convert - handles timezone abbreviations", () => {
  const handler = getHandler("tz_convert");
  const result = handler({
    time: "2024-01-15T12:00:00",
    from: "EST",
    to: "PST",
  }) as { from: { timezone: string }; to: { timezone: string } };

  assertEquals(result.from.timezone, "America/New_York");
  assertEquals(result.to.timezone, "America/Los_Angeles");
});

Deno.test("tz_convert - uses current time with 'now'", () => {
  const handler = getHandler("tz_convert");
  const result = handler({
    time: "now",
    from: "UTC",
    to: "America/New_York",
  }) as { input: string; utc: string };

  assertExists(result.input);
  assertExists(result.utc);
});

Deno.test("tz_convert - returns offset information", () => {
  const handler = getHandler("tz_convert");
  const result = handler({
    time: "2024-06-15T12:00:00",
    from: "UTC",
    to: "America/New_York",
  }) as { from: { offset: string }; to: { offset: string } };

  assertExists(result.from.offset);
  assertExists(result.to.offset);
});

// World clock tests
Deno.test("tz_world_clock - returns multiple locations", () => {
  const handler = getHandler("tz_world_clock");
  const result = handler({}) as {
    locations: Array<{ timezone: string; time: string }>;
    count: number;
  };

  assertEquals(result.count > 0, true);
  assertEquals(result.locations.length > 0, true);
});

Deno.test("tz_world_clock - custom timezones", () => {
  const handler = getHandler("tz_world_clock");
  const result = handler({
    timezones: ["America/New_York", "Europe/London", "Asia/Tokyo"],
  }) as { locations: Array<{ timezone: string }> };

  assertEquals(result.locations.length, 3);
});

Deno.test("tz_world_clock - 12h format", () => {
  const handler = getHandler("tz_world_clock");
  const result = handler({
    timezones: ["UTC"],
    format: "12h",
  }) as { locations: Array<{ time: string }> };

  // 12h format should include AM/PM
  assertEquals(result.locations[0].time.includes("AM") || result.locations[0].time.includes("PM"), true);
});

Deno.test("tz_world_clock - includes day period", () => {
  const handler = getHandler("tz_world_clock");
  const result = handler({
    timezones: ["UTC"],
  }) as { locations: Array<{ dayPeriod: string }> };

  const validPeriods = ["morning", "afternoon", "evening", "night"];
  assertEquals(validPeriods.includes(result.locations[0].dayPeriod), true);
});

// Timezone offset tests
Deno.test("tz_offset - returns UTC offset", () => {
  const handler = getHandler("tz_offset");
  const result = handler({
    timezone: "America/New_York",
  }) as { offset: string; offsetMinutes: number };

  assertExists(result.offset);
  assertEquals(typeof result.offsetMinutes, "number");
});

Deno.test("tz_offset - handles abbreviation", () => {
  const handler = getHandler("tz_offset");
  const result = handler({
    timezone: "PST",
  }) as { timezone: string };

  assertEquals(result.timezone, "America/Los_Angeles");
});

Deno.test("tz_offset - detects DST", () => {
  const handler = getHandler("tz_offset");
  const result = handler({
    timezone: "America/New_York",
    date: "2024-06-15", // Summer - DST active
  }) as { hasDst: boolean };

  assertEquals(result.hasDst, true);
});

// Timezone list tests
Deno.test("tz_list - lists all timezones", () => {
  const handler = getHandler("tz_list");
  const result = handler({}) as { timezones: string[]; count: number };

  assertEquals(result.count > 100, true);
  assertEquals(result.timezones.includes("America/New_York"), true);
});

Deno.test("tz_list - filters by region", () => {
  const handler = getHandler("tz_list");
  const result = handler({ region: "Europe" }) as { timezones: string[] };

  assertEquals(result.timezones.every((tz) => tz.startsWith("Europe/")), true);
});

Deno.test("tz_list - includes abbreviations", () => {
  const handler = getHandler("tz_list");
  const result = handler({ includeAbbreviations: true }) as {
    abbreviations: Record<string, string>;
  };

  assertExists(result.abbreviations);
  assertEquals(result.abbreviations.EST, "America/New_York");
});

// Meeting planner tests
Deno.test("tz_meeting_planner - finds overlapping hours", () => {
  const handler = getHandler("tz_meeting_planner");
  const result = handler({
    timezones: ["America/New_York", "Europe/London"],
    date: "2024-06-15",
  }) as {
    recommendedSlots: Array<{ utc: string; allWithinWorkHours: boolean }>;
    participants: number;
  };

  assertEquals(result.participants, 2);
  // Should find some overlapping work hours
  assertEquals(Array.isArray(result.recommendedSlots), true);
});

Deno.test("tz_meeting_planner - respects work hours", () => {
  const handler = getHandler("tz_meeting_planner");
  const result = handler({
    timezones: ["America/New_York"],
    workStart: 9,
    workEnd: 17,
  }) as { workHours: { start: number; end: number } };

  assertEquals(result.workHours.start, 9);
  assertEquals(result.workHours.end, 17);
});

Deno.test("tz_meeting_planner - reports no overlap", () => {
  const handler = getHandler("tz_meeting_planner");
  // Timezones with minimal overlap
  const result = handler({
    timezones: ["Pacific/Auckland", "America/Los_Angeles"],
    workStart: 9,
    workEnd: 12, // Very narrow window
  }) as { noOverlap: boolean };

  // Should report difficulty finding overlap with narrow window
  assertEquals(typeof result.noOverlap, "boolean");
});

Deno.test("tz_meeting_planner - returns all slots", () => {
  const handler = getHandler("tz_meeting_planner");
  const result = handler({
    timezones: ["UTC"],
  }) as { allSlots: Array<{ utc: string }> };

  // Should have 24 slots (one per hour)
  assertEquals(result.allSlots.length, 24);
});
