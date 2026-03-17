/**
 * Regex Tester UI for MCP Apps
 *
 * Interactive regex testing with:
 * - Pattern and flags input
 * - Test string textarea
 * - Highlighted matches in text
 * - Captured groups list
 * - Validity indicator
 * - Basic natural language explanation
 *
 * @module lib/std/src/ui/regex-tester
 */

import { render } from "preact";
import { useState, useEffect, useMemo, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { cx } from "../../components/utils";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface RegexTesterProps {
  pattern?: string;
  flags?: string;
  testString?: string;
}

interface MatchResult {
  fullMatch: string;
  index: number;
  groups: string[];
  namedGroups?: Record<string, string>;
}

interface ContentItem {
  type: string;
  text?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Regex Tester", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Regex Explanation
// ============================================================================

interface ExplanationPart {
  pattern: string;
  description: string;
}

function explainRegex(pattern: string): ExplanationPart[] {
  const explanations: ExplanationPart[] = [];

  // Common regex patterns and their explanations
  const patterns: Array<{ regex: RegExp; explain: (match: RegExpMatchArray) => string }> = [
    { regex: /^\^/, explain: () => "Start of string/line" },
    { regex: /\$$/, explain: () => "End of string/line" },
    { regex: /\\d/, explain: () => "Any digit (0-9)" },
    { regex: /\\D/, explain: () => "Any non-digit" },
    { regex: /\\w/, explain: () => "Any word character (a-z, A-Z, 0-9, _)" },
    { regex: /\\W/, explain: () => "Any non-word character" },
    { regex: /\\s/, explain: () => "Any whitespace" },
    { regex: /\\S/, explain: () => "Any non-whitespace" },
    { regex: /\\b/, explain: () => "Word boundary" },
    { regex: /\\B/, explain: () => "Non-word boundary" },
    { regex: /\\n/, explain: () => "Newline" },
    { regex: /\\t/, explain: () => "Tab" },
    { regex: /\\r/, explain: () => "Carriage return" },
    { regex: /\./, explain: () => "Any character (except newline)" },
    { regex: /\[\^([^\]]+)\]/, explain: (m) => `Any character NOT in: ${m[1]}` },
    { regex: /\[([^\]]+)\]/, explain: (m) => `Any character in: ${m[1]}` },
    { regex: /\((\?:)([^)]+)\)/, explain: (m) => `Non-capturing group: ${m[2]}` },
    { regex: /\((\?=)([^)]+)\)/, explain: (m) => `Positive lookahead: ${m[2]}` },
    { regex: /\((\?!)([^)]+)\)/, explain: (m) => `Negative lookahead: ${m[2]}` },
    { regex: /\((\?<=)([^)]+)\)/, explain: (m) => `Positive lookbehind: ${m[2]}` },
    { regex: /\((\?<!)([^)]+)\)/, explain: (m) => `Negative lookbehind: ${m[2]}` },
    { regex: /\((\?<)(\w+)>([^)]+)\)/, explain: (m) => `Named group "${m[2]}": ${m[3]}` },
    { regex: /\(([^)?][^)]*)\)/, explain: (m) => `Capturing group: ${m[1]}` },
    { regex: /\{(\d+),(\d+)\}/, explain: (m) => `Between ${m[1]} and ${m[2]} times` },
    { regex: /\{(\d+),\}/, explain: (m) => `${m[1]} or more times` },
    { regex: /\{(\d+)\}/, explain: (m) => `Exactly ${m[1]} times` },
    { regex: /\+\?/, explain: () => "1 or more (lazy)" },
    { regex: /\*\?/, explain: () => "0 or more (lazy)" },
    { regex: /\?\?/, explain: () => "0 or 1 (lazy)" },
    { regex: /\+/, explain: () => "1 or more times" },
    { regex: /\*/, explain: () => "0 or more times" },
    { regex: /\?/, explain: () => "0 or 1 time (optional)" },
    { regex: /\|/, explain: () => "OR (alternation)" },
    { regex: /\\(\d+)/, explain: (m) => `Backreference to group ${m[1]}` },
  ];

  let remaining = pattern;
  let position = 0;

  while (remaining.length > 0) {
    let matched = false;

    for (const { regex, explain } of patterns) {
      const match = remaining.match(regex);
      if (match && match.index === 0) {
        explanations.push({
          pattern: match[0],
          description: explain(match),
        });
        remaining = remaining.slice(match[0].length);
        position += match[0].length;
        matched = true;
        break;
      }
    }

    if (!matched) {
      // Literal character
      const char = remaining[0];
      if (char === "\\") {
        // Escaped character
        const escaped = remaining.slice(0, 2);
        explanations.push({
          pattern: escaped,
          description: `Literal "${escaped[1]}"`,
        });
        remaining = remaining.slice(2);
        position += 2;
      } else {
        explanations.push({
          pattern: char,
          description: `Literal "${char}"`,
        });
        remaining = remaining.slice(1);
        position += 1;
      }
    }
  }

  return explanations;
}

