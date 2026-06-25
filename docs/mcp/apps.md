---
title: MCP Apps
id: mcp-apps
order: 12
description: "Render interactive ui:// widget resources returned by MCP servers — static display via UIResourcePart and full interactivity via createMcpAppCallHandler and createMcpAppBridge."
keywords:
  - tanstack ai
  - mcp
  - mcp apps
  - ui resource
  - UIResourcePart
  - MCPAppResource
  - createMcpAppCallHandler
  - createMcpAppBridge
  - interactive widgets
---

**MCP Apps** is a ratified MCP extension (standardized 2026-01-26) that lets MCP servers return interactive `ui://` resource widgets alongside normal tool results. Instead of the model receiving raw JSON, the server embeds a resource URI that TanStack AI fetches and streams to the client as a `UIResourcePart` — ready to render as a full interactive iframe widget.

There are two levels of MCP Apps support:

- **Static** — the MCP tool result contains a `ui://` resource. TanStack AI reads it during the `chat()` run and surfaces it as a `UIResourcePart` on the assistant `UIMessage`. No extra routes needed; render it with `MCPAppResource`.
- **Interactive** — the widget's iframe posts tool-call or prompt actions back. You mount a server handler (`createMcpAppCallHandler`) at a route and wire a client bridge (`createMcpAppBridge`) so those actions reach the right MCP server.

## Static Widgets

When an MCP tool's result carries a `ui://` resource, TanStack AI emits a `UIResourcePart` on the assistant `UIMessage`. The part is added to the message's `parts` array **alongside** the normal `ToolResultPart` — it never enters model input.

### The `UIResourcePart` shape

```ts
import type { UIResourcePart } from '@tanstack/ai'

// Arrives on the assistant UIMessage alongside ToolCallPart / ToolResultPart:
// {
//   type: 'ui-resource'
//   resource: { uri: string; mimeType: string; text?: string; blob?: string }
//   serverId?: string     // pool prefix / config key — routes interactive calls
//   toolCallId: string    // links to the originating tool call
//   meta?: Record<string, unknown>
// }
```

No server-side changes are needed beyond connecting an MCP server that returns `ui://` resources. The resource is read eagerly during the chat run. If the read fails (network error, missing resource), the tool result still flows to the model — the widget is simply absent (**fail-soft**).

### Server route

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
            url: process.env.MCP_URL!,
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

### React client — rendering a static widget

Install the optional peer dependency:

```bash
pnpm add @mcp-ui/client
```

Then render each `ui-resource` part from the assistant message:

```tsx
// src/components/Chat.tsx
import { useChat } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'
import { MCPAppResource } from '@tanstack/ai-react/mcp-apps'
import type { UIResourcePart } from '@tanstack/ai'

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
                  sandbox={{ url: new URL('https://sandbox.example.com') }}
                  toolName={part.toolCallId}
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

`MCPAppResource` is powered by `@mcp-ui/client`'s `AppRenderer` under the hood. Without a `bridge` prop the widget renders in display-only mode — user interactions inside the iframe that trigger tool calls or prompts are ignored.

> **Framework support:** React and Preact are shipped (`@tanstack/ai-react/mcp-apps` and `@tanstack/ai-preact/mcp-apps`). Preact requires a `preact/compat` alias. Solid, Vue, Svelte, and Angular wrappers are deferred — `@mcp-ui/client` v7's `AppRenderer` is React-only and a framework-agnostic renderer SDK is future work.

## Interactive Widgets

For widgets that need to call tools or send prompts back to the model, you wire two extra pieces:

1. **Server** — mount `createMcpAppCallHandler` at a POST route. The widget's iframe calls this route.
2. **Client** — create a `createMcpAppBridge` and pass it to `MCPAppResource`. The bridge routes the iframe's actions (tool calls, prompts, links) to the correct handler.

### Installation

```bash
pnpm add @tanstack/ai-mcp @tanstack/ai-client @mcp-ui/client
```

### Server — the call handler route

`createMcpAppCallHandler` from `@tanstack/ai-mcp/apps` accepts a static server map (the default, serverless-safe path) or a dynamic session store, and returns a request handler that:

- Validates the `serverId` against the allowlist.
- Reconnects to the MCP server per call (stateless; serverless-safe by default).
- Checks that the requested `toolName` is actually exposed by that server (same-server allowlist).
- Calls the tool and returns `{ ok: true, result }` or `{ ok: false, error }`.

```ts ignore
// src/routes/api.mcp-apps-call.ts  (TanStack Start)
import { createFileRoute } from '@tanstack/react-router'
import { createMcpAppCallHandler } from '@tanstack/ai-mcp/apps'

