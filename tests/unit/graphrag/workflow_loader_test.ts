/**
 * Unit tests for WorkflowLoader (Story 5.2)
 *
 * Tests cover:
 * - AC1: YAML parsing with valid/invalid formats
 * - AC5: Warning logging for unknown tool IDs
 * - Steps → edges conversion
 */

import { assert, assertEquals, assertRejects } from "@std/assert";
import { WorkflowLoader, type WorkflowTemplate } from "../../../src/graphrag/workflow-loader.ts";

// ============================================
// AC1: YAML parsing tests
// ============================================

Deno.test("WorkflowLoader - loadFromYaml parses valid YAML file", async () => {
  // Create a temporary YAML file
  const tempFile = await Deno.makeTempFile({ suffix: ".yaml" });
  await Deno.writeTextFile(
    tempFile,
    `workflows:
  - name: test_workflow
    steps:
      - tool_a
      - tool_b
      - tool_c
`,
  );

  const loader = new WorkflowLoader();
  const workflows = await loader.loadFromYaml(tempFile);

  assertEquals(workflows.length, 1);
  assertEquals(workflows[0].name, "test_workflow");
  assertEquals(workflows[0].steps, ["tool_a", "tool_b", "tool_c"]);

  await Deno.remove(tempFile);
});

Deno.test("WorkflowLoader - loadFromYaml returns empty array for missing file", async () => {
  const loader = new WorkflowLoader();
  const workflows = await loader.loadFromYaml("/nonexistent/path/workflows.yaml");

  assertEquals(workflows.length, 0);
});

Deno.test("WorkflowLoader - loadFromYaml throws on invalid YAML structure", async () => {
  const tempFile = await Deno.makeTempFile({ suffix: ".yaml" });
  await Deno.writeTextFile(tempFile, "invalid: yaml structure");

  const loader = new WorkflowLoader();

  await assertRejects(
    async () => {
      await loader.loadFromYaml(tempFile);
    },
    Error,
    "Invalid YAML format",
  );

  await Deno.remove(tempFile);
});

// ============================================
// Validation tests
// ============================================

Deno.test("WorkflowLoader - validate accepts workflow with 2+ steps (AC1)", () => {
  const loader = new WorkflowLoader();
  const workflows: WorkflowTemplate[] = [
    { name: "valid_workflow", steps: ["tool_a", "tool_b"] },
  ];

  const results = loader.validate(workflows);

  assertEquals(results.length, 1);
  assertEquals(results[0].valid, true);
  assertEquals(results[0].errors.length, 0);
});

Deno.test("WorkflowLoader - validate rejects workflow with less than 2 steps (AC1)", () => {
  const loader = new WorkflowLoader();
  const workflows: WorkflowTemplate[] = [
    { name: "invalid_workflow", steps: ["only_one_tool"] },
  ];

  const results = loader.validate(workflows);

  assertEquals(results.length, 1);
  assertEquals(results[0].valid, false);
  assert(
    results[0].errors.some((e) => e.includes("minimum is 2")),
    "Should have error about minimum steps",
  );
});

Deno.test("WorkflowLoader - validate rejects workflow without name", () => {
  const loader = new WorkflowLoader();
  const workflows = [
    { name: "", steps: ["tool_a", "tool_b"] },
  ] as WorkflowTemplate[];

  const results = loader.validate(workflows);

  assertEquals(results[0].valid, false);
  assert(
    results[0].errors.some((e) => e.includes("name")),
    "Should have error about missing name",
  );
});

Deno.test("WorkflowLoader - validate rejects workflow without steps or edges", () => {
  const loader = new WorkflowLoader();
  const workflows = [
    { name: "no_steps_or_edges", steps: undefined as unknown as string[] },
  ] as WorkflowTemplate[];

  const results = loader.validate(workflows);

  assertEquals(results[0].valid, false);
  assert(
    results[0].errors.some((e) => e.includes("steps") || e.includes("edges")),
    "Should have error about missing steps or edges",
  );
});

