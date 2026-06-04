---
title: MCP Server Tools
id: mcp
order: 8
description: "Connect TanStack AI to any Model Context Protocol server with createMCPClient to discover and execute its tools."
keywords:
  - tanstack ai
  - mcp
  - model context protocol
  - mcp tools
  - mcp client
  - server tools
  - createMCPClient
  - createMCPClients
  - type safety
---

`@tanstack/ai-mcp` is a host-side [Model Context Protocol](https://modelcontextprotocol.io) client for TanStack AI. It connects your server route to any MCP-compliant server and makes that server's tools, resources, and prompts available inside `chat()`.

> MCP tool execution is **server-side only**. The `createMCPClient` call lives in a server route (or serverless function) — never in browser code.

## Installation

```bash
pnpm add @tanstack/ai-mcp @modelcontextprotocol/sdk
```

## Quick Start

```ts
// app/api/chat/route.ts  (Next.js App Router example)
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai/adapters'
import { createMCPClient } from '@tanstack/ai-mcp'

export async function POST(request: Request) {
  const { messages } = await request.json()

  const mcp = await createMCPClient({
    transport: { type: 'http', url: 'https://my-mcp-server.example.com/mcp' },
  })

  try {
    const stream = chat({
      adapter: openaiText(),
      model: 'gpt-4o',
      messages,
      tools: await mcp.tools(),
    })

    return toServerSentEventsResponse(stream)
  } finally {
    await mcp.close()
  }
}
```

On the client side, consume the stream with `useChat` exactly as you would any other TanStack AI endpoint:

```tsx
// components/Chat.tsx
import { useChat } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'

export function Chat() {
  const { messages, sendMessage, status } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}>
          <strong>{m.role}:</strong> {m.content}
        </div>
      ))}
      <button
        onClick={() => sendMessage({ content: 'Hello' })}
        disabled={status === 'streaming'}
      >
        Send
      </button>
    </div>
  )
}
```

## Transports

### HTTP (Streamable HTTP)

The preferred transport for remote servers. Uses the MCP Streamable HTTP protocol.

```ts
const mcp = await createMCPClient({
  transport: {
    type: 'http',
    url: 'https://my-mcp-server.example.com/mcp',
    headers: { Authorization: `Bearer ${process.env.MCP_TOKEN}` },
  },
})
```

### SSE (Server-Sent Events)

For servers that implement the legacy SSE transport.

```ts
const mcp = await createMCPClient({
  transport: {
    type: 'sse',
    url: 'https://my-mcp-server.example.com/sse',
    headers: { Authorization: `Bearer ${process.env.MCP_TOKEN}` },
  },
})
```

### stdio (Node.js only)

For spawning a local MCP process. Because stdio imports Node-native modules, it is isolated behind a subpath import so edge bundles stay clean.

```ts
import { stdioTransport } from '@tanstack/ai-mcp/stdio'
import { createMCPClient } from '@tanstack/ai-mcp'

const mcp = await createMCPClient({
  transport: stdioTransport({
    command: 'node',
    args: ['./my-mcp-server.js'],
    env: { API_KEY: process.env.API_KEY ?? '' },
  }),
})
```

### Custom transport (escape hatch)

Pass any `Transport` instance directly as the `transport` option. For in-process testing, `InMemoryTransport` is re-exported from `@tanstack/ai-mcp`:

```ts
import { createMCPClient, InMemoryTransport } from '@tanstack/ai-mcp'

const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
const mcp = await createMCPClient({ transport: clientTransport })
```

For a custom network transport, pass any SDK `Transport`-compatible instance:

```ts
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const transport = new StreamableHTTPClientTransport(new URL('https://example.com/mcp'))
const mcp = await createMCPClient({ transport })
```

## Three Modes of Type Safety

### Mode 1 — Auto-discovery (`client.tools()`)

Call `tools()` with no arguments to discover every tool the server exposes. This requires no extra setup. Tool argument types are `unknown` at compile time; the MCP JSON Schema is used for runtime validation.

```ts
const tools = await mcp.tools()
// tools: ServerTool[]  — args typed unknown at compile time
```

### Mode 2 — Explicit definitions (`client.tools([...defs])`)

Pass TanStack `toolDefinition()` instances to get full TypeScript types and Zod validation. Only the named tools are returned (allowlist). `MCPToolNotFoundError` is thrown if a name isn't on the server.

```ts
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const searchDef = toolDefinition({
  name: 'search',
  description: 'Search for items',
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.array(z.object({ id: z.string(), title: z.string() })),
})

const tools = await mcp.tools([searchDef])
// tools[0].execute is typed: (args: { query: string }) => ...
```

### Mode 3 — Generated types (`createMCPClient<GeneratedServer>`)

Run the CLI against a live server to generate per-server `interface` types, then pass the generated type as a generic for end-to-end type safety with zero runtime overhead.

> See [MCP Type Generation](./mcp-codegen) for the full `mcp.config.ts` setup, the `generate` CLI, and how to wire the generated types into `createMCPClient` and `createMCPClients`.

## Multi-Server Pool

`createMCPClients` connects to many servers in parallel and merges their tools into one flat array. Each server's tools are automatically prefixed with the config key to prevent name collisions.

```ts
import { createMCPClients } from '@tanstack/ai-mcp'

const pool = await createMCPClients({
  github: { transport: { type: 'http', url: process.env.GITHUB_MCP_URL! } },
  linear: { transport: { type: 'http', url: process.env.LINEAR_MCP_URL! } },
})

// tools: [github_search_repos, github_create_issue, linear_create_issue, ...]
const tools = await pool.tools()
```

`pool.tools()` collects all servers' tools and throws `DuplicateToolNameError` if any two names collide after prefixing.

### Per-server access

```ts
const linearTools = await pool.clients.linear.tools()
const resources = await pool.clients.github.resources()
```

### Disable or override the prefix

```ts
const pool = await createMCPClients({
  github: {
    transport: { type: 'http', url: process.env.GITHUB_MCP_URL! },
    prefix: 'gh',           // override: "gh_search_repos"
  },
  internal: {
    transport: { type: 'http', url: process.env.INTERNAL_MCP_URL! },
    prefix: '',             // disable prefix entirely
  },
})
```

### Closing the pool

```ts
await pool.close()
// or
await using pool = await createMCPClients({ ... })
```

If any server fails to connect, already-connected clients are closed before the error is thrown — no leaks.

## Lifecycle

The MCP client is **caller-owned**. `chat()` never closes it.

> **Prefer to let `chat()` manage lifecycle?** If you'd rather skip the `try/finally` and have `chat()` discover tools and close clients automatically, see [Managing MCP clients with `chat()`](./mcp-chat).

### Manual close

```ts
const mcp = await createMCPClient({ transport: { type: 'http', url } })
try {
  const stream = chat({ ..., tools: await mcp.tools() })
  return toServerSentEventsResponse(stream)
} finally {
  await mcp.close()
}
```

### `await using` (Explicit Resource Management)

If your runtime supports `Symbol.asyncDispose` (Node 18.2+ with TypeScript `target: "es2022"` + `lib: ["esnext"]`):

```ts
await using mcp = await createMCPClient({ transport: { type: 'http', url } })
// mcp.close() is called automatically when the block exits
const stream = chat({ ..., tools: await mcp.tools() })
return toServerSentEventsResponse(stream)
```

## Tool Name Collisions

When mixing tools from multiple sources, duplicate names throw `DuplicateToolNameError`:

```ts
import { DuplicateToolNameError } from '@tanstack/ai-mcp'

try {
  const tools = await pool.tools()
} catch (err) {
  if (err instanceof DuplicateToolNameError) {
    console.error('Conflicting tool name:', err.toolName)
    // Fix: set a unique prefix on one of the clients
  }
}
```

Use a unique `prefix` on each client to avoid collisions — `createMCPClients` does this automatically using the config key.

## Lazy Tool Discovery

Pass `{ lazy: true }` to defer sending tool schemas to the LLM until it explicitly asks for them. This reduces token usage when working with tool-heavy servers.

```ts
const tools = await mcp.tools({ lazy: true })
// All tools are marked lazy: true
```

Works with the pool too:

```ts
const tools = await pool.tools({ lazy: true })
```

See [Lazy Tool Discovery](./lazy-tool-discovery) for how the LLM discovers lazy tools at runtime.

## Using MCP with `chat()`

The Quick Start above hands tools to `chat()` manually via `tools: await mcp.tools()` and closes the client yourself. Two follow-on guides cover richer integrations:

> **Let `chat()` own discovery and lifecycle.** Pass live clients and pools to `chat()` via the `mcp` option and it discovers tools and closes connections for you — no `try/finally` per route. See [Managing MCP clients with `chat()`](./mcp-chat).

> **Resources, prompts, and fully-typed manual tools.** Inject MCP resources and prompts into a `chat()` run, cancel in-flight MCP calls, and spread `toolDefinition`-typed tools. See [Resources, prompts & manual tools with `chat()`](./mcp-with-chat).

## Error Reference

| Error class | When thrown |
|---|---|
| `MCPConnectionError` | `createMCPClient` fails to connect, or a method is called after `close()` |
| `DuplicateToolNameError` | Two tools have the same name within one client or across the pool |
| `MCPToolNotFoundError` | A `toolDefinition` name passed to `tools([...defs])` is not found on the server |

For the `MCPDuplicateToolNameError` thrown when merging tools from multiple sources inside a `chat({ mcp })` run, see [Managing MCP clients with `chat()`](./mcp-chat#tool-name-collisions).
