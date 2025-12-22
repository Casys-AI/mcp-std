/**
 * Dijkstra Pathfinding Benchmarks
 *
 * Benchmarks for Dijkstra's shortest path algorithm.
 * Tests single-pair, multi-pair, and all-pairs computations.
 *
 * Run: deno bench --allow-all tests/benchmarks/pathfinding/dijkstra.bench.ts
 *
 * @module tests/benchmarks/pathfinding/dijkstra
 */

import {
  calculateAveragePathWeight,
  calculatePathWeight,
  findAllPaths,
  findShortestPath,
  getPathLength,
  hasPathWithinHops,
} from "../../../src/graphrag/algorithms/pathfinding.ts";
import {
  buildGraphFromScenario,
  generateStressGraph,
  loadScenario,
} from "../fixtures/scenario-loader.ts";

// ============================================================================
// Setup
// ============================================================================

const smallScenario = await loadScenario("small-graph");
const mediumScenario = await loadScenario("medium-graph");

const smallGraph = buildGraphFromScenario(smallScenario);
const mediumGraph = buildGraphFromScenario(mediumScenario);

// Generate stress graphs
const stressScenario = generateStressGraph({
  toolCount: 200,
  capabilityCount: 30,
  metaCapabilityCount: 5,
  edgeDensity: 0.1,
  toolsPerCapability: { min: 4, max: 10 },
  capabilitiesPerMeta: { min: 4, max: 8 },
});
const stressGraph = buildGraphFromScenario(stressScenario);

// Get node pairs for testing
const smallNodes = Array.from(smallGraph.nodes());
const mediumNodes = Array.from(mediumGraph.nodes());
const stressNodes = Array.from(stressGraph.nodes());

// Select diverse pairs (tools at different positions)
function selectPairs(nodes: string[], count: number): [string, string][] {
  const pairs: [string, string][] = [];
  const step = Math.floor(nodes.length / count);

  for (let i = 0; i < count && i * step + step < nodes.length; i++) {
    pairs.push([nodes[i * step], nodes[i * step + step]]);
  }

  return pairs;
}

const smallPairs = selectPairs(smallNodes, 3);
const mediumPairs = selectPairs(mediumNodes, 5);
const stressPairs = selectPairs(stressNodes, 10);

// ============================================================================
// Benchmarks: Single Pair Shortest Path
// ============================================================================

Deno.bench({
  name: "Dijkstra: single pair (small graph)",
  group: "dijkstra-single",
  baseline: true,
  fn: () => {
    if (smallPairs.length >= 1) {
      findShortestPath(smallGraph, smallPairs[0][0], smallPairs[0][1]);
    }
  },
});

Deno.bench({
  name: "Dijkstra: single pair (medium graph)",
  group: "dijkstra-single",
  fn: () => {
    if (mediumPairs.length >= 1) {
      findShortestPath(mediumGraph, mediumPairs[0][0], mediumPairs[0][1]);
    }
  },
});

Deno.bench({
  name: "Dijkstra: single pair (stress graph)",
  group: "dijkstra-single",
  fn: () => {
    if (stressPairs.length >= 1) {
      findShortestPath(stressGraph, stressPairs[0][0], stressPairs[0][1]);
    }
  },
});

// ============================================================================
// Benchmarks: Multiple Pairs (DAG building scenario)
// ============================================================================

Deno.bench({
  name: "Dijkstra: 3 pairs (small, DAG sim)",
  group: "dijkstra-multi",
  baseline: true,
  fn: () => {
    for (const [from, to] of smallPairs) {
      findShortestPath(smallGraph, from, to);
    }
  },
});

Deno.bench({
  name: "Dijkstra: 5 pairs (medium, DAG sim)",
  group: "dijkstra-multi",
  fn: () => {
    for (const [from, to] of mediumPairs) {
      findShortestPath(mediumGraph, from, to);
    }
  },
});

Deno.bench({
  name: "Dijkstra: 10 pairs (stress, DAG sim)",
  group: "dijkstra-multi",
  fn: () => {
    for (const [from, to] of stressPairs) {
      findShortestPath(stressGraph, from, to);
    }
  },
});

// ============================================================================
// Benchmarks: N×N Paths (Full DAG Building)
// ============================================================================

