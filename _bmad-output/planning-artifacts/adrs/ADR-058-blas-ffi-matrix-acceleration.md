# ADR-058: BLAS FFI Matrix Acceleration for SHGAT Scoring

## Status
**Accepted** - 2025-01-09 (Updated 2026-01-09: PER training, batched forward, tuned thresholds)

## Context

Les commandes `discover` et `suggestion` de PML étaient lentes (~210ms pour scorer 105 capabilities). Le profiling a identifié le K-head scoring comme bottleneck principal :

```
Pour chaque query:
  Q = W_q @ intent        # [64] = [64×1024] @ [1024]
  Pour chaque capability (105×):
    K = W_k @ cap_emb     # [64] = [64×1024] @ [1024]
    score = Q·K / √64

Total: ~55M opérations multiply-add par query
```

JavaScript n'a pas d'accès natif aux instructions SIMD du CPU, ce qui limite les performances des opérations matricielles.

## Decision

Implémenter une chaîne d'optimisations progressives :

### 1. Q Precompute (-40%)
Calculer Q une seule fois par query au lieu de le recalculer pour chaque capability.

```typescript
// Avant: 840× (8 heads × 105 caps)
for (cap of caps) {
  for (head of heads) {
    Q = W_q @ intent  // Redondant!
    K = W_k @ cap
  }
}

// Après: 8×
const precomputedQ = precomputeQForAllHeads(intent);
for (cap of caps) {
  scores = computeWithPrecomputedQ(precomputedQ, cap);
}
```

### 2. Batch K Computation (-12% supplémentaire)
Remplacer N petits matmuls par 1 gros matmul par head.

```typescript
// Avant: 105 petits matmuls
for (cap of caps) K[cap] = W_k @ cap_emb

// Après: 1 gros matmul
K_all = E @ W_k.T  // [105×1024] @ [1024×64] = [105×64]
```

### 3. OpenBLAS via Deno FFI (-87% supplémentaire)
Utiliser `Deno.dlopen()` pour appeler OpenBLAS directement, bénéficiant des optimisations SIMD (AVX2/AVX-512).

```typescript
// src/graphrag/algorithms/shgat/utils/blas-ffi.ts
const blasLib = Deno.dlopen("/lib/x86_64-linux-gnu/libopenblas.so.0", {
  cblas_sgemm: {
    parameters: ["i32", "i32", "i32", ...],
    result: "void",
  },
});

export function blasMatmul(A: number[][], B: number[][]): number[][] {
  // Flatten to Float32Array
  // Call cblas_sgemm
  // Unflatten result
}
```

## Architecture

### K-head Scoring Path (Phase 1)
```
┌─────────────────────────────────────────────────────────┐
│                    scoreAllCapabilities()                │
├─────────────────────────────────────────────────────────┤
│  1. precomputeQForAllHeads(intent)     [8 small matmuls]│
│  2. batchComputeKForAllHeads(E)        [8 large matmuls]│
│  3. batchComputeScores(Q, K_all)       [dot products]   │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                      math.matmul()                       │
├─────────────────────────────────────────────────────────┤
│  if (isBlasReady() && matrix.large)                     │
│    → blasModule.blasMatmul()  ← OpenBLAS FFI            │
│  else                                                    │
│    → matmulJS()               ← Pure JS fallback        │
└─────────────────────────────────────────────────────────┘
```

### Training + Message Passing Path (Phase 2)
```
┌─────────────────────────────────────────────────────────┐
│              K-head Training Backward Pass              │
├─────────────────────────────────────────────────────────┤
│  1. matVecBlas(W_q, intent)      [cblas_sgemv]          │
│  2. outerProductAdd(dW_q, dQ, intent) [cblas_sger]      │
│  3. matVecTransposeBlas(W_q, dQ) [cblas_sgemv + Trans]  │
└─────────────────────────────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────┐
│              Message Passing Backward                   │
├─────────────────────────────────────────────────────────┤
│  Forward:  H_proj = matmulTranspose(H, W_source)        │
│  Backward: dW = matmulTranspose(transpose(dH_proj), H)  │
│            dH = matmul(dH_proj, W_source)               │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                   blas-ffi.ts (FFI Layer)               │
├─────────────────────────────────────────────────────────┤
│  Deno.dlopen("libopenblas.so.0")                        │
│  cblas_sgemm(...)   ← Matrix multiply (scoring)         │
│  cblas_sgemv(...)   ← Matrix-vector (forward/backprop)  │
│  cblas_sger(...)    ← Outer product (gradient accum)    │
└─────────────────────────────────────────────────────────┘
```

