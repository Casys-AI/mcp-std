/**
 * Text processing tools - sed, awk, jq, sort, etc.
 *
 * @module lib/std/tools/text
 */

import type { MiniTool } from "./types.ts";
import { runCommand } from "./common.ts";

export const textTools: MiniTool[] = [
  {
    name: "sed",
    description:
      "Stream editor for find-and-replace text transformations. Use regex patterns like 's/old/new/g' to substitute text, delete lines, or transform content. Can modify files in-place or process input streams. Essential for text manipulation and batch editing. Keywords: sed, find replace, text substitution, regex replace, stream editor, pattern matching, text transform.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "Input text" },
        file: { type: "string", description: "Or input file path" },
        expression: { type: "string", description: "sed expression (e.g., 's/old/new/g')" },
        inPlace: { type: "boolean", description: "Modify file in place" },
      },
      required: ["expression"],
    },
    handler: async ({ input, file, expression, inPlace }) => {
      if (input) {
        const cmd = new Deno.Command("sed", {
          args: [expression as string],
          stdin: "piped",
          stdout: "piped",
          stderr: "piped",
        });
        const process = cmd.spawn();
        const writer = process.stdin.getWriter();
        await writer.write(new TextEncoder().encode(input as string));
        await writer.close();
        const { stdout, stderr } = await process.output();
        return {
          output: new TextDecoder().decode(stdout),
          stderr: new TextDecoder().decode(stderr),
        };
      } else if (file) {
        const args = inPlace
          ? ["-i", expression as string, file as string]
          : [expression as string, file as string];
        const result = await runCommand("sed", args);
        return { output: result.stdout, stderr: result.stderr };
      } else {
        throw new Error("Either input or file required");
      }
    },
  },
  {
    name: "awk",
    description:
      "Powerful text processing tool for column extraction and data manipulation. Process fields in structured text, calculate sums, filter rows by patterns. Use custom field separators for CSV, TSV, or log files. Keywords: awk, column extraction, field processing, text columns, data manipulation, csv processing, log parsing.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "Input text" },
        file: { type: "string", description: "Or input file path" },
        program: { type: "string", description: "awk program (e.g., '{print $1}')" },
        fieldSeparator: { type: "string", description: "Field separator (default: whitespace)" },
      },
      required: ["program"],
    },
    handler: async ({ input, file, program, fieldSeparator }) => {
      const args: string[] = [];
      if (fieldSeparator) args.push("-F", fieldSeparator as string);
      args.push(program as string);

      if (input) {
        const cmd = new Deno.Command("awk", {
          args,
          stdin: "piped",
          stdout: "piped",
          stderr: "piped",
        });
        const process = cmd.spawn();
        const writer = process.stdin.getWriter();
        await writer.write(new TextEncoder().encode(input as string));
        await writer.close();
        const { stdout, stderr } = await process.output();
        return {
          output: new TextDecoder().decode(stdout),
          stderr: new TextDecoder().decode(stderr),
        };
      } else if (file) {
        args.push(file as string);
        const result = await runCommand("awk", args);
        return { output: result.stdout, stderr: result.stderr };
      } else {
        throw new Error("Either input or file required");
      }
    },
  },
  {
    name: "jq",
    description:
      "Command-line JSON processor for querying, filtering, and transforming JSON data. Extract values with path expressions (.key, .[0]), filter arrays, reshape objects. Essential for working with APIs and JSON files. Keywords: jq, json query, json filter, json transform, json path, parse json, json extract.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "JSON input" },
        file: { type: "string", description: "Or JSON file path" },
        filter: { type: "string", description: "jq filter (e.g., '.name', '.[0]')" },
        raw: { type: "boolean", description: "Raw output (no quotes on strings)" },
      },
      required: ["filter"],
    },
    handler: async ({ input, file, filter, raw }) => {
      const args: string[] = [];
      if (raw) args.push("-r");
      args.push(filter as string);

      if (input) {
        const cmd = new Deno.Command("jq", {
          args,
          stdin: "piped",
          stdout: "piped",
          stderr: "piped",
        });
        const process = cmd.spawn();
        const writer = process.stdin.getWriter();
        await writer.write(new TextEncoder().encode(input as string));
        await writer.close();
        const { stdout, stderr } = await process.output();
        const output = new TextDecoder().decode(stdout);
        const stderrStr = new TextDecoder().decode(stderr);
        try {
          return { result: JSON.parse(output) };
        } catch {
          return { output, stderr: stderrStr || undefined };
        }
      } else if (file) {
        args.push(file as string);
        const result = await runCommand("jq", args);
        try {
          return { result: JSON.parse(result.stdout) };
        } catch {
          return { output: result.stdout, stderr: result.stderr || undefined };
        }
      } else {
        throw new Error("Either input or file required");
      }
    },
  },
  {
    name: "wc",
    description:
      "Count lines, words, characters, or bytes in text or files. Get line count for files, word counts for documents, or byte sizes. Essential for text statistics and file analysis. Keywords: wc, word count, line count, character count, count lines, file statistics, text length.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "Input text" },
        file: { type: "string", description: "Or file path" },
        mode: {
          type: "string",
          enum: ["all", "lines", "words", "chars", "bytes"],
          description: "Count mode (default: all)",
        },
      },
    },
    handler: async ({ input, file, mode = "all" }) => {
      const args: string[] = [];
      switch (mode) {
        case "lines":
          args.push("-l");
          break;
        case "words":
          args.push("-w");
          break;
        case "chars":
          args.push("-m");
          break;
        case "bytes":
          args.push("-c");
          break;
      }

      if (input) {
        const cmd = new Deno.Command("wc", {
          args,
          stdin: "piped",
          stdout: "piped",
        });
        const process = cmd.spawn();
        const writer = process.stdin.getWriter();
        await writer.write(new TextEncoder().encode(input as string));
        await writer.close();
        const { stdout } = await process.output();
        const output = new TextDecoder().decode(stdout).trim();
        const parts = output.split(/\s+/).map((n) => parseInt(n)).filter((n) => !isNaN(n));

        if (mode === "all") {
          return { lines: parts[0], words: parts[1], bytes: parts[2] };
        }
        return { count: parts[0] };
      } else if (file) {
        args.push(file as string);
        const result = await runCommand("wc", args);
        const parts = result.stdout.trim().split(/\s+/).map((n) => parseInt(n)).filter((n) =>
          !isNaN(n)
        );

        if (mode === "all") {
          return { lines: parts[0], words: parts[1], bytes: parts[2], file };
        }
        return { count: parts[0], file };
      } else {
        throw new Error("Either input or file required");
      }
    },
  },
  {
    name: "head",
    description:
      "Get the first N lines from a file or text. Preview file contents, check file headers, or limit output. Default shows first 10 lines. Use for quick file inspection or sampling. Keywords: head, first lines, file preview, top lines, file start, beginning of file.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string", description: "File path" },
        input: { type: "string", description: "Or input text" },
        lines: { type: "number", description: "Number of lines (default: 10)" },
      },
    },
    handler: async ({ file, input, lines = 10 }) => {
      if (input) {
        const allLines = (input as string).split("\n");
        return { output: allLines.slice(0, lines as number).join("\n") };
      } else if (file) {
        const result = await runCommand("head", ["-n", String(lines), file as string]);
        return { output: result.stdout };
      } else {
        throw new Error("Either file or input required");
      }
    },
  },
  {
    name: "tail",
    description:
      "Get the last N lines from a file or text. View recent log entries, check file endings, or monitor growing files. Default shows last 10 lines. Essential for log file analysis. Keywords: tail, last lines, file end, recent lines, end of file, log tail.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string", description: "File path" },
        input: { type: "string", description: "Or input text" },
        lines: { type: "number", description: "Number of lines (default: 10)" },
      },
    },
    handler: async ({ file, input, lines = 10 }) => {
      if (input) {
        const allLines = (input as string).split("\n");
        return { output: allLines.slice(-(lines as number)).join("\n") };
      } else if (file) {
        const result = await runCommand("tail", ["-n", String(lines), file as string]);
        return { output: result.stdout };
      } else {
        throw new Error("Either file or input required");
      }
    },
  },
  {
    name: "sort_lines",
    description:
      "Sort lines of text alphabetically, numerically, or in reverse order. Remove duplicates with unique flag. Process text from input or files. Essential for ordering data, removing duplicates, or preparing for uniq. Keywords: sort, sort lines, alphabetical sort, numeric sort, remove duplicates, order text.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "Input text" },
        file: { type: "string", description: "Or file path" },
        reverse: { type: "boolean", description: "Reverse order" },
        numeric: { type: "boolean", description: "Numeric sort" },
        unique: { type: "boolean", description: "Remove duplicates" },
      },
    },
    handler: async ({ input, file, reverse, numeric, unique }) => {
      const args: string[] = [];
      if (reverse) args.push("-r");
      if (numeric) args.push("-n");
      if (unique) args.push("-u");

      if (input) {
        const cmd = new Deno.Command("sort", {
          args,
          stdin: "piped",
          stdout: "piped",
        });
        const process = cmd.spawn();
        const writer = process.stdin.getWriter();
        await writer.write(new TextEncoder().encode(input as string));
        await writer.close();
        const { stdout } = await process.output();
        return { output: new TextDecoder().decode(stdout) };
      } else if (file) {
        args.push(file as string);
        const result = await runCommand("sort", args);
        return { output: result.stdout };
      } else {
        throw new Error("Either input or file required");
      }
    },
  },
  {
    name: "uniq",
    description:
      "Filter unique or duplicate lines from sorted input. Count occurrences, show only duplicates, or remove consecutive duplicates. Note: input should be sorted first. Use for deduplication or frequency analysis. Keywords: uniq, unique lines, remove duplicates, count occurrences, filter duplicates, deduplicate.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "Input text (should be sorted)" },
        file: { type: "string", description: "Or file path" },
        count: { type: "boolean", description: "Prefix lines with count" },
        duplicatesOnly: { type: "boolean", description: "Only show duplicates" },
      },
    },
    handler: async ({ input, file, count, duplicatesOnly }) => {
      const args: string[] = [];
      if (count) args.push("-c");
      if (duplicatesOnly) args.push("-d");

      if (input) {
        const cmd = new Deno.Command("uniq", {
          args,
          stdin: "piped",
          stdout: "piped",
        });
        const process = cmd.spawn();
        const writer = process.stdin.getWriter();
        await writer.write(new TextEncoder().encode(input as string));
        await writer.close();
        const { stdout } = await process.output();
        return { output: new TextDecoder().decode(stdout) };
      } else if (file) {
        args.push(file as string);
        const result = await runCommand("uniq", args);
        return { output: result.stdout };
      } else {
        throw new Error("Either input or file required");
      }
    },
  },
  {
    name: "cut",
    description:
      "Extract specific columns or character ranges from text. Select fields by delimiter (CSV, TSV) or character positions. Use for parsing structured text, extracting specific columns, or trimming output. Keywords: cut, extract columns, select fields, column extraction, csv columns, delimiter split.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "Input text" },
        file: { type: "string", description: "Or file path" },
        delimiter: { type: "string", description: "Field delimiter (default: tab)" },
        fields: { type: "string", description: "Fields to extract (e.g., '1,3' or '2-4')" },
        characters: { type: "string", description: "Character positions (e.g., '1-10')" },
      },
    },
    handler: async ({ input, file, delimiter, fields, characters }) => {
      const args: string[] = [];
      if (delimiter) args.push("-d", delimiter as string);
      if (fields) args.push("-f", fields as string);
      if (characters) args.push("-c", characters as string);

      if (input) {
        const cmd = new Deno.Command("cut", {
          args,
          stdin: "piped",
          stdout: "piped",
        });
        const process = cmd.spawn();
        const writer = process.stdin.getWriter();
        await writer.write(new TextEncoder().encode(input as string));
        await writer.close();
        const { stdout } = await process.output();
        return { output: new TextDecoder().decode(stdout) };
      } else if (file) {
        args.push(file as string);
        const result = await runCommand("cut", args);
        return { output: result.stdout };
      } else {
        throw new Error("Either input or file required");
      }
    },
  },
  {
    name: "diff",
    description:
      "Compare two files and show differences line by line. Output unified diff format showing additions, deletions, and context. Essential for code review, finding changes, or generating patches. Keywords: diff, compare files, file differences, unified diff, text comparison, show changes, patch format.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        file1: { type: "string", description: "First file" },
        file2: { type: "string", description: "Second file" },
        unified: { type: "boolean", description: "Unified format (default: true)" },
        context: { type: "number", description: "Lines of context (default: 3)" },
      },
      required: ["file1", "file2"],
    },
    handler: async ({ file1, file2, unified = true, context = 3 }) => {
      const args: string[] = [];
      if (unified) args.push("-u", `-U${context}`);
      args.push(file1 as string, file2 as string);

      const result = await runCommand("diff", args);
      return {
        identical: result.code === 0,
        diff: result.stdout,
      };
    },
  },
  {
    name: "regex_test",
    description:
      "Test a regular expression against a string and return all matches with details. Validates regex syntax, finds all matches with their positions and capture groups, and provides a basic explanation of the pattern. Use for regex debugging, pattern testing, or text extraction. Keywords: regex test, regular expression, pattern match, regex validate, capture groups, regex debug, pattern testing.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regex pattern to test" },
        text: { type: "string", description: "Text to test against" },
        flags: {
          type: "string",
          description: "Regex flags (g, i, m, s, u). Default: 'g'",
        },
      },
      required: ["pattern", "text"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/regex-tester",
        emits: ["edit"],
        accepts: [],
      },
    },
    handler: ({ pattern, text, flags = "g" }) => {
      const patternStr = pattern as string;
      const textStr = text as string;
      const flagsStr = flags as string;

      // Validate flags
      const validFlags = new Set(["g", "i", "m", "s", "u"]);
      for (const flag of flagsStr) {
        if (!validFlags.has(flag)) {
          return {
            pattern: patternStr,
            flags: flagsStr,
            isValid: false,
            matches: [],
            matchCount: 0,
            explanation: `Invalid flag '${flag}'. Valid flags are: g (global), i (case-insensitive), m (multiline), s (dotAll), u (unicode).`,
          };
        }
      }

      // Try to create regex
      let regex: RegExp;
      try {
        regex = new RegExp(patternStr, flagsStr);
      } catch (e) {
        return {
          pattern: patternStr,
          flags: flagsStr,
          isValid: false,
          matches: [],
          matchCount: 0,
          explanation: `Invalid regex: ${(e as Error).message}`,
        };
      }

      // Find all matches
      const matches: Array<{
        match: string;
        index: number;
        groups: Record<string, string> | null;
      }> = [];

      if (flagsStr.includes("g")) {
        let match: RegExpExecArray | null;
        while ((match = regex.exec(textStr)) !== null) {
          matches.push({
            match: match[0],
            index: match.index,
            groups: match.groups ? { ...match.groups } : null,
          });
          // Prevent infinite loop for zero-length matches
          if (match[0].length === 0) {
            regex.lastIndex++;
          }
        }
      } else {
        const match = regex.exec(textStr);
        if (match) {
          matches.push({
            match: match[0],
            index: match.index,
            groups: match.groups ? { ...match.groups } : null,
          });
        }
      }

      // Generate basic explanation
      const explanation = generateRegexExplanation(patternStr, flagsStr);

      return {
        pattern: patternStr,
        flags: flagsStr,
        isValid: true,
        matches,
        matchCount: matches.length,
        explanation,
      };
    },
  },
  {
    name: "unicode_inspect",
    description:
      "Analyze Unicode characters in a string. Returns detailed information about each character including code point, official Unicode name, category, visibility status, and UTF-8 byte representation. Useful for debugging encoding issues, finding invisible characters, or understanding text composition. Keywords: unicode, character analysis, code point, utf8, invisible characters, zero width, encoding, text inspection.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to analyze" },
        showInvisible: {
          type: "boolean",
          description: "Show invisible characters (default: true)",
        },
      },
      required: ["text"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/table-viewer",
        emits: [],
        accepts: [],
      },
    },
    handler: ({ text, showInvisible = true }) => {
      const textStr = text as string;
      const showInvisibleBool = showInvisible as boolean;

      // Get all code points (handles surrogate pairs correctly)
      const codePoints = [...textStr].map((char) => char.codePointAt(0)!);

      const characters: Array<{
        char: string;
        codePoint: string;
        name: string;
        category: string;
        isInvisible: boolean;
        bytes: string;
      }> = [];

      const summary = {
        letters: 0,
        numbers: 0,
        symbols: 0,
        spaces: 0,
        invisible: 0,
        emoji: 0,
      };

      for (const cp of codePoints) {
        const char = String.fromCodePoint(cp);
        const category = getUnicodeCategory(cp);
        const invisible = isInvisibleChar(cp);

        // Update summary
        switch (category) {
          case "Letter":
            summary.letters++;
            break;
          case "Number":
            summary.numbers++;
            break;
          case "Symbol":
          case "Punctuation":
            summary.symbols++;
            break;
          case "Space":
            summary.spaces++;
            break;
          case "Emoji":
            summary.emoji++;
            break;
        }
        if (invisible) {
          summary.invisible++;
        }

        // Skip invisible chars if not requested
        if (!showInvisibleBool && invisible) {
          continue;
        }

        characters.push({
          char: invisible ? `[${getUnicodeName(cp)}]` : char,
          codePoint: `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`,
          name: getUnicodeName(cp),
          category,
          isInvisible: invisible,
          bytes: codePointToUtf8Hex(cp),
        });
      }

      return {
        text: textStr,
        length: textStr.length,
        codePointCount: codePoints.length,
        characters,
        summary,
      };
    },
  },
  {
    name: "semver_parse",
    description:
      "Parse and analyze a semantic version string according to semver.org specification. Extracts major, minor, patch numbers, prerelease identifiers, and build metadata. Validates syntax and provides normalized form. Use for version validation, comparing versions, or extracting version components. Keywords: semver, semantic version, version parse, version validate, version components, major minor patch, prerelease, build metadata.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        version: {
          type: "string",
          description: "Semantic version string (e.g., '1.2.3-beta.1+build.456')",
        },
      },
      required: ["version"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/json-viewer",
        emits: [],
        accepts: [],
      },
    },
    handler: ({ version }) => {
      return parseSemver(version as string);
    },
  },
  {
    name: "semver_compare",
    description:
      "Compare two semantic versions according to semver.org specification. Returns -1 if version1 < version2, 0 if equal, 1 if version1 > version2. Compares major, minor, patch in order, then prerelease identifiers. Build metadata is ignored in comparison. Use for version ordering, dependency resolution, or upgrade checks. Keywords: semver compare, version compare, version order, version difference, semver sort, version newer older.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        version1: {
          type: "string",
          description: "First semantic version string",
        },
        version2: {
          type: "string",
          description: "Second semantic version string",
        },
      },
      required: ["version1", "version2"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/diff-viewer",
        emits: [],
        accepts: [],
      },
    },
    handler: ({ version1, version2 }) => {
      return compareSemver(version1 as string, version2 as string);
    },
  },
  {
    name: "text_diff",
    description:
      "Compare two texts and generate a unified diff showing additions, deletions, and changes. Uses LCS (Longest Common Subsequence) algorithm to compute the optimal diff. Returns statistics (additions, deletions, changes), structured hunks with line-by-line details, and a unified diff string. Essential for code review, comparing versions, or tracking text changes. Keywords: text diff, compare text, unified diff, text comparison, additions deletions, change detection, diff algorithm, LCS.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        text1: {
          type: "string",
          description: "First text (original)",
        },
        text2: {
          type: "string",
          description: "Second text (modified)",
        },
        context: {
          type: "number",
          description: "Number of context lines around changes (default: 3)",
        },
      },
      required: ["text1", "text2"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/diff-viewer",
        emits: [],
        accepts: [],
      },
    },
    handler: ({ text1, text2, context = 3 }) => {
      return computeTextDiff(text1 as string, text2 as string, context as number);
    },
  },
  {
    name: "markdown_render",
    description:
      "Render Markdown text with syntax highlighting preview. Parse and display markdown content including headers, lists, code blocks, links, and formatting. Useful for documentation preview, README display, or content rendering. Keywords: markdown, render, preview, documentation, README, formatted text.",
    category: "text",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "Markdown content to render" },
        flavor: {
          type: "string",
          enum: ["gfm", "commonmark"],
          description: "Markdown flavor: 'gfm' (GitHub Flavored) or 'commonmark' (default: 'gfm')",
        },
      },
      required: ["content"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/markdown-viewer",
      },
    },
    handler: ({ content, flavor = "gfm" }) => {
      const md = content as string;

      // Basic markdown stats
      const lines = md.split("\n");
      const headers = lines.filter((l) => /^#{1,6}\s/.test(l)).length;
      const codeBlocks = (md.match(/```[\s\S]*?```/g) || []).length;
      const links = (md.match(/\[([^\]]+)\]\([^)]+\)/g) || []).length;
      const images = (md.match(/!\[([^\]]*)\]\([^)]+\)/g) || []).length;
      const lists = lines.filter((l) => /^(\s*[-*+]|\s*\d+\.)\s/.test(l)).length;

      return {
        content: md,
        flavor: flavor as string,
        stats: {
          lines: lines.length,
          characters: md.length,
          words: md.split(/\s+/).filter(Boolean).length,
          headers,
          codeBlocks,
          links,
          images,
          listItems: lists,
        },
      };
    },
  },
];

