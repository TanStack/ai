---
title: Quickstart
id: memory-quickstart
order: 2
description: "Add memory to a TanStack AI chat route: install the package, create an adapter, add memoryMiddleware with a server-side scope, then move to Redis for production."
keywords:
  - tanstack ai
  - memory
  - quickstart
  - in-memory adapter
  - redis adapter
  - chat middleware
---

Add `memoryMiddleware` to a working chat route. The route recalls memory before each answer and saves each turn.

## Quick setup

### 1. Install the package

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-memory
vue: @tanstack/ai-memory
solid: @tanstack/ai-memory
svelte: @tanstack/ai-memory
preact: @tanstack/ai-memory
angular: @tanstack/ai-memory
vanilla: @tanstack/ai-memory
octane: @tanstack/ai-memory

<!-- ::end:tabs -->

### 2. Create the memory adapter

Start with `inMemory()`. It keeps records in a `Map` in the server process:

```ts
// memory.ts
import { inMemory } from '@tanstack/ai-memory/in-memory'

export const memory = inMemory()
```

### 3. Add the middleware to the server route

Set the scope from your auth session. The `onRecall` log lets you see memory work:

```ts
// api/chat.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { memoryMiddleware } from '@tanstack/ai-memory'
import { memory } from './memory'

// Replace with your auth. Read the user from the session, never from the body.
function getUserId(_request: Request): string {
  return 'demo-user'
}

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const userId = getUserId(request)

  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages: params.messages,
    threadId: params.threadId,
    middleware: [
      memoryMiddleware({
        adapter: memory,
        // In a real app, make sure that this thread belongs to userId.
        scope: { threadId: params.threadId, userId },
        onRecall: ({ result }) => {
          console.log('memory recalled', result.fragments?.length ?? 0, 'items')
        },
      }),
    ],
  })
  return toServerSentEventsResponse(stream)
}
```

### 4. Use the chat in the client

Memory runs on the server only. The client is a normal chat client:

```tsx
import { useState } from 'react'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

export function Chat() {
  const [input, setInput] = useState('')
  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    threadId: 'support-chat',
  })

  return (
    <>
      {messages.map((message) => (
        <div key={message.id}>
          {message.parts.map((part, index) =>
            part.type === 'text' ? <p key={index}>{part.content}</p> : null,
          )}
        </div>
      ))}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void sendMessage(input)
          setInput('')
        }}
      >
        <input value={input} onChange={(event) => setInput(event.target.value)} />
        <button type="submit">Send</button>
      </form>
    </>
  )
}
```

For Vue, Solid, Svelte, and the other frameworks, use the client from the [Quick Start](../getting-started/quick-start). Nothing in it changes for memory.

### 5. Try it

1. Send `My favorite language is TypeScript`.
2. Send `Which language do I like?`.

The server log shows `memory recalled 2 items` (or a similar count) for the second message. The first turn was saved and then recalled into the prompt.

## How it works

- Before the model runs, the adapter finds records in the same scope that match the last user message. They go into the system prompt.
- After the stream finishes, the adapter saves the user message and the assistant answer.
- `inMemory()` scores by word overlap and recency. Records are lost when the process restarts.

## Move to production

### Use Redis

`redis()` keeps memory across restarts and shares it between server processes. Change only `memory.ts`. The route stays the same:

```ts
// memory.ts
import Redis from 'ioredis'
import { redis } from '@tanstack/ai-memory/redis'

const client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379')

export const memory = redis({ redis: client })
```

Install `ioredis` (or `redis`) yourself. Both are optional peer dependencies. For `node-redis` and the other options, see [`redis()`](./adapters#redis).

To use a hosted service, export `hindsight()`, `mem0()`, or `honcho()` from `memory.ts` instead. See [Adapters](./adapters).

### Add semantic scoring (optional)

Word overlap misses a question that uses different words than the stored text. Add an `embedder` to `inMemory()` or `redis()` to also score by meaning:

```ts
// memory.ts
import OpenAI from 'openai'
import { inMemory } from '@tanstack/ai-memory/in-memory'

const openai = new OpenAI()

export const memory = inMemory({
  embedder: {
    async embed(text) {
      const result = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      })
      const embedding = result.data[0]?.embedding
      if (!embedding) throw new Error('embedding request returned no vector')
      return embedding
    },
  },
})
```

The embedder runs on each recall (for the query) and on each save (for the stored text).

Your route now remembers what the user says and can move to Redis with a one-file change. To log memory in production and watch it in devtools, see [Operating memory](./operating).
