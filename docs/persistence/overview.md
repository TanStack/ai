---
title: Persistence Overview
id: overview
description: "How durability and persistence fit together in TanStack AI: keep a stream alive through a dropped connection, restore a conversation after a reload, and keep an authoritative server record. Learn the two layers and when to pick each."
keywords:
  - persistence
  - durability
  - resumable streams
  - rehydrate conversation
  - page reload
  - server authoritative
  - client authoritative
---

# Durability and Persistence

Three things can go wrong with an AI chat, and they have different fixes:

1. The connection drops mid-answer. The user watched half a reply appear, then the socket died. You don't want to re-run the model and pay for it twice.
2. The user reloads the page. The whole conversation is gone, because it only lived in memory.
3. The user opens the app on another device, or your server restarts. There is no record of the conversation anywhere durable.

TanStack AI solves these with two independent layers. You can use either alone or both together.

## The two layers

| Layer | Answers | Lives | Docs |
| --- | --- | --- | --- |
| **Delivery durability** | "how do I reconnect to a stream that's still running?" | a per-run log, keyed by `runId` | [Resumable Streams](../resumable-streams/overview) |
| **State persistence** | "what is the conversation, and is it still there later?" | a durable store (client and/or server) | this section |

They share no code and solve different problems. Delivery durability replays a live byte stream so a dropped connection resumes exactly where it stopped. State persistence stores the conversation itself, so it survives a reload or exists on another device. A replayable stream is not a saved conversation, and a saved conversation is not a live stream. Real apps usually want both.

## State persistence has two halves

Persistence runs on the client, the server, or both. They are independent, and they answer different questions.

| Half | Stores | Survives | Use it for |
| --- | --- | --- | --- |
| **Client** ([Browser refresh](./browser-refresh)) | the transcript + a resume pointer, in `localStorage` / `IndexedDB` | a page reload in that browser | instant restore on reload, SPA / offline apps |
| **Server** ([Chat persistence](./chat-persistence)) | messages, run status, interrupts, in SQL / D1 / your store | a server restart, and reaches every device | multi-device, audit, durable approvals |

A minimal server setup adds one middleware to `chat()`:

```ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { withChatPersistence } from '@tanstack/ai-persistence'
import { sqlitePersistence } from '@tanstack/ai-persistence-drizzle/sqlite'

const persistence = sqlitePersistence({
  url: 'file:.tanstack-ai/state.sqlite',
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

The minimal client setup adds one option to `useChat`:

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
  // ...
}
```

## Who owns the history: client or server

When both halves are on, one rule decides which copy is authoritative, and you pick it per turn by what the client sends as `messages`:

- **Non-empty `messages`** means "this is the full history." On finish the server overwrites its stored thread with it. The client stays authoritative; the server mirrors.
- **Empty `messages`** means "continue from your own copy." The server loads its stored transcript and runs from there. The server is authoritative; the client is a cache.

That single rule lets the two copies coexist without a merge conflict. Two postures come out of it:

- **Client-authoritative**: keep sending the full transcript. `localStorage` is the truth, the server store is a durable backup. Closest to a pure SPA.
- **Server-authoritative**: send empty `messages` and let the server own history. The same thread then opens identically on another device, or after the browser cache is cleared.

## What happens on a page reload

On load, `useChat` reads the client record and acts on what it finds:

1. **The run had finished.** The record has the transcript, no resume pointer. The conversation paints instantly from storage. No network. (client persistence alone)
2. **The run was paused on an interrupt.** The resume pointer carries the pending interrupts. The transcript paints and the approval UI comes back exactly as it was. (client persistence alone)
3. **The run was still streaming.** The transcript paints from storage, then the client rejoins the live run through the durability log and the reply finishes in place. This is the one case that needs **both** layers: persistence supplies the transcript and the `runId`, durability replays the rest. (client persistence + delivery durability)

A dropped connection while the page is still open is simpler: delivery durability reconnects on its own, no persistence needed. Persistence matters once the page itself is gone.

If you run server-authoritative with the transcript kept off the client (see [Browser refresh](./browser-refresh)), the reload paints from a server read instead of `localStorage`. The delivery log cannot supply that history: it holds one run, not the whole thread.

## When to pick each

