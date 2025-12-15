/**
 * MetricsPanel Island - Expandable metrics display with fullscreen dashboard mode
 * Story 6.3 - Refactored for modularity with expand/collapse and dashboard view
 */

import { useEffect, useRef, useState } from "preact/hooks";
import { MetricCard, ProgressBar, RankItem, SectionCard } from "../components/ui/atoms/mod.ts";

interface MetricsPanelProps {
  apiBase: string;
  position?: "sidebar" | "overlay";
}

type MetricsTimeRange = "1h" | "24h" | "7d";
type ViewMode = "collapsed" | "sidebar" | "dashboard";

interface GraphMetricsResponse {
  current: {
    nodeCount: number;
    edgeCount: number;
    density: number;
    adaptiveAlpha: number;
    communitiesCount: number;
    capabilitiesCount?: number;
    embeddingsCount?: number;
    dependenciesCount?: number;
    pagerankTop10: Array<{ toolId: string; score: number }>;
  };
  timeseries: {
    edgeCount: Array<{ timestamp: string; value: number }>;
    avgConfidence: Array<{ timestamp: string; value: number }>;
    workflowRate: Array<{ timestamp: string; value: number }>;
  };
  period: {
    range: MetricsTimeRange;
    workflowsExecuted: number;
    workflowsSuccessRate: number;
    newEdgesCreated: number;
    newNodesAdded: number;
  };
  algorithm?: {
    tracesCount: number;
    acceptanceRate: number;
    avgFinalScore: number;
    avgSemanticScore: number;
    avgGraphScore: number;
    byDecision: { accepted: number; filtered: number; rejected: number };
    byTargetType: { tool: number; capability: number };
    // ADR-039 extensions
    byGraphType?: {
      graph: {
        count: number;
        avgScore: number;
        acceptanceRate: number;
        topSignals: { pagerank: number; adamicAdar: number; cooccurrence: number };
      };
      hypergraph: {
        count: number;
        avgScore: number;
        acceptanceRate: number;
        spectralRelevance: {
          withClusterMatch: { count: number; avgScore: number; selectedRate: number };
          withoutClusterMatch: { count: number; avgScore: number; selectedRate: number };
        };
      };
    };
    thresholdEfficiency?: {
      rejectedByThreshold: number;
      totalEvaluated: number;
      rejectionRate: number;
    };
    scoreDistribution?: {
      graph: Array<{ bucket: string; count: number }>;
      hypergraph: Array<{ bucket: string; count: number }>;
    };
    byMode?: {
      activeSearch: { count: number; avgScore: number; acceptanceRate: number };
      passiveSuggestion: { count: number; avgScore: number; acceptanceRate: number };
    };
  };
}

type GraphTypeTab = "graph" | "hypergraph";

