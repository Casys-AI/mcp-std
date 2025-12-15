# Context Optimization Module

On-demand schema loading and context window optimization for Casys PML.

## Overview

The Context Optimization module provides intelligent, on-demand loading of MCP tool schemas using
semantic vector search. Instead of loading all available tool schemas into the context window (which
can consume 30-50% of available tokens), this module loads only the most relevant tools based on the
user's query, reducing context usage to <5%.

## Key Features

- **Semantic Search Integration**: Uses BGE-Large-EN-v1.5 embeddings and vector search to find
  relevant tools
- **On-Demand Loading**: Loads only matched schemas, not all-at-once
- **LRU Caching**: Caches frequently used tool schemas to avoid redundant database queries
- **Context Usage Tracking**: Measures and logs context window utilization
- **Performance Monitoring**: Tracks query latency with P95 <200ms target
- **Before/After Comparison**: Shows optimization benefits (30-50% → <5% usage)

## Architecture

```
┌─────────────┐
│ User Query  │
└──────┬──────┘
       │
       ▼
┌──────────────────┐
│ ContextOptimizer │
└──────┬───────────┘
       │
       ├─────────────────────────────┐
       │                             │
       ▼                             ▼
┌──────────────┐            ┌───────────────┐
│ VectorSearch │            │ SchemaCache   │
│ (semantic)   │            │ (LRU, 50 max) │
└──────┬───────┘            └───────┬───────┘
       │                            │
       │  Search Results            │  Cache Hit?
       ▼                            ▼
┌────────────────────────────────────────┐
│ Load Schemas (on-demand)               │
└────────┬───────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│ Measure Context Usage & Log Metrics    │
└────────────────────────────────────────┘
```

## Usage

### Basic Usage

```typescript
import { ContextOptimizer } from "./src/context/index.ts";
import { VectorSearch } from "./src/vector/search.ts";
import { PGliteClient } from "./src/db/client.ts";
import { EmbeddingModel } from "./src/vector/embeddings.ts";

// Initialize dependencies
const db = new PGliteClient("~/.pml/.pml.db");
await db.connect();

const embeddingModel = new EmbeddingModel();
await embeddingModel.load();

const vectorSearch = new VectorSearch(db, embeddingModel);

// Create optimizer
const optimizer = new ContextOptimizer(vectorSearch, db, 50);

// Get relevant schemas for a user query
const result = await optimizer.getRelevantSchemas(
  "read and write files",
  5, // topK - number of tools to return
  0.7, // minScore - minimum similarity threshold
);

console.log(`Loaded ${result.schemas.length} relevant tools`);
console.log(`Context usage: ${result.contextUsagePercent.toFixed(2)}%`);
console.log(`Query latency: ${result.latencyMs.toFixed(2)}ms`);
console.log(`Cache hits: ${result.cacheHits}, misses: ${result.cacheMisses}`);

// Use the schemas
for (const schema of result.schemas) {
  console.log(`- ${schema.name}: ${schema.description}`);
}
```

### Show Before/After Comparison

```typescript
// Get total number of tools in database
const totalToolsResult = await db.query(
  "SELECT COUNT(*) as count FROM tool_schema",
);
const totalTools = parseInt(totalToolsResult[0].count as string);

// Get relevant schemas
const result = await optimizer.getRelevantSchemas("manage database", 5);

// Display comparison
await optimizer.showContextComparison(totalTools, result.schemas);

// Output:
// 📊 Context Usage Comparison:
//    ┌──────────┬─────────────┬────────────┬──────────┐
//    │ Phase    │ Tool Count  │ Tokens     │ Usage    │
//    ├──────────┼─────────────┼────────────┼──────────┤
//    │ BEFORE   │ 100         │ 50000      │ 25.00%   │
//    │ AFTER    │ 5           │ 2500       │ 1.25%    │
//    ├──────────┼─────────────┼────────────┼──────────┤
//    │ SAVINGS  │ 95          │ 47500      │ 23.75%   │
//    └──────────┴─────────────┴────────────┴──────────┘
```

### Cache Management

```typescript
// Get cache statistics
const stats = optimizer.getCacheStats();
console.log(`Cache size: ${stats.size}/${stats.maxSize}`);
console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(2)}%`);
console.log(`Hits: ${stats.hits}, Misses: ${stats.misses}`);

// Clear cache (useful for testing or forcing fresh loads)
optimizer.clearCache();
```

### Metrics and Performance Monitoring

```typescript
import { calculateP95Latency, getRecentMetrics } from "./src/context/metrics.ts";

// Get recent context usage measurements
const usageMetrics = await getRecentMetrics(db, "context_usage_pct", 100);
for (const metric of usageMetrics) {
  console.log(`${metric.timestamp}: ${metric.value.toFixed(2)}%`);
}

// Calculate P95 latency from recent queries
const p95 = await calculateP95Latency(db, 100);
console.log(`P95 latency: ${p95?.toFixed(2)}ms`);

