---
title: Resumable Chat
id: resumable-chat
---

Use server persistence when the server should be authoritative for a chat
thread. The client may still keep local UI state, but the durable transcript,
run status, and replayable event log live behind `withPersistence(...)`.

By the end, your endpoint accepts `{ threadId, runId, cursor, resume }`, writes
each streamed chunk to durable storage, and lets the client resume after an
in-session disconnect. To recover after a full page reload, you will also store
and rehydrate the client's latest resume snapshot.

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

`withPersistence` loads the stored thread history, saves the resulting
transcript, records run status, and appends every public AG-UI event with a
cursor. When `cursor` is present, the run replays persisted events after that
cursor instead of re-running the adapter.

## Wire the client

The chat client forwards the resume fields through its connection adapter. Keep
a stable `threadId` per conversation so a reload returns to the same server
thread. In-session reconnects work from the client's tracked resume state; full
page reloads need you to persist and restore that state.

```tsx
import { useEffect, useMemo } from 'react'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import type {
  ChatPendingInterrupt,
  ChatResumeSnapshot,
  ChatResumeState,
} from '@tanstack/ai-client'

const threadId = 'thread-123'
const resumeKey = `tanstack-ai-resume:${threadId}`

function isResumeState(value: unknown): value is ChatResumeState {
  return (
    value !== null &&
    typeof value === 'object' &&
    'threadId' in value &&
    'runId' in value &&
    'cursor' in value &&
    typeof value.threadId === 'string' &&
    typeof value.runId === 'string' &&
    typeof value.cursor === 'string'
  )
}

function isPendingInterrupt(value: unknown): value is ChatPendingInterrupt {
  return (
    value !== null &&
    typeof value === 'object' &&
    'id' in value &&
    typeof value.id === 'string'
  )
}

function readResumeSnapshot(): ChatResumeSnapshot | undefined {
  const raw = window.localStorage.getItem(resumeKey)
  if (!raw) return undefined

  try {
    const value: unknown = JSON.parse(raw)
    if (
      value !== null &&
      typeof value === 'object' &&
      'resumeState' in value &&
      isResumeState(value.resumeState)
    ) {
      const pendingInterrupts =
        'pendingInterrupts' in value && Array.isArray(value.pendingInterrupts)
          ? value.pendingInterrupts.filter(isPendingInterrupt)
          : []

      return {
        resumeState: value.resumeState,
        pendingInterrupts,
      }
    }
  } catch {
    window.localStorage.removeItem(resumeKey)
  }

  return undefined
}

export function Chat() {
  const initialResumeSnapshot = useMemo(() => readResumeSnapshot(), [])
  const chat = useChat({
    threadId,
    connection: fetchServerSentEvents('/api/chat'),
    initialResumeSnapshot,
  })

  useEffect(() => {
    if (!chat.resumeState) {
      window.localStorage.removeItem(resumeKey)
      return
    }

    const snapshot: ChatResumeSnapshot = {
      resumeState: chat.resumeState,
      pendingInterrupts: chat.pendingInterrupts,
    }

    window.localStorage.setItem(resumeKey, JSON.stringify(snapshot))
  }, [chat.resumeState, chat.pendingInterrupts])

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
descriptors needed to answer pending user decisions. Persist them together and
pass them back as `initialResumeSnapshot` if you need full page reload recovery.
The server remains authoritative: the snapshot only tells the client which
durable run to reconnect to and which pending interrupts it can answer.

## Client message storage is separate

Client-side chat persistence stores rendered `UIMessage` history in
`localStorage`, IndexedDB, or another browser-side adapter. Server persistence
stores model messages, run records, and replayable public events. You can use
both, but they solve different problems. See [Chat Persistence](../chat/persistence)
for client-only message storage.

## Resume pending decisions

If the server finishes with `RUN_FINISHED.outcome.type === 'interrupt'`, the
thread has a pending user-actionable wait. Resolve those waits with
`chat.resumeInterrupts(...)`; the client forwards them as AG-UI
`RunAgentInput.resume[]` entries on the next request. If the page reloads
before the user answers, the `pendingInterrupts` in `initialResumeSnapshot`
restore the prompts the client needs to render and resume.

```ts
await chat.resumeInterrupts([
  {
    interruptId: 'interrupt-1',
    status: 'resolved',
    payload: { approved: true },
  },
])
```

For approval-specific UI and compatibility details, see
[Interrupts and Approvals](./interrupts-and-approvals).
