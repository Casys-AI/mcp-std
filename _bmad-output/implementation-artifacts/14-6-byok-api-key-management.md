# Story 14.6: BYOK API Key Management (MVP)

Status: done

> **Epic:** 14 - JSR Package Local/Cloud MCP Routing
> **FR Coverage:** FR14-8 (BYOK), FR14-12 (Local API keys)
> **Prerequisites:** Story 14.3b (HIL Approval Flow)
> **Previous Story:** 14-5-sandboxed-local-mcp-execution.md

## Story

As a developer using PML,
I want missing API keys to trigger a prompt to configure them in `.env`,
So that I can add the key and continue without restarting.

## Context

**MVP Scope:** Local `.env` only. Cloud profile deferred.

**Flow:**
```
Tool call (tavily:search)
    │
    ▼ Check Deno.env.get("TAVILY_API_KEY")
    │
    ├─► Exists → Execute
    │
    └─► Missing → HIL pause
            │
            "Add TAVILY_API_KEY=xxx to .env"
            [Continue] [Abort]
            │
            ▼ User edits .env
            ▼ Clicks Continue
            │
            reloadEnv() → Re-check → Execute
```

## Acceptance Criteria

### AC1: Key Detection Before Execution

**Given** a tool call requiring `TAVILY_API_KEY`
**When** PML processes the request
**Then** it checks `Deno.env.get("TAVILY_API_KEY")` before execution
**And** blocks if missing (no network call attempted)

### AC2: HIL Prompt for Missing Key

**Given** required key is missing
**When** PML detects this
**Then** it returns:
```json
{
  "approval_required": true,
  "approval_type": "api_key_required",
  "workflow_id": "wf-uuid",
  "missing_keys": ["TAVILY_API_KEY"],
  "instruction": "Add TAVILY_API_KEY=your-key to .env file"
}
```

### AC3: Reload .env on Continue

**Given** user added key to `.env` and clicks Continue
**When** PML receives `continue_workflow`
**Then** it reloads `.env` file (`@std/dotenv` load)
**And** re-checks the key exists
**And** proceeds if valid, errors if still missing

### AC4: Multiple Keys Upfront

**Given** a capability needing multiple keys (TAVILY + EXA)
**When** checking before execution
**Then** ALL missing keys are reported in single HIL prompt
**And** user can configure all at once

### AC5: Key Validation

**Given** a key value in `.env`
**When** validating
**Then** reject empty strings
**And** reject placeholders: `xxx`, `your-key-here`, `TODO`, `CHANGE_ME`

### AC6: Key Sanitization

**Given** any log output or error message
**When** it might contain a key value
**Then** redact patterns: `*_API_KEY=*`, `sk-*`, `tvly-*`
**And** NEVER log actual key values

## Tasks / Subtasks

### Phase 1: Core Infrastructure (~1h)

- [x] Task 1: Create BYOK module structure
  - [x] Create `packages/pml/src/byok/mod.ts`
  - [x] Create `packages/pml/src/byok/types.ts`
  ```typescript
  export interface RequiredKey {
    name: string;
    requiredBy: string; // tool that needs it
  }

  export interface KeyCheckResult {
    allValid: boolean;
    missing: string[];
    invalid: string[]; // placeholder values
  }
  ```

- [x] Task 2: Implement env loader with reload
  - [x] Create `packages/pml/src/byok/env-loader.ts`
  ```typescript
  import { load } from "@std/dotenv";

  export async function reloadEnv(): Promise<void> {
    await load({ export: true, allowEmptyValues: false });
  }

  export function getKey(name: string): string | undefined {
    return Deno.env.get(name);
  }
  ```

### Phase 2: Key Detection & Validation (~1h)

- [x] Task 3: Implement key checker
  - [x] Create `packages/pml/src/byok/key-checker.ts`
  - [x] `checkKeys(required: RequiredKey[]): KeyCheckResult`
  - [x] Validate not empty, not placeholder

