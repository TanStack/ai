<div align="center">
  <picture>
    <source
      media="(prefers-color-scheme: dark)"
      srcset="https://tanstack.com/api/readme/ai.png?theme=dark"
    />
    <source
      media="(prefers-color-scheme: light)"
      srcset="https://tanstack.com/api/readme/ai.png"
    />
    <img
      src="https://tanstack.com/api/readme/ai.png"
      alt="TanStack AI"
      width="900"
    />
  </picture>
</div>

<br />

# @tanstack/ai-persistence

Composable state persistence for TanStack AI messages, runs, interrupts, metadata, and locks

A conversation that only lives in memory is gone on reload and absent on a second device. This package stores it in your own database: one middleware on the server writes the transcript — and, with the matching stores configured, run status and pending approvals — through an adapter you define, and the client asks the server for the thread on mount. The client half ships in the framework package you already use (`@tanstack/ai-react`, `-vue`, `-solid`, `-svelte`, `-angular`, or `@tanstack/ai-client`).

## Installation

```bash
npm install @tanstack/ai-persistence
# or
pnpm add @tanstack/ai-persistence
# or
yarn add @tanstack/ai-persistence
```

## Usage

### Server: store the conversation

`withPersistence` writes the transcript into your `messages` store, plus run status and pending approvals when the adapter also provides `runs` and `interrupts`. Start with `memoryPersistence()` for local development and swap in your own adapter later:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { withPersistence } from '@tanstack/ai-persistence'
import { persistence } from './persistence'

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    ...(params.resume ? { resume: params.resume } : {}),
    middleware: [withPersistence(persistence)],
  })
  return toServerSentEventsResponse(stream)
}
```

### Client: bring it back

`persistence: true` puts the server in charge: the browser caches nothing and fetches the thread on mount. Best for multi-user and multi-device apps.

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

function Chat() {
  const { messages, sendMessage } = useChat({
    threadId: 'support-chat',
    connection: fetchServerSentEvents('/api/chat'),
    persistence: true,
  })
  return <button onClick={() => sendMessage('hi')}>{messages.length}</button>
}
```

Prefer the browser to own the history? Pass a storage adapter instead — `localStoragePersistence()`, `sessionStoragePersistence()`, or `indexedDBPersistence()` — and no server store is needed.

### Survive a reload mid-answer

Add a `GET` on the same route. `reconstructChat` returns the stored thread plus a cursor to any run still generating; `useChat` tails that run so the reply finishes in place.

```typescript
import { chatParamsFromRequest } from '@tanstack/ai'
import { reconstructChat } from '@tanstack/ai-persistence'
import { persistence } from './persistence'

export function GET(request: Request) {
  return reconstructChat(persistence, request, {
    // WITHOUT this, anyone who guesses a thread id gets the whole transcript.
    authorize: async (threadId, req) => ownsThread(req, threadId),
  })
}
```

## Build your own adapter

An adapter is a plain object of store functions. The core never looks at your tables, so the schema stays yours. One store, `messages`, is enough for `withPersistence`:

```typescript
import {
  defineAIPersistence,
  defineMessageStore,
} from '@tanstack/ai-persistence'
import { db } from './db'

export const persistence = defineAIPersistence({
  stores: {
    messages: defineMessageStore({
      // Return [] for a thread that was never saved, never null.
      loadThread: (threadId) => db.threads.messages(threadId),
      // The full transcript, not a delta. Overwrite what you had.
      saveThread: (threadId, messages) => db.threads.save(threadId, messages),
    }),
  },
})
```

The other stores are optional and add capabilities as you provide them: `runs`, `interrupts`, and `metadata` for chat state; `generationRuns`, `artifacts`, and `blobs` for image, video, speech, and transcription runs. `composePersistence` layers overrides on top of a base backend.

### Prove it with the conformance suite

The same suite every packaged backend runs is shipped for yours:

```typescript
import { runPersistenceConformance } from '@tanstack/ai-persistence/testkit'
import { sqlitePersistence } from './sqlite-persistence'

runPersistenceConformance('my sqlite adapter', () =>
  sqlitePersistence({ url: ':memory:', migrate: true }),
)
```

Stores you do not provide go in `skip`. The testkit is a Vitest suite; `vitest` is an optional peer dependency, so install it in your project before importing `@tanstack/ai-persistence/testkit`.

## Documentation

- [Overview](https://tanstack.com/ai/latest/docs/persistence/overview): the three steps, and which setup you want
- [Chat persistence](https://tanstack.com/ai/latest/docs/persistence/chat-persistence): the server middleware in full, including durable interrupts
- [Client persistence](https://tanstack.com/ai/latest/docs/persistence/client-persistence): the modes, storage backends, and what a reload restores
- [Build your own adapter](https://tanstack.com/ai/latest/docs/persistence/build-your-own-adapter)
- [Controls](https://tanstack.com/ai/latest/docs/persistence/controls): compose backends per store
- [Store reference](https://tanstack.com/ai/latest/docs/persistence/store-reference): every store's methods and how the records relate

## License

MIT
