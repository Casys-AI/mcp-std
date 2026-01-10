# ADR-060: Hard Negative Mining et PER Curriculum Learning

## Status
Accepted

## Date
2025-01-09

## Context

Le training SHGAT utilise l'InfoNCE loss avec des negatives pour apprendre à discriminer les bonnes capabilities/tools des mauvaises. L'efficacité du training dépend fortement de la qualité des negatives sélectionnés.

### Problème observé

Avec une sélection naive de negatives (random ou P25-P75 basé sur similarité intent), on observait:
- `priority=[0.000-0.900]` - le minimum à 0 indiquait des exemples "trop faciles"
- TD error ≈ 0 pour certains exemples = le modèle discrimine sans effort
- Pas d'apprentissage réel sur ces exemples

### Analyse root cause

1. **Anchor sim = 1.0**: L'embedding de capability EST l'intent embedding (même vecteur stocké dans `workflow_pattern.intent_embedding`)

2. **P25-P75 = outils non liés**:
   - P25-P75 de similarité intent = sim ~0.62-0.68
   - Anchor a sim = 1.0
   - Gap de 0.32-0.38 → trivial à discriminer

3. **Exemple concret**:
   - Intent: "database query postgres sql"
   - Anchor: `psql_query` (sim=1.0)
   - P25-P75 negatives: `docker_compose_up`, `array_group` (sim~0.65)
   - Le modèle voit facilement que `psql_query` est plus pertinent

## Decision

### 1. Hard Negative Mining (P25-P75 avec PER)

Utiliser le range classique P25-P75 mais laisser le **PER (Prioritized Experience Replay)** faire le curriculum learning automatiquement:

```typescript
// Adaptive thresholds: P25-P75 for semi-hard range
let SEMI_HARD_MIN = percentile(allSims, 25);
let SEMI_HARD_MAX = percentile(allSims, 75);
```

### 2. PER Curriculum Learning

Le PER gère naturellement la difficulté progressive:

```
1. Début: tous exemples à maxPriority
2. Exemples faciles → TD error bas → priority basse → moins samplés
3. Exemples durs → TD error haut → priority haute → plus samplés
4. Decay → ramène vers moyenne → évite starvation
```

**Formules PER:**
- Priority: `p_i = |TD_error_i| + ε`
- Sampling: `P(i) = p_i^α / Σ p_j^α`
- IS weights: `w_i = (N * P(i))^(-β)` (corrige le biais)
- Beta annealing: `β: 0.4 → 1.0` over epochs

### 5. PER Epsilon et Decay

**Epsilon = 0.01** (floor minimum):
```typescript
const DEFAULT_PER_CONFIG: PERConfig = {
  alpha: 0.6,
  beta: 0.4,
  epsilon: 0.01, // Minimum priority floor (prevents starvation)
  maxPriority: 1.0,
};
```

**Decay toward mean** (après chaque epoch):
```typescript
// Dans train-worker.ts
perBuffer.decayPriorities(0.9);

// Dans per-buffer.ts
decayPriorities(decay: number = 0.95): void {
  const mean = this.priorities.reduce((a, b) => a + b, 0) / this.priorities.length;
  for (let i = 0; i < this.priorities.length; i++) {
    this.priorities[i] = this.priorities[i] * decay + mean * (1 - decay);
  }
}
```

**Grow implicite**: Les priorités augmentent naturellement quand TD error est élevé via `updatePriorities()`.

Résultat observé: `priority=[0.082-0.973]` - plus de minimum à 0.000

### 3. Tools Exclus du Negative Pool (Updated 2026-01-09)

**Décision finale**: Les tools sont **complètement exclus** du negative pool. Seules les capabilities sont utilisées comme negatives.

```typescript
// per-training.ts & initializer.ts
// Tools are NOT added to allEmbeddings for negative sampling
// Only capabilities are used as negatives to avoid mixing entity types
const allEmbeddings = new Map<string, number[]>();
for (const [capId, cap] of capabilities) {
  if (cap.embedding) allEmbeddings.set(capId, cap.embedding);
}
// Note: tools are NOT added - only capabilities
```