- [x] Task 4: Define tool-to-key mapping
  - [x] Create `packages/pml/src/byok/key-requirements.ts`
  ```typescript
  // MVP: hardcoded mapping (later: from registry metadata)
  export const TOOL_REQUIRED_KEYS: Record<string, string[]> = {
    "tavily:search": ["TAVILY_API_KEY"],
    "exa:search": ["EXA_API_KEY"],
    "exa:contents": ["EXA_API_KEY"],
    "anthropic:message": ["ANTHROPIC_API_KEY"],
    "openai:chat": ["OPENAI_API_KEY"],
  };
  ```

### Phase 3: HIL Integration (~1h)

- [x] Task 5: Add api_key_required to HIL types
  - [x] Modify `packages/pml/src/loader/types.ts`
  - [x] Add `approval_type: "api_key_required"`
  - [x] Add `missing_keys: string[]` to context

- [x] Task 6: Implement HIL pause for missing keys
  - [x] Create `packages/pml/src/byok/hil-integration.ts`
  - [x] `pauseForMissingKeys(missing: string[], workflowId: string)`
  - [x] Format instruction message

- [x] Task 7: Handle continue_workflow with reload
  - [x] On continue, call `reloadEnv()`
  - [x] Re-run `checkKeys()`
  - [x] Return error if still missing

### Phase 4: Sanitization (~45min)

- [x] Task 8: Implement key sanitizer
  - [x] Create `packages/pml/src/byok/sanitizer.ts`
  ```typescript
  const REDACT_PATTERNS = [
    /([A-Z_]+_API_KEY)=([^\s"']+)/gi,
    /(sk-ant-[a-zA-Z0-9-]+)/g,
    /(sk-[a-zA-Z0-9]+)/g,
    /(tvly-[a-zA-Z0-9]+)/g,
  ];

  export function sanitize(text: string): string {
    let result = text;
    for (const pattern of REDACT_PATTERNS) {
      result = result.replace(pattern, "[REDACTED]");
    }
    return result;
  }
  ```

- [x] Task 9: Wrap logging with sanitizer
  - [x] Create sanitized logger wrapper
  - [x] Apply to error messages

### Phase 5: Integration (~45min)

- [x] Task 10: Wire into CapabilityLoader
  - [x] Modify `packages/pml/src/loader/capability-loader.ts`
  - [x] Add key check before `executeInSandbox()`
  - [x] Return HIL response if keys missing

- [x] Task 13: Dynamic key detection from `mcpDeps[].envRequired`
  - [x] Modify `ensureDependency()` to use `checkKeys()` for `dep.envRequired`
  - [x] Return `ApiKeyApprovalRequired` HIL pause instead of throwing `LoaderError("ENV_VAR_MISSING")`
  - [x] Add 3 new tests for dynamic envRequired key detection

### Phase 6: Tests (~1h)

- [x] Task 11: Unit tests (92 passing)
  - [x] Test key checking (valid, missing, placeholder) - 27 tests
  - [x] Test env loader (reload, edge cases) - 17 tests
  - [x] Test sanitization patterns - 22 tests
  - [x] Test HIL integration - 14 tests
  - [x] Test full integration flow (real .env file I/O) - 12 tests

- [x] Task 12: Integration test
  - [x] Capability loader tests (16 passing)
  - [x] Full flow: missing → HIL → add to .env → continue → execute
  - [x] Dynamic envRequired detection tests (3 new tests)

## Dev Notes

### File Structure

```
packages/pml/src/byok/
├── mod.ts              # Exports
├── types.ts            # RequiredKey, KeyCheckResult
├── env-loader.ts       # Load/reload .env
├── key-checker.ts      # Check & validate keys
├── key-requirements.ts # Tool → keys mapping (hardcoded MVP)
├── hil-integration.ts  # HIL pause/continue logic
└── sanitizer.ts        # Redact keys from logs

packages/pml/tests/
├── byok_checker_test.ts       # 27 tests - key validation
├── byok_env_loader_test.ts    # 17 tests - env reload, edge cases
├── byok_hil_test.ts           # 14 tests - HIL flow
├── byok_integration_test.ts   # 12 tests - full flow with real .env
├── byok_sanitizer_test.ts     # 22 tests - key redaction
└── capability_loader_test.ts  # 16 tests - includes 3 envRequired tests
```

### Placeholder Detection

