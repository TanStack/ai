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

There is no resume cursor, no server transcript, and no durable run record. This
is enough for one-shot server work, tests, or prototypes where reload recovery
does not matter.

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
the lightweight server resume snapshot: `{ threadId, runId, cursor }`, pending
interrupt descriptors, status, and errors. The snapshot is not the source of
truth for a server-authoritative transcript; it only lets the client reconnect
to durable server state.

## Lever 3: server messages

Use message persistence when the server owns the chat transcript instead of
trusting the browser to send the whole history.

```ts
import { defineAIPersistence, withPersistence } from '@tanstack/ai-persistence'
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

const middleware = withPersistence(persistence, {
  features: ['messages'],
})
```

`stores.messages` is enough for server-owned history. It does not provide replay
after a disconnected stream; add lever 4 when reconnects must continue the same
run without re-calling the model.

## Lever 4: durable replay

Use durable replay when reconnects should replay persisted public AG-UI events
after the last cursor.

```ts
import { withPersistence } from '@tanstack/ai-persistence'
import { postgresPersistence } from '@tanstack/ai-persistence-postgres'

const persistence = postgresPersistence({
  connectionString: process.env.DATABASE_URL ?? '',
})

export const middleware = withPersistence(persistence, {
  features: ['messages', 'durable-replay'],
})
```

Durable replay requires `stores.runs` and `stores.publicEvents`. `runs` tracks
run status, usage, and errors. `publicEvents` appends the user-visible stream
events and returns opaque cursors. Store the cursor and pass it back; never
derive meaning from its format.

## Lever 5: interrupts and approvals

Use interrupt persistence when a run can pause for a user decision and resume
later.

```ts
import { withPersistence } from '@tanstack/ai-persistence'
import { sqlitePersistence } from '@tanstack/ai-persistence-sqlite'

const persistence = sqlitePersistence({
  path: '.tanstack-ai/state.sqlite',
  migrate: true,
})

export const middleware = withPersistence(persistence, {
  features: ['interrupts'],
})
```

The `interrupts` feature requires `stores.runs`, `stores.publicEvents`, and
`stores.interrupts`. A pending wait is surfaced through the public stream, then
the client resumes the same run with AG-UI `resume[]` entries.

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

## Lever 6: extension stores

Use extension stores when persistence must support integrations beyond the
basic chat replay path.

| Store | Use it for |
| --- | --- |
| `stores.internalEvents` | Private checkpoints that must not replay to users. |
| `stores.metadata` | App-owned session ids, manifests, correlation state, and pointers. |
| `stores.locks` | Cross-worker coordination for the same thread, sandbox, or workflow. |
| `stores.artifacts` | Named outputs tied to a run and thread. |
| `stores.blobs` | Raw object bytes used by artifacts or app-owned indexes. |

Artifacts require both `stores.artifacts` and `stores.blobs` for generated
media and file storage. If you pass a manual feature list, include both
`'artifacts'` and `'blobs'` so metadata and bytes stay paired.

```ts
import { withPersistence } from '@tanstack/ai-persistence'
import { cloudflarePersistence } from '@tanstack/ai-persistence-cloudflare'

declare const env: {
  AI_D1: D1Database
  AI_BLOBS: R2Bucket
  AI_LOCKS: DurableObjectNamespace
}

const persistence = cloudflarePersistence({
  d1: env.AI_D1,
  r2: env.AI_BLOBS,
  durableObjects: env.AI_LOCKS,
})

export const middleware = withPersistence(persistence, {
  features: [
    'messages',
    'durable-replay',
    'metadata',
    'locks',
    'artifacts',
    'blobs',
  ],
})
```

If `features` is omitted, `withPersistence(...)` enables the features supported
by the stores present on the `AIPersistence` object. Pass `features` when you
want fail-loud validation for a required capability.

For exact store method contracts and resume invariants behind these controls,
see [Persistence Internals](./internals).
