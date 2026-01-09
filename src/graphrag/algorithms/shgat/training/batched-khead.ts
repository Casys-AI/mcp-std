/**
 * Batched K-Head Training Module
 *
 * Batched versions of K-head scoring and backprop for efficient training.
 * Instead of processing examples one-by-one, we batch all intent embeddings
 * and use BLAS matrix operations for massive speedup.
 *
 * Key insight: Message passing (graph structure) is the SAME for all examples.
 * Only the intent embeddings differ. So we:
 * 1. Run message passing ONCE to get capability embeddings
 * 2. Batch all intent projections: [batch × hidden] = [batch × 1024] @ W_intent^T
 * 3. Batch K-head forward: Q_batch = [batch × scoringDim] = IntentBatch @ W_q^T
 * 4. Score all caps for all intents using batched matmuls
 *
 * @module graphrag/algorithms/shgat/training/batched-khead
 */

import type { HeadParams } from "../initialization/parameters.ts";
import type { SHGATConfig } from "../types.ts";
import * as math from "../utils/math.ts";
import type { KHeadGradientAccumulators } from "./multi-level-trainer-khead.ts";

// ============================================================================
// Types
// ============================================================================

/**
 * Cache for batched K-head forward pass
 */
export interface BatchedKHeadCache {
  /** Batched Q vectors: [batch × scoringDim] */
  Q_batch: number[][];
  /** K vectors per capability: capId → [scoringDim] */
  K_caps: Map<string, number[]>;
  /** Projected intents: [batch × hidden] */
  intentsBatched: number[][];
}

/**
 * Batched scoring result
 */
export interface BatchedScoringResult {
  /** Scores per example per capability: [batch][capIdx] */
  scores: number[][];
  /** Logits per example per capability: [batch][capIdx] */
  logits: number[][];
  /** Cache for backward pass */
  cache: BatchedKHeadCache;
}

// ============================================================================
// Batched Forward Pass
// ============================================================================

/**
 * Project batch of intents through W_intent
 *
 * @param intents Batch of intent embeddings: [batch × embeddingDim]
 * @param W_intent Projection matrix: [hiddenDim × embeddingDim]
 * @returns Projected intents: [batch × hiddenDim]
 */
export function batchProjectIntents(
  intents: number[][],
  W_intent: number[][],
): number[][] {
  // [batch × embedding] @ [embedding × hidden]^T = [batch × hidden]
  // Using matmulTranspose: A @ B^T where B = W_intent
  return math.matmulTranspose(intents, W_intent);
}

/**
 * Compute batched Q vectors for one head
 *
 * Q_batch = IntentsBatched @ W_q^T
 *
 * @param intentsBatched Projected intents: [batch × hidden]
 * @param W_q Query projection: [scoringDim × hidden]
 * @returns Q_batch: [batch × scoringDim]
 */
export function batchComputeQ(
  intentsBatched: number[][],
  W_q: number[][],
): number[][] {
  // [batch × hidden] @ [hidden × scoringDim]^T = [batch × scoringDim]
  return math.matmulTranspose(intentsBatched, W_q);
}

/**
 * Compute K vector for a capability
 *
 * K = W_k @ capEmbedding
 *
 * @param capEmbedding Capability embedding: [hidden]
 * @param W_k Key projection: [scoringDim × hidden]
 * @returns K: [scoringDim]
 */
export function computeK(
  capEmbedding: number[],
  W_k: number[][],
): number[] {
  return math.matVecBlas(W_k, capEmbedding);
}

/**
 * Score batch of intents against one capability
 *
 * scores = sigmoid(Q_batch @ K / sqrt(dim))
 *
 * @param Q_batch Batched Q vectors: [batch × scoringDim]
 * @param K Key vector for capability: [scoringDim]
 * @returns Scores and logits: [batch]
 */
export function batchScoreAgainstCap(
  Q_batch: number[][],
  K: number[],
): { scores: number[]; logits: number[] } {
  const scoringDim = K.length;
  const scale = Math.sqrt(scoringDim);

  const scores: number[] = [];
  const logits: number[] = [];

  for (const Q of Q_batch) {
    const dotQK = math.dot(Q, K);
    const logit = dotQK / scale;
    const score = math.sigmoid(logit);
    logits.push(logit);
    scores.push(score);
  }

  return { scores, logits };
}

