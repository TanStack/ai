---
title: Persistence
id: chat-persistence
order: 5
description: "Persist rendered chat state and interrupt resume state in the browser with localStorage, sessionStorage, IndexedDB, or a custom adapter."
keywords:
  - tanstack ai
  - persistence
  - chat history
  - localStorage
  - sessionStorage
  - indexeddb
  - offline
---

# Client Chat Persistence

`useChat` can persist two browser-side values independently:

- `persistence.client` stores the rendered `UIMessage[]` under the chat `id`.
- `persistence.server` stores the latest `ChatResumeSnapshot` under the
  `threadId`. The snapshot contains the run identity and any pending
  interrupts needed after a reload.

This is client hydration, not server state durability. Persist authoritative
messages, runs, and interrupts with `withChatPersistence(...)`. Making an
in-flight response replayable is a separate transport feature (stream re-attach
/ delivery durability, landing in PR #955). See
[Chat Persistence](../persistence/chat-persistence) for the complete flow.

## Use IndexedDB for chat messages

IndexedDB uses the browser's structured-clone algorithm, so values such as the
optional `UIMessage.createdAt` `Date` survive a round trip without a custom
codec.

```tsx
import {
  indexedDBPersistence,
} from '@tanstack/ai-client'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import type { UIMessage } from '@tanstack/ai-react'

export function SupportChat() {
  const chat = useChat({
    id: 'support-chat',
    threadId: 'support-thread',
    connection: fetchServerSentEvents('/api/chat'),
    persistence: {
      client: indexedDBPersistence<Array<UIMessage>>({
        databaseName: 'support-app',
        objectStoreName: 'chat-state',
      }),
    },
  })

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        const message = data.get('message')
        if (typeof message === 'string' && message.trim()) {
          void chat.sendMessage(message)
          event.currentTarget.reset()
        }
      }}
    >
      {chat.messages.map((message) => (
        <p key={message.id}>
          {message.parts.map((part, index) =>
            part.type === 'text' ? (
              <span key={index}>{part.content}</span>
            ) : null,
          )}
        </p>
      ))}
      <input name="message" />
      <button disabled={chat.isLoading}>Send</button>
      <button type="button" onClick={() => chat.clear()}>
        Clear
      </button>
    </form>
  )
}
```

`clear()` removes both in-memory state and the persisted entries. Storage
operations may be synchronous or asynchronous; the chat client serializes its
writes so a slower write cannot overwrite newer state.

## Use localStorage or sessionStorage

Web Storage only stores strings. `localStoragePersistence` and
`sessionStoragePersistence` use JSON by default for JSON-safe values. Chat
messages can contain `Date`, so provide a codec that restores it.

```tsx
import {
  localStoragePersistence,
  sessionStoragePersistence,
} from '@tanstack/ai-client'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import type { ChatResumeSnapshot } from '@tanstack/ai-client'
import type { UIMessage } from '@tanstack/ai-react'

type StoredMessage = Omit<UIMessage, 'createdAt'> & {
  createdAt?: string
}

function serializeJson(value: unknown): string {
  const stringify: (input: unknown) => unknown = JSON.stringify
  const serialized = stringify(value)
  if (typeof serialized !== 'string') {
    throw new TypeError('The value is not JSON serializable.')
  }
  return serialized
}

const messages = localStoragePersistence<Array<UIMessage>>({
  keyPrefix: 'my-app:messages:',
  serialize: serializeJson,
  deserialize(value) {
    const stored: Array<StoredMessage> = JSON.parse(value)
    return stored.map(({ createdAt, ...message }) => ({
      ...message,
      ...(createdAt ? { createdAt: new Date(createdAt) } : {}),
    }))
  },
})

const resumes = sessionStoragePersistence<ChatResumeSnapshot>({
  keyPrefix: 'my-app:resume:',
  serialize: serializeJson,
  deserialize(value) {
    return JSON.parse(value)
  },
})

export function PersistentChat() {
  const chat = useChat({
    id: 'chat-1',
    threadId: 'thread-1',
    connection: fetchServerSentEvents('/api/chat'),
    persistence: { client: messages, server: resumes },
  })

  return <p>{chat.messages.length} messages</p>
}
```

`localStorage` survives browser restarts. `sessionStorage` is scoped to the
current tab. Both adapters default to the key prefix `tanstack-ai:`.

## Resume pending interrupts after reload

The hook exposes the persisted interrupt state directly. Render
`pendingInterrupts` and call the returned `resumeInterrupts` function; do not
manufacture a hook return type outside a component.

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

export function Interrupts() {
  const { pendingInterrupts, resumeInterrupts } = useChat({
    threadId: 'thread-1',
    connection: fetchServerSentEvents('/api/chat'),
  })

  return (
    <ul>
      {pendingInterrupts.map((interrupt) => (
        <li key={interrupt.id}>
          <span>{interrupt.reason}</span>
          <button
            onClick={() =>
              void resumeInterrupts([
                {
                  interruptId: interrupt.id,
                  status: 'resolved',
                  payload: { approved: true },
                },
              ])
            }
          >
            Continue
          </button>
          <button
            onClick={() =>
              void resumeInterrupts([
                { interruptId: interrupt.id, status: 'cancelled' },
              ])
            }
          >
            Cancel
          </button>
        </li>
      ))}
    </ul>
  )
}
```

The server still validates that every resume entry matches a pending
interrupt. Normal new input is rejected while interrupts remain unresolved.

## SSR and custom adapters

Browser storage is unavailable during SSR. The built-in adapters throw
`StorageUnavailableError` when first used outside a browser rather than
silently dropping data. Construct and use them in client components, or pass a
custom `ChatStorageAdapter<T>` backed by your runtime's storage.

```ts
import type { ChatStorageAdapter } from '@tanstack/ai-client'

declare const adapter: ChatStorageAdapter<string>

await adapter.setItem('chat-1', 'value')
const value = await adapter.getItem('chat-1')
await adapter.removeItem('chat-1')
```

Keep `id` and `threadId` stable. Changing either selects a different persisted
record.
