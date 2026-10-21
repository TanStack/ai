---
title: "Manual MCP: typed tools, resources & prompts"
id: mcp-manual
order: 10
description: "Spread typed MCP tools into chat(), add MCP resources and prompts to the conversation, and stop MCP tool calls when a run aborts."
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

You want more from your [MCP client](./mcp) than tools with `unknown` arguments. You want typed tool arguments, or the resources and prompts of the server in the conversation. Call the client methods yourself and pass the results to `chat()`.

On this path, you own the client and you close it. If you only need tools, and you want `chat()` to close the client, use [Managed MCP with chat()](./mcp-managed).

## Quick setup: typed tools

1. Describe the tool with `toolDefinition()`. The `name` must match the tool name on the server.
2. Pass the definition to `mcp.tools([...])`, and spread the result into `tools`.
3. Close the client in a middleware hook.

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
          adapter: openaiText('gpt-6.1-sol'),
          messages,
          // Typed MCP tools, merged with any other tools you pass
          tools: [...(await mcp.tools([searchDef]))],
          // Close after the run ends. Tools run while the response streams.
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

The `search` tool now has the argument type `{ query: string }`, and Zod checks the arguments at runtime.

## How it works

- `mcp.tools([searchDef])` returns only the tools that you name. If a name is not on the server, it throws `MCPToolNotFoundError`. See [Mode 2: explicit definitions](./mcp-advanced#mode-2-explicit-definitions).
- `chat()` runs tools while the response streams. If you close the client in a `finally` around the `return`, the client closes before the tools run, and the tool calls fail.
- After the run, exactly one of `onFinish`, `onAbort`, or `onError` runs. So a middleware hook is the safe place for `close()`.

## Server instructions

A server can send instructions that tell the model how to use its tools. Put them in the system prompt, so the model reads them before it calls a tool.

Read them from `mcp.instructions` after connect. The value is `undefined` when the server sends none.

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClient } from '@tanstack/ai-mcp'

const mcp = await createMCPClient({
  transport: { type: 'http', url: process.env.MCP_URL! },
})

const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages: [{ role: 'user', content: 'What is the weather in Paris?' }],
  systemPrompts: mcp.instructions ? [mcp.instructions] : [],
  tools: await mcp.tools(),
})
```

In a [multi-server pool](./mcp-advanced#per-server-access), each client has its own value: `pool.clients.github!.instructions`.

## Resources

MCP resources are documents that the server exposes: files, database records, web pages. Read one and add it to a message as content parts:

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClient, mcpResourceToContentPart } from '@tanstack/ai-mcp'

const mcp = await createMCPClient({
  transport: { type: 'http', url: process.env.MCP_URL! },
})

const resources = await mcp.resources()
// resources: Array<{ uri: string; name: string; ... }>

const readResult = await mcp.readResource(resources[0]!.uri)
const parts = readResult.contents.map(mcpResourceToContentPart)

// Add the resource to a user message
const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
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

| MCP content block | `ContentPart` |
|---|---|
| Has a `text` field | `{ type: 'text', content: text }` |
| Has a `blob` field | `{ type: 'text', content: '[binary resource <uri>]' }` |
| Anything else | `{ type: 'text', content: JSON.stringify(content) }` |

### Resource templates

```ts
import { createMCPClient } from '@tanstack/ai-mcp'

const mcp = await createMCPClient({
  transport: { type: 'http', url: process.env.MCP_URL! },
})
const templates = await mcp.resourceTemplates()
// templates: Array<ResourceTemplate>
```

## Prompts

MCP prompts are message templates that the server exposes. Get a prompt, change it to `ModelMessage[]` with `mcpPromptToMessages`, and put it at the start of the conversation:

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
          // List all available prompts on the server
          const available = await mcp.prompts()
          // available: Array<{ name: string; description?: string; arguments?: ... }>

          // Get one prompt, and fill its template arguments
          const prompt = await mcp.getPrompt('summarize', { language: 'english' })

          const stream = chat({
            adapter: openaiText('gpt-6.1-sol'),
            messages: [
              // Start the conversation with the prompt messages of the server
              ...mcpPromptToMessages(prompt),
              // Then add the messages of the user
              ...messages,
            ],
          })

          return toServerSentEventsResponse(stream)
        } finally {
          // Safe here: all MCP calls (prompts/getPrompt) completed before chat()
          // started, and no MCP tools go to the run. If you also spread
          // MCP tools into `tools`, close in a middleware hook instead
          // (see "Quick setup: typed tools" above).
          await mcp.close()
        }
      },
    },
  },
})
```

`getPrompt(name, args?)` takes an optional `args` of type `Record<string, string>`. It fills the template variables of the prompt.

`mcpPromptToMessages` maps each MCP prompt message to a `ModelMessage`:

| MCP prompt message | `ModelMessage` |
|---|---|
| `role === 'assistant'` | `{ role: 'assistant', content: text }` |
| Any other role | `{ role: 'user', content: text }` |
| Content that is not text | `content` is the `JSON.stringify` output |

## Cancellation

A chat run can stop, for example when the user leaves the page or an `AbortController` fires. Then TanStack AI stops the wait for MCP tool calls in progress. The abort signal of the run goes to the execute function of each tool in `ToolExecutionContext.abortSignal`.

- For a normal `callTool` request, the signal aborts the request.
- For a task-required tool, it stops the local task stream. Then it sends a best-effort `tasks/cancel` for a remote task that the server already made.

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
  adapter: openaiText('gpt-6.1-sol'),
  messages,
  tools: await mcp.tools(),
  abortController: controller,
})

// Stop the run and the wait for MCP tool calls in progress:
controller.abort()
```

## Full server and client example

This TanStack Start route connects to two MCP servers and streams the response to the browser.

Server route (`src/routes/api.chat.ts`):

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
          adapter: openaiText('gpt-6.1-sol'),
          messages: body.messages,
          tools: await pool.tools(),
          // Close after the run ends. Tools run while the response streams.
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

Client component (`src/components/Chat.tsx`):

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

Click **Ask**. The model calls the GitHub tools, and the answer streams into the list.

To check tool names at compile time too, see [MCP Type Generation](./mcp-codegen).
