# PML Standard Library

MCP-compatible utility tools for [PML](https://pml.casys.ai) - Procedural Memory Layer.

**318+ tools** across 21 categories for text processing, data transformation, cryptography, and more.

| | |
|---|---|
| **Website** | https://pml.casys.ai |
| **Docs** | https://docs.pml.casys.ai |
| **GitHub** | https://github.com/Casys-AI/pml-std |
| **Releases** | https://github.com/Casys-AI/pml-std/releases |

## Quick Install

```bash
curl -fsSL https://github.com/Casys-AI/pml-std/releases/latest/download/install.sh | sh
```

## Architecture

```
lib/
├── std/                      # Standard library (~305 tools)
│   ├── mod.ts                # Main entry point
│   ├── text.ts, json.ts, ... # Tool modules by category
│   ├── system.ts             # System CLI tools (docker, git, kubectl, etc.)
│   └── bundle.js             # Pre-bundled for sandbox use
├── mcp-tools.ts              # Re-exports from std/
├── mcp-tools-server.ts       # MCP server bootstrap
└── README.md                 # This file
```

**Separation of concerns:**

- `std/` = Pure TypeScript library, no MCP protocol
- `*-server.ts` = MCP server bootstrap (stdio transport)

## Available Libraries

### std (Standard Library)

**~318 utility tools across 21 categories**, inspired by popular MCP tool servers:

#### Sources & Credits

This library is inspired by and includes tools from the following open-source MCP servers:

| Source              | URL                                           | Tools Used                                                                                           |
| ------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **IT-Tools MCP**    | https://github.com/wrenchpilot/it-tools-mcp   | color, network, util, crypto (jwt, ulid, hmac, totp), datetime (cron, unix), format (yaml, markdown) |
| **TextToolkit MCP** | https://github.com/Cicatriiz/text-toolkit     | text (regex, lorem, slugify, nato, diff, stats)                                                      |
| **Math MCP**        | https://github.com/EthanHenrickson/math-mcp   | math (mode, convert)                                                                                 |
| **JSON MCP**        | https://github.com/VadimNastoyashchy/json-mcp | json (flatten, unflatten, pick, omit)                                                                |

#### Categories

| Category | Description | Examples |
|----------|-------------|----------|
| **System Tools** | | |
| docker | Container management | build, run, ps, logs, compose |
| git | Repository operations | status, diff, log, commit, branch |
| process | Process management | exec, spawn, kill, ps |
| archive | Compression | tar, zip, gzip, unzip |
| ssh | Remote execution | exec, scp, tunnel |
| kubernetes | K8s cluster management | get, apply, delete, logs |
| database | SQL/NoSQL access | psql, sqlite, redis |
| pglite | Embedded PostgreSQL | query, exec (in-process PG) |
| media | Audio/video/image | ffmpeg, imagemagick |
| cloud | Cloud providers | aws, gcloud, systemd |
| sysinfo | System information | cpu, memory, disk, network |
| packages | Package managers | npm, pip, apt, brew |
| **Data Tools** | | |
| text | Text manipulation | split, join, regex, case, template, slugify |
| string | String utilities | trim, pad, truncate, wrap |
| json | JSON operations | parse, query, merge, flatten, pick |
| format | Formatting | number, bytes, yaml, toml, markdown, sql |
| transform | Data conversion | csv_parse, xml_parse, csv_stringify |
| crypto | Cryptography | hash, uuid, base64, jwt, hmac, totp, bcrypt |
| math | Mathematical ops | eval, stats, round, convert, roman |
| datetime | Date/time | now, format, diff, add, cron_parse |
| collections | Array/set/map | map, filter, sort, unique, group, chunk |
| algo | Algorithms | binary_search, top_n, quickselect, sort |
| validation | Data validation | email, url, uuid, ip, phone, credit_card |
| compare | Comparison | levenshtein, similarity, fuzzy, deep_equal |
| diff | Text diff | unified_diff, patch, compare_lines |
| **Utility Tools** | | |
| network | Network utilities | parse_url, ip_info, subnet_calc, dns |
| http | HTTP helpers | build_url, headers, query_string |
| path | Path utilities | join, dirname, basename, resolve |
| color | Color manipulation | hex_to_rgb, rgb_to_hsl, palette, blend |
| vfs | Virtual filesystem | read, write, list, mkdir, rm |
| state | KV store with TTL | set, get, delete, keys, values |
| util | General utilities | http_status, mime_type, user_agent |
| **Generation Tools** | | |
| faker | Mock data | person, address, company, lorem |
| data | Data generation | image, svg, qr_code, barcode |
| qrcode | QR/barcode | generate, decode, svg |
| geo | Geographic | distance, bearing, bbox, geocode |
| schema | Schema inference | infer, validate, generate |
| resilience | Reliability | retry, rate_limit, circuit_breaker |
| **AI/Agent Tools** | | |
| agent | LLM-powered | delegate, analyze, classify, summarize |
| python | Python execution | exec, eval, pip, script |
| pml | Capability mgmt | cap:list, cap:rename, cap:lookup |

## Usage

### Option 1: As MCP Server (via mcp-servers.json)

Add to your `mcp-servers.json`:

```json
{
  "mcpServers": {
    "primitives": {
      "command": "deno",
      "args": ["run", "--allow-all", "lib/mcp-tools-server.ts"]
    }
  }
}
```

With category filtering (load only specific categories):

```json
{
  "mcpServers": {
    "algo-tools": {
      "command": "deno",
      "args": [
        "run",
        "--allow-all",
        "lib/mcp-tools-server.ts",
        "--categories=algo,compare,math"
      ]
    }
  }
}
```

### Option 2: Direct Import (TypeScript/Deno)

```typescript
import { getDefaultMCPClients, MiniToolsClient } from "./lib/mcp-tools.ts";

// All categories
const client = new MiniToolsClient();

// Specific categories only
const mathClient = new MiniToolsClient(["math", "algo", "compare"]);

// List available tools
const tools = await client.listTools();

// Call a tool
const result = await client.callTool("text_split", {
  text: "hello,world",
  separator: ",",
});
```

## Adding a New Library

### Step 1: Create the Pure Library

Create `lib/my-library.ts`:

```typescript
/**
 * My Library
 * @module lib/my-library
 */

// Define your tools
const TOOLS = [
  {
    name: "my_tool",
    description: "Does something useful",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "Input value" },
      },
      required: ["input"],
    },
    handler: ({ input }) => {
      return { result: `Processed: ${input}` };
    },
  },
  // ... more tools
];

// Export client class
export class MyLibraryClient {
  async listTools() {
    return TOOLS.map(({ handler, ...tool }) => tool);
  }

  async callTool(name: string, args: Record<string, unknown>) {
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    return tool.handler(args);
  }
}
```

### Step 2: Create the MCP Server Bootstrap

Create `lib/my-library-server.ts`:

```typescript
/**
 * MCP Server Bootstrap for My Library
 * @module lib/my-library-server
 */

import { MyLibraryClient } from "./my-library.ts";

// Copy the MCPServer class from mcp-tools-server.ts
// Replace MiniToolsClient with MyLibraryClient

class MCPServer {
  private client: MyLibraryClient;

  constructor() {
    this.client = new MyLibraryClient();
  }

  // ... same handleRequest, dispatch, etc.
}

// ... same stdio transport code
// ... same main() function
```

### Step 3: Add to mcp-servers.json

```json
{
  "mcpServers": {
    "my-library": {
      "command": "deno",
      "args": ["run", "--allow-all", "lib/my-library-server.ts"]
    }
  }
}
```

## Primitives vs Connectors

|              | Primitives          | Connectors              |
| ------------ | ------------------- | ----------------------- |
| Config       | None needed         | API keys required       |
| Network      | Offline OK          | Requires network        |
| Side effects | Pure data transform | Real actions            |
| Cost         | Free                | API calls = $           |
| Examples     | text, algo, compare | github, slack, postgres |

**Primitives** (this library): Zero config, pure data manipulation, safe for learning.

**Connectors** (external MCPs): Need `env` config in mcp-servers.json:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" }
    }
  }
}
```

## Testing

Run the server manually to test:

```bash
# Start server
deno run --allow-all lib/mcp-tools-server.ts