/**
 * Semver parsing types
 */
interface SemverParsed {
  valid: boolean;
  raw: string;
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
  build: string[];
  isPrerelease: boolean;
  isStable: boolean;
  normalized: string;
  error?: string;
}

/**
 * Parse a semantic version string according to semver.org spec
 * https://semver.org/
 */
function parseSemver(version: string): SemverParsed {
  const raw = version;
  const invalid = (error: string): SemverParsed => ({
    valid: false,
    raw,
    major: 0,
    minor: 0,
    patch: 0,
    prerelease: [],
    build: [],
    isPrerelease: false,
    isStable: false,
    normalized: "",
    error,
  });

  if (!version || typeof version !== "string") {
    return invalid("Version must be a non-empty string");
  }

  // Trim leading 'v' or 'V' prefix (common but not part of semver spec)
  let v = version.trim();
  if (v.startsWith("v") || v.startsWith("V")) {
    v = v.slice(1);
  }

  // Semver regex according to spec (simplified but accurate)
  // Format: MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]
  // MAJOR, MINOR, PATCH are non-negative integers without leading zeros (except 0 itself)
  // PRERELEASE and BUILD are dot-separated identifiers

  // Split off build metadata first (everything after +)
  let buildStr = "";
  const plusIdx = v.indexOf("+");
  if (plusIdx !== -1) {
    buildStr = v.slice(plusIdx + 1);
    v = v.slice(0, plusIdx);
  }

  // Split off prerelease (everything after first -)
  let prereleaseStr = "";
  const hyphenIdx = v.indexOf("-");
  if (hyphenIdx !== -1) {
    prereleaseStr = v.slice(hyphenIdx + 1);
    v = v.slice(0, hyphenIdx);
  }

  // Parse core version (MAJOR.MINOR.PATCH)
  const coreParts = v.split(".");
  if (coreParts.length !== 3) {
    return invalid(`Invalid version format: expected MAJOR.MINOR.PATCH, got '${v}'`);
  }

  const [majorStr, minorStr, patchStr] = coreParts;

  // Validate numeric identifiers (no leading zeros except for 0 itself)
  const validateNumeric = (str: string, name: string): number | string => {
    if (!/^\d+$/.test(str)) {
      return `${name} must be a non-negative integer, got '${str}'`;
    }
    if (str.length > 1 && str.startsWith("0")) {
      return `${name} must not have leading zeros, got '${str}'`;
    }
    const num = parseInt(str, 10);
    if (!Number.isSafeInteger(num) || num < 0) {
      return `${name} is out of range: '${str}'`;
    }
    return num;
  };

  const majorResult = validateNumeric(majorStr, "Major version");
  if (typeof majorResult === "string") {
    return invalid(majorResult);
  }
  const major = majorResult;

  const minorResult = validateNumeric(minorStr, "Minor version");
  if (typeof minorResult === "string") {
    return invalid(minorResult);
  }
  const minor = minorResult;

  const patchResult = validateNumeric(patchStr, "Patch version");
  if (typeof patchResult === "string") {
    return invalid(patchResult);
  }
  const patch = patchResult;

  // Parse prerelease identifiers
  const prerelease: string[] = [];
  if (prereleaseStr) {
    const preParts = prereleaseStr.split(".");
    for (const part of preParts) {
      if (part === "") {
        return invalid("Prerelease identifier cannot be empty");
      }
      // Prerelease identifiers can be alphanumeric or numeric
      // Numeric identifiers must not have leading zeros
      if (/^\d+$/.test(part)) {
        if (part.length > 1 && part.startsWith("0")) {
          return invalid(`Numeric prerelease identifier must not have leading zeros: '${part}'`);
        }
      } else if (!/^[0-9A-Za-z-]+$/.test(part)) {
        return invalid(`Invalid prerelease identifier: '${part}' (must be alphanumeric or hyphens)`);
      }
      prerelease.push(part);
    }
  }

  // Parse build metadata identifiers
  const build: string[] = [];
  if (buildStr) {
    const buildParts = buildStr.split(".");
    for (const part of buildParts) {
      if (part === "") {
        return invalid("Build metadata identifier cannot be empty");
      }
      if (!/^[0-9A-Za-z-]+$/.test(part)) {
        return invalid(`Invalid build metadata identifier: '${part}' (must be alphanumeric or hyphens)`);
      }
      build.push(part);
    }
  }

  // Build normalized string (without build metadata as per spec)
  let normalized = `${major}.${minor}.${patch}`;
  if (prerelease.length > 0) {
    normalized += `-${prerelease.join(".")}`;
  }

  const isPrerelease = prerelease.length > 0;
  const isStable = major >= 1 && !isPrerelease;

  return {
    valid: true,
    raw,
    major,
    minor,
    patch,
    prerelease,
    build,
    isPrerelease,
    isStable,
    normalized,
  };
}

