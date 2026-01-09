/**
 * DR-DSP Aligned Model Tests
 *
 * Tests for the new aligned DR-DSP model where capabilities are nodes.
 *
 * @module tests/unit/graphrag/algorithms/dr-dsp-aligned
 */

import { assertEquals, assertExists } from "@std/assert";
import { buildDRDSPAligned } from "../../../../src/graphrag/algorithms/dr-dsp.ts";

// Test data: tools and capabilities
const testTools = [
  { id: "fs:read" },
  { id: "fs:write" },
  { id: "json:parse" },
  { id: "json:stringify" },
  { id: "http:get" },
];

const testCapabilities = [
  {
    id: "cap:readJson",
    toolsUsed: ["fs:read", "json:parse"],
    successRate: 0.95,
  },
  {
    id: "cap:writeJson",
    toolsUsed: ["json:stringify", "fs:write"],
    successRate: 0.90,
  },
  {
    id: "cap:fetchData",
    toolsUsed: ["http:get", "json:parse"],
    successRate: 0.85,
  },
  {
    id: "cap:pipeline", // Meta-capability
    toolsUsed: [],
    children: ["cap:fetchData", "cap:writeJson"],
    hierarchyLevel: 1,
    successRate: 0.80,
  },
];

Deno.test("buildDRDSPAligned - creates tool nodes", () => {
  const drdsp = buildDRDSPAligned(testTools, testCapabilities);
  
  const toolNodes = drdsp.getToolNodes();
  assertEquals(toolNodes.size, 5, "Should have 5 tool nodes");
  
  const fsRead = drdsp.getNode("fs:read");
  assertExists(fsRead);
  assertEquals(fsRead.type, "tool");
  assertEquals(fsRead.hierarchyLevel, 0);
});

Deno.test("buildDRDSPAligned - creates capability nodes", () => {
  const drdsp = buildDRDSPAligned(testTools, testCapabilities);
  
  const capNodes = drdsp.getCapabilityNodes();
  assertEquals(capNodes.size, 4, "Should have 4 capability nodes");
  
  const readJson = drdsp.getNode("cap:readJson");
  assertExists(readJson);
  assertEquals(readJson.type, "capability");
  assertEquals(readJson.successRate, 0.95);
});

Deno.test("buildDRDSPAligned - creates contains hyperedges", () => {
  const drdsp = buildDRDSPAligned(testTools, testCapabilities);
  
  const stats = drdsp.getStats();
  // Each capability creates 2 hyperedges (contains + invokes) = 4 * 2 = 8
  // Plus parent->child for pipeline = 2 more
  assertEquals(stats.hyperedgeCount >= 8, true, "Should have at least 8 hyperedges");
});

Deno.test("buildDRDSPAligned - finds path capability to tool", () => {
  const drdsp = buildDRDSPAligned(testTools, testCapabilities);
  
  // Path from cap:readJson to fs:read (capability -> tool it contains)
  const result = drdsp.findShortestHyperpath("cap:readJson", "fs:read");
  
  assertEquals(result.found, true, "Should find path from capability to its tool");
  assertEquals(result.nodeSequence.includes("cap:readJson"), true);
  assertEquals(result.nodeSequence.includes("fs:read"), true);
});

Deno.test("buildDRDSPAligned - finds path tool to capability", () => {
  const drdsp = buildDRDSPAligned(testTools, testCapabilities);
  
  // Path from fs:read to cap:readJson (tool -> capability that uses it)
  const result = drdsp.findShortestHyperpath("fs:read", "cap:readJson");
  
  assertEquals(result.found, true, "Should find path from tool to capability");
});

Deno.test("buildDRDSPAligned - finds path capability to capability via tools", () => {
  const drdsp = buildDRDSPAligned(testTools, testCapabilities);
  
  // Path from cap:readJson to cap:writeJson
  // Should go through json:parse (shared parsing concept) or via tools
  const result = drdsp.findShortestHyperpath("cap:readJson", "cap:writeJson");
  
  // This tests capability -> capability pathfinding
  // Even if not direct, it should find a path through the tools
  assertEquals(result.found, true, "Should find path between capabilities");
});

Deno.test("buildDRDSPAligned - finds path through meta-capability", () => {
  const drdsp = buildDRDSPAligned(testTools, testCapabilities);
  
  // Path from cap:pipeline to cap:fetchData (parent -> child)
  const result = drdsp.findShortestHyperpath("cap:pipeline", "cap:fetchData");
  
  assertEquals(result.found, true, "Should find path from meta-cap to child");
});

Deno.test("buildDRDSPAligned - handles co-occurrence edges", () => {
  const cooccurrences = [
    { from: "fs:read", to: "json:parse", weight: 0.5 },
    { from: "json:parse", to: "http:get", weight: 0.8 },
  ];
  
  const drdsp = buildDRDSPAligned(testTools, testCapabilities, cooccurrences);
  
  const stats = drdsp.getStats();
  // Should have additional sequence edges
  assertEquals(stats.hyperedgeCount >= 10, true, "Should have extra edges from co-occurrence");
});

Deno.test("buildDRDSPAligned - getNodesByType works correctly", () => {
  const drdsp = buildDRDSPAligned(testTools, testCapabilities);
  
  const tools = drdsp.getNodesByType("tool");
  const caps = drdsp.getNodesByType("capability");
  
  assertEquals(tools.length, 5);
  assertEquals(caps.length, 4);
});
