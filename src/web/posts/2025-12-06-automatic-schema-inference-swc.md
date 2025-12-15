---
title: "When Your Code Writes Its Own API Contract"
slug: automatic-schema-inference-swc
date: 2025-12-06
category: engineering
tags:
  - typescript
  - swc
  - schema-inference
  - ast
  - mcp
snippet: "We built automatic schema inference for TypeScript capabilities using SWC's AST parser. By analyzing args usage patterns and MCP tool schemas, our code now writes its own API contracts."
format: article
language: en
author: Erwan Lee Pesle
---

# When Your Code Writes Its Own API Contract

> How we built automatic schema inference for TypeScript capabilities using SWC, and why it matters
> for making code self-describing

## Introduction

Here's a problem I didn't expect to run into: we had a system that could learn and reuse code
patterns (we call them "capabilities"), but there was no way to know what arguments those
capabilities expected. Imagine finding a useful function in your codebase but having zero idea what
parameters to pass it. Frustrating, right?

The capabilities were stored with their code, their semantic intent, even which tools they
called—but the parameter schema column? Always NULL. We needed a way to automatically infer "this
code expects `args.filePath` as a string and `args.debug` as an optional boolean" just by analyzing
the code itself.

Turns out, this is the same challenge the
[Model Context Protocol (MCP)](https://modelcontextprotocol.io/specification/2025-06-18/basic)
solves for AI tools: every tool needs a schema that describes its interface. We just needed to
generate ours automatically.

## The Challenge

When you execute TypeScript code in a sandbox, you can capture what it does—which MCP tools it
calls, what it returns. But figuring out what it _expects_ as input? That requires understanding the
code's structure.

We needed to detect patterns like:

- Direct access: `args.filePath`
- Destructuring: `const { debug, count } = args`
- Nested access: `args.config.timeout`
- Optional chaining: `args?.metadata`

And we needed to infer types. Not just "this code uses `args.count`" but "this code uses
`args.count` as a number because it compares it with `> 0`."

The tricky part: doing this reliably and fast, without pulling in a massive dependency.

## The Discovery / Solution

The key insight was realizing we didn't need a full type checker—we needed an AST (Abstract Syntax
Tree) parser. Enter [SWC](https://swc.rs/), a Rust-based TypeScript parser that's 20x faster than
alternatives and has native Deno support.

SWC lets you parse TypeScript code into a structured tree that you can traverse to find patterns. We
built a `SchemaInferrer` class that:

1. **Parses the code** using SWC (takes ~10ms for typical capability code)
2. **Finds all args accesses** by walking the AST for `MemberExpression` and `ObjectPattern` nodes
3. **Infers types** from multiple sources:
   - **MCP tool schemas**: If `args.filePath` is passed to `mcp.filesystem.read()`, we query the
     database for that tool's input schema and extract the type
   - **Operations**: `args.count > 0` → number, `args.enabled === true` → boolean
   - **Property access**: `args.items.length` → array, `args.name.toLowerCase()` → string
4. **Generates JSON Schema** directly, with `$schema`, `type`, `properties`, and `required` fields

### Implementation Details

The core of the inference happens in the AST traversal. Here's what detecting `args.xxx` looks like:

```typescript
if (n.type === "MemberExpression") {
  const obj = n.object as Record<string, unknown> | undefined;
  const prop = n.property as Record<string, unknown> | undefined;

  if (
    obj?.type === "Identifier" && obj?.value === "args" &&
    prop?.type === "Identifier" && typeof prop?.value === "string"
  ) {
    // Found args.propertyName!
    props.set(prop.value, {
      name: prop.value,
      inferredType: "unknown",
      source: "unknown",
      isOptional: false,
    });
  }
}
```

For type inference from MCP tools, we extract the tool name from the call site (e.g.,
`mcp.filesystem.read` → `filesystem_read`), query the database for its input schema, and match the
parameter:

```typescript
const result = await this.db.query(
  `SELECT input_schema FROM tool_schema WHERE tool_id = $1`,
  [toolName],
);
const inputSchema = result[0].input_schema;
const paramSchema = inputSchema.properties[paramName];
// paramSchema.type gives us "string", "number", etc.
```

This multi-source approach means we get accurate types even when the code doesn't have TypeScript
annotations.

### Key Points

- **692 lines of inference logic + 395 lines of tests** (19 test cases, all passing)
- **SWC over ts-morph**: Native Deno support, 20x faster, ~2MB vs 15MB+
- **Non-critical by design**: If schema inference fails, we log a warning and continue—it never
  blocks capability storage
- **Multi-source type inference**: Combines MCP schemas, runtime operations, and property access
  patterns for accurate results
- **JSON Schema as the contract**: Just like MCP tools expose their interface, our capabilities now
  self-document

## Lessons Learned

**1. You don't always need full type checking**

I initially thought we'd need the full TypeScript compiler to understand types. But for our use
case—detecting argument usage and inferring basic types—an AST parser was enough and way faster.

**2. MCP tool schemas are a goldmine**

Because we already store MCP tool schemas in the database (for other features), we could leverage
them for type inference. When you see `mcp.filesystem.read({ path: args.filePath })`, the
`filesystem_read` tool schema tells you that `path` is a string. Free type information!

**3. Fallbacks matter**

Not every type can be inferred from MCP calls. But you can get surprisingly far with simple
heuristics:

- Comparison with a number → number type
- Comparison with true/false → boolean type
- Calling `.length` → array type
- Calling string methods → string type

**4. Empty schema ≠ failure**

In JSON Schema, an empty schema `{}` means "accepts anything." If we can't infer types for a
property, we leave it unconstrained. Better than blocking or guessing wrong.

## Conclusion

We went from "stored code with no clue what arguments it needs" to "automatically generated JSON
Schemas that document the interface" by combining SWC's fast AST parsing with multi-source type
inference.

This bridges "code as capability" with "schema as contract"—the same paradigm MCP uses to make AI
tools discoverable and composable. Our capabilities are now self-describing, which means they can be
reused intelligently by the system (or by future developers reading the database).

The [MCP June 2025 spec update](https://auth0.com/blog/mcp-specs-update-all-about-auth/) introduced
structured tool outputs and schema-driven interactions, reinforcing that schemas aren't just
documentation—they're the foundation for composable, type-safe integrations.

Next step: use these inferred schemas for runtime validation and better capability search. If we
know a capability expects `{ filePath: string, debug?: boolean }`, we can match it to user requests
more accurately.

---

**Sources:**

- [Model Context Protocol - Basic Specification](https://modelcontextprotocol.io/specification/2025-06-18/basic)
- [MCP 2025-06-18 Spec Updates](https://auth0.com/blog/mcp-specs-update-all-about-auth/)
- [SWC - Rust-based platform for the Web](https://swc.rs/)
- [GitHub - swc-project/swc](https://github.com/swc-project/swc)