/**
 * Compare two semantic versions according to semver.org spec
 */
function compareSemver(version1: string, version2: string): {
  result: -1 | 0 | 1;
  comparison: "older" | "equal" | "newer";
  version1: SemverParsed;
  version2: SemverParsed;
  diff: "major" | "minor" | "patch" | "prerelease" | "none";
} {
  const v1 = parseSemver(version1);
  const v2 = parseSemver(version2);

  // If either is invalid, we can still compare but note it
  if (!v1.valid || !v2.valid) {
    return {
      result: 0,
      comparison: "equal",
      version1: v1,
      version2: v2,
      diff: "none",
    };
  }

  // Compare major, minor, patch
  if (v1.major !== v2.major) {
    const result = v1.major > v2.major ? 1 : -1;
    return {
      result,
      comparison: result === 1 ? "newer" : "older",
      version1: v1,
      version2: v2,
      diff: "major",
    };
  }

  if (v1.minor !== v2.minor) {
    const result = v1.minor > v2.minor ? 1 : -1;
    return {
      result,
      comparison: result === 1 ? "newer" : "older",
      version1: v1,
      version2: v2,
      diff: "minor",
    };
  }

  if (v1.patch !== v2.patch) {
    const result = v1.patch > v2.patch ? 1 : -1;
    return {
      result,
      comparison: result === 1 ? "newer" : "older",
      version1: v1,
      version2: v2,
      diff: "patch",
    };
  }

  // Compare prerelease
  // A version without prerelease has higher precedence than one with prerelease
  if (v1.prerelease.length === 0 && v2.prerelease.length === 0) {
    return {
      result: 0,
      comparison: "equal",
      version1: v1,
      version2: v2,
      diff: "none",
    };
  }

  if (v1.prerelease.length === 0) {
    // v1 is release, v2 is prerelease -> v1 > v2
    return {
      result: 1,
      comparison: "newer",
      version1: v1,
      version2: v2,
      diff: "prerelease",
    };
  }

  if (v2.prerelease.length === 0) {
    // v1 is prerelease, v2 is release -> v1 < v2
    return {
      result: -1,
      comparison: "older",
      version1: v1,
      version2: v2,
      diff: "prerelease",
    };
  }

  // Both have prerelease - compare identifier by identifier
  const maxLen = Math.max(v1.prerelease.length, v2.prerelease.length);
  for (let i = 0; i < maxLen; i++) {
    const id1 = v1.prerelease[i];
    const id2 = v2.prerelease[i];

    // Fewer identifiers = lower precedence
    if (id1 === undefined) {
      return {
        result: -1,
        comparison: "older",
        version1: v1,
        version2: v2,
        diff: "prerelease",
      };
    }
    if (id2 === undefined) {
      return {
        result: 1,
        comparison: "newer",
        version1: v1,
        version2: v2,
        diff: "prerelease",
      };
    }

    const isNum1 = /^\d+$/.test(id1);
    const isNum2 = /^\d+$/.test(id2);

    if (isNum1 && isNum2) {
      // Both numeric - compare as integers
      const num1 = parseInt(id1, 10);
      const num2 = parseInt(id2, 10);
      if (num1 !== num2) {
        const result = num1 > num2 ? 1 : -1;
        return {
          result,
          comparison: result === 1 ? "newer" : "older",
          version1: v1,
          version2: v2,
          diff: "prerelease",
        };
      }
    } else if (isNum1) {
      // Numeric identifiers have lower precedence than alphanumeric
      return {
        result: -1,
        comparison: "older",
        version1: v1,
        version2: v2,
        diff: "prerelease",
      };
    } else if (isNum2) {
      // Alphanumeric has higher precedence than numeric
      return {
        result: 1,
        comparison: "newer",
        version1: v1,
        version2: v2,
        diff: "prerelease",
      };
    } else {
      // Both alphanumeric - compare lexically
      if (id1 !== id2) {
        const result = id1 > id2 ? 1 : -1;
        return {
          result,
          comparison: result === 1 ? "newer" : "older",
          version1: v1,
          version2: v2,
          diff: "prerelease",
        };
      }
    }
  }

  // All prerelease identifiers are equal
  return {
    result: 0,
    comparison: "equal",
    version1: v1,
    version2: v2,
    diff: "none",
  };
}

