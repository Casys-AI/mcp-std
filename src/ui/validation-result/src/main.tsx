/**
 * Validation Result UI - Schema validation results display
 *
 * Displays validation results with:
 * - Global status (valid/invalid) with error count
 * - Error list with JSON path, message, and details
 * - Expected vs actual values comparison
 * - Filtering by error type/keyword
 * - Correction suggestions when possible
 *
 * Stack: Preact + Tailwind CSS
 *
 * @module lib/std/src/ui/validation-result
 */

import { render } from "preact";
import { useState, useEffect, useMemo } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { Button } from "../../components/ui/button";
import { Alert } from "../../components/ui/alert";
import { Tooltip } from "../../components/ui/tooltip";
import { cx, formatValue as fmtVal } from "../../components/utils";
import {
  ContentSkeleton,
  typography,
  containers,
  interactive,
} from "../../shared";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface ValidationError {
  path: string;
  message: string;
  keyword?: string;
  expected?: unknown;
  actual?: unknown;
}

interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
  schema?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Validation Result", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Helpers
// ============================================================================

const keywordConfig: Record<string, { icon: string; label: string; suggestion?: string }> = {
  required: { icon: "!", label: "Required", suggestion: "Add the missing property to your data" },
  type: { icon: "T", label: "Type", suggestion: "Convert the value to the expected type" },
  format: { icon: "F", label: "Format", suggestion: "Ensure the value matches the expected format" },
  enum: { icon: "E", label: "Enum", suggestion: "Use one of the allowed values" },
  pattern: { icon: "R", label: "Pattern", suggestion: "Ensure the value matches the required pattern" },
  minLength: { icon: "#", label: "Min Length", suggestion: "Provide a longer value" },
  maxLength: { icon: "#", label: "Max Length", suggestion: "Provide a shorter value" },
  minimum: { icon: "<", label: "Minimum", suggestion: "Provide a larger value" },
  maximum: { icon: ">", label: "Maximum", suggestion: "Provide a smaller value" },
  minItems: { icon: "[", label: "Min Items", suggestion: "Add more items to the array" },
  maxItems: { icon: "]", label: "Max Items", suggestion: "Remove some items from the array" },
  uniqueItems: { icon: "U", label: "Unique", suggestion: "Remove duplicate items from the array" },
  additionalProperties: { icon: "+", label: "Extra Props", suggestion: "Remove unexpected properties" },
  const: { icon: "=", label: "Const", suggestion: "Use the exact expected value" },
  oneOf: { icon: "1", label: "One Of", suggestion: "Data must match exactly one schema" },
  anyOf: { icon: "*", label: "Any Of", suggestion: "Data must match at least one schema" },
  allOf: { icon: "&", label: "All Of", suggestion: "Data must match all schemas" },
};

function getKeywordInfo(keyword?: string) {
  if (!keyword) return { icon: "?", label: "Error", suggestion: undefined };
  return keywordConfig[keyword] || { icon: "?", label: keyword, suggestion: undefined };
}

function formatValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return `"${value}"`;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function getUniqueKeywords(errors: ValidationError[]): string[] {
  const keywords = new Set<string>();
  errors.forEach((e) => {
    if (e.keyword) keywords.add(e.keyword);
  });
  return Array.from(keywords).sort();
}

// ============================================================================
// Components
// ============================================================================

function GlobalStatus({ valid, errorCount }: { valid: boolean; errorCount: number }) {
  return (
    <Alert status={valid ? "success" : "error"} className="mb-4">
      <div className="font-semibold">{valid ? "VALID" : "INVALID"}</div>
      {!valid && errorCount > 0 && (
        <div className="text-sm">{errorCount} error{errorCount !== 1 ? "s" : ""} found</div>
      )}
    </Alert>
  );
}

