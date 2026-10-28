---
title: Runtime Context
id: runtime-context
order: 2
description: "Give your tools and middleware typed runtime values, such as the current user or a database client. The values never go to the model or into the AG-UI context."
keywords:
  - tanstack ai
  - runtime context
  - typed context
  - tools context
  - middleware context
  - ag-ui context
---

`runtimeContext` passes a user id, tenant, or database client into a tool. Those values stay out of the prompt.

Pass them as runtime context. Your tools and middleware read them from `ctx.context`, with full types. The model never sees them.

## Quick setup

### 1. Declare the context that the tool needs

Put the context type on `.server<TContext>()`. The tool reads the values from `ctx.context`:

```typescript
// lib/ai/tools.ts
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

export type AppContext = {
  userId: string
}

const notesByUser = new Map([['user_123', [{ title: 'Groceries' }]]])

export const listNotes = toolDefinition({
  name: 'list_notes',
  description: 'List notes for the current user',
  inputSchema: z.object({}),
  outputSchema: z.array(z.object({ title: z.string() })),
}).server<AppContext>(async (_input, ctx) => {
  return notesByUser.get(ctx.context.userId) ?? []
})
```

### 2. Pass the context to `chat()`

```typescript
// api/chat.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { listNotes } from '../lib/ai/tools'

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)

  // Replace this line with your auth check.
  const userId = request.headers.get('x-user-id') ?? 'user_123'

  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages,
    threadId,
    runId,
    tools: [listNotes],
    context: { userId },
  })

  return toServerSentEventsResponse(stream)
}
```

Ask "What are my notes?". The tool answers with the notes of the current user. If you remove `context`, TypeScript reports an error, because `listNotes` needs `userId`.

## How it works

The tools and middleware are the contract. The `context` value is what you supply at runtime.

- Each tool or middleware declares the context shape that it needs.
- `chat()` merges these needs and checks your `context` value against the result.
- The value goes only to your tools and middleware. It is not sent to the model.
- It is also not the AG-UI `RunAgentInput.context` field. See [AG-UI context](#ag-ui-context).

Declare the type in one of these places:

- `toolDefinition(...).server<TContext>(...)` for server tools.
- `toolDefinition(...).client<TContext>(...)` for client tools.
- `ChatMiddleware<TContext>` for middleware.

## Server Runtime Context

Middleware reads the same context. Give it the type with `ChatMiddleware<TContext>`:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import type { ChatMiddleware } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

type AppContext = {
  userId: string
  tenantId: string
}

const auditMiddleware: ChatMiddleware<AppContext> = {
  name: 'audit',
  onStart(ctx) {
    console.log('chat started', {
      requestId: ctx.requestId,
      userId: ctx.context.userId,
      tenantId: ctx.context.tenantId,
    })
  },
}

export async function POST(request: Request) {
  const { messages, threadId } = await chatParamsFromRequest(request)

  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages,
    threadId,
    middleware: [auditMiddleware],
    context: {
      userId: 'user_123',
      tenantId: 'tenant_456',
    },
  })

  return toServerSentEventsResponse(stream)
}
```

You can put any value in the context, for example a database client or an audit logger.

## Client Runtime Context

Client tools can have runtime context too. Pass it to `useChat`. It stays in the browser and is not sent to the server.

```tsx
import { toolDefinition } from '@tanstack/ai'
import { createChatClientOptions } from '@tanstack/ai-client'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

type ClientContext = {
  currentTabId: string
  toast(message: string): void
}

const notifyUser = toolDefinition({
  name: 'notify_user',
  description: 'Show a notification in the current browser tab',
}).client<ClientContext>((_input, ctx) => {
  ctx.context.toast(`Updated tab ${ctx.context.currentTabId}`)
  return { ok: true }
})

const chatOptions = createChatClientOptions({
  connection: fetchServerSentEvents('/api/chat'),
  threadId: 'support-chat',
  tools: [notifyUser],
  context: {
    currentTabId: 'settings',
    toast: (message) => window.alert(message),
  },
})

