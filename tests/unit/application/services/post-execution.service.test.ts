/**
 * PostExecutionService Unit Tests
 *
 * Tests for post-execution learning tasks:
 * - updateDRDSP: Add hyperedges for capability routing
 * - registerSHGATNodes: Register capability/tool nodes in SHGAT
 * - updateThompsonSampling: Record per-tool success/failure
 * - learnFromTaskResults: Learn fan-in/fan-out edges
 * - runPERBatchTraining: PER training with traceStore
 *
 * Phase 3.2: Post-refactoring test consolidation
 *
 * @module tests/unit/application/services/post-execution.service
 */

import { assertEquals } from "@std/assert";
import {
  PostExecutionService,
  type PostExecutionServiceDeps,
  type PostExecutionInput,
} from "../../../../src/application/services/post-execution.service.ts";
import type { StaticStructure, TraceTaskResult } from "../../../../src/capabilities/types/mod.ts";

// =============================================================================
// Mock Factories
// =============================================================================

interface MockDRDSP {
  updates: Array<{ type: string; hyperedgeId: string; newEdge: unknown }>;
  applyUpdate(update: { type: string; hyperedgeId: string; newEdge: unknown }): void;
}

function createMockDRDSP(): MockDRDSP {
  const updates: Array<{ type: string; hyperedgeId: string; newEdge: unknown }> = [];
  return {
    updates,
    applyUpdate(update) {
      updates.push(update);
    },
  };
}

interface MockSHGAT {
  registeredTools: string[];
  registeredCapabilities: Array<{ id: string; members: unknown[]; hierarchyLevel: number }>;
  hasToolNode(id: string): boolean;
  registerTool(input: { id: string; embedding: number[] }): void;
  registerCapability(input: {
    id: string;
    embedding: number[];
    members: unknown[];
    hierarchyLevel: number;
    successRate: number;
  }): void;
}

function createMockSHGAT(): MockSHGAT {
  const registeredTools: string[] = [];
  const registeredCapabilities: Array<{ id: string; members: unknown[]; hierarchyLevel: number }> = [];

  return {
    registeredTools,
    registeredCapabilities,
    hasToolNode(id: string) {
      return registeredTools.includes(id);
    },
    registerTool(input) {
      registeredTools.push(input.id);
    },
    registerCapability(input) {
      registeredCapabilities.push({
        id: input.id,
        members: input.members,
        hierarchyLevel: input.hierarchyLevel,
      });
    },
  };
}

interface MockGraphEngine {
  learnCalls: Array<{ tasksCount: number }>;
  learnFromTaskResults(tasks: unknown[]): Promise<void>;
}

function createMockGraphEngine(): MockGraphEngine {
  const learnCalls: Array<{ tasksCount: number }> = [];
  return {
    learnCalls,
    async learnFromTaskResults(tasks: unknown[]) {
      learnCalls.push({ tasksCount: (tasks as unknown[]).length });
    },
  };
}

interface MockEmbeddingModel {
  encodeCalls: string[];
  encode(text: string): Promise<number[]>;
}

function createMockEmbeddingModel(): MockEmbeddingModel {
  const encodeCalls: string[] = [];
  return {
    encodeCalls,
    async encode(text: string) {
      encodeCalls.push(text);
      // Return a mock 128-dim embedding
      return new Array(128).fill(0).map(() => Math.random());
    },
  };
}

interface MockThresholdManager {
  outcomes: Array<{ toolId: string; success: boolean }>;
  recordToolOutcome(toolId: string, success: boolean): void;
}

function createMockThresholdManager(): MockThresholdManager {
  const outcomes: Array<{ toolId: string; success: boolean }> = [];
  return {
    outcomes,
    recordToolOutcome(toolId, success) {
      outcomes.push({ toolId, success });
    },
  };
}

