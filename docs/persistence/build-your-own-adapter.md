---
title: Build Your Own Adapter
id: build-your-own-adapter
description: "Implement store functions against your DB, hand them to withPersistence, prove with the conformance suite."
keywords:
  - persistence adapter
  - custom store
  - conformance suite
  - drizzle prisma d1 adapter
---

# Build Your Own Persistence Adapter

If you need chat history in the database you already run → implement store methods as plain objects. Core never inspects your tables.

## Smallest adapter that works

**Must:** `messages` only.

```ts
import {
  defineAIPersistence,
  defineMessageStore,
} from '@tanstack/ai-persistence'
import { db } from './db'

export const persistence = defineAIPersistence({
  stores: {
    messages: defineMessageStore({
      // [] for unknown thread, never null
      loadThread: (threadId) => db.threads.messages(threadId),
      // full transcript overwrite, not a delta
      saveThread: (threadId, messages) => db.threads.save(threadId, messages),
    }),
  },
})
```

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { withPersistence } from '@tanstack/ai-persistence'
import { persistence } from './persistence'

export const stream = chat({
  adapter: openaiText('gpt-5.5'),
  messages: [{ role: 'user', content: 'hi' }],
  threadId: 'support-chat',
  middleware: [withPersistence(persistence)],
})
```

Existing tables: any column names/types; convert inside store functions. Extra columns (`user_id`, audit) fine if nullable/defaulted. Use `define*Store` helpers — they type-check inline.

## Which stores?

| Store | Transcript | Rejoin run | Approvals | App KV | Generation runs | Generated files |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| `messages` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `runs` | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `interrupts` | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `metadata` | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| `generationRuns` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| `artifacts` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `blobs` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

**Rules:**

1. Columns stack (need approvals + files → union).
2. Pairs: `interrupts` needs `runs`; `artifacts` needs `blobs`.
3. Generation stores feed `withGenerationPersistence` only — [Generation persistence](./generation-persistence).

Common production: `messages` + `runs` + `interrupts`.

Partial own + fill rest:

```ts
import { composePersistence, memoryPersistence } from '@tanstack/ai-persistence'
import { messages, runs } from './my-postgres-stores'

export const persistence = composePersistence(memoryPersistence(), {
  overrides: { messages, runs },
})
```

No cross-system transaction. Idempotent creates make retries safe.

## Let your agent write it

```bash
pnpm add @tanstack/ai-persistence
npx @tanstack/intent@latest install
```

Ask: "add chat persistence to this app". Recipes: Drizzle, Prisma, D1, raw `pg`, Kysely, SQLite, Mongo, Supabase. Skills under `node_modules/@tanstack/ai-persistence/skills/`.

## Prove with conformance

```ts
import { runPersistenceConformance } from '@tanstack/ai-persistence/testkit'
import { sqlitePersistence } from './sqlite-persistence'

runPersistenceConformance('my sqlite adapter', () =>
  sqlitePersistence({ url: ':memory:', migrate: true }),
)
```

Declare skips:

```ts
import { runPersistenceConformance } from '@tanstack/ai-persistence/testkit'
import { chatOnlyPersistence } from './chat-only'

runPersistenceConformance('chat-only adapter', () => chatOnlyPersistence(), {
  skip: ['generationRuns', 'artifacts', 'blobs'],
  skipMethods: ['runs.listByThread'],
})
```

Absent + undeclared → fail naming the gap. Green → drop-in for `withPersistence` / `withGenerationPersistence`.

## Next

- [Build a chat adapter](./build-your-own-chat-adapter) — SQLite, all four chat stores
- [Build a generation adapter](./build-your-own-generation-adapter) — generationRuns, artifacts, blobs
- [Build a sandbox adapter](./build-a-sandbox-adapter) — sandbox instance store + durable run fields
- [Store reference](./store-reference) — signatures and invariants
- [Controls](./controls) — compose stores
- [Migrations](./migrations) — schema ownership
