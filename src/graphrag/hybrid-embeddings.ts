/**
 * Hybrid Embeddings Module
 *
 * Combines BGE-M3 semantic embeddings with Node2Vec graph embeddings
 * for improved capability retrieval in SHGAT.
 *
 * Optimal config from benchmarks:
 * - 30% BGE (semantic) + 70% Node2Vec (graph structure)
 * - Node2Vec: walkLength=15, walksPerNode=40, windowSize=5, dim=64
 *
 * @module graphrag/hybrid-embeddings
 */

import * as log from "@std/log";

// ============================================================================
// Types
// ============================================================================

export interface Capability {
  id: string;
  embedding: number[];      // BGE-M3 1024-dim
  toolsUsed: string[];
}

export interface HybridEmbeddingConfig {
  /** Weight for BGE semantic embedding (0-1). Default: 0.3 */
  bgeWeight: number;

  /** Node2Vec random walk length. Default: 15 */
  walkLength: number;

  /** Number of random walks per node. Default: 40 */
  walksPerNode: number;

  /** Co-occurrence window size. Default: 5 */
  windowSize: number;

  /** Node2Vec embedding dimension. Default: 64 */
  embeddingDim: number;
}

export const DEFAULT_CONFIG: HybridEmbeddingConfig = {
  bgeWeight: 0.3,
  walkLength: 15,
  walksPerNode: 40,
  windowSize: 5,
  embeddingDim: 64,
};

// ============================================================================
// Node2Vec Generator
// ============================================================================

/**
 * Generate Node2Vec embeddings from capability-tool bipartite graph.
 *
 * Algorithm:
 * 1. Build bipartite graph (capabilities <-> tools)
 * 2. Generate random walks from each capability
 * 3. Build co-occurrence matrix from walks
 * 4. Compute PMI (Pointwise Mutual Information)
 * 5. SVD factorization for embeddings
 */
export class Node2VecGenerator {
  private config: HybridEmbeddingConfig;
  private graph: Map<string, Set<string>> = new Map(); // adjacency list
  private capabilityIds: string[] = [];
  private toolIds: string[] = [];

  constructor(config: Partial<HybridEmbeddingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Build bipartite graph from capabilities
   */
  buildGraph(capabilities: Capability[]): void {
    this.graph.clear();
    this.capabilityIds = [];
    this.toolIds = [];

    const allTools = new Set<string>();

    // Add capability nodes
    for (const cap of capabilities) {
      this.capabilityIds.push(cap.id);
      this.graph.set(cap.id, new Set(cap.toolsUsed));

      for (const tool of cap.toolsUsed) {
        allTools.add(tool);
      }
    }

    // Add tool nodes with reverse edges
    this.toolIds = [...allTools];
    for (const tool of this.toolIds) {
      const connectedCaps = new Set<string>();
      for (const cap of capabilities) {
        if (cap.toolsUsed.includes(tool)) {
          connectedCaps.add(cap.id);
        }
      }
      this.graph.set(tool, connectedCaps);
    }

    log.debug(`Node2Vec graph: ${this.capabilityIds.length} caps, ${this.toolIds.length} tools`);
  }

  /**
   * Generate random walk starting from a node
   */
  private randomWalk(startNode: string, length: number): string[] {
    const walk = [startNode];
    let current = startNode;

    for (let i = 0; i < length - 1; i++) {
      const neighbors = this.graph.get(current);
      if (!neighbors || neighbors.size === 0) break;

      const neighborList = [...neighbors];
      current = neighborList[Math.floor(Math.random() * neighborList.length)];
      walk.push(current);
    }

    return walk;
  }

  /**
   * Build co-occurrence matrix from random walks
   */
  private buildCooccurrenceMatrix(): number[][] {
    const { walkLength, walksPerNode, windowSize } = this.config;
    const n = this.capabilityIds.length;

    // Initialize co-occurrence counts
    const cooc: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));

