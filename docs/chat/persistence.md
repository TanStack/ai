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
- `persistence.server` stores the latest `ChatResumeSnapshotV2` under the
  `threadId`. The snapshot contains run identity, authoritative recovery
  correlation, and raw JSON-safe interrupt drafts.

This is client hydration, not server state durability. Persist authoritative
messages, runs, and interrupts with `withChatPersistence(...)`; make an
in-flight response replayable with SSE delivery durability. See
[Chat Persistence](../persistence/chat-persistence) for the complete flow and
[Interrupts](./interrupts) for resolution and recovery semantics.

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
    return stored.map(({ id, role, parts, createdAt }) => ({
      id,
      role,
      parts,
      ...(createdAt
        ? { createdAt: new Date(createdAt) }
        : {}),
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

## Recover interrupts before rebinding drafts

The browser stores raw V2 drafts, not hydrated bound items. It never serializes
`resolveInterrupt`, validators, configured tools, discriminated `kind`, or
hydrated error objects. On reload, authoritative server recovery must confirm
the thread, interrupted run, generation, exact IDs, schema hashes, expiry, and
commit state before the client rebinds descriptors or restores a draft.

Render `interrupts` and use their bound methods. `pendingInterrupts` and raw
`resumeInterrupts` remain deprecated compatibility surfaces.

```tsx
import { toolDefinition } from '@tanstack/ai'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

const approvalTool = toolDefinition({
  name: 'sensitive_action',
  description: 'Perform a sensitive action',
  needsApproval: true,
})

export function Interrupts() {
  const { interrupts, interruptErrors, retryInterrupts } = useChat({
    threadId: 'thread-1',
    connection: fetchServerSentEvents('/api/chat'),
    tools: [approvalTool] as const,
  })

  return (
    <ul>
      {interrupts.map((interrupt) => (
        <li key={interrupt.id}>
          <span>{interrupt.reason}</span>
          {interrupt.kind === 'tool-approval' ? (
            <button onClick={() => interrupt.resolveInterrupt(true)}>
              Approve
            </button>
          ) : null}
          <button onClick={() => interrupt.cancel()}>Cancel</button>
        </li>
      ))}
      {interruptErrors.map((error) => (
        <li key={`${error.code}:${error.generation}`}>{error.message}</li>
      ))}
      <li>
        <button onClick={() => void retryInterrupts()}>Retry</button>
      </li>
    </ul>
  )
}
```

The server still validates every entry and commits the exact batch atomically.
Normal new input is rejected while interrupts remain unresolved.

Recovery is opt-in. Configure explicit application-owned recovery and winning
continuation URLs; connection adapters never infer them from the chat URL:

```ts
import {
  createInterruptContinuationLoader,
  createInterruptStateFetcher,
  fetchServerSentEvents,
} from '@tanstack/ai-client'

export const connection = fetchServerSentEvents('/api/chat', {
  interruptStateFetcher: createInterruptStateFetcher(
    '/api/interrupts/recovery',
  ),
  continuationLoader: createInterruptContinuationLoader(
    '/api/interrupts/continuation',
  ),
})
```

Exact retries use the stored fingerprint and join the winning continuation.
Stale tabs recover the authoritative generation instead of executing a second
continuation. See [Migrate to AG-UI interrupts](../migration/interrupts) for V1
compatibility and rollout steps.

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