export default function MetricsPanel({ apiBase: apiBaseProp }: MetricsPanelProps) {
  const apiBase = apiBaseProp || "http://localhost:3003";

  const [metrics, setMetrics] = useState<GraphMetricsResponse | null>(null);
  const [dateRange, setDateRange] = useState<MetricsTimeRange>("24h");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "collapsed";
    const saved = localStorage.getItem("metrics-panel-mode");
    return (saved as ViewMode) || "collapsed";
  });
  const [activeChart, setActiveChart] = useState<"edges" | "confidence" | "workflows">("edges");
  const [graphTypeTab, setGraphTypeTab] = useState<GraphTypeTab>("graph");

  const chartRefs = {
    edges: useRef<HTMLCanvasElement>(null),
    confidence: useRef<HTMLCanvasElement>(null),
    workflows: useRef<HTMLCanvasElement>(null),
    decisions: useRef<HTMLCanvasElement>(null),
    scores: useRef<HTMLCanvasElement>(null),
    scoreDistribution: useRef<HTMLCanvasElement>(null),
  };
  const chartInstances = useRef<Record<string, any>>({});

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("metrics-panel-mode", viewMode);
    }
  }, [viewMode]);

  const fetchMetrics = async () => {
    try {
      const res = await fetch(`${apiBase}/api/metrics?range=${dateRange}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: GraphMetricsResponse = await res.json();
      setMetrics(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, [dateRange]);

  // Dashboard mode: render all charts with better config
  useEffect(() => {
    if (viewMode !== "dashboard" || !metrics?.timeseries) return;

    const Chart = (globalThis as any).Chart;
    if (!Chart) return;

    // Cleanup previous instances
    Object.values(chartInstances.current).forEach((c: any) => c?.destroy());
    chartInstances.current = {};

    const baseOptions = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" as const },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(30, 27, 24, 0.95)",
          titleColor: "#f5f0e8",
          bodyColor: "#c9c2b8",
          borderColor: "rgba(255,184,111,0.3)",
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
        },
      },
      scales: {
        x: { grid: { color: "rgba(255,184,111,0.08)" }, ticks: { color: "#8a8078", maxRotation: 45, font: { size: 11 } } },
        y: { grid: { color: "rgba(255,184,111,0.08)" }, ticks: { color: "#8a8078", font: { size: 11 } }, beginAtZero: true },
      },
    };

    // Time series charts
    const timeseriesConfigs: Array<{ key: "edges" | "confidence" | "workflows"; data: any[]; color: string; type: string; label: string }> = [
      { key: "edges", data: metrics.timeseries.edgeCount, color: "#ffb86f", type: "line", label: "Edge Count" },
      { key: "confidence", data: metrics.timeseries.avgConfidence, color: "#4ade80", type: "line", label: "Avg Confidence" },
      { key: "workflows", data: metrics.timeseries.workflowRate, color: "#60a5fa", type: "bar", label: "Workflows/hour" },
    ];

    timeseriesConfigs.forEach(({ key, data, color, type, label }) => {
      const canvas = chartRefs[key].current;
      if (!canvas) return;

      chartInstances.current[key] = new Chart(canvas.getContext("2d"), {
        type,
        data: {
          labels: (data ?? []).map((p) => new Date(p.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })),
          datasets: [{
            label,
            data: (data ?? []).map((p) => p.value),
            borderColor: color,
            backgroundColor: type === "bar" ? `${color}88` : `${color}22`,
            fill: type === "line",
            tension: 0.4,
            borderWidth: 2,
            pointRadius: type === "line" ? 3 : 0,
            pointHoverRadius: 5,
            pointBackgroundColor: color,
          }],
        },
        options: baseOptions,
      });
    });

    // Decisions doughnut chart
    if (metrics.algorithm && chartRefs.decisions.current) {
      const { accepted, filtered, rejected } = metrics.algorithm.byDecision;
      chartInstances.current.decisions = new Chart(chartRefs.decisions.current.getContext("2d"), {
        type: "doughnut",
        data: {
          labels: ["Accepted", "Filtered", "Rejected"],
          datasets: [{
            data: [accepted, filtered, rejected],
            backgroundColor: ["#4ade80", "#fbbf24", "#f87171"],
            borderColor: "rgba(30, 27, 24, 0.8)",
            borderWidth: 2,
            hoverOffset: 8,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "60%",
          plugins: {
            legend: {
              position: "bottom" as const,
              labels: { color: "#c9c2b8", padding: 12, font: { size: 11 } },
            },
            tooltip: {
              backgroundColor: "rgba(30, 27, 24, 0.95)",
              titleColor: "#f5f0e8",
              bodyColor: "#c9c2b8",
              callbacks: {
                label: (ctx: any) => ` ${ctx.label}: ${ctx.raw} (${((ctx.raw / (accepted + filtered + rejected)) * 100).toFixed(1)}%)`,
              },
            },
          },
        },
      });
    }

    // Scores comparison bar chart
    if (metrics.algorithm && chartRefs.scores.current) {
      chartInstances.current.scores = new Chart(chartRefs.scores.current.getContext("2d"), {
        type: "bar",
        data: {
          labels: ["Final Score", "Semantic", "Graph"],
          datasets: [{
            label: "Average Scores",
            data: [
              metrics.algorithm.avgFinalScore,
              metrics.algorithm.avgSemanticScore,
              metrics.algorithm.avgGraphScore,
            ],
            backgroundColor: ["#ffb86f", "#a78bfa", "#34d399"],
            borderRadius: 6,
            barThickness: 40,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: "y" as const,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "rgba(30, 27, 24, 0.95)",
              callbacks: { label: (ctx: any) => ` ${ctx.raw.toFixed(3)}` },
            },
          },
          scales: {
            x: { grid: { color: "rgba(255,184,111,0.08)" }, ticks: { color: "#8a8078" }, max: 1, min: 0 },
            y: { grid: { display: false }, ticks: { color: "#c9c2b8", font: { size: 12, weight: "bold" } } },
          },
        },
      });
    }

    return () => {
      Object.values(chartInstances.current).forEach((c: any) => c?.destroy());
      chartInstances.current = {};
    };
  }, [metrics, viewMode]);

  // ADR-039: Score Distribution Chart (updates with graphTypeTab)
  useEffect(() => {
    if (viewMode !== "dashboard" || !metrics?.algorithm?.scoreDistribution) return;

    const Chart = (globalThis as any).Chart;
    if (!Chart || !chartRefs.scoreDistribution.current) return;

    // Destroy previous instance
    if (chartInstances.current.scoreDistribution) {
      chartInstances.current.scoreDistribution.destroy();
    }

    const distribution = graphTypeTab === "graph"
      ? metrics.algorithm.scoreDistribution.graph
      : metrics.algorithm.scoreDistribution.hypergraph;

    const color = graphTypeTab === "graph" ? "#ffb86f" : "#a78bfa";

    chartInstances.current.scoreDistribution = new Chart(chartRefs.scoreDistribution.current.getContext("2d"), {
      type: "bar",
      data: {
        labels: distribution.map((d) => d.bucket),
        datasets: [{
          label: `${graphTypeTab} Score Distribution`,
          data: distribution.map((d) => d.count),
          backgroundColor: `${color}cc`,
          borderColor: color,
          borderWidth: 1,
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: "y" as const,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(30, 27, 24, 0.95)",
            titleColor: "#f5f0e8",
            bodyColor: "#c9c2b8",
            callbacks: {
              label: (ctx: any) => ` ${ctx.raw} traces`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: "rgba(255,184,111,0.08)" },
            ticks: { color: "#8a8078" },
            beginAtZero: true,
          },
          y: {
            grid: { display: false },
            ticks: { color: "#c9c2b8", font: { size: 11 } },
          },
        },
      },
    });
  }, [metrics, viewMode, graphTypeTab]);

  // Sidebar mode: single chart
  const sidebarChartRef = useRef<HTMLCanvasElement>(null);
  const sidebarChartInstance = useRef<any>(null);

  useEffect(() => {
    if (viewMode !== "sidebar" || !sidebarChartRef.current || !metrics?.timeseries) return;

    const Chart = (globalThis as any).Chart;
    if (!Chart) return;

    if (sidebarChartInstance.current) sidebarChartInstance.current.destroy();

    const chartData = activeChart === "edges"
      ? metrics.timeseries.edgeCount
      : activeChart === "confidence"
      ? metrics.timeseries.avgConfidence
      : metrics.timeseries.workflowRate;

    const color = activeChart === "edges" ? "#ffb86f" : activeChart === "confidence" ? "#4ade80" : "#fbbf24";

    sidebarChartInstance.current = new Chart(sidebarChartRef.current.getContext("2d"), {
      type: activeChart === "workflows" ? "bar" : "line",
      data: {
        labels: (chartData ?? []).map((p) => new Date(p.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })),
        datasets: [{ data: (chartData ?? []).map((p) => p.value), borderColor: color, backgroundColor: `${color}33`, fill: true, tension: 0.3 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: "rgba(255,184,111,0.1)" }, ticks: { color: "#8a8078", maxRotation: 45, font: { size: 9 } } },
          y: { grid: { color: "rgba(255,184,111,0.1)" }, ticks: { color: "#8a8078", font: { size: 9 } }, beginAtZero: true },
        },
      },
    });

    return () => sidebarChartInstance.current?.destroy();
  }, [metrics, activeChart, viewMode]);

  const getSuccessColor = (rate: number) => rate >= 90 ? "var(--success)" : rate >= 70 ? "var(--warning)" : "var(--error)";
  const getScoreColor = (score: number) => score >= 0.7 ? "var(--success)" : score >= 0.4 ? "var(--warning)" : "var(--error)";

  // Collapsed: small icon button
  if (viewMode === "collapsed") {
    return (
      <div
        class="fixed right-5 top-1/2 -translate-y-full -mt-2 p-3 rounded-lg cursor-pointer z-20 hover:scale-105 transition-transform"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
        onClick={() => setViewMode("sidebar")}
        title="Open Metrics"
      >
        <svg class="w-4 h-4" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      </div>
    );
  }

  // Dashboard: fullscreen overlay
  if (viewMode === "dashboard") {
    return (
      <div
        class="fixed inset-0 z-50 overflow-auto"
        style={{ background: "var(--bg)", backdropFilter: "blur(8px)" }}
      >
        <div class="p-6 max-w-7xl mx-auto">
          {/* Header */}
          <div class="flex justify-between items-center mb-6">
            <h1 class="text-xl font-bold" style={{ color: "var(--text)" }}>Metrics Dashboard</h1>
            <div class="flex items-center gap-3">
              {/* Time Range */}
              <div class="flex gap-1 p-0.5 rounded-lg" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                {(["1h", "24h", "7d"] as MetricsTimeRange[]).map((r) => (
                  <button
                    key={r}
                    class="py-1.5 px-3 rounded text-xs font-semibold"
                    style={dateRange === r ? { background: "var(--accent)", color: "var(--bg)" } : { color: "var(--text-muted)" }}
                    onClick={() => setDateRange(r)}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <button
                class="p-2 rounded-lg"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
                onClick={() => setViewMode("sidebar")}
                title="Back to sidebar"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {loading && <div class="text-center py-8" style={{ color: "var(--text-dim)" }}>Loading...</div>}
          {error && <div class="text-center py-4" style={{ color: "var(--error)" }}>{error}</div>}

          {metrics && !loading && (
            <>
              {/* Top Stats Row */}
              <div class="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-8 gap-3 mb-6">
                <MetricCard label="Nodes" value={metrics.current.nodeCount} />
                <MetricCard label="Edges" value={metrics.current.edgeCount} />
                <MetricCard label="Density" value={`${(metrics.current.density * 100).toFixed(1)}%`} />
                <MetricCard label="Communities" value={metrics.current.communitiesCount} />
                <MetricCard label="Capabilities" value={metrics.current.capabilitiesCount || 0} color="var(--info)" />
                <MetricCard label="Embeddings" value={metrics.current.embeddingsCount || 0} />
                <MetricCard label="Workflows" value={metrics.period.workflowsExecuted} />
                <MetricCard label="Success" value={`${metrics.period.workflowsSuccessRate.toFixed(0)}%`} color={getSuccessColor(metrics.period.workflowsSuccessRate)} />
              </div>

              {/* Main Charts Grid - 2x2 */}
              <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                <div class="rounded-xl p-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                  <div class="flex justify-between items-center mb-4">
                    <h3 class="text-sm font-semibold" style={{ color: "var(--text)" }}>Edge Growth</h3>
                    <span class="text-xs px-2 py-1 rounded" style={{ background: "var(--accent-dim)", color: "var(--accent)" }}>
                      +{metrics.period.newEdgesCreated} new
                    </span>
                  </div>
                  <div class="h-56">
                    <canvas ref={chartRefs.edges} />
                  </div>
                </div>
                <div class="rounded-xl p-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                  <div class="flex justify-between items-center mb-4">
                    <h3 class="text-sm font-semibold" style={{ color: "var(--text)" }}>Average Confidence</h3>
                    <span class="text-xs px-2 py-1 rounded" style={{ background: "rgba(74, 222, 128, 0.15)", color: "#4ade80" }}>
                      α = {metrics.current.adaptiveAlpha.toFixed(2)}
                    </span>
                  </div>
                  <div class="h-56">
                    <canvas ref={chartRefs.confidence} />
                  </div>
                </div>
                <div class="rounded-xl p-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                  <div class="flex justify-between items-center mb-4">
                    <h3 class="text-sm font-semibold" style={{ color: "var(--text)" }}>Workflow Execution Rate</h3>
                    <span class="text-xs px-2 py-1 rounded" style={{ background: "rgba(96, 165, 250, 0.15)", color: "#60a5fa" }}>
                      {dateRange}
                    </span>
                  </div>
                  <div class="h-56">
                    <canvas ref={chartRefs.workflows} />
                  </div>
                </div>
                {/* Learning Progress Card */}
                <div class="rounded-xl p-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                  <h3 class="text-sm font-semibold mb-4" style={{ color: "var(--text)" }}>Learning Progress</h3>
                  <div class="grid grid-cols-2 gap-3 mb-4">
                    <MetricCard label="New Edges" value={`+${metrics.period.newEdgesCreated}`} color="var(--success)" />
                    <MetricCard label="New Nodes" value={`+${metrics.period.newNodesAdded}`} color="var(--success)" />
                    <MetricCard label="Dependencies" value={metrics.current.dependenciesCount || 0} />
                    <MetricCard label="Adaptive α" value={metrics.current.adaptiveAlpha.toFixed(3)} color="var(--accent)" />
                  </div>
                  <ProgressBar value={metrics.current.adaptiveAlpha} label="Learning Confidence" color="var(--accent)" height={8} />
                  <div class="mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
                    <h4 class="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>Top PageRank</h4>
                    <div class="max-h-32 overflow-y-auto">
                      {(metrics.current.pagerankTop10 ?? []).slice(0, 5).map((tool, idx) => (
                        <RankItem
                          key={tool.toolId}
                          rank={idx + 1}
                          label={tool.toolId.split("__").pop()?.split(":").pop() || tool.toolId}
                          value={tool.score.toFixed(3)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Algorithm Section - Only if we have traces */}
              {metrics.algorithm && metrics.algorithm.tracesCount > 0 && (
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Decisions Doughnut */}
                  <div class="rounded-xl p-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                    <div class="flex justify-between items-center mb-4">
                      <h3 class="text-sm font-semibold" style={{ color: "var(--text)" }}>Algorithm Decisions</h3>
                      <span class="text-xs px-2 py-1 rounded" style={{ background: "var(--bg)", color: "var(--text-muted)" }}>
                        {metrics.algorithm.tracesCount} traces
                      </span>
                    </div>
                    <div class="h-48">
                      <canvas ref={chartRefs.decisions} />
                    </div>
                  </div>

                  {/* Scores Horizontal Bar */}
                  <div class="rounded-xl p-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                    <div class="flex justify-between items-center mb-4">
                      <h3 class="text-sm font-semibold" style={{ color: "var(--text)" }}>Average Scores</h3>
                      <span class="text-xs px-2 py-1 rounded" style={{
                        background: getScoreColor(metrics.algorithm.avgFinalScore).replace("var(--", "rgba(").replace(")", ", 0.15)"),
                        color: getScoreColor(metrics.algorithm.avgFinalScore)
                      }}>
                        {(metrics.algorithm.acceptanceRate * 100).toFixed(0)}% accepted
                      </span>
                    </div>
                    <div class="h-48">
                      <canvas ref={chartRefs.scores} />
                    </div>
                  </div>

                  {/* Detailed Stats */}
                  <div class="rounded-xl p-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                    <h3 class="text-sm font-semibold mb-4" style={{ color: "var(--text)" }}>Algorithm Details</h3>
                    <div class="grid grid-cols-2 gap-3">
                      <MetricCard label="Accept Rate" value={`${(metrics.algorithm.acceptanceRate * 100).toFixed(0)}%`} color={getSuccessColor(metrics.algorithm.acceptanceRate * 100)} />
                      <MetricCard label="Final Score" value={metrics.algorithm.avgFinalScore.toFixed(3)} color={getScoreColor(metrics.algorithm.avgFinalScore)} />
                      <MetricCard label="Semantic" value={metrics.algorithm.avgSemanticScore.toFixed(3)} color="#a78bfa" />
                      <MetricCard label="Graph" value={metrics.algorithm.avgGraphScore.toFixed(3)} color="#34d399" />
                    </div>
                    <div class="mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
                      <div class="flex justify-between text-sm mb-2">
                        <span style={{ color: "var(--text-muted)" }}>Target Types</span>
                      </div>
                      <div class="flex gap-4">
                        <div class="flex-1 p-3 rounded-lg text-center" style={{ background: "var(--bg)" }}>
                          <div class="text-lg font-bold" style={{ color: "var(--accent)" }}>{metrics.algorithm.byTargetType.tool}</div>
                          <div class="text-xs" style={{ color: "var(--text-dim)" }}>Tools</div>
                        </div>
                        <div class="flex-1 p-3 rounded-lg text-center" style={{ background: "var(--bg)" }}>
                          <div class="text-lg font-bold" style={{ color: "var(--info)" }}>{metrics.algorithm.byTargetType.capability}</div>
                          <div class="text-xs" style={{ color: "var(--text-dim)" }}>Capabilities</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ADR-039: Algorithm Insights - Compact inline with tabs */}
              {metrics.algorithm && metrics.algorithm.tracesCount > 0 && metrics.algorithm.byGraphType && (
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-4">
                  {/* Left: Graph/Hypergraph Stats with tabs */}
                  <div class="rounded-xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                    <div class="flex justify-between items-center mb-3">
                      <h3 class="text-sm font-semibold" style={{ color: "var(--text)" }}>By Graph Type</h3>
                      <div class="flex gap-0.5 p-0.5 rounded" style={{ background: "var(--bg)" }}>
                        {(["graph", "hypergraph"] as GraphTypeTab[]).map((tab) => (
                          <button
                            key={tab}
                            class="py-1 px-2 rounded text-[10px] font-semibold capitalize"
                            style={graphTypeTab === tab
                              ? { background: tab === "graph" ? "#ffb86f" : "#a78bfa", color: "var(--bg)" }
                              : { color: "var(--text-muted)" }}
                            onClick={() => setGraphTypeTab(tab)}
                          >
                            {tab}
                          </button>
                        ))}
                      </div>
                    </div>
                    {(() => {
                      const stats = graphTypeTab === "graph"
                        ? metrics.algorithm!.byGraphType!.graph
                        : metrics.algorithm!.byGraphType!.hypergraph;
                      const color = graphTypeTab === "graph" ? "#ffb86f" : "#a78bfa";
                      return (
                        <>
                          <div class="grid grid-cols-3 gap-2 mb-3">
                            <MetricCard label="Count" value={stats.count} color={color} compact />
                            <MetricCard label="Avg" value={stats.avgScore.toFixed(2)} color={getScoreColor(stats.avgScore)} compact />
                            <MetricCard label="Accept" value={`${(stats.acceptanceRate * 100).toFixed(0)}%`} color={getSuccessColor(stats.acceptanceRate * 100)} compact />
                          </div>
                          {/* Graph: Top Signals inline */}
                          {graphTypeTab === "graph" && metrics.algorithm!.byGraphType!.graph.topSignals && (
                            <div class="flex gap-2 text-[10px]" style={{ color: "var(--text-dim)" }}>
                              <span>PR: <b style={{ color: "#ffb86f" }}>{metrics.algorithm!.byGraphType!.graph.topSignals.pagerank.toFixed(2)}</b></span>
                              <span>AA: <b style={{ color: "#34d399" }}>{metrics.algorithm!.byGraphType!.graph.topSignals.adamicAdar.toFixed(2)}</b></span>
                              <span>Co: <b style={{ color: "#60a5fa" }}>{metrics.algorithm!.byGraphType!.graph.topSignals.cooccurrence.toFixed(2)}</b></span>
                            </div>
                          )}
                          {/* Hypergraph: Spectral compact */}
                          {graphTypeTab === "hypergraph" && metrics.algorithm!.byGraphType!.hypergraph.spectralRelevance && (
                            <div class="flex gap-3 text-[10px]" style={{ color: "var(--text-dim)" }}>
                              <span>w/ cluster: <b style={{ color: "#4ade80" }}>{metrics.algorithm!.byGraphType!.hypergraph.spectralRelevance.withClusterMatch.avgScore.toFixed(2)}</b> ({(metrics.algorithm!.byGraphType!.hypergraph.spectralRelevance.withClusterMatch.selectedRate * 100).toFixed(0)}%)</span>
                              <span>w/o: <b style={{ color: "#fbbf24" }}>{metrics.algorithm!.byGraphType!.hypergraph.spectralRelevance.withoutClusterMatch.avgScore.toFixed(2)}</b> ({(metrics.algorithm!.byGraphType!.hypergraph.spectralRelevance.withoutClusterMatch.selectedRate * 100).toFixed(0)}%)</span>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {/* Right: Score Distribution mini chart */}
                  <div class="rounded-xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                    <div class="flex justify-between items-center mb-2">
                      <h3 class="text-sm font-semibold" style={{ color: "var(--text)" }}>Score Dist.</h3>
                      <span class="text-[10px] px-1.5 py-0.5 rounded capitalize" style={{
                        background: graphTypeTab === "graph" ? "rgba(255, 184, 111, 0.15)" : "rgba(167, 139, 250, 0.15)",
                        color: graphTypeTab === "graph" ? "#ffb86f" : "#a78bfa"
                      }}>
                        {graphTypeTab}
                      </span>
                    </div>
                    <div class="h-24">
                      <canvas ref={chartRefs.scoreDistribution} />
                    </div>
                  </div>

                  {/* Bottom row: Threshold & Mode - spans full width */}
                  <div class="lg:col-span-2 rounded-xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                    <div class="flex flex-wrap gap-4 items-center">
                      {/* Threshold */}
                      {metrics.algorithm!.thresholdEfficiency && (
                        <div class="flex-1 min-w-[150px]">
                          <ProgressBar
                            value={metrics.algorithm!.thresholdEfficiency.rejectionRate}
                            label={`Reject: ${metrics.algorithm!.thresholdEfficiency.rejectedByThreshold}/${metrics.algorithm!.thresholdEfficiency.totalEvaluated}`}
                            color="var(--warning)"
                            height={6}
                          />
                        </div>
                      )}
                      {/* Mode stats inline */}
                      {metrics.algorithm!.byMode && (
                        <div class="flex gap-4 text-[11px]">
                          <div class="text-center">
                            <div class="font-bold" style={{ color: "#60a5fa" }}>{metrics.algorithm!.byMode.activeSearch.avgScore.toFixed(2)}</div>
                            <div style={{ color: "var(--text-dim)" }}>Active ({metrics.algorithm!.byMode.activeSearch.count})</div>
                          </div>
                          <div class="text-center">
                            <div class="font-bold" style={{ color: "#34d399" }}>{metrics.algorithm!.byMode.passiveSuggestion.avgScore.toFixed(2)}</div>
                            <div style={{ color: "var(--text-dim)" }}>Passive ({metrics.algorithm!.byMode.passiveSuggestion.count})</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Empty state for Algorithm Insights - compact */}
              {metrics.algorithm && metrics.algorithm.tracesCount === 0 && (
                <div class="mt-4 p-4 rounded-xl text-center" style={{ background: "var(--bg-surface)", border: "1px dashed var(--border)" }}>
                  <div class="text-xs" style={{ color: "var(--text-muted)" }}>No algorithm traces for this period</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // Sidebar mode (default)
  return (
    <div
      class="p-3 overflow-y-auto flex flex-col gap-2 h-full transition-all duration-300"
      style={{ width: "280px", background: "linear-gradient(to bottom, var(--bg-elevated), var(--bg))", borderLeft: "1px solid var(--border)" }}
    >
      {/* Header */}
      <div class="flex justify-between items-center mb-1">
        <h2 class="text-sm font-bold" style={{ color: "var(--text)" }}>Metrics</h2>
        <div class="flex gap-1">
          <button
            class="p-1.5 rounded-lg transition-colors"
            style={{ color: "var(--text-muted)" }}
            onClick={() => setViewMode("dashboard")}
            title="Open Dashboard"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
          </button>
          <button
            class="p-1.5 rounded-lg"
            style={{ color: "var(--text-muted)" }}
            onClick={() => setViewMode("collapsed")}
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Time Range */}
      <div class="flex gap-1 p-0.5 rounded-lg" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
        {(["1h", "24h", "7d"] as MetricsTimeRange[]).map((r) => (
          <button
            key={r}
            class="flex-1 py-1 px-2 rounded text-[10px] font-semibold"
            style={dateRange === r ? { background: "var(--accent)", color: "var(--bg)" } : { color: "var(--text-muted)" }}
            onClick={() => setDateRange(r)}
          >
            {r}
          </button>
        ))}
      </div>

      {loading && <div class="text-xs text-center py-4" style={{ color: "var(--text-dim)" }}>Loading...</div>}
      {error && <div class="text-xs text-center py-2" style={{ color: "var(--error)" }}>{error}</div>}

      {metrics && !loading && (
        <>
          {/* Graph Section */}
          <SectionCard title="Graph" badge={metrics.current.nodeCount + metrics.current.edgeCount}>
            <div class="grid gap-1.5 grid-cols-2">
              <MetricCard label="Nodes" value={metrics.current.nodeCount} compact />
              <MetricCard label="Edges" value={metrics.current.edgeCount} compact />
              <MetricCard label="Density" value={`${(metrics.current.density * 100).toFixed(1)}%`} compact />
              <MetricCard label="Communities" value={metrics.current.communitiesCount} compact />
            </div>
            <div class="mt-2">
              <ProgressBar value={metrics.current.adaptiveAlpha} label="Adaptive α" color="var(--accent)" height={3} />
            </div>
          </SectionCard>

          {/* Learning Section */}
          <SectionCard title="Learning" badge={metrics.current.capabilitiesCount || 0}>
            <div class="grid gap-1.5 grid-cols-2">
              {metrics.current.capabilitiesCount !== undefined && (
                <MetricCard label="Capabilities" value={metrics.current.capabilitiesCount} color="var(--info)" compact />
              )}
              {metrics.current.embeddingsCount !== undefined && (
                <MetricCard label="Embeddings" value={metrics.current.embeddingsCount} compact />
              )}
              <MetricCard label="Workflows" value={metrics.period.workflowsExecuted} compact />
              <MetricCard
                label="Success"
                value={`${metrics.period.workflowsSuccessRate.toFixed(0)}%`}
                color={getSuccessColor(metrics.period.workflowsSuccessRate)}
                compact
              />
            </div>
          </SectionCard>

          {/* Algorithm Section */}
          {metrics.algorithm && metrics.algorithm.tracesCount > 0 && (
            <SectionCard title="Algorithm" badge={metrics.algorithm.tracesCount}>
              <div class="grid gap-1.5 grid-cols-2">
                <MetricCard
                  label="Accept Rate"
                  value={`${(metrics.algorithm.acceptanceRate * 100).toFixed(0)}%`}
                  color={getSuccessColor(metrics.algorithm.acceptanceRate * 100)}
                  compact
                />
                <MetricCard
                  label="Avg Score"
                  value={metrics.algorithm.avgFinalScore.toFixed(2)}
                  color={getScoreColor(metrics.algorithm.avgFinalScore)}
                  compact
                />
              </div>
            </SectionCard>
          )}

          {/* Top Tools */}
          <SectionCard title="Top PageRank" badge={metrics.current.pagerankTop10?.length || 0} defaultOpen={false}>
            <div class="overflow-y-auto max-h-28">
              {(metrics.current.pagerankTop10 ?? []).slice(0, 5).map((tool, idx) => (
                <RankItem
                  key={tool.toolId}
                  rank={idx + 1}
                  label={tool.toolId.split("__").pop()?.split(":").pop() || tool.toolId}
                  value={tool.score.toFixed(3)}
                />
              ))}
              {(metrics.current.pagerankTop10?.length ?? 0) === 0 && (
                <div class="text-[10px] text-center py-2" style={{ color: "var(--text-dim)" }}>No data</div>
              )}
            </div>
          </SectionCard>

          {/* Chart */}
          <div class="p-2 rounded-lg" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
            <div class="flex gap-1 mb-2">
              {(["edges", "confidence", "workflows"] as const).map((tab) => (
                <button
                  key={tab}
                  class="flex-1 py-1 rounded text-[9px] font-semibold"
                  style={activeChart === tab
                    ? { background: "var(--accent)", color: "var(--bg)" }
                    : { background: "var(--bg)", color: "var(--text-muted)" }}
                  onClick={() => setActiveChart(tab)}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1, 4)}
                </button>
              ))}
            </div>
            <div class="h-24">
              <canvas ref={sidebarChartRef} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
