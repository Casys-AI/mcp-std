# MCP Standard Library

MCP Std is a Deno library and MCP server that exposes a broad collection of
system, data-processing, utility, and agent tools. It also ships prebuilt MCP
Apps viewer bundles for clients that support tool-result UIs.

The public package version is defined in [`deno.json`](./deno.json). The tool
catalogue is intentionally derived from the source rather than duplicated here:
use `MiniToolsClient#listTools()` to inspect the tools available in a release.

## Quick start

For a local, trusted MCP client:

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

`-A` is appropriate only when enabling the complete catalogue: several tools
need to read files, inspect the environment, or start local commands. For a
restricted deployment, expose only the necessary categories and grant the
corresponding Deno permissions.

### Categories

Load only the categories needed by a client:

```json
{
  "mcpServers": {
    "std": {
      "command": "deno",
      "args": [
        "run", "-A", "jsr:@casys/mcp-std/server",
        "--categories=text,json,math"
      ]
    }
  }
}
```

List the accepted category names with
`deno run -A jsr:@casys/mcp-std/server --list-categories`. Category names are
trimmed, duplicates are ignored, and unknown names fail fast instead of
silently starting a server with a partial catalogue.

### Local HTTP mode

HTTP mode is intended for local development or deployment behind an explicit
security boundary. Bind it to loopback unless you have deliberately configured
authentication and a CORS allowlist in front of it:

```sh
deno run -A jsr:@casys/mcp-std/server --http --port=3008 --hostname=127.0.0.1
```

Do not expose a process with system-tool permissions directly on a public
interface.

## TypeScript API

```ts
import { MiniToolsClient } from "jsr:@casys/mcp-std";

const client = new MiniToolsClient({ categories: ["text", "json"] });

// `listTools()` is synchronous and returns the tool descriptors.
const tools = client.listTools();
console.log(`${tools.length} tools available`);

const result = await client.execute("text_split", {
  text: "hello,world",
  separator: ",",
});
```

`MiniToolsMCP` is available when a lightweight implementation of the MCP client
interface is useful. Its `callTool()` method requires `connect()` first.

## Building a custom MCP server

Use the current `McpApp` API from `@casys/mcp-server`; the older
`ConcurrentMCPServer` name is a backwards-compatible alias and should not be
used in new code.

```ts
import { McpApp } from "jsr:@casys/mcp-server";

const app = new McpApp({
  name: "my-server",
  version: "1.0.0",
  maxConcurrent: 5,
  backpressureStrategy: "queue",
});

app.registerTool(
  {
    name: "greet",
    description: "Greet someone",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    },
  },
  (args) => `Hello, ${(args as { name: string }).name}!`,
);

await app.start();
```

For HTTP servers, use `startHttp()` with an explicit origin allowlist and the
authentication appropriate to the deployment.

## Agent tools

The `agent` category delegates work to a configured model provider. It uses
`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`; `ANTHROPIC_MODEL` and `OPENAI_MODEL`
can override the respective defaults.

These tools do not promise a native MCP Sampling bridge or host-specific
sampling support. Treat them as provider-backed operations: configure a key,
review the data they may send to the provider, and expect normal provider cost,
availability, and rate-limit behaviour.

## MCP Apps viewers

Tools can declare a `ui://mcp-std/<viewer>` resource URI in their metadata.
The corresponding self-contained HTML is stored at:

```
src/ui/dist/<viewer>/index.html
```

Those generated bundles are versioned as package assets and are included both
when publishing to JSR and when compiling a standalone executable. The viewer
source and its independent Node/Vite build live in `src/ui`; build it only when
you intentionally update the UI assets:

```sh
deno task build:ui
```

## Development checks

The repository keeps checks deliberately scoped to the public entry points,
non-UI client tests, and UI-resource loader tests:

```sh
deno task fmt:check
deno task check
deno task lint
deno task test
```

CI runs the four tasks above and verifies that packaged viewer assets exist
before publishing or building release binaries. `deno.json` uses
`nodeModulesDir: "none"`, so Deno resolution does not create a root
`node_modules` directory; the separate UI build remains responsible for its own
dependencies under `src/ui`.

## Environment variables

| Variable | Description | Default |
| --- | --- | --- |
| `PGLITE_PATH` | Path for the embedded PGlite database | `./data/pglite` |
| `ANTHROPIC_API_KEY` | Enables Anthropic-backed agent tools | unset |
| `ANTHROPIC_MODEL` | Anthropic model override | `claude-sonnet-4-20250514` |
| `OPENAI_API_KEY` | Enables OpenAI-backed agent tools | unset |
| `OPENAI_MODEL` | OpenAI model override | `gpt-4.1` |

## License

MIT
