---
title: Chat Persistence
id: chat-persistence
---

# Chat Persistence

You want a conversation to outlive a single request: the transcript, whether
each run finished or is still waiting on an interrupt, all still there after the
process restarts. `withPersistence` is a chat middleware that writes that
state to a store you choose, so the server owns an authoritative copy of every
thread.

## Persist state on the server

Add the middleware to `chat()` and point it at a backend. Here it is a local
SQLite file via the Drizzle backend:

```ts
import {
  chat,
  chatParamsFromRequestBody,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { withPersistence } from '@tanstack/ai-persistence'
import { sqlitePersistence } from '@tanstack/ai-persistence-drizzle/sqlite'

// One store for the whole process. `migrate: true` applies the bundled schema.
const persistence = sqlitePersistence({
  url: 'file:.data/chat.sqlite',
  migrate: true,
})

export async function POST(request: Request) {
  const params = await chatParamsFromRequestBody(await request.json())
  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    // Forward the resume batch so a thread with pending interrupts continues.
    ...(params.resume ? { resume: params.resume } : {}),
    middleware: [withPersistence(persistence)],
  })
  return toServerSentEventsResponse(stream)
}
```

The middleware uses whichever stores the backend provides, no feature flags:

- `messages` loads and saves the full model-message thread.
- `runs` records running, completed, failed, or interrupted status.
- `interrupts` records pending tool-approval / client-tool / generic waits, and
  requires `runs`.
- `locks` is handed to other middleware for cross-worker coordination.

`migrate: true` is convenient for local development. In production, apply the
bundled migrations through your deployment workflow instead. See
[Migrations](./migrations).

## Send the full transcript, or none of it

`withPersistence` follows one rule, the authoritative-history contract:

- A request with a **non-empty** `messages` array is the full conversation. On
  finish it **overwrites** the stored thread. Post the complete transcript, not
  a delta, or you replace the stored thread with just the newest message.
- A request with an **empty** `messages` array continues a stored thread. The
  middleware loads the stored transcript and the run picks up from there, so the
  client does not have to re-send history.

## Interrupts survive a restart

When a run pauses on an interrupt (a tool approval, a client-side tool, a
generic wait), the middleware records it. A later request on that thread must
carry a `resume` batch that answers the pending interrupts before new input is
accepted, otherwise it is rejected, which is why the example above forwards
`params.resume`. The chat engine itself rebuilds the resume state from that
batch and the interrupt bindings in the loaded history, so the persistence layer
only records the interrupts and gates the thread.

## Where to go next

- Bring durability to the browser too, so a full page reload restores the
  conversation and rejoins an in-flight run: [Client persistence](./client-persistence).
- Pick a backend: [Drizzle](./drizzle), [Prisma](./prisma),
  [Cloudflare](./cloudflare), or [your own store](./custom-stores).
- Choose which stores to run: [Controls](./controls).
