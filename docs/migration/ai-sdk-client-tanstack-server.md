---
title: AI SDK useChat with a TanStack AI server
id: ai-sdk-client-tanstack-server
order: 3
description: "Serve the Vercel AI SDK useChat hook from TanStack AI chat(). Read the request with chatParamsFromAISDKRequest and convert the reply with toUIMessageStream, or keep a plain TanStack route and convert in the browser with toChatTransport. Your AI SDK UI does not change."
keywords:
  - tanstack ai
  - vercel ai sdk
  - useChat
  - ai elements
  - ui message stream
  - toUIMessageStream
  - toChatTransport
  - tool approval
  - resumable streams
  - migration
---

Serve the AI SDK `useChat` hook from TanStack AI `chat()`. Read the request with `chatParamsFromAISDKRequest`, and convert the reply with `toUIMessageStream`. Your AI SDK client code, AI Elements included, does not change.

Use this page to move the server first. To keep a plain TanStack route and convert in the browser, see [Bridge in the browser](#bridge-in-the-browser). To move the client first, see [TanStack useChat with an AI SDK server](./tanstack-client-ai-sdk-server).

> [!WARNING]
> This bridge is a stop gap while you port. Some features change shape or are dropped on the way (see [AI SDK bridge compatibility](./ai-sdk-compatibility)). When the server works, port the client to TanStack `useChat` with the [migration guide](./migration-from-vercel-ai), then remove the bridge.

## 1. Install the packages

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-client @tanstack/ai-ui-message-stream @tanstack/ai-openai
vue: @tanstack/ai @tanstack/ai-client @tanstack/ai-ui-message-stream @tanstack/ai-openai
solid: @tanstack/ai @tanstack/ai-client @tanstack/ai-ui-message-stream @tanstack/ai-openai
svelte: @tanstack/ai @tanstack/ai-client @tanstack/ai-ui-message-stream @tanstack/ai-openai
preact: @tanstack/ai @tanstack/ai-client @tanstack/ai-ui-message-stream @tanstack/ai-openai
angular: @tanstack/ai @tanstack/ai-client @tanstack/ai-ui-message-stream @tanstack/ai-openai
octane: @tanstack/ai @tanstack/ai-client @tanstack/ai-ui-message-stream @tanstack/ai-openai
vanilla: @tanstack/ai @tanstack/ai-client @tanstack/ai-ui-message-stream @tanstack/ai-openai

<!-- ::end:tabs -->

Keep the `ai` package. The server uses its response helper, and your client still uses `useChat`.

## 2. Replace the server route

```typescript
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import {
  chatParamsFromAISDKRequest,
  toUIMessageStream,
} from '@tanstack/ai-ui-message-stream'
import { createUIMessageStreamResponse } from 'ai'

export async function POST(request: Request) {
  const params = await chatParamsFromAISDKRequest(request)

  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    ...params,
  })

  return createUIMessageStreamResponse({ stream: toUIMessageStream(stream) })
}
```

What each call does:

- `chatParamsFromAISDKRequest` reads the body that `useChat` sends. It returns the `threadId` (the chat id), the `messages`, and the answers to tool approvals. If the body is not valid, it throws a `Response` with status 400. An approval answer must come with the paused run id that `toUIMessageStream` put in the message metadata.
- `toUIMessageStream` converts the events of `chat()` into the AI SDK UI message stream. A `chat()` error reaches `useChat` as its `error`. When the client goes away, the run stops.

## 3. Keep the client

The client from your AI SDK app works as it is:

```tsx
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'

export function Chat() {
  const { messages, sendMessage } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
  })

  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}>
          {m.parts.map((p, i) => (p.type === 'text' ? <span key={i}>{p.text}</span> : null))}
        </div>
      ))}
      <button onClick={() => sendMessage({ text: 'Hello' })}>Send</button>
    </div>
  )
}
```

## 4. Add tools

Server tools run in `chat()`. The client shows each call as a `tool-<name>` part with its input and output.

- **Client tool:** a tool definition with no `.server()` implementation. `chat()` stops at the call, and the AI SDK client runs it in `onToolCall`.
- **Tool approval:** set `needsApproval: true`. `chat()` stops before the tool runs, and the client shows the part in the `approval-requested` state.

```typescript
import { chat, toolDefinition } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import {
  chatParamsFromAISDKRequest,
  toUIMessageStream,
} from '@tanstack/ai-ui-message-stream'
import { createUIMessageStreamResponse } from 'ai'
import { z } from 'zod'

const getWeather = toolDefinition({
  name: 'getWeather',
  description: 'Get the weather for a city',
  inputSchema: z.object({ city: z.string() }),
}).server(({ city }) => ({ city, temperature: 72 }))

const bookFlight = toolDefinition({
  name: 'bookFlight',
  description: 'Book a flight',
  inputSchema: z.object({ to: z.string() }),
  needsApproval: true,
}).server(({ to }) => ({ booked: to }))

export async function POST(request: Request) {
  const params = await chatParamsFromAISDKRequest(request)

  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    tools: [getWeather, bookFlight],
    ...params,
  })

  return createUIMessageStreamResponse({ stream: toUIMessageStream(stream) })
}
```

On the client, answer the approval with `addToolApprovalResponse`. Then `sendAutomaticallyWhen` sends the answer to the server, and `chat()` runs or skips the tool.

The server keeps the id of the paused run in the message metadata, under `tanstack.runId`. If you validate metadata with `messageMetadataSchema`, allow that key.

```tsx
import { useChat } from '@ai-sdk/react'
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from 'ai'

export function Chat() {
  const { messages, addToolApprovalResponse } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  })

  return messages.map((m) =>
    m.parts.map((part) =>
      part.type === 'tool-bookFlight' && part.state === 'approval-requested' ? (
        <button
          key={part.toolCallId}
          onClick={() =>
            addToolApprovalResponse({ id: part.approval.id, approved: true })
          }
        >
          Book the flight
        </button>
      ) : null,
    ),
  )
}
```

## 5. Show activity, state and subagents

`toUIMessageStream` sends each of these as a data part. The client replaces a data part in place when it gets a new value for the same id.

- **Activity:** a `data-<activityType>` part with the activity id.
- **Shared state:** a `data-state` part with the full state.
- **Subagent:** a `data-subagent` part per child, with its name, status and text. Its data has the type `SubagentData`.

Type the data parts on `useChat` to read them:

```tsx
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { SubagentData } from '@tanstack/ai-ui-message-stream'
import type { UIMessage } from 'ai'

type ChatMessage = UIMessage<unknown, { subagent: SubagentData }>

export function Subagents() {
  const { messages } = useChat<ChatMessage>({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
  })

  return messages.flatMap((m) =>
    m.parts.map((part) =>
      part.type === 'data-subagent' ? (
        <p key={part.id}>
          {part.data.name}: {part.data.status}
        </p>
      ) : null,
    ),
  )
}
```

The AI SDK client does not send state back. A change to the state on the client does not reach `chat()`.

## 6. Resume a stream after a reload

AI SDK `useChat({ resume: true })` asks `GET /api/chat/<id>/stream` for the active run when the page loads. To answer it, record each run in a durability log, and keep a record of the active run of each chat. This example uses the runs store of [`@tanstack/ai-persistence`](../persistence/overview):

```typescript
import { chat, memoryStream } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { withPersistence } from '@tanstack/ai-persistence'
import {
  chatParamsFromAISDKRequest,
  resumeUIMessageStreamResponse,
  toResumableUIMessageStreamResponse,
} from '@tanstack/ai-ui-message-stream'
import { persistence } from './persistence'

// POST /api/chat
export async function POST(request: Request) {
  const params = await chatParamsFromAISDKRequest(request)
  const runId = crypto.randomUUID()

  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    runId,
    middleware: [withPersistence(persistence)],
    ...params,
  })

  return toResumableUIMessageStreamResponse(stream, memoryStream({ runId }))
}

// GET /api/chat/:id/stream
export async function GET(request: Request) {
  const chatId = new URL(request.url).pathname.split('/').at(-2) ?? ''
  const run = await persistence.stores.runs.findActiveRun(chatId)
  return resumeUIMessageStreamResponse(run && memoryStream({ runId: run.runId }))
}
```

- `toResumableUIMessageStreamResponse` writes the run to the log. The run continues when the client goes away.
- `resumeUIMessageStreamResponse` replays the run from its start. With no active run, it returns 204, and the client does nothing.
- `memoryStream` keeps the log in the memory of one process. For more than one server, use [`@tanstack/ai-durable-stream`](../resumable-streams/overview).

## Bridge in the browser

Pass `toChatTransport(fetchServerSentEvents('/api/chat'))` as the `transport` of AI SDK `useChat`. The route is a plain TanStack route, with no AI SDK code. The conversion runs in the browser.

1. Serve `chat()` as for TanStack `useChat`:

   ```typescript
   import {
     chat,
     chatParamsFromRequest,
     toServerSentEventsResponse,
   } from '@tanstack/ai'
   import { openaiText } from '@tanstack/ai-openai'

   export async function POST(request: Request) {
     const params = await chatParamsFromRequest(request)

     return toServerSentEventsResponse(
       chat({ ...params, adapter: openaiText('gpt-6.1-sol') }),
     )
   }
   ```

2. Give `useChat` the transport:

   ```tsx
   import { useChat } from '@ai-sdk/react'
   import { fetchServerSentEvents } from '@tanstack/ai-client'
   import { toChatTransport } from '@tanstack/ai-ui-message-stream'

   const transport = toChatTransport(fetchServerSentEvents('/api/chat'))

   export function Chat() {
     const { messages, sendMessage } = useChat({ transport })

     return (
       <div>
         {messages.map((m) => (
           <div key={m.id}>
             {m.parts.map((p, i) =>
               p.type === 'text' ? <span key={i}>{p.text}</span> : null,
             )}
           </div>
         ))}
         <button onClick={() => sendMessage({ text: 'Hello' })}>Send</button>
       </div>
     )
   }
   ```

Tools, approvals and client tools work as in [Add tools](#4-add-tools). An approval answer resumes the paused run. If the answer has no paused run id in the message metadata, `sendMessages` throws. `resumeStream()` rejoins the last run of the chat in the same page, when the connection has `joinRun` and the route keeps a durability log.

## What does not go through

- A change to shared state on the client. The AI SDK client does not send state.
- The `reason` text of an approval answer.
- A `stop()` on the client, with `toResumableUIMessageStreamResponse`. It stops the reading, not the run. To stop the run, pass an `abortController` to `chat()`.

For every event and message part, see [AI SDK bridge compatibility](./ai-sdk-compatibility).

## Done

Your AI SDK `useChat` UI streams replies, tools, approvals, activity and subagents from `chat()`, and it continues a reply after a reload.
