/**
 * SHGAT Training Worker
 *
 * Runs in a subprocess to avoid blocking the main event loop.
 * Receives training data via stdin, outputs results via stdout.
 * Saves params directly to DB to avoid V8 string length limits (~150MB JSON).
 *
 * Used for both:
 * - Startup batch training (epochs=3-5, many traces)
 * - Live/PER training (epochs=1, few traces)
 *
 * Usage:
 * ```typescript
 * const result = await spawnSHGATTraining({
 *   capabilities,
 *   examples,
 *   epochs: 3,      // 3 for live (PER curriculum), 5+ for batch
 *   batchSize: 16,
 *   databaseUrl: process.env.DATABASE_URL,
 * });
 * ```
 *
 * @module graphrag/algorithms/shgat/train-worker
 */

import { createSHGATFromCapabilities, generateDefaultToolEmbedding, type TrainingExample } from "../shgat.ts";
import { NUM_NEGATIVES } from "./types.ts";
import { initBlasAcceleration } from "./utils/math.ts";
import { PERBuffer, annealBeta } from "./training/per-buffer.ts";
import { getLogger, setupLogger } from "../../../telemetry/logger.ts";
import postgres from "postgres";

// Logger initialized in main() after setupLogger()
let log: ReturnType<typeof getLogger>;

// Dual logging: both logger and console.error for subprocess visibility
const logInfo = (msg: string) => {
  console.error(msg);
  log?.info(msg);
};
const logWarn = (msg: string) => {
  console.error(msg);
  log?.warn(msg);
};
const logDebug = (msg: string) => {
  console.error(msg);
  log?.debug(msg);
};

interface WorkerInput {
  capabilities: Array<{
    id: string;
    embedding: number[];
    toolsUsed: string[];
    successRate: number;
  }>;
  examples: TrainingExample[];
  config: {
    epochs: number;
    batchSize: number;
  };
  /** Optional: import existing params before training (for live updates) */
  existingParams?: Record<string, unknown>;
  /** Database URL for saving params directly (avoids stdout size limits) */
  databaseUrl?: string;
  /** Additional tools to register (from examples' contextTools not in any capability) */
  additionalTools?: string[];
}

interface WorkerOutput {
  success: boolean;
  finalLoss?: number;
  finalAccuracy?: number;
  /** TD errors for PER priority updates */
  tdErrors?: number[];
  error?: string;
  /** Whether params were saved to DB */
  savedToDb?: boolean;
  /** Health check results per epoch */
  healthCheck?: {
    baselineAccuracy: number;
    finalAccuracy: number;
    degradationDetected: boolean;
    earlyStopEpoch?: number;
  };
}

/**
 * Save SHGAT params directly to PostgreSQL database.
 */
async function saveParamsToDb(
  databaseUrl: string,
  params: Record<string, unknown>,
): Promise<boolean> {
  const sql = postgres(databaseUrl, {
    max: 1, // Single connection for worker
    idle_timeout: 30,
    connect_timeout: 30,
  });

  try {
    // postgres.js auto-serializes objects to JSONB
    // Type error is false positive - same param used twice confuses TS inference
    // deno-lint-ignore no-explicit-any
    const p = params as any;
    await sql`
      INSERT INTO shgat_params (user_id, params, updated_at)
      VALUES ('local', ${p}::jsonb, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        params = ${p}::jsonb,
        updated_at = NOW()
    `;

    return true;
  } finally {
    await sql.end();
  }
}