const handler = createMcpAppCallHandler({
  // Static map: the server key must match the serverId on UIResourcePart.
  // Using the same key as the chat route's MCP pool prefix routes calls to the right server.
  servers: {
    weather: {
      transport: {
        type: 'http',
        url: process.env.WEATHER_MCP_URL!,
        headers: { Authorization: `Bearer ${process.env.WEATHER_MCP_TOKEN}` },
      },
    },
  },
})

export const Route = createFileRoute('/api/mcp-apps/call')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        // body: { threadId, serverId, toolName, args?, messageId? }
        const result = await handler(body)
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
```

> **`link` intents are blocked by default.** If the widget emits a `link` action and no `onLink` handler is wired in the bridge, the navigation is silently dropped — the widget cannot open arbitrary URLs in the host page. Pass `onLink` explicitly to opt in.

#### Same-server allowlist

By default, `createMcpAppCallHandler` verifies that `toolName` is in the list of tools the target server actually exposes. A request for a tool the server does not know about returns `{ ok: false, error: "Tool not allowed: <name>" }` without ever executing it. Override with the `allowTool` option:

```ts
import { createMcpAppCallHandler } from '@tanstack/ai-mcp/apps'

const handler = createMcpAppCallHandler({
  servers: {
    weather: {
      transport: { type: 'http', url: process.env.WEATHER_MCP_URL! },
    },
  },
  // Custom allowlist: only permit specific tool names
  allowTool: (req) => req.toolName === 'place_order',
})
```

### Chat route — wire the `serverId`

The `serverId` on a `UIResourcePart` comes from the `prefix` you gave the MCP client. Use the same key in both places:

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

        // The pool key "weather" becomes the serverId on every UIResourcePart
        // emitted by this server — must match the key in createMcpAppCallHandler's
        // servers map.
        const pool = await createMCPClients({
          weather: {
            transport: { type: 'http', url: process.env.WEATHER_MCP_URL! },
          },
        })

        const stream = chat({
          adapter: openaiText('gpt-5.5'),
          messages: body.messages,
          mcp: { clients: [pool] },
        })

        return toServerSentEventsResponse(stream)
      },
    },
  },
})
```

### Client — bridge + interactive render

`createMcpAppBridge` from `@tanstack/ai-client` returns an action handler you pass to `MCPAppResource`. It routes:

- `tool` actions → POST to `callEndpoint` with the tool call payload.
- `prompt` actions → `chat.sendMessage(prompt)`.
- `link` actions → `onLink(url)` if provided, **blocked** otherwise.
- `notify` / `intent` → optional callbacks.

```tsx
// src/components/Chat.tsx
import { useChat } from '@tanstack/ai-react'
import { fetchServerSentEvents, createMcpAppBridge } from '@tanstack/ai-client'
import { MCPAppResource } from '@tanstack/ai-react/mcp-apps'

export function Chat() {
  const { messages, sendMessage, status } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })
  // A stable id correlating widget calls back to this conversation.
  const threadId = 'weather-chat'

  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}>
          {m.parts.map((part, i) => {
            if (part.type === 'text') {
              return <p key={i}>{part.content}</p>
            }
            if (part.type === 'ui-resource') {
              const bridge = createMcpAppBridge({
                threadId,
                callEndpoint: '/api/mcp-apps/call',
                chat: { sendMessage },
                // Opt in to link navigation — absent means links are blocked.
                onLink: (url) => window.open(url, '_blank', 'noopener'),
              })

              return (
                <MCPAppResource
                  key={i}
                  part={part}
                  bridge={bridge}
                  sandbox={{ url: new URL('https://sandbox.example.com') }}
                  toolName={part.toolCallId}
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

> **Writeback is client-side.** Widget tool calls do **not** append to the thread's chat history by default. The conversation state writeback path is out of scope for the current release. Each widget interaction is self-contained.

## Session Persistence

The call handler reconnects to the MCP server on every widget action (**reconnect-per-call** — stateless, serverless-safe). For stateful MCP transports that require a persistent session, opt in to an in-memory session store:

```ts
import {
  createMcpAppCallHandler,
  inMemoryMcpSessionStore,
} from '@tanstack/ai-mcp/apps'

