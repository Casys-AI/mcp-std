 MCP Apps UI Components

This directory contains 40+ interactive UI components for MiniTools, built with **Preact** and **Tailwind CSS v4**. Each component is compiled into a single self-contained HTML file for use with the MCP Apps extension (SEP-1865).

## Architecture

```
src/ui/
├── mod.ts                  # Module exports and loadUiHtml helper
├── build-all.mjs           # Build script for all components
├── vite.single.config.mjs  # Vite config for single-file builds
├── global.css              # Tailwind CSS v4 configuration with @theme
├── tailwind.config.js      # (removed - config now in global.css)
├── dist/                   # Built single-file HTML bundles (gitignored)
├── components/
│   ├── ui/                 # Reusable UI components (Button, Alert, etc.)
│   └── utils.ts            # Utility functions (cx, formatValue, etc.)
├── shared/                 # Shared utilities (skeletons, interactions, etc.)
└── <component-name>/       # Component source folders
    ├── index.html          # Entry point
    └── src/
        └── main.tsx        # Component implementation
```

## Stack

- **Preact 10.28.2** - Fast 3kB React alternative
- **Tailwind CSS 4.1.18** - Utility-first CSS framework
- **@tailwindcss/vite** - Vite plugin for Tailwind v4
- **vite-plugin-singlefile** - Bundles everything into a single HTML file

## Components Reference

### Data Visualization

| Component | Description | Data Properties |
|-----------|-------------|-----------------|
| **chart-viewer** | Bar, line, and pie charts | `{ type: "bar"|"line"|"pie", title?, labels: string[], datasets: [{ label?, data: number[], color? }] }` |
| **gauge** | Circular/linear gauge with thresholds | `{ value: number, min?, max?, label?, unit?, thresholds?: { warning?, critical? }, format?: "circular"|"linear"|"compact" }` |
| **sparkline** | Inline mini charts | `{ values: number[], type?: "line"|"bar", width?, height?, color? }` |
| **metrics-panel** | Dashboard metrics display | `{ metrics: [{ label: string, value: number|string, change?, trend?: "up"|"down" }] }` |
| **resource-monitor** | System resource monitoring | `{ cpu?: number, memory?: number, disk?: number, network?: { in: number, out: number } }` |
| **disk-usage-viewer** | Disk space visualization | `{ total: number, used: number, free: number, partitions?: [{ name, size, used }] }` |

### Data Display

| Component | Description | Data Properties |
|-----------|-------------|-----------------|
| **table-viewer** | Interactive data table | `{ columns: string[], rows: unknown[][], totalCount? }` or `[{ key: value, ... }]` |
| **json-viewer** | Collapsible JSON tree | Any valid JSON structure |
| **yaml-viewer** | YAML syntax display | YAML string or parsed object |
| **xml-viewer** | XML tree viewer | XML string with syntax highlighting |
| **tree-viewer** | Hierarchical tree display | `{ name: string, children?: TreeNode[], expanded?, icon? }` |
| **schema-viewer** | JSON Schema visualization | Valid JSON Schema object |
| **erd-viewer** | Entity-Relationship diagrams | `{ schema: string, tables: [{ name, columns: [{ name, type, isPrimaryKey }] }], relationships: [{ fromTable, fromColumn, toTable, toColumn }] }` |

### Developer Tools

| Component | Description | Data Properties |
|-----------|-------------|-----------------|
| **diff-viewer** | Side-by-side/unified diff | `{ filename?, hunks?: [{ header, lines: [{ type: "add"|"remove"|"context", content }] }], unified?: string }` |
| **blame-viewer** | Git blame annotations | `{ file: string, lines: [{ lineNumber, commitHash, author, timestamp, content, summary }] }` |
| **commit-graph** | Git commit graph | `{ commits: [{ hash, shortHash, message, refs, parents, author, timestamp }], branches }` |
| **log-viewer** | Filterable log display | `{ logs: [{ timestamp?, level?: "debug"|"info"|"warn"|"error", message }], title? }` |
| **headers-viewer** | HTTP headers display | `{ url?, status?, headers: Record<string, string>, type?: "request"|"response" }` |
| **waterfall-viewer** | Request timing waterfall | `{ requests: [{ name, start, duration, type? }], total? }` |
| **timeline-viewer** | Event timeline | `{ events: [{ timestamp, title, description?, type? }] }` |
| **plan-viewer** | Execution plan visualization | `{ nodes: [{ id, type, operation, cost?, rows? }], edges?: [{ from, to }] }` |

### Security and Crypto

| Component | Description | Data Properties |
|-----------|-------------|-----------------|
| **jwt-viewer** | JWT token decoder | `{ header: object, payload: object, signature: string, expired?, expiresAt? }` |
| **certificate-viewer** | SSL/TLS certificate details | `{ host, port, valid, certificate: { subject, issuer, validFrom, validTo, daysRemaining, sans }, chain?, status }` |
| **validation-result** | Validation results display | `{ valid: boolean, errors?: [{ path, message }], warnings?, schema? }` |