/**
 * Text diff types
 */
interface DiffLine {
  type: "context" | "addition" | "deletion";
  content: string;
  lineNumber1?: number;
  lineNumber2?: number;
}

interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

interface TextDiffResult {
  identical: boolean;
  stats: {
    additions: number;
    deletions: number;
    changes: number;
    totalLines1: number;
    totalLines2: number;
  };
  hunks: DiffHunk[];
  unified: string;
}

/**
 * Compute the Longest Common Subsequence (LCS) between two arrays
 * Returns the LCS table for backtracking
 */
function computeLCSTable(lines1: string[], lines2: string[]): number[][] {
  const m = lines1.length;
  const n = lines2.length;

  // Create a 2D table for LCS lengths
  const table: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  // Fill the table using dynamic programming
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (lines1[i - 1] === lines2[j - 1]) {
        table[i][j] = table[i - 1][j - 1] + 1;
      } else {
        table[i][j] = Math.max(table[i - 1][j], table[i][j - 1]);
      }
    }
  }

  return table;
}

/**
 * Backtrack through the LCS table to generate diff operations
 */
function backtrackDiff(
  lines1: string[],
  lines2: string[],
  table: number[][]
): Array<{ type: "equal" | "delete" | "insert"; line1?: number; line2?: number }>  {
  const diff: Array<{ type: "equal" | "delete" | "insert"; line1?: number; line2?: number }> = [];
  let i = lines1.length;
  let j = lines2.length;

  // Backtrack from the bottom-right corner
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && lines1[i - 1] === lines2[j - 1]) {
      // Lines are equal - part of LCS
      diff.unshift({ type: "equal", line1: i - 1, line2: j - 1 });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || table[i][j - 1] >= table[i - 1][j])) {
      // Line was inserted in lines2
      diff.unshift({ type: "insert", line2: j - 1 });
      j--;
    } else if (i > 0) {
      // Line was deleted from lines1
      diff.unshift({ type: "delete", line1: i - 1 });
      i--;
    }
  }

  return diff;
}

/**
 * Compute text diff using LCS algorithm
 */
