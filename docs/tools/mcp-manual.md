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

Call the MCP client yourself when you need typed tool arguments, resources, or prompts. Pass the results into `chat()`.

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
        const { messages, threadId } = await request.json()

        const mcp = await createMCPClient({
          transport: { type: 'http', url: process.env.MCP_URL! },
        })

        const stream = chat({
          adapter: openaiText('gpt-6.1-sol'),
          messages,
          threadId,
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
  threadId: 'thread-1',
  systemPrompts: mcp.instructions ? [mcp.instructions] : [],
  tools: await mcp.tools(),
})
```

In a [multi-server pool](./mcp-advanced#per-server-access), each client has its own value: `pool.clients.github!.instructions`.

## Extension methods

A server can serve an [MCP extension](https://modelcontextprotocol.io/extensions/overview), with methods that `MCPClient` has no helper for. Call them with `mcp.request`. It takes the same arguments as the SDK `Client.request`, and it uses the client's `requestOptions`.

1. Declare the extension in `clientOptions.capabilities.extensions`. The spec asks both sides to list the extensions they support, and a server can change what it sends based on this list.
2. After connect, look for the extension in `mcp.capabilities.extensions`.
3. Call the method. For a method that is not in the MCP spec, pass a result schema as the second argument.

```ts
import { createMCPClient } from '@tanstack/ai-mcp'
import { z } from 'zod'

const mcp = await createMCPClient({
  transport: { type: 'http', url: process.env.MCP_URL! },
  clientOptions: {
    capabilities: { extensions: { 'com.example/notes': {} } },
  },
})

const extensions = mcp.capabilities.extensions
if (
  typeof extensions === 'object' &&
  extensions !== null &&
  'com.example/notes' in extensions
) {
  const notes = await mcp.request(
    { method: 'notes/count', params: {} },
    z.object({ count: z.number() }),
  )
  console.log(notes.count)
}
```

To serve an extension, see [Serve an MCP extension](../mcp/server#serve-an-mcp-extension).

## Skip the discover request

On protocol `2026-07-28`, the client sends `server/discover` when it connects. Some hosts open a new connection for each request. They pay for that round trip each time.

Save the result per user or token, then pass it back as `prior`:

```ts
import { createMCPClient } from '@tanstack/ai-mcp'
import type { DiscoverResult } from '@tanstack/ai-mcp'

const MAX_AGE_MS = 5 * 60_000
const saved = new Map<string, { discover: DiscoverResult; savedAt: number }>()

export async function connect(token: string) {
  const hit = saved.get(token)
  const fresh = hit !== undefined && Date.now() - hit.savedAt < MAX_AGE_MS
  const mcp = await createMCPClient({
    transport: {
      type: 'http',
      url: process.env.MCP_URL!,
      headers: { Authorization: `Bearer ${token}` },
    },
    prior: fresh ? { kind: 'modern', discover: hit.discover } : undefined,
  })
  const discover = mcp.getDiscoverResult()
  if (!fresh && discover) saved.set(token, { discover, savedAt: Date.now() })
  return mcp
}
```

- `getDiscoverResult()` returns the `server/discover` result of the connection. It is `undefined` when the server speaks protocol `2025-11-25`.
- The result is plain JSON, so you can keep it in a cache or a database.
- Do not share a saved result between users. The spec treats it as private to one authorization context. See [Caching](https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/caching).
- You decide how long to keep it. A stale result fails on the first request after connect, not on connect.
- With `prior`, connect sends no request. A server that is down, or a token that is no longer valid, fails on the first call.

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
  threadId: 'thread-1',
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
        const { messages, threadId } = await request.json()

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
            threadId,
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
  threadId: 'thread-1',
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
          threadId: body.threadId,
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

Click **Ask**. The model calls the GitHub tools, and the answer streams into the list.

To check tool names at compile time too, see [MCP Type Generation](./mcp-codegen).
