---
title: TanStack useChat with an AI SDK server
id: tanstack-client-ai-sdk-server
order: 4
description: "Point TanStack AI useChat at a Vercel AI SDK route. Wrap an AI SDK ChatTransport with fromChatTransport and pass it as the connection. Your AI SDK server does not change."
keywords:
  - tanstack ai
  - vercel ai sdk
  - useChat
  - streamText
  - ui message stream
  - fromChatTransport
  - tool approval
  - resumable streams
  - migration
---

Point TanStack AI `useChat` at a Vercel AI SDK route. Wrap an AI SDK `ChatTransport` with `fromChatTransport`, and pass it as the `connection`. Your `streamText` route does not change.

Use this page to move the client first. To move the server first, see [AI SDK useChat with a TanStack AI server](./ai-sdk-client-tanstack-server).

Against your AI SDK route, TanStack `useChat` gives you:

- Client persistence and resume after a reload, with no server code.
- A [message queue](../chat/queueing) while a reply streams.
- Client tools that the route reads from the request, with no copy on the route.
- Typed structured output, with partial objects while it streams.
- Typed approvals, TanStack devtools, and hooks for React, Solid, Vue, Svelte, Preact, Angular and more.

> [!WARNING]
> This bridge is a stop gap while you port. Some features change shape or are dropped on the way (see [AI SDK bridge compatibility](./ai-sdk-compatibility)). When the client works, port the route to `chat()` with the [migration guide](./migration-from-vercel-ai), then remove the bridge.

## 1. Install the packages

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-react @tanstack/ai-ui-message-stream ai
vue: @tanstack/ai-vue @tanstack/ai-ui-message-stream ai
solid: @tanstack/ai-solid @tanstack/ai-ui-message-stream ai
svelte: @tanstack/ai-svelte @tanstack/ai-ui-message-stream ai
preact: @tanstack/ai-preact @tanstack/ai-ui-message-stream ai
angular: @tanstack/ai-angular @tanstack/ai-ui-message-stream ai
octane: @tanstack/ai-octane @tanstack/ai-ui-message-stream ai octane
vanilla: @tanstack/ai-client @tanstack/ai-ui-message-stream ai

<!-- ::end:tabs -->

## 2. Connect useChat to the route

```tsx
import { useState } from 'react'
import { useChat } from '@tanstack/ai-react'
import { fromChatTransport } from '@tanstack/ai-ui-message-stream'
import { DefaultChatTransport } from 'ai'

const connection = fromChatTransport(
  new DefaultChatTransport({ api: '/api/chat' }),
)

export function Chat() {
  const [input, setInput] = useState('')
  const { messages, sendMessage } = useChat({
    connection,
    threadId: 'support-chat',
  })

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          {message.parts.map((part, idx) =>
            part.type === 'text' ? <span key={idx}>{part.content}</span> : null,
          )}
        </div>
      ))}
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button onClick={() => sendMessage(input)}>Send</button>
    </div>
  )
}
```

`DefaultChatTransport` sends the request and reads the stream, as it does for the AI SDK hook. Its options work the same, for example `headers`, `credentials` and `prepareSendMessagesRequest`. The `threadId` goes to the route as the chat `id`.

## 3. Keep the server

Your AI SDK route works as it is:

```typescript
import { openai } from '@ai-sdk/openai'
import { convertToModelMessages, streamText } from 'ai'

export async function POST(request: Request) {
  const { messages } = await request.json()

  const result = streamText({
    model: openai('gpt-6.1-sol'),
    messages: await convertToModelMessages(messages),
  })

  return result.toUIMessageStreamResponse()
}
```

## 4. Run client tools and approve tool calls

Define client tools on the client only. The connection sends their names, descriptions and JSON Schemas to the route in the request body. Read them on the route with `clientToolsFromAISDKBody`, together with the server tools:

```typescript
import { openai } from '@ai-sdk/openai'
import { clientToolsFromAISDKBody } from '@tanstack/ai-ui-message-stream'
import { convertToModelMessages, streamText, tool } from 'ai'
import { z } from 'zod'

const getWeather = tool({
  description: 'Get the weather for a city',
  inputSchema: z.object({ city: z.string() }),
  execute: async ({ city }) => ({ city, temperature: 72 }),
})

export async function POST(request: Request) {
  const body = await request.json()

  const result = streamText({
    model: openai('gpt-6.1-sol'),
    messages: await convertToModelMessages(body.messages),
    tools: clientToolsFromAISDKBody(body, { getWeather }),
  })

  return result.toUIMessageStreamResponse()
}
```

- A server tool wins when a client tool has the same name.
- A client tool has no `execute` on the route, so `streamText` stops at the call.
- Browser tools from [WebMCP](../tools/webmcp) reach the route the same way.

Pass the tools to `useChat`, and to `fromChatTransport` for approvals:

- **Client tool:** give it a `.client()` implementation. When the route stops at the call, the client runs the tool and sends the output back.
- **Tool approval:** a tool that needs approval on the route shows up in `interrupts`. Resolve it with `interrupt.resolveInterrupt(true)` or `false`. The answer goes back to the route, and `streamText` runs or skips the tool.

```tsx
import { toolDefinition } from '@tanstack/ai'
import { useChat } from '@tanstack/ai-react'
import { fromChatTransport } from '@tanstack/ai-ui-message-stream'
import { DefaultChatTransport } from 'ai'
import { z } from 'zod'

const getLocation = toolDefinition({
  name: 'getLocation',
  description: 'Get the location of the user',
  inputSchema: z.object({}),
}).client(() => ({ city: 'Sydney' }))

const bookFlight = toolDefinition({
  name: 'bookFlight',
  description: 'Book a flight',
  inputSchema: z.object({ to: z.string() }),
  needsApproval: true,
})

const tools = [getLocation, bookFlight] as const

const connection = fromChatTransport(
  new DefaultChatTransport({ api: '/api/chat' }),
  { tools },
)

export function Chat() {
  const { interrupts } = useChat({
    connection,
    threadId: 'support-chat',
    tools,
  })

  return interrupts.map((interrupt) =>
    interrupt.kind === 'tool-approval' ? (
      <button
        key={interrupt.id}
        onClick={() => interrupt.resolveInterrupt(true)}
      >
        Approve {interrupt.toolName}
      </button>
    ) : null,
  )
}
```

## 5. Get typed structured output

When the route streams an object with `Output.object`, pass the same schema to `useChat` and to `fromChatTransport`. The answer is a `structured-output` part, with partial objects while it streams and the checked `data` at the end:

```tsx
import { useChat } from '@tanstack/ai-react'
import { fromChatTransport } from '@tanstack/ai-ui-message-stream'
import { DefaultChatTransport } from 'ai'
import { z } from 'zod'

const recipe = z.object({ name: z.string(), steps: z.array(z.string()) })

const connection = fromChatTransport(
  new DefaultChatTransport({ api: '/api/recipe' }),
  { outputSchema: recipe },
)

export function Recipe() {
  const { messages } = useChat({
    connection,
    threadId: 'recipe',
    outputSchema: recipe,
  })

  return messages.flatMap((message) =>
    message.parts.map((part, i) =>
      part.type === 'structured-output' ? (
        <h2 key={i}>{part.partial?.name}</h2>
      ) : null,
    ),
  )
}
```

If the text is not valid JSON for the schema, the run ends with an error. All text of the reply counts as the answer, so a route that also writes text in a step that calls tools fails the check.

## 6. Load a saved chat

If your app saves AI SDK messages, convert them with `fromAISDKMessages` and pass them as `initialMessages`:

```tsx
import { useChat } from '@tanstack/ai-react'
import {
  fromAISDKMessages,
  fromChatTransport,
} from '@tanstack/ai-ui-message-stream'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'

const connection = fromChatTransport(
  new DefaultChatTransport({ api: '/api/chat' }),
)

export function SavedChat({ saved }: { saved: Array<UIMessage> }) {
  return useChat({
    connection,
    threadId: 'support-chat',
    initialMessages: fromAISDKMessages(saved),
  })
}
```

## 7. Show data parts as activity

A data part with an `id` (`writer.write({ type: 'data-weather', id, data })` on the route) arrives as an activity message of type `weather`. A new value for the same id replaces it. A transient data part, or one with no `id`, arrives as a custom event named `data-<name>`.

## 8. Resume a stream

A dropped connection needs nothing. The connection calls `reconnectToStream` on the transport, and the reply continues. It waits longer between tries that get no new data, as the TanStack HTTP connections do. To change the waits and the limit, pass `reconnect` to `fromChatTransport`, for example `{ maxAttempts: 10 }`.

To continue a reply after a page reload, add client persistence, and pass the `threadId` to `fromChatTransport`. The route must support the AI SDK resume `GET` (`/api/chat/<id>/stream`):

```tsx
import { localStoragePersistence, useChat } from '@tanstack/ai-react'
import { fromChatTransport } from '@tanstack/ai-ui-message-stream'
import { DefaultChatTransport } from 'ai'

const threadId = 'support-chat'

const connection = fromChatTransport(
  new DefaultChatTransport({ api: '/api/chat' }),
  { threadId },
)

export function useSupportChat() {
  return useChat({
    connection,
    threadId,
    persistence: localStoragePersistence(),
  })
}
```

Use one connection for each thread. The rejoin after a reload needs a transport that replays the reply from its start, as `DefaultChatTransport` does.

## What does not go through

- AG-UI shared state. The AI SDK has no state.
- Provider metadata on text parts, for example OpenAI item ids on text. TanStack keeps no metadata per text part.
- Sources, citations and generated files arrive as custom events, not as message parts.

For every event and message part, see [AI SDK bridge compatibility](./ai-sdk-compatibility).

## Done

TanStack `useChat` streams replies, runs tools, asks for approvals, and continues after a reload against your AI SDK route.
