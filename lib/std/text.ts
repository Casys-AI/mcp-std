/**
 * Text manipulation tools
 *
 * Inspired by:
 * - TextToolkit MCP: https://github.com/Cicatriiz/text-toolkit
 * - IT-Tools MCP: https://github.com/wrenchpilot/it-tools-mcp
 *
 * @module lib/std/text
 */

import * as changeCase from "change-case";
import type { MiniTool } from "./types.ts";

export const textTools: MiniTool[] = [
  {
    name: "text_split",
    description: "Split a string by delimiter into an array",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to split" },
        delimiter: { type: "string", description: "Delimiter (default: ',')" },
      },
      required: ["text"],
    },
    handler: ({ text, delimiter = "," }) => (text as string).split(delimiter as string),
  },
  {
    name: "text_join",
    description: "Join an array of strings with a delimiter",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        items: { type: "array", items: { type: "string" }, description: "Items to join" },
        delimiter: { type: "string", description: "Delimiter (default: ',')" },
      },
      required: ["items"],
    },
    handler: ({ items, delimiter = "," }) => (items as string[]).join(delimiter as string),
  },
  {
    name: "text_template",
    description: "Replace {{placeholders}} in a template string",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        template: { type: "string", description: "Template with {{placeholders}}" },
        values: { type: "object", description: "Key-value pairs for replacement" },
      },
      required: ["template", "values"],
    },
    handler: ({ template, values }) => {
      let result = template as string;
      for (const [key, value] of Object.entries(values as Record<string, string>)) {
        result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value));
      }
      return result;
    },
  },
  {
    name: "text_case",
    description:
      "Convert text case (upper, lower, title, camel, snake, kebab, pascal, constant, dot, path, sentence)",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to convert" },
        case: {
          type: "string",
          enum: [
            "upper",
            "lower",
            "title",
            "camel",
            "snake",
            "kebab",
            "pascal",
            "constant",
            "dot",
            "path",
            "sentence",
          ],
          description: "Target case",
        },
      },
      required: ["text", "case"],
    },
    handler: ({ text, case: targetCase }) => {
      const s = text as string;
      switch (targetCase) {
        case "upper":
          return s.toUpperCase();
        case "lower":
          return s.toLowerCase();
        case "title":
          return changeCase.capitalCase(s);
        case "camel":
          return changeCase.camelCase(s);
        case "snake":
          return changeCase.snakeCase(s);
        case "kebab":
          return changeCase.kebabCase(s);
        case "pascal":
          return changeCase.pascalCase(s);
        case "constant":
          return changeCase.constantCase(s);
        case "dot":
          return changeCase.dotCase(s);
        case "path":
          return changeCase.pathCase(s);
        case "sentence":
          return changeCase.sentenceCase(s);
        default:
          return s;
      }
    },
  },
  {
    name: "text_regex",
    description: "Match or replace using regular expression",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Input text" },
        pattern: { type: "string", description: "Regex pattern" },
        replacement: { type: "string", description: "Replacement (if replacing)" },
        flags: { type: "string", description: "Regex flags (default: 'g')" },
      },
      required: ["text", "pattern"],
    },
    handler: ({ text, pattern, replacement, flags = "g" }) => {
      const regex = new RegExp(pattern as string, flags as string);
      if (replacement !== undefined) {
        return (text as string).replace(regex, replacement as string);
      }
      return (text as string).match(regex) || [];
    },
  },
  {
    name: "text_trim",
    description: "Trim whitespace from text (start, end, or both)",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to trim" },
        side: { type: "string", enum: ["both", "start", "end"], description: "Side to trim" },
      },
      required: ["text"],
    },
    handler: ({ text, side = "both" }) => {
      const s = text as string;
      switch (side) {
        case "start":
          return s.trimStart();
        case "end":
          return s.trimEnd();
        default:
          return s.trim();
      }
    },
  },
  {
    name: "text_count",
    description: "Count words, characters, or lines in text",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Input text" },
        unit: { type: "string", enum: ["words", "chars", "lines"], description: "What to count" },
      },
      required: ["text"],
    },
    handler: ({ text, unit = "words" }) => {
      const s = text as string;
      switch (unit) {
        case "chars":
          return s.length;
        case "lines":
          return s.split("\n").length;
        default:
          return s.trim().split(/\s+/).filter(Boolean).length;
      }
    },
  },
  {
    name: "text_pad",
    description: "Pad text to a specified length",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to pad" },
        length: { type: "number", description: "Target length" },
        char: { type: "string", description: "Padding character (default: ' ')" },
        side: { type: "string", enum: ["start", "end", "both"], description: "Side to pad" },
      },
      required: ["text", "length"],
    },
    handler: ({ text, length, char = " ", side = "end" }) => {
      const s = text as string;
      const len = length as number;
      const c = (char as string)[0] || " ";
      switch (side) {
        case "start":
          return s.padStart(len, c);
        case "both": {
          const totalPad = len - s.length;
          const padStart = Math.floor(totalPad / 2);
          return s.padStart(s.length + padStart, c).padEnd(len, c);
        }
        default:
          return s.padEnd(len, c);
      }
    },
  },
  // Inspired by TextToolkit MCP: https://github.com/Cicatriiz/text-toolkit
  {
    name: "text_regex_test",
    description: "Test if a regex pattern matches the text (returns boolean)",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Input text" },
        pattern: { type: "string", description: "Regex pattern" },
        flags: { type: "string", description: "Regex flags (default: '')" },
      },
      required: ["text", "pattern"],
    },
    handler: ({ text, pattern, flags = "" }) => {
      const regex = new RegExp(pattern as string, flags as string);
      return regex.test(text as string);
    },
  },
  {
    name: "text_regex_extract",
    description: "Extract all matches with capture groups from text",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Input text" },
        pattern: { type: "string", description: "Regex pattern with groups" },
        flags: { type: "string", description: "Regex flags (default: 'g')" },
      },
      required: ["text", "pattern"],
    },
    handler: ({ text, pattern, flags = "g" }) => {
      const regex = new RegExp(pattern as string, flags as string);
      const matches: Array<{ match: string; groups: string[]; index: number }> = [];
      let match;
      while ((match = regex.exec(text as string)) !== null) {
        matches.push({
          match: match[0],
          groups: match.slice(1),
          index: match.index,
        });
        if (!regex.global) break;
      }
      return matches;
    },
  },
  {
    name: "text_regex_split",
    description: "Split text by regex pattern",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Input text" },
        pattern: { type: "string", description: "Regex pattern to split by" },
        limit: { type: "number", description: "Max number of splits" },
      },
      required: ["text", "pattern"],
    },
    handler: ({ text, pattern, limit }) => {
      const regex = new RegExp(pattern as string);
      return (text as string).split(regex, limit as number | undefined);
    },
  },
  {
    name: "text_lorem",
    description: "Generate lorem ipsum placeholder text",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        count: { type: "number", description: "Number of units (default: 1)" },
        unit: {
          type: "string",
          enum: ["words", "sentences", "paragraphs"],
          description: "Unit type (default: paragraphs)",
        },
      },
    },
    handler: ({ count = 1, unit = "paragraphs" }) => {
      const words = [
        "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit",
        "sed", "do", "eiusmod", "tempor", "incididunt", "ut", "labore", "et", "dolore",
        "magna", "aliqua", "enim", "ad", "minim", "veniam", "quis", "nostrud",
        "exercitation", "ullamco", "laboris", "nisi", "aliquip", "ex", "ea", "commodo",
        "consequat", "duis", "aute", "irure", "in", "reprehenderit", "voluptate",
        "velit", "esse", "cillum", "fugiat", "nulla", "pariatur", "excepteur", "sint",
        "occaecat", "cupidatat", "non", "proident", "sunt", "culpa", "qui", "officia",
        "deserunt", "mollit", "anim", "id", "est", "laborum",
      ];

      const randomWord = () => words[Math.floor(Math.random() * words.length)];
      const randomSentence = () => {
        const len = 8 + Math.floor(Math.random() * 12);
        const sentence = Array.from({ length: len }, randomWord).join(" ");
        return sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
      };
      const randomParagraph = () => {
        const len = 3 + Math.floor(Math.random() * 5);
        return Array.from({ length: len }, randomSentence).join(" ");
      };

      const cnt = count as number;
      switch (unit) {
        case "words":
          return Array.from({ length: cnt }, randomWord).join(" ");
        case "sentences":
          return Array.from({ length: cnt }, randomSentence).join(" ");
        default:
          return Array.from({ length: cnt }, randomParagraph).join("\n\n");
      }
    },
  },
  {
    name: "text_slugify",
    description: "Convert text to URL-friendly slug (lowercase, hyphens, no special chars)",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to slugify" },
        separator: { type: "string", description: "Word separator (default: '-')" },
        lowercase: { type: "boolean", description: "Convert to lowercase (default: true)" },
      },
      required: ["text"],
    },
    handler: ({ text, separator = "-", lowercase = true }) => {
      let slug = (text as string)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove accents
        .replace(/[^a-zA-Z0-9\s-]/g, "") // Remove special chars
        .trim()
        .replace(/\s+/g, separator as string) // Replace spaces
        .replace(new RegExp(`${separator}+`, "g"), separator as string); // Remove duplicate separators

      if (lowercase) slug = slug.toLowerCase();
      return slug;
    },
  },
  {
    name: "text_nato",
    description: "Convert text to NATO phonetic alphabet",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to convert" },
        separator: { type: "string", description: "Word separator (default: ' ')" },
      },
      required: ["text"],
    },
    handler: ({ text, separator = " " }) => {
      const nato: Record<string, string> = {
        A: "Alpha", B: "Bravo", C: "Charlie", D: "Delta", E: "Echo",
        F: "Foxtrot", G: "Golf", H: "Hotel", I: "India", J: "Juliet",
        K: "Kilo", L: "Lima", M: "Mike", N: "November", O: "Oscar",
        P: "Papa", Q: "Quebec", R: "Romeo", S: "Sierra", T: "Tango",
        U: "Uniform", V: "Victor", W: "Whiskey", X: "X-ray", Y: "Yankee",
        Z: "Zulu", "0": "Zero", "1": "One", "2": "Two", "3": "Three",
        "4": "Four", "5": "Five", "6": "Six", "7": "Seven", "8": "Eight",
        "9": "Nine",
      };
      return (text as string)
        .toUpperCase()
        .split("")
        .map((c) => nato[c] || c)
        .join(separator as string);
    },
  },
  {
    name: "text_diff",
    description: "Compare two texts and show differences",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text1: { type: "string", description: "First text" },
        text2: { type: "string", description: "Second text" },
        mode: {
          type: "string",
          enum: ["lines", "words", "chars"],
          description: "Comparison mode (default: lines)",
        },
      },
      required: ["text1", "text2"],
    },
    handler: ({ text1, text2, mode = "lines" }) => {
      const t1 = text1 as string;
      const t2 = text2 as string;

      // Split based on mode
      let units1: string[], units2: string[];
      switch (mode) {
        case "chars":
          units1 = t1.split("");
          units2 = t2.split("");
          break;
        case "words":
          units1 = t1.split(/\s+/);
          units2 = t2.split(/\s+/);
          break;
        default: // lines
          units1 = t1.split("\n");
          units2 = t2.split("\n");
      }

      // Simple LCS-based diff
      const lcs = (a: string[], b: string[]): string[] => {
        const m = a.length, n = b.length;
        const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

        for (let i = 1; i <= m; i++) {
          for (let j = 1; j <= n; j++) {
            if (a[i - 1] === b[j - 1]) {
              dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
              dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
          }
        }

        // Backtrack to find LCS
        const result: string[] = [];
        let i = m, j = n;
        while (i > 0 && j > 0) {
          if (a[i - 1] === b[j - 1]) {
            result.unshift(a[i - 1]);
            i--; j--;
          } else if (dp[i - 1][j] > dp[i][j - 1]) {
            i--;
          } else {
            j--;
          }
        }
        return result;
      };

      const common = new Set(lcs(units1, units2));
      const removed = units1.filter((u) => !units2.includes(u) || units1.indexOf(u) !== units2.indexOf(u));
      const added = units2.filter((u) => !units1.includes(u) || units1.indexOf(u) !== units2.indexOf(u));

      return {
        identical: t1 === t2,
        commonCount: common.size,
        removedCount: removed.length,
        addedCount: added.length,
        removed: removed.slice(0, 50), // Limit output
        added: added.slice(0, 50),
        similarity: units1.length === 0 && units2.length === 0
          ? 100
          : Math.round((common.size / Math.max(units1.length, units2.length)) * 100),
      };
    },
  },
  {
    name: "text_stats",
    description: "Analyze text and return statistics",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to analyze" },
      },
      required: ["text"],
    },
    handler: ({ text }) => {
      const t = text as string;
      const words = t.trim().split(/\s+/).filter(Boolean);
      const sentences = t.split(/[.!?]+/).filter((s) => s.trim().length > 0);
      const paragraphs = t.split(/\n\n+/).filter((p) => p.trim().length > 0);
      const lines = t.split("\n");

      // Character counts
      const chars = t.length;
      const charsNoSpaces = t.replace(/\s/g, "").length;
      const letters = (t.match(/[a-zA-Z]/g) || []).length;
      const digits = (t.match(/\d/g) || []).length;

      // Word frequency
      const wordFreq: Record<string, number> = {};
      for (const word of words) {
        const normalized = word.toLowerCase().replace(/[^a-z]/g, "");
        if (normalized) {
          wordFreq[normalized] = (wordFreq[normalized] || 0) + 1;
        }
      }
      const topWords = Object.entries(wordFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([word, count]) => ({ word, count }));

      // Readability metrics
      const avgWordLength = words.length > 0
        ? words.reduce((sum, w) => sum + w.length, 0) / words.length
        : 0;
      const avgSentenceLength = sentences.length > 0
        ? words.length / sentences.length
        : 0;

      // Flesch-Kincaid approximation (simplified)
      const syllableCount = (word: string) => {
        const w = word.toLowerCase().replace(/[^a-z]/g, "");
        if (w.length <= 3) return 1;
        return w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
          .replace(/^y/, "")
          .match(/[aeiouy]{1,2}/g)?.length || 1;
      };
      const totalSyllables = words.reduce((sum, w) => sum + syllableCount(w), 0);
      const fleschKincaid = words.length > 0 && sentences.length > 0
        ? 206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (totalSyllables / words.length)
        : 0;

      return {
        characters: chars,
        charactersNoSpaces: charsNoSpaces,
        letters,
        digits,
        words: words.length,
        sentences: sentences.length,
        paragraphs: paragraphs.length,
        lines: lines.length,
        avgWordLength: Math.round(avgWordLength * 10) / 10,
        avgSentenceLength: Math.round(avgSentenceLength * 10) / 10,
        readabilityScore: Math.round(Math.max(0, Math.min(100, fleschKincaid))),
        topWords,
        uniqueWords: Object.keys(wordFreq).length,
      };
    },
  },
  {
    name: "text_generate_crontab",
    description: "Generate a cron expression from human-readable schedule description",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        schedule: {
          type: "string",
          description: "Human-readable schedule (e.g., 'every day at 5pm', 'every monday at 9am')",
        },
      },
      required: ["schedule"],
    },
    handler: ({ schedule }) => {
      const s = (schedule as string).toLowerCase().trim();

      // Predefined patterns
      if (s === "every minute") return { cron: "* * * * *", description: "Every minute" };
      if (s === "every hour") return { cron: "0 * * * *", description: "Every hour at minute 0" };
      if (s === "every day" || s === "daily") return { cron: "0 0 * * *", description: "Every day at midnight" };
      if (s === "every week" || s === "weekly") return { cron: "0 0 * * 0", description: "Every Sunday at midnight" };
      if (s === "every month" || s === "monthly") return { cron: "0 0 1 * *", description: "First day of every month at midnight" };
      if (s === "every year" || s === "yearly" || s === "annually") return { cron: "0 0 1 1 *", description: "January 1st at midnight" };

      // Parse "every X minutes/hours"
      const everyNMatch = s.match(/every (\d+) (minute|hour|day)s?/);
      if (everyNMatch) {
        const n = parseInt(everyNMatch[1]);
        const unit = everyNMatch[2];
        if (unit === "minute") return { cron: `*/${n} * * * *`, description: `Every ${n} minutes` };
        if (unit === "hour") return { cron: `0 */${n} * * *`, description: `Every ${n} hours` };
        if (unit === "day") return { cron: `0 0 */${n} * *`, description: `Every ${n} days` };
      }

      // Parse "at HH:MM" or "at Ham/pm"
      const timeMatch = s.match(/at (\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
      let hour = 0, minute = 0;
      if (timeMatch) {
        hour = parseInt(timeMatch[1]);
        minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
        if (timeMatch[3]?.toLowerCase() === "pm" && hour < 12) hour += 12;
        if (timeMatch[3]?.toLowerCase() === "am" && hour === 12) hour = 0;
      }

      // Parse day of week
      const days: Record<string, number> = {
        sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2,
        wednesday: 3, wed: 3, thursday: 4, thu: 4, friday: 5, fri: 5,
        saturday: 6, sat: 6, weekday: -1, weekend: -2,
      };
      for (const [dayName, dayNum] of Object.entries(days)) {
        if (s.includes(dayName)) {
          if (dayNum === -1) {
            return { cron: `${minute} ${hour} * * 1-5`, description: `Weekdays at ${hour}:${minute.toString().padStart(2, "0")}` };
          }
          if (dayNum === -2) {
            return { cron: `${minute} ${hour} * * 0,6`, description: `Weekends at ${hour}:${minute.toString().padStart(2, "0")}` };
          }
          return {
            cron: `${minute} ${hour} * * ${dayNum}`,
            description: `Every ${dayName.charAt(0).toUpperCase() + dayName.slice(1)} at ${hour}:${minute.toString().padStart(2, "0")}`,
          };
        }
      }

      // Default: every day at specified time
      if (timeMatch) {
        return { cron: `${minute} ${hour} * * *`, description: `Every day at ${hour}:${minute.toString().padStart(2, "0")}` };
      }

      return { error: "Could not parse schedule", input: schedule };
    },
  },
  {
    name: "text_markdown_toc",
    description: "Generate a table of contents from markdown headers",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        markdown: { type: "string", description: "Markdown content" },
        maxDepth: { type: "number", description: "Maximum heading depth (default: 6)" },
        minDepth: { type: "number", description: "Minimum heading depth (default: 1)" },
      },
      required: ["markdown"],
    },
    handler: ({ markdown, maxDepth = 6, minDepth = 1 }) => {
      const lines = (markdown as string).split("\n");
      const toc: Array<{ level: number; text: string; anchor: string }> = [];

      for (const line of lines) {
        const match = line.match(/^(#{1,6})\s+(.+)$/);
        if (match) {
          const level = match[1].length;
          if (level >= (minDepth as number) && level <= (maxDepth as number)) {
            const text = match[2].trim();
            // Create anchor slug
            const anchor = text
              .toLowerCase()
              .replace(/[^\w\s-]/g, "")
              .replace(/\s+/g, "-");
            toc.push({ level, text, anchor });
          }
        }
      }

      // Generate markdown TOC
      const tocMarkdown = toc.map(({ level, text, anchor }) => {
        const indent = "  ".repeat(level - (minDepth as number));
        return `${indent}- [${text}](#${anchor})`;
      }).join("\n");

      return {
        entries: toc,
        markdown: tocMarkdown,
        count: toc.length,
      };
    },
  },
  {
    name: "text_ascii_art",
    description: "Convert text to simple ASCII art using block letters",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to convert (A-Z, 0-9, space)" },
        style: {
          type: "string",
          enum: ["block", "banner", "simple"],
          description: "Art style (default: block)",
        },
      },
      required: ["text"],
    },
    handler: ({ text, style = "block" }) => {
      // Simple 3x5 ASCII art letters
      const letters: Record<string, string[]> = {
        A: ["###", "# #", "###", "# #", "# #"],
        B: ["## ", "# #", "## ", "# #", "## "],
        C: ["###", "#  ", "#  ", "#  ", "###"],
        D: ["## ", "# #", "# #", "# #", "## "],
        E: ["###", "#  ", "## ", "#  ", "###"],
        F: ["###", "#  ", "## ", "#  ", "#  "],
        G: ["###", "#  ", "# #", "# #", "###"],
        H: ["# #", "# #", "###", "# #", "# #"],
        I: ["###", " # ", " # ", " # ", "###"],
        J: ["###", "  #", "  #", "# #", "###"],
        K: ["# #", "# #", "## ", "# #", "# #"],
        L: ["#  ", "#  ", "#  ", "#  ", "###"],
        M: ["# #", "###", "# #", "# #", "# #"],
        N: ["# #", "###", "###", "# #", "# #"],
        O: ["###", "# #", "# #", "# #", "###"],
        P: ["###", "# #", "###", "#  ", "#  "],
        Q: ["###", "# #", "# #", "###", "  #"],
        R: ["###", "# #", "## ", "# #", "# #"],
        S: ["###", "#  ", "###", "  #", "###"],
        T: ["###", " # ", " # ", " # ", " # "],
        U: ["# #", "# #", "# #", "# #", "###"],
        V: ["# #", "# #", "# #", "# #", " # "],
        W: ["# #", "# #", "# #", "###", "# #"],
        X: ["# #", "# #", " # ", "# #", "# #"],
        Y: ["# #", "# #", " # ", " # ", " # "],
        Z: ["###", "  #", " # ", "#  ", "###"],
        "0": ["###", "# #", "# #", "# #", "###"],
        "1": [" # ", "## ", " # ", " # ", "###"],
        "2": ["###", "  #", "###", "#  ", "###"],
        "3": ["###", "  #", "###", "  #", "###"],
        "4": ["# #", "# #", "###", "  #", "  #"],
        "5": ["###", "#  ", "###", "  #", "###"],
        "6": ["###", "#  ", "###", "# #", "###"],
        "7": ["###", "  #", "  #", "  #", "  #"],
        "8": ["###", "# #", "###", "# #", "###"],
        "9": ["###", "# #", "###", "  #", "###"],
        " ": ["   ", "   ", "   ", "   ", "   "],
      };

      const chars = (text as string).toUpperCase().split("");
      const lines: string[] = ["", "", "", "", ""];

      for (const char of chars) {
        const art = letters[char] || ["???", "???", "???", "???", "???"];
        for (let i = 0; i < 5; i++) {
          lines[i] += art[i] + " ";
        }
      }

      const output = lines.join("\n");

      if (style === "banner") {
        const width = lines[0].length;
        const border = "=" .repeat(width);
        return `${border}\n${output}\n${border}`;
      }

      return output;
    },
  },
  {
    name: "text_numeronym",
    description: "Create a numeronym from text (e.g., internationalization → i18n)",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to convert" },
        preserveCase: { type: "boolean", description: "Preserve original case (default: true)" },
      },
      required: ["text"],
    },
    handler: ({ text, preserveCase = true }) => {
      const words = (text as string).split(/\s+/);
      const result = words.map((word) => {
        if (word.length <= 3) return word;
        const first = word[0];
        const last = word[word.length - 1];
        const middle = word.length - 2;
        const numeronym = `${first}${middle}${last}`;
        return preserveCase ? numeronym : numeronym.toLowerCase();
      });
      return {
        original: text,
        numeronym: result.join(" "),
        words: words.map((word, i) => ({ original: word, numeronym: result[i] })),
      };
    },
  },
  {
    name: "text_obfuscate",
    description: "Obfuscate text by scrambling middle characters of words",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to obfuscate" },
        mode: {
          type: "string",
          enum: ["scramble", "replace", "leetspeak"],
          description: "Obfuscation mode (default: scramble)",
        },
      },
      required: ["text"],
    },
    handler: ({ text, mode = "scramble" }) => {
      const t = text as string;

      if (mode === "leetspeak") {
        const leet: Record<string, string> = {
          a: "4", e: "3", i: "1", o: "0", s: "5", t: "7", b: "8", g: "9",
          A: "4", E: "3", I: "1", O: "0", S: "5", T: "7", B: "8", G: "9",
        };
        return t.split("").map((c) => leet[c] || c).join("");
      }

      if (mode === "replace") {
        // Replace with similar looking characters
        const similar: Record<string, string> = {
          a: "α", e: "є", i: "ι", o: "σ", u: "υ",
          A: "Α", E: "Ε", I: "Ι", O: "Ο", U: "υ",
        };
        return t.split("").map((c) => similar[c] || c).join("");
      }

      // Default: scramble middle characters
      return t.split(/(\s+)/).map((part) => {
        if (/^\s+$/.test(part)) return part; // Keep whitespace
        if (part.length <= 3) return part; // Too short to scramble
        const first = part[0];
        const last = part[part.length - 1];
        const middle = part.slice(1, -1).split("");
        // Fisher-Yates shuffle
        for (let i = middle.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [middle[i], middle[j]] = [middle[j], middle[i]];
        }
        return first + middle.join("") + last;
      }).join("");
    },
  },
  // Emoji and Unicode tools - inspired by IT-Tools MCP
  {
    name: "text_emoji_search",
    description: "Search for emojis by keyword or category",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query (e.g., 'smile', 'heart', 'animal')" },
        limit: { type: "number", description: "Maximum results (default: 20)" },
      },
      required: ["query"],
    },
    handler: ({ query, limit = 20 }) => {
      // Common emoji database with keywords
      const emojis: Array<{ emoji: string; name: string; keywords: string[] }> = [
        { emoji: "😀", name: "grinning face", keywords: ["smile", "happy", "joy"] },
        { emoji: "😃", name: "grinning face with big eyes", keywords: ["smile", "happy"] },
        { emoji: "😄", name: "grinning face with smiling eyes", keywords: ["smile", "happy", "laugh"] },
        { emoji: "😁", name: "beaming face with smiling eyes", keywords: ["smile", "grin"] },
        { emoji: "😆", name: "grinning squinting face", keywords: ["laugh", "happy"] },
        { emoji: "😅", name: "grinning face with sweat", keywords: ["nervous", "laugh"] },
        { emoji: "🤣", name: "rolling on the floor laughing", keywords: ["laugh", "lol", "rofl"] },
        { emoji: "😂", name: "face with tears of joy", keywords: ["laugh", "cry", "happy"] },
        { emoji: "🙂", name: "slightly smiling face", keywords: ["smile", "ok"] },
        { emoji: "😊", name: "smiling face with smiling eyes", keywords: ["smile", "blush", "happy"] },
        { emoji: "😇", name: "smiling face with halo", keywords: ["angel", "innocent"] },
        { emoji: "🥰", name: "smiling face with hearts", keywords: ["love", "heart", "adore"] },
        { emoji: "😍", name: "smiling face with heart-eyes", keywords: ["love", "heart", "crush"] },
        { emoji: "🤩", name: "star-struck", keywords: ["star", "eyes", "wow", "amazing"] },
        { emoji: "😘", name: "face blowing a kiss", keywords: ["kiss", "love"] },
        { emoji: "😗", name: "kissing face", keywords: ["kiss"] },
        { emoji: "😚", name: "kissing face with closed eyes", keywords: ["kiss", "love"] },
        { emoji: "😋", name: "face savoring food", keywords: ["yummy", "delicious", "tongue"] },
        { emoji: "😛", name: "face with tongue", keywords: ["tongue", "playful"] },
        { emoji: "😜", name: "winking face with tongue", keywords: ["tongue", "wink", "playful"] },
        { emoji: "🤪", name: "zany face", keywords: ["crazy", "silly", "wild"] },
        { emoji: "😝", name: "squinting face with tongue", keywords: ["tongue", "playful"] },
        { emoji: "🤑", name: "money-mouth face", keywords: ["money", "rich", "dollar"] },
        { emoji: "🤗", name: "hugging face", keywords: ["hug", "embrace"] },
        { emoji: "🤭", name: "face with hand over mouth", keywords: ["oops", "giggle", "secret"] },
        { emoji: "🤔", name: "thinking face", keywords: ["think", "wonder", "hmm"] },
        { emoji: "😐", name: "neutral face", keywords: ["meh", "neutral", "blank"] },
        { emoji: "😑", name: "expressionless face", keywords: ["blank", "neutral"] },
        { emoji: "😶", name: "face without mouth", keywords: ["silent", "speechless"] },
        { emoji: "😏", name: "smirking face", keywords: ["smirk", "sly"] },
        { emoji: "😒", name: "unamused face", keywords: ["bored", "unimpressed"] },
        { emoji: "🙄", name: "face with rolling eyes", keywords: ["eye roll", "annoyed"] },
        { emoji: "😬", name: "grimacing face", keywords: ["awkward", "nervous"] },
        { emoji: "😮‍💨", name: "face exhaling", keywords: ["sigh", "relief", "tired"] },
        { emoji: "😔", name: "pensive face", keywords: ["sad", "thoughtful"] },
        { emoji: "😢", name: "crying face", keywords: ["cry", "sad", "tear"] },
        { emoji: "😭", name: "loudly crying face", keywords: ["cry", "sob", "sad"] },
        { emoji: "😤", name: "face with steam from nose", keywords: ["angry", "frustrated"] },
        { emoji: "😠", name: "angry face", keywords: ["angry", "mad"] },
        { emoji: "😡", name: "pouting face", keywords: ["angry", "rage", "mad"] },
        { emoji: "🤬", name: "face with symbols on mouth", keywords: ["swear", "angry", "curse"] },
        { emoji: "😈", name: "smiling face with horns", keywords: ["devil", "evil", "mischief"] },
        { emoji: "👿", name: "angry face with horns", keywords: ["devil", "angry"] },
        { emoji: "💀", name: "skull", keywords: ["dead", "death", "skeleton"] },
        { emoji: "☠️", name: "skull and crossbones", keywords: ["death", "danger", "pirate"] },
        { emoji: "💩", name: "pile of poo", keywords: ["poop", "crap"] },
        { emoji: "🤡", name: "clown face", keywords: ["clown", "circus"] },
        { emoji: "👻", name: "ghost", keywords: ["ghost", "halloween", "boo"] },
        { emoji: "👽", name: "alien", keywords: ["alien", "ufo", "space"] },
        { emoji: "🤖", name: "robot", keywords: ["robot", "bot", "ai"] },
        { emoji: "❤️", name: "red heart", keywords: ["heart", "love", "red"] },
        { emoji: "🧡", name: "orange heart", keywords: ["heart", "love", "orange"] },
        { emoji: "💛", name: "yellow heart", keywords: ["heart", "love", "yellow"] },
        { emoji: "💚", name: "green heart", keywords: ["heart", "love", "green"] },
        { emoji: "💙", name: "blue heart", keywords: ["heart", "love", "blue"] },
        { emoji: "💜", name: "purple heart", keywords: ["heart", "love", "purple"] },
        { emoji: "🖤", name: "black heart", keywords: ["heart", "black"] },
        { emoji: "🤍", name: "white heart", keywords: ["heart", "white"] },
        { emoji: "💔", name: "broken heart", keywords: ["heart", "broken", "sad"] },
        { emoji: "💕", name: "two hearts", keywords: ["heart", "love"] },
        { emoji: "💞", name: "revolving hearts", keywords: ["heart", "love"] },
        { emoji: "💓", name: "beating heart", keywords: ["heart", "love", "beat"] },
        { emoji: "💗", name: "growing heart", keywords: ["heart", "love"] },
        { emoji: "💖", name: "sparkling heart", keywords: ["heart", "love", "sparkle"] },
        { emoji: "💘", name: "heart with arrow", keywords: ["heart", "love", "cupid"] },
        { emoji: "💝", name: "heart with ribbon", keywords: ["heart", "love", "gift"] },
        { emoji: "👍", name: "thumbs up", keywords: ["like", "yes", "ok", "good", "approve"] },
        { emoji: "👎", name: "thumbs down", keywords: ["dislike", "no", "bad"] },
        { emoji: "👏", name: "clapping hands", keywords: ["clap", "applause", "bravo"] },
        { emoji: "🙌", name: "raising hands", keywords: ["celebrate", "hooray", "yay"] },
        { emoji: "👋", name: "waving hand", keywords: ["wave", "hello", "bye", "hi"] },
        { emoji: "✋", name: "raised hand", keywords: ["stop", "hand", "high five"] },
        { emoji: "🤚", name: "raised back of hand", keywords: ["hand", "back"] },
        { emoji: "🖐️", name: "hand with fingers splayed", keywords: ["hand", "five"] },
        { emoji: "✌️", name: "victory hand", keywords: ["peace", "victory", "two"] },
        { emoji: "🤞", name: "crossed fingers", keywords: ["luck", "hope", "fingers crossed"] },
        { emoji: "🤟", name: "love-you gesture", keywords: ["love", "rock", "hand"] },
        { emoji: "🤘", name: "sign of the horns", keywords: ["rock", "metal", "hand"] },
        { emoji: "👌", name: "OK hand", keywords: ["ok", "perfect", "good"] },
        { emoji: "🤌", name: "pinched fingers", keywords: ["italian", "chef", "perfect"] },
        { emoji: "👈", name: "backhand index pointing left", keywords: ["left", "point"] },
        { emoji: "👉", name: "backhand index pointing right", keywords: ["right", "point"] },
        { emoji: "👆", name: "backhand index pointing up", keywords: ["up", "point"] },
        { emoji: "👇", name: "backhand index pointing down", keywords: ["down", "point"] },
        { emoji: "☝️", name: "index pointing up", keywords: ["one", "point", "up"] },
        { emoji: "✍️", name: "writing hand", keywords: ["write", "pen"] },
        { emoji: "🙏", name: "folded hands", keywords: ["pray", "please", "thank you", "namaste"] },
        { emoji: "💪", name: "flexed biceps", keywords: ["strong", "muscle", "flex", "arm"] },
        { emoji: "🦾", name: "mechanical arm", keywords: ["robot", "prosthetic", "strong"] },
        { emoji: "🐶", name: "dog face", keywords: ["dog", "puppy", "animal", "pet"] },
        { emoji: "🐱", name: "cat face", keywords: ["cat", "kitten", "animal", "pet"] },
        { emoji: "🐭", name: "mouse face", keywords: ["mouse", "animal"] },
        { emoji: "🐹", name: "hamster", keywords: ["hamster", "animal", "pet"] },
        { emoji: "🐰", name: "rabbit face", keywords: ["rabbit", "bunny", "animal"] },
        { emoji: "🦊", name: "fox", keywords: ["fox", "animal"] },
        { emoji: "🐻", name: "bear", keywords: ["bear", "animal"] },
        { emoji: "🐼", name: "panda", keywords: ["panda", "bear", "animal"] },
        { emoji: "🐨", name: "koala", keywords: ["koala", "animal"] },
        { emoji: "🐯", name: "tiger face", keywords: ["tiger", "animal", "cat"] },
        { emoji: "🦁", name: "lion", keywords: ["lion", "animal", "king"] },
        { emoji: "🐮", name: "cow face", keywords: ["cow", "animal"] },
        { emoji: "🐷", name: "pig face", keywords: ["pig", "animal"] },
        { emoji: "🐸", name: "frog", keywords: ["frog", "animal"] },
        { emoji: "🐵", name: "monkey face", keywords: ["monkey", "animal", "ape"] },
        { emoji: "🐔", name: "chicken", keywords: ["chicken", "bird", "animal"] },
        { emoji: "🐧", name: "penguin", keywords: ["penguin", "bird", "animal"] },
        { emoji: "🐦", name: "bird", keywords: ["bird", "animal"] },
        { emoji: "🦆", name: "duck", keywords: ["duck", "bird", "animal"] },
        { emoji: "🦅", name: "eagle", keywords: ["eagle", "bird", "animal"] },
        { emoji: "🦉", name: "owl", keywords: ["owl", "bird", "animal", "night"] },
        { emoji: "🦇", name: "bat", keywords: ["bat", "animal", "halloween"] },
        { emoji: "🐺", name: "wolf", keywords: ["wolf", "animal", "dog"] },
        { emoji: "🐗", name: "boar", keywords: ["boar", "pig", "animal"] },
        { emoji: "🐴", name: "horse face", keywords: ["horse", "animal"] },
        { emoji: "🦄", name: "unicorn", keywords: ["unicorn", "horse", "magic", "fantasy"] },
        { emoji: "🐝", name: "honeybee", keywords: ["bee", "insect", "honey"] },
        { emoji: "🐛", name: "bug", keywords: ["bug", "insect", "caterpillar"] },
        { emoji: "🦋", name: "butterfly", keywords: ["butterfly", "insect"] },
        { emoji: "🐌", name: "snail", keywords: ["snail", "slow"] },
        { emoji: "🐙", name: "octopus", keywords: ["octopus", "sea", "animal"] },
        { emoji: "🦑", name: "squid", keywords: ["squid", "sea", "animal"] },
        { emoji: "🦀", name: "crab", keywords: ["crab", "sea", "animal"] },
        { emoji: "🦞", name: "lobster", keywords: ["lobster", "sea", "animal"] },
        { emoji: "🐠", name: "tropical fish", keywords: ["fish", "sea", "animal"] },
        { emoji: "🐟", name: "fish", keywords: ["fish", "sea", "animal"] },
        { emoji: "🐬", name: "dolphin", keywords: ["dolphin", "sea", "animal"] },
        { emoji: "🐳", name: "spouting whale", keywords: ["whale", "sea", "animal"] },
        { emoji: "🐋", name: "whale", keywords: ["whale", "sea", "animal"] },
        { emoji: "🦈", name: "shark", keywords: ["shark", "sea", "animal", "danger"] },
        { emoji: "🐊", name: "crocodile", keywords: ["crocodile", "alligator", "animal"] },
        { emoji: "🐢", name: "turtle", keywords: ["turtle", "slow", "animal"] },
        { emoji: "🐍", name: "snake", keywords: ["snake", "animal"] },
        { emoji: "🦎", name: "lizard", keywords: ["lizard", "animal", "reptile"] },
        { emoji: "🦖", name: "T-Rex", keywords: ["dinosaur", "trex", "animal"] },
        { emoji: "🦕", name: "sauropod", keywords: ["dinosaur", "animal"] },
        { emoji: "🌸", name: "cherry blossom", keywords: ["flower", "spring", "pink"] },
        { emoji: "💮", name: "white flower", keywords: ["flower", "white"] },
        { emoji: "🌹", name: "rose", keywords: ["flower", "rose", "red", "love"] },
        { emoji: "🌺", name: "hibiscus", keywords: ["flower", "tropical"] },
        { emoji: "🌻", name: "sunflower", keywords: ["flower", "sun", "yellow"] },
        { emoji: "🌼", name: "blossom", keywords: ["flower"] },
        { emoji: "🌷", name: "tulip", keywords: ["flower", "spring"] },
        { emoji: "🌱", name: "seedling", keywords: ["plant", "grow", "sprout"] },
        { emoji: "🌲", name: "evergreen tree", keywords: ["tree", "christmas", "pine"] },
        { emoji: "🌳", name: "deciduous tree", keywords: ["tree", "nature"] },
        { emoji: "🌴", name: "palm tree", keywords: ["tree", "tropical", "beach"] },
        { emoji: "🌵", name: "cactus", keywords: ["cactus", "desert", "plant"] },
        { emoji: "☀️", name: "sun", keywords: ["sun", "weather", "hot", "sunny"] },
        { emoji: "🌙", name: "crescent moon", keywords: ["moon", "night", "sleep"] },
        { emoji: "⭐", name: "star", keywords: ["star", "night", "sky"] },
        { emoji: "🌟", name: "glowing star", keywords: ["star", "shine", "sparkle"] },
        { emoji: "✨", name: "sparkles", keywords: ["sparkle", "shine", "magic", "star"] },
        { emoji: "⚡", name: "high voltage", keywords: ["lightning", "electric", "power", "flash"] },
        { emoji: "🔥", name: "fire", keywords: ["fire", "hot", "flame", "lit"] },
        { emoji: "💧", name: "droplet", keywords: ["water", "drop", "sweat"] },
        { emoji: "🌊", name: "water wave", keywords: ["wave", "ocean", "sea", "water"] },
        { emoji: "☁️", name: "cloud", keywords: ["cloud", "weather"] },
        { emoji: "🌈", name: "rainbow", keywords: ["rainbow", "weather", "color"] },
        { emoji: "❄️", name: "snowflake", keywords: ["snow", "cold", "winter"] },
        { emoji: "☃️", name: "snowman", keywords: ["snow", "winter", "christmas"] },
        { emoji: "🎉", name: "party popper", keywords: ["party", "celebrate", "birthday"] },
        { emoji: "🎊", name: "confetti ball", keywords: ["party", "celebrate"] },
        { emoji: "🎈", name: "balloon", keywords: ["balloon", "party", "birthday"] },
        { emoji: "🎁", name: "wrapped gift", keywords: ["gift", "present", "birthday"] },
        { emoji: "🎂", name: "birthday cake", keywords: ["cake", "birthday", "party"] },
        { emoji: "🍕", name: "pizza", keywords: ["pizza", "food", "italian"] },
        { emoji: "🍔", name: "hamburger", keywords: ["burger", "food", "fast food"] },
        { emoji: "🍟", name: "french fries", keywords: ["fries", "food", "fast food"] },
        { emoji: "🌭", name: "hot dog", keywords: ["hot dog", "food"] },
        { emoji: "🍿", name: "popcorn", keywords: ["popcorn", "movie", "snack"] },
        { emoji: "🍦", name: "soft ice cream", keywords: ["ice cream", "dessert", "sweet"] },
        { emoji: "🍩", name: "doughnut", keywords: ["donut", "dessert", "sweet"] },
        { emoji: "🍪", name: "cookie", keywords: ["cookie", "dessert", "sweet"] },
        { emoji: "🎂", name: "birthday cake", keywords: ["cake", "birthday", "dessert"] },
        { emoji: "🍰", name: "shortcake", keywords: ["cake", "dessert", "sweet"] },
        { emoji: "☕", name: "hot beverage", keywords: ["coffee", "tea", "drink", "hot"] },
        { emoji: "🍵", name: "teacup without handle", keywords: ["tea", "drink"] },
        { emoji: "🍺", name: "beer mug", keywords: ["beer", "drink", "alcohol"] },
        { emoji: "🍷", name: "wine glass", keywords: ["wine", "drink", "alcohol"] },
        { emoji: "🍹", name: "tropical drink", keywords: ["cocktail", "drink", "tropical"] },
        { emoji: "💻", name: "laptop", keywords: ["computer", "laptop", "tech"] },
        { emoji: "🖥️", name: "desktop computer", keywords: ["computer", "desktop", "tech"] },
        { emoji: "📱", name: "mobile phone", keywords: ["phone", "mobile", "cell", "tech"] },
        { emoji: "📧", name: "e-mail", keywords: ["email", "mail", "message"] },
        { emoji: "💡", name: "light bulb", keywords: ["idea", "light", "bulb"] },
        { emoji: "🔧", name: "wrench", keywords: ["tool", "fix", "wrench"] },
        { emoji: "🔨", name: "hammer", keywords: ["tool", "hammer", "build"] },
        { emoji: "⚙️", name: "gear", keywords: ["gear", "settings", "cog"] },
        { emoji: "🔒", name: "locked", keywords: ["lock", "security", "safe"] },
        { emoji: "🔓", name: "unlocked", keywords: ["unlock", "open"] },
        { emoji: "🔑", name: "key", keywords: ["key", "lock", "password"] },
        { emoji: "✅", name: "check mark button", keywords: ["check", "done", "yes", "complete"] },
        { emoji: "❌", name: "cross mark", keywords: ["no", "wrong", "x", "cancel"] },
        { emoji: "❓", name: "question mark", keywords: ["question", "help", "what"] },
        { emoji: "❗", name: "exclamation mark", keywords: ["exclamation", "warning", "alert"] },
        { emoji: "⚠️", name: "warning", keywords: ["warning", "caution", "alert"] },
        { emoji: "🚀", name: "rocket", keywords: ["rocket", "launch", "space", "ship"] },
        { emoji: "✈️", name: "airplane", keywords: ["plane", "travel", "flight"] },
        { emoji: "🚗", name: "automobile", keywords: ["car", "vehicle", "drive"] },
        { emoji: "🚕", name: "taxi", keywords: ["taxi", "cab", "car"] },
        { emoji: "🚌", name: "bus", keywords: ["bus", "vehicle", "transport"] },
        { emoji: "🚲", name: "bicycle", keywords: ["bike", "bicycle", "cycle"] },
        { emoji: "⏰", name: "alarm clock", keywords: ["clock", "time", "alarm", "wake"] },
        { emoji: "📅", name: "calendar", keywords: ["calendar", "date", "schedule"] },
        { emoji: "📌", name: "pushpin", keywords: ["pin", "location", "mark"] },
        { emoji: "📍", name: "round pushpin", keywords: ["pin", "location", "map"] },
        { emoji: "🔗", name: "link", keywords: ["link", "chain", "url"] },
        { emoji: "📝", name: "memo", keywords: ["note", "memo", "write", "document"] },
        { emoji: "📚", name: "books", keywords: ["book", "read", "library", "study"] },
        { emoji: "🎵", name: "musical note", keywords: ["music", "note", "song"] },
        { emoji: "🎶", name: "musical notes", keywords: ["music", "notes", "song"] },
        { emoji: "🎤", name: "microphone", keywords: ["microphone", "sing", "karaoke"] },
        { emoji: "🎬", name: "clapper board", keywords: ["movie", "film", "action"] },
        { emoji: "📸", name: "camera with flash", keywords: ["camera", "photo", "picture"] },
        { emoji: "🎮", name: "video game", keywords: ["game", "controller", "play"] },
        { emoji: "🏆", name: "trophy", keywords: ["trophy", "winner", "award", "prize"] },
        { emoji: "🥇", name: "1st place medal", keywords: ["medal", "gold", "first", "winner"] },
        { emoji: "🥈", name: "2nd place medal", keywords: ["medal", "silver", "second"] },
        { emoji: "🥉", name: "3rd place medal", keywords: ["medal", "bronze", "third"] },
        { emoji: "⚽", name: "soccer ball", keywords: ["soccer", "football", "ball", "sport"] },
        { emoji: "🏀", name: "basketball", keywords: ["basketball", "ball", "sport"] },
        { emoji: "🏈", name: "american football", keywords: ["football", "ball", "sport"] },
        { emoji: "⚾", name: "baseball", keywords: ["baseball", "ball", "sport"] },
        { emoji: "🎾", name: "tennis", keywords: ["tennis", "ball", "sport"] },
        { emoji: "🏐", name: "volleyball", keywords: ["volleyball", "ball", "sport"] },
        { emoji: "🎯", name: "direct hit", keywords: ["target", "bullseye", "dart"] },
      ];

      const q = (query as string).toLowerCase();
      const results = emojis.filter((e) =>
        e.name.toLowerCase().includes(q) ||
        e.keywords.some((k) => k.includes(q))
      ).slice(0, limit as number);

      return {
        query: query as string,
        count: results.length,
        emojis: results.map((e) => ({
          emoji: e.emoji,
          name: e.name,
          keywords: e.keywords,
        })),
      };
    },
  },
  {
    name: "text_unicode_info",
    description: "Get Unicode information about characters in text",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to analyze" },
      },
      required: ["text"],
    },
    handler: ({ text }) => {
      const chars = [...(text as string)];
      const info = chars.map((char) => {
        const codePoint = char.codePointAt(0)!;
        const hex = codePoint.toString(16).toUpperCase().padStart(4, "0");

        // Determine Unicode block (simplified)
        let block = "Unknown";
        if (codePoint <= 0x007F) block = "Basic Latin";
        else if (codePoint <= 0x00FF) block = "Latin-1 Supplement";
        else if (codePoint <= 0x017F) block = "Latin Extended-A";
        else if (codePoint <= 0x024F) block = "Latin Extended-B";
        else if (codePoint <= 0x036F) block = "Combining Diacritical Marks";
        else if (codePoint <= 0x03FF) block = "Greek and Coptic";
        else if (codePoint <= 0x04FF) block = "Cyrillic";
        else if (codePoint <= 0x052F) block = "Cyrillic Supplement";
        else if (codePoint <= 0x058F) block = "Armenian";
        else if (codePoint <= 0x05FF) block = "Hebrew";
        else if (codePoint <= 0x06FF) block = "Arabic";
        else if (codePoint >= 0x4E00 && codePoint <= 0x9FFF) block = "CJK Unified Ideographs";
        else if (codePoint >= 0x3040 && codePoint <= 0x309F) block = "Hiragana";
        else if (codePoint >= 0x30A0 && codePoint <= 0x30FF) block = "Katakana";
        else if (codePoint >= 0xAC00 && codePoint <= 0xD7AF) block = "Hangul Syllables";
        else if (codePoint >= 0x1F600 && codePoint <= 0x1F64F) block = "Emoticons";
        else if (codePoint >= 0x1F300 && codePoint <= 0x1F5FF) block = "Miscellaneous Symbols and Pictographs";
        else if (codePoint >= 0x1F680 && codePoint <= 0x1F6FF) block = "Transport and Map Symbols";
        else if (codePoint >= 0x1F900 && codePoint <= 0x1F9FF) block = "Supplemental Symbols and Pictographs";
        else if (codePoint >= 0x2600 && codePoint <= 0x26FF) block = "Miscellaneous Symbols";
        else if (codePoint >= 0x2700 && codePoint <= 0x27BF) block = "Dingbats";

        return {
          char,
          codePoint,
          hex: `U+${hex}`,
          utf8: Array.from(new TextEncoder().encode(char)).map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" "),
          utf16: char.split("").map((c) => c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")).join(" "),
          block,
          htmlEntity: codePoint > 127 ? `&#${codePoint};` : char,
          cssEscape: `\\${hex}`,
        };
      });

      return {
        text: text as string,
        length: chars.length,
        byteLength: new TextEncoder().encode(text as string).length,
        characters: info,
      };
    },
  },
  {
    name: "text_homoglyph",
    description: "Detect or create homoglyphs (look-alike characters)",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to process" },
        action: {
          type: "string",
          enum: ["detect", "create", "normalize"],
          description: "Action: detect suspicious chars, create homoglyphs, or normalize to ASCII",
        },
      },
      required: ["text", "action"],
    },
    handler: ({ text, action }) => {
      const homoglyphs: Record<string, string[]> = {
        a: ["а", "ɑ", "α", "ａ"],
        b: ["Ь", "ｂ"],
        c: ["с", "ϲ", "ｃ"],
        d: ["ԁ", "ｄ"],
        e: ["е", "ҽ", "ｅ"],
        g: ["ɡ", "ｇ"],
        h: ["һ", "ｈ"],
        i: ["і", "ı", "ｉ"],
        j: ["ј", "ｊ"],
        k: ["κ", "ｋ"],
        l: ["ӏ", "Ɩ", "ｌ"],
        m: ["м", "ｍ"],
        n: ["ո", "ｎ"],
        o: ["о", "ο", "ｏ"],
        p: ["р", "ρ", "ｐ"],
        q: ["ԛ", "ｑ"],
        r: ["г", "ｒ"],
        s: ["ѕ", "ｓ"],
        t: ["ｔ"],
        u: ["υ", "ｕ"],
        v: ["ν", "ｖ"],
        w: ["ѡ", "ｗ"],
        x: ["х", "ｘ"],
        y: ["у", "γ", "ｙ"],
        z: ["ｚ"],
        A: ["А", "Α", "Ａ"],
        B: ["В", "Β", "Ｂ"],
        C: ["С", "Ϲ", "Ｃ"],
        E: ["Е", "Ε", "Ｅ"],
        H: ["Н", "Η", "Ｈ"],
        I: ["І", "Ι", "Ｉ"],
        K: ["К", "Κ", "Ｋ"],
        M: ["М", "Μ", "Ｍ"],
        N: ["Ν", "Ｎ"],
        O: ["О", "Ο", "Ｏ"],
        P: ["Р", "Ρ", "Ｐ"],
        S: ["Ѕ", "Ｓ"],
        T: ["Т", "Τ", "Ｔ"],
        X: ["Х", "Χ", "Ｘ"],
        Y: ["Υ", "Ｙ"],
        Z: ["Ζ", "Ｚ"],
        "0": ["О", "ο", "０"],
        "1": ["І", "ı", "１"],
      };

      const t = text as string;

      if (action === "detect") {
        const suspicious: Array<{ char: string; position: number; lookalike: string }> = [];
        const reverseMap: Record<string, string> = {};
        for (const [ascii, glyphs] of Object.entries(homoglyphs)) {
          for (const glyph of glyphs) {
            reverseMap[glyph] = ascii;
          }
        }

        for (let i = 0; i < t.length; i++) {
          const char = t[i];
          if (reverseMap[char]) {
            suspicious.push({
              char,
              position: i,
              lookalike: reverseMap[char],
            });
          }
        }

        return {
          text: t,
          suspicious: suspicious.length > 0,
          count: suspicious.length,
          characters: suspicious,
        };
      }

      if (action === "create") {
        const result = t.split("").map((char) => {
          const glyphs = homoglyphs[char];
          if (glyphs && glyphs.length > 0) {
            return glyphs[Math.floor(Math.random() * glyphs.length)];
          }
          return char;
        }).join("");

        return { original: t, homoglyph: result };
      }

      // Normalize
      const reverseMap: Record<string, string> = {};
      for (const [ascii, glyphs] of Object.entries(homoglyphs)) {
        for (const glyph of glyphs) {
          reverseMap[glyph] = ascii;
        }
      }

      const normalized = t.split("").map((char) => reverseMap[char] || char).join("");
      return { original: t, normalized };
    },
  },
  // Word analysis - inspired by IT-Tools MCP
  {
    name: "text_analyze_words",
    description: "Analyze words in text - count unique/distinct words, frequency analysis",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to analyze" },
        caseSensitive: {
          type: "boolean",
          description: "Treat different cases as different words (default: false)",
        },
        minLength: {
          type: "number",
          description: "Minimum word length to include (default: 1)",
        },
        stopWords: {
          type: "array",
          items: { type: "string" },
          description: "Words to exclude from analysis",
        },
        topN: {
          type: "number",
          description: "Return only top N most frequent words (default: all)",
        },
      },
      required: ["text"],
    },
    handler: ({ text, caseSensitive = false, minLength = 1, stopWords = [], topN }) => {
      const t = text as string;
      const minLen = minLength as number;
      const userStops = (stopWords as string[]).map((w) =>
        caseSensitive ? w : w.toLowerCase()
      );

      // Default English stop words
      const defaultStopWords = [
        "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
        "of", "with", "by", "from", "as", "is", "was", "are", "were", "been",
        "be", "have", "has", "had", "do", "does", "did", "will", "would", "could",
        "should", "may", "might", "can", "this", "that", "these", "those", "it",
        "its", "i", "you", "he", "she", "we", "they", "their", "them", "my",
        "your", "his", "her", "our", "not", "no", "so", "if", "then",
      ];

      // Use user stop words if provided, otherwise use defaults
      const stops = new Set(userStops.length > 0 ? userStops : defaultStopWords);

      // Extract words - split on non-word characters
      const words = t.match(/\b[\w'-]+\b/g) || [];

      // Process and count
      const frequency: Record<string, number> = {};
      let totalWords = 0;

      for (const word of words) {
        const normalized = caseSensitive ? word : word.toLowerCase();

        // Skip short words
        if (normalized.length < minLen) continue;

        // Skip stop words
        if (stops.size > 0 && stops.has(normalized)) continue;

        frequency[normalized] = (frequency[normalized] || 0) + 1;
        totalWords++;
      }

      // Sort by frequency
      const sorted = Object.entries(frequency)
        .sort((a, b) => b[1] - a[1])
        .map(([word, count]) => ({
          word,
          count,
          percentage: ((count / totalWords) * 100).toFixed(2) + "%",
        }));

      // Apply topN limit if specified
      const results = topN ? sorted.slice(0, topN as number) : sorted;

      // Find words that appear only once (hapax legomena)
      const hapax = sorted.filter((w) => w.count === 1).map((w) => w.word);

      return {
        totalWords,
        uniqueWords: Object.keys(frequency).length,
        averageWordLength: (
          Object.keys(frequency).reduce((sum, w) => sum + w.length, 0) /
          Object.keys(frequency).length
        ).toFixed(2),
        hapaxLegomena: {
          count: hapax.length,
          words: hapax.slice(0, 20), // First 20 hapax
        },
        lexicalDiversity: (
          (Object.keys(frequency).length / totalWords) * 100
        ).toFixed(2) + "%",
        mostFrequent: results.slice(0, 10),
        leastFrequent: sorted.slice(-5).reverse(),
        allWords: results,
      };
    },
  },
  // List format converter - inspired by IT-Tools MCP
  {
    name: "text_list_convert",
    description: "Convert between list formats (comma, newline, JSON array, semicolon, pipe, tabs, numbered)",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "Input list" },
        from: {
          type: "string",
          enum: ["comma", "newline", "json", "semicolon", "pipe", "tabs", "space", "auto"],
          description: "Input format (default: auto-detect)",
        },
        to: {
          type: "string",
          enum: ["comma", "newline", "json", "semicolon", "pipe", "tabs", "numbered", "bulleted", "quoted"],
          description: "Output format",
        },
        trim: { type: "boolean", description: "Trim whitespace from items (default: true)" },
        removeEmpty: { type: "boolean", description: "Remove empty items (default: true)" },
        sort: {
          type: "string",
          enum: ["none", "asc", "desc", "alpha", "alpha_desc"],
          description: "Sort order (default: none)",
        },
        unique: { type: "boolean", description: "Remove duplicates (default: false)" },
      },
      required: ["input", "to"],
    },
    handler: ({ input, from = "auto", to, trim = true, removeEmpty = true, sort = "none", unique = false }) => {
      const text = input as string;

      // Auto-detect input format
      let items: string[];
      const inputFormat = from as string;

      if (inputFormat === "auto" || inputFormat === undefined) {
        // Try to detect format
        if (text.startsWith("[") && text.endsWith("]")) {
          // JSON array
          try {
            items = JSON.parse(text);
          } catch {
            items = [text];
          }
        } else if (text.includes("\n")) {
          items = text.split("\n");
        } else if (text.includes("\t")) {
          items = text.split("\t");
        } else if (text.includes("|")) {
          items = text.split("|");
        } else if (text.includes(";")) {
          items = text.split(";");
        } else if (text.includes(",")) {
          items = text.split(",");
        } else {
          items = text.split(/\s+/);
        }
      } else {
        switch (inputFormat) {
          case "comma":
            items = text.split(",");
            break;
          case "newline":
            items = text.split("\n");
            break;
          case "json":
            try {
              items = JSON.parse(text);
            } catch {
              throw new Error("Invalid JSON array");
            }
            break;
          case "semicolon":
            items = text.split(";");
            break;
          case "pipe":
            items = text.split("|");
            break;
          case "tabs":
            items = text.split("\t");
            break;
          case "space":
            items = text.split(/\s+/);
            break;
          default:
            items = [text];
        }
      }

      // Process items
      if (trim) {
        items = items.map((item) => (typeof item === "string" ? item.trim() : String(item)));
      }
      if (removeEmpty) {
        items = items.filter((item) => item !== "");
      }
      if (unique) {
        items = [...new Set(items)];
      }

      // Sort
      switch (sort) {
        case "asc":
          items.sort((a, b) => parseFloat(a) - parseFloat(b));
          break;
        case "desc":
          items.sort((a, b) => parseFloat(b) - parseFloat(a));
          break;
        case "alpha":
          items.sort((a, b) => a.localeCompare(b));
          break;
        case "alpha_desc":
          items.sort((a, b) => b.localeCompare(a));
          break;
      }

      // Format output
      let output: string;
      switch (to as string) {
        case "comma":
          output = items.join(", ");
          break;
        case "newline":
          output = items.join("\n");
          break;
        case "json":
          output = JSON.stringify(items, null, 2);
          break;
        case "semicolon":
          output = items.join("; ");
          break;
        case "pipe":
          output = items.join(" | ");
          break;
        case "tabs":
          output = items.join("\t");
          break;
        case "numbered":
          output = items.map((item, i) => `${i + 1}. ${item}`).join("\n");
          break;
        case "bulleted":
          output = items.map((item) => `• ${item}`).join("\n");
          break;
        case "quoted":
          output = items.map((item) => `"${item}"`).join(", ");
          break;
        default:
          output = items.join(", ");
      }

      return {
        output,
        count: items.length,
        items,
      };
    },
  },
];