/**
 * Batched K-head forward pass for one head
 *
 * Computes scores for all examples against all capabilities efficiently.
 *
 * @param intentsBatched Projected intents: [batch × hidden]
 * @param capEmbeddings Map of capId → embedding
 * @param headParams Head parameters (W_q, W_k)
 * @returns Scores and caches
 */
export function batchedKHeadForwardOneHead(
  intentsBatched: number[][],
  capEmbeddings: Map<string, number[]>,
  headParams: HeadParams,
): {
  scores: Map<string, number[]>; // capId → [batch scores]
  logits: Map<string, number[]>; // capId → [batch logits]
  Q_batch: number[][];
  K_caps: Map<string, number[]>;
} {
  // Compute Q for all examples: [batch × scoringDim]
  const Q_batch = batchComputeQ(intentsBatched, headParams.W_q);

  // Compute K for all capabilities and score
  const scores = new Map<string, number[]>();
  const logits = new Map<string, number[]>();
  const K_caps = new Map<string, number[]>();

  for (const [capId, capEmb] of capEmbeddings) {
    const K = computeK(capEmb, headParams.W_k);
    K_caps.set(capId, K);

    const { scores: capScores, logits: capLogits } = batchScoreAgainstCap(Q_batch, K);
    scores.set(capId, capScores);
    logits.set(capId, capLogits);
  }

  return { scores, logits, Q_batch, K_caps };
}

/**
 * Full batched K-head forward pass (all heads)
 *
 * @param intents Original intent embeddings: [batch × embeddingDim]
 * @param W_intent Intent projection: [hidden × embedding]
 * @param capEmbeddings Map of capId → embedding (from message passing)
 * @param headParams Array of head parameters
 * @param config SHGAT config
 * @returns Average scores across heads and cache for backward
 */
export function batchedKHeadForward(
  intents: number[][],
  W_intent: number[][],
  capEmbeddings: Map<string, number[]>,
  headParams: HeadParams[],
  config: SHGATConfig,
): {
  scores: Map<string, number[]>; // capId → [batch avg scores]
  logits: Map<string, number[]>; // capId → [batch avg logits]
  cache: {
    intentsBatched: number[][];
    Q_batches: number[][][]; // [head][batch][scoringDim]
    K_caps: Map<string, number[][]>; // capId → [head][scoringDim]
  };
} {
  const batchSize = intents.length;
  const { numHeads } = config;

  // Project all intents: [batch × hidden]
  const intentsBatched = batchProjectIntents(intents, W_intent);

  // Store per-head results
  const perHeadScores: Map<string, number[][]> = new Map(); // capId → [head][batch]
  const perHeadLogits: Map<string, number[][]> = new Map();
  const Q_batches: number[][][] = [];
  const K_caps_all: Map<string, number[][]> = new Map();

  // Initialize maps
  for (const capId of capEmbeddings.keys()) {
    perHeadScores.set(capId, []);
    perHeadLogits.set(capId, []);
    K_caps_all.set(capId, []);
  }

  // Forward through all heads
  for (let h = 0; h < numHeads; h++) {
    const { scores, logits, Q_batch, K_caps } = batchedKHeadForwardOneHead(
      intentsBatched,
      capEmbeddings,
      headParams[h],
    );

    Q_batches.push(Q_batch);

    for (const [capId, capScores] of scores) {
      perHeadScores.get(capId)!.push(capScores);
      perHeadLogits.get(capId)!.push(logits.get(capId)!);
      K_caps_all.get(capId)!.push(K_caps.get(capId)!);
    }
  }

  // Average across heads
  const avgScores = new Map<string, number[]>();
  const avgLogits = new Map<string, number[]>();

  for (const [capId, headScoresArr] of perHeadScores) {
    const avgS: number[] = new Array(batchSize).fill(0);
    const avgL: number[] = new Array(batchSize).fill(0);
    const headLogitsArr = perHeadLogits.get(capId)!;

    for (let h = 0; h < numHeads; h++) {
      for (let b = 0; b < batchSize; b++) {
        avgS[b] += headScoresArr[h][b] / numHeads;
        avgL[b] += headLogitsArr[h][b] / numHeads;
      }
    }

    avgScores.set(capId, avgS);
    avgLogits.set(capId, avgL);
  }

  return {
    scores: avgScores,
    logits: avgLogits,
    cache: {
      intentsBatched,
      Q_batches,
      K_caps: K_caps_all,
    },
  };
}