// ============================================
// AC5: Unknown tool errors (strict validation)
// ============================================

Deno.test("WorkflowLoader - validate rejects workflows with unknown tools (AC5)", () => {
  const loader = new WorkflowLoader();

  // Set known tools
  loader.setKnownTools(["known_tool_a", "known_tool_b"]);

  const workflows: WorkflowTemplate[] = [
    { name: "mixed_workflow", steps: ["known_tool_a", "unknown_tool", "known_tool_b"] },
  ];

  const results = loader.validate(workflows);

  // Workflow should be invalid (strict validation - unknown tools cause errors)
  assertEquals(results[0].valid, false);
  assertEquals(results[0].errors.length, 1);
  assert(
    results[0].errors[0].includes("unknown_tool"),
    "Error should mention unknown tool",
  );
});

Deno.test("WorkflowLoader - validate skips warnings when no known tools set", () => {
  const loader = new WorkflowLoader();
  // Don't set any known tools

  const workflows: WorkflowTemplate[] = [
    { name: "any_workflow", steps: ["any_tool_a", "any_tool_b"] },
  ];

  const results = loader.validate(workflows);

  assertEquals(results[0].valid, true);
  assertEquals(results[0].warnings.length, 0);
});

// ============================================
// Steps → Edges conversion
// ============================================

Deno.test("WorkflowLoader - convertToEdges creates correct edges from steps", () => {
  const loader = new WorkflowLoader();

  const workflows: WorkflowTemplate[] = [
    { name: "test_workflow", steps: ["A", "B", "C", "D"] },
  ];

  const edges = loader.convertToEdges(workflows);

  // [A, B, C, D] → (A→B), (B→C), (C→D)
  assertEquals(edges.length, 3);

  assertEquals(edges[0].from, "A");
  assertEquals(edges[0].to, "B");
  assertEquals(edges[0].workflowName, "test_workflow");

  assertEquals(edges[1].from, "B");
  assertEquals(edges[1].to, "C");

  assertEquals(edges[2].from, "C");
  assertEquals(edges[2].to, "D");
});

Deno.test("WorkflowLoader - convertToEdges handles minimum workflow (2 steps)", () => {
  const loader = new WorkflowLoader();

  const workflows: WorkflowTemplate[] = [
    { name: "minimal", steps: ["start", "end"] },
  ];

  const edges = loader.convertToEdges(workflows);

  assertEquals(edges.length, 1);
  assertEquals(edges[0].from, "start");
  assertEquals(edges[0].to, "end");
});

Deno.test("WorkflowLoader - convertToEdges handles multiple workflows", () => {
  const loader = new WorkflowLoader();

  const workflows: WorkflowTemplate[] = [
    { name: "workflow_1", steps: ["a", "b"] },
    { name: "workflow_2", steps: ["x", "y", "z"] },
  ];

  const edges = loader.convertToEdges(workflows);

  // workflow_1: 1 edge, workflow_2: 2 edges
  assertEquals(edges.length, 3);

  // Check workflow names are preserved
  assertEquals(edges[0].workflowName, "workflow_1");
  assertEquals(edges[1].workflowName, "workflow_2");
  assertEquals(edges[2].workflowName, "workflow_2");
});

Deno.test("WorkflowLoader - convertToEdges skips invalid workflows", () => {
  const loader = new WorkflowLoader();

  const workflows: WorkflowTemplate[] = [
    { name: "valid", steps: ["a", "b"] },
    { name: "invalid", steps: ["single"] }, // Less than 2 steps
  ];

  const edges = loader.convertToEdges(workflows);

  // Only valid workflow should produce edges
  assertEquals(edges.length, 1);
  assertEquals(edges[0].workflowName, "valid");
});

// ============================================
// Checksum calculation
// ============================================

