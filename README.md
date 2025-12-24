# Casys PML

[![CI](https://github.com/casys-ai/casys-pml/workflows/CI/badge.svg)](https://github.com/casys-ai/casys-pml/actions)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Deno Version](https://img.shields.io/badge/deno-2.x-blue.svg)](https://deno.land)

**Procedural Memory Layer** — An open-source PML for AI agents. Casys PML captures emergent
workflows and crystallizes them into reusable skills. RAG gave agents knowledge. PML gives them skills.

Casys PML solves two critical problems with MCP ecosystems:

1. **Context Saturation** — Tool schemas consume 30-50% of LLM context window → reduced to <5%
2. **Sequential Latency** — Multi-tool workflows run serially → parallelized via DAG execution

---

## Key Features

### Intelligent Gateway

- **Meta-Tools Only** — Exposes intelligent meta-tools (`pml:search_tools`, `pml:execute_dag`, etc.)
  instead of proxying all underlying tools
- **Semantic Tool Search** — Find relevant tools via natural language intent, not just keywords
- **DAG Workflow Execution** — Parallel execution of independent tasks with dependency resolution
- **On-Demand Schema Loading** — Only load tools needed for current task (<5% context usage)

### GraphRAG Discovery

- **Hybrid Search** — Combines semantic similarity + graph-based relatedness (Adamic-Adar algorithm)
- **Adaptive Learning** — Graph learns from execution patterns, improving suggestions over time
- **Workflow Templates** — Bootstrap with predefined patterns, evolve from usage

### Execution Control

- **Agent-in-the-Loop (AIL)** — Automatic decisions with per-layer validation
- **Human-in-the-Loop (HIL)** — Approval checkpoints for critical operations
- **Checkpoint/Resume** — Interruptible workflows with state persistence
- **Speculative Execution** — Predict and pre-execute likely next steps (confidence-based)

### Sandbox Execution

- **Secure Code Execution** — Run TypeScript in isolated Deno sandbox
- **MCP Tool Injection** — Access MCP tools from sandbox code via intent-based discovery
- **PII Protection** — Automatic detection and tokenization of sensitive data
- **Execution Caching** — Avoid re-running identical code

### Dashboard & Observability

- **Real-time SSE Events** — Live graph updates, edge creation, metrics streaming
- **Interactive Graph Visualization** — D3.js force-directed graph with PageRank sizing and hyperedge support
- **Live Metrics Panel** — Success rate, latency, edge count, graph density

### Emergent Capabilities (In Progress)

- **Learning from Usage** — Capabilities emerge from execution patterns, not predefined
- **Capability Matching** — Find and reuse proven code via intent similarity
- **Proactive Suggestions** — Louvain communities + Adamic-Adar for smart recommendations

### Developer Experience

- **Zero-Config Setup** — Auto-discovers MCP servers, generates embeddings
- **Local-First** — All data in PGlite, no cloud dependencies
- **100% Local Embeddings** — BGE-M3 via Transformers.js

---

## Quick Start

### Prerequisites

- [Deno](https://deno.land/) 2.x or higher

### Installation

```bash
# Clone the repository
git clone https://github.com/casys-ai/casys-pml.git
cd casys-pml

# Start the API gateway (port 3003)
deno task dev
```

The gateway will:

1. Discover configured MCP servers from `config/.mcp-servers.json`
2. Extract tool schemas via MCP protocol
3. Generate embeddings (BGE-M3)
4. Start listening on port 3003

### Dashboard

```bash
# Start Fresh dashboard with Vite (port 8081)
deno task dev:fresh
```

Open http://localhost:8081/dashboard to see:

- Live graph visualization with PageRank-sized nodes
- Edge creation in real-time via SSE
- Metrics panel (success rate, latency, density)

### Playground

The Jupyter notebook playground provides interactive exploration of PML features:

```bash
# Open in GitHub Codespaces (recommended)
```

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/casys-ai/casys-pml?devcontainer_path=.devcontainer/playground/devcontainer.json)

Notebooks cover:

- Sandbox execution basics
- DAG workflow construction
- MCP tool injection
- GraphRAG exploration

### Optional: Error Tracking with Sentry

Casys PML supports [Sentry](https://sentry.io) for production error tracking and
performance monitoring (see [ADR-011](docs/adrs/ADR-011-sentry-integration.md)).

```bash
# Copy the example file
cp .env.example .env

# Edit with your Sentry credentials
nano .env
```

Configure the following environment variables:

```bash
SENTRY_DSN=https://your-dsn@your-org.ingest.sentry.io/your-project-id
SENTRY_ENVIRONMENT=production  # or development, staging
SENTRY_TRACES_SAMPLE_RATE=0.1  # 10% sampling in production, 1.0 for dev
```

If `SENTRY_DSN` is not set, Sentry is disabled and PML will run normally.

---

## Usage with Claude Code

Casys PML integrates with Claude Code as an intelligent MCP gateway.

### Step 1: Initialize PML

```bash
# Run the CLI
deno task cli init

# Or specify a custom config path
deno task cli init --config /path/to/mcp-config.json
```

This will:

- Discover all your configured MCP servers
- Extract tool schemas via MCP protocol
- Generate embeddings for semantic search
- Store everything in a local PGlite database (`.pml.db`)

### Step 2: Start the Gateway

PML runs as an HTTP server that you start **before** using Claude:

```bash
# Terminal 1: Start the API gateway (port 3003)
deno task dev

# Terminal 2 (optional): Start the dashboard (port 8081)
deno task dev:fresh
```

The gateway must be running for Claude to connect.

### Step 3: Configure Claude Code

Add to your MCP settings (`.mcp.json` or Claude Desktop config):

```json
{
  "mcpServers": {
    "pml": {
      "type": "http",
      "url": "http://localhost:3003/mcp"
    }
  }
}
```

That's it! The gateway reads MCP server configs from `config/.mcp-servers.json` and API keys for third-party services (Tavily, GitHub, etc.) from your `.env` file.

### Step 4: Available MCP Tools

Once configured, PML exposes these meta-tools:

| Tool                      | Description                                |
| ------------------------- | ------------------------------------------ |
| `pml:search_tools`        | Semantic + graph hybrid tool search        |
| `pml:execute_dag`         | Execute DAG workflows (intent or explicit) |
| `pml:execute_code`        | Run TypeScript in sandbox with MCP tools   |
| `pml:search_capabilities` | Find learned code patterns by intent       |
| `pml:continue`            | Continue paused workflow execution         |
| `pml:abort`               | Abort running workflow                     |
| `pml:replan`              | Replan DAG with new requirements           |
| `pml:approval_response`   | Respond to HIL approval checkpoints        |

### Example Usage

**Search for relevant tools:**

```typescript
await callTool("pml:search_tools", {
  query: "read and parse configuration files",
  include_related: true, // Include graph-recommended tools
});
```

**Intent-based DAG execution:**

```typescript
await callTool("pml:execute_dag", {
  intent: "Read the config file and create a memory entity with its contents",
});
// PML suggests DAG, executes if confidence > threshold
```

**Explicit DAG with parallel tasks:**

```typescript
await callTool("pml:execute_dag", {
  workflow: {
    tasks: [
      { id: "t1", tool: "filesystem:read_file", arguments: { path: "config.json" } },
      { id: "t2", tool: "filesystem:read_file", arguments: { path: "package.json" } },
      {
        id: "t3",
        tool: "memory:create_entities",
        arguments: { entities: [{ name: "config", content: "$t1.result" }] },
        depends_on: ["t1"],
      },
    ],
  },
});
// t1 and t2 execute in parallel, t3 waits for t1
```

**Sandbox code execution:**

```typescript
await callTool("pml:execute_code", {
  intent: "Process filesystem data", // Discovers and injects relevant tools
  code: `
    const files = await filesystem.readDirectory({ path: "." });
    return files.filter(f => f.endsWith('.json')).length;
  `,
});
```

### How It Works

1. **Semantic Tool Discovery**: PML uses semantic search to return only relevant tools based on the
   query context, preventing context saturation.

2. **Meta-Tools Architecture**: Instead of proxying all underlying tools (which would saturate
   context), PML exposes intelligent meta-tools that orchestrate the underlying MCP servers.

3. **Workflow Orchestration**: The `pml:execute_dag` tool enables:

   - **Intent-based**: Describe what you want → PML suggests optimal DAG
   - **Explicit DAG**: Provide workflow structure → Automatic parallelization
   - **$OUTPUT resolution**: Reference previous task outputs

4. **Context Optimization**: Instead of loading all 100+ tool schemas, PML dynamically loads only
   what's needed via semantic search.

### Code Execution Mode

PML integrates code execution into DAG workflows, enabling hybrid orchestration that combines MCP
tool calls with local data processing.

#### When to Use Code Execution

**Use code_execution task type when:**

- Processing large datasets fetched from MCP tools (>100 items)
- Complex multi-step transformations across multiple tool results
- Local filtering/aggregation before returning to LLM context
- Idempotent operations safe for checkpoint/resume

**Use direct MCP tool calls when:**

- Single tool with small result (<10KB)
- No processing needed
- Stateful operations requiring immediate commit

#### REPL-Style Execution

Code execution supports REPL-style auto-return for simple expressions:

- **Simple expressions** auto-return: `2 + 2` → `4`
- **Multi-statement code** requires explicit `return`: `const x = 5; return x * 3` → `15`

See [ADR-016](docs/adrs/ADR-016-repl-style-auto-return.md) for details.

#### Security

**Sandbox Isolation:**

- Code runs in isolated Deno subprocess
- Limited permissions (configurable read paths only)
- No network access from sandbox by default
- No subprocess spawning allowed

**PII Protection:**

- Automatic detection of emails, phones, credit cards, SSNs, API keys
- Tokenization before execution (`alice@secret.com` → `[EMAIL_1]`)
- Can be disabled via `sandbox_config.piiProtection: false`

### Troubleshooting

| Problem                | Solution                                             |
| ---------------------- | ---------------------------------------------------- |
| Gateway fails to start | Check MCP server configs in `config/.mcp-servers.json` |
| Tools not appearing    | Run `deno task cli init` to reinitialize             |
| Slow tool discovery    | Clear cache, regenerate embeddings                   |
| Memory issues          | Reduce `maxConcurrency` in config                    |

**Debug Commands:**

```bash
# Enable verbose logging
LOG_LEVEL=debug deno task dev

# Check database
ls -lh .pml.db

# Run tests
deno task test
```

**Getting Help:** [GitHub Issues](https://github.com/casys-ai/casys-pml/issues)

---

## Development

### Deno Tasks

```bash
# Development
deno task dev              # Start API server (port 3003)
deno task dev:fresh        # Start Fresh dashboard with Vite (port 8081)

# Testing
deno task test             # Run all tests
deno task test:unit        # Run unit tests only
deno task test:integration # Run integration tests
deno task check            # Type checking

# Code Quality
deno task lint             # Run linter
deno task fmt              # Format code

# Database
deno task db:generate      # Generate Drizzle migrations
deno task db:studio        # Open Drizzle Studio

# Production
deno task prod:start       # Start systemd services
deno task prod:stop        # Stop systemd services
deno task prod:logs        # View logs
deno task deploy:all       # Pull, build, restart

# CLI
deno task cli init         # Initialize PML (discover MCPs, generate embeddings)
deno task cli status       # Check health
```

### Code Quality Standards

- **Linting**: Deno's built-in linter with recommended rules
- **Formatting**: 100-char line width, 2-space indentation, semicolons enforced
- **Type Safety**: Strict TypeScript with `noImplicitAny`, `noUnusedLocals`, `noUnusedParameters`
- **Testing**: >80% coverage target with Deno.test

---

## Documentation

- **[Architecture](docs/architecture/)** — System design, patterns, module structure
- **[Architecture Decisions](docs/adrs/)** — ADRs for technical decisions
- **[User Guide](docs/user-docs/)** — Getting started and usage guides

---

## Security

Casys PML is designed for local-first, privacy-respecting operation:

**Data Privacy:**

- All embeddings generated locally (BGE-M3 via Transformers.js)
- Data stored in local PGlite database (`.pml.db`)
- No cloud dependencies or external API calls for core functionality

**Sandbox Isolation:**

- Code execution runs in isolated Deno subprocess
- Limited permissions (configurable read paths only)
- No network access from sandbox by default
- PII detection and tokenization before execution

**MCP Communication:**

- HTTP server on localhost (no auth required for local use)

---

## Contributing

We welcome contributions! Here's how to get started:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes** and ensure tests pass: `deno task test`
4. **Format and lint**: `deno task fmt && deno task lint`
5. **Commit your changes**: `git commit -m 'Add amazing feature'`
6. **Push to the branch**: `git push origin feature/amazing-feature`
7. **Open a Pull Request**

### Development Setup

```bash
# Clone your fork
git clone https://github.com/casys-ai/casys-pml.git
cd casys-pml

# Install dependencies (Deno manages this automatically)
deno cache src/main.ts

# Run tests
deno task test

# Start development
deno task dev
```

---

## License

This project is licensed under the **AGPL-3.0 License** — see the [LICENSE](LICENSE) file for
details.

---

## Acknowledgments

- **[Deno](https://deno.land/)** — Modern JavaScript/TypeScript runtime
- **[Fresh](https://fresh.deno.dev/)** — Next-gen web framework for Deno
- **[PGlite](https://github.com/electric-sql/pglite)** — Lightweight PostgreSQL WASM
- **[Drizzle ORM](https://orm.drizzle.team/)** — TypeScript ORM
- **[Transformers.js](https://github.com/xenova/transformers.js)** — Local ML model inference
- **[MCP SDK](https://github.com/modelcontextprotocol)** — Model Context Protocol by Anthropic
- **[Graphology](https://graphology.github.io/)** — Graph data structure and algorithms
- **[D3.js](https://d3js.org/)** — Graph visualization library

---

[Report Bug](https://github.com/casys-ai/casys-pml/issues) |
[Request Feature](https://github.com/casys-ai/casys-pml/issues) |
[Documentation](docs/)
