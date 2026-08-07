---
title: "Manual MCP: typed tools, resources & prompts"
id: mcp-manual
order: 10
description: "Spread typed MCP tools into chat(), inject resources/prompts, cancel in-flight MCP calls."
keywords:
  - tanstack ai
  - mcp
  - model context protocol
  - mcp resources
  - mcp prompts
  - mcpResourceToContentPart
  - mcpPromptToMessages
  - cancellation
  - abortController
---

If you need typed MCP tools, resources, prompts, or own `close()` → manual path. Discovery + lifecycle only → [Managed MCP](./mcp-managed). Client basics → [`createMCPClient`](./mcp).

## Typed tools via `tools` spread

`client.tools([toolDefinition(...)])` → Zod-typed tools ([Mode 2](./mcp#mode-2--explicit-definitions-clienttoolsdefs)). Close **after** the stream finishes (tools run while streaming) — use middleware terminal hooks:

```ts ignore
// src/routes/api.chat.ts
import { createFileRoute } from '@tanstack/react-router'
import { chat, toServerSentEventsResponse, toolDefinition } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClient } from '@tanstack/ai-mcp'
import { z } from 'zod'

const searchDef = toolDefinition({
  name: 'search',
  description: 'Search for items',
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.array(z.object({ id: z.string(), title: z.string() })),
})

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages } = await request.json()

        const mcp = await createMCPClient({
          transport: { type: 'http', url: process.env.MCP_URL! },
        })

        const stream = chat({
          adapter: openaiText('gpt-5.5'),
          messages,
          tools: [...(await mcp.tools([searchDef]))],
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
      },
    },
  },
})
```

## Resources

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClient, mcpResourceToContentPart } from '@tanstack/ai-mcp'

const mcp = await createMCPClient({
  transport: { type: 'http', url: process.env.MCP_URL! },
})

const resources = await mcp.resources()
const readResult = await mcp.readResource(resources[0]!.uri)
const parts = readResult.contents.map(mcpResourceToContentPart)

const stream = chat({
  adapter: openaiText('gpt-5.5'),
  messages: [
    {
      role: 'user',
      content: [
        ...parts,
        { type: 'text', content: 'Summarize the above document.' },
      ],
    },
  ],
})
```

`mcpResourceToContentPart` mapping:

| MCP content | ContentPart |
| --- | --- |
| `text` present | `{ type: 'text', content: text }` |
| `blob` present | `{ type: 'text', content: '[binary resource <uri>]' }` |
| otherwise | `{ type: 'text', content: JSON.stringify(content) }` |

**Templates:**

```ts
import { createMCPClient } from '@tanstack/ai-mcp'

const mcp = await createMCPClient({
  transport: { type: 'http', url: process.env.MCP_URL! },
})
const templates = await mcp.resourceTemplates()
```

## Prompts

```ts ignore
import { createFileRoute } from '@tanstack/react-router'
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClient, mcpPromptToMessages } from '@tanstack/ai-mcp'

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages } = await request.json()

        const mcp = await createMCPClient({
          transport: { type: 'http', url: process.env.MCP_URL! },
        })

        try {
          const available = await mcp.prompts()
          const prompt = await mcp.getPrompt('summarize', { language: 'english' })

          const stream = chat({
            adapter: openaiText('gpt-5.5'),
            messages: [
              ...mcpPromptToMessages(prompt),
              ...messages,
            ],
          })

          return toServerSentEventsResponse(stream)
        } finally {
          // Safe only when no MCP tools stream with the run
          await mcp.close()
        }
      },
    },
  },
})
```

`mcpPromptToMessages`:

- `role === 'assistant'` → assistant text message
- other roles → user text message
- non-text → `JSON.stringify`

`getPrompt(name, args?)` — `args: Record<string, string>` for template vars.

If you also spread MCP tools, close in middleware (not this `finally`).

## Cancellation

Chat abort threads through `ToolExecutionContext.abortSignal` into MCP `callTool`:

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClient } from '@tanstack/ai-mcp'

const messages = [{ role: 'user' as const, content: 'Hello' }]

const mcp = await createMCPClient({
  transport: { type: 'http', url: process.env.MCP_URL! },
})
const controller = new AbortController()

const stream = chat({
  adapter: openaiText('gpt-5.5'),
  messages,
  tools: await mcp.tools(),
  abortController: controller,
})

controller.abort()
```

## Full server + client example

**Server (`src/routes/api.chat.ts`):**

```ts ignore
import { createFileRoute } from '@tanstack/react-router'
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClients } from '@tanstack/ai-mcp'

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()

        if (typeof body !== 'object' || body === null || !Array.isArray(body.messages)) {
          return new Response('Bad request', { status: 400 })
        }

        const pool = await createMCPClients({
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

        const stream = chat({
          adapter: openaiText('gpt-5.5'),
          messages: body.messages,
          tools: await pool.tools(),
          middleware: [
            {
              name: 'mcp-close',
              onFinish: () => pool.close(),
              onAbort: () => pool.close(),
              onError: () => pool.close(),
            },
          ],
        })

        return toServerSentEventsResponse(stream)
      },
    },
  },
})
```

**Client (`src/components/Chat.tsx`):**

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

## Going further

- Managed discovery/lifecycle without tools spread → [Managed MCP](./mcp-managed)
- Compile-checked tool names → [MCP Type Generation](./mcp-codegen)
