# Algorithm Benchmarks

Comprehensive benchmarking framework for Casys PML graph algorithms.

## Structure

```
tests/benchmarks/
├── fixtures/
│   ├── scenarios/           # Test data (JSON graph definitions)
│   │   ├── small-graph.json    # 10 tools, 3 caps - quick sanity checks
│   │   ├── medium-graph.json   # 50 tools, 10 caps - realistic tests
│   │   └── stress-graph.json   # 200 tools, 30 caps - stress testing
│   └── scenario-loader.ts   # Graph construction from scenarios
├── tactical/                # Tool-level algorithms
│   ├── pagerank.bench.ts       # PageRank centrality
│   ├── louvain.bench.ts        # Louvain community detection
│   ├── adamic-adar.bench.ts    # Adamic-Adar similarity
│   └── local-alpha.bench.ts    # Local Alpha (ADR-048)
├── strategic/               # Capability-level algorithms
│   ├── spectral-clustering.bench.ts  # Spectral clustering
│   ├── capability-match.bench.ts     # Capability matching
│   └── shgat.bench.ts                # SHGAT [PLACEHOLDER]
├── pathfinding/             # Shortest path algorithms
│   ├── dijkstra.bench.ts       # Dijkstra (current)
│   └── dr-dsp.bench.ts         # DR-DSP [PLACEHOLDER]
├── decision/                # Decision-making algorithms
│   └── thompson-sampling.bench.ts  # Thompson Sampling (ADR-049)
├── utils/
│   └── metrics.ts           # Statistical analysis & reporting
└── performance.bench.ts     # Existing system-level benchmarks
```

## Running Benchmarks

### All Benchmarks
```bash
deno bench --allow-all tests/benchmarks/
```

### By Layer
```bash
# Tactical (tool-level)
deno bench --allow-all tests/benchmarks/tactical/

# Strategic (capability-level)
deno bench --allow-all tests/benchmarks/strategic/

# Pathfinding
deno bench --allow-all tests/benchmarks/pathfinding/

# Decision
deno bench --allow-all tests/benchmarks/decision/
```

### Specific Algorithm
```bash
deno bench --allow-all tests/benchmarks/tactical/pagerank.bench.ts
```

### Filter by Group
```bash
# Only PageRank size scaling tests
deno bench --allow-all --filter "pagerank-size" tests/benchmarks/tactical/

# Only comparison benchmarks
deno bench --allow-all --filter "vs" tests/benchmarks/
```

## Algorithm Coverage

### Implemented (Real Benchmarks)

| Layer | Algorithm | File | ADR |
|-------|-----------|------|-----|
| Tactical | PageRank | `tactical/pagerank.bench.ts` | - |
| Tactical | Louvain | `tactical/louvain.bench.ts` | - |
| Tactical | Adamic-Adar | `tactical/adamic-adar.bench.ts` | ADR-041 |
| Tactical | Local Alpha | `tactical/local-alpha.bench.ts` | ADR-048 |
| Strategic | Spectral Clustering | `strategic/spectral-clustering.bench.ts` | Story 7.4 |
| Strategic | Capability Match | `strategic/capability-match.bench.ts` | ADR-038 |
| Pathfinding | Dijkstra | `pathfinding/dijkstra.bench.ts` | ADR-041 |
| Decision | Thompson Sampling | `decision/thompson-sampling.bench.ts` | ADR-049 |

### Planned (Placeholder Benchmarks)

| Layer | Algorithm | File | Spike |
|-------|-----------|------|-------|
| Strategic | SHGAT | `strategic/shgat.bench.ts` | `2025-12-17-superhypergraph` |
| Pathfinding | DR-DSP | `pathfinding/dr-dsp.bench.ts` | `2025-12-21-capability-pathfinding` |

Placeholder benchmarks are marked with `ignore: true`. Enable them when the algorithm is implemented.

## Benchmark Groups

Each benchmark file defines groups for related tests:

- **Size scaling**: How performance changes with graph size
- **Parameter variations**: Impact of algorithm parameters
- **Weighted vs unweighted**: Edge weight impact
- **Comparison**: Algorithm A vs Algorithm B

## Scenarios

### small-graph.json
- 10 tools, 3 capabilities
- Quick validation, CI/CD integration
- Expected runtime: < 1s

### medium-graph.json
- 50 tools, 10 capabilities, 3 meta-capabilities
- Realistic usage patterns
- Expected runtime: < 10s

### stress-graph.json
- 200 tools, 30 capabilities, 5 meta-capabilities
- Generated via `scenario-loader.ts`
- Performance regression detection
- Expected runtime: < 60s

## Metrics & Reporting

The `utils/metrics.ts` module provides:

```typescript
import { MetricsCollector, compareAlgorithms, generateReport } from "./utils/metrics.ts";

const collector = new MetricsCollector();

// Time operations
await collector.time("dijkstra", "medium-graph", 1, async () => {
  await findShortestPath(graph, from, to);
});

// Aggregate results
const stats = collector.aggregate("dijkstra", "medium-graph");
// { meanMs, medianMs, stdDevMs, minMs, maxMs, p95Ms, p99Ms }

// Compare algorithms
const comparison = compareAlgorithms(dijkstraStats, drDspStats);
// { speedupFactor, significantDifference, winner, pValue }

// Generate markdown report
const report = generateReport([comparison1, comparison2]);
```

## Adding New Benchmarks

1. Create benchmark file in appropriate layer directory
2. Use `Deno.bench()` with descriptive names and groups
3. Load scenarios with `loadScenario()` or generate with `generateStressGraph()`
4. Add baseline marker (`baseline: true`) to reference tests
5. Update this README

Example:
```typescript
import { loadScenario, buildGraphFromScenario } from "../fixtures/scenario-loader.ts";

const scenario = await loadScenario("medium-graph");
const graph = buildGraphFromScenario(scenario);

Deno.bench({
  name: "MyAlgo: medium graph",
  group: "myalgo-size",
  baseline: true,
  fn: () => {
    myAlgorithm(graph);
  },
});
```

## Related Documentation

- [ADR-038: Scoring Algorithms Reference](../../docs/adrs/ADR-038-scoring-algorithms-reference.md)
- [ADR-041: Edge Weights](../../docs/adrs/ADR-041-hierarchical-trace-tracking.md)
- [ADR-048: Local Alpha](../../docs/adrs/ADR-048-local-adaptive-alpha.md)
- [ADR-049: Intelligent Thresholds](../../docs/adrs/ADR-049-intelligent-adaptive-thresholds.md)
- [Spike: DR-DSP + SHGAT](../../docs/spikes/2025-12-21-capability-pathfinding-dijkstra.md)
