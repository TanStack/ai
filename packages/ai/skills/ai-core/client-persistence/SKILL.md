---
name: ai-core/client-persistence
description: >
  Browser chat persistence on useChat / ChatClient: localStoragePersistence,
  sessionStoragePersistence, indexedDBPersistence. Client-authoritative
  (adapter, full transcript) vs server-authoritative (persistence: true, no
  client cache).
  Reload restore, pending interrupts, mid-stream rejoin with delivery
  durability. Use for SPA reload durability — NOT server history alone.
  No extra package: the adapters ship in the framework packages.
type: sub-skill
library: tanstack-ai
library_version: '0.42.0'
sources:
  - 'TanStack/ai:docs/persistence/client-persistence.md'
  - 'TanStack/ai:docs/persistence/overview.md'
---

# Client Persistence

> Builds on ai-core, and on `ai-core/chat-experience` for `useChat` itself.
>
> **No extra package.** The adapters below ship in the **framework** packages
> (`@tanstack/ai-react` and friends, re-exported from `@tanstack/ai-client`),
> so browser persistence needs nothing installed beyond what a chat UI already
> has. The **server** half is a separate package — see
> `@tanstack/ai-persistence` and its `ai-persistence/server` skill.

A `ChatClient` / `useChat` keeps messages in memory. The `persistence` option
stores one record per `threadId` so a reload can repaint the transcript,
restore a pending interrupt, and rejoin an in-flight run.

Import adapters from the **framework package** (not `@tanstack/ai-client`
unless vanilla JS):

```tsx
import {
  useChat,
  fetchServerSentEvents,
  localStoragePersistence,
  sessionStoragePersistence,
  indexedDBPersistence,
} from '@tanstack/ai-react'
```

## Adapters

| Adapter                       | Survives                   | Notes                                                           |
| ----------------------------- | -------------------------- | --------------------------------------------------------------- |
| `localStoragePersistence()`   | Reloads + browser restarts | Sync hydrate; quota-bound; JSON codec default                   |
| `sessionStoragePersistence()` | Reloads in the same tab    | Cleared when tab/session ends                                   |
| `indexedDBPersistence()`      | Reloads + restarts         | Async open (first paint may be empty briefly); structured clone |

All default to the chat persisted-state shape — no type argument or codec
required for normal use.

## Mode A — cache everything (client-authoritative)

```tsx
function Chat() {
  const { messages, sendMessage } = useChat({
    threadId: 'support-chat', // stable — required
    connection: fetchServerSentEvents('/api/chat'),
    persistence: localStoragePersistence(),
  })
  // ...
}
```

Bare adapter ≡ full transcript + resume pointer. Browser owns history; server
(if any) mirrors when you post non-empty `messages`.

Best for: SPA, offline-first, single device, moderate conversation size.

## Mode B — server-authoritative (`persistence: true`)

```tsx
function Chat({ threadId }: { threadId: string }) {
  const { messages, sendMessage } = useChat({
    threadId,
    connection: fetchServerSentEvents('/api/chat'),
    persistence: true,
  })
  // ...
}
```

Nothing is cached client-side: no transcript, no resume pointer.

On mount, `useChat` hydrates the thread from the **server** by `threadId`
(paint + tail active run). Same path for another device. Pair with server
`withPersistence` + a hydrate route (`reconstructChat` or equivalent).

Best for: large transcripts, multi-device, compliance (no message bodies in
browser storage).

## What a reload restores

1. **Finished run** — transcript from the adapter (mode A) or server (mode B).
2. **Paused on interrupt** — approval UI restored (from the adapter in mode A,
   the server hydrate in mode B).
3. **Still streaming** — needs **delivery durability** on the route
   (`toServerSentEventsResponse(stream, { durability: … })`) so the client can
   `joinRun` and finish the reply. Persistence alone is not enough.

## Stable `threadId` is the identity

Persistence keys on `threadId`. The hooks have **no separate `id` option** — a
chat's identity _is_ its `threadId`. Without a stable one, each load is a new
chat. Generate it server-side or from a route param the user owns; do not
randomize per mount.

## Common mistakes

### HIGH: No `threadId`

Record cannot be found after reload.

### HIGH: Passing `id` to `useChat`

Removed — `threadId` is the identity. (`ChatClient` still accepts `id` directly
as a lower-level escape hatch for keying storage separately from the wire
thread; the framework hooks do not.)

### HIGH: `persistence: true` without server history

Empty chat after reload unless the server can reconstruct by `threadId`.

### MEDIUM: Huge transcripts in `localStorage`

Quota and main-thread cost. Prefer `persistence: true` + server store, or
IndexedDB with care.

### MEDIUM: Expecting multi-device sync from client storage alone

`localStorage` is per-browser. Use server persistence for multi-device.

## Cross-references

- **ai-persistence/server** (`@tanstack/ai-persistence`) — authoritative server half
- **ai-core/chat-experience** — `useChat`, resumable connections
- Resumable streams docs — mid-stream rejoin
