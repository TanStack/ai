---
title: Managed MCP with chat()
id: mcp-managed
order: 9
description: "Pass MCP clients and pools to chat() in the mcp option. chat() finds their tools and closes the connections for you."
keywords:
  - tanstack ai
  - mcp
  - model context protocol
  - chat mcp
  - mcp clients
  - keep-alive
  - lazyTools
  - onDiscoveryError
  - toolFilter
  - needsApproval
---

Pass MCP clients to `chat()` in the `mcp` option. `chat()` loads their tools and closes the clients when the run ends.

## Quick setup

1. Make a client in your chat route.
2. Pass it in `mcp.clients`.

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
        const { messages, threadId } = await request.json()

        const mcpClient = await createMCPClient({
          transport: {
            type: 'http',
            url: process.env.MCP_URL!,
            headers: { Authorization: `Bearer ${process.env.MCP_TOKEN}` },
          },
        })

        // chat() finds the tools of mcpClient and closes it when the run ends.
        const stream = chat({
          adapter: openaiText('gpt-6.1-sol'),
          messages,
          threadId,
          mcp: {
            clients: [mcpClient],
            // 'close' is the default. It is shown here so you can see it.
            connection: 'close',
          },
        })

        return toServerSentEventsResponse(stream)
      },
    },
  },
})
```

That is all. There is no `try/finally`. Your `useChat` code does not change.

## How it works

- Before the first model call, `chat()` calls `tools()` on each client at the same time and merges the results into one tool set.
- Tools from `mcp.clients` merge with any tools that you pass in `tools`. You can use both in one call.
- `connection: 'close'` (the default) closes each client when the run ends: on success, on error, and on abort.
- `connection: 'keep-alive'` never closes the clients. You own them.

> [!NOTE]
> Tools from `mcp` have arguments of type `unknown` at compile time. For Zod-validated, typed arguments, spread `await client.tools([toolDefinition(...)])` into `tools` yourself. See [Manual MCP](./mcp-manual) and [Three Modes of Type Safety](./mcp-advanced#three-modes-of-type-safety).

The samples below show only the client setup and the `chat()` call. They go into the same route as above.

## Multiple servers and pools

Pass any mix of `MCPClient` instances and `MCPClients` pools. A pool adds the config key as a prefix to the tool names of each server, so the names do not collide.

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClient, createMCPClients } from '@tanstack/ai-mcp'

const messages = [{ role: 'user' as const, content: 'Hello' }]

// A pool of two servers. Their tools get the prefixes "github_" and "linear_".
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

// The tools of all three servers merge: github_*, linear_*, and the internal tools
const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages,
  threadId: 'thread-1',
  mcp: {
    clients: [githubLinearPool, internalClient],
    connection: 'close',
  },
})
```

## Limit which tools the model gets

`chat({ mcp })` sends every tool that each client finds. To hide tools, or to ask for approval, set `toolFilter` or `needsApproval` on the client. `chat()` uses the options of each client:

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClient, createMCPClients } from '@tanstack/ai-mcp'

const messages = [{ role: 'user' as const, content: 'Hello' }]

// One client: send only read-only tools
const github = await createMCPClient({
  transport: { type: 'http', url: process.env.GITHUB_MCP_URL! },
  toolFilter: (tool) => tool.annotations?.readOnlyHint === true,
})

// A pool: each server gets its own options
const pool = await createMCPClients({
  linear: {
    transport: { type: 'http', url: process.env.LINEAR_MCP_URL! },
    needsApproval: (tool) => tool.annotations?.readOnlyHint !== true,
  },
  docs: {
    transport: { type: 'http', url: process.env.DOCS_MCP_URL! },
    // Exactly these two tools, by server name
    toolFilter: ['search_docs', 'get_page'],
  },
})

const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages,
  threadId: 'thread-1',
  mcp: { clients: [github, pool] },
})
```

A `toolFilter` list is strict. If the server has no tool with a listed name, or a name is listed twice, discovery fails:

- A single client throws `MCPToolFilterError`.
- A `createMCPClients` pool throws `MCPConnectionError`. Its `cause` is the `MCPToolFilterError`.

`chat()` handles this like any other [discovery failure](#handling-discovery-failures). By default, the run fails before the first model call.

> [!WARNING]
> The hints come from the server, and a compromised server can send false hints. For the trust rules and the list form, see [Limit and Gate Tools](./mcp-advanced#limit-and-gate-tools).

## Keep connections warm

A new MCP connection on each request adds latency. On a busy route, make the pool once at module level and pass `connection: 'keep-alive'`. Then `chat()` never closes the pool, and the next request uses the same connections.

Where you make the pool is important here, so this is a full route.

Server route (`src/routes/api.chat.ts`):

```ts ignore
import { createFileRoute } from '@tanstack/react-router'
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClients } from '@tanstack/ai-mcp'

