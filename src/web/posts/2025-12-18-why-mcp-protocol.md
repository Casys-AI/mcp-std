---
title: "Why MCP Protocol: The Universal Language for AI Tools"
slug: why-mcp-protocol
date: 2025-12-18
category: architecture
tags:
  - mcp
  - protocol
  - interoperability
  - tools
snippet: "Function calling is proprietary. MCP is universal. Here's why we chose an open standard for tool integration—and why it matters for the AI ecosystem."
format: article
language: en
author: Erwan Lee Pesle
---

# Why MCP Protocol: The Universal Language for AI Tools

> From vendor lock-in to universal interoperability

## The Problem With Function Calling

Every LLM provider invented their own tool interface:

| Provider | Format | Schema |
|----------|--------|--------|
| OpenAI | `functions` / `tools` | JSON Schema |
| Anthropic | `tool_use` | JSON Schema (different structure) |
| Google | `function_declarations` | Protocol Buffers |
| Mistral | `tool_calls` | OpenAI-compatible-ish |

Same concept, different implementations. Want to support multiple models? Write adapters for each.

```mermaid
graph TD
    subgraph "Without MCP: N adapters"
        T1[Your Tool] --> A1[OpenAI Adapter]
        T1 --> A2[Anthropic Adapter]
        T1 --> A3[Google Adapter]
        A1 --> M1[OpenAI]
        A2 --> M2[Claude]
        A3 --> M3[Gemini]
    end
```

**The maintenance burden grows with each new model.**

## What Is MCP?

**Model Context Protocol** is an open standard for tool integration. Think USB for AI tools—one interface, universal compatibility.

| Aspect | Details |
|--------|---------|
| Created by | Anthropic (open-sourced Nov 2024) |
| Transport | JSON-RPC 2.0 |
| Primitives | Tools, Resources, Prompts |
| License | MIT |

```mermaid
graph TD
    subgraph "With MCP: 1 interface"
        T1[Your Tool] --> MCP[MCP Protocol]
        MCP --> M1[Any LLM]
        MCP --> M2[Any Agent]
        MCP --> M3[Any Client]
    end
```

Write once, run everywhere. No more N×M adapter matrix.

## Why We Chose MCP

Our reasoning came down to four factors:

### 1. Vendor Independence

Today we use Claude. Tomorrow? Who knows. MCP means our tools work with any model that supports the protocol—and that list is growing.

### 2. Ecosystem Growth

MCP has momentum:
- Claude Desktop, Cursor, VS Code extensions support it
- 100+ open source servers available
- Major IDE integrations coming

### 3. Clean Separation

MCP enforces good architecture:
- **Server**: Exposes capabilities (tools, resources)
- **Client**: Discovers and invokes
- **Transport**: Pluggable (stdio, HTTP, WebSocket)

Your tool logic stays clean. Protocol handling is separate.

### 4. Simplicity

Stdio transport means any language works. No HTTP server needed. Just read stdin, write stdout.

| Approach | Pros | Cons |
|----------|------|------|
| Native function calling | Tight integration | Vendor lock-in |
| Custom adapters | Full control | Maintenance burden |
| **MCP** | Universal, growing ecosystem | Newer, evolving |

## The MCP Architecture

Three layers, cleanly separated:

```mermaid
graph TD
    subgraph "Client (Agent)"
        C1[Discovery]
        C2[Invocation]
    end

    subgraph "Protocol"
        P[JSON-RPC 2.0]
    end

    subgraph "Server (Tool)"
        S1[Tool Handlers]
        S2[Resource Handlers]
    end

    C1 --> P --> S1
    C2 --> P --> S2
```

### The Handshake

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server

    C->>S: initialize (protocol version, capabilities)
    S-->>C: capabilities (tools, resources, prompts)
    C->>S: tools/list
    S-->>C: [{name, description, inputSchema}...]
    C->>S: tools/call (name, arguments)
    S-->>C: {content: result}
```

### Primitives

| Primitive | Purpose | Example |
|-----------|---------|---------|
| **Tools** | Actions the model can take | `file_read`, `git_commit` |
| **Resources** | Data the model can access | File contents, DB rows |
| **Prompts** | Reusable prompt templates | Coding assistant setup |

## Practical Benefits

What MCP gives us in practice:

### Swap Models Freely

Our tools work unchanged whether we use Claude, GPT, or local models. The abstraction holds.

### Share Across Projects

One MCP server can be used by:
- CLI agents
- Web applications
- IDE extensions
- Other teams' projects

### Tap Into the Ecosystem

Existing MCP servers we can use immediately:
- **Filesystem**: Read/write files
- **GitHub**: PRs, issues, repos
- **Postgres/SQLite**: Database access
- **Brave Search**: Web search
- **Puppeteer**: Browser automation

No integration work. Just configure and use.

### Future-Proof

As the AI landscape evolves, MCP-compatible tools remain relevant. New models adopt MCP → our tools work with them automatically.

---

## References

- [Model Context Protocol Specification](https://modelcontextprotocol.io)

#MCP #Protocol #Interoperability #AITools