function createMockStaticStructure(): StaticStructure {
  return {
    nodes: [
      { id: "n1", type: "task", tool: "filesystem:read_file" },
      { id: "n2", type: "task", tool: "code:parse_json" },
    ],
    edges: [
      { from: "n1", to: "n2", type: "sequence" },
    ],
  };
}

function createMockTaskResults(): TraceTaskResult[] {
  return [
    {
      taskId: "task_n1",
      tool: "filesystem:read_file",
      args: { path: "/config.json" },
      result: { content: "{}" },
      success: true,
      durationMs: 50,
      layerIndex: 0,
    },
    {
      taskId: "task_n2",
      tool: "code:parse_json",
      args: { input: "{}" },
      result: {},
      success: true,
      durationMs: 10,
      layerIndex: 1,
    },
  ];
}

function createMockInput(overrides?: Partial<PostExecutionInput>): PostExecutionInput {
  return {
    capability: {
      id: "cap-123",
      successRate: 1.0,
      toolsUsed: ["filesystem:read_file", "code:parse_json"],
    },
    staticStructure: createMockStaticStructure(),
    toolsCalled: ["filesystem:read_file", "code:parse_json"],
    taskResults: createMockTaskResults(),
    intent: "Read and parse JSON config file",
    ...overrides,
  };
}

// =============================================================================
// DR-DSP Update Tests
// =============================================================================

