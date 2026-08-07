---
title: Custom Adapter
id: memory-custom-adapter
order: 4
description: "Implement MemoryAdapter (recall/save) for pgvector, MongoDB, DynamoDB, or a hosted API."
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

# Custom memory adapter

If built-in adapters don't fit → implement `recall` + `save`. Contract overview: [Overview](./overview).

## Contract

```ts
// Shape of the contract (import the real type from `@tanstack/ai-memory`).
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
  inspect?(scope: MemoryScope): Promise<MemorySnapshot>
  listFacts?(scope: MemoryScope): Promise<Array<MemoryFact>>
}
```

Rules:

1. **`recall` decides relevance** — return `systemPrompt` (or `''`), optional fragments/tools/guidance
2. **`save` owns extraction** — turn → storage; one `SaveReceipt` per write
3. **Scopes stay isolated** — never leak across scopes

## 1. Scaffold

```ts
import type {
  MemoryAdapter,
  MemoryScope,
  MemoryTurn,
  RecallResult,
  SaveReceipt,
} from '@tanstack/ai-memory'

type Pool = {
  query: (
    text: string,
    values: Array<unknown>,
  ) => Promise<{ rows: Array<{ text: string }> }>
}

type Embed = (text: string) => Promise<Array<number>>

export function pgvectorMemory(options: {
  pool: Pool
  embed: Embed
}): MemoryAdapter {
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

Match every isolation dim exactly (including NULL). Without native search, load the scope and rank yourself.

## 2. Run the contract suite

```ts ignore
// tests/pgvector.test.ts
import { runMemoryAdapterContract } from '@tanstack/ai-memory/tests/contract'
import { pgvectorMemory } from '../src/pgvector'

runMemoryAdapterContract('pgvectorMemory', async () => {
  const pool = makeCleanPool()
  return pgvectorMemory({ pool, embed })
})
```

Checks: save→recall round-trip, scope isolation, empty recall, receipts, optional introspect.

## 3. Wire into middleware

```ts ignore
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

## Optional: expose tools from `recall`

Return `tools` + `toolGuidance` (see `hindsight()`). Middleware merges tools and injects guidance. Omit or `tools: []` if none.

## Pitfalls

1. Escape delimiters in composite keys so scope fields can't collide.
2. Empty scope → `{ systemPrompt: '' }`, not a throw.
3. Extraction lives in `save`, not the middleware.

## Next

- [Overview](./overview) · [Adapters](./adapters) · [Quickstart](./quickstart) · [Operating](./operating)
