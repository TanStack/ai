---
title: Browser Refresh
id: browser-refresh
---

# Durability across a browser refresh

Someone is mid-conversation and hits reload, or their tab crashes and reopens.
Without durability the chat comes back empty and any in-flight reply is lost.
The `persistence` option on `useChat` fixes this from the client side: it writes
the conversation to browser storage, so a full page reload restores the
messages, rehydrates any pending interrupt, and rejoins a run that was still
streaming.

## Restore the conversation on reload

Pass a storage adapter as `persistence` and give the chat a stable `threadId` so
a reload finds the same record:

```tsx
import {
  fetchServerSentEvents,
  localStoragePersistence,
  useChat,
} from '@tanstack/ai-react'

const connection = fetchServerSentEvents('/api/chat')

function Chat() {
  const { messages, sendMessage } = useChat({
    threadId: 'support-chat',
    connection,
    persistence: localStoragePersistence(),
  })
  // ...render messages, call sendMessage(text)
}
```

`localStoragePersistence()` needs no type argument and no codec: it defaults to
the chat record shape and a JSON codec. That is the whole opt-in. On the next
load `useChat` reads the record, restores the transcript before the first paint,
and rehydrates any interrupt that was still pending so the approval UI comes back
exactly as it was.

## Pick a storage backend

Three adapters ship from `@tanstack/ai-client` (and re-exported from every
framework package), all with the same shape:

- `localStoragePersistence` persists across reloads and browser restarts.
- `sessionStoragePersistence` is scoped to the tab and cleared when it closes.
- `indexedDBPersistence` is async and stores via structured clone, so a `Date`
  round-trips exactly, with no codec:

```tsx
import { indexedDBPersistence } from '@tanstack/ai-react'

const persistence = indexedDBPersistence()
```

Each throws only lazily, per operation, when its backing store is missing (for
example during server-side rendering), so constructing one on the server is
safe.

## Keep large histories off the client

Caching a long transcript in `localStorage` is synchronous and bounded by a
small quota, so for big conversations you may not want the messages on the
client at all. Pass the object form and set `messages: false`:

```tsx
import {
  fetchServerSentEvents,
  localStoragePersistence,
  useChat,
} from '@tanstack/ai-react'

const store = localStoragePersistence()

function Chat() {
  const { messages, sendMessage } = useChat({
    threadId: 'support-chat',
    connection: fetchServerSentEvents('/api/chat'),
    // Only the tiny resume pointer is cached; the transcript is NOT.
    persistence: { store, messages: false },
  })
  // ...
}
```

Now only the resume pointer (which run to rejoin, which interrupts are pending)
is cached. Durability rejoin and interrupt restore still work, but the transcript
lives on the server, which is authoritative. On reload the client starts empty,
so hydrate the history from the server: expose a `GET` endpoint with
`reconstructChat(persistence, request)` (from `@tanstack/ai-persistence`) and
have a router loader read it to seed `initialMessages`. The delivery replay
endpoint cannot supply this: its log holds one run, not the thread.

`persistence` therefore has two forms:

- a bare adapter, `persistence: store`, caches everything (default `messages: true`).
- `persistence: { store, messages: false }` caches only the resume pointer.

## Rejoin an in-flight run

If the run was still streaming when the page reloaded, the client can re-attach
to it instead of showing a frozen half-reply. This needs a durable connection:
a route that records the stream to a durability log and exposes a GET replay
handler (see [Resumable streams](../resumable-streams/overview)). Given that,
`useChat` finds the persisted in-flight run on load and rejoins it through
`joinRun`, replaying from the server's log so the reply finishes where it left
off. No extra client code is needed beyond a resumable connection.

## Every framework, no extra code

Durability rides the existing `persistence` option, so it works the same in
`@tanstack/ai-react`, `-solid`, `-vue`, `-svelte`, `-angular`, and `-preact`.
Pass `persistence` (and a stable `threadId`) to `useChat` / `injectChat`; there
is nothing framework-specific to wire.

## Client and server are independent

Browser persistence restores what one browser rendered. Server persistence
([Chat Persistence](./chat-persistence)) keeps the authoritative copy for every
user and survives a server restart. Use both: the client for instant reload
restore, the server for the durable record of record.
