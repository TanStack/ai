---
title: Memory Middleware
id: memory-middleware
order: 1
description: "Persist and recall context across turns and sessions in TanStack AI — the memoryMiddleware retrieves relevant records into the prompt, then deferred-persists user, assistant, and tool turns through a pluggable adapter."
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

`memoryMiddleware` plugs server-side memory into a `chat()` run. It retrieves relevant records from a pluggable adapter into the system prompt before the model runs, then asynchronously persists what should be remembered after the run finishes. It is the right tool when you need recall **across turns or across sessions** — not for keeping recent messages in the same request.

> **Want a copy-paste setup before reading the contract?** See the [Memory Quickstart](../guides/memory-quickstart) guide.

## When to reach for it

| Need | Use this |
|------|----------|
| "Remember what the user told me last week" | Memory middleware + persistent adapter |
| "Each tenant or user has its own context" | Memory middleware with scoped adapter calls |
| "Cache expensive tool results across requests" | Memory middleware with `onToolResult` + `kind: 'tool-result'` |
| Keep the last N turns in the same request | Just pass them in `messages` — memory is overkill |

Memory is for cross-turn / cross-session recall. The `messages` array on `chat()` already covers within-turn history.

## Adapter contract

Adapters are thin storage. They persist, fetch, search, and isolate by scope — they do not decide what to remember or how to render hits. Every backend implements the same seven methods:

| Method | Purpose |
|--------|---------|
| `name` | Stable identifier used in logs and devtools. |
| `add(records)` | Upsert one or many records by `id`. Same id replaces. |
| `get(id, scope)` | Fetch a single record. Returns `undefined` for missing, out-of-scope, or expired records. |
| `update(id, scope, patch)` | Patch a record in place. Preserves `id`/`scope`/`createdAt`, bumps `updatedAt`. |
| `search(query)` | Relevance-ranked search within a scope. Strategy (lexical / semantic / hybrid) is adapter-defined. |
| `list(scope, options)` | Non-relevance browsing — for inspectors, admin tools, exports. |
| `delete(ids, scope)` | Remove ids within a scope. Out-of-scope ids are silently skipped. |
| `clear(scope)` | Wipe everything matching a scope. Empty scope (`{}`) is treated as misuse. |

Three invariants every adapter MUST uphold: **scope isolation** (no cross-scope reads or writes), **expiry filtering** (`expiresAt` records are excluded from reads), and **id uniqueness** across all scopes.

Built-in adapters live in `@tanstack/ai-memory`:

```ts
import { inMemoryMemoryAdapter, redisMemoryAdapter } from '@tanstack/ai-memory'
```

Custom adapters implement `MemoryAdapter` from `@tanstack/ai/memory`.

## Scope and security

`MemoryScope` is the isolation boundary. Every key is optional and orthogonal — the adapter rejects cross-scope reads and writes:

```ts
import type { MemoryScope } from '@tanstack/ai/memory'

type MemoryScope = {
  tenantId?: string
  userId?: string
  sessionId?: string
  threadId?: string
  namespace?: string
}
```

**Always derive scope server-side from trusted state.** Accepting `tenantId` or `userId` from the request body is how one user reads another user's memory. The function form on `scope` is the recommended pattern — it runs per request and has access to the validated chat context:

```ts
memoryMiddleware({
  adapter,
  scope: (ctx) => {
    const session = (ctx.context as AppCtx).session // server-validated
    return {
      tenantId: session.tenantId,
      userId: session.userId,
      threadId: session.activeThreadId,
    }
  },
})
```

Pass the validated session through `chat({ context: { session } })`. The static form (`scope: { tenantId: 'acme' }`) is fine for single-tenant or test fixtures, but the function form is safer in any multi-tenant deployment.

## Retrieval flow

Retrieval runs once per `chat()` invocation, during the `init` phase:

1. `shouldRetrieve({ userText, scope })` — optional gate. Return `false` to skip retrieval entirely for this turn.
2. `adapter.search({ scope, text, embedding?, topK, minScore, kinds })` — the adapter decides whether to use the embedding (semantic), the text (lexical), or both (hybrid).
3. `rerank(hits, { scope, query, ctx })` — optional re-rank between search and render. Plug in MMR, RRF, or a cross-encoder.
4. `render(hits)` — formats the final hit set into a string injected into the prompt. Defaults to `defaultRenderMemory`.

An `embedder` is **optional**. Adapters that support semantic search (Redis with vector ops, hosted vector DBs) need one; lexical-only setups don't.

## Persistence flow

Persistence is **deferred** via `ctx.defer` — it runs after the chat stream finishes and never blocks the response:

1. `shouldRemember({ message, responseText })` — optional gate on whether to write at all this turn.
2. The middleware persists user and assistant turns as `kind: 'message'`.
3. `extractMemories({ userText, responseText, scope, adapter })` — return a `MemoryOp[]` (mixed add/update/delete) or `MemoryRecord[]` (treated as all-add) to capture facts, preferences, or summaries.
4. For each completed tool call, `onToolResult({ toolName, toolCallId, args, result, scope, adapter })` — same return shape, typically used to persist results as `kind: 'tool-result'`.
5. `afterPersist({ newRecords, scope, adapter })` — fires after `adapter.add` commits, with newly-added records (not updates or deletes).

## Extension hooks

| Hook | Phase | Use for |
|------|-------|---------|
| `shouldRetrieve` | before search | Skip retrieval for cheap turns or content-gated requests |
| `rerank` | between search and render | MMR, RRF, recency boosts, cross-encoder rerankers |
| `shouldRemember` | before persist | Drop short, sensitive, or transient messages |
| `extractMemories` | after model finishes | Mem0-style consolidation — extract facts and preferences |
| `onToolResult` | per completed tool call | Persist tool outputs as `kind: 'tool-result'` |
| `afterPersist` | after `adapter.add` commits | Background work — summarisation, eviction, indexing |

`extractMemories` and `onToolResult` may return `MemoryRecord[]` (shorthand: all-add) or `MemoryOp[]` (mixed `add` / `update` / `delete`).

## Devtools events

The middleware emits five events on `aiEventClient` (from `@tanstack/ai-event-client`):

| Event | When |
|-------|------|
| `memory:retrieve:started` | Retrieval path begins (after `shouldRetrieve` returns true) |
| `memory:retrieve:completed` | Final hit set is ready (post-rerank, pre-render) |
| `memory:persist:started` | Persist path is about to call `adapter.add` |
| `memory:persist:completed` | `adapter.add` succeeded |
| `memory:error` | Retrieval, persistence, or extraction threw |

Hits and records carry a 200-character `preview` only — full text is never streamed by default, so devtools never leak full memory contents.

For application telemetry that should not depend on devtools being installed, use the `events.*` callbacks on `MemoryMiddlewareOptions` (`onRetrieveStart`, `onRetrieveEnd`, `onPersistStart`, `onPersistEnd`, `onError`).

## Failure modes

By default `strict: false` — retrieval and persistence failures emit `memory:error` (and call `events.onError`), but the chat run continues with degraded memory. Set `strict: true` when memory correctness is more important than uptime, for example in compliance-sensitive deployments or in tests where a missed write is worse than a failed turn.

## TypeScript types

```ts
import type {
  MemoryAdapter,
  MemoryRecord,
  MemoryRecordPatch,
  MemoryScope,
  MemoryQuery,
  MemorySearchResult,
  MemoryListOptions,
  MemoryListResult,
  MemoryHit,
  MemoryKind,
  MemoryRole,
  MemoryEmbedder,
  MemoryOp,
  MemoryMiddlewareOptions,
} from '@tanstack/ai/memory'
```

## Next steps

- [Memory Quickstart](../guides/memory-quickstart) — wire the middleware into a real `chat()` call in five steps
- [Middleware](../advanced/middleware) — the underlying `chat()` middleware lifecycle and hooks
- [Observability](../advanced/observability) — subscribe to `memory:*` events for tracing
