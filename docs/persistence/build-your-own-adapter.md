---
title: Build Your Own Adapter
id: build-your-own-adapter
description: "Store chat history in the database you already run: implement one store, hand it to withPersistence, and prove it with the conformance suite."
keywords:
  - persistence adapter
  - custom store
  - conformance suite
  - drizzle prisma d1 adapter
---

# Build Your Own Persistence Adapter

Your data lives in your own database (Postgres behind Prisma, a SQLite file, D1,
Mongo) and you do not want another service just for chat history. You do not need
one. An adapter is a plain object of store functions. The core never looks at your
tables, so the schema stays yours.

## The smallest adapter that works

One store, `messages`, is enough for `withPersistence`. This is the whole thing:

```ts
import {
  defineAIPersistence,
  defineMessageStore,
} from '@tanstack/ai-persistence'
import { db } from './db'

export const persistence = defineAIPersistence({
  stores: {
    messages: defineMessageStore({
      // Return [] for a thread that was never saved, never null.
      loadThread: (threadId) => db.threads.messages(threadId),
      // The full transcript, not a delta. Overwrite what you had.
      saveThread: (threadId, messages) => db.threads.save(threadId, messages),
    }),
  },
})
```

Hand it to the middleware and you are done:

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

Already have tables? Nothing above assumes new ones. Name your columns whatever you
like, use your native types (`jsonb`, `timestamptz`), and convert inside the store
functions. Extra columns such as `user_id` or audit timestamps are fine as long as
they are nullable or defaulted, because these stores never touch a column they do not
know about. There is one `define*Store` helper per store, and each type-checks your
object inline so you never annotate it by hand.

## Which stores do you need?

Each store switches on one capability. Find your column and implement the rows marked
with a tick:

| Store | Save the transcript | Rejoin a run after reload | Durable approvals | App key/value | Persist generation runs | Keep generated files | Rebuild sandbox files |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| `messages` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| `runs` | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `interrupts` | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `metadata` | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `generationRuns` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| `artifacts` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| `blobs` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |

- **Columns stack.** Chat plus sandbox files means `messages` + `artifacts` +
  `blobs`. Durable approvals plus generated files means the union of both
  columns.
- **Two pairs cannot be split.** `interrupts` needs `runs`, and `artifacts`
  needs `blobs`.
- **Generation runs need none of the chat stores.** See
  [Generation persistence](./generation-persistence).
- **Sandbox files need a checkpoint store too.** That store lives on
  `@tanstack/ai-sandbox`, not in this table. See
  [Keep Files After Reload](../sandbox/portable-snapshots-configure).

The common production shape is `messages` + `runs` + `interrupts`. When you
keep generated files or rebuild sandbox files, add `artifacts` and `blobs`.

You can also own only part of it. Put `messages` and `runs` in your database and fill
the rest from somewhere else with `composePersistence`:

```ts
import { composePersistence, memoryPersistence } from '@tanstack/ai-persistence'
import { messages, runs } from './my-postgres-stores'

export const persistence = composePersistence(memoryPersistence(), {
  overrides: { messages, runs },
})
```

That gives you no transaction across the two systems, so a write touching both is two
writes. The store invariants (idempotent creates, insert-if-absent) are what make
retrying them safe.

## Let your agent write it

`@tanstack/ai-persistence` ships [Agent Skills](../getting-started/agent-skills) that
turn this into a recipe against your stack: your ORM config, your schema file, your
database handle.

```bash
pnpm add @tanstack/ai-persistence
npx @tanstack/intent@latest install
```

Then ask for "add chat persistence to this app". There are recipes for Drizzle,
Prisma, Cloudflare D1, and anything else (raw `pg`, Kysely, SQLite, Mongo, Supabase).
The skills are plain Markdown under
`node_modules/@tanstack/ai-persistence/skills/` if you would rather read them.

## Prove it with the conformance suite

Do not eyeball it. The same suite every packaged backend runs is shipped for yours. It
exercises every method of every store you provide, including the ordering and
idempotency rules that are easy to get subtly wrong.

```ts
import { runPersistenceConformance } from '@tanstack/ai-persistence/testkit'
import { sqlitePersistence } from './sqlite-persistence'

runPersistenceConformance('my sqlite adapter', () =>
  sqlitePersistence({ url: ':memory:', migrate: true }),
)
```

Declare what you left out. A store you do not provide goes in `skip`, and an optional
`runs` method goes in `skipMethods`:

```ts
import { runPersistenceConformance } from '@tanstack/ai-persistence/testkit'
import { chatOnlyPersistence } from './chat-only'

runPersistenceConformance('chat-only adapter', () => chatOnlyPersistence(), {
  skip: ['generationRuns', 'artifacts', 'blobs'],
  skipMethods: ['runs.listByThread'],
})
```

Anything absent and undeclared fails with a message naming exactly what to add, so a
half-wired adapter cannot report a pass. When this is green, your adapter is a drop-in
for `withPersistence`, and with the generation stores for
`withGenerationPersistence` too.

## Where to go next

- [Build a chat adapter](./build-your-own-chat-adapter): the full SQLite walkthrough
  for all four chat stores, method by method.
- [Build a generation adapter](./build-your-own-generation-adapter): generation runs,
  artifacts and blobs.
- [Build a sandbox adapter](./build-a-sandbox-adapter): the sandbox instance store, and
  what a durable sandboxed run adds to `runs`. Only if you run sandboxes.
- [Keep Files After Reload](../sandbox/portable-snapshots-configure): reuse this
  adapter for portable snapshots. You need `messages`, `artifacts`, and `blobs`.
- [Store reference](./store-reference): every signature and invariant, and how the
  records relate.
- [Controls](./controls): compose stores from different systems.
- [Migrations](./migrations): who owns the schema.
