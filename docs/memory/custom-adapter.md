---
title: Custom Adapter
id: memory-custom-adapter
order: 4
description: "Write a recall/save MemoryAdapter for a backend that isn't shipped, such as pgvector, MongoDB, DynamoDB, or a hosted memory service. Two methods, one shared contract test."
keywords:
  - tanstack ai
  - memory
  - custom adapter
  - MemoryAdapter
  - recall
  - save
  - pgvector
  - contract suite
---

You have a backend in mind (pgvector, MongoDB, DynamoDB, a hosted memory API) and the
built-in `inMemory()` / `redis()` adapters don't fit. A memory adapter is just an object
with two methods, `recall` and `save`, so this is a short guide.

> **First time looking at memory?** Start with the [Overview](./overview) for what the
> contract is and how the middleware uses it.

## The contract

```ts
// The MemoryAdapter contract, from `@tanstack/ai-memory`:
import type { MemoryAdapter } from '@tanstack/ai-memory'
```

```ts
// The shape of the contract, shown for reference.
import type {
  MemoryFact,
  MemoryScope,
  MemorySnapshot,
  MemoryTurn,
  RecallResult,
  SaveReceipt,
} from '@tanstack/ai-memory'

interface MemoryAdapter {
  id: string
  recall(scope: MemoryScope, query: string): Promise<RecallResult>
  save(scope: MemoryScope, turn: MemoryTurn): Promise<Array<SaveReceipt>>
  inspect?(scope: MemoryScope): Promise<MemorySnapshot> // optional (devtools)
  listFacts?(scope: MemoryScope): Promise<Array<MemoryFact>> // optional (devtools)
}
```

Two rules the middleware relies on:

1. **`recall` decides relevance.** Return a rendered `systemPrompt` (empty string when
   there's nothing), plus optional `fragments`, `tools`, and `toolGuidance`. Ranking
   strategy is entirely yours: lexical, vector, hybrid, or vendor-native.
2. **`save` owns extraction.** Turn the `{ user, assistant }` turn into whatever you
   persist. Return one `SaveReceipt` per underlying write.

Scope isolation is your responsibility: a `recall` for one `scope` must never surface
another scope's data.

## Step 1: Scaffold

```ts
import type {
  MemoryAdapter,
  MemoryScope,
  MemoryTurn,
  RecallResult,
  SaveReceipt,
} from '@tanstack/ai-memory'

// node-postgres' Pool, minimally. In your project, use the real type instead:
//   import type { Pool } from 'pg'
type Pool = {
  query: (
    text: string,
    values: Array<unknown>,
  ) => Promise<{ rows: Array<{ text: string }> }>
}

// Your embedding client. Swap in OpenAI, Cohere, a local model, etc.
type Embed = (text: string) => Promise<Array<number>>

export function pgvectorMemory(options: { pool: Pool; embed: Embed }): MemoryAdapter {
  const { pool, embed } = options
  return {
    id: 'pgvector',

    async save(scope: MemoryScope, turn: MemoryTurn): Promise<Array<SaveReceipt>> {
      const rows = [
        { role: 'user', text: turn.user },
        { role: 'assistant', text: turn.assistant },
      ]
      for (const row of rows) {
        const vector = await embed(row.text)
        await pool.query(
          `INSERT INTO memory (session_id, user_id, role, text, embedding)
           VALUES ($1, $2, $3, $4, $5)`,
          [scope.sessionId, scope.userId ?? null, row.role, row.text, JSON.stringify(vector)],
        )
      }
      return [{ ok: true }]
    },

    async recall(scope: MemoryScope, query: string): Promise<RecallResult> {
      const q = await embed(query)
      const { rows } = await pool.query(
        `SELECT text, 1 - (embedding <=> $1::vector) AS score
           FROM memory
          WHERE session_id = $2 AND ($3::text IS NULL OR user_id = $3)
          ORDER BY score DESC
          LIMIT 6`,
        [JSON.stringify(q), scope.sessionId, scope.userId ?? null],
      )
      const fragments = rows.map((r) => ({ text: r.text, source: 'pgvector' }))
      const systemPrompt = fragments.length
        ? `Relevant memory:\n${fragments.map((f) => `- ${f.text}`).join('\n')}`
        : ''
      return { systemPrompt, fragments }
    },
  }
}
```

The shape generalizes: every method takes a `scope`, does its backend-specific work,
and keeps scopes isolated. For a backend without native search, load the scope's
records and rank them yourself.

## Step 2: Run the contract suite

`@tanstack/ai-memory/tests/contract` exports `runMemoryAdapterContract`. Point it at a
factory that returns a fresh adapter. It verifies the save then recall round-trip, scope
isolation, empty recall, receipt shape, and the optional introspection methods.

```ts ignore
// ignore: imports the `../src/pgvector` module you wrote in Step 1.
// tests/pgvector.test.ts
import { runMemoryAdapterContract } from '@tanstack/ai-memory/tests/contract'
import { pgvectorMemory } from '../src/pgvector'

runMemoryAdapterContract('pgvectorMemory', async () => {
  const pool = makeCleanPool() // truncate between tests for a fresh adapter
  return pgvectorMemory({ pool, embed })
})
```

## Step 3: Wire it into `memoryMiddleware`

Once the suite is green, the adapter is interchangeable with the built-ins:

```ts ignore
// ignore: imports the `./pgvector` module you wrote in Step 1, and assumes
// `messages` / `scope` from your app.
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { memoryMiddleware } from '@tanstack/ai-memory'
import { pgvectorMemory } from './pgvector'

const memory = pgvectorMemory({ pool, embed })

const stream = chat({
  adapter: openaiText('gpt-5.5'),
  messages,
  middleware: [memoryMiddleware({ adapter: memory, scope })],
})
```

The middleware never inspects the adapter's internals. `recall`/`save` is the entire
interface.

## Exposing tools (optional)

`recall` can return `tools` and `toolGuidance` to give the model direct control over
memory (this is how the `hindsight()` adapter exposes retain/recall/reflect tools). The
middleware merges them into the run's tools and injects the guidance ahead of the
recalled prompt. Return `tools: []` (or omit it) when your adapter exposes none.

## Pitfalls

- **Keep scopes isolated.** If you serialize scope into a composite key, escape your
  delimiter so a `sessionId`/`userId` containing it can't collide with another scope.
- **`recall` must not throw for an empty scope.** Return `{ systemPrompt: '' }`.
- **Extraction lives in `save`.** Don't expect the middleware to derive facts. The raw
  turn is handed to you; store or summarize it however you like.

## Where to go next

- [Overview](./overview): the `recall`/`save` contract, scope, and how a turn flows
- [Adapters](./adapters): the built-in and vendor adapters, with every option
- [Quickstart](./quickstart): wire `memoryMiddleware` into a real `chat()` call
- [Operating memory](./operating): options, telemetry, devtools events, and failures
