---
title: MCP Apps
id: mcp-apps
order: 12
description: "Show the interactive ui:// widgets that MCP servers return. Render them with MCPAppResource, and let a widget call tools with createMcpAppCallHandler and useMcpAppBridge."
keywords:
  - tanstack ai
  - mcp
  - mcp apps
  - ui resource
  - UIResourcePart
  - MCPAppResource
  - createMcpAppCallHandler
  - createMcpAppBridge
  - useMcpAppBridge
  - interactive widgets
---

Your MCP server returns a widget with a tool result: a chart, a form, a booking card. Your chat shows only the text, and the user never sees the widget.

TanStack AI reads the widget during the `chat()` run and puts it on the assistant message as a `ui-resource` part. Render that part with `MCPAppResource`.

## Quick setup

You need a chat with an MCP server first. If you do not have one, start with [MCP Server Tools](../tools/mcp). This setup uses React. Preact has the same API.

1. Install the widget renderer:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-mcp @mcp-ui/client
preact: @tanstack/ai-mcp @mcp-ui/client

<!-- ::end:tabs -->

2. Connect your chat route to the MCP server. You need no extra server code for widgets:

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
        const { messages } = await request.json()

        const mcp = await createMCPClient({
          transport: {
            type: 'http',
            url: process.env.MCP_URL ?? '',
          },
        })

        const stream = chat({
          adapter: openaiText('gpt-6.1-sol'),
          messages,
          mcp: { clients: [mcp] },
        })

        return toServerSentEventsResponse(stream)
      },
    },
  },
})
```

3. Host a sandbox proxy page on your own origin, for example `/mcp-sandbox.html`. The [`@mcp-ui/client`](https://mcpui.dev) docs have this page.

4. Render each `ui-resource` part with `MCPAppResource`:

```tsx
// src/components/Chat.tsx
import { useChat } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'
import { MCPAppResource } from '@tanstack/ai-react/mcp-apps'

export function Chat() {
  const { messages, sendMessage, status } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}>
          {m.parts.map((part, i) => {
            if (part.type === 'text') {
              return <p key={i}>{part.content}</p>
            }
            if (part.type === 'ui-resource') {
              return (
                <MCPAppResource
                  key={i}
                  part={part}
                  sandbox={{ url: new URL('https://your-app.example.com/mcp-sandbox.html') }}
                />
              )
            }
            return null
          })}
        </div>
      ))}
      <button
        onClick={() => sendMessage({ content: 'Show me the weather widget' })}
        disabled={status === 'streaming'}
      >
        Send
      </button>
    </div>
  )
}
```

Send the message. When the model calls a tool that has a widget, the widget shows in the chat.

## How it works

MCP Apps is an MCP extension, standardized on 2026-01-26. An MCP server links a tool to a `ui://` resource that holds the widget.

1. The model calls the tool during the `chat()` run.
2. TanStack AI reads the `ui://` resource of that tool.
3. It adds a `UIResourcePart` to the `parts` of the assistant message, next to the normal tool result. The part never goes to the model.
4. `MCPAppResource` loads your sandbox page in an isolated iframe, and renders the widget inside it.

The sandbox URL is the security boundary. It is the same for every widget, so you set it once, at deploy time. The widget HTML comes from `part.resource`, not from this URL.

Without a `bridge` prop, the widget is display only. A click in the widget that calls a tool or sends a prompt does nothing. To make it work, see the next section.