// In-memory store: one Node.js process, no cross-instance sharing.
// Shape matches the McpSessionStore seam — SQL / KV stores (PR #785)
// can be dropped in later with no API change.
const store = inMemoryMcpSessionStore({ ttlMs: 30 * 60_000 })

const handler = createMcpAppCallHandler({
  store,
  // servers is optional when store is provided; the store resolves descriptors
  // dynamically. Populate it from your chat route via store.set(threadId, servers).
})
```

> **Current limitation:** `inMemoryMcpSessionStore` is single-instance (one Node.js process). It does not survive serverless restarts or scale across replicas. A pluggable `McpSessionStore` interface is defined so that persistent backends (database, KV store) from PR #785 can be dropped in without any API changes when they land.

## API Reference

### `createMcpAppCallHandler` (`@tanstack/ai-mcp/apps`)

```ts
import { createMcpAppCallHandler } from '@tanstack/ai-mcp/apps'
import type { McpAppCallHandlerOptions } from '@tanstack/ai-mcp/apps'

const options: McpAppCallHandlerOptions = {
  // Static server map (serverless-safe default)
  servers: {
    weather: { transport: { type: 'http', url: 'https://weather.example.com' } },
  },

  // Dynamic session store (opt-in for stateful transports) — wins over `servers`
  // store: inMemoryMcpSessionStore(),

  // Custom tool allowlist — default: server's own exposed tools only
  allowTool: (req) => req.toolName === 'get_weather',
}

// Returns: (req) => Promise<{ ok: true; result: unknown } | { ok: false; error: string }>
const handler = createMcpAppCallHandler(options)
```

### `inMemoryMcpSessionStore` (`@tanstack/ai-mcp/apps`)

```ts
import { inMemoryMcpSessionStore } from '@tanstack/ai-mcp/apps'

const store = inMemoryMcpSessionStore({
  ttlMs: 30 * 60_000, // optional; default: 30 minutes
})
```

### `createMcpAppBridge` (`@tanstack/ai-client`)

```ts
import { createMcpAppBridge } from '@tanstack/ai-client'
import type { CreateMcpAppBridgeOptions } from '@tanstack/ai-client'

const options: CreateMcpAppBridgeOptions = {
  threadId: 'weather-chat', // identifies the thread for the call handler
  callEndpoint: '/api/mcp-apps/call', // POST route mounting createMcpAppCallHandler
  chat: { sendMessage: async (text) => console.log(text) }, // prompt-intent path
  fetchImpl: fetch, // optional; injectable for testing
  onLink: (url) => window.open(url, '_blank'), // absent → link is BLOCKED
  onNotify: (payload) => console.log(payload),
  onIntent: (intent, payload) => console.log(intent, payload),
}

// Returns an McpAppBridge with callTool / sendPrompt / openLink methods.
const bridge = createMcpAppBridge(options)
```

### `MCPAppResource` (`@tanstack/ai-react/mcp-apps`)

```tsx
import { MCPAppResource } from '@tanstack/ai-react/mcp-apps'
// `part` is a UIResourcePart from the assistant message; `bridge` is a
// createMcpAppBridge result — both supplied by your component (see examples above).
import { part, bridge } from './chat-context'

const widget = (
  <MCPAppResource
    part={part} // UIResourcePart from the assistant message
    sandbox={{ url: new URL('https://sandbox.example.com') }} // AppRenderer iframe origin
    toolName="show_widget" // tool identifier forwarded to the renderer
    bridge={bridge} // omit for static, display-only rendering
    toolInput={{ city: 'Brooklyn' }} // optional tool input for the renderer context
  />
)
```

Preact: identical API from `@tanstack/ai-preact/mcp-apps` (requires `preact/compat` alias).
