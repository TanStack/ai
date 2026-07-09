---
title: Persistence Controls
id: controls
---

Use persistence controls to choose how much durability a run needs. Start with
the lowest lever that satisfies the user experience, then add stores only when a
feature would otherwise lose data.

By the end, you can map a product requirement such as "resume after refresh" or
"store generated media" to the client option, middleware feature, and
`AIPersistence` stores it needs.

## Lever 1: no persistence

Use no persistence when a run can disappear after the request ends.

```ts
import { chat } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'

chat({
  adapter: anthropicText('claude-sonnet-4-6'),
  messages: [{ role: 'user', content: 'Draft a release note.' }],
})
```

There is no server transcript and no durable run record. This is enough for
one-shot server work, tests, or prototypes where reload recovery does not
matter.

## Lever 2: client snapshots

Use client persistence when the browser should remember local UI state or the
latest server resume identity.

```tsx
import { localStorageAIPersistence } from '@tanstack/ai-client'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

const chat = useChat({
  id: 'thread-123',
  threadId: 'thread-123',
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
```

`persistence.client` stores rendered UI messages. `persistence.server` stores
the lightweight server resume snapshot: `{ threadId, runId }`, pending interrupt
descriptors, status, and errors. The snapshot is not the source of truth for a
server-authoritative transcript; it only lets the client restore pending
interrupts after a full reload.

## Lever 3: server messages

Use message persistence when the server owns the chat transcript instead of
trusting the browser to send the whole history.

```ts
import { defineAIPersistence, withChatPersistence } from '@tanstack/ai-persistence'
import type { MessageStore } from '@tanstack/ai-persistence'
import type { ModelMessage } from '@tanstack/ai'

declare const db: {
  loadMessages: (threadId: string) => Promise<Array<ModelMessage>>
  replaceMessages: (
    threadId: string,
    messages: Array<ModelMessage>,
  ) => Promise<void>
}

const messages: MessageStore = {
  loadThread: (threadId) => db.loadMessages(threadId),
  saveThread: (threadId, nextMessages: Array<ModelMessage>) =>
    db.replaceMessages(threadId, nextMessages),
}

const persistence = defineAIPersistence({
  stores: { messages },
})

const middleware = withChatPersistence(persistence, {
  features: ['messages'],
})
```

`stores.messages` is enough for server-owned history. It does not make the
delivered stream resumable after a disconnect — that is **delivery durability**,
a transport concern handled by a durability sink on `toServerSentEvents(...)`,
not a persistence store. See [Delivery Durability](./delivery-durability).

## Lever 4: interrupts and approvals

Use interrupt persistence when a run can pause for a user decision and resume
later.

```ts
import { withChatPersistence } from '@tanstack/ai-persistence'
import { sqlPersistence } from '@tanstack/ai-persistence-drizzle'

const persistence = sqlPersistence({
  dialect: 'sqlite',
  url: 'file:.tanstack-ai/state.sqlite',
  migrate: true,
})

export const middleware = withChatPersistence(persistence, {
  features: ['interrupts'],
})
```

The `interrupts` feature requires `stores.runs` and `stores.interrupts`. A
pending wait is surfaced on the stream, then the client resumes the same run
with AG-UI `resume[]` entries.

```ts
import type { UseChatReturn } from '@tanstack/ai-react'

declare const chat: Pick<UseChatReturn, 'resumeInterrupts'>

await chat.resumeInterrupts([
  {
    interruptId: 'send-email-approval',
    status: 'resolved',
    payload: { approved: true },
  },
])
```

Approval UIs are one common presentation of interrupts. New durable flows should
treat the interrupt outcome and `resume[]` payload as the source of truth.

## Lever 5: extension stores

Use extension stores when persistence must support integrations beyond the
basic message/interrupt path.

| Store | Use it for |
| --- | --- |
| `stores.metadata` | App-owned session ids, manifests, correlation state, and pointers. |
| `stores.locks` | Cross-worker coordination for the same thread, sandbox, or workflow. |
| `stores.artifacts` | Named outputs tied to a run and thread. |
| `stores.blobs` | Raw object bytes used by artifacts or app-owned indexes. |

Artifacts require both `stores.artifacts` and `stores.blobs` for generated
media and file storage. If you pass a manual feature list, include both
`'artifacts'` and `'blobs'` so metadata and bytes stay paired.

```ts
import { withChatPersistence } from '@tanstack/ai-persistence'
import { sqlPersistence } from '@tanstack/ai-persistence-drizzle'

const persistence = sqlPersistence({
  dialect: 'sqlite',
  url: 'file:.tanstack-ai/state.sqlite',
  migrate: true,
})

export const middleware = withChatPersistence(persistence, {
  features: ['messages', 'metadata', 'locks', 'artifacts', 'blobs'],
})
```

If `features` is omitted, `withChatPersistence(...)` and
`withGenerationPersistence(...)` enable the features supported by the stores
present on the `AIPersistence` object. Pass `features` when you want fail-loud
validation for a required capability.

For exact store method contracts and resume invariants behind these controls,
see [Persistence Internals](./internals).
