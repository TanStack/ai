---
title: Client Persistence
id: client-persistence
---

# Client Persistence

A `ChatClient` (and every framework `useChat` / `createChat`) keeps messages in
memory, so a reload or a crashed tab loses the whole conversation and any reply
that was still streaming. The `persistence` option writes chat state to browser
storage, so a reload restores it. This is the client half of persistence; the
authoritative server copy is [Chat persistence](./chat-persistence).

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

- **Repaints the transcript** before the first render, from storage, no network.
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
`GET` endpoint with `reconstructChat(persistence, request)` and read it from a
router loader to seed `initialMessages`. See [Chat persistence](./chat-persistence).

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