// ============================================================================
// Batched Backward Pass
// ============================================================================

/**
 * Backward through K-head scoring (InfoNCE path)
 *
 * Accumulates gradients for W_q, W_k across examples.
 * Optimized for small batches (typical: batch=1 per call).
 *
 * @param dLogits Gradient of loss w.r.t. logits: [batch]
 * @param Q_batch Q vectors: [batch × scoringDim]
 * @param K K vector for this cap: [scoringDim]
 * @param intentsBatched Projected intents: [batch × hidden]
 * @param capEmbedding Capability embedding: [hidden]
 * @param headParams Head parameters
 * @param grads Gradient accumulators
 * @param headIdx Head index
 * @returns Gradients w.r.t. intentsBatched and capEmbedding
 */
export function batchedBackpropKHeadLogit(
  dLogits: number[],
  Q_batch: number[][],
  K: number[],
  intentsBatched: number[][],
  capEmbedding: number[],
  headParams: HeadParams,
  grads: KHeadGradientAccumulators,
  headIdx: number,
): {
  dIntentsBatched: number[][];
  dCapEmbedding: number[];
} {
  const scoringDim = K.length;
  const scale = Math.sqrt(scoringDim);
  const batchSize = dLogits.length;
  const hiddenDim = intentsBatched[0]?.length ?? 0;

  const dIntentsBatched: number[][] = [];
  const dCapEmbeddingAccum = new Array(hiddenDim).fill(0);

  for (let b = 0; b < batchSize; b++) {
    const dLogit = dLogits[b];
    const Q = Q_batch[b];
    const intent = intentsBatched[b];

    // dLoss/d(Q·K) = dLogit / √dim
    const dDotQK = dLogit / scale;

    // Gradients w.r.t. Q and K
    const dQ = K.map((k) => dDotQK * k);
    const dK = Q.map((q) => dDotQK * q);

    // Accumulate W_q gradient: dW_q += dQ ⊗ intent
    math.outerProductAdd(grads.dW_q[headIdx], dQ, intent);

    // Accumulate W_k gradient: dW_k += dK ⊗ capEmb
    math.outerProductAdd(grads.dW_k[headIdx], dK, capEmbedding);

    // Gradient w.r.t. intentProjected: dIntent = W_q^T @ dQ
    const dIntent = math.matVecTransposeBlas(headParams.W_q, dQ);
    dIntentsBatched.push(dIntent);

    // Accumulate gradient w.r.t. capEmbedding: dCap = W_k^T @ dK
    const dCap = math.matVecTransposeBlas(headParams.W_k, dK);
    for (let j = 0; j < hiddenDim; j++) {
      dCapEmbeddingAccum[j] += dCap[j] ?? 0;
    }
  }

  return {
    dIntentsBatched,
    dCapEmbedding: dCapEmbeddingAccum,
  };
}

/**
 * Backward through W_intent projection
 *
 * dW_intent += Σ dIntentProjected[b] ⊗ intentOriginal[b]
 *
 * @param dIntentsBatched Gradients: [batch × hidden]
 * @param intentsOriginal Original intents: [batch × embedding]
 * @param dW_intent Gradient accumulator: [hidden × embedding]
 */
export function batchedBackpropWIntent(
  dIntentsBatched: number[][],
  intentsOriginal: number[][],
  dW_intent: number[][],
): void {
  for (let b = 0; b < dIntentsBatched.length; b++) {
    math.outerProductAdd(dW_intent, dIntentsBatched[b], intentsOriginal[b]);
  }
}