async function main() {
  // Initialize logger for subprocess (required for Prometheus/file output)
  try {
    await setupLogger({ level: "INFO" });
  } catch (e) {
    // Fallback to console.error if logger setup fails (e.g., file permission issues)
    console.error(`[SHGAT Worker] Logger setup failed: ${e}, using console fallback`);
  }
  // Get logger AFTER setup so handlers are configured
  log = getLogger("default");

  // Initialize BLAS acceleration for training (ADR-058)
  const blasAvailable = await initBlasAcceleration();
  logInfo(`[SHGAT Worker] BLAS: ${blasAvailable ? "enabled (OpenBLAS)" : "disabled (JS fallback)"}`);

  // Read input from stdin
  const decoder = new TextDecoder();
  const chunks: Uint8Array[] = [];

  for await (const chunk of Deno.stdin.readable) {
    chunks.push(chunk);
  }

  // Concatenate chunks efficiently without intermediate array explosion
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  const inputJson = decoder.decode(combined);
  const input: WorkerInput = JSON.parse(inputJson);

  try {
    // Validate input
    if (!input.capabilities || input.capabilities.length === 0) {
      throw new Error("No capabilities provided for training");
    }
    if (!input.examples || input.examples.length === 0) {
      throw new Error("No examples provided for training");
    }

    // Create SHGAT from capabilities
    const shgat = createSHGATFromCapabilities(input.capabilities);

    // Register additional tools from examples (not in any capability's toolsUsed)
    if (input.additionalTools && input.additionalTools.length > 0) {
      const embeddingDim = input.capabilities[0]?.embedding.length || 1024;
      for (const toolId of input.additionalTools) {
        if (!shgat.hasToolNode(toolId)) {
          shgat.registerTool({
            id: toolId,
            embedding: generateDefaultToolEmbedding(toolId, embeddingDim),
          });
        }
      }
    }

    // Import existing params for incremental training (live/PER mode)
    if (input.existingParams) {
      shgat.importParams(input.existingParams);
    }

    // Train with PER: prioritized sampling based on TD errors
    const { epochs, batchSize } = input.config;
    logInfo(
      `[SHGAT Worker] Starting PER training: ${input.examples.length} examples, ${epochs} epochs, ` +
      `batch_size=${batchSize}, ${input.capabilities.length} capabilities`
    );

    // Split examples: 80% train, 20% held-out test set for health check
    const shuffled = [...input.examples].sort(() => Math.random() - 0.5);
    const testSetSize = Math.max(1, Math.floor(shuffled.length * 0.2));
    const testSet = shuffled.slice(0, testSetSize);
    const trainSet = shuffled.slice(testSetSize);

    logInfo(`[SHGAT Worker] Health check: ${testSet.length} test examples, ${trainSet.length} train examples`);

    const numBatchesPerEpoch = Math.ceil(trainSet.length / batchSize);

    // Initialize PER buffer with training examples only
    const perBuffer = new PERBuffer(trainSet, {
      alpha: 0.6,    // Priority exponent (0=uniform, 1=full prioritization)
      beta: 0.4,     // IS weight exponent (annealed to 1.0)
      epsilon: 0.01, // Minimum priority floor (prevents starvation of easy examples)
    });

    let finalLoss = 0;
    let finalAccuracy = 0;
    let lastEpochTdErrors: number[] = [];

    // Health check tracking
    let baselineTestAccuracy = 0;
    let lastTestAccuracy = 0;
    let degradationDetected = false;
    let earlyStopEpoch: number | undefined;
    const DEGRADATION_THRESHOLD = 0.15; // 15% drop from baseline = degradation

    for (let epoch = 0; epoch < epochs; epoch++) {
      // Anneal beta from 0.4 to 1.0 over training (reduces bias correction over time)
      const beta = annealBeta(epoch, epochs, 0.4);

      // Curriculum learning on negatives: sample from dynamic tier based on accuracy
      // allNegativesSorted is sorted descending by similarity (hard → easy)
      // accuracy < 0.35: easy negatives (last third)
      // accuracy > 0.55: hard negatives (first third)
      // else: medium negatives (middle third)
      const prevAccuracy = epoch === 0 ? 0.5 : finalAccuracy; // Start with medium
      const difficulty = prevAccuracy < 0.35 ? "easy" : (prevAccuracy > 0.55 ? "hard" : "medium");

      // Fisher-Yates shuffle helper
      const shuffle = <T>(arr: T[]): T[] => {
        const result = [...arr];
        for (let i = result.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
      };

      // Update negativeCapIds for examples that have allNegativesSorted
      let curriculumUpdated = 0;
      let totalNegs = 0;
      let tierSize = 0;
      for (const ex of trainSet) {
        if (ex.allNegativesSorted && ex.allNegativesSorted.length >= NUM_NEGATIVES * 3) {
          const total = ex.allNegativesSorted.length;
          tierSize = Math.floor(total / 3);
          totalNegs = total;

          // Select tier based on accuracy
          let tierStart: number;
          if (prevAccuracy < 0.35) {
            tierStart = tierSize * 2; // Easy: last third
          } else if (prevAccuracy > 0.55) {
            tierStart = 0; // Hard: first third
          } else {
            tierStart = tierSize; // Medium: middle third
          }

          // Extract tier and shuffle-sample NUM_NEGATIVES from it
          const tier = ex.allNegativesSorted.slice(tierStart, tierStart + tierSize);
          ex.negativeCapIds = shuffle(tier).slice(0, NUM_NEGATIVES);
          curriculumUpdated++;
        }
      }
      if (curriculumUpdated > 0) {
        logInfo(
          `[SHGAT Worker] Curriculum epoch ${epoch}: ${difficulty} tier (${tierSize}/${totalNegs} negs), ` +
          `sampled ${NUM_NEGATIVES}, updated ${curriculumUpdated}/${trainSet.length}, prevAcc=${prevAccuracy.toFixed(2)}`
        );
      }

      let epochLoss = 0;
      let epochAccuracy = 0;
      let epochBatches = 0;
      const epochTdErrors: number[] = [];
      const allIndices: number[] = [];
      const allTdErrors: number[] = [];

      for (let b = 0; b < numBatchesPerEpoch; b++) {
        // Sample batch using PER (prioritized by TD error magnitude)
        const { items: batch, indices, weights: isWeights } = perBuffer.sample(batchSize, beta);

        // Train on batch with IS weight correction (BATCHED version - single forward pass)
        const result = shgat.trainBatchV1KHeadBatched(batch, isWeights);
        epochLoss += result.loss;
        epochAccuracy += result.accuracy;
        epochTdErrors.push(...result.tdErrors);
        epochBatches++;

        // Collect indices and TD errors for priority update
        allIndices.push(...indices);
        allTdErrors.push(...result.tdErrors);
      }

      // Update priorities based on TD errors from this epoch
      perBuffer.updatePriorities(allIndices, allTdErrors);
      // Decay priorities toward mean (prevents starvation of easy examples, allows high priorities to decrease)
      perBuffer.decayPriorities(0.9);
      const stats = perBuffer.getStats();

      finalLoss = epochLoss / epochBatches;
      finalAccuracy = epochAccuracy / epochBatches;
      lastEpochTdErrors = epochTdErrors;

      logInfo(
        `[SHGAT Worker] Epoch ${epoch}: loss=${finalLoss.toFixed(4)}, acc=${finalAccuracy.toFixed(2)}, ` +
        `priority=[${stats.min.toFixed(3)}-${stats.max.toFixed(3)}], β=${beta.toFixed(2)}`
      );

      // Health check: evaluate on held-out test set
      if (testSet.length > 0) {
        const testResult = shgat.trainBatchV1KHeadBatched(testSet, testSet.map(() => 1.0), false); // evaluate only, no gradient
        const testAccuracy = testResult.accuracy;

        if (epoch === 0) {
          baselineTestAccuracy = testAccuracy;
          lastTestAccuracy = testAccuracy;
          logInfo(`[SHGAT Worker] Health check baseline: testAcc=${testAccuracy.toFixed(2)}`);
        } else {
          const dropFromBaseline = baselineTestAccuracy - testAccuracy;
          const dropFromLast = lastTestAccuracy - testAccuracy;

          logInfo(
            `[SHGAT Worker] Health check epoch ${epoch}: testAcc=${testAccuracy.toFixed(2)}, ` +
            `Δbaseline=${(-dropFromBaseline * 100).toFixed(1)}%, Δlast=${(-dropFromLast * 100).toFixed(1)}%`
          );

          // Detect degradation: >15% drop from baseline
          if (dropFromBaseline > DEGRADATION_THRESHOLD) {
            logWarn(
              `[SHGAT Worker] DEGRADATION DETECTED: testAcc dropped ${(dropFromBaseline * 100).toFixed(1)}% from baseline. Early stopping.`
            );
            degradationDetected = true;
            earlyStopEpoch = epoch;
            break; // Early stop
          }

          lastTestAccuracy = testAccuracy;
        }
      }
    }

    // Save params directly to DB if URL provided
    let savedToDb = false;
    if (input.databaseUrl) {
      try {
        logInfo(`[SHGAT Worker] Exporting params...`);
        const params = shgat.exportParams();
        logInfo(`[SHGAT Worker] Params exported, keys: ${Object.keys(params).join(", ")}`);
        savedToDb = await saveParamsToDb(input.databaseUrl, params);
        logInfo(`[SHGAT Worker] Params saved to DB`);
      } catch (e) {
        logWarn(`[SHGAT Worker] Failed to save params to DB: ${e}`);
        // Continue - training still succeeded, params just couldn't be saved
      }
    } else {
      logDebug(`[SHGAT Worker] No databaseUrl provided, skipping DB save`);
    }

    // Output lightweight status to stdout (no params - they're in the DB)
    const output: WorkerOutput = {
      success: true,
      finalLoss,
      finalAccuracy,
      tdErrors: lastEpochTdErrors,
      savedToDb,
      healthCheck: {
        baselineAccuracy: baselineTestAccuracy,
        finalAccuracy: lastTestAccuracy,
        degradationDetected,
        earlyStopEpoch,
      },
    };

    console.log(JSON.stringify(output));
  } catch (error) {
    const output: WorkerOutput = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
    console.log(JSON.stringify(output));
    Deno.exit(1);
  }
}

main();
