# Tech Spec: User Documentation Audit & Correction

**Date**: 2026-01-08
**Author**: Claude (Paige - Tech Writer)
**Status**: In Progress

## Problem Statement

The user documentation in `docs/user-docs/` contains numerous obsolete references that no longer match the current codebase:

1. **Deprecated meta-tools** documented as primary API (`pml:execute_dag`, `pml:search_tools`, etc.)
2. **New unified API** (`pml:discover`, `pml:execute`) not documented
3. **Incorrect response structures** in examples
4. **Wrong error codes** (codes that don't exist in source)
5. **Incorrect limits** (Workflow TTL documented as 5 min, actual is 1 hour)
6. **Missing features** (SHGAT, Thompson Sampling, MiniTools, etc.)

## Scope

### Files to Update

| Priority | File | Status |
|----------|------|--------|
| 1 | `reference/01-mcp-tools.md` | In Progress |
| 2 | `getting-started/01-installation.md` | Pending |
| 3 | `getting-started/02-quickstart.md` | Pending |
| 4 | `reference/02-configuration.md` | Pending |
| 5 | `reference/03-cli.md` | Pending |

### Out of Scope (Future Work)

- `concepts/` section (SHGAT, Thompson Sampling documentation)
- New documentation for MiniTools library
- Architecture diagrams update

## Approach

### Methodology

1. **Verify against code** - Every documented parameter, response, and limit is checked against source
2. **Agile updates** - Update one file at a time, review section by section
3. **Fix bugs found** - If documentation reveals dead code (like `include_related`), fix the code

### Code Changes Made

| File | Change |
|------|--------|
| `src/application/use-cases/discover/types.ts` | Added `includeRelated` to DiscoverRequest |
| `src/application/use-cases/discover/discover-tools.ts` | Wired `includeRelated` parameter |
| `src/mcp/handlers/discover-handler.ts` | Extract and pass `include_related` |

Commit: `e1a52dbf` - fix(discover): Wire include_related parameter through handler to use case

## Changes to `01-mcp-tools.md`

### Overview Section

**Before:**
```markdown
| Transport | Command |
|-----------|---------|
| stdio | `pml serve --config ...` |
| Streamable HTTP | `pml serve --config ... --port 3001` |
```

**After:**
```markdown
**Cloud Mode (pml.casys.ai)** - Hosted service, no installation required.

**Local Mode (open source)**
| Transport | Command | Usage |
|-----------|---------|-------|
| stdio | `pml serve --config <mcp-servers.json>` | Claude Code integration |
| HTTP | `pml serve --config <mcp-servers.json> --port 3003` | Local dashboard |
```

### Tool Architecture

**Before:** 8 tools (6 deprecated)
**After:** 3 tools
- `pml:discover` - Search tools and capabilities
- `pml:execute` - Execute code (Direct mode + continue_workflow)
- `pml:abort` - Proactive workflow cancellation

### pml:discover

- Added correct response structure with `meta` object
- Added `related_tools` field in response
- Verified all parameters against handler code

### pml:execute

- Changed `status: "complete"` to `status: "success"`
- Added `capabilityName` and `capabilityFqdn` fields
- Added `mode: "direct"` field
- Removed non-existent `pendingOperation` and `message` from approval_required response

### pml:abort (NEW)

Added documentation for proactive workflow cancellation:
- Parameters: `workflow_id`, `reason` (both required)
- Distinction from `continue_workflow.approved = false`

### Error Codes

**Removed (don't exist):**
- `TOOL_NOT_FOUND`
- `SANDBOX_TIMEOUT`
- `SANDBOX_MEMORY`

**Added (from code):**
- `EXECUTION_ERROR`
- `TIMEOUT_ERROR`
- `DAG_EXECUTION_ERROR`

### Limits

| Resource | Old Value | New Value |
|----------|-----------|-----------|
| Workflow TTL | 5 min | 1 hour |
| Sandbox memory configurable | Yes | No |

## Remaining Work

### 01-installation.md

- Remove time estimate (violates documentation standards)
- Update examples with new tool names
- Verify installation commands

### 02-quickstart.md

- Replace all `pml:search_tools` → `pml:discover`
- Replace all `pml:execute_dag` → `pml:execute`
- Update response examples

### 02-configuration.md

- Remove reference to non-existent `mcp-permissions.yaml`
- Add documentation for `mcp-routing.json`
- Verify all config file references

### 03-cli.md

- Verify all CLI commands still exist
- Check command options match code

## Acceptance Criteria

- [ ] All documented tools exist in `getMetaTools()`
- [ ] All response structures match handler code
- [ ] All error codes exist in source
- [ ] All limits match constants in code
- [ ] No time estimates in documentation
- [ ] Examples use correct API

## References

- Source: `src/mcp/tools/definitions.ts`
- Source: `src/mcp/handlers/discover-handler.ts`
- Source: `src/mcp/handlers/execute-handler.ts`
- Source: `src/errors/error-types.ts`
- Standards: `_bmad/bmm/data/documentation-standards.md`