function ErrorItem({ error, onCopy }: { error: ValidationError; onCopy: (text: string) => void }) {
  const keywordInfo = getKeywordInfo(error.keyword);
  const hasExpectedActual = error.expected !== undefined || error.actual !== undefined;

  return (
    <div
      className={cx(
        "bg-bg-subtle rounded-md overflow-hidden cursor-pointer border border-transparent",
        interactive.rowHover,
        interactive.focusRing,
        "hover:border-red-300 dark:hover:border-red-700"
      )}
      tabIndex={0}
      onClick={() => {
        notifyModel("select-error", { path: error.path, keyword: error.keyword });
        onCopy(error.path);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          notifyModel("select-error", { path: error.path, keyword: error.keyword });
          onCopy(error.path);
        }
      }}
    >
      {/* Path header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border-b border-red-100 dark:bg-red-900/20 dark:border-red-900/40">
        <div className="text-red-500 flex-shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
          </svg>
        </div>
        <code className="font-mono text-xs font-semibold text-red-700 dark:text-red-400">
          {error.path}
        </code>
      </div>

      {/* Error message */}
      <div className="flex gap-3 p-3">
        <div
          className="flex items-center justify-center w-6 h-6 rounded-md bg-gray-200 text-gray-700 font-mono text-xs font-bold flex-shrink-0 dark:bg-gray-700 dark:text-gray-300"
          title={keywordInfo.label}
        >
          {keywordInfo.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap leading-relaxed">
            {error.keyword && (
              <span className="font-mono text-xs text-fg-muted bg-bg-muted px-1.5 py-0.5 rounded-sm">
                "{error.keyword}"
              </span>
            )}
            <span>{error.message}</span>
          </div>

          {/* Expected vs Actual */}
          {hasExpectedActual && (
            <div className="mt-2 pl-2 border-l-2 border-border-default flex flex-col gap-1">
              {error.expected !== undefined && (
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-fg-muted font-medium min-w-[60px]">Expected:</span>
                  <code className="font-mono text-xs text-green-700 dark:text-green-400">
                    {formatValue(error.expected)}
                  </code>
                </div>
              )}
              {error.actual !== undefined && (
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-fg-muted font-medium min-w-[60px]">Got:</span>
                  <code className="font-mono text-xs text-red-600 dark:text-red-400">
                    {formatValue(error.actual)}
                  </code>
                </div>
              )}
            </div>
          )}

          {/* Suggestion */}
          {keywordInfo.suggestion && (
            <div className="flex items-start gap-1.5 mt-2 text-xs text-blue-700 bg-blue-50 px-2 py-1.5 rounded-sm dark:text-blue-300 dark:bg-blue-900/30">
              <div className="flex items-center flex-shrink-0 mt-px">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6A4.997 4.997 0 017 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z" />
                </svg>
              </div>
              <span>{keywordInfo.suggestion}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterBar({
  keywords,
  selectedKeyword,
  onSelect,
}: {
  keywords: string[];
  selectedKeyword: string | null;
  onSelect: (keyword: string | null) => void;
}) {
  if (keywords.length <= 1) return null;

  return (
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      <div className={typography.label}>Filter:</div>
      <Button
        variant={!selectedKeyword ? "solid" : "outline"}
        size="xs"
        onClick={() => onSelect(null)}
        className={interactive.scaleOnHover}
      >
        All
      </Button>
      {keywords.map((kw) => {
        const info = getKeywordInfo(kw);
        return (
          <Tooltip key={kw} content={info.suggestion || info.label}>
            <Button
              variant={selectedKeyword === kw ? "solid" : "outline"}
              size="xs"
              onClick={() => onSelect(kw)}
              className={interactive.scaleOnHover}
            >
              <span className="font-mono text-[10px] font-bold mr-1">{info.icon}</span>
              {info.label}
            </Button>
          </Tooltip>
        );
      })}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function ValidationResultViewer() {
  const [data, setData] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
    }).catch(() => {});

    app.ontoolresult = (result: { content?: Array<{ type: string; text?: string }> }) => {
      setLoading(false);
      try {
        const textContent = result.content?.find((c) => c.type === "text");
        if (textContent?.text) {
          const parsed = JSON.parse(textContent.text);
          setData(parsed);
        }
      } catch (e) {
        console.error("Failed to parse validation result", e);
      }
    };
  }, []);

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path).catch(() => {});
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 1500);
  };

  const keywords = useMemo(() => {
    if (!data?.errors) return [];
    return getUniqueKeywords(data.errors);
  }, [data?.errors]);

  const filteredErrors = useMemo(() => {
    if (!data?.errors) return [];
    if (!selectedKeyword) return data.errors;
    return data.errors.filter((e) => e.keyword === selectedKeyword);
  }, [data?.errors, selectedKeyword]);

  if (loading) {
    return <ContentSkeleton lines={4} />;
  }

  if (!data) {
    return (
      <div className={containers.root}>
        <div className={containers.centered}>No validation result</div>
      </div>
    );
  }

  return (
    <div className={containers.root}>
      {/* Schema name if provided */}
      {data.schema && (
        <div className={cx(typography.muted, "mb-2 font-mono")}>{data.schema}</div>
      )}

      {/* Global status */}
      <GlobalStatus valid={data.valid} errorCount={data.errors?.length || 0} />

      {/* Filter bar */}
      {!data.valid && data.errors && data.errors.length > 0 && (
        <FilterBar
          keywords={keywords}
          selectedKeyword={selectedKeyword}
          onSelect={setSelectedKeyword}
        />
      )}

      {/* Error list */}
      {!data.valid && filteredErrors.length > 0 && (
        <div className="flex flex-col gap-3">
          {filteredErrors.map((error, i) => (
            <ErrorItem
              key={`${error.path}-${i}`}
              error={error}
              onCopy={handleCopyPath}
            />
          ))}
        </div>
      )}

      {/* Copy feedback */}
      {copiedPath && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-3 py-2 rounded-md text-xs font-mono shadow-lg z-[100] dark:bg-gray-200 dark:text-gray-900">
          Copied: {copiedPath}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Mount
// ============================================================================

render(<ValidationResultViewer />, document.getElementById("app")!);
