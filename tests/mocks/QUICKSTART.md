# Mock MCP Servers - Quick Start

## 🚀 Test en 30 Secondes

```bash
# Test le plus simple - dry-run avec mocks
deno task cli:init:dry:mocks
```

**Résultat:**

```
📊 Migration Preview:
  Servers to migrate: 3
  Servers:
    - filesystem (deno)
    - database (deno)
    - api (deno)
```

## 🧪 Test un Mock Individuellement

```bash
# Test filesystem mock
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | deno task mock:fs
```

**Résultat:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      { "name": "read_file", "description": "Read contents of a file..." },
      { "name": "write_file", "description": "Write contents to a file..." },
      { "name": "list_directory", "description": "List files and directories..." }
    ]
  }
}
```

## 🎯 Ce Qui Est Testé

✅ **3 Mock Servers**

- Filesystem (3 tools) - Rapide
- Database (4 tools) - Lent (teste parallélisation)
- API (3 tools) - Moyen (schemas complexes)

✅ **Parallélisation**

- Les 3 servers s'exécutent en parallèle
- Temps total ≈ max(100ms, 50ms, 0ms) = ~100ms
- Sans parallélisation: ~150ms

✅ **10 Tools Total**

- Extraction de schemas
- Génération d'embeddings
- Storage en base de données

## 📊 Benchmarks

```bash
# Mesurer la parallélisation
time deno run --allow-all src/main.ts init --config tests/fixtures/mcp-config-mocks.json
```

**Attendu:**

- Parallèle: <200ms (juste extraction, sans embeddings)
- Séquentiel: >300ms

## 🔬 Test End-to-End Complet

⚠️ **Attention:** Crée vraiment des fichiers et télécharge le model (~400MB)

```bash
deno task test:e2e
```

**Ce qui se passe:**

1. Crée `/tmp/agentcards-e2e-test/.agentcards/`
2. Parse le config avec 3 mocks
3. Extrait 10 tools en parallèle
4. Télécharge BGE model (première fois)
5. Génère les embeddings
6. Vérifie que tout est en DB
7. Nettoie automatiquement

**Sortie attendue:**

```
✅ E2E Test Results:
   Servers migrated: 3
   Tools extracted: 10
   Embeddings generated: 10
   Config: /tmp/agentcards-e2e-test/.agentcards/config.yaml
   Database: /tmp/agentcards-e2e-test/.agentcards/.agentcards.db
```

## 🎓 Use Cases

### Dev: Test Rapide Sans Installation

```bash
deno task cli:init:dry:mocks
```

### CI/CD: Tests Automatisés

```bash
deno task test              # Unit + integration (pas E2E)
deno task test:e2e          # E2E complet (optionnel, lent)
```

### Debug: Test un Mock Spécifique

```bash
deno task mock:fs
deno task mock:db
deno task mock:api
```

### Performance: Benchmark Parallélisation

```bash
time deno task cli:init:dry:mocks
```

## 📝 Fichiers Créés

- `tests/mocks/filesystem-mock.ts` - Mock filesystem server
- `tests/mocks/database-mock.ts` - Mock database server
- `tests/mocks/api-mock.ts` - Mock API client server
- `tests/fixtures/mcp-config-mocks.json` - Config pour les 3 mocks
- `tests/integration/e2e_migration_test.ts` - Tests E2E

## 🎯 Prochaines Étapes

1. ✅ Dry-run avec mocks fonctionne
2. 🚀 Prêt pour test E2E complet
3. 📦 Peut build et distribuer

Voir [README.md](./README.md) pour plus de détails.
