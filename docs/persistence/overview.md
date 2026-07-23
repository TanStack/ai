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
import { fetchServerSentEvents, localStoragePersistence } from '@tanstack/ai-client'
import { useChat } from '@tanstack/ai-react'
import type { ChatPersistedState } from '@tanstack/ai-client'

const store = localStoragePersistence<ChatPersistedState>({
  serialize: (value) => JSON.stringify(value),
  deserialize: (value) => JSON.parse(value),
})

function Chat() {
  const { messages, sendMessage } = useChat({
    id: 'support-chat',
    connection: fetchServerSentEvents('/api/chat'),
    persistence: store,
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
