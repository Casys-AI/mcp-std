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
 *   epochs: 1,      // 1 for live, 3-5 for batch
 *   batchSize: 16,
 *   databaseUrl: process.env.DATABASE_URL,
 * });
 * ```
 *
 * @module graphrag/algorithms/shgat/train-worker
 */

import { createSHGATFromCapabilities, type TrainingExample } from "../shgat.ts";
import { initBlasAcceleration } from "./utils/math.ts";
import { PERBuffer, annealBeta } from "./training/per-buffer.ts";
import postgres from "postgres";

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
  // Initialize BLAS acceleration for training (ADR-058)
  const blasAvailable = await initBlasAcceleration();
  console.error(`[SHGAT Worker] BLAS: ${blasAvailable ? "enabled (OpenBLAS)" : "disabled (JS fallback)"}`);

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
    // Create SHGAT from capabilities
    const shgat = createSHGATFromCapabilities(input.capabilities);

    // Import existing params for incremental training (live/PER mode)
    if (input.existingParams) {
      shgat.importParams(input.existingParams);
    }

    // Train with PER: prioritized sampling based on TD errors
    const { epochs, batchSize } = input.config;
    const numBatchesPerEpoch = Math.ceil(input.examples.length / batchSize);
    console.error(
      `[SHGAT Worker] Starting PER training: ${input.examples.length} examples, ${epochs} epochs, ` +
      `batch_size=${batchSize}, ${numBatchesPerEpoch} batches/epoch, ${input.capabilities.length} capabilities`
    );

    // Initialize PER buffer with all examples
    const perBuffer = new PERBuffer(input.examples, {
      alpha: 0.6,    // Priority exponent (0=uniform, 1=full prioritization)
      beta: 0.4,     // IS weight exponent (annealed to 1.0)
      epsilon: 1e-6, // Small constant for non-zero priorities
    });

    let finalLoss = 0;
    let finalAccuracy = 0;
    let lastEpochTdErrors: number[] = [];

    for (let epoch = 0; epoch < epochs; epoch++) {
      // Anneal beta from 0.4 to 1.0 over training (reduces bias correction over time)
      const beta = annealBeta(epoch, epochs, 0.4);

      let epochLoss = 0;
      let epochAccuracy = 0;
      let epochBatches = 0;
      const epochTdErrors: number[] = [];
      const allIndices: number[] = [];
      const allTdErrors: number[] = [];

      const progressInterval = Math.max(1, Math.floor(numBatchesPerEpoch / 10));

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

        // Progress log every ~10% of batches
        if (epochBatches % progressInterval === 0 || epochBatches === numBatchesPerEpoch) {
          const pct = Math.round((epochBatches / numBatchesPerEpoch) * 100);
          const avgLoss = epochLoss / epochBatches;
          const avgAcc = epochAccuracy / epochBatches;
          console.error(
            `[SHGAT Worker] Epoch ${epoch} progress: ${pct}% (${epochBatches}/${numBatchesPerEpoch} batches, loss=${avgLoss.toFixed(4)}, acc=${avgAcc.toFixed(2)})`
          );
        }
      }

      // Update priorities based on TD errors from this epoch
      perBuffer.updatePriorities(allIndices, allTdErrors);
      const stats = perBuffer.getStats();

      finalLoss = epochLoss / epochBatches;
      finalAccuracy = epochAccuracy / epochBatches;
      lastEpochTdErrors = epochTdErrors;

      console.error(
        `[SHGAT Worker] Epoch ${epoch}: loss=${finalLoss.toFixed(4)}, acc=${finalAccuracy.toFixed(2)}, ` +
        `priority=[${stats.min.toFixed(3)}-${stats.max.toFixed(3)}], β=${beta.toFixed(2)}`
      );
    }

    // Save params directly to DB if URL provided
    let savedToDb = false;
    if (input.databaseUrl) {
      try {
        console.error(`[SHGAT Worker] Exporting params...`);
        const params = shgat.exportParams();
        console.error(`[SHGAT Worker] Params exported, keys: ${Object.keys(params).join(", ")}`);
        savedToDb = await saveParamsToDb(input.databaseUrl, params);
        console.error(`[SHGAT Worker] Params saved to DB`);
      } catch (e) {
        console.error(`[SHGAT Worker] Failed to save params to DB: ${e}`);
        // Continue - training still succeeded, params just couldn't be saved
      }
    } else {
      console.error(`[SHGAT Worker] No databaseUrl provided, skipping DB save`);
    }

    // Output lightweight status to stdout (no params - they're in the DB)
    const output: WorkerOutput = {
      success: true,
      finalLoss,
      finalAccuracy,
      tdErrors: lastEpochTdErrors,
      savedToDb,
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