## Résultats

### Benchmarks (105 capabilities, 58 tools, 8 heads)

| Étape | scoreAllCapabilities | scoreAllTools | Gain cumulé |
|-------|---------------------|---------------|-------------|
| Original | 210ms | 116ms | 1x |
| + Q precompute | 125ms | 68ms | 1.7x |
| + Batch K | 110ms | 60ms | 1.9x |
| + **OpenBLAS FFI** | **14.1ms** | **11.3ms** | **15x** |

### Throughput

| Métrique | Avant | Après |
|----------|-------|-------|
| Capabilities/sec | 4.8 | **70.7** |
| Tools/sec | 8.6 | **88.3** |

### Message Passing Operations (Phase 2)

| Opération | Dimensions | Temps |
|-----------|------------|-------|
| matmulTranspose forward | [105×1024] @ [64×1024]^T | **1.81ms** |
| matmul backward | [105×64] @ [64×1024] | **2.03ms** |
| Gradient accumulation | transpose + matmulTranspose | **0.56ms** |

## Fichiers modifiés

### Phase 1: K-head Scoring
- `src/graphrag/algorithms/shgat.ts` - Batch scoring methods
- `src/graphrag/algorithms/shgat/utils/math.ts` - BLAS integration
- `src/graphrag/algorithms/shgat/utils/blas-ffi.ts` - FFI wrapper (nouveau)

### Phase 2: Training + Message Passing (Extended)
- `src/graphrag/algorithms/shgat/training/multi-level-trainer-khead.ts` - BLAS pour K-head backprop
- `src/graphrag/algorithms/shgat/message-passing/vertex-to-edge-phase.ts` - BLAS backward
- `src/graphrag/algorithms/shgat/message-passing/edge-to-vertex-phase.ts` - BLAS backward
- `src/graphrag/algorithms/shgat/message-passing/edge-to-edge-phase.ts` - BLAS backward

### Integration
- `src/infrastructure/patterns/factory/algorithm-factory.ts` - Init BLAS at app startup
- `src/graphrag/algorithms/shgat/train-worker.ts` - Init BLAS in subprocess
- `src/graphrag/algorithms/shgat/spawn-training.ts` - Added `--unstable-ffi` flag
- `deno.json` - Added `--unstable-ffi` to all relevant tasks

## Dépendances

- **Runtime**: `--unstable-ffi` flag requis pour Deno
- **Système**: `libopenblas-dev` (Ubuntu: `apt install libopenblas-dev`)

## Fallback

Si OpenBLAS n'est pas disponible :
1. Le système détecte automatiquement l'absence de la lib
2. Utilise l'implémentation JS pure (batch optimisé)
3. Log un warning au démarrage

```typescript
const blasAvailable = await initBlasAcceleration();
// "[BLAS] Loaded OpenBLAS from: /lib/x86_64-linux-gnu/libopenblas.so.0"
// ou
// "[BLAS] Could not load BLAS library - using JS fallback"
```

## Alternatives considérées

| Option | Pour | Contre |
|--------|------|--------|
| **WASM SIMD** | Portable | 3-5x seulement, overhead mémoire |
| **WebGPU** | 50-100x pour gros batches | Pas stable en Deno serveur |
| **TensorFlow.js Node** | Très optimisé | Dépendance lourde (~200MB) |
| **OpenBLAS FFI** ✓ | 10x, léger, mature | Nécessite lib système |

## Risques et mitigations

