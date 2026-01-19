/**
 * Developer utility tools
 *
 * Pure Deno implementations - no external dependencies.
 * Semver, env parsing, roman numerals, regex tools.
 *
 * @module lib/std/devtools
 */

import type { MiniTool } from "./types.ts";

// Semver regex (simplified but covers most cases)
const SEMVER_REGEX = /^v?(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.-]+))?(?:\+([a-zA-Z0-9.-]+))?$/;

// Parse semver string
function parseSemver(
  version: string
): { major: number; minor: number; patch: number; prerelease: string | null; build: string | null } | null {
  const match = version.match(SEMVER_REGEX);
  if (!match) return null;

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] || null,
    build: match[5] || null,
  };
}

// Compare prerelease strings
function comparePrereleases(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (!a && b) return 1; // No prerelease > prerelease
  if (a && !b) return -1;

  const partsA = a!.split(".");
  const partsB = b!.split(".");

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const pa = partsA[i];
    const pb = partsB[i];

    if (pa === undefined) return -1;
    if (pb === undefined) return 1;

    const numA = parseInt(pa, 10);
    const numB = parseInt(pb, 10);
    const isNumA = !isNaN(numA) && String(numA) === pa;
    const isNumB = !isNaN(numB) && String(numB) === pb;

    if (isNumA && isNumB) {
      if (numA < numB) return -1;
      if (numA > numB) return 1;
    } else if (isNumA) {
      return -1; // Numbers sort before strings
    } else if (isNumB) {
      return 1;
    } else {
      if (pa < pb) return -1;
      if (pa > pb) return 1;
    }
  }

  return 0;
}

