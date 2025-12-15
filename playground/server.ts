#!/usr/bin/env -S deno run --allow-all

/**
 * Real MCP Gateway HTTP Server
 *
 * Full Casys PML MCP gateway with all features:
 * - Code sandbox execution
 * - DAG workflow execution
 * - GraphRAG tool recommendations
 * - Semantic tool search
 * - Episodic memory
 *
 * Usage:
 *   deno run --allow-all playground/server.ts
 *
 * Available MCP tools:
 * - pml__pml_execute_code
 * - pml__pml_execute_dag
 * - pml__pml_search_tools
 * - pml__pml_continue
 * - pml__pml_abort
 * - pml__pml_replan
 * - pml__pml_approval_response
 */

// Import directly from source (playground is in Casys PML repo)
import {
  PMLGatewayServer,
  ControlledExecutor,
  createDefaultClient,
  DAGSuggester,
  DenoSandboxExecutor,
  EmbeddingModel,
  EpisodicMemoryStore,
  getAllMigrations,
  GraphRAGEngine,
  MigrationRunner,
  type ToolExecutor,
  VectorSearch,
} from "../mod.ts";

const PORT = parseInt(Deno.env.get("PORT") || "3000");

console.log("🚀 Initializing Casys PML MCP Gateway...\n");

try {
  // 1. Initialize database
  console.log("Step 1/5: Setting up database...");
  const db = createDefaultClient();
  await db.connect();

  // Run migrations
  const runner = new MigrationRunner(db);
  await runner.runUp(getAllMigrations());
  console.log("   ✓ Database ready\n");

  // 2. Initialize AI components
  console.log("Step 2/5: Loading AI models...");
  const embeddingModel = new EmbeddingModel();
  await embeddingModel.load();

  const vectorSearch = new VectorSearch(db, embeddingModel);
  const graphEngine = new GraphRAGEngine(db);
  await graphEngine.syncFromDatabase();

  const dagSuggester = new DAGSuggester(graphEngine, vectorSearch);
  console.log("   ✓ AI models loaded\n");

  // 3. Create tool executor (uses internal sandbox)
  console.log("Step 3/5: Initializing sandbox executor...");
  const sandbox = new DenoSandboxExecutor({
    timeout: 30000,
    memoryLimit: 256,
  });

  const toolExecutor: ToolExecutor = async (toolName: string, args: Record<string, unknown>) => {
    // For standalone mode, we execute code directly in sandbox
    if (toolName === "execute_code" || toolName === "pml:execute_code") {
      const code = args.code as string;
      const context = args.context;
      return await sandbox.execute(code, context);
    }
    throw new Error(`Unknown tool: ${toolName}`);
  };

  // Initialize episodic memory store
  const memoryStore = new EpisodicMemoryStore({ dbPath: ":memory:" });

  const executor = new ControlledExecutor(toolExecutor, {
    verbose: false,
    taskTimeout: 30000,
  });

  // Connect episodic memory for learning
  executor.setEpisodicMemoryStore(memoryStore);

  console.log("   ✓ Sandbox ready with ControlledExecutor\n");

  // 4. Create gateway server (standalone mode without external MCP servers)
  console.log("Step 4/5: Creating gateway server...");
  const gateway = new PMLGatewayServer(
    db,
    vectorSearch,
    graphEngine,
    dagSuggester,
    executor,
    new Map(), // No external MCP clients in standalone mode
    {
      name: "casys-gateway",
      version: "0.1.0",
      enableSpeculative: true,
      defaultToolLimit: 10,
      cacheConfig: {
        enabled: true,
        maxEntries: 100,
        ttlSeconds: 300,
      },
    },
  );
  console.log("   ✓ Gateway created\n");

  // 5. Start HTTP server
  console.log("Step 5/5: Starting HTTP server...");
  console.log(`   Port: ${PORT}`);
  console.log(`   Endpoint: POST http://localhost:${PORT}/message`);
  console.log(`   Health: GET http://localhost:${PORT}/health`);
  console.log();

  console.log("📋 Available MCP tools:");
  console.log("   • pml__pml_execute_code - Execute TypeScript/JavaScript safely");
  console.log("   • pml__pml_execute_dag - Execute DAG workflows");
  console.log("   • pml__pml_search_tools - Semantic tool search");
  console.log("   • pml__pml_continue - Continue DAG execution");
  console.log("   • pml__pml_abort - Abort DAG execution");
  console.log("   • pml__pml_replan - Replan DAG with new requirements");
  console.log("   • pml__pml_approval_response - Respond to approval requests");
  console.log();

  console.log("✅ MCP Gateway ready!\n");

  await gateway.startHttp(PORT);

  // Setup graceful shutdown
  const shutdown = async () => {
    console.log("\n\nShutting down...");
    await gateway.stop();
    await db.close();
    Deno.exit(0);
  };

  Deno.addSignalListener("SIGINT", shutdown);
  Deno.addSignalListener("SIGTERM", shutdown);

  // Keep process alive
  await new Promise(() => {});
} catch (error) {
  console.error("❌ Failed to start gateway:", error);
  Deno.exit(1);
}