| Risque | Mitigation |
|--------|------------|
| OpenBLAS non installé | Fallback JS automatique |
| FFI instable | Flag `--unstable-ffi` explicite |
| Précision float32 | Différence <1e-4, acceptable pour scoring |
| Overhead FFI petites ops | Seuils élevés: 256 pour mat-vec/outer product (voir ci-dessous) |

## Phase 3: PER Training + Batched Forward (2026-01-09)

### Optimisations implémentées

#### 1. Prioritized Experience Replay (PER)
Implémentation complète du PER pour l'entraînement SHGAT:
- Sampling proportionnel à la magnitude des TD errors
- Importance Sampling (IS) weights pour corriger le biais
- Annealing de β (0.4 → 1.0) au cours de l'entraînement

```typescript
// src/graphrag/algorithms/shgat/training/per-buffer.ts
const perBuffer = new PERBuffer(examples, { alpha: 0.6, beta: 0.4 });
const { items, indices, weights } = perBuffer.sample(batchSize, beta);
// ... train ...
perBuffer.updatePriorities(indices, tdErrors);
```

#### 2. Batched Forward Pass
Message passing une seule fois par batch, K-head scoring batché:

```typescript
// src/graphrag/algorithms/shgat/training/batched-khead.ts
// 1. Message passing ONCE → capEmbeddings
// 2. Batch intent projection: [batch × 1024] @ W_intent^T
// 3. Batch Q computation: Q_batch = intents @ W_q^T
// 4. Score all caps for all intents via batched matmuls
```

#### 3. Seuils BLAS optimisés
Les petites opérations (backward pass) sont plus rapides en JS qu'avec FFI overhead:

| Fonction | Seuil original | Seuil optimisé | Raison |
|----------|---------------|----------------|--------|
| `matVecBlas` | 64 rows | **256 rows** | FFI overhead > gain pour petites matrices |
| `matVecTransposeBlas` | 64 rows | **256 rows** | Idem |
| `outerProductAdd` | 64×64 | **256×256** | cblas_sger overhead significatif |
| `matmulTranspose` | 10×64 | 10×64 | Inchangé (grandes matrices) |

### Production Defaults

```typescript
// src/graphrag/algorithms/shgat/spawn-training.ts
epochs: input.epochs ?? 20,    // Avant: 5
batchSize: input.batchSize ?? 64,  // Avant: 16
```

### Résultats Training

| Config | Temps | Accuracy | Loss |
|--------|-------|----------|------|
| Original (per-example) | 2m14s | 87% | - |
| Batched forward only | 1m02s | 87% | - |
| + Fixed BLAS thresholds | **55s** | 88% | 0.19 |
| + 20 epochs, batch=64 | **1m09s** | **93%** | 0.18 |

**Speedup total**: ~2x avec meilleure accuracy

### Fichiers ajoutés/modifiés

- `src/graphrag/algorithms/shgat/training/per-buffer.ts` - PER sampling (nouveau)
- `src/graphrag/algorithms/shgat/training/batched-khead.ts` - Batched K-head ops (nouveau)
- `src/graphrag/algorithms/shgat/utils/math.ts` - Seuils BLAS 64→256
- `src/graphrag/algorithms/shgat/spawn-training.ts` - Defaults epochs=20, batch=64
- `src/graphrag/algorithms/shgat/train-worker.ts` - Intégration PER

## Évolutions futures

1. **Cache W_k transposé** - Éviter `transpose()` à chaque appel
2. **Intel MKL** - Alternative à OpenBLAS pour +20% sur Intel
3. **GPU (WebGPU stable)** - Quand Deno supportera WebGPU serveur
4. ~~**Full training BLAS**~~ - ✅ Fait: seuils optimisés pour éviter overhead FFI
5. ~~**Batched backward pass**~~ - ❌ Testé: overhead FFI > gain pour petits batches (batch=1 par cap)

## References

- [Deno FFI Guide](https://deno.land/manual/runtime/ffi_api)
- [OpenBLAS](https://www.openblas.net/)
- [CBLAS Reference](https://www.netlib.org/blas/)
