/**
 * Strategic Layer Benchmarks
 *
 * Benchmarks for capability-level graph algorithms:
 * - Spectral Clustering (bipartite Tool-Capability)
 * - Capability Match (semantic * reliability)
 * - SHGAT (placeholder for learned attention)
 *
 * Run all strategic benchmarks:
 * deno bench --allow-all tests/benchmarks/strategic/
 *
 * @module tests/benchmarks/strategic
 */

// Export benchmark modules for programmatic access
export * from "./spectral-clustering.bench.ts";
export * from "./capability-match.bench.ts";
export * from "./shgat.bench.ts";
