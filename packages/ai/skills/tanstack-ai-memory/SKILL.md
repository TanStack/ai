---
name: tanstack-ai-memory
description: Use when wiring memoryMiddleware from @tanstack/ai/memory into a chat() call — covers scope shape, server-side scope security, retrieval/persistence semantics, and the extension hooks (shouldRetrieve, rerank, extractMemories, onToolResult, afterPersist).
---

# TanStack AI Memory Middleware

Use this when adding **server-side memory** to a `chat()` call. Memory persists across user turns and is retrieved relevance-first into the system prompt.

## When to reach for it

- A user expects "remember what I told you last time."
- Multi-tenant chat where each tenant/user/thread has its own context.
- A bot that should learn preferences or extracted facts over time.

Do NOT use this just to keep recent messages — that's the `messages` array on `chat()`. Memory is for cross-turn / cross-session recall, not within-turn history.

## Wire it up

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { memoryMiddleware } from '@tanstack/ai/memory'
import { inMemoryMemoryAdapter } from '@tanstack/ai-memory'

const memory = inMemoryMemoryAdapter() // dev/tests only — see in-memory skill

// In a real handler you'd attach the server-validated session (and any
// other per-request values you trust) via `chat({ context })`. Inside the
// middleware, scope is then derived from `ctx.context` — never from a
// request body field the client controls.
type AppCtx = {
  session: {
    tenantId: string
    userId: string
    activeThreadId: string
  }
}

// Stand-in for whichever embedding client you use (OpenAI, Cohere, local
// model, etc.). The middleware only requires `embed(text): number[]`.
declare const myEmbeddings: {
  embed(text: string): Promise<Array<number>>
}

const stream = chat({
  adapter: openaiText('gpt-4o'),
  messages,
  context: { session }, // attached by your auth middleware
  middleware: [
    memoryMiddleware({
      adapter: memory,
      scope: (ctx) => {
        const { session } = ctx.context as AppCtx
        return {
          tenantId: session.tenantId,
          userId: session.userId,
          threadId: session.activeThreadId,
        }
      },
      // Optional: provide an embedder for semantic search.
      embedder: {
        async embed(text) {
          return myEmbeddings.embed(text)
        },
      },
    }),
  ],
})
```

## Scope security

Scope is the isolation boundary. **Never trust client-supplied tenantId/userId.** Resolve scope server-side from session/auth:

```ts
scope: (ctx) => {
  const { session } = ctx.context as AppCtx
  return {
    tenantId: session.tenantId, // from server-validated session
    userId: session.userId, // from server-validated session
    threadId: session.activeThreadId, // server-side resolved thread
  }
}
```

Pass the validated session through `chat({ context: { session } })`. If you need to accept a `threadId` from the request body, validate server-side that it belongs to `session.userId` BEFORE attaching it to the chat context — never feed an unvalidated body field straight into scope.

## Adapters

- `inMemoryMemoryAdapter()` — dev, tests, single-process demos. See `tanstack-ai-memory-in-memory` skill.
- `redisMemoryAdapter({ redis })` — production. See `tanstack-ai-memory-redis` skill.
- Custom — implement `MemoryAdapter` from `@tanstack/ai/memory`.

## Extension hooks

| Hook                                                                   | When                        | Use for                                              |
| ---------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------- |
| `shouldRetrieve({ userText, scope })`                                  | before search               | Skip retrieval (cost, content gating)                |
| `rerank(hits, { scope, query, ctx })`                                  | after search, before render | MMR / RRF / cross-encoder rerankers                  |
| `shouldRemember({ message, responseText })`                            | before persist              | Drop short / sensitive messages                      |
| `extractMemories({ userText, responseText, scope, adapter })`          | after model finishes        | Add/update/delete records (Mem0-style consolidation) |
| `onToolResult({ toolName, toolCallId, args, result, scope, adapter })` | per completed tool call     | Persist tool outputs as `kind: 'tool-result'`        |
| `afterPersist({ newRecords, scope, adapter })`                         | after add                   | Background work: summarization, eviction             |

`extractMemories` and `onToolResult` may return `MemoryRecord[]` (treated as all-add) or `MemoryOp[]` for mixed ADD/UPDATE/DELETE.

## Failure modes

Default `strict: false` — retrieval/persist failures emit `memory:error` devtools events and a callback (`events.onError`), but the chat run continues. Set `strict: true` in tests or compliance-sensitive deploys to make failures throw.

## Devtools

Five events on `aiEventClient` (from `@tanstack/ai-event-client`):
`memory:retrieve:started`, `memory:retrieve:completed`, `memory:persist:started`, `memory:persist:completed`, `memory:error`. Hits and records carry a 200-char `preview` only — full text is never streamed by default.