function explainFlags(flags: string): string[] {
  const explanations: string[] = [];
  if (flags.includes("g")) explanations.push("g: Global (find all matches)");
  if (flags.includes("i")) explanations.push("i: Case-insensitive");
  if (flags.includes("m")) explanations.push("m: Multiline (^ and $ match line boundaries)");
  if (flags.includes("s")) explanations.push("s: Dotall (. matches newlines)");
  if (flags.includes("u")) explanations.push("u: Unicode mode");
  if (flags.includes("y")) explanations.push("y: Sticky (match at lastIndex)");
  if (flags.includes("d")) explanations.push("d: Indices (include match indices)");
  return explanations;
}

// ============================================================================
// Components
// ============================================================================

function ValidityIndicator({ isValid, error }: { isValid: boolean; error: string | null }) {
  return (
    <Badge
      size="sm"
      className={cx(
        "flex items-center gap-2",
        isValid
          ? "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300"
          : "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300"
      )}
    >
      <span className="text-sm">
        {isValid ? "\u2713" : "\u2717"}
      </span>
      <span className="max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap">
        {isValid ? "Valid regex" : error || "Invalid regex"}
      </span>
    </Badge>
  );
}

function HighlightedText({
  text,
  matches,
}: {
  text: string;
  matches: MatchResult[];
}) {
  if (matches.length === 0) {
    return <span>{text}</span>;
  }

  // Build segments with highlighting
  const segments: Array<{ text: string; highlighted: boolean; matchIndex: number }> = [];
  let lastEnd = 0;

  // Sort matches by index
  const sortedMatches = [...matches].sort((a, b) => a.index - b.index);

  for (let i = 0; i < sortedMatches.length; i++) {
    const match = sortedMatches[i];

    // Add text before this match
    if (match.index > lastEnd) {
      segments.push({
        text: text.slice(lastEnd, match.index),
        highlighted: false,
        matchIndex: -1,
      });
    }

    // Add the match
    segments.push({
      text: match.fullMatch,
      highlighted: true,
      matchIndex: i,
    });

    lastEnd = match.index + match.fullMatch.length;
  }

  // Add remaining text
  if (lastEnd < text.length) {
    segments.push({
      text: text.slice(lastEnd),
      highlighted: false,
      matchIndex: -1,
    });
  }

  return (
    <>
      {segments.map((segment, i) => (
        <span
          key={i}
          className={segment.highlighted
            ? "bg-yellow-200 dark:bg-yellow-700 text-yellow-900 dark:text-yellow-100 px-0.5 rounded-sm"
            : undefined
          }
          title={segment.highlighted ? `Match ${segment.matchIndex + 1}` : undefined}
        >
          {segment.text}
        </span>
      ))}
    </>
  );
}

