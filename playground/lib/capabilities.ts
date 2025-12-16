/**
 * Playground Capabilities Helper (Story 3.1)
 *
 * Exposes the real CapabilityStore, CapabilityMatcher, and AdaptiveThresholdManager
 * for use in notebooks. Uses PGlite in-memory database for playground isolation.
 *
 * Key features:
 * - Lazy singleton initialization (created on first access)
 * - Mock embedding model fallback if BGE-M3 loading fails
 * - resetPlaygroundState() for clean state between demos
 *
 * @module playground/lib/capabilities
 */

// Use mod.ts barrel exports for clean package-ready imports
import { createClient, MigrationRunner, getAllMigrations } from "../../src/db/mod.ts";
import { CapabilityStore, CapabilityMatcher } from "../../src/capabilities/mod.ts";
import { AdaptiveThresholdManager } from "../../src/mcp/mod.ts";
import type { EmbeddingModelInterface } from "../../src/vector/embeddings.ts";
import type { EmbeddingModel } from "../../src/vector/embeddings.ts";
// Type import for return type annotation
import type { PGliteClient } from "../../src/db/client.ts";
import { getLogger } from "../../src/telemetry/mod.ts";

const logger = getLogger("default");

// ============================================================================
// Types
// ============================================================================

export interface PlaygroundStatus {
  /** Whether using real or mock embedding model */
  embeddingModel: "real" | "mock";
  /** Whether database is initialized */
  databaseReady: boolean;
  /** Whether CapabilityStore is available */
  storeReady: boolean;
  /** Whether CapabilityMatcher is available */
  matcherReady: boolean;
  /** Whether AdaptiveThresholdManager is available */
  thresholdReady: boolean;
  /** Number of capabilities in the store (if available) */
  capabilityCount?: number;
}

// ============================================================================
// Constants
// ============================================================================

/** BGE-M3 embedding dimension (1024-dimensional vectors) */
const EMBEDDING_DIMENSION = 1024;

// ============================================================================
// Lazy Singletons
// ============================================================================

let _db: PGliteClient | null = null;
let _embeddingModel: EmbeddingModelInterface | null = null;
let _store: CapabilityStore | null = null;
let _matcher: CapabilityMatcher | null = null;
let _thresholdManager: AdaptiveThresholdManager | null = null;
let _isRealEmbedding = false;
let _initPromise: Promise<void> | null = null;

// ============================================================================
// Mock Embedding Model
// ============================================================================

/**
 * Mock embedding model that generates deterministic pseudo-embeddings from text hash.
 * Used as fallback when BGE-M3 model loading fails or takes too long.
 *
 * Note: Mock embeddings are NOT semantically meaningful but provide consistent
 * behavior for testing and demos without network dependencies.
 *
 * Implements EmbeddingModelInterface for type-safe compatibility with CapabilityStore.
 */
export class MockEmbeddingModel implements EmbeddingModelInterface {
  private loaded = false;

  async load(): Promise<void> {
    this.loaded = true;
  }

  /**
   * Generate a deterministic embedding from text hash.
   * Same text always produces the same embedding (deterministic).
   */
  async encode(text: string): Promise<number[]> {
    // Use SHA-256 to generate deterministic hash
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = new Uint8Array(hashBuffer);

    // Generate EMBEDDING_DIMENSION-dimensional embedding from hash
    const embedding = new Array<number>(EMBEDDING_DIMENSION);
    for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
      // Cycle through hash bytes and normalize to [-1, 1]
      embedding[i] = (hashArray[i % hashArray.length] / 255) * 2 - 1;
    }

    return embedding;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  async dispose(): Promise<void> {
    this.loaded = false;
  }
}

// ============================================================================
// Initialization Helpers
// ============================================================================

/**
 * Initialize the in-memory database with all migrations.
 */
async function initDatabase(): Promise<PGliteClient> {
  if (_db) return _db;

  const db = createClient(":memory:");
  await db.connect();

  // Run all migrations
  const runner = new MigrationRunner(db);
  const migrations = getAllMigrations();
  await runner.runUp(migrations);

  _db = db;
  return db;
}

/**
 * Initialize the embedding model.
 * Tries to load real BGE-M3 model, falls back to mock if it fails.
 *
 * @param timeout - Timeout in ms for real model loading (default: 30s)
 */