Deno.bench({
  name: "Dijkstra: N×N paths (small, 5 nodes)",
  group: "dijkstra-nxn",
  baseline: true,
  fn: () => {
    const nodes = smallNodes.slice(0, 5);
    for (const from of nodes) {
      for (const to of nodes) {
        if (from !== to) {
          findShortestPath(smallGraph, from, to);
        }
      }
    }
  },
});

Deno.bench({
  name: "Dijkstra: N×N paths (medium, 10 nodes)",
  group: "dijkstra-nxn",
  fn: () => {
    const nodes = mediumNodes.slice(0, 10);
    for (const from of nodes) {
      for (const to of nodes) {
        if (from !== to) {
          findShortestPath(mediumGraph, from, to);
        }
      }
    }
  },
});

Deno.bench({
  name: "Dijkstra: N×N paths (stress, 15 nodes)",
  group: "dijkstra-nxn",
  fn: () => {
    const nodes = stressNodes.slice(0, 15);
    for (const from of nodes) {
      for (const to of nodes) {
        if (from !== to) {
          findShortestPath(stressGraph, from, to);
        }
      }
    }
  },
});

// ============================================================================
// Benchmarks: Find All Paths (DFS)
// ============================================================================

Deno.bench({
  name: "FindAllPaths: maxLength=3 (small)",
  group: "all-paths",
  baseline: true,
  fn: () => {
    if (smallPairs.length >= 1) {
      findAllPaths(smallGraph, smallPairs[0][0], smallPairs[0][1], 3);
    }
  },
});

Deno.bench({
  name: "FindAllPaths: maxLength=4 (small)",
  group: "all-paths",
  fn: () => {
    if (smallPairs.length >= 1) {
      findAllPaths(smallGraph, smallPairs[0][0], smallPairs[0][1], 4);
    }
  },
});

Deno.bench({
  name: "FindAllPaths: maxLength=3 (medium)",
  group: "all-paths",
  fn: () => {
    if (mediumPairs.length >= 1) {
      findAllPaths(mediumGraph, mediumPairs[0][0], mediumPairs[0][1], 3);
    }
  },
});

// ============================================================================
// Benchmarks: Path Weight Calculation
// ============================================================================

// Pre-compute some paths for weight calculation tests
const samplePath = findShortestPath(mediumGraph, mediumPairs[0][0], mediumPairs[0][1]) || [];

Deno.bench({
  name: "PathWeight: calculate (short path)",
  group: "path-weight",
  baseline: true,
  fn: () => {
    if (samplePath.length >= 2) {
      calculatePathWeight(mediumGraph, samplePath);
    }
  },
});

Deno.bench({
  name: "PathWeight: average (short path)",
  group: "path-weight",
  fn: () => {
    if (samplePath.length >= 2) {
      calculateAveragePathWeight(mediumGraph, samplePath);
    }
  },
});

// ============================================================================
// Benchmarks: Has Path Within Hops
// ============================================================================

Deno.bench({
  name: "HasPathWithinHops: maxHops=2 (small)",
  group: "path-hops",
  baseline: true,
  fn: () => {
    if (smallPairs.length >= 1) {
      hasPathWithinHops(smallGraph, smallPairs[0][0], smallPairs[0][1], 2);
    }
  },
});

Deno.bench({
  name: "HasPathWithinHops: maxHops=3 (medium)",
  group: "path-hops",
  fn: () => {
    if (mediumPairs.length >= 1) {
      hasPathWithinHops(mediumGraph, mediumPairs[0][0], mediumPairs[0][1], 3);
    }
  },
});

Deno.bench({
  name: "HasPathWithinHops: maxHops=4 (stress)",
  group: "path-hops",
  fn: () => {
    if (stressPairs.length >= 1) {
      hasPathWithinHops(stressGraph, stressPairs[0][0], stressPairs[0][1], 4);
    }
  },
});

// ============================================================================
// Cleanup
// ============================================================================

globalThis.addEventListener("unload", () => {
  console.log("\nDijkstra Benchmark Summary:");
  console.log(`- Small graph: ${smallGraph.order} nodes, ${smallGraph.size} edges`);
  console.log(`- Medium graph: ${mediumGraph.order} nodes, ${mediumGraph.size} edges`);
  console.log(`- Stress graph: ${stressGraph.order} nodes, ${stressGraph.size} edges`);
  console.log(`- Sample path length: ${samplePath.length} nodes`);
});
