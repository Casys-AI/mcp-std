/**
 * Tactical Layer Benchmarks
 *
 * Benchmarks for tool-level graph algorithms:
 * - PageRank centrality
 * - Louvain community detection
 * - Adamic-Adar similarity
 * - Local Alpha calculator (ADR-048)
 *
 * Run all tactical benchmarks:
 * deno bench --allow-all tests/benchmarks/tactical/
 *
 * @module tests/benchmarks/tactical
 */

// Export benchmark modules for programmatic access
export * from "./pagerank.bench.ts";
export * from "./louvain.bench.ts";
export * from "./adamic-adar.bench.ts";
export * from "./local-alpha.bench.ts";