To link a tool to its widget on your own TanStack MCP server, see [Tell the host what a tool does](./server#tell-the-host-what-a-tool-does).

## Make a widget interactive

A widget can call tools on its MCP server, send a prompt to the model, or open a link. For that, you add two pieces:

- **Server:** a route with `createMcpAppCallHandler`. The widget calls this route to run a tool.
- **Client:** a bridge from `useMcpAppBridge`. It sends each widget action to the right place.

1. Install the packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-mcp @tanstack/ai-client @mcp-ui/client
preact: @tanstack/ai-mcp @tanstack/ai-client @mcp-ui/client

<!-- ::end:tabs -->

2. In your chat route, use `createMCPClients`. The key (`weather`) becomes the `serverId` on each widget part:

```ts ignore
// src/routes/api.chat.ts
import { createFileRoute } from '@tanstack/react-router'
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createMCPClients } from '@tanstack/ai-mcp'

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()

        const pool = await createMCPClients({
          weather: {
            transport: { type: 'http', url: process.env.WEATHER_MCP_URL ?? '' },
          },
        })

        const stream = chat({
          adapter: openaiText('gpt-6.1-sol'),
          messages: body.messages,
          mcp: { clients: [pool] },
        })

        return toServerSentEventsResponse(stream)
      },
    },
  },
})
```

3. Add the call handler route. Use the same key as in the chat route:

```ts ignore
// src/routes/api.mcp-apps-call.ts  (TanStack Start)
import { createFileRoute } from '@tanstack/react-router'
import { createMCPClients } from '@tanstack/ai-mcp'
import { createMcpAppCallHandler } from '@tanstack/ai-mcp/apps'

const mcp = await createMCPClients({
  weather: {
    transport: {
      type: 'http',
      url: process.env.WEATHER_MCP_URL ?? '',
      headers: { Authorization: `Bearer ${process.env.WEATHER_MCP_TOKEN ?? ''}` },
    },
  },
})

const handler = createMcpAppCallHandler({ clients: mcp })

export const Route = createFileRoute('/api/mcp-apps/call')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // body: { threadId, serverId, toolName, args?, messageId? }
        const body = await request.json()
        const result = await handler(body)
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
```

4. In the client, create a bridge and pass it to `MCPAppResource`:

```tsx
// src/components/Chat.tsx
import { useChat, useMcpAppBridge } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'
import { MCPAppResource } from '@tanstack/ai-react/mcp-apps'

export function Chat() {
  // A stable id that links widget calls to this conversation.
  const threadId = 'weather-chat'
  const { messages, sendMessage, status } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  const bridge = useMcpAppBridge({
    threadId,
    callEndpoint: '/api/mcp-apps/call',
    chat: { sendMessage: (content, body) => sendMessage(content, { body }) },
    // Without onLink, the bridge blocks links.
    onLink: (url) => window.open(url, '_blank', 'noopener'),
  })

  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}>
          {m.parts.map((part, i) => {
            if (part.type === 'text') {
              return <p key={i}>{part.content}</p>
            }
            if (part.type === 'ui-resource') {
              return (
                <MCPAppResource
                  key={i}
                  part={part}
                  bridge={bridge}
                  sandbox={{ url: new URL('https://your-app.example.com/mcp-sandbox.html') }}
                />
              )
            }
            return null
          })}
        </div>
      ))}
      <button
        onClick={() => sendMessage({ content: 'Show me the weather widget' })}
        disabled={status === 'streaming'}
      >
        Send
      </button>
    </div>
  )
}
```

Now a click in the widget runs the tool on the MCP server, and the widget shows the result. A prompt from the widget goes to the chat as a new message.

The bridge sends each widget action to one place:

- `tool` actions: a POST to `callEndpoint`.
- `prompt` actions: `chat.sendMessage(prompt)`.
- `link` actions: `onLink(url)`, if you pass it.

## Framework support

`MCPAppResource` and `useMcpAppBridge` ship for React and Preact:

- React: `@tanstack/ai-react/mcp-apps`.
- Preact: `@tanstack/ai-preact/mcp-apps`. It needs a `preact/compat` alias.

Solid, Vue, Svelte, and Angular have no widget component yet. The `AppRenderer` of `@mcp-ui/client` v7 is React-only. `createMcpAppBridge` from `@tanstack/ai-client` works in any framework.

## Advanced

### The `UIResourcePart` shape

```ts
import type { UIResourcePart } from '@tanstack/ai'

// {
//   type: 'ui-resource'
//   resource: { uri: string; mimeType: string; text?: string; blob?: string }
//   serverId?: string     // pool prefix or config key. Routes interactive calls.
//   toolCallId: string    // links the part to its tool call
//   toolName: string      // MCP tool name whose UI this resource renders
//   meta?: Record<string, unknown>  // reserved. Always undefined for now.
// }
```

TanStack AI reads the resource during the chat run. If the read fails (a network error, a missing resource), the tool result still goes to the model, and the message has no widget.

### What the call handler allows

`createMcpAppCallHandler` accepts a single `MCPClient`, an `MCPClients` pool, or an array of either. For each call, it:

1. Reads the transport descriptor of the client with `client.getInfo()` or `pool.getServers()`. This needs no live socket.
2. Connects to the MCP server again for this call. This works on serverless hosts.
3. Makes sure that the server exposes `toolName`. If it does not, the result is `{ ok: false, error: "Tool not allowed: <name>" }`, and the tool does not run. You cannot turn this check off.
4. Runs the tool and returns `{ ok: true, result }` or `{ ok: false, error }`.

The handler also uses the [tool policy](../tools/mcp-advanced#limit-and-gate-tools) of each client:

- `toolFilter`: a tool that the filter hides returns `Tool not allowed: <name>`.
- `needsApproval`: a widget call has no approval step. A tool that `needsApproval` marks returns `{ ok: false, error: "Tool needs approval: <name>" }`.

To limit the tools more, pass `allowTool`. A request must pass both the server check and `allowTool`:

```ts
import { createMCPClients } from '@tanstack/ai-mcp'
import { createMcpAppCallHandler } from '@tanstack/ai-mcp/apps'

const mcp = await createMCPClients({
  weather: { transport: { type: 'http', url: process.env.MCP_URL ?? '' } },
})

const handler = createMcpAppCallHandler({
  clients: mcp,
  // The server can expose more tools. Only this one goes through.
  allowTool: (req) => req.toolName === 'place_order',
})
```

### Log call failures

The handler returns `{ ok: false, error }` to the widget and logs nothing. To see why a call failed, pass `onError`. The handler calls it (and awaits it) before it returns the result:

```ts
import { createMCPClients } from '@tanstack/ai-mcp'
import { createMcpAppCallHandler } from '@tanstack/ai-mcp/apps'

const mcp = await createMCPClients({
  weather: { transport: { type: 'http', url: process.env.MCP_URL ?? '' } },
})

const handler = createMcpAppCallHandler({
  clients: mcp,
  onError: (error, { phase, req }) => {
    console.error('MCP app call failed', phase, req.toolName, error)
  },
})
```

`phase` is `'call'` for a failure to connect, find, or run the tool. It is `'close'` for a failure to close the client after the call. A `'close'` failure does not change the result.

### Links from a widget

- If you pass no `onLink`, the bridge drops the link and logs a warning. `openLink` returns `{ isError: true }`, and the call does not hang.
- With `onLink`, the bridge forwards only `http:`, `https:`, and `mailto:` URLs. It always rejects other schemes (`javascript:`, `data:`, `file:`) before your handler runs.

### More than one server

Interactive calls go to the server whose `prefix` matches the `serverId` of the part. `createMCPClients` sets the prefix of each server to its config key by default.

If you set `prefix: ''` on one server in a pool of many, that server has no `serverId`. Its widgets cannot make interactive calls. Give each interactive server its own prefix (the default is fine).

### Widget calls and chat history

A widget tool call does not add to the chat history of the thread. Each widget action stands alone.

### Keep sessions for stateful servers

By default the handler connects again for each widget action. If your MCP server needs a session that lasts, pass a session store:

```ts
import { createMCPClients } from '@tanstack/ai-mcp'
import {
  createMcpAppCallHandler,
  inMemoryMcpSessionStore,
} from '@tanstack/ai-mcp/apps'

const mcp = await createMCPClients({
  weather: { transport: { type: 'http', url: process.env.MCP_URL ?? '' } },
})

const store = inMemoryMcpSessionStore({ ttlMs: 30 * 60_000 })

const handler = createMcpAppCallHandler({ clients: mcp, store })
```

- When the store has an entry for a thread and a `serverId`, the store wins. On a miss, the handler uses `clients`.
- `ttlMs` is optional. The default is 30 minutes.
- `inMemoryMcpSessionStore` lives in one Node.js process. It does not survive a serverless restart, and replicas do not share it. To share sessions, write your own store with the `McpSessionStore` interface.

### API reference

`createMcpAppCallHandler(options)` from `@tanstack/ai-mcp/apps` returns `(req) => Promise<{ ok: true; result: unknown } | { ok: false; error: string }>`.

| Option | Type | Description |
| --- | --- | --- |
| `clients` | `MCPClient`, `MCPClients`, or an array of either | The clients that you pass to `chat()`. Required. |
| `store` | `McpSessionStore` | Session store for stateful servers. |
| `allowTool` | `(req) => boolean \| Promise<boolean>` | An extra check on top of the server check. |
| `onError` | `(error, { phase, req }) => void \| Promise<void>` | Called with each failure. |

`createMcpAppBridge(options)` from `@tanstack/ai-client` returns an `McpAppBridge` with `callTool`, `sendPrompt`, and `openLink`. `useMcpAppBridge` from `@tanstack/ai-react` and `@tanstack/ai-preact` takes the same options. It returns a bridge that stays the same for one `threadId` and `callEndpoint`, and it always calls your latest `sendMessage` and `onLink`.

| Option | Type | Description |
| --- | --- | --- |
| `threadId` | `string` | Names the thread for the call handler. Required. |
| `callEndpoint` | `string` | The POST route of the call handler. Required. |
| `chat.sendMessage` | `(content, body?) => Promise<void>` | Sends a prompt from the widget. Required. |
| `fetchImpl` | `typeof fetch` | Replaces `fetch`, for example in tests. |
| `onLink` | `(url) => void` | Opens a link. Without it, links are dropped. |

`MCPAppResource` from `@tanstack/ai-react/mcp-apps` or `@tanstack/ai-preact/mcp-apps`:

| Prop | Type | Description |
| --- | --- | --- |
| `part` | `UIResourcePart` | The `ui-resource` part from the assistant message. Required. |
| `sandbox` | `{ url: URL }` | The URL of your sandbox proxy page. Required. |
| `bridge` | `McpAppBridge` | Omit it for a display-only widget. |
| `toolInput` | `Record<string, unknown>` | Tool input that the widget gets when it is ready. |
