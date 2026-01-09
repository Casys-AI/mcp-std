---
title: 'PML Execute Hybrid Routing'
slug: 'pml-execute-hybrid-routing'
created: '2026-01-09'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - Deno
  - TypeScript
  - MCP (JSON-RPC)
  - SWC (static analysis)
files_to_modify:
  - src/mcp/handlers/code-execution-handler.ts
  - src/mcp/server/mcp-server.ts
  - packages/pml/src/cli/stdio-command.ts
  - packages/pml/src/execution/sandbox-executor.ts (NEW)
  - packages/pml/src/execution/types.ts (NEW)
  - packages/pml/src/execution/mod.ts (NEW)
  - packages/pml/src/loader/capability-loader.ts (refactor)
  - tests/e2e/pml-execute-hybrid-routing.test.ts (NEW)
code_patterns:
  - Server-side routing resolution via resolveRouting()
  - Package sandbox execution via SandboxWorker
  - MCP JSON-RPC over HTTP with forwardToCloud()
  - Parsing without execution (StaticStructureBuilder → DAG)
test_patterns:
  - E2E tests for routing scenarios
  - Unit tests for routing check logic
---

# Tech-Spec: PML Execute Hybrid Routing

**Created:** 2026-01-09

## Overview

### Problem Statement

`pml:execute` forwards all code execution requests directly to the cloud server, which executes using its own MCP clients. When code contains "client" tools (filesystem, shell, git, etc.), execution fails because the server tries to access files on its own filesystem instead of the user's machine.

Current error example:
```json
{
  "status": "success",
  "toolFailures": [{
    "tool": "task_n1",
    "error": "ENOENT: no such file or directory, open '/home/user/file.txt'"
  }]
}
```

### Solution

Implement hybrid routing for `pml:execute`:
1. Server analyzes code (SWC → StaticStructure → DAG)
2. Server checks routing for each tool in the DAG using `resolveRouting()`
3. If ALL tools are "server" → execute on server (current behavior)
4. If ANY tool is "client" → return `execute_locally` response to package
5. Package executes locally via SandboxWorker with hybrid mcp.* routing

### Scope

**In Scope:**
- Server-side routing check after DAG analysis
- New `execute_locally` response type
- Package-side handling of `execute_locally`
- New `executeLocalCode()` function in package
- Header `X-PML-Client: package` for client identification
- Clear error message for clients without package

**Out of Scope:**
- MCP Streamable HTTP transport (future evolution)
- Full local parsing in package (future evolution)
- Bidirectional MCP callbacks (future evolution)
- Changes to routing configuration

## Context for Development

### Codebase Patterns

**Server-side routing:**
- `src/capabilities/routing-resolver.ts` has `resolveRouting(toolsUsed: string[])`
- Returns "client" if ANY tool requires local execution
- Returns "server" if ALL tools can run on cloud
- Config loaded from `config/mcp-routing.json`

**Package sandbox execution:**
- `packages/pml/src/loader/capability-loader.ts` has `executeInSandbox()`
- Uses `SandboxWorker` with `onRpc` callback for mcp.* routing
- `routeMcpCall()` handles hybrid routing (client → local, server → cloud)

**Current bypass:**
- `packages/pml/src/cli/stdio-command.ts:367-369` forwards `pml:execute` directly to cloud
- Skips all local routing and sandbox infrastructure

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `src/mcp/handlers/code-execution-handler.ts` | Server-side code execution, DAG building |
| `src/capabilities/routing-resolver.ts` | `resolveRouting()`, `getToolRouting()` |
| `config/mcp-routing.json` | Client/server tool lists |
| `packages/pml/src/cli/stdio-command.ts` | Package MCP handler, `forwardToCloud()` |
| `packages/pml/src/loader/capability-loader.ts` | `executeInSandbox()`, `routeMcpCall()` |
| `packages/pml/src/sandbox/mod.ts` | `SandboxWorker` class |
| `packages/pml/src/routing/resolver.ts` | Package-side `resolveToolRouting()` |

### Technical Decisions

1. **Option A chosen over alternatives:**
   - Server parse + routing check → package execute when needed
   - Keeps parsing infrastructure centralized on server
   - Reuses existing sandbox in package

