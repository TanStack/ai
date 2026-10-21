---
title: Overview
id: memory-overview
order: 1
description: "Give a TanStack AI chat() call memory. memoryMiddleware recalls relevant memory into the prompt before the model runs, then saves each finished turn through an adapter that you choose."
keywords:
  - tanstack ai
  - memory
  - long-term memory
  - retrieval
  - persistence
  - middleware
  - rag
  - personalization
---

Your assistant forgets what the user told it. The user gives their name, their stack, or their preferences, and a few turns later the model asks again.

`memoryMiddleware` fixes this. It finds the memory that matters for each new message, adds it to the prompt, and saves each finished turn for later.

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

### 2. Add the middleware to `chat()`

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { memoryMiddleware } from '@tanstack/ai-memory'
import { inMemory } from '@tanstack/ai-memory/in-memory'

const memory = inMemory()

const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages: [{ role: 'user', content: 'Hello' }],
  middleware: [
    memoryMiddleware({
      adapter: memory,
      scope: { threadId: 'demo-thread', userId: 'alice' },
    }),
  ],
})
```

That is all the wiring. Memory runs on the server only, so your client code does not change.

The [Quickstart](./quickstart) puts this in a real server route with a client, and then makes it ready for production.

## How it works

Each run has two memory steps:

1. **Recall.** Before the model runs, the middleware sends the last user message to `adapter.recall(scope, query)`. The adapter returns a prompt block, and the middleware adds it to the system prompts. Some adapters also return tools that let the model read and write memory.
2. **Save.** After the stream finishes, the middleware gives the `{ user, assistant }` turn to `adapter.save(scope, turn)`. The save is deferred, so it never blocks the response.

The adapter does the rest: it extracts, ranks, renders, and stores. The middleware never reads a stored record.

If `recall` or `save` fails, the chat continues without memory. See [Operating memory](./operating).

## Pick an adapter

| You need | Use |
| --- | --- |
| Local development, tests, a demo | `inMemory()` |
| Memory that survives a restart and is shared across processes | `redis()` |
| A hosted memory service | `hindsight()`, `mem0()`, or `honcho()` |
| A backend that is not in the list | A [custom adapter](./custom-adapter) |

Every adapter has the same `recall` and `save` methods, so you can swap one for another and keep the rest of your code. [Adapters](./adapters) lists the options for each one.

> [!TIP]
> Memory is for context from earlier turns or earlier sessions. To keep the last few messages of the current request, send them in `messages`. You do not need memory for that.

## Scope: whose memory is it

`scope` tells the adapter which memory to read and write. `MemoryScope` is the same `Scope` type that `@tanstack/ai` uses for persistence:

```ts
type MemoryScope = {
  threadId: string // required, the same value as ChatMiddlewareContext.threadId
  userId?: string
  tenantId?: string
  namespace?: string // reserved, no adapter uses it yet
}
```

Set the scope on the server, from the session of the signed-in user:

- Read `userId` and `tenantId` from your auth session. Never read them from the request body.
- If the client sends `threadId`, make sure that the thread belongs to the session user before you use it.

Use the function form of `scope` to set the scope for each request. It gets the chat context:

```ts
import { memoryMiddleware } from '@tanstack/ai-memory'
import { inMemory } from '@tanstack/ai-memory/in-memory'

// Replace with your auth. Return the user from the session, not from the body.
function getUserId(): string {
  return 'demo-user'
}

const middleware = memoryMiddleware({
  adapter: inMemory(),
  scope: (ctx) => ({ threadId: ctx.threadId, userId: getUserId() }),
})
```

The built-in adapters match every scope field exactly. A read with no `tenantId` does not find a record written with a `tenantId`. For the fields that each adapter uses, see [Which Scope fields each adapter honors](./adapters#which-scope-fields-each-adapter-honors).

## Next

- [Quickstart](./quickstart): a full server route, a client, and a production adapter.
- [Adapters](./adapters): every adapter and its options.
- [Custom Adapter](./custom-adapter): write `recall` and `save` for your own backend.
- [Operating memory](./operating): telemetry, devtools, and what happens when memory fails.
