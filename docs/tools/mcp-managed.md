---
title: Managed MCP with chat()
id: mcp-managed
order: 9
description: "Hand live MCP clients and pools to chat() via the mcp option and let it own tool discovery and connection lifecycle for you."
keywords:
  - tanstack ai
  - mcp
  - model context protocol
  - chat mcp
  - mcp clients
  - keep-alive
  - lazyTools
  - onDiscoveryError
---

You have one or more live [MCP clients](./mcp) (or pools) and you want the model to use their tools — without writing boilerplate `await client.tools()` calls and `try/finally close()` blocks for every route. By the end of this guide you'll hand those clients to `chat()` via the `mcp` option and let it handle both discovery and lifecycle for you.

> **Managed (`mcp` prop) vs manual (`tools` spread)**
>
> - Use `mcp: { clients: [...] }` when you want **discovery + lifecycle** managed for you and you are happy with runtime-typed (`unknown`-argument) tools.
> - Use `tools: [...await client.tools([toolDefinition(...)])]` when you need **fully-typed MCP tools** — the defs overload gives you Zod-validated, TypeScript-typed arguments. See [Manual MCP: typed tools, resources & prompts](./mcp-manual) and [Three Modes of Type Safety](./mcp#three-modes-of-type-safety).
>
> Both coexist in the same `chat()` call. Tools from `mcp.clients` are merged with any tools you pass explicitly via `tools`.

## Hand a client to `chat()`

The simplest path: create a client, hand it to `chat()`, and let the run clean it up. `connection` defaults to `'close'`, so the client is closed automatically once the run ends — on success, error, or abort.

```ts
// src/routes/api.chat.ts
import { createFileRoute } from '@tanstack/react-router'
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai/adapters'
import { createMCPClient } from '@tanstack/ai-mcp'

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages } = await request.json()

        const mcpClient = await createMCPClient({
          transport: {
            type: 'http',
            url: process.env.MCP_URL!,
            headers: { Authorization: `Bearer ${process.env.MCP_TOKEN}` },
          },
        })

        // chat() discovers mcpClient's tools and closes the connection when done.
        // No try/finally needed.
        const stream = chat({
          adapter: openaiText('gpt-5.5'),
          messages,
          mcp: {
            clients: [mcpClient],
            // connection: 'close' is the default — shown here for clarity
            connection: 'close',
          },
        })

        return toServerSentEventsResponse(stream)
      },
    },
  },
})
```

The examples below show only the part that changes — the client setup and the `chat()` call. They all drop into the same route handler shape as above.

## Multiple servers and pools

Pass any mix of `MCPClient` instances and `MCPClients` pools. Their tools are discovered in parallel and merged into one flat tool set. Pools auto-prefix each server's tools with the config key to prevent name collisions.

```ts
import { createMCPClient, createMCPClients } from '@tanstack/ai-mcp'

// A pool of two servers — their tools are prefixed "github_" and "linear_"
const githubLinearPool = await createMCPClients({
  github: {
    transport: {
      type: 'http',
      url: process.env.GITHUB_MCP_URL!,
      headers: { Authorization: `Bearer ${process.env.GITHUB_MCP_TOKEN}` },
    },
  },
  linear: {
    transport: {
      type: 'http',
      url: process.env.LINEAR_MCP_URL!,
      headers: { Authorization: `Bearer ${process.env.LINEAR_MCP_TOKEN}` },
    },
  },
})

// A standalone client for an internal server
const internalClient = await createMCPClient({
  transport: { type: 'http', url: process.env.INTERNAL_MCP_URL! },
})

// All three servers' tools are merged: github_*, linear_*, plus internal tools
const stream = chat({
  adapter: openaiText('gpt-5.5'),
  messages,
  mcp: {
    clients: [githubLinearPool, internalClient],
    connection: 'close',
  },
})
```

## Keep connections warm

Creating a new MCP connection on every request adds latency. For production routes with high request rates, create your pool once at module level and pass `connection: 'keep-alive'` so `chat()` never closes it. The pool stays ready for the next request. (Shown as a full route because the placement — module scope vs. handler scope — is the point.)

**Server route (`src/routes/api.chat.ts`):**

```ts
import { createFileRoute } from '@tanstack/react-router'
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai/adapters'
import { createMCPClients } from '@tanstack/ai-mcp'

// Created once when the module loads. Shared across all requests.
const sharedPool = await createMCPClients({
  github: {
    transport: {
      type: 'http',
      url: process.env.GITHUB_MCP_URL!,
      headers: { Authorization: `Bearer ${process.env.GITHUB_MCP_TOKEN}` },
    },
  },
  linear: {
    transport: {
      type: 'http',
      url: process.env.LINEAR_MCP_URL!,
      headers: { Authorization: `Bearer ${process.env.LINEAR_MCP_TOKEN}` },
    },
  },
})

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages } = await request.json()

        // keep-alive: sharedPool is never closed by chat(); stays warm for next call
        const stream = chat({
          adapter: openaiText('gpt-5.5'),
          messages,
          mcp: {
            clients: [sharedPool],
            connection: 'keep-alive',
          },
        })

        return toServerSentEventsResponse(stream)
      },
    },
  },
})
```

**Client component (`src/components/Chat.tsx`):**

```tsx
import { useChat } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
}

export function Chat() {
  const { messages, sendMessage, status } = useChat(chatOptions)

  return (
    <div>
      <ul>
        {messages.map((m) => (
          <li key={m.id}>
            <strong>{m.role}:</strong> {m.content}
          </li>
        ))}
      </ul>
      <button
        onClick={() => sendMessage({ content: 'List my open GitHub issues' })}
        disabled={status === 'streaming'}
      >
        Ask
      </button>
    </div>
  )
}
```

## Lazy tool discovery

When your MCP server exposes dozens of tools, sending every schema to the model inflates prompt size and cost. Set `lazyTools: true` to defer sending tool schemas until the model explicitly requests them.

```ts
const mcpClient = await createMCPClient({
  transport: { type: 'http', url: process.env.LARGE_MCP_URL! },
})

const stream = chat({
  adapter: openaiText('gpt-5.5'),
  messages,
  mcp: {
    clients: [mcpClient],
    connection: 'close',
    // Tools are registered but schemas are withheld until the model asks
    lazyTools: true,
  },
})
```

`lazyTools: true` is forwarded to each source's `tools({ lazy: true })` call. See [Lazy Tool Discovery](./lazy-tool-discovery) for how the model discovers and loads lazy tools at runtime, and [the standalone lazy discovery section](./mcp#lazy-tool-discovery) for using `{ lazy: true }` directly with `client.tools()`.

## Handling discovery failures

By default, if any source fails during discovery, `chat()` throws immediately (fail-fast). When `connection: 'close'`, any sources that did connect are cleaned up before the error propagates — no leaked connections.

**Fail-fast (default):**

```ts
const mcpClient = await createMCPClient({
  transport: { type: 'http', url: process.env.MCP_URL! },
})

// If discovery fails, chat() throws before the first model call.
// mcpClient is closed automatically (connection: 'close' default).
const stream = chat({
  adapter: openaiText('gpt-5.5'),
  messages,
  mcp: {
    clients: [mcpClient],
  },
})
```

**Skip a flaky server and proceed:**

Use `onDiscoveryError` to log the problem and return normally — the failing source is skipped and the run continues with the remaining clients' tools.

```ts
const primaryClient = await createMCPClient({
  transport: { type: 'http', url: process.env.PRIMARY_MCP_URL! },
})

const optionalClient = await createMCPClient({
  transport: { type: 'http', url: process.env.OPTIONAL_MCP_URL! },
})

const stream = chat({
  adapter: openaiText('gpt-5.5'),
  messages,
  mcp: {
    clients: [primaryClient, optionalClient],
    connection: 'close',
    onDiscoveryError(error, source) {
      // Log the failure but let the run proceed without this source's tools.
      // Throw here (or re-throw `error`) to fail the whole run instead.
      console.warn('MCP discovery failed for a source, skipping.', error)
    },
  },
})
```

> Sources passed to `onDiscoveryError` may have already connected before discovery failed. When `connection: 'close'`, they are still closed at the end of the run — even if their tools were skipped.

## Tool name collisions

If two sources in `mcp.clients` expose a tool with the same name, the run fails with an `MCPDuplicateToolNameError` (exported from `@tanstack/ai`) after merging the discovered tools. Note that `chat()` runs lazily — discovery happens when the stream is first consumed, so the error surfaces **through the stream** (the SSE response errors), not as a synchronous throw you can `try/catch` at the `chat()` call site. The fix is to prevent the collision up front: assign a `prefix` to one of the clients, or use `createMCPClients` (which auto-prefixes using the config key).

```ts
// Both servers expose a tool called "search". Without prefixes the run
// would fail with MCPDuplicateToolNameError. The prefix option resolves
// the clash.
const serverA = await createMCPClient({
  transport: { type: 'http', url: process.env.SERVER_A_URL! },
  prefix: 'alpha', // tools become "alpha_search", etc.
})

const serverB = await createMCPClient({
  transport: { type: 'http', url: process.env.SERVER_B_URL! },
  prefix: 'beta', // tools become "beta_search", etc.
})

const stream = chat({
  adapter: openaiText('gpt-5.5'),
  messages,
  mcp: {
    clients: [serverA, serverB],
    connection: 'close',
  },
})
```

For the standalone `pool.tools()` collision behavior and the general `prefix` strategy, see [Tool Name Collisions](./mcp#tool-name-collisions) and [Disable or override the prefix](./mcp#disable-or-override-the-prefix).

## Going further

> **Need fully-typed tools, resources, or prompts in the run?** The `mcp` prop gives you runtime-typed tools and discovery. To spread `toolDefinition`-typed MCP tools, inject MCP resources and prompts, or cancel in-flight MCP calls, see [Manual MCP: typed tools, resources & prompts](./mcp-manual).
