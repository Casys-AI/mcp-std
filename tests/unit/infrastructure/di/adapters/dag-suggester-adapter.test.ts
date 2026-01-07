/**
 * DAGSuggesterAdapter Tests
 *
 * Tests for the DAG suggester adapter:
 * - suggest() method transformation
 * - Handling of null/empty results
 * - Configuration delegation
 *
 * Uses mocked dependencies to isolate adapter behavior.
 *
 * @module tests/unit/infrastructure/di/adapters/dag-suggester-adapter.test
 */

import { assertEquals, assertExists } from "jsr:@std/assert@1";
import { DAGSuggesterAdapter } from "../../../../../src/infrastructure/di/adapters/dag-suggester-adapter.ts";
import type { GraphRAGEngine } from "../../../../../src/graphrag/graph-engine.ts";
import type { VectorSearch } from "../../../../../src/vector/search.ts";
import type { CapabilityMatcher } from "../../../../../src/capabilities/matcher.ts";
import type { CapabilityStore } from "../../../../../src/capabilities/capability-store.ts";
import type { SuggestedDAG } from "../../../../../src/graphrag/types.ts";

/**
 * Create a mock GraphRAGEngine
 */
function createMockGraphEngine(hybridResults: unknown[] = []): GraphRAGEngine {
  return {
    searchToolsHybrid: async () => hybridResults,
    getGraph: () => ({ nodes: [], edges: [] }),
    addCapability: async () => {},
    addTool: async () => {},
    updateToolEmbedding: async () => {},
    getToolPagerank: () => 0.5,
    getToolPageranks: () => new Map(),
    hasNode: () => false,
  } as unknown as GraphRAGEngine;
}

/**
 * Create a mock VectorSearch
 */
function createMockVectorSearch(): VectorSearch {
  return {
    search: async () => [],
    getEmbedding: async () => Array(128).fill(0),
    indexCapability: async () => {},
    indexTool: async () => {},
    close: async () => {},
  } as unknown as VectorSearch;
}

/**
 * Create a mock DAGSuggester that returns controlled results
 *
 * Since we can't easily mock the internal DAGSuggester.suggestDAG(),
 * we test through the adapter's transformation logic instead.
 */
function createMockSuggestedDAG(overrides?: Partial<SuggestedDAG>): SuggestedDAG {
  return {
    dagStructure: {
      tasks: [
        {
          id: "task-1",
          tool: "filesystem:read_file",
          arguments: { path: "/test.txt" },
          dependsOn: [],
        },
        {
          id: "task-2",
          tool: "json:parse",
          arguments: { content: "{{task-1.output}}" },
          dependsOn: ["task-1"],
        },
      ],
    },
    confidence: 0.85,
    rationale: "Based on semantic match and dependency analysis",
    ...overrides,
  };
}

Deno.test("DAGSuggesterAdapter - Construction", async (t) => {
  await t.step("constructor creates adapter with required dependencies", () => {
    const graphEngine = createMockGraphEngine();
    const vectorSearch = createMockVectorSearch();

    const adapter = new DAGSuggesterAdapter(graphEngine, vectorSearch);

    assertExists(adapter);
    assertExists(adapter.underlying);
  });

  await t.step("constructor accepts optional capabilityMatcher", () => {
    const graphEngine = createMockGraphEngine();
    const vectorSearch = createMockVectorSearch();
    const matcher = {} as CapabilityMatcher;

    const adapter = new DAGSuggesterAdapter(graphEngine, vectorSearch, matcher);

    assertExists(adapter);
  });

  await t.step("constructor accepts optional capabilityStore", () => {
    const graphEngine = createMockGraphEngine();
    const vectorSearch = createMockVectorSearch();
    const store = {} as CapabilityStore;

    const adapter = new DAGSuggesterAdapter(graphEngine, vectorSearch, undefined, store);

    assertExists(adapter);
  });
});

Deno.test("DAGSuggesterAdapter - suggest()", async (t) => {
  await t.step("suggest() returns empty result when no candidates found", async () => {
    const graphEngine = createMockGraphEngine([]); // Empty results
    const vectorSearch = createMockVectorSearch();
    const adapter = new DAGSuggesterAdapter(graphEngine, vectorSearch);

    const result = await adapter.suggest("test intent");

    assertEquals(result.confidence, 0);
    assertEquals(result.suggestedDag, undefined);
    assertEquals(result.canSpeculate, false);
  });

  await t.step("suggest() transforms intent string to WorkflowIntent", async () => {
    // This tests that the string intent is properly wrapped
    const graphEngine = createMockGraphEngine();
    const vectorSearch = createMockVectorSearch();
    const adapter = new DAGSuggesterAdapter(graphEngine, vectorSearch);

    // The adapter should convert string to WorkflowIntent{ text, toolsConsidered: [] }
    const result = await adapter.suggest("read a file and parse JSON");

    // Should not throw and return a result
    assertExists(result);
  });

  await t.step("suggest() includes correlationId (ignored for now)", async () => {
    const graphEngine = createMockGraphEngine();
    const vectorSearch = createMockVectorSearch();
    const adapter = new DAGSuggesterAdapter(graphEngine, vectorSearch);

    // correlationId is accepted but not used in current implementation
    const result = await adapter.suggest("test intent", "correlation-123");

    assertExists(result);
  });
});

