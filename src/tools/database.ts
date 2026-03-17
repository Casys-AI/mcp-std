/**
 * Database tools - SQL and NoSQL database access
 *
 * @module lib/std/tools/database
 */

import { type MiniTool, runCommand } from "./common.ts";

/** PostgreSQL connection parameters */
interface PsqlConnectionParams {
  url?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
}

/**
 * Build PostgreSQL connection string from params.
 * Priority: explicit url > DATABASE_URL env > individual params
 */
function buildPsqlConnectionString(params: PsqlConnectionParams): string {
  const { url, host = "localhost", port = 5432, database, user = "postgres", password } = params;

  if (url) {
    return url;
  }

  const envUrl = Deno.env.get("DATABASE_URL");
  if (envUrl) {
    return envUrl;
  }

  if (!database) {
    throw new Error("Either url, DATABASE_URL env, or database param is required");
  }

  return password
    ? `postgres://${user}:${password}@${host}:${port}/${database}`
    : `postgres://${user}@${host}:${port}/${database}`;
}

/**
 * Format bytes to human-readable string (KB, MB, GB, etc.)
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

export const databaseTools: MiniTool[] = [
  {
    name: "sqlite_query",
    description:
      "Execute SQL queries on SQLite database files. Run SELECT, INSERT, UPDATE, DELETE operations on local .db files. Output as JSON, CSV, or table format. Use for local data storage, testing, embedded databases, or data analysis. Keywords: sqlite query, SQL database, local db, select insert update, sqlite3 command, database query.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        database: { type: "string", description: "Database file path" },
        query: { type: "string", description: "SQL query" },
        mode: {
          type: "string",
          enum: ["json", "csv", "table", "line"],
          description: "Output mode",
        },
      },
      required: ["database", "query"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/table-viewer",
        emits: ["filter", "sort", "select", "paginate"],
        accepts: ["setData", "highlight", "scrollTo"],
      },
    },
    handler: async ({ database, query, mode = "json" }) => {
      const args = [database as string, "-cmd", `.mode ${mode}`, query as string];

      const result = await runCommand("sqlite3", args);
      if (result.code !== 0) {
        throw new Error(`sqlite3 failed: ${result.stderr}`);
      }

      if (mode === "json") {
        try {
          return { results: JSON.parse(result.stdout || "[]") };
        } catch {
          return { output: result.stdout };
        }
      }
      return { output: result.stdout };
    },
  },
  {
    name: "psql_query",
    description:
      "Execute SQL queries on PostgreSQL databases. Connect via DATABASE_URL env var, explicit url parameter, or individual connection params. Use for production database operations, data analysis, schema management, or database administration. Keywords: postgresql query, psql, postgres SQL, database query, pg connection, SQL execute, DATABASE_URL.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Connection URL (postgres://user:pass@host:port/db). Overrides other params.",
        },
        host: { type: "string", description: "Database host" },
        port: { type: "number", description: "Port (default: 5432)" },
        database: { type: "string", description: "Database name" },
        user: { type: "string", description: "Username" },
        password: { type: "string", description: "Password" },
        query: { type: "string", description: "SQL query" },
      },
      required: ["query"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/table-viewer",
        emits: ["filter", "sort", "select", "paginate"],
        accepts: ["setData", "highlight", "scrollTo"],
      },
    },
    handler: async (
      { url, host, port, database, user, password, query },
    ) => {
      const postgres = (await import("postgres")).default;
      const connectionString = buildPsqlConnectionString({
        url: url as string | undefined,
        host: host as string | undefined,
        port: port as number | undefined,
        database: database as string | undefined,
        user: user as string | undefined,
        password: password as string | undefined,
      });

      const sql = postgres(connectionString);
      try {
        const result = await sql.unsafe(query as string);
        // Convert postgres result to plain array (it's a special object)
        const rows = [...result].map((row) => ({ ...row }));
        return { rows, rowCount: rows.length };
      } finally {
        await sql.end();
      }
    },
  },
  {
    name: "redis_cli",
    description:
      "Execute Redis commands for key-value operations, caching, and pub/sub. Run GET, SET, HGET, LPUSH, and other Redis operations. Use for cache management, session storage, message queues, or real-time data. Keywords: redis cli, redis command, key value store, cache operations, redis get set, NoSQL database.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "Redis host (default: localhost)" },
        port: { type: "number", description: "Redis port (default: 6379)" },
        command: { type: "string", description: "Redis command" },
        database: { type: "number", description: "Database number" },
      },
      required: ["command"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/json-viewer",
        emits: ["copy"],
        accepts: [],
      },
    },
    handler: async ({ host = "localhost", port = 6379, command, database }) => {
      const args = ["-h", host as string, "-p", String(port)];
      if (database !== undefined) args.push("-n", String(database));
      args.push(...(command as string).split(" "));

      const result = await runCommand("redis-cli", args);
      if (result.code !== 0) {
        throw new Error(`redis-cli failed: ${result.stderr}`);
      }
      return { result: result.stdout.trim() };
    },
  },
  {
    name: "mysql_query",
    description:
      "Execute SQL queries on MySQL/MariaDB databases. Connect to local or remote MySQL servers, run queries, and manage data. Use for production databases, data analysis, or administration. Keywords: mysql query, mariadb, SQL execute, mysql database, mysql connect.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "Database host (default: localhost)" },
        port: { type: "number", description: "Port (default: 3306)" },
        database: { type: "string", description: "Database name" },
        user: { type: "string", description: "Username" },
        password: { type: "string", description: "Password" },
        query: { type: "string", description: "SQL query" },
      },
      required: ["database", "user", "query"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/table-viewer",
        emits: ["filter", "sort", "select", "paginate"],
        accepts: ["setData", "highlight", "scrollTo"],
      },
    },
    handler: async ({ host = "localhost", port = 3306, database, user, password, query }) => {
      const args = ["-h", host as string, "-P", String(port), "-u", user as string];
      if (password) args.push(`-p${password}`);
      args.push("-N", "-B", "-e", query as string, database as string);

      const result = await runCommand("mysql", args);
      if (result.code !== 0) {
        throw new Error(`mysql failed: ${result.stderr}`);
      }
      return { output: result.stdout.trim() };
    },
  },
  {
    name: "sqlite_tables",
    description:
      "List all tables in a SQLite database. Get table names for schema exploration. Use for database discovery, documentation, or migration planning. Keywords: sqlite tables, list tables, database schema, table names, sqlite structure.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        database: { type: "string", description: "Database file path" },
      },
      required: ["database"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/table-viewer",
        emits: ["select"],
        accepts: ["filter"],
      },
    },
    handler: async ({ database }) => {
      const result = await runCommand("sqlite3", [
        database as string,
        "-cmd",
        ".mode json",
        "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name",
      ]);
      if (result.code !== 0) {
        throw new Error(`sqlite3 failed: ${result.stderr}`);
      }
      try {
        return { tables: JSON.parse(result.stdout || "[]") };
      } catch {
        return { output: result.stdout };
      }
    },
  },
  {
    name: "sqlite_schema",
    description:
      "Get the schema (CREATE statement) for a SQLite table. View column definitions, types, constraints, and indexes. Use for documentation, migration, or understanding table structure. Keywords: sqlite schema, table schema, column types, create statement, table structure.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        database: { type: "string", description: "Database file path" },
        table: { type: "string", description: "Table name" },
      },
      required: ["database", "table"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/schema-viewer",
        emits: ["selectColumn", "copyDDL"],
        accepts: ["highlight"],
      },
    },
    handler: async ({ database, table }) => {
      const result = await runCommand("sqlite3", [
        database as string,
        `.schema ${table}`,
      ]);
      if (result.code !== 0) {
        throw new Error(`sqlite3 failed: ${result.stderr}`);
      }
      return { schema: result.stdout.trim(), table };
    },
  },
  {
    name: "sqlite_info",
    description:
      "Get detailed column information for a SQLite table using PRAGMA. Shows column names, types, nullability, defaults, and primary keys. Use for data validation or ORM mapping. Keywords: sqlite pragma, table info, column info, column types, table columns.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        database: { type: "string", description: "Database file path" },
        table: { type: "string", description: "Table name" },
      },
      required: ["database", "table"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/schema-viewer",
        emits: ["selectColumn"],
        accepts: ["highlight"],
      },
    },
    handler: async ({ database, table }) => {
      const result = await runCommand("sqlite3", [
        database as string,
        "-cmd",
        ".mode json",
        `PRAGMA table_info(${table})`,
      ]);
      if (result.code !== 0) {
        throw new Error(`sqlite3 failed: ${result.stderr}`);
      }
      try {
        return { columns: JSON.parse(result.stdout || "[]"), table };
      } catch {
        return { output: result.stdout };
      }
    },
  },
  {
    name: "psql_tables",
    description:
      "List all tables in a PostgreSQL database. Connect via DATABASE_URL env var, explicit url parameter, or individual connection params. Use for database exploration, documentation, or migration planning. Keywords: postgres tables, list tables, pg_tables, postgresql schema, table list, DATABASE_URL.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Connection URL (postgres://user:pass@host:port/db). Overrides other params.",
        },
        host: { type: "string", description: "Database host" },
        port: { type: "number", description: "Port (default: 5432)" },
        database: { type: "string", description: "Database name" },
        user: { type: "string", description: "Username" },
        password: { type: "string", description: "Password" },
        schema: { type: "string", description: "Schema filter (default: public)" },
      },
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/table-viewer",
        emits: ["select", "filter"],
        accepts: ["highlight"],
      },
    },
    handler: async (
      { url, host, port, database, user, password, schema = "public" },
    ) => {
      const postgres = (await import("postgres")).default;
      const connectionString = buildPsqlConnectionString({
        url: url as string | undefined,
        host: host as string | undefined,
        port: port as number | undefined,
        database: database as string | undefined,
        user: user as string | undefined,
        password: password as string | undefined,
      });

      const sql = postgres(connectionString);
      try {
        const result = await sql`
          SELECT table_name, table_type
          FROM information_schema.tables
          WHERE table_schema = ${schema as string}
          ORDER BY table_name
        `;
        const tables = result.map((row) => ({
          name: (row as Record<string, unknown>).table_name as string,
          type: (row as Record<string, unknown>).table_type as string,
        }));
        return { tables, schema };
      } finally {
        await sql.end();
      }
    },
  },
  {
    name: "psql_schema",
    description:
      "Get detailed schema information for a PostgreSQL table. Connect via DATABASE_URL env var, explicit url parameter, or individual connection params. View columns, types, constraints, and defaults. Use for documentation, migration, or data modeling. Keywords: postgres schema, table columns, pg describe, column types, table definition, DATABASE_URL.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Connection URL (postgres://user:pass@host:port/db). Overrides other params.",
        },
        host: { type: "string", description: "Database host" },
        port: { type: "number", description: "Port (default: 5432)" },
        database: { type: "string", description: "Database name" },
        user: { type: "string", description: "Username" },
        password: { type: "string", description: "Password" },
        table: { type: "string", description: "Table name" },
      },
      required: ["table"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/schema-viewer",
        emits: ["selectColumn", "copyDDL"],
        accepts: ["highlight", "filter"],
      },
    },
    handler: async (
      { url, host, port, database, user, password, table },
    ) => {
      const postgres = (await import("postgres")).default;
      const connectionString = buildPsqlConnectionString({
        url: url as string | undefined,
        host: host as string | undefined,
        port: port as number | undefined,
        database: database as string | undefined,
        user: user as string | undefined,
        password: password as string | undefined,
      });

      const sql = postgres(connectionString);
      try {
        const result = await sql`
          SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_name = ${table as string}
          ORDER BY ordinal_position
        `;
        const columns = result.map((row) => {
          const r = row as Record<string, unknown>;
          return {
            name: r.column_name as string,
            type: r.data_type as string,
            maxLength: r.character_maximum_length as number | null,
            nullable: r.is_nullable === "YES",
            default: r.column_default as string | null,
          };
        });
        return { columns, table };
      } finally {
        await sql.end();
      }
    },
  },
  {
    name: "psql_erd",
    description:
      "Get entity-relationship diagram data for PostgreSQL tables. Returns foreign key relationships, primary keys, and table connections. Connect via DATABASE_URL env var or connection params. Use for visualizing database structure, documentation, or understanding data models. Keywords: postgres ERD, foreign keys, table relationships, database diagram, pg_constraint, entity relationship.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Connection URL (postgres://user:pass@host:port/db). Overrides other params.",
        },
        host: { type: "string", description: "Database host" },
        port: { type: "number", description: "Port (default: 5432)" },
        database: { type: "string", description: "Database name" },
        user: { type: "string", description: "Username" },
        password: { type: "string", description: "Password" },
        schema: { type: "string", description: "Schema to analyze (default: public)" },
        tables: {
          type: "array",
          items: { type: "string" },
          description: "Specific tables to include (default: all tables in schema)",
        },
      },
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/erd-viewer",
        emits: ["selectTable", "selectRelation", "zoom", "pan"],
        accepts: ["highlight", "filter", "layout"],
      },
    },
    handler: async (
      { url, host, port, database, user, password, schema = "public", tables },
    ) => {
      const postgres = (await import("postgres")).default;
      const connectionString = buildPsqlConnectionString({
        url: url as string | undefined,
        host: host as string | undefined,
        port: port as number | undefined,
        database: database as string | undefined,
        user: user as string | undefined,
        password: password as string | undefined,
      });

      const sql = postgres(connectionString);
      try {
        // Get all tables with their columns
        const tablesQuery = tables && (tables as string[]).length > 0
          ? sql`
              SELECT
                t.table_name,
                c.column_name,
                c.data_type,
                c.is_nullable,
                c.column_default,
                CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key
              FROM information_schema.tables t
              JOIN information_schema.columns c
                ON t.table_name = c.table_name AND t.table_schema = c.table_schema
              LEFT JOIN (
                SELECT kcu.table_name, kcu.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_name = kcu.constraint_name
                WHERE tc.constraint_type = 'PRIMARY KEY'
                  AND tc.table_schema = ${schema as string}
              ) pk ON c.table_name = pk.table_name AND c.column_name = pk.column_name
              WHERE t.table_schema = ${schema as string}
                AND t.table_type = 'BASE TABLE'
                AND t.table_name = ANY(${tables as string[]})
              ORDER BY t.table_name, c.ordinal_position
            `
          : sql`
              SELECT
                t.table_name,
                c.column_name,
                c.data_type,
                c.is_nullable,
                c.column_default,
                CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key
              FROM information_schema.tables t
              JOIN information_schema.columns c
                ON t.table_name = c.table_name AND t.table_schema = c.table_schema
              LEFT JOIN (
                SELECT kcu.table_name, kcu.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_name = kcu.constraint_name
                WHERE tc.constraint_type = 'PRIMARY KEY'
                  AND tc.table_schema = ${schema as string}
              ) pk ON c.table_name = pk.table_name AND c.column_name = pk.column_name
              WHERE t.table_schema = ${schema as string}
                AND t.table_type = 'BASE TABLE'
              ORDER BY t.table_name, c.ordinal_position
            `;

        const columnsResult = await tablesQuery;

        // Get foreign key relationships
        const fkResult = await sql`
          SELECT
            tc.table_name as from_table,
            kcu.column_name as from_column,
            ccu.table_name as to_table,
            ccu.column_name as to_column,
            tc.constraint_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_schema = ${schema as string}
          ORDER BY tc.table_name, tc.constraint_name
        `;

        // Group columns by table
        const tableMap = new Map<string, {
          name: string;
          columns: Array<{
            name: string;
            type: string;
            nullable: boolean;
            default: string | null;
            isPrimaryKey: boolean;
          }>;
        }>();

        for (const row of columnsResult) {
          const r = row as Record<string, unknown>;
          const tableName = r.table_name as string;

          if (!tableMap.has(tableName)) {
            tableMap.set(tableName, { name: tableName, columns: [] });
          }

          tableMap.get(tableName)!.columns.push({
            name: r.column_name as string,
            type: r.data_type as string,
            nullable: r.is_nullable === "YES",
            default: r.column_default as string | null,
            isPrimaryKey: r.is_primary_key as boolean,
          });
        }

        // Format relationships
        const relationships = fkResult.map((row) => {
          const r = row as Record<string, unknown>;
          return {
            name: r.constraint_name as string,
            fromTable: r.from_table as string,
            fromColumn: r.from_column as string,
            toTable: r.to_table as string,
            toColumn: r.to_column as string,
          };
        });

        // Filter relationships if specific tables requested
        const filteredRelationships = tables && (tables as string[]).length > 0
          ? relationships.filter(
              (r) =>
                (tables as string[]).includes(r.fromTable) ||
                (tables as string[]).includes(r.toTable)
            )
          : relationships;

        return {
          schema,
          tables: Array.from(tableMap.values()),
          relationships: filteredRelationships,
          tableCount: tableMap.size,
          relationshipCount: filteredRelationships.length,
        };
      } finally {
        await sql.end();
      }
    },
  },
  {
    name: "psql_explain",
    description:
      "Analyze PostgreSQL query execution plans using EXPLAIN ANALYZE. Returns detailed execution statistics including actual times, row counts, buffer usage, and operation costs. Connect via DATABASE_URL env var or connection params. Use for query optimization, performance debugging, identifying slow operations, and understanding query plans. Keywords: postgres explain, query plan, analyze query, execution plan, performance tuning, slow query, EXPLAIN ANALYZE, query optimizer.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Connection URL (postgres://user:pass@host:port/db). Overrides other params.",
        },
        host: { type: "string", description: "Database host" },
        port: { type: "number", description: "Port (default: 5432)" },
        database: { type: "string", description: "Database name" },
        user: { type: "string", description: "Username" },
        password: { type: "string", description: "Password" },
        query: { type: "string", description: "SQL query to analyze" },
        analyze: {
          type: "boolean",
          description: "Run ANALYZE to get actual execution stats (default: true). Set to false for plan-only without executing.",
        },
        format: {
          type: "string",
          enum: ["json", "text"],
          description: "Output format (default: json)",
        },
      },
      required: ["query"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/plan-viewer",
        emits: ["selectNode", "expandNode", "collapseNode"],
        accepts: ["highlight", "scrollTo", "expandAll", "collapseAll"],
      },
    },
    handler: async (
      { url, host, port, database, user, password, query, analyze = true, format = "json" },
    ) => {
      const postgres = (await import("postgres")).default;
      const connectionString = buildPsqlConnectionString({
        url: url as string | undefined,
        host: host as string | undefined,
        port: port as number | undefined,
        database: database as string | undefined,
        user: user as string | undefined,
        password: password as string | undefined,
      });

      const sql = postgres(connectionString);
      try {
        // Build EXPLAIN options
        const options = ["COSTS", "BUFFERS", `FORMAT ${(format as string).toUpperCase()}`];
        if (analyze) {
          options.unshift("ANALYZE");
        }

        const explainQuery = `EXPLAIN (${options.join(", ")}) ${query as string}`;
        const result = await sql.unsafe(explainQuery);

        if (format === "json") {
          // PostgreSQL returns JSON plan as a single row with "QUERY PLAN" column
          const planData = result[0]?.["QUERY PLAN"] ?? result[0];
          return {
            plan: planData,
            query: query as string,
            analyzed: analyze as boolean,
          };
        } else {
          // Text format returns multiple rows
          const planText = result.map((row) => (row as Record<string, unknown>)["QUERY PLAN"]).join("\n");
          return {
            plan: planText,
            query: query as string,
            analyzed: analyze as boolean,
          };
        }
      } finally {
        await sql.end();
      }
    },
  },
  {
    name: "psql_connections",
    description:
      "Show active PostgreSQL connections. View running queries, connection states, client addresses, and session info from pg_stat_activity. Connect via DATABASE_URL env var, explicit connection_string parameter, or individual connection params. Use for monitoring database connections, identifying long-running queries, or debugging connection issues. Keywords: postgres connections, pg_stat_activity, active queries, database sessions, connection monitor, DATABASE_URL.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        connection_string: {
          type: "string",
          description: "PostgreSQL connection string (postgres://user:pass@host:port/db). Overrides DATABASE_URL env.",
        },
        state: {
          type: "string",
          enum: ["active", "idle", "idle in transaction"],
          description: "Filter by connection state (active, idle, idle in transaction)",
        },
      },
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/table-viewer",
        emits: ["select", "kill"],
        accepts: ["highlight"],
      },
    },
    handler: async ({ connection_string, state }) => {
      const postgres = (await import("postgres")).default;
      const connectionString = buildPsqlConnectionString({
        url: connection_string as string | undefined,
      });

      const sql = postgres(connectionString);
      try {
        let result;
        if (state) {
          result = await sql`
            SELECT pid, usename, application_name, client_addr, state, query_start, query
            FROM pg_stat_activity
            WHERE state = ${state as string}
            ORDER BY query_start DESC
          `;
        } else {
          result = await sql`
            SELECT pid, usename, application_name, client_addr, state, query_start, query
            FROM pg_stat_activity
            ORDER BY query_start DESC
          `;
        }
        const connections = result.map((row) => {
          const r = row as Record<string, unknown>;
          return {
            pid: r.pid as number,
            usename: r.usename as string,
            application_name: r.application_name as string,
            client_addr: r.client_addr as string | null,
            state: r.state as string,
            query_start: r.query_start as string | null,
            query: r.query as string,
          };
        });
        return { connections, count: connections.length, stateFilter: state || null };
      } finally {
        await sql.end();
      }
    },
  },
  {
    name: "psql_stats",
    description:
      "Get PostgreSQL table statistics including size, row count, dead tuples, and vacuum/analyze timestamps. Connect via DATABASE_URL env var, explicit connection_string parameter, or individual connection params. Use for database health monitoring, identifying bloated tables, or planning maintenance. Keywords: postgres stats, table statistics, pg_stat_user_tables, dead tuples, vacuum, analyze, table size, row count, database health, DATABASE_URL.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        connection_string: {
          type: "string",
          description: "Connection URL (postgres://user:pass@host:port/db). Overrides other params.",
        },
        host: { type: "string", description: "Database host" },
        port: { type: "number", description: "Port (default: 5432)" },
        database: { type: "string", description: "Database name" },
        user: { type: "string", description: "Username" },
        password: { type: "string", description: "Password" },
        schema: { type: "string", description: "Schema to query (default: public)" },
      },
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/metrics-panel",
        emits: ["select"],
        accepts: [],
      },
    },
    handler: async (
      { connection_string, host, port, database, user, password, schema = "public" },
    ) => {
      const postgres = (await import("postgres")).default;
      const connectionString = buildPsqlConnectionString({
        url: connection_string as string | undefined,
        host: host as string | undefined,
        port: port as number | undefined,
        database: database as string | undefined,
        user: user as string | undefined,
        password: password as string | undefined,
      });

      const sql = postgres(connectionString);
      try {
        // Get table statistics from pg_stat_user_tables
        const statsResult = await sql`
          SELECT
            schemaname,
            relname,
            n_live_tup,
            n_dead_tup,
            last_vacuum,
            last_autovacuum,
            last_analyze,
            last_autoanalyze
          FROM pg_stat_user_tables
          WHERE schemaname = ${schema as string}
          ORDER BY relname
        `;

        // Get table sizes using pg_total_relation_size
        const sizesResult = await sql`
          SELECT
            c.relname as table_name,
            pg_total_relation_size(c.oid) as total_size,
            pg_table_size(c.oid) as table_size,
            pg_indexes_size(c.oid) as indexes_size
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = ${schema as string}
            AND c.relkind = 'r'
          ORDER BY c.relname
        `;

        // Create a map of table sizes
        const sizeMap = new Map<string, { totalSize: number; tableSize: number; indexesSize: number }>();
        for (const row of sizesResult) {
          const r = row as Record<string, unknown>;
          sizeMap.set(r.table_name as string, {
            totalSize: Number(r.total_size),
            tableSize: Number(r.table_size),
            indexesSize: Number(r.indexes_size),
          });
        }

        // Combine stats with sizes
        const tables = statsResult.map((row) => {
          const r = row as Record<string, unknown>;
          const tableName = r.relname as string;
          const sizes = sizeMap.get(tableName) || { totalSize: 0, tableSize: 0, indexesSize: 0 };

          return {
            schema: r.schemaname as string,
            table: tableName,
            liveTuples: Number(r.n_live_tup),
            deadTuples: Number(r.n_dead_tup),
            totalSize: sizes.totalSize,
            totalSizeHuman: formatBytes(sizes.totalSize),
            tableSize: sizes.tableSize,
            tableSizeHuman: formatBytes(sizes.tableSize),
            indexesSize: sizes.indexesSize,
            indexesSizeHuman: formatBytes(sizes.indexesSize),
            lastVacuum: r.last_vacuum as string | null,
            lastAutovacuum: r.last_autovacuum as string | null,
            lastAnalyze: r.last_analyze as string | null,
            lastAutoanalyze: r.last_autoanalyze as string | null,
          };
        });

        // Calculate totals
        const totals = tables.reduce(
          (acc, t) => ({
            liveTuples: acc.liveTuples + t.liveTuples,
            deadTuples: acc.deadTuples + t.deadTuples,
            totalSize: acc.totalSize + t.totalSize,
          }),
          { liveTuples: 0, deadTuples: 0, totalSize: 0 }
        );

        return {
          schema,
          tables,
          tableCount: tables.length,
          totals: {
            liveTuples: totals.liveTuples,
            deadTuples: totals.deadTuples,
            totalSize: totals.totalSize,
            totalSizeHuman: formatBytes(totals.totalSize),
          },
        };
      } finally {
        await sql.end();
      }
    },
  },
  {
    name: "psql_indexes",
    description:
      "List PostgreSQL indexes with usage statistics. Shows index names, tables, columns, types (btree, hash, gin, gist, etc.), sizes, and scan counts. Connect via DATABASE_URL env var or connection_string parameter. Use for index analysis, performance tuning, identifying unused indexes, or database optimization. Keywords: postgres indexes, index usage, pg_indexes, scan count, index size, btree gin hash, unused indexes, index statistics.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        connection_string: {
          type: "string",
          description: "PostgreSQL connection string (postgres://user:pass@host:port/db). Falls back to DATABASE_URL env.",
        },
        table: {
          type: "string",
          description: "Filter by table name",
        },
        schema: {
          type: "string",
          description: "Schema to query (default: public)",
        },
      },
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/table-viewer",
        emits: ["select", "sort"],
        accepts: [],
      },
    },
    handler: async (
      { connection_string, table, schema = "public" },
    ) => {
      const postgres = (await import("postgres")).default;
      const connectionString = buildPsqlConnectionString({
        url: connection_string as string | undefined,
      });

      const sql = postgres(connectionString);
      try {
        // Build query with optional table filter
        const baseQuery = `
          SELECT
            i.indexname AS index_name,
            i.tablename AS table_name,
            i.indexdef AS index_definition,
            am.amname AS index_type,
            pg_size_pretty(pg_relation_size(quote_ident(i.schemaname) || '.' || quote_ident(i.indexname))) AS index_size,
            pg_relation_size(quote_ident(i.schemaname) || '.' || quote_ident(i.indexname)) AS index_size_bytes,
            COALESCE(s.idx_scan, 0) AS scan_count,
            COALESCE(s.idx_tup_read, 0) AS tuples_read,
            COALESCE(s.idx_tup_fetch, 0) AS tuples_fetched
          FROM pg_indexes i
          JOIN pg_class c ON c.relname = i.indexname
          JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = i.schemaname
          JOIN pg_am am ON am.oid = c.relam
          LEFT JOIN pg_stat_user_indexes s ON s.indexrelname = i.indexname AND s.schemaname = i.schemaname
          WHERE i.schemaname = $1
          ${table ? "AND i.tablename = $2" : ""}
          ORDER BY i.tablename, i.indexname
        `;

        const result = table
          ? await sql.unsafe(baseQuery, [schema as string, table as string])
          : await sql.unsafe(baseQuery, [schema as string]);

        const indexes = [...result].map((row) => {
          const r = row as Record<string, unknown>;
          // Extract column names from index definition
          const defMatch = (r.index_definition as string).match(/\(([^)]+)\)/);
          const columns = defMatch ? defMatch[1] : "";

          return {
            indexName: r.index_name as string,
            tableName: r.table_name as string,
            columns: columns,
            indexType: r.index_type as string,
            indexSize: r.index_size as string,
            indexSizeBytes: Number(r.index_size_bytes),
            scanCount: Number(r.scan_count),
            tuplesRead: Number(r.tuples_read),
            tuplesFetched: Number(r.tuples_fetched),
          };
        });

        return {
          indexes,
          schema: schema as string,
          table: table as string | undefined,
          indexCount: indexes.length,
        };
      } finally {
        await sql.end();
      }
    },
  },
  {
    name: "psql_locks",
    description:
      "Show active PostgreSQL locks. View blocking and blocked queries, lock types, and wait events. Connect via DATABASE_URL env var or connection params. Use for debugging deadlocks, identifying blocking queries, or monitoring lock contention. Keywords: postgres locks, pg_locks, blocking queries, deadlock, lock wait, pg_stat_activity, blocked queries.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        connection_string: {
          type: "string",
          description: "PostgreSQL connection string (postgres://user:pass@host:port/db). Falls back to DATABASE_URL env.",
        },
        blocked_only: {
          type: "boolean",
          description: "Show only blocked queries (default: false)",
        },
      },
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/table-viewer",
        emits: ["select"],
        accepts: ["highlight"],
      },
    },
    handler: async (
      { connection_string, blocked_only = false },
    ) => {
      const postgres = (await import("postgres")).default;
      const connectionString = buildPsqlConnectionString({
        url: connection_string as string | undefined,
      });

      const sql = postgres(connectionString);
      try {
        // Build query with optional filter for blocked only
        const baseQuery = `
          SELECT
            l.pid,
            l.locktype AS lock_type,
            COALESCE(c.relname, l.relation::text) AS relation,
            l.mode,
            l.granted,
            a.query,
            a.wait_event_type,
            a.wait_event,
            a.state,
            a.query_start,
            NOW() - a.query_start AS query_duration
          FROM pg_locks l
          JOIN pg_stat_activity a ON l.pid = a.pid
          LEFT JOIN pg_class c ON l.relation = c.oid
          ${blocked_only ? "WHERE NOT l.granted" : ""}
          ORDER BY l.granted, a.query_start
        `;

        const result = await sql.unsafe(baseQuery);
        const locks = [...result].map((row) => {
          const r = row as Record<string, unknown>;
          return {
            pid: r.pid as number,
            lockType: r.lock_type as string,
            relation: r.relation as string | null,
            mode: r.mode as string,
            granted: r.granted as boolean,
            query: r.query as string,
            waitEventType: r.wait_event_type as string | null,
            waitEvent: r.wait_event as string | null,
            state: r.state as string,
            queryStart: r.query_start as Date | null,
            queryDuration: r.query_duration as string | null,
          };
        });
        return { locks, count: locks.length, blockedOnly: blocked_only };
      } finally {
        await sql.end();
      }
    },
  },
  {
    name: "redis_keys",
    description:
      "List Redis keys matching a pattern. Search for keys using glob patterns (* ? []). Use for cache inspection, debugging, or key discovery. Keywords: redis keys, key pattern, list keys, redis scan, key search.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "Redis host (default: localhost)" },
        port: { type: "number", description: "Redis port (default: 6379)" },
        pattern: { type: "string", description: "Key pattern (default: *)" },
        database: { type: "number", description: "Database number" },
        count: { type: "number", description: "Max keys to return (default: 100)" },
      },
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/table-viewer",
        emits: ["select", "filter"],
        accepts: ["highlight"],
      },
    },
    handler: async ({ host = "localhost", port = 6379, pattern = "*", database, count = 100 }) => {
      const args = ["-h", host as string, "-p", String(port)];
      if (database !== undefined) args.push("-n", String(database));
      args.push("--scan", "--pattern", pattern as string, "--count", String(count));

      const result = await runCommand("redis-cli", args);
      if (result.code !== 0) {
        throw new Error(`redis-cli failed: ${result.stderr}`);
      }
      const keys = result.stdout.trim().split("\n").filter(Boolean);
      return { keys, count: keys.length, pattern };
    },
  },
  {
    name: "redis_info",
    description:
      "Get Redis server information and statistics. View memory usage, connected clients, persistence status, replication info, and more. Use for monitoring, debugging, or capacity planning. Keywords: redis info, server stats, redis memory, redis status, server info.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "Redis host (default: localhost)" },
        port: { type: "number", description: "Redis port (default: 6379)" },
        section: {
          type: "string",
          description:
            "Info section (server, clients, memory, stats, replication, cpu, keyspace, all)",
        },
      },
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/metrics-panel",
        emits: ["selectMetric"],
        accepts: ["highlight"],
      },
    },
    handler: async ({ host = "localhost", port = 6379, section }) => {
      const args = ["-h", host as string, "-p", String(port), "INFO"];
      if (section) args.push(section as string);

      const result = await runCommand("redis-cli", args);
      if (result.code !== 0) {
        throw new Error(`redis-cli failed: ${result.stderr}`);
      }

      // Parse INFO output into object
      const info: Record<string, string | Record<string, string>> = {};
      let currentSection = "default";

      for (const line of result.stdout.split("\n")) {
        if (line.startsWith("#")) {
          currentSection = line.slice(2).trim().toLowerCase();
          info[currentSection] = {};
        } else if (line.includes(":")) {
          const [key, value] = line.split(":");
          if (typeof info[currentSection] === "object") {
            (info[currentSection] as Record<string, string>)[key.trim()] = value.trim();
          }
        }
      }

      return { info };
    },
  },
  {
    name: "redis_get",
    description:
      "Get the value of a Redis key with type detection. Automatically handles strings, hashes, lists, sets, and sorted sets. Use for inspecting cached data, debugging, or data retrieval. Keywords: redis get, key value, redis hgetall, redis lrange, fetch key.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "Redis host (default: localhost)" },
        port: { type: "number", description: "Redis port (default: 6379)" },
        key: { type: "string", description: "Key to retrieve" },
        database: { type: "number", description: "Database number" },
      },
      required: ["key"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/json-viewer",
        emits: ["copy", "expand"],
        accepts: ["expandPath"],
      },
    },
    handler: async ({ host = "localhost", port = 6379, key, database }) => {
      const baseArgs = ["-h", host as string, "-p", String(port)];
      if (database !== undefined) baseArgs.push("-n", String(database));

      // First get the type
      const typeResult = await runCommand("redis-cli", [...baseArgs, "TYPE", key as string]);
      if (typeResult.code !== 0) {
        throw new Error(`redis-cli failed: ${typeResult.stderr}`);
      }
      const keyType = typeResult.stdout.trim();

      if (keyType === "none") {
        return { key, exists: false };
      }

      let value: unknown;
      let cmd: string[];

      switch (keyType) {
        case "string":
          cmd = [...baseArgs, "GET", key as string];
          break;
        case "hash":
          cmd = [...baseArgs, "HGETALL", key as string];
          break;
        case "list":
          cmd = [...baseArgs, "LRANGE", key as string, "0", "-1"];
          break;
        case "set":
          cmd = [...baseArgs, "SMEMBERS", key as string];
          break;
        case "zset":
          cmd = [...baseArgs, "ZRANGE", key as string, "0", "-1", "WITHSCORES"];
          break;
        default:
          cmd = [...baseArgs, "GET", key as string];
      }

      const result = await runCommand("redis-cli", cmd);
      if (result.code !== 0) {
        throw new Error(`redis-cli failed: ${result.stderr}`);
      }

      value = result.stdout.trim();

      // Parse hash results into object
      if (keyType === "hash") {
        const lines = (value as string).split("\n");
        const hash: Record<string, string> = {};
        for (let i = 0; i < lines.length; i += 2) {
          if (lines[i] && lines[i + 1]) {
            hash[lines[i]] = lines[i + 1];
          }
        }
        value = hash;
      }

      // Parse list/set into array
      if (keyType === "list" || keyType === "set") {
        value = (value as string).split("\n").filter(Boolean);
      }

      return { key, type: keyType, value, exists: true };
    },
  },
  {
    name: "redis_set",
    description:
      "Set a Redis key with optional expiration. Store string values with TTL for caching. Use for caching data, session storage, or temporary data. Keywords: redis set, store key, redis setex, cache value, key expiry.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "Redis host (default: localhost)" },
        port: { type: "number", description: "Redis port (default: 6379)" },
        key: { type: "string", description: "Key name" },
        value: { type: "string", description: "Value to store" },
        ttl: { type: "number", description: "Time to live in seconds" },
        database: { type: "number", description: "Database number" },
        nx: { type: "boolean", description: "Only set if key doesn't exist" },
        xx: { type: "boolean", description: "Only set if key exists" },
      },
      required: ["key", "value"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/status-badge",
        emits: ["click"],
        accepts: [],
      },
    },
    handler: async ({ host = "localhost", port = 6379, key, value, ttl, database, nx, xx }) => {
      const args = ["-h", host as string, "-p", String(port)];
      if (database !== undefined) args.push("-n", String(database));
      args.push("SET", key as string, value as string);
      if (ttl) args.push("EX", String(ttl));
      if (nx) args.push("NX");
      if (xx) args.push("XX");

      const result = await runCommand("redis-cli", args);
      if (result.code !== 0) {
        throw new Error(`redis-cli failed: ${result.stderr}`);
      }
      return { key, success: result.stdout.trim() === "OK", ttl: ttl || null };
    },
  },
  {
    name: "redis_del",
    description:
      "Delete one or more Redis keys. Remove keys from the database. Use for cache invalidation, cleanup, or data removal. Keywords: redis del, delete key, remove key, cache invalidate, key delete.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "Redis host (default: localhost)" },
        port: { type: "number", description: "Redis port (default: 6379)" },
        keys: { type: "array", items: { type: "string" }, description: "Keys to delete" },
        database: { type: "number", description: "Database number" },
      },
      required: ["keys"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/status-badge",
        emits: ["click"],
        accepts: [],
      },
    },
    handler: async ({ host = "localhost", port = 6379, keys, database }) => {
      const args = ["-h", host as string, "-p", String(port)];
      if (database !== undefined) args.push("-n", String(database));
      args.push("DEL", ...(keys as string[]));

      const result = await runCommand("redis-cli", args);
      if (result.code !== 0) {
        throw new Error(`redis-cli failed: ${result.stderr}`);
      }
      return { deleted: parseInt(result.stdout.trim(), 10), keys };
    },
  },
  {
    name: "mongo_query",
    description:
      "Execute MongoDB queries using mongosh. Run find, aggregate, insert, update, or delete operations. Use for document database operations, data analysis, or administration. Keywords: mongodb query, mongosh, mongo find, document query, nosql query.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "MongoDB host (default: localhost)" },
        port: { type: "number", description: "Port (default: 27017)" },
        database: { type: "string", description: "Database name" },
        collection: { type: "string", description: "Collection name" },
        operation: {
          type: "string",
          enum: ["find", "findOne", "count", "aggregate", "insertOne", "updateOne", "deleteOne"],
          description: "Operation type",
        },
        query: { description: "Query document or pipeline" },
        options: { description: "Operation options (projection, sort, limit, etc.)" },
      },
      required: ["database", "collection", "operation"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/json-viewer",
        emits: ["select", "expand", "copy"],
        accepts: ["expandPath", "highlight"],
      },
    },
    handler: async (
      {
        host = "localhost",
        port = 27017,
        database,
        collection,
        operation,
        query = {},
        options = {},
      },
    ) => {
      const uri = `mongodb://${host}:${port}/${database}`;

      let jsCode: string;
      const q = JSON.stringify(query);
      const opts = JSON.stringify(options);

      switch (operation) {
        case "find":
          jsCode = `db.${collection}.find(${q}, ${opts}).toArray()`;
          break;
        case "findOne":
          jsCode = `db.${collection}.findOne(${q}, ${opts})`;
          break;
        case "count":
          jsCode = `db.${collection}.countDocuments(${q})`;
          break;
        case "aggregate":
          jsCode = `db.${collection}.aggregate(${q}).toArray()`;
          break;
        case "insertOne":
          jsCode = `db.${collection}.insertOne(${q})`;
          break;
        case "updateOne":
          jsCode = `db.${collection}.updateOne(${q}, ${opts})`;
          break;
        case "deleteOne":
          jsCode = `db.${collection}.deleteOne(${q})`;
          break;
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }

      const result = await runCommand("mongosh", [
        uri,
        "--quiet",
        "--json=relaxed",
        "--eval",
        `JSON.stringify(${jsCode})`,
      ]);

      if (result.code !== 0) {
        throw new Error(`mongosh failed: ${result.stderr}`);
      }

      try {
        return { result: JSON.parse(result.stdout), operation };
      } catch {
        return { output: result.stdout, operation };
      }
    },
  },
  {
    name: "sql_format",
    description:
      "Format SQL queries for better readability. Indents clauses, uppercases keywords, handles subqueries. Use for code review, documentation, or debugging SQL. Keywords: sql format, pretty print sql, sql beautify, format query, sql indentation.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "SQL query to format" },
        dialect: {
          type: "string",
          enum: ["standard", "postgres", "mysql"],
          description: "SQL dialect (default: standard)",
        },
        uppercase: {
          type: "boolean",
          description: "Uppercase keywords (default: true)",
        },
      },
      required: ["sql"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/json-viewer",
        emits: ["copy"],
        accepts: [],
      },
    },
    handler: ({ sql, dialect = "standard", uppercase = true }) => {
      const input = sql as string;
      const useUppercase = uppercase as boolean;
      const sqlDialect = dialect as string;

      // SQL keywords for formatting
      const majorKeywords = [
        "SELECT", "FROM", "WHERE", "JOIN", "LEFT JOIN", "RIGHT JOIN",
        "INNER JOIN", "OUTER JOIN", "FULL JOIN", "CROSS JOIN",
        "GROUP BY", "ORDER BY", "HAVING", "LIMIT", "OFFSET",
        "UNION", "UNION ALL", "INTERSECT", "EXCEPT",
        "INSERT INTO", "VALUES", "UPDATE", "SET", "DELETE FROM",
        "CREATE TABLE", "ALTER TABLE", "DROP TABLE",
        "CREATE INDEX", "DROP INDEX", "ON",
      ];

      const allKeywords = [
        ...majorKeywords,
        "AND", "OR", "NOT", "IN", "EXISTS", "BETWEEN", "LIKE", "ILIKE",
        "IS", "NULL", "TRUE", "FALSE", "AS", "DISTINCT", "ALL", "ANY",
        "CASE", "WHEN", "THEN", "ELSE", "END", "CAST", "COALESCE",
        "COUNT", "SUM", "AVG", "MIN", "MAX", "ASC", "DESC", "NULLS",
        "FIRST", "LAST", "WITH", "RECURSIVE", "RETURNING",
      ];

      // Dialect-specific keywords
      if (sqlDialect === "postgres") {
        allKeywords.push("ILIKE", "SIMILAR TO", "JSONB", "ARRAY", "LATERAL", "TABLESAMPLE");
      } else if (sqlDialect === "mysql") {
        allKeywords.push("AUTO_INCREMENT", "ENGINE", "CHARSET", "COLLATE", "IF EXISTS", "IF NOT EXISTS");
      }

      // Preserve string literals by replacing them temporarily
      const stringLiterals: string[] = [];
      let processed = input.replace(/'([^']*(?:''[^']*)*)'/g, (match) => {
        stringLiterals.push(match);
        return `__STRING_${stringLiterals.length - 1}__`;
      });

      // Preserve double-quoted identifiers
      const quotedIdentifiers: string[] = [];
      processed = processed.replace(/"([^"]*(?:""[^"]*)*)"/g, (match) => {
        quotedIdentifiers.push(match);
        return `__QUOTED_${quotedIdentifiers.length - 1}__`;
      });

      // Normalize whitespace
      processed = processed.replace(/\s+/g, " ").trim();

      // Helper to transform keyword case
      const transformKeyword = (kw: string): string => useUppercase ? kw.toUpperCase() : kw.toLowerCase();

      // Create regex for keywords (case insensitive)
      const keywordSet = new Set(allKeywords.map((k) => k.toUpperCase()));
      const majorKeywordSet = new Set(majorKeywords.map((k) => k.toUpperCase()));

      // Tokenize while preserving keywords
      const tokens: string[] = [];
      const tokenRegex = /(\w+|[(),;*=<>!+\-\/]|__STRING_\d+__|__QUOTED_\d+__|\.)/g;
      let match: RegExpExecArray | null;
      let lastIndex = 0;

      while ((match = tokenRegex.exec(processed)) !== null) {
        // Add any whitespace before this token
        if (match.index > lastIndex) {
          const space = processed.slice(lastIndex, match.index).trim();
          if (space) tokens.push(space);
        }
        tokens.push(match[0]);
        lastIndex = tokenRegex.lastIndex;
      }

      // Format with indentation
      const lines: string[] = [];
      let currentLine: string[] = [];
      let indentLevel = 0;
      const indent = "  ";
      let i = 0;

      const flushLine = () => {
        if (currentLine.length > 0) {
          lines.push(indent.repeat(indentLevel) + currentLine.join(" "));
          currentLine = [];
        }
      };

      const extractedKeywords: string[] = [];
      const extractedTables: string[] = [];
      let lastKeyword = "";
      let expectingTable = false;

      while (i < tokens.length) {
        const token = tokens[i];
        const upperToken = token.toUpperCase();

        // Check for multi-word keywords
        let fullKeyword = upperToken;
        let keywordLength = 1;
        if (i + 1 < tokens.length) {
          const twoWord = `${upperToken} ${tokens[i + 1].toUpperCase()}`;
          if (majorKeywordSet.has(twoWord)) {
            fullKeyword = twoWord;
            keywordLength = 2;
          }
        }

        // Handle parentheses for subqueries
        if (token === "(") {
          currentLine.push(token);
          // Check if this is a subquery
          if (i + 1 < tokens.length && tokens[i + 1].toUpperCase() === "SELECT") {
            flushLine();
            indentLevel++;
          }
          i++;
          continue;
        }

        if (token === ")") {
          // Check if we need to decrease indent (closing subquery)
          if (indentLevel > 0 && lines.length > 0 && lines[lines.length - 1].includes("SELECT")) {
            flushLine();
            indentLevel--;
          }
          currentLine.push(token);
          i++;
          continue;
        }

        // Handle major keywords - new line
        if (majorKeywordSet.has(fullKeyword)) {
          flushLine();
          const formattedKeyword = transformKeyword(fullKeyword);
          currentLine.push(formattedKeyword);
          extractedKeywords.push(formattedKeyword);
          lastKeyword = fullKeyword;
          expectingTable = ["FROM", "JOIN", "LEFT JOIN", "RIGHT JOIN", "INNER JOIN",
                           "OUTER JOIN", "FULL JOIN", "CROSS JOIN", "UPDATE",
                           "INSERT INTO", "DELETE FROM", "INTO"].includes(fullKeyword);
          i += keywordLength;
          continue;
        }

        // Handle other keywords
        if (keywordSet.has(upperToken)) {
          const formattedKeyword = transformKeyword(upperToken);
          extractedKeywords.push(formattedKeyword);

          // AND/OR on new line in WHERE clause
          if ((upperToken === "AND" || upperToken === "OR") && lastKeyword === "WHERE") {
            flushLine();
          }
          currentLine.push(formattedKeyword);
          i++;
          continue;
        }

        // Track table names (after FROM, JOIN, etc.)
        if (expectingTable && !token.startsWith("__") && token !== "(" && /^[a-zA-Z_]\w*$/.test(token)) {
          extractedTables.push(token);
          expectingTable = false;
        }

        currentLine.push(token);
        i++;
      }

      flushLine();

      // Restore string literals and quoted identifiers
      let formatted = lines.join("\n");
      stringLiterals.forEach((lit, idx) => {
        formatted = formatted.replace(`__STRING_${idx}__`, lit);
      });
      quotedIdentifiers.forEach((id, idx) => {
        formatted = formatted.replace(`__QUOTED_${idx}__`, id);
      });

      // Clean up extra spaces
      formatted = formatted.replace(/ +/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")");
      formatted = formatted.replace(/ ,/g, ",").replace(/\n +\n/g, "\n");
      formatted = formatted.replace(/ \. /g, ".").replace(/\. /g, ".").replace(/ \./g, ".");

      // Unique keywords and tables
      const uniqueKeywords = [...new Set(extractedKeywords)];
      const uniqueTables = [...new Set(extractedTables)];

      return {
        formatted,
        keywords: uniqueKeywords,
        tables: uniqueTables,
      };
    },
  },
  {
    name: "sql_minify",
    description:
      "Minify SQL by removing extra whitespace and formatting. Produces a single-line compact SQL query. Use for reducing payload size, logging, or embedding SQL in code. Keywords: sql minify, compress sql, single line sql, sql compact, minimize query.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "SQL query to minify" },
      },
      required: ["sql"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/diff-viewer",
        emits: ["copy"],
        accepts: [],
      },
    },
    handler: ({ sql }) => {
      const input = sql as string;
      const originalLength = input.length;

      // Preserve string literals
      const stringLiterals: string[] = [];
      let processed = input.replace(/'([^']*(?:''[^']*)*)'/g, (match) => {
        stringLiterals.push(match);
        return `__STRING_${stringLiterals.length - 1}__`;
      });

      // Preserve double-quoted identifiers
      const quotedIdentifiers: string[] = [];
      processed = processed.replace(/"([^"]*(?:""[^']*)*)"/g, (match) => {
        quotedIdentifiers.push(match);
        return `__QUOTED_${quotedIdentifiers.length - 1}__`;
      });

      // Remove comments
      // Single-line comments
      processed = processed.replace(/--.*$/gm, "");
      // Multi-line comments
      processed = processed.replace(/\/\*[\s\S]*?\*\//g, "");

      // Collapse all whitespace to single space
      processed = processed.replace(/\s+/g, " ").trim();

      // Remove spaces around operators and punctuation where safe
      processed = processed.replace(/ ?, ?/g, ",");
      processed = processed.replace(/ ?\( ?/g, "(");
      processed = processed.replace(/ ?\) ?/g, ")");
      processed = processed.replace(/ ?= ?/g, "=");
      processed = processed.replace(/ ?<> ?/g, "<>");
      processed = processed.replace(/ ?!= ?/g, "!=");
      processed = processed.replace(/ ?>= ?/g, ">=");
      processed = processed.replace(/ ?<= ?/g, "<=");
      processed = processed.replace(/ ?> ?/g, ">");
      processed = processed.replace(/ ?< ?/g, "<");
      processed = processed.replace(/ ?\+ ?/g, "+");
      processed = processed.replace(/ ?- ?/g, "-");
      processed = processed.replace(/ ?\* ?/g, "*");
      processed = processed.replace(/ ?\/ ?/g, "/");
      processed = processed.replace(/ ?; ?/g, ";");

      // Restore string literals and quoted identifiers
      stringLiterals.forEach((lit, idx) => {
        processed = processed.replace(`__STRING_${idx}__`, lit);
      });
      quotedIdentifiers.forEach((id, idx) => {
        processed = processed.replace(`__QUOTED_${idx}__`, id);
      });

      const minifiedLength = processed.length;
      const reduction = originalLength > 0
        ? `${((1 - minifiedLength / originalLength) * 100).toFixed(1)}%`
        : "0%";

      return {
        minified: processed,
        originalLength,
        minifiedLength,
        reduction,
      };
    },
  },
  {
    name: "mongo_collections",
    description:
      "List collections in a MongoDB database. Get collection names and types. Use for database exploration or schema discovery. Keywords: mongo collections, list collections, mongodb schema, collection names.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "MongoDB host (default: localhost)" },
        port: { type: "number", description: "Port (default: 27017)" },
        database: { type: "string", description: "Database name" },
      },
      required: ["database"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/table-viewer",
        emits: ["select"],
        accepts: ["filter"],
      },
    },
    handler: async ({ host = "localhost", port = 27017, database }) => {
      const uri = `mongodb://${host}:${port}/${database}`;

      const result = await runCommand("mongosh", [
        uri,
        "--quiet",
        "--json=relaxed",
        "--eval",
        "JSON.stringify(db.getCollectionNames())",
      ]);

      if (result.code !== 0) {
        throw new Error(`mongosh failed: ${result.stderr}`);
      }

      try {
        return { collections: JSON.parse(result.stdout), database };
      } catch {
        return { output: result.stdout };
      }
    },
  },
];