function computeTextDiff(text1: string, text2: string, contextLines: number): TextDiffResult {
  // Split texts into lines
  const lines1 = text1.split("\n");
  const lines2 = text2.split("\n");

  // Check if identical
  if (text1 === text2) {
    return {
      identical: true,
      stats: {
        additions: 0,
        deletions: 0,
        changes: 0,
        totalLines1: lines1.length,
        totalLines2: lines2.length,
      },
      hunks: [],
      unified: "",
    };
  }

  // Compute LCS and diff operations
  const lcsTable = computeLCSTable(lines1, lines2);
  const diffOps = backtrackDiff(lines1, lines2, lcsTable);

  // Count statistics
  let additions = 0;
  let deletions = 0;

  for (const op of diffOps) {
    if (op.type === "insert") additions++;
    if (op.type === "delete") deletions++;
  }

  // Estimate changes (consecutive delete+insert pairs)
  let changes = 0;
  for (let i = 0; i < diffOps.length - 1; i++) {
    if (diffOps[i].type === "delete" && diffOps[i + 1].type === "insert") {
      changes++;
    }
  }

  // Generate hunks with context
  const hunks: DiffHunk[] = [];
  const allLines: Array<DiffLine & { originalIdx: number }> = [];

  // Convert diff operations to diff lines
  let line1Num = 0;
  let line2Num = 0;

  for (const op of diffOps) {
    if (op.type === "equal") {
      line1Num++;
      line2Num++;
      allLines.push({
        type: "context",
        content: lines1[op.line1!],
        lineNumber1: line1Num,
        lineNumber2: line2Num,
        originalIdx: allLines.length,
      });
    } else if (op.type === "delete") {
      line1Num++;
      allLines.push({
        type: "deletion",
        content: lines1[op.line1!],
        lineNumber1: line1Num,
        originalIdx: allLines.length,
      });
    } else if (op.type === "insert") {
      line2Num++;
      allLines.push({
        type: "addition",
        content: lines2[op.line2!],
        lineNumber2: line2Num,
        originalIdx: allLines.length,
      });
    }
  }

  // Find change ranges (consecutive non-context lines with surrounding context)
  const changeRanges: Array<{ start: number; end: number }> = [];
  let inChange = false;
  let changeStart = 0;

  for (let i = 0; i < allLines.length; i++) {
    const isChange = allLines[i].type !== "context";
    if (isChange && !inChange) {
      changeStart = i;
      inChange = true;
    } else if (!isChange && inChange) {
      changeRanges.push({ start: changeStart, end: i - 1 });
      inChange = false;
    }
  }
  if (inChange) {
    changeRanges.push({ start: changeStart, end: allLines.length - 1 });
  }

  // Merge overlapping ranges (with context)
  const mergedRanges: Array<{ start: number; end: number }> = [];
  for (const range of changeRanges) {
    const expandedStart = Math.max(0, range.start - contextLines);
    const expandedEnd = Math.min(allLines.length - 1, range.end + contextLines);

    if (
      mergedRanges.length > 0 &&
      expandedStart <= mergedRanges[mergedRanges.length - 1].end + 1
    ) {
      // Merge with previous range
      mergedRanges[mergedRanges.length - 1].end = expandedEnd;
    } else {
      mergedRanges.push({ start: expandedStart, end: expandedEnd });
    }
  }

  // Create hunks from merged ranges
  for (const range of mergedRanges) {
    const hunkLines: DiffLine[] = [];
    let hunkStart1 = 0;
    let hunkStart2 = 0;
    let hunkCount1 = 0;
    let hunkCount2 = 0;

    // Find the starting line numbers
    for (let i = range.start; i <= range.end; i++) {
      const line = allLines[i];
      if (i === range.start) {
        hunkStart1 = line.lineNumber1 || 1;
        hunkStart2 = line.lineNumber2 || 1;
      }

      hunkLines.push({
        type: line.type,
        content: line.content,
        lineNumber1: line.lineNumber1,
        lineNumber2: line.lineNumber2,
      });

      if (line.type === "context" || line.type === "deletion") {
        hunkCount1++;
      }
      if (line.type === "context" || line.type === "addition") {
        hunkCount2++;
      }
    }

    // Adjust start positions based on actual content
    const firstDeletion = hunkLines.find((l) => l.type === "deletion");
    const firstAddition = hunkLines.find((l) => l.type === "addition");
    const firstContext = hunkLines.find((l) => l.type === "context");

    if (firstContext) {
      hunkStart1 = firstContext.lineNumber1!;
      hunkStart2 = firstContext.lineNumber2!;
    } else {
      if (firstDeletion) hunkStart1 = firstDeletion.lineNumber1!;
      if (firstAddition) hunkStart2 = firstAddition.lineNumber2!;
    }

    // Recalculate counts
    hunkCount1 = hunkLines.filter(
      (l) => l.type === "context" || l.type === "deletion"
    ).length;
    hunkCount2 = hunkLines.filter(
      (l) => l.type === "context" || l.type === "addition"
    ).length;

    const header = `@@ -${hunkStart1},${hunkCount1} +${hunkStart2},${hunkCount2} @@`;
    hunks.push({ header, lines: hunkLines });
  }

  // Generate unified diff string
  const unifiedParts: string[] = ["--- a", "+++ b"];

  for (const hunk of hunks) {
    unifiedParts.push(hunk.header);
    for (const line of hunk.lines) {
      const prefix =
        line.type === "context" ? " " : line.type === "addition" ? "+" : "-";
      unifiedParts.push(prefix + line.content);
    }
  }

  return {
    identical: false,
    stats: {
      additions,
      deletions,
      changes,
      totalLines1: lines1.length,
      totalLines2: lines2.length,
    },
    hunks,
    unified: unifiedParts.join("\n"),
  };
}