function MatchesList({ matches }: { matches: MatchResult[] }) {
  if (matches.length === 0) {
    return <div className="text-fg-muted italic text-center py-4">No matches found</div>;
  }

  return (
    <div className="flex flex-col gap-2">
      {matches.map((match, i) => (
        <div key={i} className="p-2 bg-bg-subtle rounded-md border border-border-subtle">
          <div className="flex justify-between items-center mb-1">
            <div className="font-semibold text-xs text-blue-600 dark:text-blue-400">
              Match {i + 1}
            </div>
            <div className="text-xs text-fg-muted">at index {match.index}</div>
          </div>
          <div className="font-mono text-sm bg-bg-muted px-2 py-1 rounded-sm overflow-x-auto">
            <code>{match.fullMatch}</code>
          </div>
          {match.groups.length > 0 && (
            <div className="mt-2 pt-2 border-t border-border-subtle">
              <div className="text-xs font-medium text-fg-muted mb-1">Captured Groups:</div>
              {match.groups.map((group, gi) => (
                <div key={gi} className="flex items-center gap-2 text-xs py-0.5">
                  <div className="text-fg-muted font-medium">Group {gi + 1}:</div>
                  <code className="font-mono bg-bg-muted px-1 rounded-sm">{group ?? "(undefined)"}</code>
                </div>
              ))}
            </div>
          )}
          {match.namedGroups && Object.keys(match.namedGroups).length > 0 && (
            <div className="mt-2 pt-2 border-t border-border-subtle">
              <div className="text-xs font-medium text-fg-muted mb-1">Named Groups:</div>
              {Object.entries(match.namedGroups).map(([name, value]) => (
                <div key={name} className="flex items-center gap-2 text-xs py-0.5">
                  <div className="text-fg-muted font-medium">{name}:</div>
                  <code className="font-mono bg-bg-muted px-1 rounded-sm">{value ?? "(undefined)"}</code>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ExplanationPanel({ pattern, flags }: { pattern: string; flags: string }) {
  const patternExplanation = useMemo(() => {
    if (!pattern) return [];
    try {
      return explainRegex(pattern);
    } catch {
      return [];
    }
  }, [pattern]);

  const flagsExplanation = useMemo(() => explainFlags(flags), [flags]);

  if (!pattern && !flags) {
    return <div className="text-fg-muted italic">Enter a pattern to see explanation</div>;
  }

  return (
    <div className="p-3 border-t border-border-default">
      {flagsExplanation.length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-medium text-fg-muted mb-1 uppercase tracking-wide">
            Flags:
          </div>
          {flagsExplanation.map((exp, i) => (
            <div key={i} className="text-xs text-fg-default py-0.5 font-mono">{exp}</div>
          ))}
        </div>
      )}
      {patternExplanation.length > 0 && (
        <div>
          <div className="text-xs font-medium text-fg-muted mb-1 uppercase tracking-wide">
            Pattern breakdown:
          </div>
          <div className="flex flex-col gap-1">
            {patternExplanation.map((part, i) => (
              <div
                key={i}
                className={cx(
                  "flex items-center gap-2 py-1 border-b border-border-subtle",
                  i === patternExplanation.length - 1 && "border-b-0"
                )}
              >
                <code className="font-mono text-sm bg-bg-muted px-2 py-0.5 rounded-sm min-w-10 text-center text-purple-600 dark:text-purple-400">
                  {part.pattern}
                </code>
                <div className="text-xs text-fg-muted">{part.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function RegexTester() {
  const [pattern, setPattern] = useState("");
  const [flags, setFlags] = useState("g");
  const [testString, setTestString] = useState("");
  const [loading, setLoading] = useState(true);
  const [showExplanation, setShowExplanation] = useState(true);

  // Validate and compile regex
  const { regex, error, isValid } = useMemo(() => {
    if (!pattern) {
      return { regex: null, error: null, isValid: true };
    }
    try {
      const r = new RegExp(pattern, flags);
      return { regex: r, error: null, isValid: true };
    } catch (e) {
      return {
        regex: null,
        error: e instanceof Error ? e.message : "Invalid regex",
        isValid: false,
      };
    }
  }, [pattern, flags]);

  // Find matches
  const matches = useMemo((): MatchResult[] => {
    if (!regex || !testString) return [];

    const results: MatchResult[] = [];

    if (flags.includes("g")) {
      // Global flag: find all matches
      let match;
      regex.lastIndex = 0;
      while ((match = regex.exec(testString)) !== null) {
        results.push({
          fullMatch: match[0],
          index: match.index,
          groups: match.slice(1),
          namedGroups: match.groups,
        });
        // Prevent infinite loop on zero-width matches
        if (match[0].length === 0) {
          regex.lastIndex++;
        }
      }
    } else {
      // Non-global: find first match only
      const match = regex.exec(testString);
      if (match) {
        results.push({
          fullMatch: match[0],
          index: match.index,
          groups: match.slice(1),
          namedGroups: match.groups,
        });
      }
    }

    return results;
  }, [regex, testString, flags]);

  // Connect to MCP host
  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
      console.log("[regex-tester] Connected to MCP host");
    }).catch(() => {
      console.log("[regex-tester] No MCP host (standalone mode)");
    });

    app.ontoolresult = (result: { content?: ContentItem[] }) => {
      setLoading(false);

      try {
        const textContent = result.content?.find((c) => c.type === "text") as ContentItem | undefined;
        if (!textContent?.text) return;

        // Try to parse as JSON for props
        try {
          const data = JSON.parse(textContent.text) as RegexTesterProps;
          if (data.pattern !== undefined) setPattern(data.pattern);
          if (data.flags !== undefined) setFlags(data.flags);
          if (data.testString !== undefined) setTestString(data.testString);
        } catch {
          // Not JSON, use as test string
          setTestString(textContent.text);
        }
      } catch (e) {
        console.error("[regex-tester] Error parsing input:", e);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);

    // Set loading to false after a short delay if no MCP connection
    const timeout = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(timeout);
  }, []);

  // Handle input changes with model notification
  const handlePatternChange = useCallback((value: string) => {
    setPattern(value);
    notifyModel("patternChange", { pattern: value });
  }, []);

  const handleFlagsChange = useCallback((value: string) => {
    // Filter to valid flags only
    const validFlags = value.split("").filter((f) => "gimsuy".includes(f)).join("");
    setFlags(validFlags);
    notifyModel("flagsChange", { flags: validFlags });
  }, []);

  const handleTestStringChange = useCallback((value: string) => {
    setTestString(value);
    notifyModel("testStringChange", { testString: value });
  }, []);

  // Flag toggles
  const toggleFlag = useCallback((flag: string) => {
    const newFlags = flags.includes(flag)
      ? flags.replace(flag, "")
      : flags + flag;
    handleFlagsChange(newFlags);
  }, [flags, handleFlagsChange]);

  if (loading) {
    return (
      <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas max-w-4xl mx-auto">
        <div className="p-10 text-center text-fg-muted">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-4 pb-3 border-b border-border-default">
        <h1 className="text-xl font-semibold m-0">Regex Tester</h1>
        <ValidityIndicator isValid={isValid} error={error} />
      </div>

      {/* Pattern Input */}
      <div className="mb-4">
        <label className="block mb-1 font-medium text-fg-muted text-xs uppercase tracking-wide">
          Pattern
        </label>
        <div className="flex items-center bg-bg-subtle border border-border-default rounded-md overflow-hidden focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20">
          <div className="px-2 text-fg-muted font-mono text-base font-bold">/</div>
          <input
            type="text"
            className="flex-1 px-2 py-2 bg-transparent border-none outline-none font-mono text-sm text-fg-default"
            value={pattern}
            onChange={(e) => handlePatternChange((e.target as HTMLInputElement).value)}
            placeholder="Enter regex pattern..."
            spellcheck={false}
          />
          <div className="px-2 text-fg-muted font-mono text-base font-bold">/</div>
          <input
            type="text"
            className="w-16 px-2 py-2 bg-bg-muted border-none border-l border-border-default outline-none font-mono text-sm text-fg-default text-center"
            value={flags}
            onChange={(e) => handleFlagsChange((e.target as HTMLInputElement).value)}
            placeholder="flags"
            maxLength={6}
          />
        </div>
      </div>

      {/* Flag Toggles */}
      <div className="mb-4">
        <label className="block mb-1 font-medium text-fg-muted text-xs uppercase tracking-wide">
          Flags
        </label>
        <div className="flex flex-wrap gap-2">
          {[
            { flag: "g", label: "Global", desc: "Find all matches" },
            { flag: "i", label: "Case-insensitive", desc: "Ignore case" },
            { flag: "m", label: "Multiline", desc: "^ and $ match lines" },
            { flag: "s", label: "Dotall", desc: ". matches newlines" },
            { flag: "u", label: "Unicode", desc: "Unicode mode" },
          ].map(({ flag, label, desc }) => (
            <Button
              key={flag}
              variant={flags.includes(flag) ? "solid" : "outline"}
              size="xs"
              onClick={() => toggleFlag(flag)}
              title={desc}
            >
              <span className="font-mono font-bold">{flag}</span>
              <span className="text-xs text-fg-muted">{label}</span>
            </Button>
          ))}
        </div>
      </div>

      {/* Test String */}
      <div className="mb-4">
        <label className="block mb-1 font-medium text-fg-muted text-xs uppercase tracking-wide">
          Test String
        </label>
        <textarea
          className="w-full px-3 py-2 bg-bg-subtle border border-border-default rounded-md font-mono text-sm text-fg-default resize-y min-h-[120px] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          value={testString}
          onChange={(e) => handleTestStringChange((e.target as HTMLTextAreaElement).value)}
          placeholder="Enter text to test against the regex..."
          spellcheck={false}
        />
      </div>

      {/* Results Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Highlighted Preview */}
        <div className="border border-border-default rounded-lg overflow-hidden">
          <div className="flex justify-between items-center px-3 py-2 bg-bg-subtle border-b border-border-default font-medium text-sm">
            <div>Highlighted Matches</div>
            <div className="text-xs text-fg-muted bg-bg-muted px-2 py-0.5 rounded-full">
              {matches.length} match{matches.length !== 1 ? "es" : ""}
            </div>
          </div>
          <div className="p-3 max-h-[300px] overflow-y-auto">
            {testString ? (
              <pre className="m-0 font-mono text-sm whitespace-pre-wrap break-all leading-relaxed">
                <HighlightedText text={testString} matches={matches} />
              </pre>
            ) : (
              <div className="text-fg-muted italic">Enter a test string to see matches</div>
            )}
          </div>
        </div>

        {/* Matches List */}
        <div className="border border-border-default rounded-lg overflow-hidden">
          <div className="flex justify-between items-center px-3 py-2 bg-bg-subtle border-b border-border-default font-medium text-sm">
            <div>Match Details</div>
          </div>
          <div className="p-3 max-h-[300px] overflow-y-auto">
            <MatchesList matches={matches} />
          </div>
        </div>
      </div>

      {/* Explanation Panel */}
      <div className="border border-border-default rounded-lg overflow-hidden">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowExplanation(!showExplanation)}
          className="flex items-center gap-2 w-full bg-bg-subtle font-medium text-left justify-start rounded-none hover:bg-bg-muted"
        >
          <span className="text-xs text-fg-muted">
            {showExplanation ? "\u25BC" : "\u25B6"}
          </span>
          Regex Explanation
        </Button>
        {showExplanation && (
          <ExplanationPanel pattern={pattern} flags={flags} />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Mount
// ============================================================================

render(<RegexTester />, document.getElementById("app")!);
