---
title: "Manual MCP: typed tools, resources & prompts"
id: mcp-manual
order: 10
description: "Spread fully-typed MCP tools into chat(), inject MCP resources and prompts as content and messages, and cancel in-flight MCP tool calls."
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

You have a live [MCP client](./mcp) and want to do more than auto-discover tools: spread fully-typed tools into a `chat()` run, inject the server's resources and prompts into the conversation, and cancel in-flight MCP calls when the run aborts. By the end of this guide you'll have wired all of these into a single `chat()` call.

> **Manual (`tools` spread) vs managed (`mcp` prop)**
>
> This page covers the **manual** path — you call `client.tools()` / `client.resources()` / `client.getPrompt()` yourself and own `close()`. If you only need runtime-typed tools with discovery and lifecycle handled for you, use the `mcp` prop instead — see [Managed MCP with `chat()`](./mcp-managed). Both paths build on the [`createMCPClient` basics](./mcp).

## Fully-typed tools via the `tools` spread

Pass `toolDefinition()` instances to `client.tools([...])` to get Zod-validated, TypeScript-typed arguments ([Mode 2](./mcp#mode-2--explicit-definitions-clienttoolsdefs)), then spread the result into `chat()`'s `tools` option. You own the client, so you must close it — but **not before the stream is consumed**: `chat()` executes tools lazily while the response streams, so closing in a `finally` around the `return` would kill in-flight tool calls. Close in a middleware terminal hook instead (exactly one of `onFinish`/`onAbort`/`onError` fires per run).

```ts
// src/routes/api.chat.ts
import { createFileRoute } from '@tanstack/react-router'
import { chat, toServerSentEventsResponse, toolDefinition } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai/adapters'
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
          // Fully-typed MCP tools, merged with any other tools you pass
          tools: [...(await mcp.tools([searchDef]))],
          // Close after the run ends — tools execute while the response streams.
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

MCP resources are context documents (files, database records, web pages) the server exposes. Fetch them and inject them into `chat()` as content parts.

```ts
import { mcpResourceToContentPart } from '@tanstack/ai-mcp'

const resources = await mcp.resources()
// resources: Array<{ uri: string; name: string; ... }>

const readResult = await mcp.readResource(resources[0].uri)
const parts = readResult.contents.map(mcpResourceToContentPart)

// Inject as part of a user message
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

`mcpResourceToContentPart` maps each MCP content block to a `ContentPart`:
- `text` field present → `{ type: 'text', content: text }`
- `blob` field present → `{ type: 'text', content: '[binary resource <uri>]' }`
- otherwise → `{ type: 'text', content: JSON.stringify(content) }`

### Resource templates

```ts
const templates = await mcp.resourceTemplates()
// templates: Array<ResourceTemplate>
```

## Prompts

MCP prompts are reusable message templates the server exposes. Fetch a prompt, convert it to `ModelMessage[]` with `mcpPromptToMessages`, and spread it into `chat()` to seed the conversation with server-defined context or instructions.

```ts
import { createFileRoute } from '@tanstack/react-router'
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai/adapters'
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
          // List all available prompts on the server
          const available = await mcp.prompts()
          // available: Array<{ name: string; description?: string; arguments?: ... }>

          // Fetch a specific prompt, optionally passing template arguments
          const prompt = await mcp.getPrompt('summarize', { language: 'english' })

          const stream = chat({
            adapter: openaiText('gpt-5.5'),
            messages: [
              // Seed the conversation with the server-defined prompt messages
              ...mcpPromptToMessages(prompt),
              // Then append the user's own messages
              ...messages,
            ],
          })

          return toServerSentEventsResponse(stream)
        } finally {
          // Safe here: all MCP calls (prompts/getPrompt) completed before chat()
          // started, and no MCP tools are passed to the run. If you also spread
          // MCP tools into `tools`, close in a middleware terminal hook instead
          // (see "Fully-typed tools via the `tools` spread" above).
          await mcp.close()
        }
      },
    },
  },
})
```

`mcpPromptToMessages` maps each MCP prompt message to a `ModelMessage`:
- `role === 'assistant'` → `{ role: 'assistant', content: text }`
- any other role → `{ role: 'user', content: text }`
- non-text content → `content` is `JSON.stringify`'d

`getPrompt(name, args?)` accepts an optional `args` parameter typed as `Record<string, string>` for filling in template variables declared by the prompt.

## Cancellation

When the chat run is cancelled (e.g. the user navigates away or an `AbortController` fires), in-flight MCP `callTool` requests are cancelled automatically. The abort signal from the chat run is threaded through `ToolExecutionContext.abortSignal` into each tool's execute function.

```ts
const controller = new AbortController()

const stream = chat({
  adapter: openaiText('gpt-5.5'),
  messages,
  tools: await mcp.tools(),
  abortController: controller,
})

// Cancel the run and all in-flight MCP tool calls:
controller.abort()
```

## Full Server + Client Example

Here is a complete TanStack Start API route that connects to two MCP servers and streams the response to the browser.

**Server route (`src/routes/api.chat.ts`):**

```ts
import { createFileRoute } from '@tanstack/react-router'
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai/adapters'
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
          // Close after the run ends — tools execute while the response streams.
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

## Going further

> **Want `chat()` to discover tools and close clients for you?** If you don't need the manual `tools` spread, resources, or prompts, the `mcp` prop removes the close-middleware boilerplate entirely. See [Managed MCP with `chat()`](./mcp-managed).

> **Want compile-checked tool names on the discovery path?** Generate per-server interface types from your live servers and pass them as a generic to `createMCPClient` — discovered tool names narrow to the server's literal names, with zero runtime overhead. See [MCP Type Generation](./mcp-codegen).