// Unicode character name map for common characters
const UNICODE_NAMES: Record<number, string> = {
  // Control characters (0x00-0x1F)
  0x00: "NULL",
  0x01: "START OF HEADING",
  0x02: "START OF TEXT",
  0x03: "END OF TEXT",
  0x04: "END OF TRANSMISSION",
  0x05: "ENQUIRY",
  0x06: "ACKNOWLEDGE",
  0x07: "BELL",
  0x08: "BACKSPACE",
  0x09: "CHARACTER TABULATION",
  0x0A: "LINE FEED",
  0x0B: "LINE TABULATION",
  0x0C: "FORM FEED",
  0x0D: "CARRIAGE RETURN",
  0x0E: "SHIFT OUT",
  0x0F: "SHIFT IN",
  0x10: "DATA LINK ESCAPE",
  0x11: "DEVICE CONTROL ONE",
  0x12: "DEVICE CONTROL TWO",
  0x13: "DEVICE CONTROL THREE",
  0x14: "DEVICE CONTROL FOUR",
  0x15: "NEGATIVE ACKNOWLEDGE",
  0x16: "SYNCHRONOUS IDLE",
  0x17: "END OF TRANSMISSION BLOCK",
  0x18: "CANCEL",
  0x19: "END OF MEDIUM",
  0x1A: "SUBSTITUTE",
  0x1B: "ESCAPE",
  0x1C: "INFORMATION SEPARATOR FOUR",
  0x1D: "INFORMATION SEPARATOR THREE",
  0x1E: "INFORMATION SEPARATOR TWO",
  0x1F: "INFORMATION SEPARATOR ONE",
  // ASCII printable (0x20-0x7E)
  0x20: "SPACE",
  0x21: "EXCLAMATION MARK",
  0x22: "QUOTATION MARK",
  0x23: "NUMBER SIGN",
  0x24: "DOLLAR SIGN",
  0x25: "PERCENT SIGN",
  0x26: "AMPERSAND",
  0x27: "APOSTROPHE",
  0x28: "LEFT PARENTHESIS",
  0x29: "RIGHT PARENTHESIS",
  0x2A: "ASTERISK",
  0x2B: "PLUS SIGN",
  0x2C: "COMMA",
  0x2D: "HYPHEN-MINUS",
  0x2E: "FULL STOP",
  0x2F: "SOLIDUS",
  0x30: "DIGIT ZERO",
  0x31: "DIGIT ONE",
  0x32: "DIGIT TWO",
  0x33: "DIGIT THREE",
  0x34: "DIGIT FOUR",
  0x35: "DIGIT FIVE",
  0x36: "DIGIT SIX",
  0x37: "DIGIT SEVEN",
  0x38: "DIGIT EIGHT",
  0x39: "DIGIT NINE",
  0x3A: "COLON",
  0x3B: "SEMICOLON",
  0x3C: "LESS-THAN SIGN",
  0x3D: "EQUALS SIGN",
  0x3E: "GREATER-THAN SIGN",
  0x3F: "QUESTION MARK",
  0x40: "COMMERCIAL AT",
  0x41: "LATIN CAPITAL LETTER A",
  0x42: "LATIN CAPITAL LETTER B",
  0x43: "LATIN CAPITAL LETTER C",
  0x44: "LATIN CAPITAL LETTER D",
  0x45: "LATIN CAPITAL LETTER E",
  0x46: "LATIN CAPITAL LETTER F",
  0x47: "LATIN CAPITAL LETTER G",
  0x48: "LATIN CAPITAL LETTER H",
  0x49: "LATIN CAPITAL LETTER I",
  0x4A: "LATIN CAPITAL LETTER J",
  0x4B: "LATIN CAPITAL LETTER K",
  0x4C: "LATIN CAPITAL LETTER L",
  0x4D: "LATIN CAPITAL LETTER M",
  0x4E: "LATIN CAPITAL LETTER N",
  0x4F: "LATIN CAPITAL LETTER O",
  0x50: "LATIN CAPITAL LETTER P",
  0x51: "LATIN CAPITAL LETTER Q",
  0x52: "LATIN CAPITAL LETTER R",
  0x53: "LATIN CAPITAL LETTER S",
  0x54: "LATIN CAPITAL LETTER T",
  0x55: "LATIN CAPITAL LETTER U",
  0x56: "LATIN CAPITAL LETTER V",
  0x57: "LATIN CAPITAL LETTER W",
  0x58: "LATIN CAPITAL LETTER X",
  0x59: "LATIN CAPITAL LETTER Y",
  0x5A: "LATIN CAPITAL LETTER Z",
  0x5B: "LEFT SQUARE BRACKET",
  0x5C: "REVERSE SOLIDUS",
  0x5D: "RIGHT SQUARE BRACKET",
  0x5E: "CIRCUMFLEX ACCENT",
  0x5F: "LOW LINE",
  0x60: "GRAVE ACCENT",
  0x61: "LATIN SMALL LETTER A",
  0x62: "LATIN SMALL LETTER B",
  0x63: "LATIN SMALL LETTER C",
  0x64: "LATIN SMALL LETTER D",
  0x65: "LATIN SMALL LETTER E",
  0x66: "LATIN SMALL LETTER F",
  0x67: "LATIN SMALL LETTER G",
  0x68: "LATIN SMALL LETTER H",
  0x69: "LATIN SMALL LETTER I",
  0x6A: "LATIN SMALL LETTER J",
  0x6B: "LATIN SMALL LETTER K",
  0x6C: "LATIN SMALL LETTER L",
  0x6D: "LATIN SMALL LETTER M",
  0x6E: "LATIN SMALL LETTER N",
  0x6F: "LATIN SMALL LETTER O",
  0x70: "LATIN SMALL LETTER P",
  0x71: "LATIN SMALL LETTER Q",
  0x72: "LATIN SMALL LETTER R",
  0x73: "LATIN SMALL LETTER S",
  0x74: "LATIN SMALL LETTER T",
  0x75: "LATIN SMALL LETTER U",
  0x76: "LATIN SMALL LETTER V",
  0x77: "LATIN SMALL LETTER W",
  0x78: "LATIN SMALL LETTER X",
  0x79: "LATIN SMALL LETTER Y",
  0x7A: "LATIN SMALL LETTER Z",
  0x7B: "LEFT CURLY BRACKET",
  0x7C: "VERTICAL LINE",
  0x7D: "RIGHT CURLY BRACKET",
  0x7E: "TILDE",
  0x7F: "DELETE",
  // Latin-1 Supplement (0x80-0xFF)
  0xA0: "NO-BREAK SPACE",
  0xA1: "INVERTED EXCLAMATION MARK",
  0xA2: "CENT SIGN",
  0xA3: "POUND SIGN",
  0xA4: "CURRENCY SIGN",
  0xA5: "YEN SIGN",
  0xA6: "BROKEN BAR",
  0xA7: "SECTION SIGN",
  0xA8: "DIAERESIS",
  0xA9: "COPYRIGHT SIGN",
  0xAA: "FEMININE ORDINAL INDICATOR",
  0xAB: "LEFT-POINTING DOUBLE ANGLE QUOTATION MARK",
  0xAC: "NOT SIGN",
  0xAD: "SOFT HYPHEN",
  0xAE: "REGISTERED SIGN",
  0xAF: "MACRON",
  0xB0: "DEGREE SIGN",
  0xB1: "PLUS-MINUS SIGN",
  0xB2: "SUPERSCRIPT TWO",
  0xB3: "SUPERSCRIPT THREE",
  0xB4: "ACUTE ACCENT",
  0xB5: "MICRO SIGN",
  0xB6: "PILCROW SIGN",
  0xB7: "MIDDLE DOT",
  0xB8: "CEDILLA",
  0xB9: "SUPERSCRIPT ONE",
  0xBA: "MASCULINE ORDINAL INDICATOR",
  0xBB: "RIGHT-POINTING DOUBLE ANGLE QUOTATION MARK",
  0xBC: "VULGAR FRACTION ONE QUARTER",
  0xBD: "VULGAR FRACTION ONE HALF",
  0xBE: "VULGAR FRACTION THREE QUARTERS",
  0xBF: "INVERTED QUESTION MARK",
  0xC0: "LATIN CAPITAL LETTER A WITH GRAVE",
  0xC1: "LATIN CAPITAL LETTER A WITH ACUTE",
  0xC2: "LATIN CAPITAL LETTER A WITH CIRCUMFLEX",
  0xC3: "LATIN CAPITAL LETTER A WITH TILDE",
  0xC4: "LATIN CAPITAL LETTER A WITH DIAERESIS",
  0xC5: "LATIN CAPITAL LETTER A WITH RING ABOVE",
  0xC6: "LATIN CAPITAL LETTER AE",
  0xC7: "LATIN CAPITAL LETTER C WITH CEDILLA",
  0xC8: "LATIN CAPITAL LETTER E WITH GRAVE",
  0xC9: "LATIN CAPITAL LETTER E WITH ACUTE",
  0xCA: "LATIN CAPITAL LETTER E WITH CIRCUMFLEX",
  0xCB: "LATIN CAPITAL LETTER E WITH DIAERESIS",
  0xCC: "LATIN CAPITAL LETTER I WITH GRAVE",
  0xCD: "LATIN CAPITAL LETTER I WITH ACUTE",
  0xCE: "LATIN CAPITAL LETTER I WITH CIRCUMFLEX",
  0xCF: "LATIN CAPITAL LETTER I WITH DIAERESIS",
  0xD0: "LATIN CAPITAL LETTER ETH",
  0xD1: "LATIN CAPITAL LETTER N WITH TILDE",
  0xD2: "LATIN CAPITAL LETTER O WITH GRAVE",
  0xD3: "LATIN CAPITAL LETTER O WITH ACUTE",
  0xD4: "LATIN CAPITAL LETTER O WITH CIRCUMFLEX",
  0xD5: "LATIN CAPITAL LETTER O WITH TILDE",
  0xD6: "LATIN CAPITAL LETTER O WITH DIAERESIS",
  0xD7: "MULTIPLICATION SIGN",
  0xD8: "LATIN CAPITAL LETTER O WITH STROKE",
  0xD9: "LATIN CAPITAL LETTER U WITH GRAVE",
  0xDA: "LATIN CAPITAL LETTER U WITH ACUTE",
  0xDB: "LATIN CAPITAL LETTER U WITH CIRCUMFLEX",
  0xDC: "LATIN CAPITAL LETTER U WITH DIAERESIS",
  0xDD: "LATIN CAPITAL LETTER Y WITH ACUTE",
  0xDE: "LATIN CAPITAL LETTER THORN",
  0xDF: "LATIN SMALL LETTER SHARP S",
  0xE0: "LATIN SMALL LETTER A WITH GRAVE",
  0xE1: "LATIN SMALL LETTER A WITH ACUTE",
  0xE2: "LATIN SMALL LETTER A WITH CIRCUMFLEX",
  0xE3: "LATIN SMALL LETTER A WITH TILDE",
  0xE4: "LATIN SMALL LETTER A WITH DIAERESIS",
  0xE5: "LATIN SMALL LETTER A WITH RING ABOVE",
  0xE6: "LATIN SMALL LETTER AE",
  0xE7: "LATIN SMALL LETTER C WITH CEDILLA",
  0xE8: "LATIN SMALL LETTER E WITH GRAVE",
  0xE9: "LATIN SMALL LETTER E WITH ACUTE",
  0xEA: "LATIN SMALL LETTER E WITH CIRCUMFLEX",
  0xEB: "LATIN SMALL LETTER E WITH DIAERESIS",
  0xEC: "LATIN SMALL LETTER I WITH GRAVE",
  0xED: "LATIN SMALL LETTER I WITH ACUTE",
  0xEE: "LATIN SMALL LETTER I WITH CIRCUMFLEX",
  0xEF: "LATIN SMALL LETTER I WITH DIAERESIS",
  0xF0: "LATIN SMALL LETTER ETH",
  0xF1: "LATIN SMALL LETTER N WITH TILDE",
  0xF2: "LATIN SMALL LETTER O WITH GRAVE",
  0xF3: "LATIN SMALL LETTER O WITH ACUTE",
  0xF4: "LATIN SMALL LETTER O WITH CIRCUMFLEX",
  0xF5: "LATIN SMALL LETTER O WITH TILDE",
  0xF6: "LATIN SMALL LETTER O WITH DIAERESIS",
  0xF7: "DIVISION SIGN",
  0xF8: "LATIN SMALL LETTER O WITH STROKE",
  0xF9: "LATIN SMALL LETTER U WITH GRAVE",
  0xFA: "LATIN SMALL LETTER U WITH ACUTE",
  0xFB: "LATIN SMALL LETTER U WITH CIRCUMFLEX",
  0xFC: "LATIN SMALL LETTER U WITH DIAERESIS",
  0xFD: "LATIN SMALL LETTER Y WITH ACUTE",
  0xFE: "LATIN SMALL LETTER THORN",
  0xFF: "LATIN SMALL LETTER Y WITH DIAERESIS",
  // Common symbols and punctuation
  0x2013: "EN DASH",
  0x2014: "EM DASH",
  0x2018: "LEFT SINGLE QUOTATION MARK",
  0x2019: "RIGHT SINGLE QUOTATION MARK",
  0x201A: "SINGLE LOW-9 QUOTATION MARK",
  0x201C: "LEFT DOUBLE QUOTATION MARK",
  0x201D: "RIGHT DOUBLE QUOTATION MARK",
  0x201E: "DOUBLE LOW-9 QUOTATION MARK",
  0x2020: "DAGGER",
  0x2021: "DOUBLE DAGGER",
  0x2022: "BULLET",
  0x2026: "HORIZONTAL ELLIPSIS",
  0x2030: "PER MILLE SIGN",
  0x2039: "SINGLE LEFT-POINTING ANGLE QUOTATION MARK",
  0x203A: "SINGLE RIGHT-POINTING ANGLE QUOTATION MARK",
  0x20AC: "EURO SIGN",
  0x2122: "TRADE MARK SIGN",
  0x2190: "LEFTWARDS ARROW",
  0x2191: "UPWARDS ARROW",
  0x2192: "RIGHTWARDS ARROW",
  0x2193: "DOWNWARDS ARROW",
  0x2194: "LEFT RIGHT ARROW",
  0x21D0: "LEFTWARDS DOUBLE ARROW",
  0x21D2: "RIGHTWARDS DOUBLE ARROW",
  0x21D4: "LEFT RIGHT DOUBLE ARROW",
  0x2200: "FOR ALL",
  0x2203: "THERE EXISTS",
  0x2205: "EMPTY SET",
  0x2208: "ELEMENT OF",
  0x2209: "NOT AN ELEMENT OF",
  0x220B: "CONTAINS AS MEMBER",
  0x2212: "MINUS SIGN",
  0x221A: "SQUARE ROOT",
  0x221E: "INFINITY",
  0x2227: "LOGICAL AND",
  0x2228: "LOGICAL OR",
  0x2229: "INTERSECTION",
  0x222A: "UNION",
  0x2248: "ALMOST EQUAL TO",
  0x2260: "NOT EQUAL TO",
  0x2261: "IDENTICAL TO",
  0x2264: "LESS-THAN OR EQUAL TO",
  0x2265: "GREATER-THAN OR EQUAL TO",
  0x2282: "SUBSET OF",
  0x2283: "SUPERSET OF",
  0x2286: "SUBSET OF OR EQUAL TO",
  0x2287: "SUPERSET OF OR EQUAL TO",
  // Zero-width and invisible characters
  0x200B: "ZERO WIDTH SPACE",
  0x200C: "ZERO WIDTH NON-JOINER",
  0x200D: "ZERO WIDTH JOINER",
  0x200E: "LEFT-TO-RIGHT MARK",
  0x200F: "RIGHT-TO-LEFT MARK",
  0x2028: "LINE SEPARATOR",
  0x2029: "PARAGRAPH SEPARATOR",
  0x202A: "LEFT-TO-RIGHT EMBEDDING",
  0x202B: "RIGHT-TO-LEFT EMBEDDING",
  0x202C: "POP DIRECTIONAL FORMATTING",
  0x202D: "LEFT-TO-RIGHT OVERRIDE",
  0x202E: "RIGHT-TO-LEFT OVERRIDE",
  0x2060: "WORD JOINER",
  0x2061: "FUNCTION APPLICATION",
  0x2062: "INVISIBLE TIMES",
  0x2063: "INVISIBLE SEPARATOR",
  0x2064: "INVISIBLE PLUS",
  0xFEFF: "ZERO WIDTH NO-BREAK SPACE",
  0xFFFD: "REPLACEMENT CHARACTER",
  // Popular emojis
  0x1F600: "GRINNING FACE",
  0x1F601: "BEAMING FACE WITH SMILING EYES",
  0x1F602: "FACE WITH TEARS OF JOY",
  0x1F603: "GRINNING FACE WITH BIG EYES",
  0x1F604: "GRINNING FACE WITH SMILING EYES",
  0x1F605: "GRINNING FACE WITH SWEAT",
  0x1F606: "GRINNING SQUINTING FACE",
  0x1F607: "SMILING FACE WITH HALO",
  0x1F608: "SMILING FACE WITH HORNS",
  0x1F609: "WINKING FACE",
  0x1F60A: "SMILING FACE WITH SMILING EYES",
  0x1F60B: "FACE SAVORING FOOD",
  0x1F60C: "RELIEVED FACE",
  0x1F60D: "SMILING FACE WITH HEART-EYES",
  0x1F60E: "SMILING FACE WITH SUNGLASSES",
  0x1F60F: "SMIRKING FACE",
  0x1F610: "NEUTRAL FACE",
  0x1F611: "EXPRESSIONLESS FACE",
  0x1F612: "UNAMUSED FACE",
  0x1F613: "DOWNCAST FACE WITH SWEAT",
  0x1F614: "PENSIVE FACE",
  0x1F615: "CONFUSED FACE",
  0x1F616: "CONFOUNDED FACE",
  0x1F617: "KISSING FACE",
  0x1F618: "FACE BLOWING A KISS",
  0x1F619: "KISSING FACE WITH SMILING EYES",
  0x1F61A: "KISSING FACE WITH CLOSED EYES",
  0x1F61B: "FACE WITH TONGUE",
  0x1F61C: "WINKING FACE WITH TONGUE",
  0x1F61D: "SQUINTING FACE WITH TONGUE",
  0x1F61E: "DISAPPOINTED FACE",
  0x1F61F: "WORRIED FACE",
  0x1F620: "ANGRY FACE",
  0x1F621: "POUTING FACE",
  0x1F622: "CRYING FACE",
  0x1F623: "PERSEVERING FACE",
  0x1F624: "FACE WITH STEAM FROM NOSE",
  0x1F625: "SAD BUT RELIEVED FACE",
  0x1F626: "FROWNING FACE WITH OPEN MOUTH",
  0x1F627: "ANGUISHED FACE",
  0x1F628: "FEARFUL FACE",
  0x1F629: "WEARY FACE",
  0x1F62A: "SLEEPY FACE",
  0x1F62B: "TIRED FACE",
  0x1F62C: "GRIMACING FACE",
  0x1F62D: "LOUDLY CRYING FACE",
  0x1F62E: "FACE WITH OPEN MOUTH",
  0x1F62F: "HUSHED FACE",
  0x1F630: "ANXIOUS FACE WITH SWEAT",
  0x1F631: "FACE SCREAMING IN FEAR",
  0x1F632: "ASTONISHED FACE",
  0x1F633: "FLUSHED FACE",
  0x1F634: "SLEEPING FACE",
  0x1F635: "DIZZY FACE",
  0x1F636: "FACE WITHOUT MOUTH",
  0x1F637: "FACE WITH MEDICAL MASK",
  0x1F4A9: "PILE OF POO",
  0x1F44D: "THUMBS UP",
  0x1F44E: "THUMBS DOWN",
  0x1F44F: "CLAPPING HANDS",
  0x1F44C: "OK HAND",
  0x1F44B: "WAVING HAND",
  0x1F64F: "FOLDED HANDS",
  0x2764: "RED HEART",
  0x1F494: "BROKEN HEART",
  0x1F495: "TWO HEARTS",
  0x1F496: "SPARKLING HEART",
  0x1F497: "GROWING HEART",
  0x1F498: "HEART WITH ARROW",
  0x1F499: "BLUE HEART",
  0x1F49A: "GREEN HEART",
  0x1F49B: "YELLOW HEART",
  0x1F49C: "PURPLE HEART",
  0x1F525: "FIRE",
  0x2728: "SPARKLES",
  0x1F31F: "GLOWING STAR",
  0x1F4AF: "HUNDRED POINTS",
  0x1F389: "PARTY POPPER",
  0x1F38A: "CONFETTI BALL",
  0x1F680: "ROCKET",
  0x2705: "CHECK MARK BUTTON",
  0x274C: "CROSS MARK",
  0x26A0: "WARNING",
  0x2139: "INFORMATION",
};

