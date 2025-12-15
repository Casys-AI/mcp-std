/**
 * Visualization Helpers for Casys PML Playground
 *
 * Mermaid diagram generators for DAGs, GraphRAG, and execution timelines.
 * Use in Jupyter notebooks to visualize workflow structures and execution.
 */

// =============================================================================
// LOCAL TYPES FOR VISUALIZATION
// =============================================================================
// These match the notebook usage patterns and are compatible with various DAG formats

/**
 * DAG task for visualization
 */
export interface DAGTask {
  id: string;
  tool_name?: string;
  dependencies?: string[];
}

/**
 * DAG workflow for visualization
 */
export interface DAGWorkflow {
  id?: string;
  tasks: DAGTask[];
}

/**
 * Edge representation for GraphRAG visualization
 */
export interface ToolEdge {
  source: string;
  target: string;
  weight: number;
  relationship?: string;
}

/**
 * Execution event for timeline visualization
 */
export interface ExecutionEvent {
  type:
    | "task_start"
    | "task_complete"
    | "task_error"
    | "layer_start"
    | "layer_complete"
    | "decision";
  taskId?: string;
  layerIdx?: number;
  timestamp: number;
  status?: "success" | "error" | "pending";
  decisionType?: "ail" | "hil";
  outcome?: string;
}

/**
 * Convert DAG workflow to Mermaid diagram
 *
 * @example
 * ```typescript
 * const mermaid = dagToMermaid(workflow);
 * console.log(mermaid);
 * // Copy output to markdown cell with ```mermaid fence
 * ```
 */
export function dagToMermaid(dag: DAGWorkflow): string {
  const lines: string[] = ["graph TD"];

  // Track nodes without dependencies (entry points)
  const entryNodes = new Set<string>();
  const hasIncoming = new Set<string>();

  // First pass: identify relationships
  for (const task of dag.tasks) {
    if (!task.dependencies || task.dependencies.length === 0) {
      entryNodes.add(task.id);
    }
    for (const _dep of task.dependencies || []) {
      hasIncoming.add(task.id);
    }
  }

  // Add standalone nodes (no deps)
  for (const task of dag.tasks) {
    if (entryNodes.has(task.id) && !hasIncoming.has(task.id)) {
      const label = formatTaskLabel(task);
      lines.push(`    ${task.id}[${label}]`);
    }
  }

  // Add edges
  for (const task of dag.tasks) {
    const label = formatTaskLabel(task);
    for (const dep of task.dependencies || []) {
      lines.push(`    ${dep} --> ${task.id}[${label}]`);
    }
  }

  return lines.join("\n");
}

/**
 * Convert DAG layers to Mermaid subgraph diagram
 * Shows parallel execution groups (fan-in/fan-out patterns)
 *
 * @example
 * ```typescript
 * const layers = executor.topologicalSort(dag);
 * const mermaid = layersToMermaid(layers);
 * ```
 */