    // Map capability ID to index
    const capIdx = new Map<string, number>();
    this.capabilityIds.forEach((id, i) => capIdx.set(id, i));

    // Generate walks and count co-occurrences
    for (let capIndex = 0; capIndex < n; capIndex++) {
      const capId = this.capabilityIds[capIndex];

      for (let w = 0; w < walksPerNode; w++) {
        const walk = this.randomWalk(capId, walkLength);

        // Count co-occurrences within window
        for (let i = 0; i < walk.length; i++) {
          const iIdx = capIdx.get(walk[i]);
          if (iIdx === undefined) continue;

          for (let j = Math.max(0, i - windowSize); j < Math.min(walk.length, i + windowSize + 1); j++) {
            if (i === j) continue;
            const jIdx = capIdx.get(walk[j]);
            if (jIdx !== undefined) {
              cooc[iIdx][jIdx]++;
            }
          }
        }
      }
    }

    return cooc;
  }

  /**
   * Compute PMI (Pointwise Mutual Information) matrix
   */
  private computePMI(cooc: number[][]): number[][] {
    const n = cooc.length;

    // Total co-occurrences
    let total = 0;
    const rowSums = cooc.map(row => {
      const sum = row.reduce((a, b) => a + b, 0);
      total += sum;
      return sum;
    });

    const colSums = Array(n).fill(0);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        colSums[j] += cooc[i][j];
      }
    }

    // Compute PMI
    const pmi: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));

    if (total === 0) return pmi;

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (cooc[i][j] > 0 && rowSums[i] > 0 && colSums[j] > 0) {
          const pxy = cooc[i][j] / total;
          const px = rowSums[i] / total;
          const py = colSums[j] / total;
          const pmiVal = Math.log(pxy / (px * py));
          pmi[i][j] = Math.max(0, pmiVal); // Positive PMI
        }
      }
    }

    return pmi;
  }

  /**
   * Simple SVD approximation using power iteration
   * (Avoids external dependency on ml-matrix for production)
   */
  private svdApprox(matrix: number[][], k: number): number[][] {
    const n = matrix.length;
    if (n === 0) return [];

    const dim = Math.min(k, n);
    const result: number[][] = Array(n).fill(0).map(() => Array(dim).fill(0));

    // Power iteration for top-k singular vectors
    for (let d = 0; d < dim; d++) {
      // Random initial vector
      let v = Array(n).fill(0).map(() => Math.random() - 0.5);

      // Power iteration (10 iterations)
      for (let iter = 0; iter < 10; iter++) {
        // Multiply by A^T * A
        const temp = Array(n).fill(0);
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            temp[i] += matrix[i][j] * v[j];
          }
        }

        // Normalize
        const norm = Math.sqrt(temp.reduce((s, x) => s + x * x, 0)) || 1;
        v = temp.map(x => x / norm);
      }

      // Compute singular value
      let sigma = 0;
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let j = 0; j < n; j++) {
          sum += matrix[i][j] * v[j];
        }
        sigma += sum * sum;
      }
      sigma = Math.sqrt(sigma);

      // Store scaled singular vector
      for (let i = 0; i < n; i++) {
        result[i][d] = v[i] * Math.sqrt(sigma);
      }

      // Deflate matrix for next singular vector
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          matrix[i][j] -= sigma * v[i] * v[j];
        }
      }
    }

    return result;
  }

  /**
   * Generate Node2Vec embeddings for all capabilities
   */
  generate(capabilities: Capability[]): Map<string, number[]> {
    const { embeddingDim } = this.config;

    // Build graph
    this.buildGraph(capabilities);

    if (this.capabilityIds.length === 0) {
      return new Map();
    }

    // Generate co-occurrence matrix
    const cooc = this.buildCooccurrenceMatrix();

    // Compute PMI
    const pmi = this.computePMI(cooc);

    // SVD factorization
    const embeddings = this.svdApprox(pmi, embeddingDim);

    // Normalize and store
    const result = new Map<string, number[]>();

    for (let i = 0; i < this.capabilityIds.length; i++) {
      const emb = embeddings[i] || Array(embeddingDim).fill(0);

      // Normalize
      const norm = Math.sqrt(emb.reduce((s, v) => s + v * v, 0)) || 1;
      result.set(this.capabilityIds[i], emb.map(v => v / norm));
    }

    log.debug(`Generated ${result.size} Node2Vec embeddings (${embeddingDim} dims)`);
    return result;
  }
}

