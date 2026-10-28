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

# @tanstack/ai-memory

Pluggable memory adapters for TanStack AI's `memoryMiddleware`

`memoryMiddleware` gives a `chat()` call memory across turns and sessions: each turn it recalls relevant memory into the system prompt, then saves the finished user/assistant turn through an adapter. The package ships the middleware, the `MemoryAdapter` contract, the built-in adapters, and adapters for hosted memory services, each on its own subpath.

## Installation

```bash
npm install @tanstack/ai-memory
# or
pnpm add @tanstack/ai-memory
# or
yarn add @tanstack/ai-memory
```

## Usage

### Wire `memoryMiddleware` into `chat()`

Start with the in-memory adapter, then swap it for a persistent one without changing anything else:

```typescript
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

### Derive scope server-side

`scope` is the isolation boundary. In a real app, derive it per request from server-validated session data, never from the request body:

```typescript
memoryMiddleware({
  adapter: memory,
  scope: (ctx) => {
    const session = getSession(ctx)
    return { threadId: session.threadId, userId: session.userId }
  },
})
```

Memory is entirely server-side; the client consumes the same stream as any other `chat()` endpoint.

## Adapters

| Adapter       | Import                          | Backing store                                              |
| ------------- | ------------------------------- | ---------------------------------------------------------- |
| `inMemory()`  | `@tanstack/ai-memory/in-memory` | A `Map` in the current process. Development, tests, demos. |
| `redis()`     | `@tanstack/ai-memory/redis`     | Redis, via your own `ioredis` or `redis` client.           |
| `hindsight()` | `@tanstack/ai-memory/hindsight` | A hosted Hindsight server.                                 |
| `mem0()`      | `@tanstack/ai-memory/mem0`      | A mem0 server, over plain HTTP.                            |
| `honcho()`    | `@tanstack/ai-memory/honcho`    | A hosted Honcho server.                                    |

### Redis

```typescript
import Redis from 'ioredis'
import { redis } from '@tanstack/ai-memory/redis'

const memory = redis({ redis: new Redis(process.env.REDIS_URL) })
```

Using `redis` (node-redis) instead of `ioredis`? Wrap the client with `fromNodeRedis` from the same subpath.

### Semantic scoring

The built-in adapters score lexically by default. Pass an `embedder` for semantic recall when scopes grow large or queries don't share keywords with stored text:

```typescript
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

### Hosted services

`hindsight()`, `mem0()`, and `honcho()` map `recall`/`save` onto the vendor API. `@vectorize-io/hindsight-client` and `@honcho-ai/sdk` are optional peer dependencies, loaded lazily by their adapters; `mem0()` needs no SDK.

## Custom adapters

Implement the `MemoryAdapter` contract — a stable `id` plus `recall` and `save` — then prove it with the same contract suite the built-in adapters run:

```typescript
import { runMemoryAdapterContract } from '@tanstack/ai-memory/testkit'
import { myAdapter } from './my-adapter'

runMemoryAdapterContract('myAdapter', () => myAdapter())
```

The testkit is a Vitest suite. `vitest` is an optional peer dependency, so install it in your project before importing `@tanstack/ai-memory/testkit`.

## Documentation

- [Overview](https://tanstack.com/ai/latest/docs/memory/overview): the `recall`/`save` contract, scope, and how a turn flows
- [Quickstart](https://tanstack.com/ai/latest/docs/memory/quickstart)
- [Adapters](https://tanstack.com/ai/latest/docs/memory/adapters): every adapter's options
- [Operating memory](https://tanstack.com/ai/latest/docs/memory/operating): options, telemetry, devtools events, and failures
- [Custom Adapter](https://tanstack.com/ai/latest/docs/memory/custom-adapter)

## License

MIT
