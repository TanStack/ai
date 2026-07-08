---
title: Chat Persistence
id: chat-persistence
---

Use chat persistence when the server should be authoritative for a thread. The
client may keep local UI state, but the durable transcript, run status,
replayable event log, and pending user decisions live behind
`withPersistence(...)`.

By the end, your endpoint accepts `{ threadId, runId, cursor, resume }`, writes
streamed chunks to durable storage, and lets the client resume after an
in-session disconnect or full page reload.

## Install a backend

SQLite is the simplest durable backend for a Node server:

```sh
pnpm add @tanstack/ai-persistence @tanstack/ai-persistence-sqlite
```

## Create the server endpoint

Build the persistence instance once and reuse it across requests.

```ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { withPersistence } from '@tanstack/ai-persistence'
import { sqlitePersistence } from '@tanstack/ai-persistence-sqlite'

const persistence = sqlitePersistence({
  path: '.tanstack-ai/state.sqlite',
  migrate: true,
})

export async function POST(request: Request) {
  const { messages, threadId, runId, cursor, resume } = await request.json()

  const stream = chat({
    threadId,
    runId,
    cursor,
    resume,
    adapter: anthropicText('claude-sonnet-4-6'),
    messages,
    middleware: [withPersistence(persistence)],
  })

  return toServerSentEventsResponse(stream)
}
```

`withPersistence(...)` loads stored thread history, saves the resulting
transcript, records run status, and appends every public AG-UI event with an
opaque cursor. When `cursor` is present, the run replays persisted events after
that cursor instead of re-running the adapter. For the exact event log and
cursor validation rules, see [Persistence Internals](./internals).

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

Auto-resume is enabled by default. On mount, reconnect, or when the tab comes
back online, the client can continue an interrupted run by forwarding the last
known `{ threadId, runId, cursor }`. Opt out with `autoResume: false`, or call
`chat.resume()` when you want a manual retry button.

`chat.resumeState` contains the active resume identity, or `null` when there is
nothing to continue. `chat.pendingInterrupts` contains the client-side
descriptors needed to answer pending user decisions. `persistence.server`
stores them together and hydrates them on the next client construction.

## Choose the controls you need

Use [Persistence Controls](./controls) when you want the decision table. For
chat, these are the common combinations:

| Goal | Controls |
| --- | --- |
| Browser-only drafts | `persistence.client` on the chat client. |
| Server-owned transcript | `stores.messages` and `features: ['messages']`. |
| Reconnect without re-running the model | `stores.runs`, `stores.publicEvents`, and `durable-replay`. |
| Pending approvals or human input | `interrupts`, which also requires run and public-event stores. |
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
