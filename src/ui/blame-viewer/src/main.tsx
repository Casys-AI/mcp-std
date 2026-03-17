/**
 * Blame Viewer UI for MCP Apps
 *
 * Displays git blame annotations with:
 * - Per-line commit information (author, date, hash)
 * - Color-coding by commit (same commit = same color)
 * - Hover popup with full commit details
 * - Monospace code display with line numbers
 *
 * @module lib/std/src/ui/blame-viewer
 */

import { render } from "preact";
import { useState, useEffect, useMemo, useRef } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { cx } from "../../components/utils";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface BlameLine {
  lineNumber: number;
  commitHash: string;
  author: string;
  authorEmail: string;
  timestamp: number;
  content: string;
  summary: string;
}

interface BlameData {
  file: string;
  lines: BlameLine[];
  totalLines: number;
}

interface ContentItem {
  type: string;
  text?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Blame Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Color Generation
// ============================================================================

/**
 * Generate a pastel color from a commit hash
 * Same hash always produces the same color
 */
function hashToColor(hash: string): string {
  // Use first 6 characters of hash to generate hue
  const hue = parseInt(hash.slice(0, 6), 16) % 360;
  // Keep saturation and lightness low for pastel effect
  return `hsl(${hue}, 35%, 92%)`;
}

/**
 * Generate a darker version of the color for dark mode
 */
function hashToColorDark(hash: string): string {
  const hue = parseInt(hash.slice(0, 6), 16) % 360;
  return `hsl(${hue}, 30%, 20%)`;
}

/**
 * Format relative time from timestamp
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo ago`;
  return `${Math.floor(diff / 31536000)}y ago`;
}

/**
 * Format full date from timestamp
 */
function formatFullDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString();
}

// ============================================================================
// Components
// ============================================================================

interface BlameAnnotationProps {
  line: BlameLine;
  showFull: boolean;
  prevHash: string | null;
  onHover: (line: BlameLine | null) => void;
  onClick: (line: BlameLine) => void;
}

function BlameAnnotation({ line, showFull, prevHash, onHover, onClick }: BlameAnnotationProps) {
  const isNewCommit = prevHash !== line.commitHash;
  const shortHash = line.commitHash.slice(0, 7);

  return (
    <div
      className="flex items-center gap-2 w-[220px] min-w-[220px] px-2 py-0.5 font-sans text-xs text-gray-500 dark:text-gray-400 bg-gray-50/50 dark:bg-gray-800/50 border-r border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
      onMouseEnter={() => onHover(line)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(line)}
    >
      {isNewCommit || showFull ? (
        <>
          <span className="font-mono text-[10px] text-blue-600 dark:text-blue-400 min-w-[60px]">
            {shortHash}
          </span>
          <span
            className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap min-w-[70px] max-w-[90px]"
            title={line.author}
          >
            {line.author.split(" ")[0].slice(0, 10)}
          </span>
          <span className="text-gray-400 dark:text-gray-500 text-[10px] min-w-[50px] text-right">
            {formatRelativeTime(line.timestamp)}
          </span>
        </>
      ) : (
        <span className="h-full" />
      )}
    </div>
  );
}

interface CommitPopupProps {
  line: BlameLine;
  position: { x: number; y: number };
}

