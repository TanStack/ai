---
title: Client Persistence
id: client-persistence
---

# Client Persistence

A `ChatClient` (and every framework `useChat` / `createChat`) keeps messages in
memory, so a reload or a crashed tab loses the whole conversation and any reply
that was still streaming. The `persistence` option fixes that from the browser
side: on reload it repaints the transcript, brings back a pending interrupt, and
rejoins a run that was mid-stream.

You need this whether or not you have a server:

- **The browser owns the chat** (SPA, offline-first, no server store). Client
  persistence is the only durable copy, so it holds the full transcript.
- **The server owns the chat** (you use [Chat persistence](./chat-persistence)).
  The server is the source of truth, but the client still has to come back
  instantly on reload: rejoin the in-flight run, restore the pending interrupt,
  and show the conversation. Client persistence caches the small resume pointer
  that makes that possible and hydrates the transcript from the server. So this
  page matters even when history lives on the server, that is the
  `messages: false` mode below.

## Turn it on

Pass a storage adapter as `persistence` and give the chat a stable `threadId` so
a reload finds the same record:

```tsx
import {
  fetchServerSentEvents,
  localStoragePersistence,
  useChat,
} from '@tanstack/ai-react'

function Chat() {
  const { messages, sendMessage } = useChat({
    threadId: 'support-chat',
    connection: fetchServerSentEvents('/api/chat'),
    persistence: localStoragePersistence(),
  })
  // ...render messages, call sendMessage(text)
}
```

`localStoragePersistence()` needs no type argument and no codec: it defaults to
the chat record shape and a JSON codec. That is the whole opt-in.

## What a reload restores

The client stores one record per `threadId`, the transcript plus a small resume
pointer. On the next load `useChat` reads it and:

- **Repaints the transcript** from storage with no network. Sync adapters
  (`localStorage` / `sessionStorage`) hydrate during construction; IndexedDB
  hydrates asynchronously after the database opens (so the first paint may be
  empty for a tick).
- **Rehydrates a pending interrupt**, so an approval prompt comes back exactly as
  it was.
- **Rejoins an in-flight run**, if a reply was still streaming when the page
  reloaded, so it finishes in place instead of freezing half-done. This one needs
  a durability-backed connection (a route that records the stream and exposes a
  replay handler); see [Resumable streams](../resumable-streams/overview).

## Choose what to cache

`persistence` takes either a bare adapter (cache everything) or
`{ store, messages }` (pull the message lever).

### Cache everything (default): client-authoritative

Pass the adapter directly, `persistence: localStoragePersistence()`. The
transcript and the resume pointer both live in the browser. The client owns the
history; the server, if any, mirrors it. Best when the browser is the source of
truth: single-page apps, offline-first, one device, small to moderate
conversations.

### Resume pointer only: server-authoritative

Pass the object form, `persistence: { store, messages: false }`, where `store`
is your adapter. Only the tiny resume pointer is cached (which run to rejoin,
which interrupts are pending). Reload durability still works, but the transcript
stays off the client and the server owns history. Best when transcripts are
large (localStorage is synchronous and quota-bound), when the same conversation
must open on another device, or when you simply do not want message content in
the browser.

The transcript is not in storage, so hydrate it from the server on load: expose a
`GET` endpoint with `reconstructChat` and seed `initialMessages` from a router
loader (or equivalent). See [Chat persistence](./chat-persistence).

**Server half** (history hydrate; authorize multi-user access):

```ts
import { reconstructChat } from '@tanstack/ai-persistence'
import { persistence } from './persistence'
import type { Scope } from '@tanstack/ai'

export async function GET(request: Request) {
  // Scope.threadId is the conversation key. Derive Scope.userId / tenantId from
  // trusted session state — never from client body alone.
  return reconstructChat(persistence, request, {
    authorize: async (threadId, req) => {
      const scope: Scope = {
        threadId,
        // userId: await getSessionUserId(req),
      }
      // return scope.userId != null && (await ownsThread(scope))
      void scope
      void req
      return true // demo only
    },
  })
}
```

**Client half** (resume pointer only + loader-seeded history):

```tsx
import {
  fetchServerSentEvents,
  localStoragePersistence,
  useChat,
} from '@tanstack/ai-react'

const store = localStoragePersistence()

function Chat({
  threadId,
  initialMessages,
}: {
  threadId: string
  initialMessages: Array<{ id: string; role: 'user' | 'assistant'; parts: Array<{ type: 'text'; content: string }> }>
}) {
  const { messages, sendMessage } = useChat({
    threadId,
    connection: fetchServerSentEvents('/api/chat'),
    persistence: { store, messages: false },
    initialMessages,
  })
  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}>{m.role}</div>
      ))}
      <button type="button" onClick={() => void sendMessage('hi')}>
        Send
      </button>
    </div>
  )
}
```

#### Tail an in-flight run on a fresh client

The resume pointer is per-browser, so a **fresh** client — the same thread opened
on a second device or in another browser — has no pointer and would stop at the
hydrated snapshot even while the run is still generating on the server. To tail it
there too, have the server report which run (if any) is in flight for the thread
and hand it to `useChat` as `initialResumeSnapshot`. A bare in-flight snapshot is
rejoined just like a persisted pointer; a client that started the run still rejoins
via its own pointer, so pass this only when the running client is a different one.

```tsx
// Server: the loader (or your GET endpoint) reports the active run alongside history.
loader: async () => ({
  messages: await loadHistory(threadId), // reconstructChat, etc.
  activeRunId: activeRunForThread(threadId), // undefined once the run finishes
})

// Client: tail it if one is running. Harmless when it has finished — the join
// fast-fails and the hydrated transcript already holds the complete reply.
const { messages, activeRunId } = Route.useLoaderData()
useChat({
  threadId,
  connection,
  persistence: { store: localStoragePersistence(), messages: false },
  initialMessages: messages,
  ...(activeRunId && {
    initialResumeSnapshot: {
      schemaVersion: 2,
      resumeState: { threadId, runId: activeRunId },
    },
  }),
})
```

| Mode | Caches on client | Authoritative history | Reach for it when |
| --- | --- | --- | --- |
| `persistence: store` | transcript + resume pointer | client | SPA / offline, one device, small to moderate history |
| `{ store, messages: false }` | resume pointer only | server | large histories, multi-device, no transcripts in the browser |

## Choose a storage backend

Three adapters ship from `@tanstack/ai-client`, re-exported from every framework
package. All share the same shape; they differ in lifetime and encoding.

| Adapter | Lifetime | Notes | Reach for it when |
| --- | --- | --- | --- |
| `localStoragePersistence` | across reloads and browser restarts | synchronous, ~5MB quota, JSON codec | the default: persist a conversation for next time |
| `sessionStoragePersistence` | one tab, cleared when it closes | same shape as localStorage | a conversation that should not outlive the tab |
| `indexedDBPersistence` | across reloads and restarts | async, structured clone (a `Date` round-trips exactly), room for large data | big transcripts, or values a JSON codec would mangle |

```tsx
import { indexedDBPersistence } from '@tanstack/ai-react'

const persistence = indexedDBPersistence()
```

Each throws only lazily, per operation, when its backing store is missing (for
example during server-side rendering), so constructing one on the server is safe.

## Client and server are independent

Client persistence restores what one browser rendered. Server persistence
([Chat persistence](./chat-persistence)) keeps the authoritative copy for every
user and survives a server restart. They compose: for the combination we
recommend for most apps, and why, see the
[Persistence overview](./overview#what-we-recommend).
