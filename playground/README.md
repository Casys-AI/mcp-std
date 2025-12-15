# Casys PML Playground

> **TL;DR:** Real MCP servers, real LLM calls, no mocks. Interactive notebooks to explore the Casys
> PML Gateway in minutes.

## What is this?

LLM agents today face a **context explosion problem**. When you connect 3-5 MCP servers to Claude or
GPT, you're injecting 30-50% of your context window with tool definitions alone. Add in conversation
history, and you quickly hit limits—paying more tokens for diminishing returns.

**Casys PML Gateway** solves this by acting as an intelligent proxy between your LLM and MCP
servers:

- **Vector Search:** Find the right tools semantically instead of listing all 200+
- **DAG Orchestration:** Execute multi-step workflows with dependency resolution
- **Sandbox Execution:** Run code safely with configurable permissions
- **GraphRAG Learning:** The system learns which tools work well together

This playground lets you experience these features hands-on—**no mocks, no simulations**. You'll run
real MCP servers, make real LLM calls, and see real metrics.

## Quick Start

### Option 1: GitHub Codespaces (Recommended)

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/Casys-AI/casys-pml?devcontainer_path=.devcontainer/playground/devcontainer.json)

**Steps (< 5 minutes):**

1. Click the badge above to open in Codespaces
2. Create `.env` file with your API key:
   ```bash
   echo 'ANTHROPIC_API_KEY="sk-ant-..."' > .env
   # Or OPENAI_API_KEY="sk-..." or GOOGLE_API_KEY="..."
   ```
3. Run notebook `00-introduction.ipynb`

### Option 2: Local Development

```bash
# Clone and navigate
git clone https://github.com/Casys-AI/casys-pml.git
cd casys-pml

# Setup environment
cp .env.example .env
# Edit .env with your API key

# Install Jupyter kernel
deno jupyter --install

# Start the MCP Gateway (first run: ~2-3 min for BGE-M3 model download)
# The gateway runs on http://localhost:3003 - keep this terminal open
deno task dev

# Launch notebooks in another terminal
jupyter notebook playground/notebooks/
```

## Notebook Overview

Follow the numbered progression for the best learning experience:

| #  | Notebook                        | Description                    |
| -- | ------------------------------- | ------------------------------ |
| 00 | `00-introduction.ipynb`         | Welcome & setup verification   |
| 01 | `01-the-problem.ipynb`          | Context explosion problem demo |
| 02 | `02-context-optimization.ipynb` | Vector search & tool filtering |
| 03 | `03-dag-execution.ipynb`        | DAG workflow basics            |
| 04 | `04-sandbox-security.ipynb`     | Sandbox permissions & limits   |
| 05 | `05-context-injection.ipynb`    | Dynamic context injection      |

## Lib Helpers

The `lib/` folder provides helpers optimized for Jupyter notebooks:

### `lib/init.ts` - Idempotent Initialization

```typescript
import { ensurePlaygroundReady } from "./lib/init.ts";

// Quick check - skips if already initialized
const status = await ensurePlaygroundReady();
console.log(`Ready! ${status.mcpServers.length} MCP servers available`);

// Verbose mode for debugging
const status = await ensurePlaygroundReady({ verbose: true });
```

**Functions:**

- `ensurePlaygroundReady(options?)` - Initialize playground (idempotent, <100ms if ready)
- `getPlaygroundDbPath()` - Get database path from env or default

### `lib/viz.ts` - Mermaid Visualization

```typescript
import { displayDag, displayGraphrag, displayLayers } from "./lib/viz.ts";

// Display a DAG workflow
await displayDag(workflow);

// Display execution layers (parallel groups)
await displayLayers(layers);

// Display GraphRAG tool relationships
await displayGraphrag(edges, { minWeight: 0.3 });
```

**Functions:**

- `displayMermaid(definition)` - Render any Mermaid diagram as SVG
- `displayDag(dag)` - Visualize DAG workflow structure
- `displayLayers(layers)` - Show parallel/sequential execution groups
- `displayGraphrag(edges, options?)` - Visualize tool relationships
- `displayTimeline(events)` - Show execution sequence diagram
- `displayEvolution(before, after)` - Compare GraphRAG before/after learning
- `displayWorkflowEdges(edges, options?)` - Visualize workflow templates

### `lib/metrics.ts` - ASCII Metrics Display

```typescript
import { compareMetrics, progressBar, speedupChart } from "./lib/metrics.ts";

// Progress bar
console.log(progressBar(66, 100, "Loading"));
// [████████████░░░░░░░░] 66% Loading

// Compare before/after metrics
console.log(compareMetrics(
  { tokens: 45000, latency: 2500 },
  { tokens: 12000, latency: 1800 },
  { labels: { before: "Without Gateway", after: "With Gateway" } },
));

// Speedup visualization
console.log(speedupChart(2500, 1800));
// Sequential: [██████████████████████████████] 2500ms
// Parallel:   [█████████████████████░░░░░░░░░] 1800ms
// Speedup: 1.39x faster
```

**Functions:**

- `progressBar(current, total, label?, options?)` - ASCII progress bar
- `compareMetrics(before, after, options?)` - Side-by-side comparison table
- `speedupChart(sequential, parallel, options?)` - Performance visualization
- `metricLine(label, value, unit?, options?)` - Single metric display
- `reductionSummary(before, after, unit, options?)` - Reduction percentage

