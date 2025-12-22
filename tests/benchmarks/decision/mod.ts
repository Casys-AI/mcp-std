/**
 * Decision Layer Benchmarks
 *
 * Benchmarks for decision-making algorithms:
 * - Thompson Sampling (ADR-049: Intelligent Adaptive Thresholds)
 *
 * Run all decision benchmarks:
 * deno bench --allow-all tests/benchmarks/decision/
 *
 * @module tests/benchmarks/decision
 */

// Export benchmark modules for programmatic access
export * from "./thompson-sampling.bench.ts";
