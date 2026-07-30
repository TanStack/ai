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

- **The browser owns the chat** (SPA, offline-first, no server store). Pass a
  storage adapter and it holds the full transcript, restored on reload with no
  network.
- **The server owns the chat** (you use [Chat persistence](./chat-persistence)).
  Set `persistence: true` and the client caches nothing: on reload it hydrates
  the thread from the server by its `threadId`, painting the conversation and
  rejoining any run still streaming. That is the server-authoritative mode below.

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

The `threadId` is doing the real work here: it is the key the record is written
under and looked up by, so a fresh id per mount restores nothing. Derive it from
your own domain (a conversation id, a route param). [Id map](./id-map) covers how
to pick one, how it differs from the `runId` the hook reports, and what both mean
on the generation hooks.

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

## Choose a mode

`persistence` takes a storage adapter or a boolean:

- an **adapter** (`persistence: localStoragePersistence()`) is client-authoritative.
- **`true`** is server-authoritative.
- **`false`** (or omitted) is off: messages live in memory only and a reload starts empty.

The generation hooks (`useGenerateImage` / `useGenerateVideo` / …) make the same
choice: `persistence: true` is server-driven and a storage adapter is
client-driven. They key on `threadId` too, but there it names a slot successive
runs fill rather than a conversation ([Id map](./id-map)). A reload
restores the last known `status` / `result` / `error` for that slot's newest run
It does not restart provider work. Only a run that is still
streaming against a server-side durable stream can be re-attached and finished
in place. See [Generation persistence](./generation-persistence) for the
generation-specific setup.

### An adapter: client-authoritative

Pass the adapter directly, `persistence: localStoragePersistence()`. The
transcript and the resume pointer both live in the browser. The client owns the
history; the server, if any, mirrors it. Best when the browser is the source of
truth: single-page apps, offline-first, one device, small to moderate
conversations.

### `true`: server-authoritative

Pass `persistence: true`. The client stores nothing, no transcript and no resume
pointer. On mount `useChat` hydrates the thread from the server by its
`threadId`: it paints the stored transcript and, if a run is still generating,
tails it to completion. Best when transcripts are large (localStorage is
synchronous and quota-bound), when the same conversation must open on another
device, or when you simply do not want message content in the browser.

You do not fetch or seed the transcript yourself. A reload and the same thread
opened on another device follow the identical path, because the thread id is the
stable key and the server resolves everything from it. No loader, no
`initialMessages`, no extra props. It needs a connection with a `hydrate` handler
(every built-in connection has one) and the server `GET` endpoint below.

**Client** — a connection, a stable `threadId`, and `persistence: true`:

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

const connection = fetchServerSentEvents('/api/chat')

function Chat({ threadId }: { threadId: string }) {
  const { messages, sendMessage } = useChat({
    threadId,
    connection,
    persistence: true,
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
| `persistence: true` | nothing | server | large histories, multi-device, no transcripts in the browser |

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

### Writing your own

Any object with `getItem` / `setItem` / `removeItem` works. The record is one
`{ messages, resume? }` blob per chat id — the transcript plus the pointer that
lets a reload rejoin an in-flight run — so `setItem` receives that whole record,
not a bare message array:

```ts
import type {
  ChatClientPersistence,
  ChatPersistedState,
} from '@tanstack/ai-client'

function isPersistedState(value: unknown): value is ChatPersistedState {
  return (
    typeof value === 'object' &&
    value !== null &&
    'messages' in value &&
    Array.isArray(value.messages)
  )
}

const persistence: ChatClientPersistence = {
  getItem(id) {
    const raw = localStorage.getItem(id)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    // A bare array is the legacy messages-only format, still accepted.
    if (Array.isArray(parsed)) return { messages: parsed }
    return isPersistedState(parsed) ? parsed : null
  },
  setItem(id, state) {
    localStorage.setItem(id, JSON.stringify(state))
  },
  removeItem(id) {
    localStorage.removeItem(id)
  },
}
```

Reads are best-effort: a `getItem` that throws or returns `null` is treated as
"nothing stored", so an adapter that parses the wrong shape fails **silently** —
the conversation just does not come back. Round-trip your adapter once against a
real reload before shipping it.

## Client and server are independent

Client persistence restores what one browser rendered. Server persistence
([Chat persistence](./chat-persistence)) keeps the authoritative copy for every
user and survives a server restart. They compose: for the combination we
recommend for most apps, and why, see the
[Persistence overview](./overview#what-we-recommend).
