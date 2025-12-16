/**
 * Math calculation tools
 *
 * Uses mathjs for safe expression evaluation and simple-statistics for stats.
 *
 * @module lib/primitives/math
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
];