Deno.test("WorkflowLoader - calculateChecksum returns consistent hash", async () => {
  const tempFile = await Deno.makeTempFile({ suffix: ".yaml" });
  await Deno.writeTextFile(tempFile, "test content for hashing");

  const loader = new WorkflowLoader();

  const hash1 = await loader.calculateChecksum(tempFile);
  const hash2 = await loader.calculateChecksum(tempFile);

  assertEquals(hash1, hash2, "Same file should produce same hash");
  assert(hash1.length === 64, "SHA-256 hex should be 64 characters");

  await Deno.remove(tempFile);
});

Deno.test("WorkflowLoader - calculateChecksum returns different hash for different content", async () => {
  const tempFile1 = await Deno.makeTempFile({ suffix: ".yaml" });
  const tempFile2 = await Deno.makeTempFile({ suffix: ".yaml" });
  await Deno.writeTextFile(tempFile1, "content A");
  await Deno.writeTextFile(tempFile2, "content B");

  const loader = new WorkflowLoader();

  const hash1 = await loader.calculateChecksum(tempFile1);
  const hash2 = await loader.calculateChecksum(tempFile2);

  assert(hash1 !== hash2, "Different content should produce different hash");

  await Deno.remove(tempFile1);
  await Deno.remove(tempFile2);
});

Deno.test("WorkflowLoader - calculateChecksum returns empty string for missing file", async () => {
  const loader = new WorkflowLoader();
  const hash = await loader.calculateChecksum("/nonexistent/file.yaml");

  assertEquals(hash, "");
});

// ============================================
// loadAndProcess integration
// ============================================

Deno.test("WorkflowLoader - loadAndProcess combines load, validate, and convert", async () => {
  const tempFile = await Deno.makeTempFile({ suffix: ".yaml" });
  await Deno.writeTextFile(
    tempFile,
    `workflows:
  - name: workflow_a
    steps: [tool_1, tool_2, tool_3]
  - name: workflow_b
    steps: [tool_x, tool_y]
`,
  );

  const loader = new WorkflowLoader();
  const result = await loader.loadAndProcess(tempFile);

  assertEquals(result.workflows.length, 2);
  assertEquals(result.validWorkflows.length, 2);
  assertEquals(result.validationResults.length, 2);
  // workflow_a: 2 edges, workflow_b: 1 edge
  assertEquals(result.edges.length, 3);

  await Deno.remove(tempFile);
});

// ============================================
// Edges format (DAG) - New feature
// ============================================

Deno.test("WorkflowLoader - validate accepts workflow with edges format", () => {
  const loader = new WorkflowLoader();
  const workflows: WorkflowTemplate[] = [
    {
      name: "dag_workflow",
      edges: [
        ["A", "B"],
        ["A", "C"],
        ["B", "D"],
        ["C", "D"],
      ],
    },
  ];

  const results = loader.validate(workflows);

  assertEquals(results.length, 1);
  assertEquals(results[0].valid, true);
  assertEquals(results[0].errors.length, 0);
});

Deno.test("WorkflowLoader - validate rejects workflow with both steps and edges", () => {
  const loader = new WorkflowLoader();
  const workflows = [
    {
      name: "invalid_both",
      steps: ["A", "B"],
      edges: [["A", "B"]],
    },
  ] as WorkflowTemplate[];

  const results = loader.validate(workflows);

  assertEquals(results[0].valid, false);
  assert(
    results[0].errors.some((e) => e.includes("both")),
    "Should have error about both steps and edges",
  );
});

Deno.test("WorkflowLoader - validate rejects workflow with neither steps nor edges", () => {
  const loader = new WorkflowLoader();
  const workflows = [
    { name: "empty_workflow" },
  ] as WorkflowTemplate[];

  const results = loader.validate(workflows);

  assertEquals(results[0].valid, false);
  assert(
    results[0].errors.some((e) => e.includes("missing")),
    "Should have error about missing steps or edges",
  );
});

