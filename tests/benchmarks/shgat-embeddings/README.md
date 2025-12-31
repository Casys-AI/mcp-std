# SHGAT Embedding Benchmarks

Benchmarks comparing different embedding strategies for SHGAT capability retrieval.

## Quick Start

```bash
# Run the tuning benchmark (recommended)
deno run --allow-all tests/benchmarks/shgat-embeddings/hybrid-node2vec-tuning.bench.ts

# Run graph embeddings comparison
deno run --allow-all tests/benchmarks/shgat-embeddings/graph-embeddings.bench.ts
```

## Files

| File | Description |
|------|-------------|
| `hybrid-node2vec-tuning.bench.ts` | **Main benchmark** - tunes Hybrid BGE+Node2Vec parameters |
| `graph-embeddings.bench.ts` | Compares BGE, Spectral, Node2Vec, and Hybrid strategies |
| `embedding-strategies.bench.ts` | Simplified embedding comparisons (Tool Co-occurrence, Jaccard) |
| `embedding-strategies-50caps.bench.ts` | 50-cap subset for faster iteration |
| `shgat-diagnostic.ts` | Debug tool for score variance analysis |
| `shgat-prod-bench.ts` | Basic SHGAT benchmark with production traces |

## Best Configuration (2024-12-31)

**Hybrid BGE+Node2Vec** with optimal parameters:

```typescript
const config = {
  bgeWeight: 0.5,        // 50% semantic (BGE-M3)
  walkLength: 15,        // Random walk length
  walksPerNode: 40,      // Walks per capability
  windowSize: 5,         // Co-occurrence window
  embeddingDim: 64,      // Node2Vec embedding dimensions
};
```

### Results

| Metric | Value | vs Baseline |
|--------|-------|-------------|
| MRR | 0.355 | **+757%** |
| Hit@1 | 33.3% | +33.3pp |
| Hit@3 | 33.3% | +33.3pp |

### Strategy Comparison

| Strategy | MRR | Hit@1 | Hit@3 |
|----------|-----|-------|-------|
| BGE-M3 (baseline) | 0.041 | 0% | 0% |
| Spectral (Laplacian) | 0.044 | 0% | 0% |
| Node2Vec (RandomWalk) | 0.114 | 0% | 5.6% |
| Hybrid (BGE+Spectral) | 0.083 | 0% | 5.6% |
| **Hybrid (BGE+Node2Vec)** | **0.355** | **33.3%** | **33.3%** |

## Key Findings

1. **Graph structure > Semantics**: Node2Vec random walks capture capability relationships better than BGE-M3 semantic embeddings for retrieval tasks.

2. **Hybrid is best**: Combining semantic (BGE) with structural (Node2Vec) embeddings gives optimal results.

3. **Optimal ratio is 50/50**: Equal weight to BGE and Node2Vec outperforms BGE-heavy configurations.

4. **Embedding dimension matters**: dim=64 with the right walk parameters significantly outperforms smaller dimensions.

5. **More walks = better PMI**: `walksPerNode=40` provides enough co-occurrence signal for robust PMI matrix.

## Implementation Notes

The Node2Vec implementation uses:
- Bipartite graph (capabilities <-> tools)
- Random walks from each capability
- PMI (Pointwise Mutual Information) matrix from co-occurrences
- SVD factorization for dimensionality reduction

Spectral uses normalized Laplacian eigendecomposition on the same bipartite graph.
