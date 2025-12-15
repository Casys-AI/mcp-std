/**
 * Auto-Init Service
 *
 * Automatically runs init when MCP config file changes.
 * Compares file hash with stored hash to detect changes.
 *
 * @module cli/auto-init
 */

import * as log from "@std/log";
import { PGliteClient } from "../db/client.ts";
import { MCPServerDiscovery } from "../mcp/discovery.ts";
import { SchemaExtractor } from "../mcp/schema-extractor.ts";
import { EmbeddingModel, generateEmbeddings } from "../vector/embeddings.ts";
import { hashFile, MCP_CONFIG_HASH_KEY } from "./utils.ts";

/**
 * Auto-init result
 */
export interface AutoInitResult {
  /** Whether init was performed */
  performed: boolean;
  /** Reason for the result */
  reason: "config_changed" | "first_run" | "no_change" | "error";
  /** Number of tools discovered (if init was performed) */
  toolsCount?: number;
  /** Error message (if error occurred) */
  error?: string;
}

/**
 * Check if MCP config has changed and run init if needed
 *
 * @param configPath - Path to MCP servers config file
 * @param db - Database client
 * @returns Auto-init result
 */
export async function autoInitIfConfigChanged(
  configPath: string,
  db: PGliteClient,
): Promise<AutoInitResult> {
  try {
    // 1. Calculate current config hash
    const currentHash = await hashFile(configPath);

    // 2. Get stored hash from database
    const storedHash = await getStoredConfigHash(db);

    // 3. Check if init is needed
    if (storedHash === currentHash) {
      log.debug("[auto-init] Config unchanged, skipping init");
      return { performed: false, reason: "no_change" };
    }

    const reason = storedHash === null ? "first_run" : "config_changed";
    log.info(
      `[auto-init] ${reason === "first_run" ? "First run" : "Config changed"}, running init...`,
    );

    // 4. Run init
    const toolsCount = await runInit(configPath, db);

    // 5. Store new hash
    await storeConfigHash(db, currentHash);

    log.info(`[auto-init] Complete: ${toolsCount} tools discovered`);
    return { performed: true, reason, toolsCount };
  } catch (error) {
    log.error(`[auto-init] Error: ${error}`);
    return {
      performed: false,
      reason: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Run the init logic (schema extraction + embeddings)
 */
async function runInit(configPath: string, db: PGliteClient): Promise<number> {
  // 1. Load config and discover servers
  const discovery = new MCPServerDiscovery(configPath);
  const config = await discovery.loadConfig();

  if (config.servers.length === 0) {
    log.warn("[auto-init] No servers in config");
    return 0;
  }

  // 2. Extract schemas from all servers
  const extractor = new SchemaExtractor(configPath, db);
  const result = await extractor.extractAndStore();
  const toolsCount = result.totalToolsExtracted;

  log.info(
    `[auto-init] Extracted ${toolsCount} tools from ${result.successfulServers}/${result.totalServers} servers`,
  );

  // 3. Generate embeddings for new tools
  if (toolsCount > 0) {
    log.info("[auto-init] Generating embeddings...");
    const embeddingModel = new EmbeddingModel();
    await embeddingModel.load();
    const embeddingResult = await generateEmbeddings(db, embeddingModel);
    log.info(
      `[auto-init] Generated ${embeddingResult.newlyGenerated} embeddings (${embeddingResult.cachedCount} cached)`,
    );
  }

  return toolsCount;
}

/**
 * Get stored config hash from database
 */
async function getStoredConfigHash(db: PGliteClient): Promise<string | null> {
  try {
    const result = await db.queryOne(
      `SELECT value FROM config WHERE key = $1`,
      [MCP_CONFIG_HASH_KEY],
    );
    if (result && typeof result === "object" && "value" in result) {
      return (result as { value: string }).value;
    }
    return null;
  } catch {
    // Table might not exist yet or other error
    return null;
  }
}

/**
 * Store config hash in database
 */
async function storeConfigHash(db: PGliteClient, hash: string): Promise<void> {
  await db.query(
    `INSERT INTO config (key, value)
     VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = $2`,
    [MCP_CONFIG_HASH_KEY, hash],
  );
}
