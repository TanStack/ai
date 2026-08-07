---
title: Quickstart
id: memory-quickstart
order: 2
description: "Install @tanstack/ai-memory, pick an adapter, wire memoryMiddleware, derive scope server-side."
keywords:
  - tanstack ai
  - memory
  - quickstart
  - in-memory adapter
  - redis adapter
  - chat middleware
---

# Memory quickstart

If you already have `chat()` → add cross-session memory in five steps.

Contract first? [Overview](./overview).

## 1. Install

```bash
pnpm add @tanstack/ai-memory
```

Ships `memoryMiddleware`, `MemoryAdapter`, and adapters on subpaths.

## 2. Pick an adapter

| Adapter | When |
|---------|------|
| `inMemory()` | Dev, tests, single process (gone on restart) |
| `redis({ redis })` | Persist + multi-process |
| `hindsight()` / `mem0()` / `honcho()` | Hosted memory services |

Custom backends: [Custom Adapter](./custom-adapter).

## 3. Wire `memoryMiddleware`

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { memoryMiddleware } from '@tanstack/ai-memory'
import { inMemory } from '@tanstack/ai-memory/in-memory'

const memory = inMemory()

const stream = chat({
  adapter: openaiText('gpt-5.5'),
  messages: [{ role: 'user', content: 'Hello' }],
  middleware: [
    memoryMiddleware({
      adapter: memory,
      scope: { threadId: 'demo-thread', userId: 'alice' },
    }),
  ],
})
```

Each turn: recall into system prompt → deferred save after stream.

Swap for production without changing middleware shape:

```ts
import Redis from 'ioredis'
import { memoryMiddleware } from '@tanstack/ai-memory'
import { redis } from '@tanstack/ai-memory/redis'
import type { MemoryScope } from '@tanstack/ai-memory'

declare const scope: MemoryScope

const client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379')
const memory = redis({ redis: client })

memoryMiddleware({ adapter: memory, scope })
```

Hosted: `hindsight({ user })`, `mem0({ user })`, or `honcho({ user })`.

## 4. Semantic scoring (optional)

Default is lexical. Add `embedder` for large scopes / non-keyword queries:

```ts
import OpenAI from 'openai'
import { inMemory } from '@tanstack/ai-memory/in-memory'

const openai = new OpenAI()

const memory = inMemory({
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

## 5. Derive scope server-side

Never trust `userId` from the client body.

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { memoryMiddleware } from '@tanstack/ai-memory'
import type { ModelMessage } from '@tanstack/ai'
import type { MemoryAdapter } from '@tanstack/ai-memory'

declare const messages: Array<ModelMessage>
declare const memory: MemoryAdapter
declare const session: { userId: string; threadId: string }
declare function getSession(ctx: unknown): { threadId: string; userId: string }

const stream = chat({
  adapter: openaiText('gpt-5.5'),
  messages,
  context: { session },
  middleware: [
    memoryMiddleware({
      adapter: memory,
      scope: (ctx) => {
        const session = getSession(ctx)
        return { threadId: session.threadId, userId: session.userId }
      },
    }),
  ],
})
```

Client is unchanged — memory is server-only:

```ts
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'

function Chat() {
  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })
  return null // render messages, input, sendMessage, isLoading
}
```

## Next

- [Overview](./overview) · [Adapters](./adapters) · [Operating](./operating) · [Custom Adapter](./custom-adapter)
