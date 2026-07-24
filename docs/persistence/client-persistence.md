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

You do not fetch or seed the transcript yourself. On mount `useChat` hydrates the
thread from the server by its `threadId`: it paints the stored transcript and, if
a run is still generating, tails it to completion. A reload and the same thread
opened on another device follow the identical path, because the thread id is the
stable key and the server resolves everything from it. No loader, no
`initialMessages`, no extra props.

**Client** — the store, a connection, and a stable `threadId`:

```tsx
import {
  fetchServerSentEvents,
  localStoragePersistence,
  useChat,
} from '@tanstack/ai-react'

const connection = fetchServerSentEvents('/api/chat')
const persistence = { store: localStoragePersistence(), messages: false }

function Chat({ threadId }: { threadId: string }) {
  const { messages, sendMessage } = useChat({ threadId, connection, persistence })
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

**Server** — one `GET` endpoint next to your chat `POST`. Replay the durability
log when the request carries a resume cursor, otherwise return the stored
conversation with `reconstructChat`:

```ts
import { memoryStream, resumeServerSentEventsResponse } from '@tanstack/ai'
import { reconstructChat } from '@tanstack/ai-persistence'
import { persistence } from './persistence'

export function GET(request: Request): Response | Promise<Response> {
  const durability = memoryStream(request)
  // A reconnecting client carries a resume cursor (Last-Event-ID / ?offset and
  // X-Run-Id / ?runId). Replay the log so the run finishes in place.
  if (durability.resumeFrom() !== null) {
    return resumeServerSentEventsResponse({ adapter: durability })
  }
  // Otherwise return the stored transcript plus a cursor to any in-flight run.
  // Guard access in multi-user apps (see authorize in Chat persistence).
  return reconstructChat(persistence, request)
}
```

`reconstructChat` returns `{ messages, activeRun }`: the transcript as UI
messages, and `activeRun` when a run is still generating for the thread. The
client calls this endpoint on mount and, when `activeRun` is set, tails the run
through the replay branch above. You never handle a run id, and a second device
resumes the live run the same way the original tab does. See
[Chat persistence](./chat-persistence).

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