2. **Header-based client detection (F1 - Security clarification):**
   - Package sends `X-PML-Client: package` header
   - Server returns `execute_locally` only if header present
   - **NOT a security boundary** - header can be spoofed
   - Purpose: UX optimization (clear error for web users), not access control
   - Actual security: API key authentication on all requests

3. **HTTP transport retained:**
   - Current HTTP POST to `/mcp` endpoint is sufficient
   - MCP Streamable HTTP is a future evolution

4. **Code execution, not DAG (F4 - Clarification):**
   - Package executes the `code` string from `execute_locally` response
   - `dag` and `tools_used` are included for debugging/validation only
   - SandboxWorker parses and executes the code directly
   - No DAG executor needed in package

5. **Auth token propagation (F7):**
   - `SandboxExecutor` receives `apiKey` from environment (`PML_API_KEY`)
   - `callCloud()` uses same auth as `forwardToCloud()`
   - No additional auth needed for server-routed tools during local execution

## Implementation Plan

### Tasks (TDD Order)

#### Task 1: Tests - Write failing E2E tests first (~2h)

**New file:** `tests/e2e/pml-execute-hybrid-routing.test.ts`

**Test cases to write (all should fail initially):**

*Happy path:*
1. `server-only-tools`: Code with 100% server tools → executed on server
2. `client-tools-with-package`: Code with client tools + header → `execute_locally`
3. `client-tools-without-package`: Code with client tools, no header → error
4. `mixed-tools`: Code with both → hybrid routing works
5. `header-present`: Package sends `X-PML-Client: package`

*Edge cases (F8):*
6. `empty-code`: Empty code string → appropriate error
7. `syntax-error`: Invalid code → parse error from server
8. `sandbox-timeout`: Code that runs too long → timeout error
9. `rpc-timeout`: Tool call that hangs → RPC timeout error

*Negative tests (F14):*
10. `unknown-tool`: Code calls non-existent tool → error
11. `permission-denied`: Sandbox tries forbidden operation → permission error
12. `network-error`: Cloud call fails → network error propagated

---

#### Task 2: Package - Extract SandboxExecutor module (~2h)

**New files:**
- `packages/pml/src/execution/sandbox-executor.ts`
- `packages/pml/src/execution/types.ts`
- `packages/pml/src/execution/mod.ts`

**SandboxExecutor class:**
```typescript
export class SandboxExecutor {
  constructor(
    private loader: CapabilityLoader,
    private cloudUrl: string,
  ) {}

  async execute(code: string, context?: Record<string, unknown>): Promise<SandboxResult> {
    const sandbox = new SandboxWorker({
      onRpc: (toolId, args) => this.routeCall(toolId, args)
    });
    try {
      return await sandbox.execute(code, context ?? {});
    } finally {
      sandbox.shutdown();
    }
  }

  private async routeCall(toolId: string, args: unknown): Promise<unknown> {
    const routing = resolveToolRouting(toolId);
    if (routing === "client") {
      return this.loader.call(toolId, args);
    }
    return this.callCloud(toolId, args);
  }

  private async callCloud(toolId: string, args: unknown): Promise<unknown> {
    // HTTP forward to cloudUrl
  }
}
```

**Refactor CapabilityLoader:**
- Replace `executeInSandbox()` implementation to use `SandboxExecutor`
- Keep same public interface

---

#### Task 3: Package - Add header + handle execute_locally (~1h)

**File:** `packages/pml/src/cli/stdio-command.ts`

**Changes:**
1. Add `X-PML-Client: package` header in `forwardToCloud()`
2. Change return type to `Promise<unknown>` (return instead of sendResponse)
3. In `pml:execute` handler, detect `execute_locally` response
4. If `execute_locally` → use `SandboxExecutor.execute()`

```typescript
if (name === "pml:execute") {
  const response = await forwardToCloud(id, name, args || {}, cloudUrl);
  const content = response?.result?.content?.[0]?.text;

  if (content) {
    const parsed = JSON.parse(content);
    if (parsed.status === "execute_locally") {
      const executor = new SandboxExecutor(loader, cloudUrl);
      const result = await executor.execute(parsed.code);
      sendResponse({ jsonrpc: "2.0", id, result: formatResult(result) });
      return;
    }
  }

  sendResponse(response);
  return;
}
```

---

#### Task 4: Server - Add routing check + header detection (~2h)

**File:** `src/mcp/handlers/code-execution-handler.ts`

