---
title: MCP Server Tools
id: mcp
order: 8
description: "Connect createMCPClient to any MCP server — transports, type modes, pools, lifecycle."
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

If you need tools/resources/prompts from an MCP server inside `chat()` → install `@tanstack/ai-mcp` and connect from a **server** route only.

## Install

```bash
pnpm add @tanstack/ai-mcp @modelcontextprotocol/sdk
```

## Quick start (managed)

Hand the client to `chat({ mcp })` — discovery + close on run end:

```ts ignore
// src/routes/api.chat.ts
import { createFileRoute } from '@tanstack/react-router'
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClient } from '@tanstack/ai-mcp'

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages } = await request.json()

        const mcp = await createMCPClient({
          transport: {
            type: 'http',
            url: 'https://my-mcp-server.example.com/mcp',
          },
        })

        const stream = chat({
          adapter: openaiText('gpt-5.5'),
          messages,
          mcp: { clients: [mcp] },
        })

        return toServerSentEventsResponse(stream)
      },
    },
  },
})
```

Typed tools / resources / prompts / own lifecycle → [Manual MCP](./mcp-manual). More managed options → [Managed MCP](./mcp-managed).

### Client

```tsx
// src/components/Chat.tsx
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
          <strong>{m.role}:</strong>{' '}
          {m.parts.find((p) => p.type === 'text')?.content}
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

### HTTP (preferred remote)

```ts
import { createMCPClient } from '@tanstack/ai-mcp'

const mcp = await createMCPClient({
  transport: {
    type: 'http',
    url: 'https://my-mcp-server.example.com/mcp',
    headers: { Authorization: `Bearer ${process.env.MCP_TOKEN}` },
  },
})
```

### SSE (legacy)

```ts
import { createMCPClient } from '@tanstack/ai-mcp'

const mcp = await createMCPClient({
  transport: {
    type: 'sse',
    url: 'https://my-mcp-server.example.com/sse',
    headers: { Authorization: `Bearer ${process.env.MCP_TOKEN}` },
  },
})
```

### stdio (Node only)

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

### Custom / in-memory

```ts
import { createMCPClient, InMemoryTransport } from '@tanstack/ai-mcp'

const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
const mcp = await createMCPClient({ transport: clientTransport })
```

```ts ignore
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const transport = new StreamableHTTPClientTransport(new URL('https://example.com/mcp'))
const mcp = await createMCPClient({ transport })
```

## Auth

**Static headers** — `headers` on `http`/`sse` config.

**OAuth** — pass `authProvider` (`OAuthClientProvider` from the MCP SDK). SDK attaches/refreshes tokens.

```ts ignore
import { createMCPClient } from '@tanstack/ai-mcp'
import { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import { myTokenStore } from './token-store'

const myOAuthProvider: OAuthClientProvider = myTokenStore.provider()

const mcp = await createMCPClient({
  transport: {
    type: 'http',
    url: 'https://my-mcp-server.example.com/mcp',
    authProvider: myOAuthProvider,
  },
})
```

Interactive redirect flows need you to build the transport yourself, call `finishAuth(code)` on callback, then `createMCPClient({ transport })`.

## Three type-safety modes

### Mode 1 — Auto-discovery `client.tools()`

Args `unknown` at compile time; JSON Schema at runtime:

```ts
import { createMCPClient } from '@tanstack/ai-mcp'

const mcp = await createMCPClient({
  transport: { type: 'http', url: 'https://my-mcp-server.example.com/mcp' },
})
const tools = await mcp.tools()
```

> Tools with `execution.taskSupport: 'required'` are skipped — plain `callTool` cannot run them.

### Mode 2 — Explicit defs `client.tools([...defs])`

Zod-typed allowlist. Missing name → `MCPToolNotFoundError`; task-required → `MCPTaskRequiredToolError`:

```ts
import { toolDefinition } from '@tanstack/ai'
import { createMCPClient } from '@tanstack/ai-mcp'
import { z } from 'zod'

const searchDef = toolDefinition({
  name: 'search',
  description: 'Search for items',
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.array(z.object({ id: z.string(), title: z.string() })),
})

const mcp = await createMCPClient({
  transport: { type: 'http', url: 'https://my-mcp-server.example.com/mcp' },
})
const tools = await mcp.tools([searchDef])
```

### Mode 3 — Generated types

CLI → per-server interfaces → generic on `createMCPClient`. Tool **names** narrow; args stay untyped on discovery path. See [MCP Type Generation](./mcp-codegen).

## Multi-server pool

```ts group=mcp-1
import { createMCPClients } from '@tanstack/ai-mcp'

const pool = await createMCPClients({
  github: { transport: { type: 'http', url: process.env.GITHUB_MCP_URL! } },
  linear: { transport: { type: 'http', url: process.env.LINEAR_MCP_URL! } },
})

// tools: github_*, linear_*
const tools = await pool.tools()
```

`pool.tools()` throws `DuplicateToolNameError` on post-prefix collisions.

**Per-server:**

```ts group=mcp-1
const linearTools = await pool.clients.linear!.tools()
const resources = await pool.clients.github!.resources()
```

**Prefix override:**

```ts group=mcp-2
import { createMCPClients } from '@tanstack/ai-mcp'

const pool = await createMCPClients({
  github: {
    transport: { type: 'http', url: process.env.GITHUB_MCP_URL! },
    prefix: 'gh',
  },
  internal: {
    transport: { type: 'http', url: process.env.INTERNAL_MCP_URL! },
    prefix: '',
  },
})
```

**Close:** `await pool.close()` or `await using pool = await createMCPClients({...})`. Connect failure closes already-connected clients.

## Lifecycle (manual ownership)

Skip this if you use `mcp: { clients }` — [Managed MCP](./mcp-managed).

Manual clients are **caller-owned**. Tools run while the stream is consumed — do **not** `close()` in a `finally` around a streaming `return`. Close in a middleware terminal hook:

```ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClient } from '@tanstack/ai-mcp'

