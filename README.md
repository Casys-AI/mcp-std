# MCP Standard Library

A comprehensive collection of **461 MCP tools** for AI agents — text processing, data transformation, system operations, and **agentic capabilities via sampling**.

Works with any MCP client: Claude Code, Claude Desktop, Cursor, VS Code Copilot, and more.

## Quick Start

### Claude Code / Claude Desktop

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "std": {
      "command": "deno",
      "args": ["run", "-A", "jsr:@casys/mcp-std/server"]
    }
  }
}
```

### Load specific categories only

```json
{
  "mcpServers": {
    "std": {
      "command": "deno",
      "args": ["run", "-A", "jsr:@casys/mcp-std/server", "--categories=text,json,math"]
    }
  }
}
```

---

## Building Custom MCP Servers

> **NEW in v0.2.0:** Use the ConcurrentMCPServer framework to build your own high-performance MCP servers.

MCP std now includes a production-ready server framework with built-in concurrency control, backpressure, and sampling support. Perfect for building custom MCP servers with your own tools.

### Quick Example

```typescript
import { ConcurrentMCPServer } from "jsr:@casys/mcp-server";

// Define your custom tools
const myTools = [
  {
    name: "my_tool",
    description: "My custom tool",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "Input data" }
      },
      required: ["input"]
    }
  }
];

// Create handlers
const handlers = new Map([
  ["my_tool", async (args) => {
    return `Processed: ${args.input}`;
  }]
]);

// Create server with concurrency control
const server = new ConcurrentMCPServer({
  name: "my-server",
  version: "1.0.0",
  maxConcurrent: 5,                    // Max 5 concurrent requests
  backpressureStrategy: 'queue'        // Queue excess requests
});

server.registerTools(myTools, handlers);
await server.start();
```

### Framework Features

- **Wraps Official SDK**: Built on `@modelcontextprotocol/sdk` for full protocol compatibility
- **Concurrency Control**: Limit concurrent requests (default: 10)
- **Backpressure Strategies**:
  - `'sleep'` - Busy-wait when at capacity (default)
  - `'queue'` - FIFO queue for pending requests
  - `'reject'` - Fail fast when at capacity
- **Sampling Support**: Optional bidirectional LLM delegation
- **Metrics**: Monitor in-flight and queued requests
- **Production-Ready**: Used by mcp-std (461 tools)

### Configuration Options

```typescript
interface ConcurrentServerOptions {
  name: string;                       // Server name
  version: string;                    // Server version
  maxConcurrent?: number;             // Default: 10
  backpressureStrategy?: 'sleep' | 'queue' | 'reject';
  backpressureSleepMs?: number;       // Default: 10ms (for 'sleep' strategy)
  enableSampling?: boolean;           // Enable LLM sampling
  samplingClient?: SamplingClient;    // Custom sampling implementation
  logger?: (msg: string) => void;     // Custom logger
}
```

### Advanced Usage

```typescript
import {
  ConcurrentMCPServer,
  RequestQueue,
  SamplingBridge
} from "jsr:@casys/mcp-server";

// Custom queue configuration
const queue = new RequestQueue({
  maxConcurrent: 15,
  strategy: 'queue',
  sleepMs: 10
});

// Get metrics
const metrics = queue.getMetrics();
console.log(`In-flight: ${metrics.inFlight}, Queued: ${metrics.queued}`);

// Sampling for agentic tools
const server = new ConcurrentMCPServer({
  name: "agentic-server",
  version: "1.0.0",
  enableSampling: true,
  samplingClient: myCustomSamplingClient
});

