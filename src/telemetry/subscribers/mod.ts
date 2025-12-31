/**
 * Algorithm Event Subscribers
 *
 * EventBus-centric architecture for algorithm decision handling.
 *
 * Usage:
 * ```typescript
 * import { initAlgorithmSubscribers, stopAlgorithmSubscribers } from "./subscribers/mod.ts";
 *
 * // On startup
 * await initAlgorithmSubscribers(db);
 *
 * // On shutdown
 * await stopAlgorithmSubscribers();
 * ```
 *
 * @module telemetry/subscribers
 */

import type { DbClient } from "../../db/types.ts";
import { AlgorithmDBSubscriber } from "./db-subscriber.ts";
import { AlgorithmOTELSubscriber } from "./otel-subscriber.ts";
import { getLogger } from "../logger.ts";

const logger = getLogger("default");

// Singleton instances
let dbSubscriber: AlgorithmDBSubscriber | null = null;
let otelSubscriber: AlgorithmOTELSubscriber | null = null;

/**
 * Initialize all algorithm event subscribers
 *
 * Call this during application startup after DB is ready.
 */
export function initAlgorithmSubscribers(db: DbClient): void {
  if (dbSubscriber || otelSubscriber) {
    logger.warn("Algorithm subscribers already initialized");
    return;
  }

  // Initialize DB subscriber
  dbSubscriber = new AlgorithmDBSubscriber(db);
  dbSubscriber.start();

  // Initialize OTEL subscriber (only active if OTEL enabled)
  otelSubscriber = new AlgorithmOTELSubscriber();
  otelSubscriber.start();

  logger.info("Algorithm subscribers initialized");
}

/**
 * Stop all algorithm event subscribers
 *
 * Call this during application shutdown.
 */
export async function stopAlgorithmSubscribers(): Promise<void> {
  if (dbSubscriber) {
    await dbSubscriber.stop();
    dbSubscriber = null;
  }

  if (otelSubscriber) {
    otelSubscriber.stop();
    otelSubscriber = null;
  }

  logger.info("Algorithm subscribers stopped");
}

/**
 * Get the DB subscriber instance (for testing/debugging)
 */
export function getDBSubscriber(): AlgorithmDBSubscriber | null {
  return dbSubscriber;
}

/**
 * Get the OTEL subscriber instance (for testing/debugging)
 */
export function getOTELSubscriber(): AlgorithmOTELSubscriber | null {
  return otelSubscriber;
}

// Re-export subscriber classes for direct use if needed
export { AlgorithmDBSubscriber } from "./db-subscriber.ts";
export { AlgorithmOTELSubscriber } from "./otel-subscriber.ts";
