/**
 * Math calculation tools
 *
 * Uses mathjs for safe expression evaluation and simple-statistics for stats.
 *
 * Inspired by:
 * - IT-Tools MCP: https://github.com/wrenchpilot/it-tools-mcp
 * - Math MCP: https://github.com/EthanHenrickson/math-mcp
 *
 * @module lib/std/math
 */

import { evaluate } from "mathjs";
import * as ss from "simple-statistics";
import type { MiniTool } from "./types.ts";

export const mathTools: MiniTool[] = [
  {
    name: "math_eval",
    description:
      "Evaluate a math expression safely (supports +, -, *, /, %, ^, sqrt, sin, cos, log, etc.)",
    category: "math",
    inputSchema: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "Math expression (e.g., '2 + 3 * 4', 'sqrt(16)', 'sin(pi/2)')",
        },
      },
      required: ["expression"],
    },
    handler: ({ expression }) => {
      try {
        return evaluate(expression as string);
      } catch (e) {
        throw new Error(`Invalid expression: ${(e as Error).message}`);
      }
    },
  },
  {
    name: "math_stats",
    description:
      "Calculate statistics (min, max, sum, mean, median, stddev, variance) for an array of numbers",
    category: "math",
    inputSchema: {
      type: "object",
      properties: {
        numbers: { type: "array", items: { type: "number" }, description: "Array of numbers" },
      },
      required: ["numbers"],
    },
    handler: ({ numbers }) => {
      const nums = numbers as number[];
      if (nums.length === 0) {
        return { min: 0, max: 0, sum: 0, mean: 0, median: 0, stddev: 0, variance: 0, count: 0 };
      }
      return {
        min: ss.min(nums),
        max: ss.max(nums),
        sum: ss.sum(nums),
        mean: ss.mean(nums),
        median: ss.median(nums),
        stddev: nums.length > 1 ? ss.standardDeviation(nums) : 0,
        variance: nums.length > 1 ? ss.variance(nums) : 0,
        count: nums.length,
      };
    },
  },
  {
    name: "math_round",
    description: "Round a number to specified decimal places",
    category: "math",
    inputSchema: {
      type: "object",
      properties: {
        number: { type: "number", description: "Number to round" },
        decimals: { type: "number", description: "Decimal places (default: 0)" },
        mode: { type: "string", enum: ["round", "floor", "ceil"], description: "Rounding mode" },
      },
      required: ["number"],
    },
    handler: ({ number, decimals = 0, mode = "round" }) => {
      const factor = Math.pow(10, decimals as number);
      const n = (number as number) * factor;
      let result: number;
      switch (mode) {
        case "floor":
          result = Math.floor(n);
          break;
        case "ceil":
          result = Math.ceil(n);
          break;
        default:
          result = Math.round(n);
      }
      return result / factor;
    },
  },
  {
    name: "math_random",
    description: "Generate random number(s) within a range",
    category: "math",
    inputSchema: {
      type: "object",
      properties: {
        min: { type: "number", description: "Minimum value (default: 0)" },
        max: { type: "number", description: "Maximum value (default: 100)" },
        count: { type: "number", description: "How many numbers (default: 1)" },
        integer: { type: "boolean", description: "Integer only (default: true)" },
      },
    },
    handler: ({ min = 0, max = 100, count = 1, integer = true }) => {
      const generate = () => {
        const n = Math.random() * ((max as number) - (min as number)) + (min as number);
        return integer ? Math.floor(n) : n;
      };
      const cnt = count as number;
      return cnt === 1 ? generate() : Array.from({ length: cnt }, generate);
    },
  },
  {
    name: "math_percentage",
    description: "Calculate percentage (value/total * 100) or value from percentage",
    category: "math",
    inputSchema: {
      type: "object",
      properties: {
        value: { type: "number", description: "The value" },
        total: { type: "number", description: "The total (for calculating %)" },
        percentage: { type: "number", description: "Percentage (for calculating value)" },
      },
    },
    handler: ({ value, total, percentage }) => {
      if (percentage !== undefined && total !== undefined) {
        return ((percentage as number) / 100) * (total as number);
      }
      if (value !== undefined && total !== undefined) {
        return ((value as number) / (total as number)) * 100;
      }
      throw new Error("Provide (value, total) or (percentage, total)");
    },
  },
  {
    name: "math_linear_regression",
    description: "Calculate linear regression (y = mx + b) for data points",
    category: "math",
    inputSchema: {
      type: "object",
      properties: {
        points: {
          type: "array",
          items: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
          description: "Array of [x, y] points",
        },
      },
      required: ["points"],
    },
    handler: ({ points }) => {
      const data = points as [number, number][];
      if (data.length < 2) throw new Error("Need at least 2 points");
      const regression = ss.linearRegression(data);
      const line = ss.linearRegressionLine(regression);
      return {
        slope: regression.m,
        intercept: regression.b,
        predict: (x: number) => line(x),
        r2: ss.rSquared(data, line),
      };
    },
  },
  {
    name: "math_mode",
    description: "Find the most frequent value(s) in an array of numbers",
    category: "math",
    inputSchema: {
      type: "object",
      properties: {
        numbers: { type: "array", items: { type: "number" }, description: "Array of numbers" },
      },
      required: ["numbers"],
    },
    handler: ({ numbers }) => {
      const nums = numbers as number[];
      if (nums.length === 0) return null;
      return ss.mode(nums);
    },
  },
  {
    name: "math_convert",
    description: "Convert between angle units (radians/degrees) or other common conversions",
    category: "math",
    inputSchema: {
      type: "object",
      properties: {
        value: { type: "number", description: "Value to convert" },
        from: {
          type: "string",
          enum: ["radians", "degrees", "celsius", "fahrenheit", "km", "miles"],
          description: "Source unit",
        },
        to: {
          type: "string",
          enum: ["radians", "degrees", "celsius", "fahrenheit", "km", "miles"],
          description: "Target unit",
        },
      },
      required: ["value", "from", "to"],
    },
    handler: ({ value, from, to }) => {
      const v = value as number;
      const conversions: Record<string, Record<string, (n: number) => number>> = {
        radians: {
          degrees: (n) => n * (180 / Math.PI),
          radians: (n) => n,
        },
        degrees: {
          radians: (n) => n * (Math.PI / 180),
          degrees: (n) => n,
        },
        celsius: {
          fahrenheit: (n) => (n * 9) / 5 + 32,
          celsius: (n) => n,
        },
        fahrenheit: {
          celsius: (n) => ((n - 32) * 5) / 9,
          fahrenheit: (n) => n,
        },
        km: {
          miles: (n) => n * 0.621371,
          km: (n) => n,
        },
        miles: {
          km: (n) => n * 1.60934,
          miles: (n) => n,
        },
      };
      const fn = conversions[from as string]?.[to as string];
      if (!fn) throw new Error(`Cannot convert from ${from} to ${to}`);
      return fn(v);
    },
  },
  // Inspired by IT-Tools MCP: https://github.com/wrenchpilot/it-tools-mcp
  {
    name: "math_base_convert",
    description: "Convert number between bases (binary, octal, decimal, hex)",
    category: "math",
    inputSchema: {
      type: "object",
      properties: {
        value: { type: "string", description: "Number to convert (as string)" },
        from: {
          type: "number",
          enum: [2, 8, 10, 16],
          description: "Source base (2=binary, 8=octal, 10=decimal, 16=hex)",
        },
        to: {
          type: "number",
          enum: [2, 8, 10, 16],
          description: "Target base",
        },
      },
      required: ["value", "from", "to"],
    },
    handler: ({ value, from, to }) => {
      const num = parseInt(value as string, from as number);
      if (isNaN(num)) throw new Error(`Invalid number for base ${from}: ${value}`);
      return num.toString(to as number).toUpperCase();
    },
  },
  {
    name: "math_roman",
    description: "Convert between Roman numerals and Arabic numbers",
    category: "math",
    inputSchema: {
      type: "object",
      properties: {
        value: {
          type: ["string", "number"],
          description: "Roman numeral (string) or Arabic number",
        },
        action: {
          type: "string",
          enum: ["to_roman", "from_roman"],
          description: "Conversion direction",
        },
      },
      required: ["value", "action"],
    },
    handler: ({ value, action }) => {
      const romanMap: [string, number][] = [
        ["M", 1000], ["CM", 900], ["D", 500], ["CD", 400],
        ["C", 100], ["XC", 90], ["L", 50], ["XL", 40],
        ["X", 10], ["IX", 9], ["V", 5], ["IV", 4], ["I", 1],
      ];

      if (action === "to_roman") {
        let num = typeof value === "string" ? parseInt(value, 10) : (value as number);
        if (num < 1 || num > 3999) throw new Error("Number must be between 1 and 3999");
        let result = "";
        for (const [roman, arabic] of romanMap) {
          while (num >= arabic) {
            result += roman;
            num -= arabic;
          }
        }
        return result;
      }

      // from_roman
      const roman = (value as string).toUpperCase();
      let result = 0;
      let i = 0;
      for (const [r, arabic] of romanMap) {
        while (roman.slice(i, i + r.length) === r) {
          result += arabic;
          i += r.length;
        }
      }
      return result;
    },
  },
  {
    name: "math_convert_angle",
    description: "Convert between angle units (degrees, radians, gradians, turns, arcminutes, arcseconds)",
    category: "math",
    inputSchema: {
      type: "object",
      properties: {
        value: { type: "number", description: "Value to convert" },
        from: {
          type: "string",
          enum: ["degrees", "radians", "gradians", "turns", "arcminutes", "arcseconds"],
          description: "Source unit",
        },
        to: {
          type: "string",
          enum: ["degrees", "radians", "gradians", "turns", "arcminutes", "arcseconds"],
          description: "Target unit",
        },
      },
      required: ["value", "from", "to"],
    },
    handler: ({ value, from, to }) => {
      const v = value as number;
      // First convert to degrees as base unit
      const toDegrees: Record<string, (n: number) => number> = {
        degrees: (n) => n,
        radians: (n) => n * (180 / Math.PI),
        gradians: (n) => n * 0.9,
        turns: (n) => n * 360,
        arcminutes: (n) => n / 60,
        arcseconds: (n) => n / 3600,
      };
      // Then convert from degrees to target
      const fromDegrees: Record<string, (n: number) => number> = {
        degrees: (n) => n,
        radians: (n) => n * (Math.PI / 180),
        gradians: (n) => n / 0.9,
        turns: (n) => n / 360,
        arcminutes: (n) => n * 60,
        arcseconds: (n) => n * 3600,
      };
      const degrees = toDegrees[from as string]?.(v);
      if (degrees === undefined) throw new Error(`Unknown unit: ${from}`);
      const result = fromDegrees[to as string]?.(degrees);
      if (result === undefined) throw new Error(`Unknown unit: ${to}`);
      return result;
    },
  },
  {
    name: "math_convert_energy",
    description: "Convert between energy units (joules, calories, kWh, BTU, eV, etc.)",
    category: "math",
    inputSchema: {
      type: "object",
      properties: {
        value: { type: "number", description: "Value to convert" },
        from: {
          type: "string",
          enum: ["joules", "calories", "kilocalories", "kwh", "btu", "ev", "watt_hours", "foot_pounds"],
          description: "Source unit",
        },
        to: {
          type: "string",
          enum: ["joules", "calories", "kilocalories", "kwh", "btu", "ev", "watt_hours", "foot_pounds"],
          description: "Target unit",
        },
      },
      required: ["value", "from", "to"],
    },
    handler: ({ value, from, to }) => {
      const v = value as number;
      // Convert to joules as base unit
      const toJoules: Record<string, number> = {
        joules: 1,
        calories: 4.184,
        kilocalories: 4184,
        kwh: 3600000,
        btu: 1055.06,
        ev: 1.602176634e-19,
        watt_hours: 3600,
        foot_pounds: 1.35582,
      };
      const joules = v * (toJoules[from as string] ?? 1);
      const result = joules / (toJoules[to as string] ?? 1);
      return result;
    },
  },
  {
    name: "math_convert_power",
    description: "Convert between power units (watts, horsepower, BTU/h, etc.)",
    category: "math",
    inputSchema: {
      type: "object",
      properties: {
        value: { type: "number", description: "Value to convert" },
        from: {
          type: "string",
          enum: ["watts", "kilowatts", "megawatts", "horsepower", "btu_per_hour", "foot_pounds_per_second"],
          description: "Source unit",
        },
        to: {
          type: "string",
          enum: ["watts", "kilowatts", "megawatts", "horsepower", "btu_per_hour", "foot_pounds_per_second"],
          description: "Target unit",
        },
      },
      required: ["value", "from", "to"],
    },
    handler: ({ value, from, to }) => {
      const v = value as number;
      // Convert to watts as base unit
      const toWatts: Record<string, number> = {
        watts: 1,
        kilowatts: 1000,
        megawatts: 1000000,
        horsepower: 745.7,
        btu_per_hour: 0.293071,
        foot_pounds_per_second: 1.35582,
      };
      const watts = v * (toWatts[from as string] ?? 1);
      const result = watts / (toWatts[to as string] ?? 1);
      return result;
    },
  },
];