async function initEmbeddingModel(timeout = 30000): Promise<EmbeddingModelInterface> {
  if (_embeddingModel) return _embeddingModel;

  // Try to load real model with timeout
  try {
    const { EmbeddingModel: RealEmbeddingModel } = await import("../../src/vector/embeddings.ts");
    const realModel = new RealEmbeddingModel();

    // Race between loading and timeout
    const loadPromise = realModel.load();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Model loading timeout")), timeout)
    );

    await Promise.race([loadPromise, timeoutPromise]);

    _embeddingModel = realModel;
    _isRealEmbedding = true;
    logger.info("Real BGE-M3 embedding model loaded for playground");
    return realModel;
  } catch (error) {
    logger.warn(
      `BGE-M3 model loading failed (${error instanceof Error ? error.message : String(error)}), using mock`
    );

    // Fallback to mock
    const mockModel = new MockEmbeddingModel();
    await mockModel.load();
    _embeddingModel = mockModel;
    _isRealEmbedding = false;
    return mockModel;
  }
}

/**
 * Initialize all components (database, embedding, store, matcher, threshold).
 * Called automatically by getter functions.
 */
async function ensureInitialized(): Promise<void> {
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const db = await initDatabase();
    const embedding = await initEmbeddingModel();

    // Create CapabilityStore
    // Cast required: CapabilityStore expects concrete EmbeddingModel class,
    // but both real model and MockEmbeddingModel implement EmbeddingModelInterface
    _store = new CapabilityStore(db, embedding as EmbeddingModel);

    // Create AdaptiveThresholdManager with demo-friendly config
    _thresholdManager = new AdaptiveThresholdManager(
      {
        initialExplicitThreshold: 0.5,
        initialSuggestionThreshold: 0.7,
        learningRate: 0.1, // Faster learning for demos
        minThreshold: 0.4,
        maxThreshold: 0.9,
        windowSize: 10, // Smaller window for visible changes in demos
      },
      db
    );

    // Create CapabilityMatcher
    _matcher = new CapabilityMatcher(_store, _thresholdManager);
  })();

  return _initPromise;
}

// ============================================================================
// Public API - Getters
// ============================================================================

/**
 * Get the CapabilityStore instance (lazy initialization).
 *
 * @returns Promise resolving to the real CapabilityStore connected to PGlite in-memory
 *
 * @example
 * ```typescript
 * const store = await getCapabilityStore();
 * const capability = await store.saveCapability({
 *   code: "const x = 1;",
 *   intent: "Initialize x to 1",
 *   durationMs: 100,
 * });
 * ```
 */
export async function getCapabilityStore(): Promise<CapabilityStore> {
  await ensureInitialized();
  return _store!;
}

/**
 * Get the CapabilityMatcher instance (lazy initialization).
 *
 * @returns Promise resolving to the real CapabilityMatcher
 *
 * @example
 * ```typescript
 * const matcher = await getCapabilityMatcher();
 * const match = await matcher.findMatch("Initialize a variable");
 * if (match) {
 *   console.log(`Found: ${match.capability.codeSnippet}`);
 * }
 * ```
 */
export async function getCapabilityMatcher(): Promise<CapabilityMatcher> {
  await ensureInitialized();
  return _matcher!;
}

/**
 * Get the AdaptiveThresholdManager instance (lazy initialization).
 *
 * @returns Promise resolving to the real AdaptiveThresholdManager
 *
 * @example
 * ```typescript
 * const manager = await getAdaptiveThresholdManager();
 * manager.recordExecution({ success: true, confidence: 0.85 });
 * const thresholds = manager.getThresholds();
 * console.log(`Suggestion threshold: ${thresholds.suggestionThreshold}`);
 * ```
 */
export async function getAdaptiveThresholdManager(): Promise<AdaptiveThresholdManager> {
  await ensureInitialized();
  return _thresholdManager!;
}

/**
 * Get the raw PGliteClient for advanced usage.
 *
 * @returns Promise resolving to the in-memory PGliteClient
 */
export async function getDatabase(): Promise<PGliteClient> {
  await ensureInitialized();
  return _db!;
}

/**
 * Get the embedding model (real or mock).
 *
 * @returns Promise resolving to the embedding model implementing EmbeddingModelInterface
 */
export async function getEmbeddingModel(): Promise<EmbeddingModelInterface> {
  await ensureInitialized();
  return _embeddingModel!;
}

// ============================================================================
// Public API - Reset & Status
// ============================================================================

