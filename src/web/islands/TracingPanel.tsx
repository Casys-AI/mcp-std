/**
 * TracingPanel Island - Algorithm Scoring Visualization
 *
 * Real-time visualization of algorithm.scored events via BroadcastChannel.
 * Shows scoring breakdown: semantic, graph, pagerank, adamicAdar, etc.
 * Styled with Casys.ai design system
 */

import { useEffect, useRef, useState } from "preact/hooks";

interface AlgorithmScoredEvent {
  type: "algorithm.scored";
  timestamp: number;
  source: string;
  payload: {
    itemId: string;
    itemName?: string;
    itemType: "tool" | "capability";
    intent?: string;
    signals: {
      semanticScore?: number;
      graphScore?: number;
      successRate?: number;
      pagerank?: number;
      adamicAdar?: number;
    };
    finalScore: number;
    threshold: number;
    decision: "accepted" | "filtered";
  };
}

interface TracingPanelProps {
  apiBase: string;
}

export default function TracingPanel({ apiBase: _apiBaseProp }: TracingPanelProps) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("tracing-panel-collapsed");
    return saved !== null ? saved === "true" : true;
  });

  const [events, setEvents] = useState<AlgorithmScoredEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const eventsContainerRef = useRef<HTMLDivElement>(null);

  // Persist collapsed state
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("tracing-panel-collapsed", String(collapsed));
    }
  }, [collapsed]);

  // Subscribe to SSE for algorithm.scored events
  useEffect(() => {
    if (typeof window === "undefined" || collapsed) return;

    const apiBase = "http://localhost:3003";
    let eventSource: EventSource | null = null;

    try {
      // Use filter to only receive algorithm.* events
      eventSource = new EventSource(`${apiBase}/events/stream?filter=algorithm.*`);

      eventSource.addEventListener("algorithm.scored", (e: Event) => {
        if (paused) return;
        const messageEvent = e as MessageEvent;
        try {
          const payload = JSON.parse(messageEvent.data);
          const event: AlgorithmScoredEvent = {
            type: "algorithm.scored",
            timestamp: Date.now(),
            source: "sse",
            payload,
          };
          setEvents((prev) => {
            const updated = [event, ...prev];
            return updated.slice(0, 50); // Keep last 50
          });
        } catch (err) {
          console.warn("Failed to parse algorithm.scored event:", err);
        }
      });

      eventSource.onerror = () => {
        console.warn("SSE connection error, will retry...");
      };
    } catch (err) {
      console.warn("EventSource not available:", err);
    }

    return () => {
      eventSource?.close();
    };
  }, [collapsed, paused]);

  // Auto-scroll to top on new events
  useEffect(() => {
    if (eventsContainerRef.current && !paused) {
      eventsContainerRef.current.scrollTop = 0;
    }
  }, [events, paused]);

  const clearEvents = () => setEvents([]);

  const getDecisionColor = (decision: string) => {
    return decision === "accepted" ? "var(--success)" : "var(--error)";
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return "var(--success)";
    if (score >= 0.5) return "var(--warning)";
    return "var(--error)";
  };

  const styles = {
    sidebar: {
      background: "linear-gradient(to bottom, var(--bg-elevated), var(--bg))",
      borderLeft: "1px solid var(--border)",
      fontFamily: "var(--font-sans)",
    },
    card: {
      background: "var(--bg-surface)",
      border: "1px solid var(--border)",
    },
    button: {
      background: "var(--bg-surface)",
      border: "1px solid var(--border)",
      color: "var(--text-muted)",
    },
    buttonActive: {
      background: "var(--accent)",
      border: "1px solid var(--accent)",
      color: "var(--bg)",
    },
  };

  if (collapsed) {
    return (
      <div
        class="fixed right-5 top-1/2 mt-2 p-3.5 rounded-xl cursor-pointer z-20 transition-all duration-300"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          backdropFilter: "blur(12px)",
        }}
        onClick={() => setCollapsed(false)}
        title="Algorithm Tracing"
        onMouseOver={(e) => {
          e.currentTarget.style.borderColor = "var(--accent-medium)";
          e.currentTarget.style.background = "var(--accent-dim)";
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.borderColor = "var(--border)";
          e.currentTarget.style.background = "var(--bg-elevated)";
        }}
      >
        <svg
          class="w-5 h-5"
          style={{ color: "var(--text-muted)" }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
      </div>
    );
  }

  return (
    <div
      class="w-[340px] p-5 overflow-y-auto flex flex-col gap-4 h-full"
      style={styles.sidebar}
    >
      {/* Header */}
      <div class="flex justify-between items-center">
        <h2 class="text-xl font-bold" style={{ color: "var(--text)" }}>
          Algorithm Tracing
        </h2>
        <div class="flex gap-1.5">
          <button
            class="p-2 rounded-lg transition-all duration-200"
            style={paused ? styles.buttonActive : styles.button}
            onClick={() => setPaused(!paused)}
            title={paused ? "Resume" : "Pause"}
            onMouseOver={(e) => {
              if (!paused) {
                e.currentTarget.style.borderColor = "var(--accent-medium)";
                e.currentTarget.style.color = "var(--accent)";
              }
            }}
            onMouseOut={(e) => {
              if (!paused) {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.color = "var(--text-muted)";
              }
            }}
          >
            {paused ? (
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            ) : (
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            )}
          </button>
          <button
            class="p-2 rounded-lg transition-all duration-200"
            style={styles.button}
            onClick={clearEvents}
            title="Clear"
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = "var(--accent-medium)";
              e.currentTarget.style.color = "var(--accent)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
          <button
            class="p-2 rounded-lg transition-all duration-200"
            style={styles.button}
            onClick={() => setCollapsed(true)}
            title="Collapse"
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = "var(--accent-medium)";
              e.currentTarget.style.color = "var(--accent)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Status */}
      <div
        class="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
      >
        <span
          class="w-2 h-2 rounded-full"
          style={{ background: paused ? "var(--warning)" : "var(--success)" }}
        />
        <span style={{ color: "var(--text-muted)" }}>
          {paused ? "Paused" : "Listening"} · {events.length} events
        </span>
      </div>

      {/* Events List */}
      <div
        ref={eventsContainerRef}
        class="flex-1 overflow-y-auto flex flex-col gap-3"
        style={{ minHeight: 0 }}
      >
        {events.length === 0 ? (
          <div
            class="p-4 rounded-xl text-center"
            style={styles.card}
          >
            <p class="text-sm" style={{ color: "var(--text-dim)" }}>
              Waiting for algorithm.scored events...
            </p>
            <p class="text-xs mt-2" style={{ color: "var(--text-dim)" }}>
              Execute a search or DAG to see scoring decisions
            </p>
          </div>
        ) : (
          events.map((event, idx) => (
            <div
              key={`${event.timestamp}-${idx}`}
              class="p-2 rounded-lg transition-all duration-200"
              style={styles.card}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = "var(--accent-medium)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
              }}
            >
              {/* Compact header: type + name + score + decision */}
              <div class="flex items-center gap-1.5 mb-1">
                <span
                  class="text-[9px] font-medium px-1.5 py-0.5 rounded shrink-0"
                  style={{
                    background: event.payload.itemType === "tool"
                      ? "var(--accent-dim)"
                      : "var(--info-dim, rgba(59, 130, 246, 0.2))",
                    color: event.payload.itemType === "tool"
                      ? "var(--accent)"
                      : "var(--info, #3b82f6)",
                  }}
                >
                  {event.payload.itemType === "tool" ? "T" : "C"}
                </span>
                <span
                  class="text-xs truncate flex-1"
                  style={{ color: "var(--text)" }}
                  title={event.payload.itemId}
                >
                  {event.payload.itemName || event.payload.itemId.split("__").pop()?.split(":").pop() || event.payload.itemId}
                </span>
                <span
                  class="text-xs font-bold tabular-nums"
                  style={{
                    color: getScoreColor(event.payload.finalScore),
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {event.payload.finalScore.toFixed(2)}
                </span>
                <span
                  class="w-2 h-2 rounded-full shrink-0"
                  style={{
                    background: getDecisionColor(event.payload.decision),
                  }}
                  title={event.payload.decision}
                />
              </div>

              {/* Compact signals row */}
              <div class="flex flex-wrap gap-x-2 gap-y-0.5">
                {[
                  { label: "sem", value: event.payload.signals.semanticScore },
                  { label: "grp", value: event.payload.signals.graphScore },
                  { label: "suc", value: event.payload.signals.successRate },
                  { label: "pr", value: event.payload.signals.pagerank },
                  { label: "aa", value: event.payload.signals.adamicAdar },
                ]
                  .filter((signal) => signal.value !== undefined && signal.value > 0)
                  .map((signal) => (
                    <span
                      key={signal.label}
                      class="text-[9px] tabular-nums"
                      style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}
                    >
                      <span style={{ opacity: 0.6 }}>{signal.label}:</span>
                      <span style={{ color: getScoreColor(signal.value!) }}>
                        {(signal.value! * 100).toFixed(0)}
                      </span>
                    </span>
                  ))}
                <span
                  class="text-[9px] ml-auto"
                  style={{ color: "var(--text-dim)", opacity: 0.5 }}
                >
                  {new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
