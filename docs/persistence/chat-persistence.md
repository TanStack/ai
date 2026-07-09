---
title: Chat Persistence
id: chat-persistence
---

Use chat persistence when the server should be authoritative for a thread. The
client may keep local UI state, but the durable transcript, run status, and
pending user decisions live behind `withChatPersistence(...)`. This is **state
durability** — messages, runs, and interrupts. Delivery durability (replaying an
in-flight stream after a disconnect) is a separate transport concern; see
[Delivery Durability](./delivery-durability).

By the end, your endpoint accepts `{ threadId, runId, resume }`, persists chat
state at boundaries, and — paired with a delivery-durability sink — lets the
client reconnect to an in-progress response after a disconnect or reload.

## Install a backend

SQLite is the simplest durable backend for a Node server. The batteries-included
`sqlPersistence` ships Drizzle-generated migrations:

```sh
pnpm add @tanstack/ai-persistence @tanstack/ai-persistence-drizzle
```

## Create the server endpoint

Build the persistence instance once and reuse it across requests.

```ts
import {
  chat,
  memoryStream,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { withChatPersistence } from '@tanstack/ai-persistence'
import { sqlPersistence } from '@tanstack/ai-persistence-drizzle'

const persistence = sqlPersistence({
  dialect: 'sqlite',
  url: 'file:.tanstack-ai/state.sqlite',
  migrate: true,
})

export async function POST(request: Request) {
  const { messages, threadId, runId, resume } = await request.json()

  const stream = chat({
    threadId,
    runId,
    resume,
    adapter: anthropicText('claude-sonnet-4-6'),
    messages,
    middleware: [withChatPersistence(persistence)],
  })

  // State persists at boundaries; the durability sink makes the delivered
  // stream resumable (native Last-Event-ID reconnect / second-tab join).
  return toServerSentEventsResponse(stream, {
    durability: memoryStream(request),
  })
}
```

`withChatPersistence(...)` loads stored thread history, saves the resulting
transcript, and records run status and interrupts at run boundaries. `resume`
carries interrupt/approval decisions back into a paused run. Delivery resume is
handled entirely by the transport's durability sink — see
[Delivery Durability](./delivery-durability). For the state store contract, see
[Persistence Internals](./internals).

If the same app also uses `withGenerationPersistence`, keep **run IDs unique
across activities** — they may share a store and `threadId`, but not a
`runId`. See
[Persistence Overview](./overview#run-ids-must-be-unique-across-activities).

## Wire the client

The chat client forwards the resume fields through its connection adapter. Keep
a stable `threadId` per conversation so a reload returns to the same server
thread. Use `persistence.server` to store the client's latest resume snapshot
under that `threadId`.

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { localStorageAIPersistence } from '@tanstack/ai-client'

const threadId = 'thread-123'

export function Chat() {
  const chat = useChat({
    id: threadId,
    threadId,
    connection: fetchServerSentEvents('/api/chat'),
    persistence: {
      client: localStorageAIPersistence({
        keyPrefix: 'tanstack-ai:messages:',
      }),
      server: localStorageAIPersistence({
        keyPrefix: 'tanstack-ai:resume:',
      }),
    },
  })

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const form = event.currentTarget
        const input = new FormData(form).get('message')
        if (typeof input === 'string' && input.trim()) {
          chat.sendMessage({ content: input })
          form.reset()
        }
      }}
    >
      {chat.messages.map((message) => (
        <p key={message.id}>
          {message.parts.map((part, index) =>
            part.type === 'text' ? <span key={index}>{part.content}</span> : null,
          )}
        </p>
      ))}
      <input name="message" />
      <button disabled={chat.status === 'streaming'}>Send</button>
    </form>
  )
}
```

Delivery resume is transparent: the resumable SSE connection reattaches to an
in-flight run via the browser's native `Last-Event-ID` on reconnect, with no
client cursor state. There is no `resume()`/`autoResume` on `useChat` — see
[Delivery Durability](./delivery-durability).

`chat.resumeState` contains the active interrupt-resume identity
(`{ threadId, runId }`), or `null` when there is nothing to continue.
`chat.pendingInterrupts` contains the client-side descriptors needed to answer
pending user decisions, resolved with `chat.resumeInterrupts(...)`.
`persistence.server` stores them together and hydrates them on the next client
construction.

## Choose the controls you need

Use [Persistence Controls](./controls) when you want the decision table. For
chat, these are the common combinations:

| Goal | Controls |
| --- | --- |
| Browser-only drafts | `persistence.client` on the chat client. |
| Server-owned transcript | `stores.messages` and `features: ['messages']`. |
| Reconnect without re-running the model | A delivery-durability sink on the transport — see [Delivery Durability](./delivery-durability). |
| Pending approvals or human input | `interrupts`, which also requires the `stores.runs` and `stores.interrupts` stores. |
| Multi-worker resume safety | Add `stores.locks` when a backend supports it. |

## Resume pending decisions

If the server finishes with `RUN_FINISHED.outcome.type === 'interrupt'`, the
thread has a pending user-actionable wait. Resolve those waits with
`chat.resumeInterrupts(...)`; the client forwards them as AG-UI
`RunAgentInput.resume[]` entries on the next request.

```ts
import type { UseChatReturn } from '@tanstack/ai-react'

declare const chat: Pick<UseChatReturn, 'resumeInterrupts'>

await chat.resumeInterrupts([
  {
    interruptId: 'interrupt-1',
    status: 'resolved',
    payload: { approved: true },
  },
])
```

Normal new input on the same thread is rejected by default while pending
interrupts exist. That keeps the server from accidentally creating a second
conversation branch before the existing decision has been resolved or
cancelled.

Tool approvals are the common UI shape for interrupts. A tool with
`needsApproval: true` can pause the run, surface an approval request, and resume
after the user approves or denies it. For basic approval rendering without
server persistence, see [Tool Approval Flow](../tools/tool-approval).

## Keep client and server persistence separate

Client-side chat persistence stores rendered `UIMessage` history in
`localStorage`, IndexedDB, or another browser-side adapter. Server persistence
stores model messages, run records, interrupts, and replayable public events.
You can use both with `persistence: { client, server }`, but they solve
different problems.

For a narrow client-only page, see [Chat & Streaming Persistence](../chat/persistence).
