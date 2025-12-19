# MCP Libraries

This folder contains MCP-compatible libraries and their server bootstraps.

## Architecture

```
lib/
├── std/                      # Standard library (~200 tools)
│   ├── mod.ts                # Main entry point
│   ├── text.ts, json.ts, ... # Tool modules by category
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

**~200 utility tools across 18 categories**, inspired by popular MCP tool servers:

#### Sources & Credits

This library is inspired by and includes tools from the following open-source MCP servers:

| Source | URL | Tools Used |
|--------|-----|------------|
| **IT-Tools MCP** | https://github.com/wrenchpilot/it-tools-mcp | color, network, util, crypto (jwt, ulid, hmac, totp), datetime (cron, unix), format (yaml, markdown) |
| **TextToolkit MCP** | https://github.com/Cicatriiz/text-toolkit | text (regex, lorem, slugify, nato, diff, stats) |
| **Math MCP** | https://github.com/EthanHenrickson/math-mcp | math (mode, convert) |
| **JSON MCP** | https://github.com/VadimNastoyashchy/json-mcp | json (flatten, unflatten, pick, omit) |

#### Categories

| Category | Count | Examples |
|----------|-------|----------|
| text | 21 | split, join, regex, case, template, slugify, nato, lorem, diff, stats, crontab, markdown_toc, ascii_art, numeronym, obfuscate |
| json | 9 | parse, stringify, query, merge, flatten, unflatten, pick, omit |
| math | 13 | eval, stats, round, random, mode, convert, base_convert, roman, convert_angle, convert_energy, convert_power |
| datetime | 7 | now, format, diff, add, parse, cron_parse, unix |
| crypto | 19 | hash, uuid, ulid, base64, hex, url, html, password, jwt_decode, hmac, totp, text_to_binary, generate_token, basic_auth |
| collections | 20 | map, filter, sort, unique, group, chunk, zip, flatten, partition, sample |
| vfs | 8 | read, write, list, mkdir, rm, stat, exists, copy |
| data | 8 | fake_name, fake_email, lorem, fake_phone, fake_address, fake_company |
| http | 6 | build_url, parse_url, headers, query_string |
| validation | 9 | email, url, uuid, ip, phone, date, json, schema, credit_card |
| format | 17 | number, bytes, duration, truncate, yaml_to_json, json_to_yaml, markdown_to_html, html_to_markdown, json_to_csv, format_sql, format_phone |
| transform | 8 | csv_parse, csv_stringify, xml_parse, xml_stringify |
| state | 10 | set, get, delete, has, keys, values, clear, size, entries (KV store with TTL) |
| compare | 6 | diff, levenshtein, similarity, fuzzy, deep_equal, array_diff |
| algo | 20 | binary_search, group_aggregate, top_n, sort variants, quickselect |
| color | 4 | hex_to_rgb, rgb_to_hex, rgb_to_hsl, hsl_to_rgb |
| network | 6 | parse_url, build_url, ip_info, subnet_calc, mac_format, fang_url |
| util | 8 | http_status, http_status_list, mime_type, mime_reverse, rem_px, format_css, normalize_email, port_numbers |

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
        "run", "--allow-all",
        "lib/mcp-tools-server.ts",
        "--categories=algo,compare,math"
      ]
    }
  }
}
```

### Option 2: Direct Import (TypeScript/Deno)

```typescript
import { MiniToolsClient, getDefaultMCPClients } from "./lib/mcp-tools.ts";

// All categories
const client = new MiniToolsClient();

// Specific categories only
const mathClient = new MiniToolsClient(["math", "algo", "compare"]);

// List available tools
const tools = await client.listTools();

// Call a tool
const result = await client.callTool("text_split", {
  text: "hello,world",
  separator: ","
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
        input: { type: "string", description: "Input value" }
      },
      required: ["input"]
    },
    handler: ({ input }) => {
      return { result: `Processed: ${input}` };
    }
  },
  // ... more tools
];

// Export client class
export class MyLibraryClient {
  async listTools() {
    return TOOLS.map(({ handler, ...tool }) => tool);
  }

  async callTool(name: string, args: Record<string, unknown>) {
    const tool = TOOLS.find(t => t.name === name);
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

| | Primitives | Connectors |
|--|------------|------------|
| Config | None needed | API keys required |
| Network | Offline OK | Requires network |
| Side effects | Pure data transform | Real actions |
| Cost | Free | API calls = $ |
| Examples | text, algo, compare | github, slack, postgres |

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

## Future Libraries

Planned additions:
- `mcp-connectors.ts` - Curated list of external service connectors
- `mcp-analytics.ts` - Data analysis primitives
- `mcp-ai.ts` - AI/ML utility tools
