/**
 * Idempotent Playground Initialization Helper
 *
 * Ensures the playground is ready for notebook execution.
 * Checks DB existence, MCP gateway availability, and workflow templates.
 *
 * @module playground/lib/init
 */

import { PGlite } from "npm:@electric-sql/pglite@0.2.15";
import { vector } from "npm:@electric-sql/pglite@0.2.15/vector";
import { parse as parseYaml } from "jsr:@std/yaml@1.0.5";

// ============================================================================
// Types
// ============================================================================

export interface InitOptions {
  /** Show detailed initialization logs */
  verbose?: boolean;
  /** Custom database path (overrides auto-detection) */
  dbPath?: string;
  /** Custom workflow templates path */
  workflowPath?: string;
  /** MCP Gateway URL to check */
  gatewayUrl?: string;
}

export interface InitStatus {
  /** Whether initialization was performed (false = already initialized, skipped) */
  initialized: boolean;
  /** List of available MCP servers from gateway */
  mcpServers: string[];
  /** Number of workflow templates loaded */
  workflowsLoaded: number;
  /** Error message if partial failure occurred */
  error?: string;
  /** Time taken in milliseconds */
  elapsedMs: number;
}

interface WorkflowTemplates {
  workflows: Array<{
    name: string;
    steps?: string[];
    edges?: Array<{ from: string; to: string }>;
  }>;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_GATEWAY_URL = "http://localhost:3003";
const DEFAULT_WORKFLOW_PATH = "./config/workflow-templates.yaml";

// ============================================================================
// Exports
// ============================================================================

/**
 * Ensure the playground environment is ready for use.
 *
 * Idempotent: if already initialized, returns quickly (< 100ms).
 * If not initialized, runs full initialization flow.
 *
 * @param options - Configuration options
 * @returns Status of initialization
 *
 * @example
 * // Basic usage in notebook
 * const status = await ensurePlaygroundReady();
 * console.log(`Ready! ${status.mcpServers.length} MCP servers available`);
 *
 * @example
 * // Verbose mode for debugging
 * const status = await ensurePlaygroundReady({ verbose: true });
 */
export async function ensurePlaygroundReady(
  options?: InitOptions,
): Promise<InitStatus> {
  const startTime = performance.now();
  const verbose = options?.verbose ?? false;
  const dbPath = options?.dbPath ?? getPlaygroundDbPath();
  const gatewayUrl = options?.gatewayUrl ?? DEFAULT_GATEWAY_URL;
  const workflowPath = options?.workflowPath ?? DEFAULT_WORKFLOW_PATH;

  if (verbose) {
    console.log("🔍 Checking playground initialization status...");
    console.log(`   DB path: ${dbPath}`);
    console.log(`   Gateway: ${gatewayUrl}`);
  }

  // Check if already initialized
  const alreadyInitialized = await isAlreadyInitialized(dbPath, gatewayUrl);

  if (alreadyInitialized.ready) {
    const elapsedMs = Math.round(performance.now() - startTime);

    if (verbose) {
      console.log(`✓ Playground already initialized (${elapsedMs}ms)`);
      console.log(`   MCP servers: ${alreadyInitialized.mcpServers.join(", ")}`);
      console.log(`   Workflows: ${alreadyInitialized.workflowsLoaded}`);
    }

    return {
      initialized: false, // false = didn't need to initialize
      mcpServers: alreadyInitialized.mcpServers,
      workflowsLoaded: alreadyInitialized.workflowsLoaded,
      elapsedMs,
    };
  }

  // Run full initialization
  if (verbose) {
    console.log("⚙️  Running full initialization...");
  }

  const result = await runFullInit({
    dbPath,
    gatewayUrl,
    workflowPath,
    verbose,
  });

  const elapsedMs = Math.round(performance.now() - startTime);

  if (verbose) {
    console.log(`✓ Initialization complete (${elapsedMs}ms)`);
    if (result.error) {
      console.log(`⚠ Partial failure: ${result.error}`);
    }
  }

  return {
    initialized: true, // true = performed initialization
    mcpServers: result.mcpServers,
    workflowsLoaded: result.workflowsLoaded,
    error: result.error,
    elapsedMs,
  };
}

/**
 * Get the database path for playground use.
 *
 * Uses PML_DB_PATH env var (set in .env files).
 * Falls back to CAI_DB_PATH for backward compatibility.
 * Falls back to default ~/.pml/.pml.db if not set.
 */
export function getPlaygroundDbPath(): string {
  // Use env var from .env file (loaded automatically by Deno 2.0+)
  const envPath = Deno.env.get("PML_DB_PATH") ?? Deno.env.get("CAI_DB_PATH");
  if (envPath) {
    if (!Deno.env.get("PML_DB_PATH") && Deno.env.get("CAI_DB_PATH")) {
      console.warn("⚠️  CAI_DB_PATH is deprecated. Use PML_DB_PATH instead.");
    }
    return envPath;
  }

  // Fallback to default path
  const homeDir = Deno.env.get("HOME") || Deno.env.get("USERPROFILE");
  if (!homeDir) {
    throw new Error("Cannot determine home directory");
  }
  return `${homeDir}/.pml/.pml.db`;
}

// ============================================================================
// Internal Functions
// ============================================================================

interface InitCheckResult {
  ready: boolean;
  mcpServers: string[];
  workflowsLoaded: number;
}

/**
 * Check if playground is already initialized
 */
async function isAlreadyInitialized(
  dbPath: string,
  gatewayUrl: string,
): Promise<InitCheckResult> {
  const checks = await Promise.all([
    checkDatabaseReady(dbPath),
    checkGatewayReady(gatewayUrl),
  ]);

  const [dbCheck, gatewayCheck] = checks;

  // Need both DB and gateway to be ready
  if (!dbCheck.ready || !gatewayCheck.ready) {
    return {
      ready: false,
      mcpServers: gatewayCheck.servers,
      workflowsLoaded: dbCheck.workflowCount,
    };
  }

  return {
    ready: true,
    mcpServers: gatewayCheck.servers,
    workflowsLoaded: dbCheck.workflowCount,
  };
}

/**
 * Check if database exists and has data
 */
async function checkDatabaseReady(
  dbPath: string,
): Promise<{ ready: boolean; workflowCount: number }> {
  try {
    // Check if path exists
    await Deno.stat(dbPath);

    // Try to connect and check for workflow patterns
    const db = new PGlite(dbPath, { extensions: { vector } });

    try {
      const result = await db.query<{ count: string }>(
        "SELECT COUNT(*) as count FROM workflow_pattern",
      );
      const count = parseInt(result.rows[0]?.count ?? "0", 10);
      await db.close();

      return { ready: count > 0, workflowCount: count };
    } catch {
      // Table might not exist
      await db.close();
      return { ready: false, workflowCount: 0 };
    }
  } catch {
    // DB doesn't exist
    return { ready: false, workflowCount: 0 };
  }
}

/**
 * Check if MCP gateway is running and responsive
 */
async function checkGatewayReady(
  gatewayUrl: string,
): Promise<{ ready: boolean; servers: string[] }> {
  try {
    // Try to list tools from gateway
    const response = await fetch(`${gatewayUrl}/api/tools`, {
      signal: AbortSignal.timeout(2000), // 2s timeout
    });

    if (!response.ok) {
      return { ready: false, servers: [] };
    }

    const data = await response.json();

    // Extract unique server names from tool IDs (format: "server:tool")
    const servers = new Set<string>();
    if (Array.isArray(data.tools)) {
      for (const tool of data.tools) {
        const serverId = tool.id?.split(":")[0] || tool.serverId;
        if (serverId) {
          servers.add(serverId);
        }
      }
    }

    return { ready: true, servers: Array.from(servers) };
  } catch {
    // Gateway not available
    return { ready: false, servers: [] };
  }
}

interface FullInitOptions {
  dbPath: string;
  gatewayUrl: string;
  workflowPath: string;
  verbose: boolean;
}

interface FullInitResult {
  mcpServers: string[];
  workflowsLoaded: number;
  error?: string;
}

/**
 * Run full initialization flow
 */
async function runFullInit(options: FullInitOptions): Promise<FullInitResult> {
  const errors: string[] = [];
  let mcpServers: string[] = [];
  let workflowsLoaded = 0;

  // Step 1: Check/wait for gateway
  if (options.verbose) {
    console.log("   → Checking MCP gateway...");
  }

  const gatewayCheck = await checkGatewayReady(options.gatewayUrl);
  if (gatewayCheck.ready) {
    mcpServers = gatewayCheck.servers;
    if (options.verbose) {
      console.log(`   ✓ Gateway ready: ${mcpServers.join(", ")}`);
    }
  } else {
    errors.push("MCP gateway not available");
    if (options.verbose) {
      console.log("   ✗ Gateway not available");
    }
  }

  // Step 2: Load workflow templates
  if (options.verbose) {
    console.log("   → Loading workflow templates...");
  }

  try {
    const content = await Deno.readTextFile(options.workflowPath);
    const templates = parseYaml(content) as WorkflowTemplates;
    workflowsLoaded = templates.workflows?.length ?? 0;

    if (options.verbose) {
      console.log(`   ✓ Loaded ${workflowsLoaded} workflow templates`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`Workflow templates: ${msg}`);
    if (options.verbose) {
      console.log(`   ✗ Failed to load workflow templates: ${msg}`);
    }
  }

  // Step 3: Verify database
  if (options.verbose) {
    console.log("   → Verifying database...");
  }

  const dbCheck = await checkDatabaseReady(options.dbPath);
  if (dbCheck.ready) {
    if (options.verbose) {
      console.log(`   ✓ Database ready (${dbCheck.workflowCount} patterns)`);
    }
  } else {
    if (options.verbose) {
      console.log("   ⚠ Database empty or not initialized");
    }
    // Not an error - might be first run
  }

  return {
    mcpServers,
    workflowsLoaded,
    error: errors.length > 0 ? errors.join("; ") : undefined,
  };
}

// ============================================================================
// CLI Entry Point
// ============================================================================

if (import.meta.main) {
  console.log("🚀 Casys PML Playground Init\n");

  const status = await ensurePlaygroundReady({ verbose: true });

  console.log("\n📊 Status:");
  console.log(`   Initialized: ${status.initialized}`);
  console.log(`   MCP Servers: ${status.mcpServers.join(", ") || "(none)"}`);
  console.log(`   Workflows: ${status.workflowsLoaded}`);
  console.log(`   Time: ${status.elapsedMs}ms`);

  if (status.error) {
    console.log(`\n⚠️  Errors: ${status.error}`);
  }
}
