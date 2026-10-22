---
title: MCP Server Tools
id: mcp
order: 8
description: "Connect TanStack AI to a Model Context Protocol server with createMCPClient, and give the model the tools of that server in chat()."
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

`createMCPClient` connects to an MCP server. Pass that client to `chat()` in the `mcp` option.

> [!NOTE]
> MCP tools run on the server. Call `createMCPClient` in a server route or a serverless function, never in browser code.

Servers can also push signed webhooks through the experimental MCP Events extension. See [MCP Events](./mcp-events). A Start app that subscribes and receives a delivery is in [Subscribe to MCP Events](../tutorials/mcp-events).

## Quick setup

You need a working chat first. If you do not have one, start with the [Quick Start](../getting-started/quick-start).

1. Install the MCP client:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-mcp @modelcontextprotocol/client
vue: @tanstack/ai-mcp @modelcontextprotocol/client
solid: @tanstack/ai-mcp @modelcontextprotocol/client
svelte: @tanstack/ai-mcp @modelcontextprotocol/client
preact: @tanstack/ai-mcp @modelcontextprotocol/client
angular: @tanstack/ai-mcp @modelcontextprotocol/client
vanilla: @tanstack/ai-mcp @modelcontextprotocol/client
octane: @tanstack/ai-mcp @modelcontextprotocol/client

<!-- ::end:tabs -->

2. In your chat route, connect to the server and pass the client to `chat()`. Change the URL to the URL of your MCP server:

```ts ignore
// src/routes/api.chat.ts  (TanStack Start)
import { createFileRoute } from '@tanstack/react-router'
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClient } from '@tanstack/ai-mcp'

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages, threadId } = await request.json()

        const mcp = await createMCPClient({
          transport: {
            type: 'http',
            url: 'https://my-mcp-server.example.com/mcp',
          },
        })

        // chat() finds the tools and closes the client when the run ends.
        const stream = chat({
          adapter: openaiText('gpt-6.1-sol'),
          messages,
          threadId,
          mcp: { clients: [mcp] },
        })

        return toServerSentEventsResponse(stream)
      },
    },
  },
})
```

3. Keep your client code. `useChat` reads this endpoint the same way as any other chat endpoint:

```tsx
// src/components/Chat.tsx
import { useChat } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'

export function Chat() {
  const { messages, sendMessage, status } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    threadId: 'support-chat',
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

Now ask the model something that needs one of the server tools. The model calls the tool, your server runs it on the MCP server, and the answer streams back.

## How it works

- `createMCPClient` connects to the server. It tries protocol `2026-07-28` first. If the server does not support it, the client uses the 2025 handshake.
- `chat({ mcp })` asks each client for its tools before the first model call.
- When the model calls a tool, `chat()` sends the call to the MCP server and gives the result back to the model.
- When the run ends, `chat()` closes the client. This happens on success, on error, and on abort.

> [!NOTE]
> MCP tool arguments have the type `unknown` at compile time. The client checks them against the JSON Schema of the server at runtime.

## Connect to your server

Pick the transport that your server uses.

HTTP (Streamable HTTP) is the usual choice for a remote server. Add `headers` when the server needs a token:

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

SSE is for servers that use the older SSE transport:

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

stdio starts a local MCP process. It works in Node.js only. It has its own import path, so edge bundles do not include Node modules:

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

For OAuth, custom transports, and timeouts, see [MCP Server Tools: Advanced](./mcp-advanced).

## What to read next

- **Hide tools or ask the user first.** A server can expose tools that write or delete data. See [Limit and Gate Tools](./mcp-advanced#limit-and-gate-tools).
- **Many servers, warm connections, or a flaky server.** See [Managed MCP with chat()](./mcp-managed).
- **Typed tool arguments, resources, and prompts.** See [Manual MCP](./mcp-manual).
- **Compile-checked tool names.** See [MCP Type Generation](./mcp-codegen).
- **The server asks the user for input during a tool call.** See [MCP Client Input](./mcp-input).

> [!NOTE]
> This page is about MCP on your server. To expose browser actions to a browser agent, see [WebMCP Tools](./webmcp). WebMCP calls go to the browser agent, and they do not become tool results in a TanStack chat run.

Package names for an `@modelcontextprotocol/sdk` import are in [MCP SDK packages](../migration/mcp-sdk).

## Advanced

Every option of the client is on [MCP Server Tools: Advanced](./mcp-advanced): OAuth, timeouts, the three modes of type safety, tool annotations, pools, lifecycle, tool names, lazy discovery, and the error reference.