### Forms and Input

| Component | Description | Data Properties |
|-----------|-------------|-----------------|
| **form-viewer** | Dynamic form from JSON Schema | `{ schema: JSONSchema, values?, title?, submitLabel? }` |
| **color-picker** | Color selection tool | `{ value?: string, format?: "hex"|"rgb"|"hsl", palette?: string[] }` |
| **palette-viewer** | Color palette display | `{ colors: [{ name?, value: string, variants? }], title? }` |

### Utilities

| Component | Description | Data Properties |
|-----------|-------------|-----------------|
| **qr-viewer** | QR code display | `{ svg?: string, dataUrl?, ascii?, data?, size?, errorCorrection? }` |
| **map-viewer** | Geographic data viewer | `{ points?: [{ lat, lng, label?, color? }], lines?: [{ from, to, distance? }], polygons?, title? }` |
| **status-badge** | Status indicator | `{ status: "success"|"warning"|"error"|"info"|"pending", label?, message? }` |

## Adding a New Component

### 1. Create the component folder

```bash
mkdir -p src/ui/my-component/src
```

### 2. Create index.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>My Component</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./src/main.tsx"></script>
</body>
</html>
```

### 3. Create src/main.tsx

```tsx
import { render } from "preact";
import { useState, useEffect } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { cx } from "../../components/utils";
import { containers, typography } from "../../shared";
import "../../global.css";

// Types
interface MyData {
  value: string;
  // ... your data structure
}

// MCP App Connection
const app = new App({ name: "My Component", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// Component
function MyComponent() {
  const [data, setData] = useState<MyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
    }).catch(() => {});

    app.ontoolresult = (result) => {
      setLoading(false);
      try {
        const textContent = result.content?.find((c) => c.type === "text");
        if (textContent?.text) {
          setData(JSON.parse(textContent.text));
        }
      } catch (e) {
        console.error("Parse error:", e);
      }
    };
  }, []);

  if (loading) {
    return <div className={containers.centered}>Loading...</div>;
  }

  if (!data) {
    return <div className={containers.centered}>No data</div>;
  }

  return (
    <div className={containers.root}>
      <h2 className={typography.sectionTitle}>My Component</h2>
      {/* Your component UI */}
    </div>
  );
}

// Mount
render(<MyComponent />, document.getElementById("app")!);
```

### 4. Build the component

```bash
cd lib/std/src/ui
node build-all.mjs
```

## Build System

### Build all components

```bash
# From project root
deno task build:ui

# Or from ui folder
cd lib/std/src/ui
node build-all.mjs
```

### Build output

Each component is compiled into a single self-contained HTML file in `dist/<component>/index.html`. The build uses:

- **Vite** with `vite-plugin-singlefile` for bundling
- **Preact** for reactive UI (~4kB gzip)
- **Tailwind CSS v4** for styling with dark mode support (~10kB gzip purged)

Total bundle size: ~70kB gzip (down from ~205kB with React + Panda CSS)

## Styling Guidelines

### Tailwind v4 Theme Tokens

The theme is configured in `global.css` using `@theme`:

```css
@theme {
  --color-fg-default: var(--fg-default, #1a1a1a);
  --color-fg-muted: var(--fg-muted, #6b7280);
  --color-bg-canvas: var(--bg-canvas, #ffffff);
  --color-bg-subtle: var(--bg-subtle, #f9fafb);
  --color-border-default: var(--border-default, #e5e7eb);
}
```

### Using Theme Colors

```tsx
// Use semantic colors from the theme
<div className="text-fg-default bg-bg-canvas border border-border-default">
  <span className="text-fg-muted">Muted text</span>
</div>
```

### Dark Mode

Dark mode is automatic via CSS variables. The `.dark` class on `<html>` switches the variable values:

```css
.dark {
  --fg-default: #f9fafb;
  --bg-canvas: #111827;
  /* ... */
}
```

### Shared Utilities

Import from `../../shared` for consistent styling:

```tsx
import { containers, typography, interactive, valueTransition } from "../../shared";

// containers.root = "p-4 font-sans text-sm text-fg-default bg-bg-canvas"
// containers.centered = "flex items-center justify-center p-8 text-fg-muted"
// typography.sectionTitle = "text-lg font-semibold"
// typography.muted = "text-sm text-fg-muted"
// interactive.scaleOnHover = "transition-transform duration-150 hover:scale-[1.02]"
```

## MCP Apps Integration

### Adding _meta.ui to a tool

Reference a UI in your tool definition:

```typescript
{
  name: "my_tool",
  description: "Tool description",
  category: "mymodule",
  inputSchema: { /* ... */ },
  _meta: {
    ui: {
      resourceUri: "ui://mcp-std/my-component",
      emits: ["select", "filter"],
      accepts: ["setData", "highlight"]
    }
  },
  handler: async (args) => { /* ... */ }
}
```

## Testing

Use the test host for development:

```bash
# Start dev server
cd lib/std/src/ui
npx vite --config vite.single.config.mjs

# Open test-host.html in browser with your component
```
