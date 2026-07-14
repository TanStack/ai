---
title: Chat Persistence
id: chat-persistence
---

# Chat Persistence

Server chat persistence makes messages, run status, and interrupts
authoritative beyond one request. Browser persistence can additionally hydrate
rendered UI state. SSE delivery durability is a third, independent concern.

## Persist state on the server

```ts
// app/api/chat/route.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { withChatPersistence } from '@tanstack/ai-persistence'
import { sqlitePersistence } from '@tanstack/ai-persistence-drizzle/sqlite'

const persistence = sqlitePersistence({
  url: 'file:.tanstack-ai/chat.sqlite',
  migrate: true,
})

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    ...(params.resume ? { resume: params.resume } : {}),
    middleware: [withChatPersistence(persistence)],
  })

  return toServerSentEventsResponse(stream)
}
```

There is no feature list. The middleware uses the stores that are present:

- `messages` loads and saves the full model-message thread;
- `runs` records running, completed, failed, or interrupted status;
- `interrupts` records pending user/tool waits and requires `runs`;
- `locks` is provided to other middleware for cross-worker coordination.

SQLite's `migrate: true` is convenient for local development. In production,
copy and apply the bundled migrations through your normal deployment workflow.

## Hydrate the React client

```tsx
import {
  indexedDBPersistence,
  sessionStoragePersistence,
} from '@tanstack/ai-client'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import type {
  ChatResumeSnapshot,
  UIMessage,
} from '@tanstack/ai-client'

function serializeJson(value: unknown): string {
  const stringify: (input: unknown) => unknown = JSON.stringify
  const serialized = stringify(value)
  if (typeof serialized !== 'string') {
    throw new TypeError('The value is not JSON serializable.')
  }
  return serialized
}

const resumeStorage = sessionStoragePersistence<ChatResumeSnapshot>({
  keyPrefix: 'my-app:chat-resume:',
  serialize: serializeJson,
  deserialize: JSON.parse,
})

export function Chat() {
  const chat = useChat({
    id: 'support-chat',
    threadId: 'support-thread',
    connection: fetchServerSentEvents('/api/chat'),
    persistence: {
      client: indexedDBPersistence<Array<UIMessage>>(),
      server: resumeStorage,
    },
  })

  return (
    <main>
      {chat.messages.map((message) => (
        <p key={message.id}>
          {message.parts.map((part, index) =>
            part.type === 'text' ? (
              <span key={index}>{part.content}</span>
            ) : null,
          )}
        </p>
      ))}

      {chat.pendingInterrupts.map((interrupt) => (
        <div key={interrupt.id}>
          <span>{interrupt.reason}</span>
          <button
            onClick={() =>
              void chat.resumeInterrupts([
                {
                  interruptId: interrupt.id,
                  status: 'resolved',
                  payload: { approved: true },
                },
              ])
            }
          >
            Continue
          </button>
          <button
            onClick={() =>
              void chat.resumeInterrupts([
                { interruptId: interrupt.id, status: 'cancelled' },
              ])
            }
          >
            Cancel
          </button>
        </div>
      ))}
    </main>
  )
}
```

The client message adapter is keyed by `id`; the resume snapshot adapter is
keyed by `threadId`. Keep both stable. IndexedDB preserves `Date` values through
structured clone. Web Storage uses JSON and needs a codec for values that are
not JSON-safe.

## Resume semantics

When a run ends with an interrupt outcome, `useChat` records its
`resumeState` and `pendingInterrupts`. A later `resumeInterrupts(...)` call
sends typed `RunAgentResumeItem` entries. The server verifies that every entry
matches a pending interrupt before resolving or cancelling stored records.

Normal messages on that thread are rejected until pending interrupts are
handled. This prevents accidental conversation forks.

## Add delivery durability separately

To reconnect to an in-flight SSE response, add a `StreamDurability` adapter to
the response:

```ts ignore
import { durableStream } from '@tanstack/ai-durable-stream'

declare function getDurableStreamsToken(): Promise<string>

const durableOptions = {
  server: 'https://streams.example.com',
  headers: async () => ({
    Authorization: `Bearer ${await getDurableStreamsToken()}`,
  }),
}

return toServerSentEventsResponse(stream, {
  durability: { adapter: durableStream(request, durableOptions) },
})
```

This affects transport replay only. State middleware still owns messages,
runs, and interrupts. The SSE adapter owns opaque event offsets; neither
`UIMessage` nor server persistence records carry stream delivery offsets. See
[Delivery Durability](./delivery-durability).

## Clear and retention

`chat.clear()` clears browser state. It does not delete authoritative server
records. Server-side deletion, archival, and tenant retention policies belong
in your application and backend stores.