export function layersToMermaid(layers: DAGTask[][]): string {
  const lines: string[] = ["graph TD"];

  // Create subgraphs for each layer
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    const layerLabel = layer.length > 1 ? "Parallel" : "Sequential";
    lines.push(`    subgraph L${i}["Layer ${i} - ${layerLabel}"]`);

    for (const task of layer) {
      const label = formatTaskLabel(task);
      lines.push(`        ${task.id}[${label}]`);
    }

    lines.push(`    end`);
  }

  // Add inter-layer edges
  for (let i = 0; i < layers.length; i++) {
    for (const task of layers[i]) {
      for (const dep of task.dependencies || []) {
        lines.push(`    ${dep} --> ${task.id}`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Convert GraphRAG tool relationships to Mermaid diagram
 * Shows tool co-usage patterns with weighted edges
 *
 * @example
 * ```typescript
 * const edges = await graphEngine.getRelatedTools("search_tools");
 * const mermaid = graphragToMermaid(edges);
 * ```
 */
export function graphragToMermaid(
  edges: ToolEdge[],
  options?: { minWeight?: number; maxNodes?: number },
): string {
  const minWeight = options?.minWeight ?? 0.1;
  const maxNodes = options?.maxNodes ?? 20;

  // Filter by weight
  const filteredEdges = edges
    .filter((e) => e.weight >= minWeight)
    .slice(0, maxNodes);

  const lines: string[] = ["graph LR"];

  for (const edge of filteredEdges) {
    const weightLabel = edge.weight.toFixed(2);
    const relationship = edge.relationship || "co-used";
    lines.push(
      `    ${sanitizeId(edge.source)} -->|${relationship}: ${weightLabel}| ${
        sanitizeId(edge.target)
      }`,
    );
  }

  if (filteredEdges.length === 0) {
    lines.push(`    empty[No edges above threshold ${minWeight}]`);
  }

  return lines.join("\n");
}

/**
 * Convert execution events to Mermaid sequence diagram
 * Shows task execution timeline with decision points
 *
 * @example
 * ```typescript
 * const events: ExecutionEvent[] = [];
 * for await (const event of executor.executeStream(dag, "wf-1")) {
 *   events.push(mapToExecutionEvent(event));
 * }
 * const mermaid = executionTimelineToMermaid(events);
 * ```
 */
export function executionTimelineToMermaid(events: ExecutionEvent[]): string {
  const lines: string[] = ["sequenceDiagram"];
  lines.push("    participant E as Executor");
  lines.push("    participant T as Tasks");
  lines.push("    participant D as Decisions");

  for (const event of events) {
    switch (event.type) {
      case "layer_start":
        lines.push(`    Note over E: Layer ${event.layerIdx} start`);
        break;
      case "task_start":
        lines.push(`    E->>T: Start ${event.taskId}`);
        break;
      case "task_complete":
        lines.push(`    T-->>E: ${event.taskId} complete`);
        break;
      case "task_error":
        lines.push(`    T--xE: ${event.taskId} failed`);
        break;
      case "decision":
        const actor = event.decisionType === "hil" ? "Human" : "Agent";
        lines.push(`    E->>D: ${event.decisionType?.toUpperCase()} checkpoint`);
        lines.push(`    D-->>E: ${actor}: ${event.outcome}`);
        break;
      case "layer_complete":
        lines.push(`    Note over E: Layer ${event.layerIdx} complete`);
        break;
    }
  }

  return lines.join("\n");
}

/**
 * Convert GraphRAG edge evolution to comparison diagram
 * Shows before/after weights for learning visualization
 *
 * @example
 * ```typescript
 * const before = await graphEngine.getEdges("tool_a");
 * // ... execute workflow ...
 * const after = await graphEngine.getEdges("tool_a");
 * const mermaid = graphragEvolutionToMermaid(before, after);
 * ```
 */
export function graphragEvolutionToMermaid(
  before: ToolEdge[],
  after: ToolEdge[],
): string {
  const lines: string[] = ["graph TB"];

  // Create map for comparison
  const beforeMap = new Map(before.map((e) => [`${e.source}-${e.target}`, e.weight]));

  lines.push(`    subgraph Before["Before Execution"]`);
  for (const edge of before.slice(0, 10)) {
    lines.push(
      `        B_${sanitizeId(edge.source)} -->|${edge.weight.toFixed(2)}| B_${
        sanitizeId(edge.target)
      }`,
    );
  }
  lines.push(`    end`);

  lines.push(`    subgraph After["After Execution (Learning)"]`);
  for (const edge of after.slice(0, 10)) {
    const key = `${edge.source}-${edge.target}`;
    const beforeWeight = beforeMap.get(key) || 0;
    const delta = edge.weight - beforeWeight;
    const deltaStr = delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2);
    lines.push(
      `        A_${sanitizeId(edge.source)} -->|${edge.weight.toFixed(2)} (${deltaStr})| A_${
        sanitizeId(edge.target)
      }`,
    );
  }
  lines.push(`    end`);

  return lines.join("\n");
}

/**
 * Generate a simple stats summary for console output
 */
export function dagStats(dag: DAGWorkflow): string {
  const totalTasks = dag.tasks.length;
  const withDeps =
    dag.tasks.filter((t: DAGTask) => t.dependencies && t.dependencies.length > 0).length;
  const entryPoints = totalTasks - withDeps;

  return `DAG Stats:
  - Total tasks: ${totalTasks}
  - Entry points: ${entryPoints}
  - With dependencies: ${withDeps}
  - Workflow ID: ${dag.id || "N/A"}`;
}

/**
 * Topological sort: organize DAG tasks into parallel execution layers
 *
 * @param dag - The DAG workflow to sort
 * @returns Array of layers, where each layer contains tasks that can run in parallel
 * @throws Error if a cycle is detected in the DAG
 *
 * @example
 * ```typescript
 * const layers = topologicalSort(workflow);
 * // layers[0] = tasks with no dependencies (entry points)
 * // layers[1] = tasks whose deps are all in layer 0
 * // etc.
 * ```
 */
export function topologicalSort(dag: DAGWorkflow): DAGTask[][] {
  const layers: DAGTask[][] = [];
  const completed = new Set<string>();
  const remaining = [...dag.tasks];

  while (remaining.length > 0) {
    // Find tasks whose dependencies are all completed
    const layer = remaining.filter((task) =>
      (task.dependencies || []).every((dep) => completed.has(dep))
    );

    if (layer.length === 0) {
      throw new Error("Cycle detected in DAG!");
    }

    layers.push(layer);

    // Mark layer tasks as completed and remove from remaining
    layer.forEach((task) => {
      completed.add(task.id);
      const idx = remaining.indexOf(task);
      remaining.splice(idx, 1);
    });
  }

  return layers;
}

// --- Helper functions ---

function formatTaskLabel(task: DAGTask): string {
  const toolName = task.tool_name || task.id;
  // Truncate long names
  return toolName.length > 20 ? toolName.substring(0, 17) + "..." : toolName;
}

function sanitizeId(id: string): string {
  // Mermaid IDs can't have special characters
  return id.replace(/[^a-zA-Z0-9_]/g, "_");
}

/**
 * Helper to map ControlledExecutor events to ExecutionEvent format
 */
export function mapExecutorEvent(event: Record<string, unknown>): ExecutionEvent | null {
  const type = event.type as string;
  const timestamp = (event.timestamp as number) || Date.now();

  switch (type) {
    case "layer_start":
      return { type: "layer_start", layerIdx: event.layer as number, timestamp };
    case "task_start":
      return { type: "task_start", taskId: event.task_id as string, timestamp };
    case "task_complete":
      return {
        type: "task_complete",
        taskId: event.task_id as string,
        timestamp,
        status: "success",
      };
    case "task_error":
      return { type: "task_error", taskId: event.task_id as string, timestamp, status: "error" };
    case "layer_complete":
      return { type: "layer_complete", layerIdx: event.layer as number, timestamp };
    case "hil_checkpoint":
    case "ail_decision":
      return {
        type: "decision",
        decisionType: type === "hil_checkpoint" ? "hil" : "ail",
        outcome: event.outcome as string,
        timestamp,
      };
    default:
      return null;
  }
}

// =============================================================================
// JUPYTER DISPLAY FUNCTIONS
// =============================================================================
// These functions render Mermaid diagrams in Deno Jupyter notebooks.
// Uses mermaid.ink API to generate SVG server-side.

import pako from "npm:pako@2";

/**
 * Encode mermaid diagram for mermaid.ink API
 * Format: UTF-8 → deflate → base64url
 */
function encodeMermaidForInk(diagram: string): string {
  const data = new TextEncoder().encode(diagram);
  const compressed = pako.deflate(data, { level: 9 });
  const base64 = btoa(String.fromCharCode(...compressed))
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return base64;
}

/**
 * Render any Mermaid definition and display as SVG in Jupyter
 * Uses Kroki.io API for server-side SVG generation
 *
 * @example
 * ```typescript
 * await displayMermaid("graph TD\n  A --> B");
 * ```
 */
export async function displayMermaid(definition: string): Promise<unknown> {
  // Encode and fetch SVG from Kroki.io
  const encoded = encodeMermaidForInk(definition);
  const url = `https://kroki.io/mermaid/svg/${encoded}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Kroki returned ${response.status}`);
  }

  const svg = await response.text();

  // @ts-ignore - Deno.jupyter exists in Jupyter runtime
  if (typeof Deno !== "undefined" && Deno.jupyter) {
    // @ts-ignore
    return Deno.jupyter.svg`${svg}`;
  }

  // Non-Jupyter: return SVG string
  return svg;
}

/**
 * Display a DAG workflow as a visual diagram
 *
 * @example
 * ```typescript
 * await displayDag(workflow);
 * ```
 */
export async function displayDag(dag: DAGWorkflow): Promise<unknown> {
  return displayMermaid(dagToMermaid(dag));
}

/**
 * Display DAG execution layers showing parallel/sequential groups
 *
 * @example
 * ```typescript
 * await displayLayers(layers);
 * ```
 */
export async function displayLayers(layers: DAGTask[][]): Promise<unknown> {
  return displayMermaid(layersToMermaid(layers));
}

/**
 * Display GraphRAG tool relationships as a visual graph
 *
 * @example
 * ```typescript
 * await displayGraphrag(edges, { minWeight: 0.3 });
 * ```
 */
export async function displayGraphrag(
  edges: ToolEdge[],
  options?: { minWeight?: number; maxNodes?: number },
): Promise<unknown> {
  return displayMermaid(graphragToMermaid(edges, options));
}

/**
 * Display execution timeline as a sequence diagram
 *
 * @example
 * ```typescript
 * await displayTimeline(events);
 * ```
 */
export async function displayTimeline(events: ExecutionEvent[]): Promise<unknown> {
  return displayMermaid(executionTimelineToMermaid(events));
}

/**
 * Display GraphRAG evolution (before/after learning)
 *
 * @example
 * ```typescript
 * await displayEvolution(edgesBefore, edgesAfter);
 * ```
 */
export async function displayEvolution(
  before: ToolEdge[],
  after: ToolEdge[],
): Promise<unknown> {
  return displayMermaid(graphragEvolutionToMermaid(before, after));
}

// =============================================================================
// WORKFLOW TEMPLATES VISUALIZATION (Story 5.2)
// =============================================================================

/**
 * Workflow edge from WorkflowLoader
 */
export interface WorkflowEdge {
  from: string;
  to: string;
  workflowName: string;
}

/**
 * Convert workflow edges to Mermaid diagram
 * Groups edges by workflow name with subgraphs
 *
 * @example
 * ```typescript
 * const edges = loader.convertToEdges(workflows);
 * const mermaid = workflowEdgesToMermaid(edges);
 * await displayMermaid(mermaid);
 * ```
 */
export function workflowEdgesToMermaid(
  edges: WorkflowEdge[],
  options?: { grouped?: boolean },
): string {
  const lines: string[] = ["graph LR"];
  const grouped = options?.grouped ?? true;

  if (grouped) {
    // Group edges by workflow
    const byWorkflow = new Map<string, WorkflowEdge[]>();
    for (const edge of edges) {
      const list = byWorkflow.get(edge.workflowName) || [];
      list.push(edge);
      byWorkflow.set(edge.workflowName, list);
    }

    // Create subgraph per workflow
    for (const [workflowName, workflowEdges] of byWorkflow) {
      lines.push(`    subgraph ${sanitizeId(workflowName)}["${workflowName}"]`);
      for (const edge of workflowEdges) {
        const fromId = `${sanitizeId(workflowName)}_${sanitizeId(edge.from)}`;
        const toId = `${sanitizeId(workflowName)}_${sanitizeId(edge.to)}`;
        lines.push(`        ${fromId}["${edge.from}"] --> ${toId}["${edge.to}"]`);
      }
      lines.push(`    end`);
    }
  } else {
    // Flat graph (edges can share nodes across workflows)
    for (const edge of edges) {
      lines.push(
        `    ${sanitizeId(edge.from)}["${edge.from}"] --> ${sanitizeId(edge.to)}["${edge.to}"]`,
      );
    }
  }

  if (edges.length === 0) {
    lines.push(`    empty["No workflow edges defined"]`);
  }

  return lines.join("\n");
}

/**
 * Display workflow edges as visual diagram
 *
 * @example
 * ```typescript
 * const edges = loader.convertToEdges(workflows);
 * await displayWorkflowEdges(edges);
 * ```
 */
export async function displayWorkflowEdges(
  edges: WorkflowEdge[],
  options?: { grouped?: boolean },
): Promise<unknown> {
  return displayMermaid(workflowEdgesToMermaid(edges, options));
}

/**
 * Generate stats summary for workflow templates
 */
export function workflowStats(
  workflows: Array<{ name: string; steps?: string[]; edges?: [string, string][] }>,
): string {
  const withSteps = workflows.filter((w) => w.steps && w.steps.length >= 2).length;
  const withEdges = workflows.filter((w) => w.edges && w.edges.length >= 1).length;
  const totalEdges = workflows.reduce((sum, w) => {
    if (w.steps) return sum + Math.max(0, w.steps.length - 1);
    if (w.edges) return sum + w.edges.length;
    return sum;
  }, 0);

  return `Workflow Stats:
  - Total workflows: ${workflows.length}
  - Using steps (linear): ${withSteps}
  - Using edges (DAG): ${withEdges}
  - Total edges: ${totalEdges}`;
}
