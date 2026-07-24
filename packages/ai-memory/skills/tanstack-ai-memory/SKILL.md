---
name: tanstack-ai-memory
description: Use when wiring memoryMiddleware from @tanstack/ai-memory into a chat() call — covers the recall/save adapter contract, scope shape and server-side scope security, the recall-inject / deferred-save lifecycle, choosing an adapter (inMemory, redis, hindsight, mem0, honcho), and devtools events.
---

# TanStack AI Memory Middleware

Use this when adding **server-side memory** to a `chat()` call. Everything lives in
`@tanstack/ai-memory`. A memory adapter is a single contract with two verbs — `recall`
and `save` — and the middleware is thin: it recalls into the system prompt before the
model runs and defers `save` after the turn finishes.

## When to reach for it

- A user expects "remember what I told you last time."
- Per-user or per-thread context that must survive across sessions.
- A hosted memory service (mem0, Honcho, Hindsight).

Do NOT use this just to keep recent messages — that's the `messages` array on `chat()`.
Memory is for cross-turn / cross-session recall, not within-turn history.

## Wire it up

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { memoryMiddleware } from '@tanstack/ai-memory'
import { inMemory } from '@tanstack/ai-memory/in-memory'

const memory = inMemory() // dev/tests only — see the in-memory skill

const stream = chat({
  adapter: openaiText('gpt-5.5'),
  messages,
  context: { session }, // attached by your auth middleware
  middleware: [
    memoryMiddleware({
      adapter: memory,
      // Derive scope server-side from trusted session state.
      scope: (ctx) => {
        const session = getSession(ctx)
        return { sessionId: session.threadId, userId: session.userId }
      },
    }),
  ],
})
```

`memoryMiddleware` options: `adapter`, `scope` (static or a function of `ctx`),
`role` (`'recall+save'` default, or `'save-only'`), and `onRecall` / `onSave` telemetry
callbacks.

## The contract

```ts
interface MemoryAdapter {
  id: string
  recall(scope, query): Promise<RecallResult> // { systemPrompt, fragments?, tools?, toolGuidance? }
  save(scope, turn): Promise<Array<SaveReceipt>> // turn = { user, assistant }; extraction lives HERE
  inspect?(scope): Promise<MemorySnapshot> // optional (devtools)
  listFacts?(scope): Promise<Array<MemoryFact>> // optional (devtools)
}
```

- `recall` decides relevance and renders a `systemPrompt`; it may also return `tools` +
  `toolGuidance` to hand the model direct control of memory (hindsight does this).
- `save` owns extraction — turning the raw turn into whatever gets persisted.

## Scope security

`MemoryScope` is `{ sessionId, userId? }` and is the isolation boundary. **Never trust a
client-supplied `userId`/`sessionId`.** Resolve scope server-side from session/auth and
pass the validated session through `chat({ context: { session } })`. If you accept a
thread id from the request body, validate it belongs to the session user BEFORE using it.

## Adapters

- `inMemory()` from `@tanstack/ai-memory/in-memory` — dev, tests, single-process demos.
- `redis({ redis })` from `@tanstack/ai-memory/redis` — production, plain Redis.
- `hindsight()` / `mem0()` / `honcho()` — hosted memory services (optional peer SDKs).
- Custom — implement `recall`/`save` and run `@tanstack/ai-memory/tests/contract`.

## Failure modes

Memory failures are non-fatal: a throwing `recall` or `save` emits `memory:error` and
the run continues with degraded memory. Streaming is never blocked; a failed save never
fails the turn.

## Devtools

Five events on `aiEventClient` (from `@tanstack/ai-event-client`):
`memory:retrieve:started` / `:completed`, `memory:persist:started` / `:completed`,
`memory:error` (`phase: 'recall' | 'save'`). Payloads carry the adapter id and
fragment/receipt counts, not full memory text.
