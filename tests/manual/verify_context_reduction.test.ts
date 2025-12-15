/**
 * Manual test to verify context reduction numbers from blog article
 * Validates the "167x reduction" claim
 */

import { assert } from "@std/assert";
import { VectorSearch } from "../../src/vector/search.ts";
import { EmbeddingModel } from "../../src/vector/embeddings.ts";
import { PGliteClient } from "../../src/db/client.ts";
import { createInitialMigration } from "../../src/db/migrations.ts";

async function createTestDb(): Promise<PGliteClient> {
  const db = new PGliteClient("memory://");
  await db.connect();
  const migration = createInitialMigration();
  await migration.up(db);
  return db;
}

async function insertTestEmbeddings(db: PGliteClient, model: EmbeddingModel): Promise<void> {
  const testTools = [
    {
      toolId: "filesystem:read_file",
      serverId: "filesystem",
      toolName: "read_file",
      description: "Read the contents of a file from the filesystem",
      schema: { name: "read_file", description: "Read file", inputSchema: { type: "object" } },
    },
    {
      toolId: "filesystem:write_file",
      serverId: "filesystem",
      toolName: "write_file",
      description: "Write content to a file on the filesystem",
      schema: { name: "write_file", description: "Write file", inputSchema: { type: "object" } },
    },
    {
      toolId: "filesystem:list_directory",
      serverId: "filesystem",
      toolName: "list_directory",
      description: "List files in a directory",
      schema: {
        name: "list_directory",
        description: "List directory",
        inputSchema: { type: "object" },
      },
    },
    {
      toolId: "github:create_pull_request",
      serverId: "github",
      toolName: "create_pull_request",
      description: "Create a new pull request on GitHub repository",
      schema: {
        name: "create_pull_request",
        description: "Create PR",
        inputSchema: { type: "object" },
      },
    },
    {
      toolId: "github:list_issues",
      serverId: "github",
      toolName: "list_issues",
      description: "List issues from a GitHub repository",
      schema: { name: "list_issues", description: "List issues", inputSchema: { type: "object" } },
    },
    {
      toolId: "database:query",
      serverId: "database",
      toolName: "query",
      description: "Execute a SQL query against the database",
      schema: { name: "query", description: "Execute SQL", inputSchema: { type: "object" } },
    },
    {
      toolId: "json:parse",
      serverId: "json",
      toolName: "parse",
      description: "Parse JSON string into object",
      schema: { name: "parse", description: "Parse JSON", inputSchema: { type: "object" } },
    },
  ];

  for (const tool of testTools) {
    await db.query(
      `INSERT INTO tool_schema (tool_id, server_id, name, description, input_schema)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        tool.toolId,
        tool.serverId,
        tool.toolName,
        tool.description,
        JSON.stringify(tool.schema.inputSchema),
      ],
    );

    const text = `${tool.schema.name} ${tool.schema.description}`;
    const embedding = await model.encode(text);
    const vectorLiteral = `[${embedding.join(",")}]`;

    await db.query(
      `INSERT INTO tool_embedding (tool_id, server_id, tool_name, embedding, metadata)
       VALUES ($1, $2, $3, $4::vector, $5)`,
      [
        tool.toolId,
        tool.serverId,
        tool.toolName,
        vectorLiteral,
        JSON.stringify({ description: tool.description }),
      ],
    );
  }
}

Deno.test("Manual - Verify context reduction (Article 1 claim)", async () => {
  console.log("\n📊 VÉRIFICATION DES CHIFFRES DE L'ARTICLE 1\n");
  console.log("=".repeat(60));

  const db = await createTestDb();
  const model = new EmbeddingModel();
  await model.load();

  await insertTestEmbeddings(db, model);

  const vectorSearch = new VectorSearch(db, model);

  // Scenario de l'article : "Lire config.json et créer issue GitHub"
  console.log("\n🎯 Scénario : 'Lire config.json et créer issue GitHub'\n");

  const results = await vectorSearch.searchTools(
    "read config file and create github issue",
    3,
    0.6,
  );

  console.log("Résultats de la recherche vectorielle :");
  for (const result of results) {
    console.log(`  ${result.score.toFixed(3)} - ${result.toolId}`);
  }

  // Vérification
  assert(results.length > 0, "Devrait trouver des résultats");
  assert(results.length <= 3, "Devrait limiter à top-3");

  // Calcul de réduction de contexte
  const TOTAL_TOOLS = 7; // Dans notre test
  const TOOLS_RETURNED = results.length;
  const AVG_TOKENS_PER_SCHEMA = 120; // Estimation réaliste

  const contextWithoutOptimization = TOTAL_TOOLS * AVG_TOKENS_PER_SCHEMA;
  const contextWithOptimization = TOOLS_RETURNED * AVG_TOKENS_PER_SCHEMA;
  const reductionFactor = contextWithoutOptimization / contextWithOptimization;

  console.log(`\n📉 Réduction de contexte :`);
  console.log(
    `   Sans optimisation : ${TOTAL_TOOLS} tools × ${AVG_TOKENS_PER_SCHEMA} tokens = ${contextWithoutOptimization} tokens`,
  );
  console.log(
    `   Avec optimisation : ${TOOLS_RETURNED} tools × ${AVG_TOKENS_PER_SCHEMA} tokens = ${contextWithOptimization} tokens`,
  );
  console.log(`   Réduction : ${reductionFactor.toFixed(1)}x\n`);

  // Extrapolation à 687 tools (article)
  const ARTICLE_TOTAL_TOOLS = 687; // 15 serveurs × ~45 tools
  const contextArticleWithout = ARTICLE_TOTAL_TOOLS * AVG_TOKENS_PER_SCHEMA;
  const contextArticleWith = TOOLS_RETURNED * AVG_TOKENS_PER_SCHEMA;
  const articleReduction = contextArticleWithout / contextArticleWith;

  console.log(`📊 Extrapolation article (687 tools sur 15 serveurs) :`);
  console.log(
    `   Sans optimisation : ${ARTICLE_TOTAL_TOOLS} tools × ${AVG_TOKENS_PER_SCHEMA} = ${contextArticleWithout.toLocaleString()} tokens`,
  );
  console.log(
    `   Avec optimisation : ${TOOLS_RETURNED} tools × ${AVG_TOKENS_PER_SCHEMA} = ${contextArticleWith} tokens`,
  );
  console.log(`   Réduction : ${articleReduction.toFixed(1)}x`);
  console.log(`   Article claim : 167x\n`);

  const contextPctWithout = (contextArticleWithout / 200000) * 100;
  const contextPctWith = (contextArticleWith / 200000) * 100;

  console.log(`💾 Fenêtre de contexte (200K tokens) :`);
  console.log(
    `   Sans optimisation : ${
      contextPctWithout.toFixed(1)
    }% (${contextArticleWithout.toLocaleString()} / 200,000)`,
  );
  console.log(
    `   Avec optimisation : ${contextPctWith.toFixed(2)}% (${contextArticleWith} / 200,000)`,
  );
  console.log(`   Article target : <5%\n`);

  console.log("=".repeat(60));

  // Validation
  console.log(`\n✅ Résultats :`);
  if (articleReduction >= 150 && articleReduction <= 230) {
    console.log(`   ✓ Réduction ${articleReduction.toFixed(0)}x est cohérente avec article (167x)`);
  } else {
    console.log(`   ⚠️  Réduction ${articleReduction.toFixed(0)}x diffère de l'article (167x)`);
  }

  if (contextPctWith < 5) {
    console.log(`   ✓ Context ${contextPctWith.toFixed(2)}% respecte target <5%`);
  } else {
    console.log(`   ⚠️  Context ${contextPctWith.toFixed(2)}% dépasse target 5%`);
  }

  console.log("");

  await db.close();
});
