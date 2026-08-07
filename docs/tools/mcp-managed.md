---
title: Managed MCP with chat()
id: mcp-managed
order: 9
description: "Pass MCP clients/pools to chat({ mcp }) for auto discovery and connection lifecycle."
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

If you want MCP tools in a run without `await client.tools()` + close boilerplate → pass live clients to `chat({ mcp })`.

| Path | When |
| --- | --- |
| `mcp: { clients: [...] }` | Discovery + lifecycle managed; runtime-typed (`unknown` args) |
| `tools: [...await client.tools([defs])]` | Fully typed MCP tools — [Manual MCP](./mcp-manual) |

Both can coexist; `mcp.clients` tools merge with explicit `tools`.

## Hand a client to `chat()`

Default `connection: 'close'` — closed on success, error, or abort:

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

        const mcpClient = await createMCPClient({
          transport: {
            type: 'http',
            url: process.env.MCP_URL!,
            headers: { Authorization: `Bearer ${process.env.MCP_TOKEN}` },
          },
        })

        const stream = chat({
          adapter: openaiText('gpt-5.5'),
          messages,
          mcp: {
            clients: [mcpClient],
            connection: 'close',
          },
        })

        return toServerSentEventsResponse(stream)
      },
    },
  },
})
```

## Multiple servers / pools

Mix `MCPClient` and `MCPClients` pools. Discovery is parallel; pools auto-prefix by config key:

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClient, createMCPClients } from '@tanstack/ai-mcp'

const messages = [{ role: 'user' as const, content: 'Hello' }]

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

const internalClient = await createMCPClient({
  transport: { type: 'http', url: process.env.INTERNAL_MCP_URL! },
})

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

Module-level pool + `connection: 'keep-alive'` — `chat()` never closes it:

```ts ignore
import { createFileRoute } from '@tanstack/react-router'
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClients } from '@tanstack/ai-mcp'

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

**Client:**

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

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClient } from '@tanstack/ai-mcp'

const messages = [{ role: 'user' as const, content: 'Hello' }]

const mcpClient = await createMCPClient({
  transport: { type: 'http', url: process.env.LARGE_MCP_URL! },
})

const stream = chat({
  adapter: openaiText('gpt-5.5'),
  messages,
  mcp: {
    clients: [mcpClient],
    connection: 'close',
    lazyTools: true,
  },
})
```

Forwards `tools({ lazy: true })` per source. Details: [Lazy Tool Discovery](./lazy-tool-discovery), [standalone lazy](./mcp#lazy-tool-discovery).

## Discovery failures

**Default fail-fast** — discovery error throws before first model call; `connection: 'close'` cleans up connected sources.

**Skip flaky source** — `onDiscoveryError` logs and continues with remaining tools:

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
  adapter: openaiText('gpt-5.5'),
  messages,
  mcp: {
    clients: [primaryClient, optionalClient],
    connection: 'close',
    onDiscoveryError(error, source) {
      console.warn('MCP discovery failed for a source, skipping.', error)
      // throw error to fail the whole run
    },
  },
})
```

Skipped sources with `connection: 'close'` still close at run end.

## Tool name collisions

Duplicate names across `mcp.clients` → `MCPDuplicateToolNameError` when the stream is first consumed (not a sync throw at `chat()`). Prevent with `prefix` or `createMCPClients` auto-prefix:

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClient } from '@tanstack/ai-mcp'

const messages = [{ role: 'user' as const, content: 'Hello' }]

const serverA = await createMCPClient({
  transport: { type: 'http', url: process.env.SERVER_A_URL! },
  prefix: 'alpha',
})

const serverB = await createMCPClient({
  transport: { type: 'http', url: process.env.SERVER_B_URL! },
  prefix: 'beta',
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

Also: [Tool Name Collisions](./mcp#tool-name-collisions), [Disable or override prefix](./mcp#disable-or-override-the-prefix).

## Going further

Typed tools, resources, prompts, cancel in-flight MCP → [Manual MCP](./mcp-manual).