# Send a request (in another terminal, or pipe)
echo '{"jsonrpc":"2.0","id":1,"method":"initialize"}' | deno run --allow-all lib/mcp-tools-server.ts

# List tools
echo '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | ...

# Call a tool
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"text_split","arguments":{"text":"a,b,c","separator":","}}}' | ...
```

## Agent Tools & MCP Sampling

The **agent** category provides LLM-powered tools using MCP Sampling (SEP-1577, Nov 2025).

### How it works

1. Agent tools call `samplingClient.createMessage()` with a prompt
2. The MCP client (Claude Code, Gateway) receives `sampling/createMessage`
3. The CLIENT handles the agentic loop and tool execution
4. Results are returned to the server

### Transport-specific setup

| Mode                     | Sampling Handler                 | Status             |
| ------------------------ | -------------------------------- | ------------------ |
| **Claude Code** (stdio)  | Built into `mcp-tools-server.ts` | ✅ Ready           |
| **Cloud/Gateway** (HTTP) | TODO: Implement in Gateway       | ⚠️ Not implemented |

**Cloud mode TODO:** When implementing cloud deployment, the Gateway must:

1. Handle `sampling/createMessage` requests from the MCP server
2. Route to configured LLM API (Anthropic, OpenAI, etc.)
3. Execute the agentic loop with tool filtering
4. Return results to the MCP server

See: `docs/tech-specs/tech-spec-mcp-agent-nodes.md` for architecture details.

## Python Execution

The **python** category enables running Python code in isolated subprocesses.

### Tools

| Tool             | Description                               |
| ---------------- | ----------------------------------------- |
| `python_exec`    | Execute Python code, return stdout/stderr |
| `python_eval`    | Evaluate expression, return JSON result   |
| `python_pip`     | Install pip packages                      |
| `python_script`  | Run a Python script file                  |
| `python_version` | Get Python installation info              |

### Requirements

- **Python 3.8+** required (validated at runtime)
- Override with `PYTHON_PATH` env var if needed

### Security

- Runs in **subprocess** (not FFI) - no access to parent process memory
- Configurable **timeout** (default 30s)
- No sandbox bypass - isolated from Deno runtime

### Example

```typescript
// In generated code
const result = await mcp.python.exec({
  code: `
import pandas as pd
df = pd.read_csv('data.csv')
print(df.describe().to_json())
  `,
  timeout: 60000,
});
```

## Future Libraries

Planned additions:

- `mcp-connectors.ts` - Curated list of external service connectors
- `mcp-analytics.ts` - Data analysis primitives
- `mcp-ai.ts` - AI/ML utility tools