Deno.test({
  name: "PostExecutionService.process - updates DR-DSP with capability hyperedge",
  async fn() {
    const drdsp = createMockDRDSP();
    const deps: PostExecutionServiceDeps = {
      drdsp: drdsp as unknown as PostExecutionServiceDeps["drdsp"],
    };

    const service = new PostExecutionService(deps);
    await service.process(createMockInput());

    assertEquals(drdsp.updates.length, 1);
    assertEquals(drdsp.updates[0].type, "edge_add");
    assertEquals(drdsp.updates[0].hyperedgeId, "cap__cap-123");
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "PostExecutionService.process - skips DR-DSP for empty static structure",
  async fn() {
    const drdsp = createMockDRDSP();
    const deps: PostExecutionServiceDeps = {
      drdsp: drdsp as unknown as PostExecutionServiceDeps["drdsp"],
    };

    const input = createMockInput({
      staticStructure: { nodes: [], edges: [] },
    });

    const service = new PostExecutionService(deps);
    await service.process(input);

    assertEquals(drdsp.updates.length, 0);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// =============================================================================
// SHGAT Node Registration Tests
// =============================================================================

Deno.test({
  name: "PostExecutionService.process - registers new tools in SHGAT",
  async fn() {
    const shgat = createMockSHGAT();
    const embeddingModel = createMockEmbeddingModel();

    const deps: PostExecutionServiceDeps = {
      shgat: shgat as unknown as PostExecutionServiceDeps["shgat"],
      embeddingModel: embeddingModel as unknown as PostExecutionServiceDeps["embeddingModel"],
    };

    const service = new PostExecutionService(deps);
    await service.process(createMockInput());

    // Should register both tools
    assertEquals(shgat.registeredTools.length, 2);
    assertEquals(shgat.registeredTools.includes("filesystem:read_file"), true);
    assertEquals(shgat.registeredTools.includes("code:parse_json"), true);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "PostExecutionService.process - skips already registered tools",
  async fn() {
    const shgat = createMockSHGAT();
    // Pre-register one tool
    shgat.registeredTools.push("filesystem:read_file");

    const embeddingModel = createMockEmbeddingModel();

    const deps: PostExecutionServiceDeps = {
      shgat: shgat as unknown as PostExecutionServiceDeps["shgat"],
      embeddingModel: embeddingModel as unknown as PostExecutionServiceDeps["embeddingModel"],
    };

    const service = new PostExecutionService(deps);
    await service.process(createMockInput());

    // Should only register the new tool
    assertEquals(shgat.registeredTools.length, 2);
    assertEquals(shgat.registeredTools.filter((t) => t === "filesystem:read_file").length, 1);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "PostExecutionService.process - registers capability with hierarchy",
  async fn() {
    const shgat = createMockSHGAT();
    const embeddingModel = createMockEmbeddingModel();

    const deps: PostExecutionServiceDeps = {
      shgat: shgat as unknown as PostExecutionServiceDeps["shgat"],
      embeddingModel: embeddingModel as unknown as PostExecutionServiceDeps["embeddingModel"],
    };

    const input = createMockInput({
      capability: {
        id: "cap-parent",
        successRate: 0.95,
        toolsUsed: ["tool:a"],
        children: ["cap-child-1", "cap-child-2"],
        hierarchyLevel: 1,
      },
    });

    const service = new PostExecutionService(deps);
    await service.process(input);

    assertEquals(shgat.registeredCapabilities.length, 1);
    const cap = shgat.registeredCapabilities[0];
    assertEquals(cap.id, "cap-parent");
    assertEquals(cap.hierarchyLevel, 1);
    // Members should include tools + children
    assertEquals(cap.members.length, 3); // 1 tool + 2 children
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "PostExecutionService.process - generates embeddings for intent",
  async fn() {
    const shgat = createMockSHGAT();
    const embeddingModel = createMockEmbeddingModel();

    const deps: PostExecutionServiceDeps = {
      shgat: shgat as unknown as PostExecutionServiceDeps["shgat"],
      embeddingModel: embeddingModel as unknown as PostExecutionServiceDeps["embeddingModel"],
    };

    const service = new PostExecutionService(deps);
    await service.process(createMockInput());

    // Should encode intent + 2 tools
    assertEquals(embeddingModel.encodeCalls.length, 3);
    assertEquals(embeddingModel.encodeCalls[0], "Read and parse JSON config file");
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// =============================================================================
// Thompson Sampling Tests
// =============================================================================

Deno.test({
  name: "PostExecutionService.process - updates Thompson Sampling for successful tasks",
  async fn() {
    const thresholdManager = createMockThresholdManager();

    const deps: PostExecutionServiceDeps = {
      adaptiveThresholdManager: thresholdManager as unknown as PostExecutionServiceDeps["adaptiveThresholdManager"],
    };

    const service = new PostExecutionService(deps);
    await service.process(createMockInput());

    // Should record success for both tools
    assertEquals(thresholdManager.outcomes.length, 2);
    assertEquals(thresholdManager.outcomes[0].toolId, "filesystem:read_file");
    assertEquals(thresholdManager.outcomes[0].success, true);
    assertEquals(thresholdManager.outcomes[1].toolId, "code:parse_json");
    assertEquals(thresholdManager.outcomes[1].success, true);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "PostExecutionService.process - updates Thompson Sampling for failed tasks",
  async fn() {
    const thresholdManager = createMockThresholdManager();

    const deps: PostExecutionServiceDeps = {
      adaptiveThresholdManager: thresholdManager as unknown as PostExecutionServiceDeps["adaptiveThresholdManager"],
    };

    const taskResults: TraceTaskResult[] = [
      {
        taskId: "task_n1",
        tool: "filesystem:read_file",
        args: {},
        result: { error: "File not found" },
        success: false,
        durationMs: 100,
      },
    ];

    const input = createMockInput({ taskResults });

    const service = new PostExecutionService(deps);
    await service.process(input);

    assertEquals(thresholdManager.outcomes.length, 1);
    assertEquals(thresholdManager.outcomes[0].toolId, "filesystem:read_file");
    assertEquals(thresholdManager.outcomes[0].success, false);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// =============================================================================
// Fan-in/Fan-out Learning Tests
// =============================================================================

Deno.test({
  name: "PostExecutionService.process - learns from task results with layerIndex",
  async fn() {
    const graphEngine = createMockGraphEngine();

    const deps: PostExecutionServiceDeps = {
      graphEngine: graphEngine as unknown as PostExecutionServiceDeps["graphEngine"],
    };

    const service = new PostExecutionService(deps);
    await service.process(createMockInput());

    assertEquals(graphEngine.learnCalls.length, 1);
    assertEquals(graphEngine.learnCalls[0].tasksCount, 2);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "PostExecutionService.process - skips learning for tasks without layerIndex",
  async fn() {
    const graphEngine = createMockGraphEngine();

    const deps: PostExecutionServiceDeps = {
      graphEngine: graphEngine as unknown as PostExecutionServiceDeps["graphEngine"],
    };

    const taskResults: TraceTaskResult[] = [
      {
        taskId: "task_n1",
        tool: "filesystem:read_file",
        args: {},
        result: {},
        success: true,
        durationMs: 50,
        // No layerIndex
      },
    ];

    const input = createMockInput({ taskResults });

    const service = new PostExecutionService(deps);
    await service.process(input);

    // learnFromTaskResults should not be called (no tasks with layerIndex)
    assertEquals(graphEngine.learnCalls.length, 0);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// =============================================================================
// Missing Dependencies Tests
// =============================================================================

Deno.test({
  name: "PostExecutionService.process - handles missing DR-DSP gracefully",
  async fn() {
    const deps: PostExecutionServiceDeps = {};

    const service = new PostExecutionService(deps);

    // Should not throw
    await service.process(createMockInput());
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "PostExecutionService.process - handles missing SHGAT gracefully",
  async fn() {
    const deps: PostExecutionServiceDeps = {};

    const service = new PostExecutionService(deps);

    // Should not throw
    await service.process(createMockInput());
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "PostExecutionService.process - handles missing embeddingModel gracefully",
  async fn() {
    const shgat = createMockSHGAT();

    const deps: PostExecutionServiceDeps = {
      shgat: shgat as unknown as PostExecutionServiceDeps["shgat"],
      // No embeddingModel
    };

    const service = new PostExecutionService(deps);

    // Should not throw, but should not register anything
    await service.process(createMockInput());

    assertEquals(shgat.registeredTools.length, 0);
    assertEquals(shgat.registeredCapabilities.length, 0);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// =============================================================================
// PER Training Tests
// =============================================================================

Deno.test({
  name: "PostExecutionService.runPERBatchTraining - skips without required dependencies",
  async fn() {
    const deps: PostExecutionServiceDeps = {};

    const service = new PostExecutionService(deps);

    // Should not throw
    await service.runPERBatchTraining();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// =============================================================================
// Full Flow Tests
// =============================================================================

Deno.test({
  name: "PostExecutionService.process - runs all post-execution tasks",
  async fn() {
    const drdsp = createMockDRDSP();
    const shgat = createMockSHGAT();
    const embeddingModel = createMockEmbeddingModel();
    const graphEngine = createMockGraphEngine();
    const thresholdManager = createMockThresholdManager();

    const deps: PostExecutionServiceDeps = {
      drdsp: drdsp as unknown as PostExecutionServiceDeps["drdsp"],
      shgat: shgat as unknown as PostExecutionServiceDeps["shgat"],
      embeddingModel: embeddingModel as unknown as PostExecutionServiceDeps["embeddingModel"],
      graphEngine: graphEngine as unknown as PostExecutionServiceDeps["graphEngine"],
      adaptiveThresholdManager: thresholdManager as unknown as PostExecutionServiceDeps["adaptiveThresholdManager"],
    };

    const service = new PostExecutionService(deps);
    await service.process(createMockInput());

    // All components should have been called
    assertEquals(drdsp.updates.length, 1, "DR-DSP should be updated");
    assertEquals(shgat.registeredCapabilities.length, 1, "Capability should be registered");
    assertEquals(graphEngine.learnCalls.length, 1, "GraphEngine should learn");
    assertEquals(thresholdManager.outcomes.length, 2, "Thompson Sampling should be updated");
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