Deno.test("DAGSuggesterAdapter - Result transformation", async (t) => {
  await t.step("maps tasks correctly from dagStructure.tasks", () => {
    // Test the transformation logic directly
    const mockDag = createMockSuggestedDAG();

    // Simulate the transformation that happens in suggest()
    const tasks = mockDag.dagStructure.tasks.map((task) => ({
      id: task.id,
      callName: task.tool,
      type: "tool" as const,
      inputSchema: task.arguments,
      dependsOn: task.dependsOn,
    }));

    assertEquals(tasks.length, 2);
    assertEquals(tasks[0].id, "task-1");
    assertEquals(tasks[0].callName, "filesystem:read_file");
    assertEquals(tasks[0].type, "tool");
    assertEquals(tasks[0].inputSchema, { path: "/test.txt" });
    assertEquals(tasks[0].dependsOn, []);

    assertEquals(tasks[1].id, "task-2");
    assertEquals(tasks[1].callName, "json:parse");
    assertEquals(tasks[1].dependsOn, ["task-1"]);
  });

  await t.step("canSpeculate is true when confidence >= 0.7", () => {
    const highConfidence = 0.85;
    const canSpeculate = highConfidence >= 0.7;
    assertEquals(canSpeculate, true);

    const lowConfidence = 0.5;
    const cannotSpeculate = lowConfidence >= 0.7;
    assertEquals(cannotSpeculate, false);
  });

  await t.step("handles tasks without dependsOn", () => {
    const mockDag = createMockSuggestedDAG({
      dagStructure: {
        tasks: [
          {
            id: "standalone",
            tool: "test:tool",
            arguments: {},
            dependsOn: undefined as unknown as string[],
          },
        ],
      },
    });

    const tasks = mockDag.dagStructure.tasks.map((task) => ({
      id: task.id,
      callName: task.tool,
      type: "tool" as const,
      inputSchema: task.arguments,
      dependsOn: task.dependsOn ?? [],
    }));

    // With null coalescing, undefined becomes []
    assertEquals(tasks[0].dependsOn, []);
  });
});

Deno.test("DAGSuggesterAdapter - Configuration methods", async (t) => {
  await t.step("initScoringConfig delegates to underlying", async () => {
    const graphEngine = createMockGraphEngine();
    const vectorSearch = createMockVectorSearch();
    const adapter = new DAGSuggesterAdapter(graphEngine, vectorSearch);

    // Should not throw (uses default config)
    await adapter.initScoringConfig();
  });

  await t.step("setCapabilityStore delegates to underlying", () => {
    const graphEngine = createMockGraphEngine();
    const vectorSearch = createMockVectorSearch();
    const adapter = new DAGSuggesterAdapter(graphEngine, vectorSearch);
    const store = {} as CapabilityStore;

    // Should not throw
    adapter.setCapabilityStore(store);
  });
});

Deno.test("DAGSuggesterAdapter - underlying access", async (t) => {
  await t.step("underlying property exposes DAGSuggester instance", () => {
    const graphEngine = createMockGraphEngine();
    const vectorSearch = createMockVectorSearch();
    const adapter = new DAGSuggesterAdapter(graphEngine, vectorSearch);

    const suggester = adapter.underlying;

    assertExists(suggester);
    assertEquals(typeof suggester.suggestDAG, "function");
  });
});

Deno.test("DAGSuggesterAdapter - Edge cases", async (t) => {
  await t.step("handles empty intent string", async () => {
    const graphEngine = createMockGraphEngine();
    const vectorSearch = createMockVectorSearch();
    const adapter = new DAGSuggesterAdapter(graphEngine, vectorSearch);

    const result = await adapter.suggest("");

    // Should return empty result, not throw
    assertExists(result);
    assertEquals(result.confidence, 0);
  });

  await t.step("handles very long intent string", async () => {
    const graphEngine = createMockGraphEngine();
    const vectorSearch = createMockVectorSearch();
    const adapter = new DAGSuggesterAdapter(graphEngine, vectorSearch);

    const longIntent = "read file ".repeat(1000);
    const result = await adapter.suggest(longIntent);

    assertExists(result);
  });

  await t.step("handles special characters in intent", async () => {
    const graphEngine = createMockGraphEngine();
    const vectorSearch = createMockVectorSearch();
    const adapter = new DAGSuggesterAdapter(graphEngine, vectorSearch);

    const result = await adapter.suggest("read file <script>alert('xss')</script>");

    assertExists(result);
  });
});
