# Spike: Static Structure Missing Edges for Sequential MCP Calls

**Date:** 2025-01-07
**Status:** Open
**Priority:** Medium
**Reporter:** User observation on capability `playwright:exec_ecc3a79d`

## Problem Statement

Capabilities generated from sequential MCP calls without explicit data dependencies are missing:
- `sequence` edges between nodes
- `provides` edges for data flow
- `layers` / `hierarchyLevel` for topological ordering

## Example Code

```typescript
// capability: playwright:exec_ecc3a79d
await mcp.playwright.browser_navigate({ url: args.url });
await mcp.playwright.browser_resize({ width: args.width, height: args.height });
const _n3 = await mcp.playwright.browser_take_screenshot({
  filename: args.filename,
  fullPage: args.fullPage
});
const _n4 = await mcp.playwright.browser_snapshot({});
return { _n3, _n4 };
```

**Expected:** Edges n1→n2→n3→n4 (sequence) + provides edges
**Actual:** No edges generated

## Root Cause Analysis

### Bug #1: `generateSequenceEdges` requires data dependency

**File:** `src/capabilities/static-structure/edge-generators.ts:154-162`

```typescript
// Only create sequence edge if there's a real data dependency
if (!nodeReferencesNode(targetNode, from.id)) {
  logger.debug("Skipping sequence edge - no data dependency", {...});
  continue;  // ← SKIPS edge creation
}
```

`browser_resize` args don't reference `browser_navigate` result → no edge created.

**Issue:** Implicit state dependencies (browser context) are not captured. Sequential await statements may have ordering requirements even without explicit data flow.

### Bug #2: `generateProvidesEdges` requires tool schemas

**File:** `src/capabilities/static-structure/edge-generators.ts:344-346`

```typescript
if (!providerSchema?.outputSchema || !consumerSchema?.inputSchema) {
  continue;  // ← SKIPS if no schema in tool_schema table
}
```

Playwright tools likely don't have schemas registered in `tool_schema` table → no provides edges.

### Bug #3: No `layers` calculation

No code in `edge-generators.ts` computes `layers` or `hierarchyLevel`. This should be a topological sort based on edges, but with 0 edges, layers would all be 0.

## Impact

- SHGAT cannot learn proper execution order for stateful tool sequences
- DAG optimizer may incorrectly parallelize sequential operations
- Capability graph visualization shows disconnected nodes

## Investigation Areas

1. **Implicit dependencies:** How to detect tools that share state (browser, session, transaction)?
   - Option A: Tool metadata flag `requiresSequentialExecution: true`
   - Option B: Tool namespace grouping (all `playwright:*` are sequential)
   - Option C: Always create sequence edges for await statements in same scope

2. **Schema population:** Are playwright tools missing from `tool_schema`?
   - Check: `SELECT * FROM tool_schema WHERE tool_id LIKE 'playwright:%'`

3. **Layers calculation:** Where should hierarchyLevel be computed?
   - After edge generation in `StaticStructureBuilder.buildStaticStructure()`
   - Via topological sort on the edge graph

## Related Files

- `src/capabilities/static-structure/edge-generators.ts`
- `src/capabilities/static-structure-builder.ts`
- `src/graphrag/provides-edge-calculator.ts`

---

## Investigation Findings (2025-01-07)

### Finding 1: Argument extraction works correctly

**File:** `src/capabilities/static-structure-builder.ts:1284-1327`

The argument type detection is correct:

```typescript
// Line 1289: args.xxx → parameter type (correct)
if (chain.length >= 2 && ["args", "params", "input"].includes(chain[0])) {
  return { type: "parameter", parameterName: chain[1] };
}

// Line 1296: variable.xxx → reference type with nodeId conversion (correct)
const nodeId = this.variableToNodeId.get(variableName);
if (nodeId) {
  return { type: "reference", expression: nodeId };  // e.g., "n1.content"
}
```

**Conclusion:** NOT A BUG. The extraction correctly identifies:
- `args.url` → `{ type: "parameter", parameterName: "url" }`
- `result.content` → `{ type: "reference", expression: "n1.content" }` (if `result` was assigned from node n1)

### Finding 2: The real issue is implicit state dependencies

The playwright code has **no data flow** between calls:

```typescript
browser_navigate({ url: args.url })     // n1 - args from params
browser_resize({ width: args.width })   // n2 - args from params, NOT from n1
browser_take_screenshot({ ... })        // n3 - args from params, NOT from n2
```

Each tool receives its arguments from capability parameters (`args.xxx`), not from previous node results. The system correctly detects this as "no data dependency".

**The problem:** These tools share **implicit state** (browser context) that isn't visible in the argument structure. The browser MUST be navigated before resizing, resized before screenshotting - but this ordering is enforced by external state, not data flow.

### Finding 3: `hierarchyLevel` vs `layers` clarification

- `hierarchyLevel` = meta-capability nesting (capability A calls capability B)
- `layers` = topological ordering within a single capability's DAG

`layers` should be computed from sequence edges via topological sort. With 0 edges, all nodes get layer 0.

### Proposed Solutions

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Always create sequence edges for sequential awaits | Simple, preserves execution order | May over-constrain parallelizable code |
| B | Namespace-based "stateful" annotation | Precise, opt-in per namespace | Requires manual config |
| C | New edge type `control_flow` (distinct from `sequence`) | Separates data vs control deps | More complex graph |

---

## Acceptance Criteria (when fixed)

- [ ] Sequential await statements create sequence edges (even without data refs)
- [ ] Provides edges created based on variable usage (not just schema matching)
- [ ] `layers` populated via topological sort
- [ ] Tests cover stateful tool sequences (playwright, database transactions)