Deno.test("WorkflowLoader - validate rejects edges with invalid format", () => {
  const loader = new WorkflowLoader();
  const workflows = [
    {
      name: "invalid_edges",
      edges: [
        ["A", "B"],
        ["only_one"] as unknown as [string, string], // Invalid: not a pair
      ],
    },
  ] as WorkflowTemplate[];

  const results = loader.validate(workflows);

  assertEquals(results[0].valid, false);
  assert(
    results[0].errors.some((e) => e.includes("[from, to]")),
    "Should have error about edge format",
  );
});

Deno.test("WorkflowLoader - validate rejects workflows with unknown tools in edges format", () => {
  const loader = new WorkflowLoader();
  loader.setKnownTools(["known_a", "known_b"]);

  const workflows: WorkflowTemplate[] = [
    {
      name: "edges_workflow",
      edges: [
        ["known_a", "unknown_tool"],
        ["unknown_tool", "known_b"],
      ],
    },
  ];

  const results = loader.validate(workflows);

  assertEquals(results[0].valid, false);
  assertEquals(results[0].errors.length, 2); // unknown_tool appears twice (as 'to' and 'from')
  assert(
    results[0].errors.some((e) => e.includes("unknown_tool")),
    "Error should mention unknown tool",
  );
});

Deno.test("WorkflowLoader - convertToEdges handles edges format (DAG)", () => {
  const loader = new WorkflowLoader();

  const workflows: WorkflowTemplate[] = [
    {
      name: "dag_workflow",
      edges: [
        ["A", "B"],
        ["A", "C"],
        ["B", "D"],
        ["C", "D"],
      ],
    },
  ];

  const edges = loader.convertToEdges(workflows);

  assertEquals(edges.length, 4);

  assertEquals(edges[0].from, "A");
  assertEquals(edges[0].to, "B");
  assertEquals(edges[0].workflowName, "dag_workflow");

  assertEquals(edges[1].from, "A");
  assertEquals(edges[1].to, "C");

  assertEquals(edges[2].from, "B");
  assertEquals(edges[2].to, "D");

  assertEquals(edges[3].from, "C");
  assertEquals(edges[3].to, "D");
});

Deno.test("WorkflowLoader - convertToEdges handles mixed steps and edges workflows", () => {
  const loader = new WorkflowLoader();

  const workflows: WorkflowTemplate[] = [
    { name: "linear", steps: ["X", "Y", "Z"] },
    {
      name: "dag",
      edges: [
        ["A", "B"],
        ["A", "C"],
      ],
    },
  ];

  const edges = loader.convertToEdges(workflows);

  // linear: 2 edges (X→Y, Y→Z), dag: 2 edges (A→B, A→C)
  assertEquals(edges.length, 4);

  // First two from linear workflow
  assertEquals(edges[0].workflowName, "linear");
  assertEquals(edges[1].workflowName, "linear");

  // Last two from dag workflow
  assertEquals(edges[2].workflowName, "dag");
  assertEquals(edges[3].workflowName, "dag");
});

Deno.test("WorkflowLoader - loadAndProcess with edges format YAML", async () => {
  const tempFile = await Deno.makeTempFile({ suffix: ".yaml" });
  await Deno.writeTextFile(
    tempFile,
    `workflows:
  - name: linear_workflow
    steps: [A, B, C]
  - name: dag_workflow
    edges:
      - [X, Y]
      - [X, Z]
      - [Y, W]
      - [Z, W]
`,
  );

  const loader = new WorkflowLoader();
  const result = await loader.loadAndProcess(tempFile);

  assertEquals(result.workflows.length, 2);
  assertEquals(result.validWorkflows.length, 2);
  // linear: 2 edges, dag: 4 edges
  assertEquals(result.edges.length, 6);

  await Deno.remove(tempFile);
});