function CommitPopup({ line, position }: CommitPopupProps) {
  return (
    <div
      className="fixed z-[100] w-[300px] p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg pointer-events-none"
      style={{
        top: `${position.y + 10}px`,
        left: `${Math.min(position.x, window.innerWidth - 320)}px`,
      }}
    >
      <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-100 dark:border-gray-800">
        <span className="font-mono text-xs text-blue-600 dark:text-blue-400">
          {line.commitHash.slice(0, 10)}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">{formatFullDate(line.timestamp)}</span>
      </div>
      <div className="text-sm mb-2">
        <strong>{line.author}</strong>
        {line.authorEmail && (
          <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">&lt;{line.authorEmail}&gt;</span>
        )}
      </div>
      <div className="text-sm text-gray-900 dark:text-gray-100 leading-[1.4] break-words">
        {line.summary}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function BlameViewer() {
  const [blameData, setBlameData] = useState<BlameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredLine, setHoveredLine] = useState<BlameLine | null>(null);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Connect to MCP host
  useEffect(() => {
    app
      .connect()
      .then(() => {
        appConnected = true;
        console.log("[blame-viewer] Connected to MCP host");
      })
      .catch(() => {
        console.log("[blame-viewer] No MCP host (standalone mode)");
      });

    app.ontoolresult = (result: { content?: ContentItem[] }) => {
      setLoading(false);
      setError(null);

      try {
        const textContent = result.content?.find((c) => c.type === "text") as ContentItem | undefined;
        if (!textContent?.text) {
          setBlameData(null);
          return;
        }

        const data: BlameData = JSON.parse(textContent.text);
        setBlameData(data);
      } catch (e) {
        setError(`Failed to parse blame data: ${e instanceof Error ? e.message : "Unknown"}`);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // Track mouse position for popup
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setPopupPosition({ x: e.clientX, y: e.clientY });
    };
    document.addEventListener("mousemove", handleMouseMove);
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Get unique commits for stats
  const stats = useMemo(() => {
    if (!blameData?.lines) return { commits: 0, authors: new Set<string>() };
    const commits = new Set(blameData.lines.map((l) => l.commitHash));
    const authors = new Set(blameData.lines.map((l) => l.author));
    return { commits: commits.size, authors };
  }, [blameData]);

  // Handle line click
  const handleLineClick = (line: BlameLine) => {
    setSelectedLine(line.lineNumber);
    notifyModel("select", {
      lineNumber: line.lineNumber,
      commitHash: line.commitHash,
      author: line.author,
      summary: line.summary,
    });
  };

  // Handle commit click (annotation click)
  const handleCommitClick = (line: BlameLine) => {
    notifyModel("viewCommit", {
      commitHash: line.commitHash,
      author: line.author,
      summary: line.summary,
    });
  };

  // Render states
  if (loading) {
    return (
      <div className="font-sans text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 min-h-screen relative">
        <div className="p-10 text-center text-gray-500 dark:text-gray-400">Loading blame data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="font-sans text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 min-h-screen relative">
        <div className="p-4 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 rounded-md m-4">{error}</div>
      </div>
    );
  }

  if (!blameData?.lines || blameData.lines.length === 0) {
    return (
      <div className="font-sans text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 min-h-screen relative">
        <div className="p-10 text-center text-gray-500 dark:text-gray-400">No blame data to display</div>
      </div>
    );
  }

  return (
    <div className="font-sans text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 min-h-screen relative" ref={containerRef}>
      {/* Header */}
      <div className="sticky top-0 z-10 flex justify-between items-center p-3 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <span className="font-semibold font-mono text-gray-900 dark:text-gray-100">{blameData.file}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {blameData.totalLines} lines | {stats.commits} commits | {stats.authors.size} authors
          </span>
        </div>
      </div>

      {/* Blame content */}
      <div className="overflow-auto">
        <div className="min-w-fit">
          {blameData.lines.map((line, idx) => {
            const prevHash = idx > 0 ? blameData.lines[idx - 1].commitHash : null;
            const isSelected = selectedLine === line.lineNumber;
            const isDark = typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;

            return (
              <div
                key={line.lineNumber}
                className={cx(
                  "flex min-h-[22px] border-b border-gray-100 dark:border-gray-800 hover:brightness-[0.97] dark:hover:brightness-110",
                  isSelected && "outline outline-2 outline-blue-500 outline-offset-[-2px]"
                )}
                style={{
                  background: isDark ? hashToColorDark(line.commitHash) : hashToColor(line.commitHash),
                }}
              >
                {/* Annotation column */}
                <BlameAnnotation
                  line={line}
                  showFull={false}
                  prevHash={prevHash}
                  onHover={setHoveredLine}
                  onClick={handleCommitClick}
                />

                {/* Line number */}
                <div className="w-[50px] min-w-[50px] px-2 py-0.5 text-right font-mono text-xs text-gray-500 dark:text-gray-400 bg-gray-100/30 dark:bg-gray-800/30 border-r border-gray-100 dark:border-gray-800 select-none">
                  {line.lineNumber}
                </div>

                {/* Code content */}
                <div
                  className="flex-1 px-3 py-0.5 font-mono text-[13px] whitespace-pre cursor-text select-text"
                  onClick={() => handleLineClick(line)}
                >
                  {line.content || " "}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Commit popup on hover */}
      {hoveredLine && <CommitPopup line={hoveredLine} position={popupPosition} />}
    </div>
  );
}

// ============================================================================
// Mount
// ============================================================================

render(<BlameViewer />, document.getElementById("app")!);