export const devtoolsTools: MiniTool[] = [
  // Semver tools
  {
    name: "semver_parse",
    description:
      "Parse semantic version string into components. Extract major, minor, patch, prerelease, and build metadata. Validate semver format. Keywords: semver parse, version parse, semantic version, version components, parse version string.",
    category: "devtools",
    inputSchema: {
      type: "object",
      properties: {
        version: { type: "string", description: "Version string (e.g., 1.2.3-beta.1+build.123)" },
      },
      required: ["version"],
    },
    handler: ({ version }) => {
      const parsed = parseSemver(version as string);
      if (!parsed) {
        return { valid: false, error: "Invalid semver format" };
      }
      return {
        valid: true,
        version: version,
        ...parsed,
        normalized: `${parsed.major}.${parsed.minor}.${parsed.patch}${parsed.prerelease ? `-${parsed.prerelease}` : ""}`,
      };
    },
  },
  {
    name: "semver_compare",
    description:
      "Compare two semantic versions. Returns -1, 0, or 1 for less than, equal, or greater than. Handles prerelease versions correctly per semver spec. Keywords: semver compare, version compare, compare versions, version order, semver sort.",
    category: "devtools",
    inputSchema: {
      type: "object",
      properties: {
        version1: { type: "string", description: "First version" },
        version2: { type: "string", description: "Second version" },
      },
      required: ["version1", "version2"],
    },
    handler: ({ version1, version2 }) => {
      const v1 = parseSemver(version1 as string);
      const v2 = parseSemver(version2 as string);

      if (!v1 || !v2) {
        return { error: "Invalid semver format" };
      }

      let result: number;
      if (v1.major !== v2.major) {
        result = v1.major < v2.major ? -1 : 1;
      } else if (v1.minor !== v2.minor) {
        result = v1.minor < v2.minor ? -1 : 1;
      } else if (v1.patch !== v2.patch) {
        result = v1.patch < v2.patch ? -1 : 1;
      } else {
        result = comparePrereleases(v1.prerelease, v2.prerelease);
      }

      return {
        version1,
        version2,
        comparison: result,
        isGreater: result > 0,
        isLess: result < 0,
        isEqual: result === 0,
        description:
          result === 0 ? "equal" : result > 0 ? `${version1} > ${version2}` : `${version1} < ${version2}`,
      };
    },
  },
  {
    name: "semver_satisfies",
    description:
      "Check if a version satisfies a range constraint. Supports operators: ^, ~, >, <, >=, <=, =, -. Keywords: semver range, version constraint, satisfies range, npm version, version match.",
    category: "devtools",
    inputSchema: {
      type: "object",
      properties: {
        version: { type: "string", description: "Version to test" },
        range: { type: "string", description: "Range constraint (e.g., ^1.2.0, ~1.2.0, >=1.0.0 <2.0.0)" },
      },
      required: ["version", "range"],
    },
    handler: ({ version, range }) => {
      const v = parseSemver(version as string);
      if (!v) return { error: "Invalid version" };

      const rangeStr = (range as string).trim();

      // Helper to check a single constraint
      const checkConstraint = (constraint: string): boolean => {
        constraint = constraint.trim();
        if (!constraint) return true;

        // Caret range: ^1.2.3 means >=1.2.3 <2.0.0 (or <1.3.0 if 0.x)
        if (constraint.startsWith("^")) {
          const target = parseSemver(constraint.slice(1));
          if (!target) return false;

          if (v.major !== target.major) return false;
          if (target.major === 0) {
            if (v.minor !== target.minor) return false;
            return v.patch >= target.patch;
          }
          if (v.minor < target.minor) return false;
          if (v.minor === target.minor && v.patch < target.patch) return false;
          return true;
        }

        // Tilde range: ~1.2.3 means >=1.2.3 <1.3.0
        if (constraint.startsWith("~")) {
          const target = parseSemver(constraint.slice(1));
          if (!target) return false;

          return v.major === target.major && v.minor === target.minor && v.patch >= target.patch;
        }

        // Comparison operators
        const opMatch = constraint.match(/^(>=|<=|>|<|=)?(.+)$/);
        if (!opMatch) return false;

        const op = opMatch[1] || "=";
        const target = parseSemver(opMatch[2]);
        if (!target) return false;

        const cmp =
          v.major !== target.major
            ? v.major - target.major
            : v.minor !== target.minor
              ? v.minor - target.minor
              : v.patch - target.patch;

        switch (op) {
          case ">=":
            return cmp >= 0;
          case "<=":
            return cmp <= 0;
          case ">":
            return cmp > 0;
          case "<":
            return cmp < 0;
          default:
            return cmp === 0;
        }
      };

      // Handle hyphen range: 1.0.0 - 2.0.0 means >=1.0.0 <=2.0.0
      if (rangeStr.includes(" - ")) {
        const [start, end] = rangeStr.split(" - ").map((s) => s.trim());
        return {
          version,
          range,
          satisfies: checkConstraint(`>=${start}`) && checkConstraint(`<=${end}`),
        };
      }

      // Handle OR (||)
      if (rangeStr.includes("||")) {
        const orParts = rangeStr.split("||").map((s) => s.trim());
        const satisfies = orParts.some((part) => {
          const andParts = part.split(/\s+/);
          return andParts.every(checkConstraint);
        });
        return { version, range, satisfies };
      }

      // Handle AND (space-separated)
      const constraints = rangeStr.split(/\s+/);
      const satisfies = constraints.every(checkConstraint);

      return { version, range, satisfies };
    },
  },
  {
    name: "semver_bump",
    description:
      "Bump a semantic version by major, minor, or patch. Optionally add prerelease suffix. Use for release automation. Keywords: semver bump, version bump, increment version, next version, release version.",
    category: "devtools",
    inputSchema: {
      type: "object",
      properties: {
        version: { type: "string", description: "Current version" },
        type: {
          type: "string",
          enum: ["major", "minor", "patch", "prerelease"],
          description: "Bump type",
        },
        preid: { type: "string", description: "Prerelease identifier (e.g., alpha, beta, rc)" },
      },
      required: ["version", "type"],
    },
    handler: ({ version, type, preid }) => {
      const v = parseSemver(version as string);
      if (!v) return { error: "Invalid version" };

      let newVersion: string;
      switch (type) {
        case "major":
          newVersion = `${v.major + 1}.0.0`;
          break;
        case "minor":
          newVersion = `${v.major}.${v.minor + 1}.0`;
          break;
        case "patch":
          newVersion = `${v.major}.${v.minor}.${v.patch + 1}`;
          break;
        case "prerelease":
          if (v.prerelease) {
            // Increment prerelease number
            const parts = v.prerelease.split(".");
            const lastIdx = parts.length - 1;
            const num = parseInt(parts[lastIdx], 10);
            if (!isNaN(num)) {
              parts[lastIdx] = String(num + 1);
            } else {
              parts.push("1");
            }
            newVersion = `${v.major}.${v.minor}.${v.patch}-${parts.join(".")}`;
          } else {
            const id = (preid as string) || "alpha";
            newVersion = `${v.major}.${v.minor}.${v.patch + 1}-${id}.0`;
          }
          break;
        default:
          return { error: "Invalid bump type" };
      }

      return {
        from: version,
        to: newVersion,
        type,
      };
    },
  },

  // Roman numerals
  {
    name: "roman_convert",
    description:
      "Convert between Roman numerals and decimal numbers. Supports numbers 1-3999. Use for display, document numbering, or novelty. Keywords: roman numerals, convert roman, decimal to roman, roman to decimal, XIV.",
    category: "devtools",
    inputSchema: {
      type: "object",
      properties: {
        value: { type: "string", description: "Number or Roman numeral" },
        action: {
          type: "string",
          enum: ["toRoman", "toDecimal", "auto"],
          description: "Conversion direction (auto-detect if not specified)",
        },
      },
      required: ["value"],
    },
    handler: ({ value, action = "auto" }) => {
      const input = (value as string).trim();

      const romanValues: [string, number][] = [
        ["M", 1000], ["CM", 900], ["D", 500], ["CD", 400],
        ["C", 100], ["XC", 90], ["L", 50], ["XL", 40],
        ["X", 10], ["IX", 9], ["V", 5], ["IV", 4], ["I", 1],
      ];

      const toRoman = (num: number): string => {
        if (num < 1 || num > 3999) throw new Error("Number must be 1-3999");
        let result = "";
        let remaining = num;
        for (const [numeral, val] of romanValues) {
          while (remaining >= val) {
            result += numeral;
            remaining -= val;
          }
        }
        return result;
      };

      const toDecimal = (roman: string): number => {
        const upper = roman.toUpperCase();
        let result = 0;
        let i = 0;
        for (const [numeral, val] of romanValues) {
          while (upper.slice(i, i + numeral.length) === numeral) {
            result += val;
            i += numeral.length;
          }
        }
        if (i !== upper.length) throw new Error("Invalid Roman numeral");
        return result;
      };

      // Auto-detect direction
      let direction = action;
      if (direction === "auto") {
        direction = /^[IVXLCDM]+$/i.test(input) ? "toDecimal" : "toRoman";
      }

      try {
        if (direction === "toRoman") {
          const num = parseInt(input, 10);
          if (isNaN(num)) return { error: "Invalid number" };
          return { decimal: num, roman: toRoman(num) };
        } else {
          const num = toDecimal(input);
          return { roman: input.toUpperCase(), decimal: num };
        }
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
  },

  // Env parser
  {
    name: "env_parse",
    description:
      "Parse .env file content into key-value object. Handles comments, quoted values, multiline, and export prefix. Use for config parsing and validation. Keywords: parse env, dotenv, .env file, environment variables, config parse.",
    category: "devtools",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: ".env file content" },
        expand: { type: "boolean", description: "Expand ${VAR} references (default: false)" },
      },
      required: ["content"],
    },
    handler: ({ content, expand = false }) => {
      const lines = (content as string).split(/\r?\n/);
      const result: Record<string, string> = {};
      const errors: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();

        // Skip empty lines and comments
        if (!line || line.startsWith("#")) continue;

        // Remove 'export ' prefix
        if (line.startsWith("export ")) {
          line = line.slice(7).trim();
        }

        // Find key=value separator
        const eqIdx = line.indexOf("=");
        if (eqIdx === -1) {
          errors.push(`Line ${i + 1}: Missing '=' in "${line.slice(0, 20)}..."`);
          continue;
        }

        const key = line.slice(0, eqIdx).trim();
        let value = line.slice(eqIdx + 1).trim();

        // Handle quoted values
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
          // Handle escape sequences in double quotes
          if (line.slice(eqIdx + 1).trim().startsWith('"')) {
            value = value
              .replace(/\\n/g, "\n")
              .replace(/\\r/g, "\r")
              .replace(/\\t/g, "\t")
              .replace(/\\\\/g, "\\")
              .replace(/\\"/g, '"');
          }
        } else {
          // Remove inline comments for unquoted values
          const hashIdx = value.indexOf(" #");
          if (hashIdx !== -1) {
            value = value.slice(0, hashIdx).trim();
          }
        }

        result[key] = value;
      }

      // Expand variables if requested
      if (expand) {
        const expandValue = (val: string): string => {
          return val.replace(/\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, braced, plain) => {
            const varName = braced || plain;
            return result[varName] ?? "";
          });
        };

        for (const key of Object.keys(result)) {
          result[key] = expandValue(result[key]);
        }
      }

      return {
        variables: result,
        count: Object.keys(result).length,
        errors: errors.length > 0 ? errors : undefined,
      };
    },
  },
  {
    name: "env_stringify",
    description:
      "Convert object to .env file format. Properly quote values with spaces or special characters. Use for generating config files. Keywords: generate env, create env file, object to env, dotenv generate.",
    category: "devtools",
    inputSchema: {
      type: "object",
      properties: {
        variables: { type: "object", description: "Key-value pairs" },
        comments: { type: "object", description: "Optional comments for keys" },
        sort: { type: "boolean", description: "Sort keys alphabetically" },
      },
      required: ["variables"],
    },
    handler: ({ variables, comments = {}, sort = false }) => {
      const vars = variables as Record<string, unknown>;
      const cmt = comments as Record<string, string>;
      let keys = Object.keys(vars);
      if (sort) keys = keys.sort();

      const lines: string[] = [];
      for (const key of keys) {
        const value = String(vars[key] ?? "");

        // Add comment if present
        if (cmt[key]) {
          lines.push(`# ${cmt[key]}`);
        }

        // Determine if quoting is needed
        const needsQuotes = /[\s#"'\\]/.test(value) || value.includes("\n");

        if (needsQuotes) {
          // Use double quotes and escape
          const escaped = value
            .replace(/\\/g, "\\\\")
            .replace(/"/g, '\\"')
            .replace(/\n/g, "\\n")
            .replace(/\r/g, "\\r")
            .replace(/\t/g, "\\t");
          lines.push(`${key}="${escaped}"`);
        } else {
          lines.push(`${key}=${value}`);
        }
      }

      return lines.join("\n");
    },
  },

  // Cron generator (inverse of parse)
  {
    name: "cron_generate",
    description:
      "Generate cron expression from human-readable description. Create cron syntax for scheduling. Supports common patterns. Keywords: cron generate, create cron, cron expression, schedule cron, crontab create.",
    category: "devtools",
    inputSchema: {
      type: "object",
      properties: {
        minute: { type: "string", description: "Minute (0-59, *, */N, or list)" },
        hour: { type: "string", description: "Hour (0-23, *, */N, or list)" },
        dayOfMonth: { type: "string", description: "Day of month (1-31, *, */N, or list)" },
        month: { type: "string", description: "Month (1-12, *, */N, JAN-DEC, or list)" },
        dayOfWeek: { type: "string", description: "Day of week (0-6, *, SUN-SAT, or list)" },
        preset: {
          type: "string",
          enum: [
            "every_minute",
            "every_5_minutes",
            "every_15_minutes",
            "every_30_minutes",
            "hourly",
            "daily",
            "weekly",
            "monthly",
            "yearly",
            "weekdays",
            "weekends",
          ],
          description: "Use a preset instead of individual fields",
        },
      },
    },
    handler: ({ minute = "*", hour = "*", dayOfMonth = "*", month = "*", dayOfWeek = "*", preset }) => {
      const presets: Record<string, string> = {
        every_minute: "* * * * *",
        every_5_minutes: "*/5 * * * *",
        every_15_minutes: "*/15 * * * *",
        every_30_minutes: "*/30 * * * *",
        hourly: "0 * * * *",
        daily: "0 0 * * *",
        weekly: "0 0 * * 0",
        monthly: "0 0 1 * *",
        yearly: "0 0 1 1 *",
        weekdays: "0 0 * * 1-5",
        weekends: "0 0 * * 0,6",
      };

      if (preset && presets[preset as string]) {
        const cron = presets[preset as string];
        return {
          cron,
          preset,
          description: descrizeCron(cron),
        };
      }

      const cron = `${minute} ${hour} ${dayOfMonth} ${month} ${dayOfWeek}`;
      return {
        cron,
        fields: { minute, hour, dayOfMonth, month, dayOfWeek },
        description: descrizeCron(cron),
      };
    },
  },

  // Number base converter
  {
    name: "base_convert",
    description:
      "Convert numbers between different bases (binary, octal, decimal, hex, base36). Supports bases 2-36. Use for debugging, encoding, or display. Keywords: base convert, binary convert, hex convert, radix, number base.",
    category: "devtools",
    inputSchema: {
      type: "object",
      properties: {
        value: { type: "string", description: "Number to convert" },
        fromBase: { type: "number", description: "Source base (2-36, default: 10)" },
        toBase: { type: "number", description: "Target base (2-36, default: 16)" },
      },
      required: ["value"],
    },
    handler: ({ value, fromBase = 10, toBase = 16 }) => {
      const from = fromBase as number;
      const to = toBase as number;

      if (from < 2 || from > 36 || to < 2 || to > 36) {
        return { error: "Base must be between 2 and 36" };
      }

      try {
        const decimal = parseInt((value as string).replace(/^0[xXbBoO]/, ""), from);
        if (isNaN(decimal)) {
          return { error: "Invalid number for the given base" };
        }

        const converted = decimal.toString(to);

        return {
          original: value,
          fromBase: from,
          toBase: to,
          decimal,
          converted: to === 16 ? converted.toUpperCase() : converted,
          prefixed: to === 2 ? `0b${converted}` : to === 8 ? `0o${converted}` : to === 16 ? `0x${converted.toUpperCase()}` : converted,
        };
      } catch {
        return { error: "Conversion failed" };
      }
    },
  },

  // Regex explain (basic)
  {
    name: "regex_test",
    description:
      "Test a regular expression against text. Returns all matches with positions and captured groups. Validate and debug regex patterns. Keywords: regex test, test regex, regex match, regex validate, pattern match.",
    category: "devtools",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regular expression pattern" },
        text: { type: "string", description: "Text to test against" },
        flags: { type: "string", description: "Regex flags (g, i, m, s, u)" },
      },
      required: ["pattern", "text"],
    },
    handler: ({ pattern, text, flags = "g" }) => {
      try {
        const regex = new RegExp(pattern as string, flags as string);
        const matches: Array<{
          match: string;
          index: number;
          groups: string[];
          namedGroups?: Record<string, string>;
        }> = [];

        const txt = text as string;

        if ((flags as string).includes("g")) {
          let match;
          while ((match = regex.exec(txt)) !== null) {
            matches.push({
              match: match[0],
              index: match.index,
              groups: match.slice(1),
              namedGroups: match.groups,
            });
            // Prevent infinite loops for zero-width matches
            if (match[0].length === 0) regex.lastIndex++;
          }
        } else {
          const match = regex.exec(txt);
          if (match) {
            matches.push({
              match: match[0],
              index: match.index,
              groups: match.slice(1),
              namedGroups: match.groups,
            });
          }
        }

        return {
          pattern,
          flags,
          valid: true,
          matches,
          matchCount: matches.length,
          hasMatch: matches.length > 0,
        };
      } catch (e) {
        return { valid: false, error: (e as Error).message };
      }
    },
  },
];