**Raisonnement**:
1. **Types différents**: On entraîne à ranker des *capabilities*, pas des tools. Un tool n'est pas une "mauvaise capability", c'est un autre type d'entité.
2. **Faux négatifs**: Le tool `std:psql_query` a un embedding similaire à la capability `db:postgresQuery` qui l'utilise. En le mettant en négatif, on pénalise le modèle pour quelque chose de sémantiquement correct.
3. **Signal contrastif brouillé**: L'apprentissage devrait être "intent X → capability A > capability B", pas "capability A > tool T".

**Résultat**: Accuracy 49% (vs 0-3% avant) après 20 epochs.

**Code legacy deprecated**:
```typescript
// @deprecated - Tool clusters no longer needed since tools are excluded from negatives
// Keeping empty map for backward compatibility with traceToTrainingExamples signature
const toolClusters = new Map<string, Set<string>>();
```

### 4. IS Weights dans le Training

Les IS weights sont appliqués au loss ET aux gradients:

```typescript
// Loss weighted by IS
totalLoss += -Math.log(softmax[0] + 1e-7) * isWeight;

// Gradients weighted by IS
const dLossPos = (softmax[0] - 1) / TEMPERATURE * isWeight;
const dLossNeg = softmax[i + 1] / TEMPERATURE * isWeight;
```

### 6. Live Training Epochs

Le live training (après chaque exécution) utilise maintenant **3 epochs** au lieu de 1 pour permettre au PER de faire son curriculum learning intra-session:

```typescript
// post-execution.service.ts & train-shgat.use-case.ts
{
  minTraces: 1,
  maxTraces: 50,
  batchSize: 16,
  epochs: 3, // Live mode: 3 epochs for PER curriculum learning
}
```

**Pourquoi 3 epochs ?**
- 1 epoch: Le PER ne fait qu'un seul cycle decay → pas de curriculum
- 3 epochs: Permet β annealing (0.4 → 0.6 → 0.8) et priority redistribution
- 5+ epochs: Réservé au batch training (startup) avec plus de données

**Deux niveaux de curriculum learning:**
1. **Intra-session** (PER dans worker): Priorités example-level sur 3 epochs
2. **Inter-session** (DB priorities): Traces priorités persistées entre sessions

## Alternatives considérées

### A. Hard-only (P85-P95)
- **Pro**: Force le modèle à apprendre les distinctions fines
- **Con**: Accuracy collapse (0.51), peut être trop dur
- **Verdict**: Rejeté - pas de curriculum learning

### B. Gap-based filtering
- Sélectionner negatives où `|sim(neg) - sim(anchor)| < 0.15`
- **Con**: Anchor sim = 1.0, donc ça sélectionne sim > 0.85
- **Verdict**: Équivalent à P85-P95, mêmes problèmes

### C. Stratified sampling
```
2 negatives P50-P70 (medium)
4 negatives P70-P85 (medium-hard)
2 negatives P85-P95 (hard)
```
- **Pro**: Mix explicite de difficultés
- **Con**: Plus complexe, le PER fait déjà ça implicitement
- **Verdict**: À considérer si PER insuffisant

### D. Adaptive Percentiles
Ajuster les percentiles dynamiquement basé sur accuracy:
```typescript
if (accuracy < 0.50) {
  percentileMin -= 3; // easier
} else if (accuracy > 0.65 && minPriority > 0.05) {
  percentileMin += 2; // harder
}
```
- **Pro**: Auto-tuning
- **Con**: Complexité, risque d'oscillation
- **Verdict**: Spike futur

## Conséquences

