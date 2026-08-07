---
title: MCP Apps
id: mcp-apps
order: 12
description: "Render MCP ui:// widgets — static UIResourcePart and interactive bridge + call handler."
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

If an MCP tool returns a `ui://` resource → TanStack AI surfaces a `UIResourcePart` you render with `MCPAppResource`.

| Level | What you get |
| --- | --- |
| **Static** | Display-only widget on the assistant message — no extra routes |
| **Interactive** | Iframe can call tools / send prompts — needs call handler + bridge |

## Static widgets

MCP tool result with `ui://` → `UIResourcePart` on the assistant message **alongside** `ToolResultPart` (never model input). Fail-soft: failed resource read still delivers the tool result without a widget.

### Part shape

```ts
import type { UIResourcePart } from '@tanstack/ai'

// type: 'ui-resource'
// resource: { uri; mimeType; text?; blob? }
// serverId?: string   // pool key — interactive routing
// toolCallId: string
// toolName: string
// meta?: Record<string, unknown>
```

### Server route

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

### React — render static

```bash
pnpm add @mcp-ui/client
```

> **`sandbox.url`:** your hosted sandbox-proxy HTML page (security boundary — deploy-time constant). Not the widget URL; widget HTML comes from `part.resource`. See [`@mcp-ui/client`](https://mcpui.dev).

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

Without `bridge`, interactions that trigger tool calls/prompts are ignored.

> **Frameworks:** React + Preact (`@tanstack/ai-react/mcp-apps`, `@tanstack/ai-preact/mcp-apps` + `preact/compat`). Solid/Vue/Svelte/Angular deferred — `AppRenderer` is React-only.

## Interactive widgets

1. **Server:** `createMcpAppCallHandler` on a POST route
2. **Client:** `useMcpAppBridge` / `createMcpAppBridge` → pass as `bridge` to `MCPAppResource`

### Install

```bash
pnpm add @tanstack/ai-mcp @tanstack/ai-client @mcp-ui/client
```

### Call handler route

Handler reconnects per call from transport descriptors (`getInfo()` / `getServers()`) — serverless-safe. Always allowlists tools the server actually exposes.

```ts ignore
// src/routes/api.mcp-apps-call.ts
import { createFileRoute } from '@tanstack/react-router'
import { createMCPClients } from '@tanstack/ai-mcp'
import { createMcpAppCallHandler } from '@tanstack/ai-mcp/apps'

const mcp = await createMCPClients({
  weather: {
    transport: {
      type: 'http',
      url: process.env.WEATHER_MCP_URL!,
      headers: { Authorization: `Bearer ${process.env.WEATHER_MCP_TOKEN ?? ''}` },
    },
  },
})

const handler = createMcpAppCallHandler({ clients: mcp })

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

> **`link` actions:** need bridge `onLink` or links are dropped (warned). Even with `onLink`, only `http:`, `https:`, `mailto:` are forwarded — unsafe schemes rejected before your handler.

**Extra allowlist** (AND-ed with server exposure check):

```ts
import { createMCPClients } from '@tanstack/ai-mcp'
import { createMcpAppCallHandler } from '@tanstack/ai-mcp/apps'

const mcp = await createMCPClients({
  weather: { transport: { type: 'http', url: process.env.MCP_URL ?? '' } },
})

const handler = createMcpAppCallHandler({
  clients: mcp,
  allowTool: (req) => req.toolName === 'place_order',
})
```

### Chat route — match `serverId`

`serverId` on `UIResourcePart` = client/pool `prefix` (defaults to config key). Keep the same key in the call handler pool:

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

> Multiple servers: give each interactive server a distinct prefix. `prefix: ''` means no `serverId` → no interactive calls.

### Client — bridge + render

Bridge routes:

- `tool` → POST `callEndpoint`
- `prompt` → `chat.sendMessage`
- `link` → `onLink` if provided

```tsx
// src/components/Chat.tsx
import { useChat, useMcpAppBridge } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'
import { MCPAppResource } from '@tanstack/ai-react/mcp-apps'

export function Chat() {
  const threadId = 'weather-chat'
  const { messages, sendMessage, status } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  const bridge = useMcpAppBridge({
    threadId,
    callEndpoint: '/api/mcp-apps/call',
    chat: { sendMessage: async (content) => void sendMessage({ content }) },
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

> Widget tool calls do **not** append to chat history by default (client-side writeback out of scope).

## Session persistence

Default: reconnect-per-call. For stateful transports, opt into in-memory store:

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

> `inMemoryMcpSessionStore` is single-process only. Swap via `McpSessionStore` for durable backends.

## API reference

### `createMcpAppCallHandler` (`@tanstack/ai-mcp/apps`)

```ts
import { createMCPClients } from '@tanstack/ai-mcp'
import { createMcpAppCallHandler } from '@tanstack/ai-mcp/apps'
import type { McpAppCallHandlerOptions } from '@tanstack/ai-mcp/apps'

const mcp = await createMCPClients({
  weather: { transport: { type: 'http', url: process.env.MCP_URL ?? '' } },
})

const options: McpAppCallHandlerOptions = {
  clients: mcp, // MCPClient | MCPClients pool | array
  // store: inMemoryMcpSessionStore(),
  allowTool: (req) => req.toolName === 'get_weather',
}

const handler = createMcpAppCallHandler(options)
// (req) => Promise<{ ok: true; result } | { ok: false; error: string }>
```

### `inMemoryMcpSessionStore`

```ts
import { inMemoryMcpSessionStore } from '@tanstack/ai-mcp/apps'

const store = inMemoryMcpSessionStore({
  ttlMs: 30 * 60_000, // default 30 min
})
```

### `createMcpAppBridge` (`@tanstack/ai-client`)

```ts
import { createMcpAppBridge } from '@tanstack/ai-client'
import type { CreateMcpAppBridgeOptions } from '@tanstack/ai-client'

const options: CreateMcpAppBridgeOptions = {
  threadId: 'weather-chat',
  callEndpoint: '/api/mcp-apps/call',
  chat: { sendMessage: async (text) => console.log(text) },
  fetchImpl: fetch,
  onLink: (url) => window.open(url, '_blank'),
}

const bridge = createMcpAppBridge(options)
```

### `useMcpAppBridge` (React / Preact)

Stable bridge for `threadId`/`callEndpoint`; always uses latest `sendMessage`/`onLink`:

```tsx
import { useChat, useMcpAppBridge } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'

function useBridge(threadId: string) {
  const { sendMessage } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })
  return useMcpAppBridge({
    threadId,
    callEndpoint: '/api/mcp-apps/call',
    chat: { sendMessage: async (content) => void sendMessage({ content }) },
    onLink: (url) => window.open(url, '_blank', 'noopener'),
  })
}
```

### `MCPAppResource` (`@tanstack/ai-react/mcp-apps`)

```tsx
import { MCPAppResource } from '@tanstack/ai-react/mcp-apps'
import { part, bridge } from './chat-context'

const widget = (
  <MCPAppResource
    part={part}
    sandbox={{ url: new URL('https://your-app.example.com/mcp-sandbox.html') }}
    bridge={bridge} // omit for static
    toolInput={{ city: 'Brooklyn' }}
  />
)
```

Preact: same API from `@tanstack/ai-preact/mcp-apps` (`preact/compat` required).