// Helper to describe cron expression
function descrizeCron(cron: string): string {
  const [minute, hour, dom, month, dow] = cron.split(" ");

  const parts: string[] = [];

  // Minute
  if (minute === "*") {
    parts.push("every minute");
  } else if (minute.startsWith("*/")) {
    parts.push(`every ${minute.slice(2)} minutes`);
  } else if (minute === "0") {
    parts.push("at minute 0");
  } else {
    parts.push(`at minute ${minute}`);
  }

  // Hour
  if (hour !== "*") {
    if (hour.startsWith("*/")) {
      parts.push(`every ${hour.slice(2)} hours`);
    } else {
      parts.push(`at hour ${hour}`);
    }
  }

  // Day of month
  if (dom !== "*") {
    parts.push(`on day ${dom}`);
  }

  // Month
  if (month !== "*") {
    parts.push(`in month ${month}`);
  }

  // Day of week
  if (dow !== "*") {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    if (dow === "0,6") {
      parts.push("on weekends");
    } else if (dow === "1-5") {
      parts.push("on weekdays");
    } else {
      const dayNum = parseInt(dow, 10);
      if (!isNaN(dayNum) && days[dayNum]) {
        parts.push(`on ${days[dayNum]}`);
      } else {
        parts.push(`on day of week ${dow}`);
      }
    }
  }

  return parts.join(", ");
}