/**
 * Get Unicode character category
 */
function getUnicodeCategory(codePoint: number): string {
  // Control characters
  if (codePoint <= 0x1F || (codePoint >= 0x7F && codePoint <= 0x9F)) {
    return "Control";
  }
  // Letters
  if (
    (codePoint >= 0x41 && codePoint <= 0x5A) || // A-Z
    (codePoint >= 0x61 && codePoint <= 0x7A) || // a-z
    (codePoint >= 0xC0 && codePoint <= 0xD6) || // Latin Extended
    (codePoint >= 0xD8 && codePoint <= 0xF6) ||
    (codePoint >= 0xF8 && codePoint <= 0xFF) ||
    (codePoint >= 0x100 && codePoint <= 0x17F) || // Latin Extended-A
    (codePoint >= 0x180 && codePoint <= 0x24F) || // Latin Extended-B
    (codePoint >= 0x370 && codePoint <= 0x3FF) || // Greek
    (codePoint >= 0x400 && codePoint <= 0x4FF) || // Cyrillic
    (codePoint >= 0x4E00 && codePoint <= 0x9FFF) // CJK
  ) {
    return "Letter";
  }
  // Numbers
  if (
    (codePoint >= 0x30 && codePoint <= 0x39) || // 0-9
    (codePoint >= 0xB2 && codePoint <= 0xB3) || // superscript 2-3
    codePoint === 0xB9 || // superscript 1
    (codePoint >= 0xBC && codePoint <= 0xBE) // fractions
  ) {
    return "Number";
  }
  // Spaces
  if (
    codePoint === 0x20 || // space
    codePoint === 0xA0 || // no-break space
    codePoint === 0x2000 || // en quad
    codePoint === 0x2001 || // em quad
    codePoint === 0x2002 || // en space
    codePoint === 0x2003 || // em space
    codePoint === 0x2004 || // three-per-em space
    codePoint === 0x2005 || // four-per-em space
    codePoint === 0x2006 || // six-per-em space
    codePoint === 0x2007 || // figure space
    codePoint === 0x2008 || // punctuation space
    codePoint === 0x2009 || // thin space
    codePoint === 0x200A || // hair space
    codePoint === 0x202F || // narrow no-break space
    codePoint === 0x205F || // medium mathematical space
    codePoint === 0x3000 // ideographic space
  ) {
    return "Space";
  }
  // Emojis (simplified detection)
  if (
    (codePoint >= 0x1F300 && codePoint <= 0x1F9FF) || // Misc Symbols and Pictographs, Emoticons, etc.
    (codePoint >= 0x2600 && codePoint <= 0x26FF) || // Misc Symbols
    (codePoint >= 0x2700 && codePoint <= 0x27BF) || // Dingbats
    (codePoint >= 0x1F600 && codePoint <= 0x1F64F) || // Emoticons
    (codePoint >= 0x1F680 && codePoint <= 0x1F6FF) // Transport and Map Symbols
  ) {
    return "Emoji";
  }
  // Punctuation
  if (
    (codePoint >= 0x21 && codePoint <= 0x2F) ||
    (codePoint >= 0x3A && codePoint <= 0x40) ||
    (codePoint >= 0x5B && codePoint <= 0x60) ||
    (codePoint >= 0x7B && codePoint <= 0x7E) ||
    (codePoint >= 0x2000 && codePoint <= 0x206F) // General Punctuation
  ) {
    return "Punctuation";
  }
  // Math symbols
  if (
    (codePoint >= 0x2200 && codePoint <= 0x22FF) || // Mathematical Operators
    (codePoint >= 0x27C0 && codePoint <= 0x27EF) || // Misc Mathematical Symbols-A
    (codePoint >= 0x2980 && codePoint <= 0x29FF) // Misc Mathematical Symbols-B
  ) {
    return "Symbol";
  }
  // Arrows
  if (codePoint >= 0x2190 && codePoint <= 0x21FF) {
    return "Symbol";
  }
  // Currency
  if (codePoint >= 0x20A0 && codePoint <= 0x20CF) {
    return "Symbol";
  }
  return "Other";
}