// Made once when the module loads. All requests share it.
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
        const { messages, threadId } = await request.json()

        // keep-alive: chat() never closes sharedPool. It stays warm for the next call.
        const stream = chat({
          adapter: openaiText('gpt-6.1-sol'),
          messages,
          threadId,
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

Client component (`src/components/Chat.tsx`):

```tsx
import { useChat } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
  threadId: 'support-chat',
}

export function Chat() {
  const { messages, sendMessage, status } = useChat(chatOptions)

  return (
    <div>
      <ul>
        {messages.map((m) => (
          <li key={m.id}>
            <strong>{m.role}:</strong>{' '}
            {m.parts.find((p) => p.type === 'text')?.content}
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

A server with dozens of tools makes the prompt big and expensive. Set `lazyTools: true` to send a tool schema only when the model asks for it:

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClient } from '@tanstack/ai-mcp'

const messages = [{ role: 'user' as const, content: 'Hello' }]

const mcpClient = await createMCPClient({
  transport: { type: 'http', url: process.env.LARGE_MCP_URL! },
})

const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages,
  threadId: 'thread-1',
  mcp: {
    clients: [mcpClient],
    connection: 'close',
    // The tools are registered, but their schemas wait until the model asks
    lazyTools: true,
  },
})
```

`chat()` passes `lazyTools: true` to the `tools({ lazy: true })` call of each source. See [Lazy Tool Discovery](./lazy-tool-discovery) for how the model finds lazy tools. To use `{ lazy: true }` on `client.tools()` directly, see [Lazy Tool Discovery for MCP](./mcp-advanced#lazy-tool-discovery).

## Advanced

### Handling discovery failures

By default, if one source fails during discovery, `chat()` fails at once. With `connection: 'close'`, `chat()` first closes the sources that did connect. No connection stays open.

Fail fast (the default):

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClient } from '@tanstack/ai-mcp'

const messages = [{ role: 'user' as const, content: 'Hello' }]

const mcpClient = await createMCPClient({
  transport: { type: 'http', url: process.env.MCP_URL! },
})

// If discovery fails, chat() throws before the first model call.
// mcpClient closes automatically (connection: 'close' is the default).
const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages,
  threadId: 'thread-1',
  mcp: {
    clients: [mcpClient],
  },
})
```

Skip a flaky server and continue: use `onDiscoveryError` to log the error and return normally. `chat()` skips the failed source and runs with the tools of the other clients.

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClient } from '@tanstack/ai-mcp'

const messages = [{ role: 'user' as const, content: 'Hello' }]

const primaryClient = await createMCPClient({
  transport: { type: 'http', url: process.env.PRIMARY_MCP_URL! },
})

const optionalClient = await createMCPClient({
  transport: { type: 'http', url: process.env.OPTIONAL_MCP_URL! },
})

const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages,
  threadId: 'thread-1',
  mcp: {
    clients: [primaryClient, optionalClient],
    connection: 'close',
    onDiscoveryError(error, source) {
      // Log the failure, and let the run continue without the tools of this source.
      // Throw here (or throw `error` again) to fail the whole run instead.
      console.warn('MCP discovery failed for a source, skipping.', error)
    },
  },
})
```

> [!NOTE]
> A source that `onDiscoveryError` gets can be connected already. With `connection: 'close'`, `chat()` still closes it when the run ends, even though it skipped its tools.

### Tool name collisions

If two sources in `mcp.clients` have a tool with the same name, the run fails with `MCPDuplicateToolNameError` (exported from `@tanstack/ai`).

`chat()` is lazy. Discovery starts when something first reads the stream. So the error comes through the stream (the SSE response fails). You cannot catch it with a `try/catch` around the `chat()` call.

Prevent the collision instead. Give one of the clients a `prefix`, or use `createMCPClients`, which adds the config key as a prefix:

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClient } from '@tanstack/ai-mcp'

const messages = [{ role: 'user' as const, content: 'Hello' }]

// Both servers have a tool called "search". Without prefixes, the run
// fails with MCPDuplicateToolNameError. The prefix option prevents this.
const serverA = await createMCPClient({
  transport: { type: 'http', url: process.env.SERVER_A_URL! },
  prefix: 'alpha', // tools become "alpha_search", and so on
})

const serverB = await createMCPClient({
  transport: { type: 'http', url: process.env.SERVER_B_URL! },
  prefix: 'beta', // tools become "beta_search", and so on
})

const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages,
  threadId: 'thread-1',
  mcp: {
    clients: [serverA, serverB],
    connection: 'close',
  },
})
```

For collisions in `pool.tools()` and the `prefix` options, see [Tool Name Collisions](./mcp-advanced#tool-name-collisions) and [Disable or override the prefix](./mcp-advanced#disable-or-override-the-prefix).