if (p95 && p95 < 200) {
  console.log("✓ Performance target met (<200ms)");
}
```

## API Reference

### ContextOptimizer

Main class for on-demand schema loading.

#### Constructor

```typescript
constructor(
  vectorSearch: VectorSearch,
  db: PGliteClient,
  cacheSize: number = 50
)
```

#### Methods

**`getRelevantSchemas(userQuery, topK?, minScore?)`**

Get relevant tool schemas for a user query.

- `userQuery` (string): Natural language query
- `topK` (number, default: 5): Number of top tools to retrieve
- `minScore` (number, default: 0.7): Minimum similarity score threshold
- Returns: `Promise<RelevantSchemasResult>`

**`showContextComparison(totalSchemas, relevantSchemas)`**

Display before/after context usage comparison.

- `totalSchemas` (number): Total number of schemas in database
- `relevantSchemas` (MCPTool[]): Schemas from getRelevantSchemas()
- Returns: `Promise<void>`

**`getCacheStats()`**

Get cache statistics.

- Returns: `{ size, maxSize, hits, misses, hitRate }`

**`clearCache()`**

Clear schema cache.

- Returns: `void`

### SchemaCache

LRU cache for tool schemas.

#### Constructor

```typescript
constructor(maxSize: number = 50)
```

#### Methods

**`get(toolId)`** - Retrieve cached schema **`set(toolId, schema)`** - Add schema to cache
**`has(toolId)`** - Check if tool is cached **`clear()`** - Clear all entries **`getStats()`** - Get
cache statistics **`getTopTools(limit?)`** - Get most accessed tools

### Metrics Utilities

**`estimateTokens(schemas)`** - Estimate token count for schemas
**`calculateUsagePercent(schemas, contextWindow?)`** - Calculate context usage percentage
**`measureContextUsage(schemas, contextWindow?)`** - Measure full context usage metrics
**`compareContextUsage(allSchemas, relevantSchemas, contextWindow?)`** - Compare before/after
**`displayContextComparison(comparison)`** - Display comparison in console
**`logContextUsage(db, usage, metadata?)`** - Log usage metric to database
**`logQueryLatency(db, latencyMs, metadata?)`** - Log latency metric
**`logCacheHitRate(db, hitRate, metadata?)`** - Log cache hit rate
**`getRecentMetrics(db, metricName, limit?)`** - Retrieve recent metrics
**`calculateP95Latency(db, limit?)`** - Calculate P95 latency

## Database Schema

The module requires a `metrics` table:

```sql
CREATE TABLE metrics (
  id SERIAL PRIMARY KEY,
  metric_name TEXT NOT NULL,
  value REAL NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB
);

-- Indexes for efficient queries
CREATE INDEX idx_metrics_name_timestamp ON metrics(metric_name, timestamp DESC);
CREATE INDEX idx_metrics_timestamp ON metrics(timestamp DESC);
```

Migration file: `src/db/migrations/002_metrics.sql`

## Performance Characteristics

- **Query Latency**: P95 <200ms (includes vector search + cache lookup + metrics logging)
- **Context Usage**: <5% for typical queries (5-10 tools loaded)
- **Cache Hit Rate**: >60% for repeated queries
- **Token Estimation**: ~500 tokens per tool schema (rough heuristic)

## Testing

Run unit tests:

```bash
deno test --allow-all tests/unit/context/
```

Run benchmarks:

```bash
deno bench --allow-all tests/benchmark/context_latency_bench.ts
```

Test coverage:

- ✓ AC1: Integration semantic search avec schema loading
- ✓ AC2: Workflow: query → vector search → retrieve top-k tools → load schemas
- ✓ AC3: Schemas retournés uniquement pour matched tools (pas all-at-once)
- ✓ AC4: Context usage measurement et logging (<5% target)
- ✓ AC5: Comparison metric affiché: before (30-50%) vs after (<5%)
- ✓ AC6: Cache hit pour frequently used tools (évite reloading)
- ✓ AC7: Performance: Total query-to-schema latency <200ms P95

## Example Scenario

### Problem: Context Window Saturation

User has 100 MCP tools across 15 servers installed. Loading all tool schemas:

- **Tokens**: 50,000 (100 tools × 500 tokens/tool)
- **Context Usage**: 25% of Claude's 200k window
- **Impact**: Limited space for actual conversation and code

### Solution: On-Demand Loading

User asks: "read a file from disk"

1. Query embedded with BGE-Large-EN-v1.5
2. Vector search finds top-5 file-related tools
3. Load only those 5 schemas
4. **Result**:
   - Tokens: 2,500 (5 tools × 500 tokens/tool)
   - Context Usage: 1.25%
   - Savings: 23.75% context recovered

## Integration Points

- **VectorSearch** (`src/vector/search.ts`): Semantic tool discovery
- **EmbeddingModel** (`src/vector/embeddings.ts`): Query encoding (BGE-Large-EN-v1.5)
- **PGliteClient** (`src/db/client.ts`): Database access for metrics
- **MCPTool** (`src/mcp/types.ts`): Tool schema type definitions

## Future Enhancements

- [ ] Adaptive cache sizing based on usage patterns
- [ ] Multi-tier caching (memory + persistent)
- [ ] Query result caching (same query → instant results)
- [ ] Predictive preloading based on conversation context
- [ ] Compression for large tool schemas
- [ ] Token estimation using actual tiktoken library

## License

Part of Casys PML project.