export function Chat() {
  const { sendMessage } = useChat(chatOptions)
  return <button onClick={() => sendMessage('Update my tab')}>Send</button>
}
```

Use client context for local values only. The server does not receive them.

## Client-to-Server Handoff

To send a value from the client to the server, use `forwardedProps`. On the server, validate it, then copy it into the server context.

On the client, put the value in `forwardedProps`. Unlike `context`, it goes to the server:

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

export function Chat() {
  const { sendMessage } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    threadId: 'support-chat',
    forwardedProps: {
      tenantId: 'tenant_456',
    },
  })

  return <button onClick={() => sendMessage('Hello')}>Send</button>
}
```

On the server, read `forwardedProps` and build the context:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

type AppContext = {
  userId: string
  tenantId: string
}

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)

  // Replace these lines with your auth check and your allowlist of tenants.
  const userId = 'user_123'
  const defaultTenantId = 'tenant_default'

  const tenantId =
    typeof params.forwardedProps.tenantId === 'string'
      ? params.forwardedProps.tenantId
      : defaultTenantId

  const context: AppContext = { userId, tenantId }

  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages: params.messages,
    threadId: params.threadId,
    context,
  })

  return toServerSentEventsResponse(stream)
}
```

> [!WARNING]
> The client controls `forwardedProps`. Validate and allowlist every field before you put it in the server context.

## Advanced

### How the type checks work

The tools and middleware decide what the context must contain. The `context` object alone does not decide this. In this call, the tool needs `UserContext` and the middleware needs `TenantContext`, so `context` must have both:

```typescript
import { chat, toolDefinition } from '@tanstack/ai'
import type { ChatMiddleware } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

type UserContext = { userId: string }
type TenantContext = { tenantId: string }

const currentUserTool = toolDefinition({
  name: 'current_user',
  description: 'Read the current user',
}).server<UserContext>((_input, ctx) => {
  return { userId: ctx.context.userId }
})

const tenantMiddleware: ChatMiddleware<TenantContext> = {
  name: 'tenant',
  onStart(ctx) {
    console.log(ctx.context.tenantId)
  },
}

const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages: [{ role: 'user', content: 'Who am I?' }],
  threadId: 'thread-1',
  tools: [currentUserTool],
  middleware: [tenantMiddleware],
  context: {
    userId: 'user_123',
    tenantId: 'tenant_456',
  },
})
```

If you remove `tenantId`, TypeScript reports an error, because `tenantMiddleware` needs it.

More rules:

- Untyped tools and middleware still work. They get `unknown` context and do not make `context` required.
- The inference also works for tools and middleware that you declare outside the `chat()` call and pass in as arrays.
- To make the context optional, declare `TContext | undefined`. When all typed consumers accept `undefined`, you can leave out `context`.
- If you pass a `context` value, it must satisfy every typed consumer.

### The same rules on the client

`useChat()` checks `context` against the client tools. This tool declares `ClientRuntimeContext & { mode: 'debug' }`, so `context` needs `currentTabId` and the literal `mode: 'debug'`:

```tsx
import { toolDefinition } from '@tanstack/ai'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

type ClientRuntimeContext = {
  currentTabId: string
}

const inspectClientContext = toolDefinition({
  name: 'inspect_client_context',
  description: 'Inspect local browser context',
}).client<ClientRuntimeContext & { mode: 'debug' }>((_input, ctx) => {
  return {
    tabId: ctx.context.currentTabId,
    mode: ctx.context.mode,
  }
})

export function DebugChat() {
  const { sendMessage } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    threadId: 'support-chat',
    tools: [inspectClientContext],
    context: {
      currentTabId: 'settings',
      mode: 'debug',
    },
  })

  return <button onClick={() => sendMessage('Inspect')}>Send</button>
}
```

### AG-UI Context

AG-UI defines its own `RunAgentInput.context` field. It holds context entries for agents at the protocol level. `chatParamsFromRequest` gives you this field as `params.aguiContext`. It is separate from `chat({ context })`.

TanStack AI does not copy `params.aguiContext` into the runtime context. To use these values, validate them and map them yourself:

```typescript ignore
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { buildRuntimeContextFrom } from './context'
import { serverTools } from './tools'

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)

  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages: params.messages,
    threadId: params.threadId,
    tools: serverTools,
    context: buildRuntimeContextFrom(params.aguiContext),
  })

  return toServerSentEventsResponse(stream)
}
```

`buildRuntimeContextFrom` is your own function. It reads the entries you trust and returns your context object.