### Positives
- Priority min > 0 (plus d'exemples "gratuits")
- PER peut faire son travail de curriculum learning
- Ranking amélioré (`psql_query` #1 pour "postgres sql")

### Négatives
- Dépend du bon fonctionnement du PER
- Nécessite assez d'epochs pour que le PER converge

### Métriques à surveiller
- `priority=[min-max]`: min devrait être > 0.01
- `accuracy`: devrait augmenter progressivement
- `β`: devrait atteindre ~1.0 en fin de training
- Ranking test queries: vérifier que les outils attendus sont top-ranked

### 7. Health Check et Early Stopping

Pour détecter le "catastrophic forgetting" pendant le live training, un health check est effectué après chaque epoch :

```typescript
// train-worker.ts
// Split 80% train / 20% test
const testSetSize = Math.max(1, Math.floor(shuffled.length * 0.2));
const testSet = shuffled.slice(0, testSetSize);
const trainSet = shuffled.slice(testSetSize);

// Après chaque epoch
const testResult = shgat.trainBatchV1KHeadBatched(testSet, weights, true); // evaluateOnly=true
const testAccuracy = testResult.accuracy;

// Détecter dégradation > 15% depuis baseline
if (dropFromBaseline > DEGRADATION_THRESHOLD) {
  console.error("⚠️ DEGRADATION DETECTED - Early stopping");
  break;
}
```

**Métriques loggées par epoch :**
```
[SHGAT Worker] Health check baseline: testAcc=0.65
[SHGAT Worker] Health check epoch 1: testAcc=0.62, Δbaseline=-4.6%, Δlast=-4.6%
[SHGAT Worker] Health check epoch 2: testAcc=0.58, Δbaseline=-10.8%, Δlast=-6.5%
```

**Output inclut :**
```typescript
healthCheck: {
  baselineAccuracy: number;
  finalAccuracy: number;
  degradationDetected: boolean;
  earlyStopEpoch?: number;
}
```

### 8. Curriculum Learning sur Negatives (Implémenté 2026-01-10)

En plus du PER (qui gère le curriculum sur *quels exemples* sampler), on implémente un curriculum sur *quels negatives* utiliser par exemple.

**Mécanisme (v2 - ALL negatives):**
- On stocke **TOUS les negatives** triés par similarité descending (hard → easy) dans `allNegativesSorted`
- Avec ~400 capabilities, chaque exemple a ~399 negatives disponibles
- À chaque epoch, le train-worker **shuffle-sample 8** du tier approprié

**Tiers dynamiques:**
```typescript
// train-worker.ts
const total = ex.allNegativesSorted.length;  // ~399
const tierSize = Math.floor(total / 3);       // ~133 per tier

// accuracy < 0.35: easy negatives (last third)
// accuracy > 0.55: hard negatives (first third)
// else: medium negatives (middle third)
let tierStart: number;
if (prevAccuracy < 0.35) {
  tierStart = tierSize * 2; // Easy
} else if (prevAccuracy > 0.55) {
  tierStart = 0;            // Hard
} else {
  tierStart = tierSize;     // Medium
}

const tier = ex.allNegativesSorted.slice(tierStart, tierStart + tierSize);
ex.negativeCapIds = shuffle(tier).slice(0, NUM_NEGATIVES); // Sample 8 random
```

**Constante centralisée dans types.ts:**
```typescript
export const NUM_NEGATIVES = 8; // Negatives samplés par exemple
```

**Flow complet:**
1. `per-training.ts` / `initializer.ts`: Stockent TOUS les negatives triés (hard → easy)
2. Default `negativeCapIds` = sample du middle tier
3. `train-worker.ts`: À chaque epoch, shuffle-sample 8 du tier basé sur accuracy
4. PER: Gère en parallèle le curriculum sur quels *exemples* sampler

**Avantages v2:**
- **100% couverture**: Tous les negatives disponibles (vs 24 avant)
- **Diversité**: Shuffle-sampling → différents 8 negatives chaque epoch
- **Scalable**: Fonctionne avec n'importe quel nombre de capabilities
- **Double curriculum**: PER (exemples) + tiers (negatives)

**Rationale:**
- **Progression naturelle**: Débute avec negatives medium, passe aux hard quand accuracy > 55%
- **Recovery**: Si accuracy chute < 35%, revient aux negatives faciles pour stabiliser
- **Exploration**: Le shuffle garantit que le modèle voit des negatives variés

## Spikes futurs

1. **Benchmark script**: Tester systématiquement différentes configs
2. ~~**Adaptive percentiles**~~: Remplacé par curriculum sur negatives
3. **Stratified sampling**: Mix explicite de difficultés
4. ~~**Curriculum scheduling**~~: ✅ Implémenté (section 8)

## References

- [Prioritized Experience Replay (Schaul et al., 2015)](https://arxiv.org/abs/1511.05952)
- [FaceNet: Triplet Loss and Semi-hard Mining](https://arxiv.org/abs/1503.03832)
- [InfoNCE / Contrastive Learning](https://arxiv.org/abs/1807.03748)
- ADR-053: SHGAT Subprocess PER Training
- ADR-056: InfoNCE Contrastive Training