/**
 * Reset playground state - clears all singletons for fresh demos.
 *
 * Call this at the beginning of a notebook section that needs clean state.
 * After reset, the next getter call will reinitialize everything.
 *
 * @example
 * ```typescript
 * // Beginning of demo section
 * await resetPlaygroundState();
 *
 * // Start fresh
 * const store = await getCapabilityStore();
 * // Store is empty now
 * ```
 */
export async function resetPlaygroundState(): Promise<void> {
  // Dispose embedding model if real
  if (_embeddingModel && _isRealEmbedding) {
    try {
      await _embeddingModel.dispose();
    } catch {
      // Ignore dispose errors
    }
  }

  // Close database connection
  if (_db) {
    try {
      await _db.close();
    } catch {
      // Ignore close errors
    }
  }

  // Clear all singletons
  _db = null;
  _embeddingModel = null;
  _store = null;
  _matcher = null;
  _thresholdManager = null;
  _isRealEmbedding = false;
  _initPromise = null;

  logger.debug("Playground state reset");
}

/**
 * Check if the playground is using real system components vs mocks.
 *
 * @returns true if using real BGE-M3 embedding model
 *
 * @example
 * ```typescript
 * if (await isRealSystemAvailable()) {
 *   console.log("Using real BGE-M3 embeddings (semantic search works)");
 * } else {
 *   console.log("Using mock embeddings (deterministic but not semantic)");
 * }
 * ```
 */
export async function isRealSystemAvailable(): Promise<boolean> {
  await ensureInitialized();
  return _isRealEmbedding;
}

/**
 * Get detailed status of playground components.
 *
 * **Note:** This function triggers initialization if components are not already
 * initialized. All singletons (database, embedding model, stores) will be created
 * on first call.
 *
 * @returns Status object with component availability details
 *
 * @example
 * ```typescript
 * const status = await getPlaygroundStatus();
 * console.log(`Embedding: ${status.embeddingModel}`);
 * console.log(`Capabilities: ${status.capabilityCount}`);
 * ```
 */
export async function getPlaygroundStatus(): Promise<PlaygroundStatus> {
  await ensureInitialized();

  let capabilityCount: number | undefined;
  try {
    // Try to get count from the store
    if (_store && _db) {
      const result = await _db.query(
        "SELECT COUNT(*) as count FROM workflow_pattern"
      );
      const row = result[0] as { count: string } | undefined;
      capabilityCount = parseInt(row?.count ?? "0", 10);
    }
  } catch {
    // Table might not exist yet
  }

  return {
    embeddingModel: _isRealEmbedding ? "real" : "mock",
    databaseReady: _db !== null,
    storeReady: _store !== null,
    matcherReady: _matcher !== null,
    thresholdReady: _thresholdManager !== null,
    capabilityCount,
  };
}

// ============================================================================
// CLI Entry Point (for testing)
// ============================================================================

if (import.meta.main) {
  console.log("🧪 Testing Playground Capabilities Helper\n");

  // Initialize and check status
  const status = await getPlaygroundStatus();
  console.log("📊 Status:", JSON.stringify(status, null, 2));

  // Test capability store
  const store = await getCapabilityStore();
  console.log("\n✓ CapabilityStore ready");

  // Save a test capability
  const capability = await store.saveCapability({
    code: 'const greeting = "Hello, World!";',
    intent: "Create a greeting message",
    durationMs: 50,
    success: true,
  });
  console.log(`✓ Saved capability: ${capability.id.substring(0, 8)}...`);

  // Search for it
  const results = await store.searchByIntent("greeting message", 1);
  console.log(`✓ Search found ${results.length} result(s)`);

  // Get matcher
  const matcher = await getCapabilityMatcher();
  console.log(`✓ CapabilityMatcher ready (has findMatch: ${typeof matcher.findMatch === "function"})`);

  // Get threshold manager
  const thresholds = await getAdaptiveThresholdManager();
  console.log("✓ AdaptiveThresholdManager ready");
  console.log(`  Thresholds: ${JSON.stringify(thresholds.getThresholds())}`);

  // Reset state
  await resetPlaygroundState();
  console.log("\n✓ State reset - testing reinit...");

  // Verify clean state
  const status2 = await getPlaygroundStatus();
  console.log(`✓ After reset, capability count: ${status2.capabilityCount}`);

  console.log("\n🎉 All tests passed!");
}
