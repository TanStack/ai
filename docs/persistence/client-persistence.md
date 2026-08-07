---
title: Client Persistence
id: client-persistence
description: "Reload restores transcript, interrupts, and in-flight runs. Pick browser storage or server-authoritative hydrate."
---

# Client Persistence

If you need reload to repaint the chat (and rejoin a stream) → set `persistence` on `useChat` / `ChatClient` / framework chat.

Works with or without a server store:

| Setup | Option | Behavior |
| --- | --- | --- |
| Browser owns chat | storage adapter | Full transcript in browser; no network on restore |
| Server owns chat | `persistence: true` | No client cache; hydrate by `threadId` from server ([Chat persistence](./chat-persistence)) |

## Turn it on (client-authoritative)

Stable `threadId` is the storage key. Fresh id per mount → nothing restores. See [Id map](./id-map).

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
  // render messages, call sendMessage(text)
}
```

`localStoragePersistence()` needs no type args; defaults to chat record + JSON codec.

## What reload restores

One record per `threadId`: `{ messages, resume? }`.

1. **Repaint transcript** — sync adapters hydrate in construction; IndexedDB after open (first paint may be empty briefly).
2. **Pending interrupt** — approval UI returns as left.
3. **In-flight run** — rejoins if connection has durability/replay — [Resumable streams](../resumable-streams/overview).

## Modes

| Value | Caches on client | Authoritative history | Reach for |
| --- | --- | --- | --- |
| storage adapter | transcript + resume pointer | client | SPA / offline, one device, moderate history |
| `true` | nothing | server | large histories, multi-device, no message content in browser |
| `false` / omit | nothing | — | memory only |

Generation hooks take the same option, **boolean only** — [Generation persistence](./generation-persistence).

### Server-authoritative wiring

**Must:** connection with `hydrate` (built-ins have it), stable `threadId`, `persistence: true`, server `GET`.

**Client:**

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

**Server** — same route as `POST`. Replay durability log if resume cursor present; else `reconstructChat`:

```ts
import { memoryStream, resumeServerSentEventsResponse } from '@tanstack/ai'
import { reconstructChat } from '@tanstack/ai-persistence'
import { persistence } from './persistence'

export function GET(request: Request): Response | Promise<Response> {
  const durability = memoryStream(request)
  if (durability.resumeFrom() !== null) {
    return resumeServerSentEventsResponse({ adapter: durability })
  }
  // Multi-user: pass authorize — see Chat persistence.
  return reconstructChat(persistence, request)
}
```

`reconstructChat` returns `{ messages, activeRun }`. Client mounts → hydrates → if `activeRun`, tails via replay. No `initialMessages`, no manual run id. [Chat persistence](./chat-persistence).

## Storage backends

| Adapter | Lifetime | Notes | When |
| --- | --- | --- | --- |
| `localStoragePersistence` | reloads + restarts | sync, ~5MB, JSON | default |
| `sessionStoragePersistence` | one tab | same shape | die with tab |
| `indexedDBPersistence` | reloads + restarts | async, structured clone, large data | big transcripts / non-JSON values |

```tsx
import { indexedDBPersistence } from '@tanstack/ai-react'

const persistence = indexedDBPersistence()
```

Throw only lazily when backing store is missing (e.g. SSR). Constructing on the server is safe.

### Custom adapter

Implement `getItem` / `setItem` / `removeItem`. `setItem` receives the full `{ messages, resume? }` record, not a bare array.

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

Reads are best-effort: throw/`null` → nothing stored. Wrong shape fails **silently**. Round-trip a real reload before shipping.

## Client vs server

Client persistence = one browser’s rendered state. Server persistence = authoritative copy for all users. They compose — [Persistence overview](./overview#which-setup).