const bridge = server.getSamplingBridge();
const result = await bridge.requestSampling({
  messages: [{ role: 'user', content: 'Analyze this data...' }]
});
```

---

## Agent Tools (Sampling)

> **Agentic MCP tools that delegate work to LLMs via the sampling protocol.**

The `agent` category provides 8 powerful tools that leverage [MCP Sampling](https://modelcontextprotocol.io/specification/2025-11-25/client/sampling) to call LLMs from within tool execution:

| Tool | Description |
|------|-------------|
| `agent_delegate` | Delegate a subtask to another agent with context |
| `agent_analyze` | Deep analysis of code, data, or documents |
| `agent_classify` | Classify input into categories |
| `agent_summarize` | Generate summaries at various detail levels |
| `agent_extract` | Extract structured data from unstructured text |
| `agent_validate` | Validate content against rules/schemas |
| `agent_transform` | Transform data with natural language instructions |
| `agent_generate` | Generate content from specifications |

### Sampling Compatibility

| Client | Sampling Support | Notes |
|--------|-----------------|-------|
| [PML](https://pml.casys.ai) | **Server-side** | Handles sampling automatically — works everywhere |
| VS Code Copilot | Native | Full sampling support |
| Claude Code | Not yet | [Tracking issue #1785](https://github.com/anthropics/claude-code/issues/1785) |
| Claude Desktop | Not yet | Coming soon |

**Tip:** Use with [PML](https://pml.casys.ai) for sampling support in any MCP client.

---

## Capabilities (Tool Composition)

> **Combine multiple MCP tools into reusable, named capabilities.**

[PML (Procedural Memory Layer)](https://github.com/Casys-AI/casys-pml) extends mcp-std with **capabilities** — compound tools that chain multiple operations:

```typescript
// Example: A capability that fetches, transforms, and validates data
const result = await mcp.pml.pml_execute({
  intent: "Fetch user data and validate schema",
  code: `
    const data = await mcp.std.http_fetch({ url: "https://api.example.com/users" });
    const parsed = await mcp.std.json_parse({ text: data });
    const valid = await mcp.std.schema_validate({ data: parsed, schema: userSchema });
    return valid;
  `
});
```

**Key features:**
- **Learn from execution** — Successful tool chains become reusable capabilities
- **Semantic search** — Find capabilities by intent, not just name
- **Version control** — Track capability evolution over time
- **Multi-tenant** — Isolated capabilities per user/org

Learn more: [github.com/Casys-AI/casys-pml](https://github.com/Casys-AI/casys-pml)

---

## Tool Categories

### System (85 tools)

| Category | Count | Description |
|----------|-------|-------------|
| `docker` | 19 | Container lifecycle, images, compose, logs |
| `database` | 16 | PostgreSQL, SQLite, MySQL, Redis CLI access |
| `sysinfo` | 12 | CPU, memory, disk, network, processes |
| `pglite` | 7 | Embedded PostgreSQL (in-process, no server) |
| `process` | 5 | Exec, spawn, kill, signal handling |
| `packages` | 5 | npm, pip, apt, brew, cargo |
| `git` | 4 | Status, diff, log, commit, branch |
| `archive` | 4 | tar, zip, gzip, compression |
| `kubernetes` | 4 | kubectl get/apply/delete/logs |
| `ssh` | 3 | Remote exec, scp, tunnels |
| `media` | 3 | ffmpeg, imagemagick wrappers |
| `cloud` | 3 | AWS, GCloud, systemd |

### Data Processing (212 tools)

| Category | Count | Description |
|----------|-------|-------------|
| `format` | 25 | Number, bytes, yaml, toml, markdown, SQL formatting |
| `string` | 21 | Trim, pad, truncate, wrap, case conversion |
| `crypto` | 20 | Hash, UUID, base64, JWT, HMAC, TOTP, bcrypt |
| `collections` | 20 | Map, filter, sort, unique, group, chunk, flatten |
| `algo` | 20 | Binary search, quickselect, top-n, sorts |
| `math` | 17 | Eval, stats, round, unit conversion, roman numerals |
| `validation` | 11 | Email, URL, UUID, IP, phone, credit card |
| `text` | 10 | Split, join, regex, template, slugify |
| `json` | 10 | Parse, query, merge, flatten, pick, diff |
| `encoding` | 10 | **NEW** ROT13, Caesar, Morse, NATO, binary, hex, base32, punycode |
| `transform` | 8 | CSV, XML, YAML parsing and stringification |
| `datetime` | 7 | Now, format, diff, add, cron parsing |
| `diff` | 7 | Unified diff, patch, compare lines |
| `compare` | 6 | Levenshtein, similarity, fuzzy match, deep equal |
| `security` | 6 | **NEW** JWT generate/verify, password strength, checksums, CRC32 |
| `textanalysis` | 4 | **NEW** Readability scores, sentiment analysis, word frequency |

### Utilities (134 tools)

| Category | Count | Description |
|----------|-------|-------------|
| `color` | 19 | Hex/RGB/HSL conversion, palettes, blend, contrast |
| `path` | 13 | Join, dirname, basename, resolve, relative |
| `geo` | 13 | Distance, bearing, bbox, geocode, timezone |
| `util` | 11 | HTTP status codes, MIME types, user agents |
| `qrcode` | 10 | Generate/decode QR codes, barcodes, SVG output |
| `state` | 10 | In-memory KV store with TTL, persistence |
| `devtools` | 10 | **NEW** Semver parse/compare/bump, roman numerals, env parser, cron, regex |
| `vfs` | 8 | Virtual filesystem for sandboxed operations |
| `resilience` | 8 | Retry, rate limit, circuit breaker, timeout |
| `network` | 8 | URL parsing, IP info, subnet calc, DNS |
| `iptools` | 7 | **NEW** CIDR calculator, subnet divide, IPv6, MAC format |
| `http` | 6 | Build URLs, parse headers, query strings |
| `schema` | 6 | Infer JSON schema, validate, generate samples |
| `timezone` | 5 | **NEW** Timezone convert, world clock, meeting planner, DST |

### Generation (32 tools)

| Category | Count | Description |
|----------|-------|-------------|
| `faker` | 16 | Mock data: names, addresses, companies, lorem |
| `data` | 11 | Generate images, SVG, placeholder data |
| `python` | 5 | Execute Python code, manage pip packages |

### Agentic (13 tools)

| Category | Count | Description |
|----------|-------|-------------|
| `agent` | 8 | LLM delegation via sampling (see above) |
| `pml` | 5 | Capability management: list, lookup, rename, merge, whois |

> **Note:** The `pml` tools require a [PML](https://pml.casys.ai) account. Set `PML_API_KEY` to authenticate.

---

## TypeScript API

```typescript
import { MiniToolsClient } from "jsr:@casys/mcp-std";

