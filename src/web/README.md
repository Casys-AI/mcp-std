# Casys PML Fresh Dashboard

Modern, interactive graph visualization dashboard built with **Deno Fresh**.

## Features

- **Server-Side Rendering (SSR)** with Preact
- **Islands Architecture** for interactive components
- **Real-time updates** via Server-Sent Events (SSE)
- **Interactive graph visualization** with D3.js force-directed layout
- **Responsive design** with Tailwind CSS
- **TypeScript** end-to-end
- **Zero build step** (Deno native)

## Quick Start

### 1. Start the Casys PML Gateway (required)

The Fresh dashboard fetches data from the Casys PML gateway API.

```bash
# Start gateway on port 3003
deno task dev
```

### 2. Start the Fresh Dashboard

```bash
# Development mode with hot reload
deno task dev:fresh

# Or directly
deno run -A src/web/dev.ts
```

The dashboard will be available at:

- **Dashboard:** http://localhost:8081/dashboard
- **Gateway API:** http://localhost:3003

## Architecture

```
src/web/
├── routes/
│   └── dashboard.tsx           # SSR route for /dashboard
├── islands/
│   ├── D3GraphVisualization.tsx  # Interactive D3.js graph component
│   └── GraphExplorer.tsx       # Graph explorer with panels
├── components/
│   ├── ui/                     # Atomic design UI components
│   │   ├── Badge.tsx           # Server filter badge
│   │   ├── GraphLegendPanel.tsx # Legend panel
│   │   ├── NodeDetailsPanel.tsx # Node details panel
│   │   └── GraphTooltip.tsx    # Hover tooltip
│   └── layout/                 # Layout components
├── static/                     # Static assets
├── fresh.config.ts             # Fresh configuration
├── fresh.gen.ts                # Generated manifest (auto)
└── dev.ts                      # Server entry point
```

## How It Works

### SSR + Islands

1. **Route (`dashboard.tsx`):**
   - Server-side rendered
   - Loads D3.js from CDN
   - Hydrates D3GraphVisualization island

2. **Island (`D3GraphVisualization.tsx`):**
   - Client-side interactive
   - D3.js force-directed layout with zoom/pan
   - Fetches initial graph data from `/api/graph/snapshot`
   - Connects to `/events/stream` for real-time updates
   - Supports hyperedges (multiple parents per node)

3. **Components:**
   - `GraphLegendPanel.tsx`: MCP server filtering, edge type legend
   - `NodeDetailsPanel.tsx`: Node information panel
   - `GraphTooltip.tsx`: Enriched hover tooltip

### Real-Time Updates

The dashboard listens to SSE events from the gateway:

```typescript
const eventSource = new EventSource("/events/stream");

eventSource.addEventListener("node_created", (event) => {
  // Add new node to graph
});

eventSource.addEventListener("graph.edge.created", (event) => {
  // Add new edge to graph
});

eventSource.addEventListener("graph.edge.updated", (event) => {
  // Update edge confidence/type
});
```

## Environment Variables

```bash
# Fresh server port (default: 8081)
FRESH_PORT=8081

# Casys PML gateway API base URL (default: http://localhost:3003)
API_BASE=http://localhost:3003
```

## Development

```bash
# Start with custom port
FRESH_PORT=9000 deno task dev:fresh

# Type check
deno check src/web/**/*.ts src/web/**/*.tsx

# Format code
deno fmt src/web/
```

## Deployment

Fresh runs natively on Deno Deploy with zero configuration:

```bash
# Build for production (optional - Fresh is runtime)
deno task fresh:build

# Or deploy directly
deployctl deploy
```

## Migration Notes

### Cytoscape.js to D3.js (December 2024)

The visualization was migrated from Cytoscape.js to D3.js to support hyperedges
(multiple parents per node). See commit `cb15d9e`.

**Key changes:**
- Force-directed layout with d3-force
- SVG-based rendering (vs Canvas)
- Full zoom/pan support with d3-zoom
- Drag and drop node positioning
- Edge markers for different edge types

## Troubleshooting

### Dashboard shows empty graph

1. Ensure gateway is running on port 3003
2. Check if workflows are synced to database:
   ```bash
   deno task cli init
   ```
3. Restart gateway to reload graph from database

### SSE connection fails

- Verify `/events/stream` endpoint is accessible
- Check browser console for connection errors
- Ensure no CORS issues (Fresh and gateway on same origin or CORS enabled)

### D3 not loading

- Check browser console for CDN errors
- Verify internet connection (D3 loaded from CDN)
- Consider vendoring D3 for offline use

## Related Documentation

- [Story 6.2 - Interactive Graph Visualization Dashboard](../../docs/stories/6-2-interactive-graph-visualization-dashboard.md)
- [ADR-029 - Hypergraph Capabilities Visualization](../../docs/adrs/ADR-029-hypergraph-capabilities-visualization.md)
- [Fresh Documentation](https://fresh.deno.dev/)
- [D3.js Documentation](https://d3js.org/)
