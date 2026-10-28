---
title: Custom Adapter
id: memory-custom-adapter
order: 4
description: "Write a recall/save MemoryAdapter for a backend that TanStack AI does not ship, such as pgvector, MongoDB, DynamoDB, or a hosted memory service. Two methods, one shared contract test."
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

A custom memory adapter is an object with `recall` and `save`. Use one for pgvector, MongoDB, DynamoDB, or a hosted memory API.

This page builds a pgvector adapter. The same shape works for any backend.

## Quick setup

### 1. Write the adapter

`save` stores the turn. `recall` returns the records that match the query, as a prompt block:

```ts
// pgvector.ts
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

// Your embedding client. Swap in OpenAI, Cohere, a local model, and more.
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
          `INSERT INTO memory (thread_id, user_id, tenant_id, role, text, embedding)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            scope.threadId,
            scope.userId ?? null,
            scope.tenantId ?? null,
            row.role,
            row.text,
            JSON.stringify(vector),
          ],
        )
      }
      return [{ ok: true }]
    },

    async recall(scope: MemoryScope, query: string): Promise<RecallResult> {
      const q = await embed(query)
      // Match every isolation field exactly (including NULL). An omitted
      // tenant or user must not match rows written with a tenant or user.
      const { rows } = await pool.query(
        `SELECT text, 1 - (embedding <=> $1::vector) AS score
           FROM memory
          WHERE thread_id = $2
            AND user_id IS NOT DISTINCT FROM $3::text
            AND tenant_id IS NOT DISTINCT FROM $4::text
          ORDER BY score DESC
          LIMIT 6`,
        [
          JSON.stringify(q),
          scope.threadId,
          scope.userId ?? null,
          scope.tenantId ?? null,
        ],
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

### 2. Run the contract suite

`runMemoryAdapterContract` from `@tanstack/ai-memory/testkit` is a Vitest suite. Give it a factory that returns a fresh adapter:

```ts ignore
// ignore: imports the `../src/pgvector` module you wrote in Step 1.
// tests/pgvector.test.ts
import { runMemoryAdapterContract } from '@tanstack/ai-memory/testkit'
import { pgvectorMemory } from '../src/pgvector'

runMemoryAdapterContract('pgvectorMemory', async () => {
  const pool = makeCleanPool() // truncate between tests for a fresh adapter
  return pgvectorMemory({ pool, embed })
})
```

The suite checks:

- A saved turn comes back in a later `recall`.
- `recall` on an empty scope returns an empty prompt.
- `recall` never returns data from another `threadId`, `userId`, or `tenantId`.
- `save` returns at least one receipt with `ok: true`.
- `inspect` and `listFacts`, if you add them, return well-formed data.

`inMemory()` and `redis()` run the same suite.

### 3. Add it to `memoryMiddleware`

When the suite passes, use your adapter like a built-in one:

```ts ignore
// ignore: imports the `./pgvector` module you wrote in Step 1, and assumes
// `pool`, `embed`, `messages`, and `scope` from your app.
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { memoryMiddleware } from '@tanstack/ai-memory'
import { pgvectorMemory } from './pgvector'

const memory = pgvectorMemory({ pool, embed })

const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages,
  threadId: 'thread-1',
  middleware: [memoryMiddleware({ adapter: memory, scope })],
})
```

Your backend now gives memory to every chat that uses this middleware.

## How it works

The middleware calls only the adapter methods. It never reads your records.

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
  name?: string // optional label for logs, defaults to id
  recall(scope: MemoryScope, query: string): Promise<RecallResult>
  save(scope: MemoryScope, turn: MemoryTurn): Promise<Array<SaveReceipt>>
  inspect?(scope: MemoryScope): Promise<MemorySnapshot> // optional (devtools)
  listFacts?(scope: MemoryScope): Promise<Array<MemoryFact>> // optional (devtools)
}
```

| Member | What it does |
| --- | --- |
| `id` | A stable name for logs and devtools. |
| `name` | Optional. A readable label for logs. The default is `id`. |
| `recall(scope, query)` | Decides what is relevant. Returns a rendered `systemPrompt` (an empty string when there is nothing), plus optional `fragments`, `tools`, and `toolGuidance`. You choose the ranking: lexical, vector, hybrid, or what your vendor gives. |
| `save(scope, turn)` | Owns extraction. Turns the `{ user, assistant }` turn into what you store. Returns one `SaveReceipt` per write. |
| `inspect(scope)` | Optional. A full snapshot for the devtools panel. |
| `listFacts(scope)` | Optional. A flat fact list for the devtools panel. |

Your adapter owns scope isolation. A `recall` for one scope must never return data from another scope.

## Advanced

### Give the model memory tools

`recall` can return `tools` and `toolGuidance`. Then the model can read or write memory itself. The `hindsight()` adapter uses this for its retain, recall, and reflect tools.

- The middleware adds your tools to the tools of the run. It skips a tool when the run already has a tool with the same name.
- The middleware puts `toolGuidance` in the system prompts before the recalled `systemPrompt`.
- If your adapter has no tools, return `tools: []` or leave it out.

### Pitfalls

- **Keep scopes isolated.** If you put the scope into one composite key, escape the delimiter. Then a `threadId`, `userId`, or `tenantId` that contains the delimiter cannot match another scope.
- **Do not throw for an empty scope.** Return `{ systemPrompt: '' }` from `recall`.
- **Do extraction in `save`.** The middleware does not derive facts. It gives you the raw turn. Store it or summarize it as you need.
- **Backends without search.** Load the records of the scope and rank them in your code.