const client = new MiniToolsClient();

// List all tools
const tools = await client.listTools();
console.log(`${tools.length} tools available`);

// Call a tool
const result = await client.callTool("text_split", {
  text: "hello,world",
  separator: ","
});
// => ["hello", "world"]

// Get tools by category
const cryptoTools = client.getToolsByCategory("crypto");
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PGLITE_PATH` | Path for embedded PGlite database | `./data/pglite` |
| `MCP_STD_CATEGORIES` | Comma-separated list of categories to load | all |

---

## Credits

This library includes tools inspired by:

- [IT-Tools MCP](https://github.com/wrenchpilot/it-tools-mcp)
- [TextToolkit MCP](https://github.com/Cicatriiz/text-toolkit)
- [Math MCP](https://github.com/EthanHenrickson/math-mcp)
- [JSON MCP](https://github.com/VadimNastoyashchy/json-mcp)

---

---

## MCP Apps UI Components

> **Interactive UI components for MCP hosts** using the MCP Apps extension (SEP-1865).

mcp-std includes **12 interactive UI components** that display tool results visually. When an MCP host supports the Apps extension, these UIs are rendered alongside tool responses. Each UI is atomic and composable.

### UI Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | **Preact** | Lightweight React-compatible (3KB) |
| Styling | **Panda CSS** | Build-time CSS-in-JS (0KB runtime) |
| Design System | **Park UI** preset | Tokens, colors, dark mode |
| Bundle | **Vite + singlefile** | Single HTML with inline CSS/JS (~105KB gzip) |

### Available UIs

#### Data Display

| UI | Description | Associated Tools |
|----|-------------|------------------|
| `table-viewer` | Sortable, filterable table with pagination | `psql_query`, `pglite_query`, `mysql_query`, `sqlite_query`, `docker_ps`, `docker_stats` |
| `json-viewer` | Collapsible tree view with search and path copying | `json_parse`, `json_query`, `schema_infer` |
| `chart-viewer` | Bar, line, pie charts with interactivity | `math_stats`, `collections_group` |

#### Code & Diff

| UI | Description | Associated Tools |
|----|-------------|------------------|
| `diff-viewer` | Unified/split diff display with hunk navigation | `git_diff`, `diff_lines`, `diff_unified` |
| `log-viewer` | Filterable logs with level highlighting and auto-scroll | `docker_logs` |

#### Metrics & Monitoring

| UI | Description | Associated Tools |
|----|-------------|------------------|
| `gauge` | Circular/linear/compact gauge with thresholds | `free` (memory) |
| `sparkline` | Inline mini chart with trend indicator | `uptime` (load average) |
| `metrics-panel` | Grafana-style grid of metrics | `df` (disk usage) |

#### Design & Input

| UI | Description | Associated Tools |
|----|-------------|------------------|
| `color-picker` | Swatches, formats (HEX/RGB/HSL), palettes, WCAG contrast | `color_parse`, `color_palette`, `color_contrast` |
| `form-viewer` | Dynamic forms from JSON Schema with validation | `schema_infer`, `validate_schema` |
| `qr-viewer` | QR code display with download and copy | `qr_generate_url` |
| `status-badge` | Valid/invalid/warning badges with details | `validate_email`, `validate_url`, `validate_ip` |

### Tool → UI Mapping

Each tool declares its UI via `_meta.ui.resourceUri`:

```typescript
// In tool definition
_meta: {
  ui: {
    resourceUri: "ui://mcp-std/gauge",
    emits: ["click"],      // Events the UI sends to model
    accepts: ["refresh"],  // Commands the UI accepts
  },
}
```

**Complete mapping:**

| Category | Tool | UI |
|----------|------|----|
| **Database** | `psql_query` | table-viewer |
| | `pglite_query` | table-viewer |
| | `mysql_query` | table-viewer |
| | `sqlite_query` | table-viewer |
| **JSON** | `json_parse` | json-viewer |
| | `json_query` | json-viewer |
| | `json_compare` | json-viewer |
| **Math** | `math_stats` | chart-viewer |
| **Git** | `git_status` | table-viewer |
| | `git_log` | table-viewer |
| | `git_diff` | diff-viewer |
| | `git_branch` | table-viewer |
| **Diff** | `diff_lines` | diff-viewer |
| | `diff_unified` | diff-viewer |
| | `diff_words` | diff-viewer |
| | `diff_chars` | diff-viewer |
| | `diff_similarity` | gauge |
| **Compare** | `diff_text` | diff-viewer |
| | `diff_json` | json-viewer |
| | `diff_arrays` | table-viewer |
| | `compare_deep_equal` | status-badge |
| **Color** | `color_parse` | color-picker |
| | `color_palette` | color-picker |
| | `color_contrast` | color-picker |
| **System** | `df` | metrics-panel |
| | `du` | table-viewer |
| | `free` | gauge |
| | `uptime` | sparkline |
| **Docker** | `docker_ps` | table-viewer |
| | `docker_images` | table-viewer |
| | `docker_stats` | table-viewer |
| | `docker_logs` | log-viewer |
| | `docker_network_ls` | table-viewer |
| | `docker_volume_ls` | table-viewer |
| **Kubernetes** | `kubectl_get` | table-viewer |
| | `kubectl_apply` | status-badge |
| | `kubectl_logs` | log-viewer |
| | `kubectl_exec` | log-viewer |
| **Archive** | `tar_extract` | table-viewer |
| | `unzip` | table-viewer |
| **Schema** | `schema_infer` | json-viewer |
| **QR Code** | `qr_generate_url` | qr-viewer |
| | `qr_wifi` | qr-viewer |
| | `qr_vcard` | qr-viewer |
| **Validation** | `validate_email` | status-badge |
| | `validate_url` | status-badge |
| | `validate_ip` | status-badge |
| **HTTP** | `http_get` | json-viewer |
| | `http_post` | json-viewer |
| | `http_request` | json-viewer |
| | `http_parse_url` | json-viewer |
| **Network** | `curl_fetch` | json-viewer |
| | `ping_host` | status-badge |
| | `dig_lookup` | table-viewer |
| | `ip_address` | table-viewer |
| | `traceroute` | table-viewer |
| **IP Tools** | `cidr_calculate` | json-viewer |
| | `cidr_contains` | status-badge |
| | `subnet_divide` | table-viewer |
| | `ip_convert` | json-viewer |
| | `ipv6_expand` | json-viewer |
| | `mac_format` | json-viewer |
| | `ip_range` | table-viewer |
| **SSH** | `ssh_exec` | log-viewer |
| | `rsync` | log-viewer |
| **Packages** | `npm_run` | log-viewer |
| | `pip_run` | log-viewer |
| | `apt_install` | status-badge |
| | `apt_search` | table-viewer |
| | `brew_install` | status-badge |
| **Process** | `ps_list` | table-viewer |
| **Crypto** | `crypto_jwt_decode` | json-viewer |
| **Security** | `jwt_verify` | status-badge |
| | `password_strength` | gauge |
| **Text Analysis** | `text_readability` | gauge |
| | `text_sentiment_simple` | gauge |
| | `text_word_frequency` | chart-viewer |
| | `text_statistics` | metrics-panel |
| **Datetime** | `datetime_parse` | json-viewer |
| | `datetime_cron_parse` | json-viewer |
| **Timezone** | `tz_world_clock` | table-viewer |
| | `tz_meeting_planner` | table-viewer |
| **Geo** | `geo_nearest` | table-viewer |
| | `geo_distance_matrix` | table-viewer |
| | `geo_validate` | status-badge |
| | `geo_point_in_polygon` | status-badge |
| **Faker** | `faker_person` | table-viewer |
| | `faker_company` | table-viewer |
| **State** | `state_keys` | table-viewer |
| | `state_stats` | metrics-panel |
| **Collections** | `array_group` | json-viewer |
| | `array_count_by` | chart-viewer |

### Event Communication

UIs emit events via `structuredContent` that can trigger PML sync rules:

```typescript
// Table: user selects a row
{ event: "select", rowIndex: 5, row: { id: 123, name: "Alice" } }

// Log viewer: user filters by level
{ event: "filterLevel", levels: ["error", "warn"] }

// Gauge: user clicks metric
{ event: "click", id: "cpu", value: 73 }

// Color picker: user copies color
{ event: "copy", format: "HEX", value: "#ff5733" }
```

### Building UIs

```bash
cd lib/std/src/ui
npm install
npm run build    # Builds all 12 UIs to dist/
```

### Creating Custom UIs

1. Create folder: `src/ui/my-viewer/`
2. Add `index.html` and `src/main.tsx`
3. Import Panda CSS: `import { css } from "../../styled-system/css"`
4. Connect to MCP host:
   ```typescript
   const app = new App({ name: "My Viewer", version: "1.0.0" });
   app.connect();
   app.ontoolresult = (result) => { /* handle data */ };
   ```
5. Build: `npm run build`

See `src/ui/table-viewer/` for a complete example.

---

## License

MIT