// ============================================================================
// Hybrid Embedding Combiner
// ============================================================================

/**
 * Combine BGE and Node2Vec embeddings
 */
export class HybridEmbeddingGenerator {
  private config: HybridEmbeddingConfig;
  private node2vec: Node2VecGenerator;

  constructor(config: Partial<HybridEmbeddingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.node2vec = new Node2VecGenerator(this.config);
  }

  /**
   * Generate hybrid embeddings for capabilities
   *
   * @param capabilities - Capabilities with BGE embeddings
   * @returns Capabilities with hybrid embeddings (same structure)
   */
  generate(capabilities: Capability[]): Capability[] {
    const { bgeWeight, embeddingDim } = this.config;
    const n2vWeight = 1 - bgeWeight;

    // Generate Node2Vec embeddings
    const n2vEmbeddings = this.node2vec.generate(capabilities);

    // Combine embeddings
    return capabilities.map(cap => {
      const bgeEmb = cap.embedding;
      const n2vEmb = n2vEmbeddings.get(cap.id) || Array(embeddingDim).fill(0);

      // Pad N2V to 1024 dims to match BGE
      const n2vPadded = [...n2vEmb, ...Array(1024 - n2vEmb.length).fill(0)];

      // Weighted combination
      const hybrid = bgeEmb.map((v, i) => v * bgeWeight + n2vPadded[i] * n2vWeight);

      // Normalize
      const norm = Math.sqrt(hybrid.reduce((s, v) => s + v * v, 0)) || 1;

      return {
        ...cap,
        embedding: hybrid.map(v => v / norm),
      };
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): HybridEmbeddingConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Factory function for easy use
// ============================================================================

/**
 * Create hybrid embeddings from capabilities with BGE embeddings
 *
 * @example
 * ```typescript
 * const caps = await loadCapabilitiesFromDB();
 * const hybridCaps = createHybridEmbeddings(caps, { bgeWeight: 0.3 });
 * const shgat = createSHGATFromCapabilities(hybridCaps, ...);
 * ```
 */
export function createHybridEmbeddings(
  capabilities: Capability[],
  config: Partial<HybridEmbeddingConfig> = {},
): Capability[] {
  const generator = new HybridEmbeddingGenerator(config);
  return generator.generate(capabilities);
}

/**
 * Quick test to verify the module works
 */
export function selfTest(): boolean {
  const testCaps: Capability[] = [
    { id: "cap1", embedding: Array(1024).fill(0.1), toolsUsed: ["tool_a", "tool_b"] },
    { id: "cap2", embedding: Array(1024).fill(0.2), toolsUsed: ["tool_b", "tool_c"] },
    { id: "cap3", embedding: Array(1024).fill(0.3), toolsUsed: ["tool_a", "tool_c"] },
  ];

  try {
    const result = createHybridEmbeddings(testCaps);

    // Verify output
    if (result.length !== 3) return false;
    if (result[0].embedding.length !== 1024) return false;

    // Verify normalization
    const norm = Math.sqrt(result[0].embedding.reduce((s, v) => s + v * v, 0));
    if (Math.abs(norm - 1) > 0.01) return false;

    log.info("HybridEmbeddings self-test passed");
    return true;
  } catch (e) {
    log.error(`HybridEmbeddings self-test failed: ${e}`);
    return false;
  }
}