**Location:** After line ~219 (after `optimizedDAG`, before `createToolExecutorViaWorker`)

**Changes:**
1. Import `resolveRouting`, `getToolRouting` from `../../capabilities/routing-resolver.ts`
2. Get `isPackageClient` from request headers (needs plumbing from MCP router)
3. Add routing check:

```typescript
const toolsUsed = optimizedDAG.tasks.map((t) => t.tool);
const routing = resolveRouting(toolsUsed);

if (routing === "client") {
  if (isPackageClient) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "execute_locally",
          code: request.code,
          dag: { tasks: optimizedDAG.tasks },
          tools_used: toolsUsed,
          client_tools: toolsUsed.filter(t => getToolRouting(t) === "client"),
        })
      }]
    };
  } else {
    return formatMCPToolError(
      "Client tools require PML package. Install: deno install -Agf jsr:@casys/pml",
      { error_code: "CLIENT_TOOLS_REQUIRE_PACKAGE", client_tools }
    );
  }
}
```

---

#### Task 5: Server - Plumb headers to handler (~1h)

**Files:**
- `src/mcp/server/mcp-server.ts` (or router)
- `src/mcp/handlers/code-execution-handler.ts`

**Changes:**
1. Extract `X-PML-Client` header in MCP router
2. Pass `isPackageClient: boolean` to `handleExecuteCode()`
3. Update `CodeExecutionDependencies` type if needed

---

#### Task 6: Tests - Verify all tests pass (~1h)

**Run tests and fix any issues:**
1. All 5 E2E test cases pass
2. Existing tests still pass (no regression)
3. Manual test with real package → server flow

### Acceptance Criteria

#### AC1: Server executes code with 100% server tools
- [ ] **Given** code containing only server-routed tools (e.g., `mcp.json.parse()`, `mcp.tavily.search()`)
- [ ] **When** `pml:execute` is called with this code
- [ ] **Then** server executes the code and returns the result directly (no `execute_locally`)

#### AC2: Server delegates code with client tools to package
- [ ] **Given** code containing at least one client-routed tool (e.g., `mcp.filesystem.read_file()`)
- [ ] **And** request includes `X-PML-Client: package` header
- [ ] **When** `pml:execute` is called with this code
- [ ] **Then** server returns `{ status: "execute_locally", code, dag, tools_used, client_tools }`

#### AC3: Server returns error for client tools without package
- [ ] **Given** code containing client-routed tools
- [ ] **And** request does NOT include `X-PML-Client: package` header
- [ ] **When** `pml:execute` is called with this code
- [ ] **Then** server returns error with `CLIENT_TOOLS_REQUIRE_PACKAGE` code and install instructions

#### AC4: Package executes locally when receiving execute_locally
- [ ] **Given** package receives `execute_locally` response from server
- [ ] **When** package processes the response
- [ ] **Then** package executes code via `SandboxWorker` with hybrid routing
- [ ] **And** returns the execution result to Claude

#### AC5: Package routes client tools locally during execution
- [ ] **Given** code executing in package sandbox calls a client tool (e.g., `mcp.filesystem.read_file()`)
- [ ] **When** the `onRpc` callback is invoked
- [ ] **Then** package routes to local execution via `loader.call()` or stdio subprocess
- [ ] **And** the tool accesses the user's filesystem (not server's)

#### AC6: Package routes server tools to cloud during execution
- [ ] **Given** code executing in package sandbox calls a server tool (e.g., `mcp.json.parse()`)
- [ ] **When** the `onRpc` callback is invoked
- [ ] **Then** package forwards the call to cloud via HTTP
- [ ] **And** returns the cloud response to the sandbox

#### AC7: Mixed tool execution works correctly
- [ ] **Given** code containing both client and server tools
- [ ] **When** `pml:execute` is called and package executes locally
- [ ] **Then** each tool is routed correctly (client → local, server → cloud)
- [ ] **And** the final result combines all tool outputs correctly

#### AC8: Package sends X-PML-Client header
- [ ] **Given** package makes HTTP request to server via `forwardToCloud()`
- [ ] **When** the request is sent
- [ ] **Then** request includes `X-PML-Client: package` header

## Additional Context

### Dependencies