### `lib/llm-provider.ts` - Multi-LLM Support

```typescript
import { createLLM, detectProvider, generateCompletion } from "./lib/llm-provider.ts";

// Auto-detect provider from API key format
const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
const provider = detectProvider(apiKey); // "anthropic"

// Generate completion (unified interface)
const result = await generateCompletion(
  { apiKey },
  "What is the capital of France?",
  { maxTokens: 100 },
);
console.log(result.text);
```

**Functions:**

- `detectProvider(apiKey)` - Auto-detect from key format (sk-ant-... → anthropic)
- `getDefaultModel(provider)` - Get default model for provider
- `createLLM(config)` - Create AI SDK model instance
- `generateCompletion(config, prompt, options?)` - Unified text generation

**Supported Providers:**

- OpenAI (`sk-...`) → gpt-4-turbo-preview
- Anthropic (`sk-ant-...`) → claude-3-5-sonnet-20241022
- Google (`AIza...`) → gemini-1.5-pro

## Configuration

All configuration is at **project root**:

```
casys-pml/
├── .env                       # API keys (gitignored)
├── .env.example               # Template with all variables
├── .mcp-servers.json          # MCP server config (gitignored)
├── .mcp-servers.example.json  # Template for MCP servers
├── config/
│   ├── workflow-templates.yaml
│   └── speculation_config.yaml
└── playground/
    ├── notebooks/
    └── lib/
```

See [config/README.md](../config/README.md) for details.

## MCP HTTP Server

Start the MCP Gateway before running notebooks:

```bash
# From project root
deno task dev
```

The gateway runs on **http://localhost:3003**. You must start it manually - Claude cannot start it for you.

**First run:** ~2-3 minutes (downloads BGE-M3 model - 2.2GB)
**Subsequent runs:** ~5 seconds (cached)

### Configuring Claude to use PML

Add to your MCP settings (`.mcp.json` or Claude Desktop config):

```json
{
  "mcpServers": {
    "cai": {
      "type": "http",
      "url": "http://localhost:3003/mcp"
    }
  }
}
```

No API key needed for local development. The gateway reads your MCP server configs from `config/.mcp-servers.json`.

### Available Tools

| Tool                      | Description                      |
| ------------------------- | -------------------------------- |
| `pml_execute_code` | Safe code execution in sandbox   |
| `pml_execute_dag`  | DAG workflow orchestration       |
| `pml_search_tools` | Semantic tool search             |
| `pml_continue`     | Continue paused DAG execution    |
| `pml_abort`        | Abort running DAG                |
| `pml_replan`       | Replan DAG with new requirements |

## Troubleshooting / FAQ

### API key not working

**Symptoms:** "Invalid API key" or "Unauthorized" errors

**Solution:**

1. Check `.env` file exists at project root (not in `playground/`)
2. Verify key format matches your provider:
   - Anthropic: `ANTHROPIC_API_KEY="sk-ant-api03-..."`
   - OpenAI: `OPENAI_API_KEY="sk-proj-..."`
   - Google: `GOOGLE_API_KEY="AIza..."`
3. No quotes needed if using `export`: `export ANTHROPIC_API_KEY=sk-ant-...`
4. Provider is auto-detected from key prefix

### MCP servers not connecting

**Symptoms:** "Gateway not available" or "Connection refused"

**Solution:**

1. Start the gateway first: `deno task dev`
2. Wait for "Ready on http://localhost:3003" message
3. Check port 3003 is not blocked: `curl http://localhost:3003/health`
4. First run downloads 2.2GB model—be patient

### Notebook stuck at embedding loading

**Symptoms:** Cell hangs on first run, no output for minutes

**Solution:**

1. First run downloads BGE-M3 model (~2.2GB)—this takes 2-3 minutes
2. Watch gateway terminal for download progress
3. Subsequent runs are fast (<5 seconds)
4. If truly stuck (>10 min), restart gateway and check disk space (~3GB needed)

### Mermaid diagrams not rendering

**Symptoms:** Empty output or error from visualization functions

**Solution:**

1. Diagrams use Kroki.io API—requires internet connection
2. Check network: `curl https://kroki.io/health`
3. If Kroki is down, diagrams will fail gracefully with error message
4. Alternative: Copy Mermaid code to [mermaid.live](https://mermaid.live)

### Jupyter kernel not found

**Symptoms:** "Kernel not found" or "deno" not available

**Solution:**

1. Install Deno Jupyter kernel: `deno jupyter --install`
2. Restart Jupyter after installation
3. Verify: `jupyter kernelspec list` should show "deno"

## Requirements

- **Deno:** 2.0+
- **Disk space:** ~3GB (for BGE-M3 embedding model)
- **API key:** One of OpenAI, Anthropic, or Google
- **Network:** Internet for Kroki.io diagram rendering

## Additional Resources

- [Main Documentation](../docs/index.md)
- [Architecture Overview](../docs/architecture.md)
- [Configuration Guide](../config/README.md)
- [ADR: Architecture Decisions](../docs/adrs/)
- [PRD: Product Requirements](../docs/PRD.md)
