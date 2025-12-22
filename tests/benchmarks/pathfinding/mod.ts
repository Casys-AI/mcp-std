/**
 * Pathfinding Benchmarks
 *
 * Benchmarks for shortest path algorithms:
 * - Dijkstra (current implementation)
 * - DR-DSP (placeholder for hypergraph pathfinding)
 *
 * Run all pathfinding benchmarks:
 * deno bench --allow-all tests/benchmarks/pathfinding/
 *
 * @module tests/benchmarks/pathfinding
 */

// Export benchmark modules for programmatic access
export * from "./dijkstra.bench.ts";
export * from "./dr-dsp.bench.ts";