- Spike document: `_bmad-output/planning-artifacts/spikes/spike-2026-01-09-pml-execute-hybrid-routing.md`
- Epic 14: JSR Package + Local/Cloud MCP Routing
- Related stories: 14.4 (Dynamic MCP Loader), 14.5 (Sandboxed Execution)

### Testing Strategy

**Unit Tests:**
- `resolveRouting()` with various tool combinations
- `executeLocalCode()` with mocked SandboxWorker
- Header detection logic

**Integration Tests:**
- Server returns `execute_locally` for client tools
- Package correctly handles `execute_locally` response

**E2E Tests:**
- Full flow: Claude → Package → Server → Package (execute) → Claude
- Tools: `filesystem:read_file`, `json:parse`, mixed scenarios
- Error cases: missing header, unknown tools

### Notes

- Package is already 3.9 GB compiled, so size is not a concern for future optimizations
- Estimated effort: ~1.5 days (4h server + 4h package + 4h tests)
- Direct tool calls (not via `pml:execute`) already work correctly via CapabilityLoader
- `pml:execute` is the only path that bypasses routing

---

## Adversarial Review Findings

### Critical

| ID | Finding | Status | Resolution |
|----|---------|--------|------------|
| F1 | **Header spoofing** - `X-PML-Client` peut être usurpé. Pas de security boundary. | ✅ RESOLVED | Clarified in Technical Decisions #2 - header is UX hint, not security. API key is the auth. |
| F2 | **No error handling** - `SandboxExecutor.execute()` sans try/catch, timeout, partial failure | ✅ EXISTS | `SandboxWorker.execute()` has full error handling with `formatError()` returning `SandboxError` with codes: `EXECUTION_TIMEOUT`, `PERMISSION_DENIED`, `WORKER_TERMINATED`, `CODE_ERROR` |
| F3 | **No timeout/limits** - Exécution locale sans timeout ni limites mémoire/CPU | ✅ EXISTS | `SANDBOX_EXECUTION_TIMEOUT_MS` = 5 min, `SANDBOX_RPC_TIMEOUT_MS` = 30s per call. Worker runs with `permissions: "none"`. |

### High

| ID | Finding | Status | Resolution |
|----|---------|--------|------------|
| F4 | **DAG vs Code confusion** - Response contient `code` ET `dag`, on exécute quoi ? | ✅ RESOLVED | Clarified in Technical Decisions #4 - execute `code`, `dag` is for debug only |
| F5 | **Partial failure handling** - Que faire si tool 3/5 échoue dans mixed execution ? | ✅ EXISTS | RPC error sent back to sandbox → code decides: catch and continue or throw. Same behavior as current capabilities. |
| F14 | **ACs missing negative tests** - Aucun AC pour syntax error, sandbox crash, permission denied | ✅ RESOLVED | Added 7 edge case + negative tests to Task 1 |

### Medium

| ID | Finding | Status | Resolution |
|----|---------|--------|------------|
| F6 | **No retry logic** - `callCloud()` échoue définitivement sur erreur réseau | ❌ WONTFIX | No retry by design - fail fast, let caller handle |
| F7 | **Auth token propagation** - Comment `callCloud()` authentifie ? | ✅ RESOLVED | Clarified in Technical Decisions #5 - uses PML_API_KEY from env |
| F8 | **Tests edge cases** - Manque: code vide, crash sandbox, timeout réseau, concurrent | ✅ RESOLVED | Added 7 edge case + negative tests to Task 1 |
| F10 | **No observability** - Pas de logging pour savoir quel path a été pris | ✅ EXISTS | `logDebug()` in SandboxWorker logs all operations, RPC calls, errors. Package-side logging. |
| F11 | **No versioning** - Server upgrade peut casser packages installés | ⚠️ FUTURE | Out of scope - add to future evolutions |
| F13 | **Concurrency model** - SandboxWorker supporte l'exécution concurrente ? | ✅ EXISTS | One worker instance per `SandboxExecutor.execute()` call. Worker reused if not terminated. Sequential execution within one executor. |

### Low

| ID | Finding | Status | Resolution |
|----|---------|--------|------------|
| F9 | **static_structure inconsistent** - AC2 mentionne mais code Task 4 ne l'inclut pas | ✅ RESOLVED | Removed from AC2 - not needed for execution |
| F12 | **Tool ID format** - `mcp.filesystem.read_file()` vs `filesystem:read_file` | ✅ RESOLVED | `mcp.namespace.action()` is code syntax, `namespace:action` is tool ID. Transformation happens in sandbox RPC bridge. |
| F15 | **Time estimates** - "~2h" sont des estimations sans base | ❌ WONTFIX | Acceptable for planning |