```typescript
const INVALID_PATTERNS = [
  /^$/,                        // Empty
  /^x{2,}$/i,                  // xxx, XXX
  /^your[-_]?key/i,            // your-key, your_key
  /^<.*>$/,                    // <your-key>
  /^TODO/i,                    // TODO
  /^CHANGE[-_]?ME/i,           // CHANGE_ME
  /^placeholder/i,             // placeholder
];
```

### Integration Points

**1. Hardcoded tool keys (MVP):**
```typescript
// packages/pml/src/loader/capability-loader.ts - call()

async call(toolId: string, args: unknown): Promise<unknown> {
  // Check required keys from hardcoded mapping
  const requiredKeys = getRequiredKeys(toolId);
  const keyCheck = checkKeys(requiredKeys);
```

**2. Dynamic keys from registry metadata:**
```typescript
// packages/pml/src/loader/capability-loader.ts - ensureDependency()

// Story 14.6: Check required env vars from registry metadata
if (dep.envRequired && dep.envRequired.length > 0) {
  const requiredKeys = dep.envRequired.map((name) => ({
    name,
    requiredBy: dep.name,
  }));
  const keyCheck = checkKeys(requiredKeys);

  if (!keyCheck.allValid) {
    // Return HIL pause instead of throwing error
    const approval = pauseForMissingKeys(keyCheck);
    this.pendingApiKeyApprovals.set(approval.workflowId, approval);
    return approval;
  }
}
```

### HIL Response Format

```json
{
  "jsonrpc": "2.0",
  "id": "req-123",
  "result": {
    "approval_required": true,
    "approval_type": "api_key_required",
    "workflow_id": "wf-456",
    "context": {
      "missing_keys": ["TAVILY_API_KEY", "EXA_API_KEY"],
      "instruction": "Add the following to your .env file:\nTAVILY_API_KEY=your-tavily-key\nEXA_API_KEY=your-exa-key"
    }
  }
}
```

## Estimation

- **Effort:** 1-2 days
- **LOC:** ~350 lines
- **Risk:** Low (simple file I/O + existing HIL pattern)

## Important Notes

### Workspace-Relative .env Path

Le `.env` doit être lu depuis le **workspace de l'utilisateur**, pas un chemin hardcodé:

```typescript
// packages/pml/src/byok/env-loader.ts
import { load } from "@std/dotenv";
import { join } from "@std/path";

export async function reloadEnv(workspace: string): Promise<void> {
  const envPath = join(workspace, ".env");
  await load({ envPath, export: true, allowEmptyValues: false });
}
```

**Pourquoi:** Le binaire compilé (`deno compile`, Story 14.11) doit pouvoir lire le `.env` externe du projet utilisateur. Le fichier n'est pas embarqué dans le binaire.

## Deferred to Future Story

- Cloud profile key storage (`pml.casys.ai/settings/keys`)
- Registry metadata for `env_required` (currently hardcoded)
- Key prefix validation (e.g., TAVILY must start with `tvly-`)

---

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-01-07 | Story created (original: HTTP server) | Claude Opus 4.5 |
| 2026-01-07 | Rewrite #1: BYOK + security focus | Claude Opus 4.5 |
| 2026-01-07 | Rewrite #2: MVP scope (.env only, no cloud) | Claude Opus 4.5 |
| 2026-01-07 | Implementation complete - 76 tests passing | Claude Opus 4.5 |
| 2026-01-07 | Added dynamic envRequired key detection - 79 tests passing | Claude Opus 4.5 |
| 2026-01-07 | Code review: Fixed env-loader overwrite bug, added 108 tests total | Claude Opus 4.5 |

### File List

**New Files:**
- packages/pml/src/byok/mod.ts
- packages/pml/src/byok/types.ts
- packages/pml/src/byok/env-loader.ts
- packages/pml/src/byok/key-checker.ts
- packages/pml/src/byok/key-requirements.ts
- packages/pml/src/byok/hil-integration.ts
- packages/pml/src/byok/sanitizer.ts
- packages/pml/tests/byok_checker_test.ts
- packages/pml/tests/byok_env_loader_test.ts
- packages/pml/tests/byok_hil_test.ts
- packages/pml/tests/byok_integration_test.ts
- packages/pml/tests/byok_sanitizer_test.ts

**Modified Files:**
- packages/pml/src/loader/capability-loader.ts
- packages/pml/src/loader/types.ts
