# MCP Standard Library

A comprehensive collection of **424 MCP tools** for AI agents — text processing, data transformation, system operations, and **agentic capabilities via sampling**.

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

### Data Processing (182 tools)

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
| `transform` | 8 | CSV, XML, YAML parsing and stringification |
| `datetime` | 7 | Now, format, diff, add, cron parsing |
| `diff` | 7 | Unified diff, patch, compare lines |
| `compare` | 6 | Levenshtein, similarity, fuzzy match, deep equal |

### Utilities (112 tools)

| Category | Count | Description |
|----------|-------|-------------|
| `color` | 19 | Hex/RGB/HSL conversion, palettes, blend, contrast |
| `path` | 13 | Join, dirname, basename, resolve, relative |
| `geo` | 13 | Distance, bearing, bbox, geocode, timezone |
| `util` | 11 | HTTP status codes, MIME types, user agents |
| `qrcode` | 10 | Generate/decode QR codes, barcodes, SVG output |
| `state` | 10 | In-memory KV store with TTL, persistence |
| `vfs` | 8 | Virtual filesystem for sandboxed operations |
| `resilience` | 8 | Retry, rate limit, circuit breaker, timeout |
| `network` | 8 | URL parsing, IP info, subnet calc, DNS |
| `http` | 6 | Build URLs, parse headers, query strings |
| `schema` | 6 | Infer JSON schema, validate, generate samples |

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

## License

MIT