### Summary

- **12 RESOLVED/EXISTS** - Already handled by existing code or clarified in spec
- **2 WONTFIX** - F6, F15 (by design)
- **1 FUTURE** - F11 (versioning - out of scope)

**All critical and high findings addressed. Spec is ready for development.**

---

## Implementation Notes (2026-01-09)

### Architectural Decision: Routing Check in Use Case (not Gateway)

The routing check for hybrid execution is implemented in `ExecuteDirectUseCase`, not in `gateway-server.ts`.

**Rationale:**
1. **Clean Architecture**: The use case already performs static analysis via `StaticStructureBuilder`. Adding the routing check there avoids duplicate parsing.
2. **Single Responsibility**: Gateway handles HTTP routing/auth; use case handles business logic (including execution routing).
3. **Testability**: Use case can be unit tested in isolation without HTTP layer.

**Implementation:**
```typescript
// In ExecuteDirectUseCase.execute(), after Step 5 (optimize DAG):

// Step 5.5: Hybrid routing check
const toolsUsed = optimizedDAG.tasks
  .map((t) => t.tool)
  .filter((t) => t && !t.startsWith("code:"));

if (toolsUsed.length > 0) {
  const routing = resolveRouting(toolsUsed);
  if (routing === "client") {
    const isPackageClient = options.isPackageClient ?? false;
    if (isPackageClient) {
      return { success: true, data: { mode: "execute_locally", code, toolsUsed, clientTools } };
    } else {
      return { success: false, error: { code: "CLIENT_TOOLS_REQUIRE_PACKAGE" } };
    }
  }
}
```

### toolsUsed includes both MCP Tools and Capabilities

In the static structure, "task" nodes have a `tool` field that can be:
- **MCP tools**: `filesystem:read_file`, `json:parse`
- **Capabilities**: `namespace:action` (same format)
- **Pseudo-tools**: `code:add` (filtered out - pure TypeScript)

The routing resolver treats all of these uniformly - any tool/capability not in the server whitelist routes to client.

### Files Modified

| File | Change |
|------|--------|
| `src/application/use-cases/execute/types.ts` | Added `isPackageClient` option, `execute_locally` mode, and response fields |
| `src/application/use-cases/execute/execute-direct.use-case.ts` | Added routing check after DAG optimization (Step 5.5) |
| `src/mcp/handlers/execute-handler-facade.ts` | Pass `isPackageClient` to use case, handle `execute_locally` response |
| `src/mcp/gateway-server.ts` | Removed routing check, pass `isPackageClient` to facade |

### OPEN: External MCP Tools in Hybrid Execution

**Issue discovered 2026-01-09:**

When the package receives `execute_locally` for code containing external MCP tools (filesystem, git, etc.), it fails with "Capability not found" because:

1. Server correctly detects client tools → returns `execute_locally`
2. Package tries to execute locally via `routeMcpCall()`
3. `routeMcpCall()` checks for declared `mcpDeps` (none for ad-hoc code)
4. Falls through to `this.call()` which tries to load as capability
5. Registry returns 404 - external MCP tools aren't capabilities

**Current behavior:**
```json
{
  "status": "error",
  "error": "Capability not found: pml.mcp.filesystem.read_file",
  "executed_locally": true
}
```

**Options to explore:**

A) **Package spawns MCP servers** - Load config from `.mcp-servers.json`, spawn subprocess via StdioManager
   - Pro: Full local execution
   - Con: Duplicates Claude Code's MCP management, needs config sync

B) **Better error message** - Detect known MCP namespaces, return clear error
   - Pro: Simple, explicit
   - Con: User must re-invoke via Claude Code directly

C) **Proxy through Claude Code** - Package asks Claude Code to execute the MCP call
   - Pro: Reuses existing infrastructure
   - Con: Complex IPC, may not be possible with current architecture

D) **Hybrid DAG return** - Server returns DAG with markers for which tasks are client vs server
   - Pro: Client can execute only client tasks, server handles rest
   - Con: Requires DAG splitting, complex orchestration

**Decision needed:** Which approach aligns with PML architecture goals?
