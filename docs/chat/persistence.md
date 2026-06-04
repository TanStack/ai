---
title: Persistence
id: chat-persistence
order: 5
description: "Persist chat conversations on the client with TanStack AI — hydrate on load, save on change, and clear on reset using a simple getItem/setItem/removeItem adapter."
keywords:
  - tanstack ai
  - persistence
  - chat history
  - localStorage
  - indexeddb
  - offline
  - hydration
---

By default a `ChatClient` (and every framework `useChat`/`createChat` wrapper) keeps messages in memory only — reload the page or navigate away and the conversation is gone. The optional **persistence adapter** wires the client to a storage backend so conversations survive reloads, with no manual `initialMessages` + `onFinish` boilerplate.

This is especially useful for SPAs, Electron apps, and offline-first setups where the client is the source of truth and there's no server managing conversation state.

## The adapter interface

A persistence adapter is any object with three methods — the same `getItem`/`setItem`/`removeItem` shape used elsewhere in TanStack AI. Each method may be synchronous or return a `Promise`:

```typescript
import type { ChatClientPersistence } from "@tanstack/ai-client";

interface ChatClientPersistence {
  getItem: (
    id: string,
  ) =>
    | Array<UIMessage>
    | null
    | undefined
    | Promise<Array<UIMessage> | null | undefined>;
  setItem: (id: string, messages: Array<UIMessage>) => void | Promise<void>;
  removeItem: (id: string) => void | Promise<void>;
}
```

The `id` passed to each method is the client's `id` option. Provide a stable `id` per conversation so the right history is loaded back:

```typescript
const client = new ChatClient({
  id: "conversation-123",
  connection: adapter,
  persistence: myPersistenceAdapter,
});
```

## What the client does for you

When a `persistence` adapter is provided, `ChatClient`:

- **Hydrates on construction** — calls `getItem(id)`. If it returns an array, those messages populate the client (overriding `initialMessages`). Async adapters hydrate as soon as the promise resolves, unless you've already started a new conversation in the meantime.
- **Saves on every change** — calls `setItem(id, messages)` whenever the message list changes (new user message, streamed assistant content, tool calls/results, approval responses). Writes are queued so they never overlap or land out of order.
- **Clears on `clear()`** — calls `removeItem(id)` and discards any in-flight stream so a cleared conversation doesn't get repopulated by late chunks.

When `persistence` is omitted, nothing changes — the client behaves exactly as before. The option is fully backwards compatible.

Persistence is **best-effort**: if an adapter method throws or rejects, the error is swallowed so storage problems never break the chat. Handle and surface errors inside your adapter if you need to react to them.

## Framework usage

Every framework wrapper accepts the same `persistence` option and forwards it to the underlying `ChatClient`:

```tsx
// React / Preact
const chat = useChat({
  id: "conversation-123",
  connection: fetchServerSentEvents("/api/chat"),
  persistence: myPersistenceAdapter,
});
```

```ts
// Solid / Vue — same option
const chat = useChat({
  id: "conversation-123",
  connection: fetchServerSentEvents("/api/chat"),
  persistence: myPersistenceAdapter,
});
```

```ts
// Svelte
const chat = createChat({
  id: "conversation-123",
  connection: fetchServerSentEvents("/api/chat"),
  persistence: myPersistenceAdapter,
});
```

## Example: `localStorage`

A synchronous adapter backed by `localStorage`. Note that `UIMessage.createdAt` is a `Date`, which `JSON.stringify` turns into a string — revive it on read if you depend on it:

```typescript
import type { ChatClientPersistence, UIMessage } from "@tanstack/ai-client";

const localStoragePersistence: ChatClientPersistence = {
  getItem: (id) => {
    const raw = window.localStorage.getItem(id);
    if (!raw) return null;
    const stored: Array<UIMessage> = JSON.parse(raw);
    return stored.map((message) => ({
      ...message,
      createdAt:
        typeof message.createdAt === "string"
          ? new Date(message.createdAt)
          : message.createdAt,
    }));
  },
  setItem: (id, messages) => {
    window.localStorage.setItem(id, JSON.stringify(messages));
  },
  removeItem: (id) => {
    window.localStorage.removeItem(id);
  },
};
```

## Example: IndexedDB (async)

For larger histories or structured queries, back the adapter with an async store such as IndexedDB. The client awaits async methods automatically:

```typescript
import type { ChatClientPersistence } from "@tanstack/ai-client";

const indexedDbPersistence: ChatClientPersistence = {
  getItem: async (id) => {
    const record = await db.conversations.get(id);
    return record?.messages;
  },
  setItem: async (id, messages) => {
    await db.conversations.put({ id, messages, updatedAt: Date.now() });
  },
  removeItem: async (id) => {
    await db.conversations.delete(id);
  },
};
```

Any backend works — IndexedDB, SQLite (Electron/Tauri), a remote database, or an in-memory `Map` for tests — as long as it implements the three methods.