export async function POST(request: Request) {
  const { messages } = await request.json()
  const url = 'https://my-mcp-server.example.com/mcp'
  const mcp = await createMCPClient({ transport: { type: 'http', url } })
  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages,
    tools: await mcp.tools(),
    middleware: [
      {
        name: 'mcp-close',
        onFinish: () => mcp.close(),
        onAbort: () => mcp.close(),
        onError: () => mcp.close(),
      },
    ],
  })
  return toServerSentEventsResponse(stream)
}
```

In-scope consumption (`for await` then exit) → `try/finally` or `await using` is fine.

## Tool name collisions

```ts group=mcp-2
import { DuplicateToolNameError } from '@tanstack/ai-mcp'

try {
  const tools = await pool.tools()
} catch (err) {
  if (err instanceof DuplicateToolNameError) {
    console.error('Conflicting tool name:', err.toolName)
  }
}
```

Fix: unique `prefix` (default on `createMCPClients` config keys).

## Lazy discovery

```ts
import { createMCPClient, createMCPClients } from '@tanstack/ai-mcp'

const mcp = await createMCPClient({
  transport: { type: 'http', url: 'https://my-mcp-server.example.com/mcp' },
})
const tools = await mcp.tools({ lazy: true })

const pool = await createMCPClients({
  github: { transport: { type: 'http', url: process.env.GITHUB_MCP_URL! } },
})
// also: await pool.tools({ lazy: true })
```

Runtime behavior: [Lazy Tool Discovery](./lazy-tool-discovery).

## Using with `chat()`

| Need | Guide |
| --- | --- |
| Discovery + lifecycle managed | [Managed MCP](./mcp-managed) |
| Typed tools, resources, prompts | [Manual MCP](./mcp-manual) |

## Errors

| Error | When |
|---|---|
| `MCPConnectionError` | Connect fail or method after `close()` |
| `DuplicateToolNameError` | Same tool name in client/pool |
| `MCPToolNotFoundError` | Def name not on server |
| `MCPTaskRequiredToolError` | Named tool requires task-based execution |

`MCPDuplicateToolNameError` inside `chat({ mcp })` merges: [Managed MCP](./mcp-managed#tool-name-collisions).
