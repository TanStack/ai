---
title: Persistence
id: chat-persistence
order: 5
description: "Persist chat conversations on the client with TanStack AI — restore messages and rejoin an in-flight run after a full page reload using a getItem/setItem/removeItem adapter."
keywords:
  - tanstack ai
  - persistence
  - chat history
  - localStorage
  - indexeddb
  - offline
  - hydration
---

By default a `ChatClient` (and every framework `useChat` / `createChat` wrapper)
keeps messages in memory only, so a reload loses the conversation. The optional
`persistence` adapter wires the client to a storage backend so a full page
reload restores the transcript, rehydrates any pending interrupt, and rejoins a
run that was still streaming, with no manual `initialMessages` + `onFinish`
boilerplate.

This is the client half of persistence. For the authoritative server-side copy
(and the SQL / Cloudflare backends), see the
[Persistence section](../persistence/overview).

## Use a built-in storage adapter

The quickest path is one of the adapters exported from `@tanstack/ai-client`.
Give the chat a stable `threadId` so a reload finds the same record:

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

`localStoragePersistence`, `sessionStoragePersistence`, and
`indexedDBPersistence` all ship from `@tanstack/ai-client`. See
[Browser refresh](../persistence/browser-refresh) for choosing between them and
for rejoining an in-flight run after reload.

To keep large transcripts off the client, pass the object form
`persistence={{ store, messages: false }}`: only the small resume pointer is
cached (durability rejoin and interrupt restore still work) and the server owns
the history. See [Browser refresh](../persistence/browser-refresh).

## The adapter interface

A persistence adapter is any object with three methods — the same
`getItem` / `setItem` / `removeItem` shape used elsewhere in TanStack AI. It
stores one combined record per chat id: the message transcript plus an optional
resume snapshot (which run to rejoin, which interrupts are pending). Each method
may be synchronous or return a `Promise`:

```typescript
import type {
  ChatPersistedState,
  UIMessage,
} from '@tanstack/ai-client'

interface ChatClientPersistence {
  getItem: (
    id: string,
  ) =>
    | ChatPersistedState
    // A bare `UIMessage[]` is still accepted for backward compatibility.
    | Array<UIMessage>
    | null
    | undefined
    | Promise<ChatPersistedState | Array<UIMessage> | null | undefined>
  setItem: (id: string, state: ChatPersistedState) => void | Promise<void>
  removeItem: (id: string) => void | Promise<void>
}
```

The `id` passed to each method is the client's `id` option. Provide a stable
`id` per conversation so the right history is loaded back. Writes are
best-effort: a throwing or rejecting adapter is swallowed so storage problems
never break the chat.