/**
 * Check if a character is invisible/zero-width
 */
function isInvisibleChar(codePoint: number): boolean {
  return (
    codePoint <= 0x1F || // Control chars
    (codePoint >= 0x7F && codePoint <= 0x9F) || // More control chars
    codePoint === 0x200B || // Zero width space
    codePoint === 0x200C || // Zero width non-joiner
    codePoint === 0x200D || // Zero width joiner
    codePoint === 0x200E || // LTR mark
    codePoint === 0x200F || // RTL mark
    codePoint === 0x2028 || // Line separator
    codePoint === 0x2029 || // Paragraph separator
    codePoint === 0x202A || // LTR embedding
    codePoint === 0x202B || // RTL embedding
    codePoint === 0x202C || // Pop directional formatting
    codePoint === 0x202D || // LTR override
    codePoint === 0x202E || // RTL override
    codePoint === 0x2060 || // Word joiner
    codePoint === 0x2061 || // Function application
    codePoint === 0x2062 || // Invisible times
    codePoint === 0x2063 || // Invisible separator
    codePoint === 0x2064 || // Invisible plus
    codePoint === 0xFEFF || // BOM / Zero width no-break space
    codePoint === 0xAD // Soft hyphen
  );
}

/**
 * Convert code point to UTF-8 bytes in hex
 */
function codePointToUtf8Hex(codePoint: number): string {
  const bytes: number[] = [];
  if (codePoint <= 0x7F) {
    bytes.push(codePoint);
  } else if (codePoint <= 0x7FF) {
    bytes.push(0xC0 | (codePoint >> 6));
    bytes.push(0x80 | (codePoint & 0x3F));
  } else if (codePoint <= 0xFFFF) {
    bytes.push(0xE0 | (codePoint >> 12));
    bytes.push(0x80 | ((codePoint >> 6) & 0x3F));
    bytes.push(0x80 | (codePoint & 0x3F));
  } else {
    bytes.push(0xF0 | (codePoint >> 18));
    bytes.push(0x80 | ((codePoint >> 12) & 0x3F));
    bytes.push(0x80 | ((codePoint >> 6) & 0x3F));
    bytes.push(0x80 | (codePoint & 0x3F));
  }
  return bytes.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
}

/**
 * Get Unicode name for a code point
 */
function getUnicodeName(codePoint: number): string {
  return UNICODE_NAMES[codePoint] || "UNKNOWN";
}

/**
 * Generate a basic human-readable explanation of a regex pattern
 */
function generateRegexExplanation(pattern: string, flags: string): string {
  const parts: string[] = [];

  // Explain flags
  const flagExplanations: Record<string, string> = {
    g: "global (find all matches)",
    i: "case-insensitive",
    m: "multiline (^ and $ match line boundaries)",
    s: "dotAll (. matches newlines)",
    u: "unicode",
  };

  const activeFlags = flags
    .split("")
    .filter((f) => flagExplanations[f])
    .map((f) => flagExplanations[f]);

  if (activeFlags.length > 0) {
    parts.push(`Flags: ${activeFlags.join(", ")}`);
  }

  // Explain common pattern elements
  const patternParts: string[] = [];

  if (pattern.startsWith("^")) patternParts.push("Starts at beginning of string/line");
  if (pattern.endsWith("$")) patternParts.push("Ends at end of string/line");
  if (pattern.includes("\\d")) patternParts.push("\\d matches any digit (0-9)");
  if (pattern.includes("\\w")) patternParts.push("\\w matches word characters (a-z, A-Z, 0-9, _)");
  if (pattern.includes("\\s")) patternParts.push("\\s matches whitespace");
  if (pattern.includes("\\b")) patternParts.push("\\b matches word boundary");
  if (pattern.includes(".")) patternParts.push(". matches any character (except newline)");
  if (pattern.includes("*")) patternParts.push("* matches 0 or more of previous");
  if (pattern.includes("+")) patternParts.push("+ matches 1 or more of previous");
  if (pattern.includes("?")) patternParts.push("? matches 0 or 1 of previous (optional)");
  if (pattern.includes("|")) patternParts.push("| means OR (alternative)");
  if (/\[.*\]/.test(pattern)) patternParts.push("[...] matches any character in set");
  if (/\{[\d,]+\}/.test(pattern)) patternParts.push("{n,m} matches between n and m times");
  if (/\(\?<\w+>/.test(pattern)) patternParts.push("(?<name>...) creates named capture group");
  if (/\((?!\?)/.test(pattern)) patternParts.push("(...) creates capture group");
  if (/\(\?:/.test(pattern)) patternParts.push("(?:...) creates non-capturing group");
  if (/\(\?=/.test(pattern)) patternParts.push("(?=...) is positive lookahead");
  if (/\(\?!/.test(pattern)) patternParts.push("(?!...) is negative lookahead");
  if (/\(\?<=/.test(pattern)) patternParts.push("(?<=...) is positive lookbehind");
  if (/\(\?<!/.test(pattern)) patternParts.push("(?<!...) is negative lookbehind");

  if (patternParts.length > 0) {
    parts.push("Pattern elements: " + patternParts.join("; "));
  }

  return parts.length > 0 ? parts.join(". ") : "Basic pattern match";
}
