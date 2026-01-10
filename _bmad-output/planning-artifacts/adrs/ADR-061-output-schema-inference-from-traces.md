# ADR-061: Output Schema Inference from Execution Traces

## Status
Accepted

## Date
2026-01-10

## Context

Le système de DAG suggestion dépend des "provides edges" pour composer des workflows cohérents. Ces edges connectent les tools dont l'output peut servir d'input à un autre tool.

### Problème observé

Le `provides-edge-calculator` (Story 10.3) existe et fonctionne, mais il manque de données:

| Métrique | Valeur |
|----------|--------|
| Tools avec `input_schema` | 585 (100%) |
| Tools avec `output_schema` | 26 (4.4%) |
| Provides edges calculables | Très peu |

### Cause racine

1. **MCP n'expose pas les output schemas**: Le protocole MCP définit `inputSchema` mais pas `outputSchema` de manière standard
2. **Pas d'inférence runtime**: On exécute des tools et on a leurs outputs réels dans `execution_trace.task_results`, mais on ne les utilise pas pour enrichir les schemas

## Decision

### 1. Inférence de schema depuis les valeurs

Ajouter une fonction qui infère un JSON Schema depuis une valeur JavaScript:

```typescript
// src/capabilities/output-schema-inferrer.ts
export function inferSchemaFromValue(value: unknown): JSONSchema {
  if (value === null) return { type: "null" };
  if (typeof value === "string") return { type: "string" };
  if (typeof value === "number") return { type: Number.isInteger(value) ? "integer" : "number" };
  if (typeof value === "boolean") return { type: "boolean" };
  if (Array.isArray(value)) {
    if (value.length === 0) return { type: "array" };
    // Infer items schema from first element (or union if heterogeneous)
    return { type: "array", items: inferSchemaFromValue(value[0]) };
  }
  if (typeof value === "object") {
    const properties: Record<string, JSONSchema> = {};
    for (const [k, v] of Object.entries(value)) {
      properties[k] = inferSchemaFromValue(v);
    }
    return { type: "object", properties };
  }
  return {}; // Unknown type
}
```

### 2. Merge intelligent des schemas

Quand on observe plusieurs outputs du même tool, merger les schemas:

```typescript
export function mergeSchemas(existing: JSONSchema, observed: JSONSchema): JSONSchema {
  // Si types différents, garder le plus général
  // Si objects, merger les properties (union)
  // Si arrays, merger les items schemas
  // Tracker "required" basé sur ce qui est toujours présent
}
```

### 3. Hook post-execution

Dans le flow post-execution, après chaque tool call:

```typescript
// post-execution.service.ts ou nouveau fichier
async function enrichToolOutputSchema(
  db: DbClient,
  toolId: string,
  output: unknown
): Promise<void> {
  // 1. Inférer schema depuis output
  const inferredSchema = inferSchemaFromValue(output);

  // 2. Récupérer schema existant
  const existing = await getToolOutputSchema(db, toolId);

  // 3. Merger (ou remplacer si premier)
  const merged = existing ? mergeSchemas(existing, inferredSchema) : inferredSchema;

  // 4. Sauvegarder
  await updateToolOutputSchema(db, toolId, merged);

  // 5. Recalculer provides edges pour ce tool
  await syncProvidesEdgesForTool(db, toolId);
}
```

### 4. Batch processing des traces existantes

Script one-shot pour traiter les traces historiques:

```typescript
// scripts/backfill-output-schemas.ts
async function backfillOutputSchemas(db: DbClient): Promise<void> {
  // 1. Récupérer toutes les traces avec task_results
  // 2. Pour chaque tool_id unique, agréger les outputs
  // 3. Inférer et merger les schemas
  // 4. Bulk update tool_schema
  // 5. Full sync provides edges
}
```

## Conséquences

### Positives

- **Auto-enrichissement**: Plus on exécute, plus les schemas sont précis
- **Provides edges**: Le calculator peut enfin faire son travail
- **DAG suggestion**: Composition basée sur les types réels
- **Zero effort manuel**: Pas besoin d'annoter les 560+ tools manquants

### Négatives

- **Latence post-execution**: +quelques ms pour inférence et DB update
- **Schema drift**: Si un tool change son output, le schema peut devenir incorrect
- **Variabilité**: Certains tools ont des outputs qui varient selon les inputs

### Mitigations

1. **Async processing**: L'enrichissement peut être fait en background
2. **Observation count**: Tracker combien de fois on a observé le schema, confidence basée sur ça
3. **Schema versioning**: Garder un historique si nécessaire

## Métriques à surveiller

- `tool_schema.output_schema IS NOT NULL` count (devrait augmenter)
- `tool_dependency WHERE edge_type = 'provides'` count
- Latence post-execution (ne devrait pas augmenter significativement)

## Alternatives considérées

### A. LLM-based inference
- Demander à un LLM de deviner l'output schema depuis la description
- **Rejeté**: Moins précis que les données réelles, coût API

### B. Manual annotation
- Annoter manuellement les 560 tools
- **Rejeté**: Ne scale pas, maintenance impossible

### C. MCP extension
- Proposer une extension MCP pour output schemas
- **Considéré pour le futur**: Dépend de l'adoption par les serveurs MCP

## Implementation Plan

1. **Phase 1**: `output-schema-inferrer.ts` avec tests
2. **Phase 2**: Hook dans post-execution (async)
3. **Phase 3**: Backfill script pour traces existantes
4. **Phase 4**: Monitoring et ajustements

## References

- ADR-010: Hybrid DAG Architecture
- Story 10.3: Provides Edge Type
- `provides-edge-calculator.ts`: Existing calculator waiting for data