| You want | Turn on |
| --- | --- |
| A dropped connection to resume the same answer | Delivery durability ([Resumable Streams](../resumable-streams/overview)) |
| The conversation to still be there after a reload | Client persistence ([Browser refresh](./browser-refresh)) |
| Reload durability without caching big histories client-side | Client persistence with `{ store, messages: false }` |
| The same conversation on another device, or after a server restart | Server persistence ([Chat persistence](./chat-persistence)) |
| Pause for a human approval and resume it later, durably | Server persistence with an `interrupts` store |
| A mid-stream reload to pick up the live answer | Client persistence + delivery durability together |

Most production chat apps end up with all three: delivery durability on the route, client persistence for instant reload, and server persistence as the record of record.

## What we recommend

For a real multi-user app, one combination beats the rest:

1. **Client: cache only the resume pointer** with `persistence: { store, messages: false }`. The browser holds a few bytes (which run to rejoin, which interrupts are pending), never the transcript.
2. **Server: `withChatPersistence`** owns the authoritative history, run status, and durable interrupts.
3. **One `GET` endpoint that does two jobs**: rehydrate the conversation from the store, and resume an in-flight durable stream.

The server route:

```ts
import {
  chat,
  chatParamsFromRequest,
  memoryStream,
  resumeServerSentEventsResponse,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import {
  reconstructChat,
  withChatPersistence,
} from '@tanstack/ai-persistence'
import { sqlitePersistence } from '@tanstack/ai-persistence-drizzle/sqlite'

const persistence = sqlitePersistence({
  url: 'file:.tanstack-ai/state.sqlite',
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
  return toServerSentEventsResponse(stream, {
    durability: { adapter: memoryStream(request) },
  })
}

export function GET(request: Request): Response | Promise<Response> {
  const durability = memoryStream(request)
  // In-flight run: the resume offset arrives via the Last-Event-ID header or
  // ?offset, and the run id via the X-Run-Id header or ?runId, so ask the
  // adapter with resumeFrom() instead of sniffing query params. Replay the log
  // so a reload finishes the answer.
  if (durability.resumeFrom() !== null) {
    return resumeServerSentEventsResponse({ adapter: durability })
  }
  // Otherwise rehydrate the conversation from the durable store. `reconstructChat`
  // reads `?threadId` and returns the stored messages as JSON.
  return reconstructChat(persistence, request)
}
```

The client caches only the pointer and loads history from that `GET`:

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
    persistence: { store, messages: false },
  })
  // On mount, fetch GET /api/chat?threadId=support-chat and seed the thread
  // (a router loader is the natural place). The resume pointer in localStorage
  // then rejoins any run that was still streaming.
}
```

Why this wins over the alternatives:

- **One source of truth.** History lives on the server, so there is no client/server copy to drift or reconcile. The same conversation opens on any device and survives a server restart.
- **A cheap client.** The browser never parses or stores a long transcript, so there is no `localStorage` quota or startup-parse cost, even for huge threads.
- **Full reload durability anyway.** The tiny resume pointer is enough to rejoin a mid-stream run and restore pending interrupts instantly, so dropping the transcript costs nothing on reload.
- **No wasted work.** The `GET` reuses the same route as the durable-stream resume, and `loadThread` returns ready-made messages instead of replaying a stream to reconstruct them.

Client-only persistence can't do multi-device and bloats storage. Caching everything client-side duplicates the source of truth. Server-only without the resume pointer can't rejoin a live run after a reload without a round-trip. This combination avoids all three.

## The store contract

Server persistence is a set of stores. Middleware activates behavior from whichever stores are present, there is no separate enable list.

| Store | Purpose |
| --- | --- |
| `messages` | Authoritative model-message history per thread. |
| `runs` | Run status, timing, errors, and usage. |
| `interrupts` | Pending, resolved, or cancelled human/tool waits (needs `runs`). |
| `metadata` | App and integration key/value state. |
| `locks` | Cross-worker coordination. |

## Where to go next

- [Chat persistence](./chat-persistence): the server middleware, the authoritative-history contract, and durable interrupts.
- [Browser refresh](./browser-refresh): client reload restore, the `messages` lever, and mid-stream rejoin.
- [Controls](./controls): compose backends per store and choose which stores to run.
- Backends: [Drizzle](./drizzle), [Prisma](./prisma), [Cloudflare](./cloudflare), or your own [Custom stores](./custom-stores).
- [Resumable streams](../resumable-streams/overview): the delivery-durability layer in full.
- [Internals](./internals): the middleware lifecycle and composition mechanics behind every backend.
