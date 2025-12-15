# Mock MCP Servers

Mock MCP servers for testing Casys PML without real dependencies.

## Available Mocks

### 1. Filesystem Mock (`filesystem-mock.ts`)

Simulates a filesystem MCP server with file operations.

**Tools:**

- `read_file` - Read file contents
- `write_file` - Write to file
- `list_directory` - List directory contents

**Speed:** Fast (~0ms delay)

### 2. Database Mock (`database-mock.ts`)

Simulates a database MCP server with SQL operations.

**Tools:**

- `query` - Execute SQL query
- `insert` - Insert record
- `update` - Update records
- `schema` - Get database schema

**Speed:** Slow (~100ms delay) **Purpose:** Tests parallel extraction timing

### 3. API Mock (`api-mock.ts`)

Simulates an API client MCP server with HTTP operations.

**Tools:**

- `get` - GET request
- `post` - POST request
- `webhook` - Register webhook

**Speed:** Medium (~50ms delay) **Purpose:** Tests complex nested schemas

## Usage

### Manual Testing

Test individual mock:

```bash
# Test filesystem mock
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | deno task mock:fs

# Test with tools/list
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | deno task mock:fs
```

### Integration Testing

Test with dry-run:

```bash
deno task cli:init:dry:mocks
```

Test end-to-end (creates files, downloads model):

```bash
deno task test:e2e
```

## Config File

The mocks are configured in `tests/fixtures/mcp-config-mocks.json`:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "deno",
      "args": ["run", "--allow-all", "tests/mocks/filesystem-mock.ts"]
    },
    "database": {
      "command": "deno",
      "args": ["run", "--allow-all", "tests/mocks/database-mock.ts"],
      "env": {
        "DB_HOST": "localhost",
        "DB_PORT": "5432"
      }
    },
    "api": {
      "command": "deno",
      "args": ["run", "--allow-all", "tests/mocks/api-mock.ts"]
    }
  }
}
```

## What Gets Tested

✅ **Parallel Extraction**

- 3 servers extracted concurrently
- Timing: max(100ms, 50ms, 0ms) ≈ 100ms
- Total: 10 tools (3 + 4 + 3)

✅ **Schema Complexity**

- Simple schemas (filesystem)
- Nested objects (API)
- Optional fields (database)

✅ **Environment Variables**

- Database mock has env vars
- Tests dependency detection

✅ **Full Workflow**

- Config parsing
- Server discovery
- Schema extraction
- Embedding generation
- Database persistence

## Expected Results

### Dry-Run

```
📊 Migration Preview:
  Servers to migrate: 3
  Servers:
    - filesystem (deno)
    - database (deno)
    - api (deno)
```

### Full Migration (E2E)

```
✓ Discovered 3 MCP servers
✓ Extracted 10 tools from 3/3 servers
✓ Generated N embeddings

Migration complete!
```

## Adding New Mocks

To add a new mock server:

1. Create `new-mock.ts` implementing MCP protocol
2. Add tools to the `TOOLS` array
3. Handle `initialize` and `tools/list` methods
4. Add to `mcp-config-mocks.json`
5. Update this README

## Protocol Reference

Each mock must implement:

**initialize:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {}
}
```

**tools/list:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list",
  "params": {}
}
```

**Response format:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      {
        "name": "tool_name",
        "description": "Tool description",
        "inputSchema": {
          "type": "object",
          "properties": {...},
          "required": [...]
        }
      }
    ]
  }
}
```
