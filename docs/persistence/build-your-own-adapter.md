---
title: Build Your Own Adapter
id: build-your-own-adapter
description: "Store chat history in the database you already run. Write one store, pass it to withPersistence, and prove it with the conformance suite."
keywords:
  - persistence adapter
  - custom store
  - conformance suite
  - drizzle prisma d1 adapter
---

Your data lives in your own database (Postgres behind Prisma, a SQLite file, D1,
Mongo). You do not want a second service only for chat history.

You do not need one. An adapter is a plain object of store functions, and the
core never reads your tables. Here is the smallest adapter that works, in about
10 minutes.

## Quick setup

1. Install the package:

   <!-- ::start:tabs variant="package-manager" mode="install" -->

   react: @tanstack/ai-persistence
   vue: @tanstack/ai-persistence
   solid: @tanstack/ai-persistence
   svelte: @tanstack/ai-persistence
   preact: @tanstack/ai-persistence
   angular: @tanstack/ai-persistence
   vanilla: @tanstack/ai-persistence
   octane: @tanstack/ai-persistence

   <!-- ::end:tabs -->

2. Write a `messages` store. This one store is enough for `withPersistence`.
   Replace `db` with your own database handle:

   ```ts
   // persistence.ts
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

3. Pass it to `withPersistence` in your chat route:

   ```ts
   import {
     chat,
     chatParamsFromRequest,
     toServerSentEventsResponse,
   } from '@tanstack/ai'
   import { openaiText } from '@tanstack/ai-openai'
   import { withPersistence } from '@tanstack/ai-persistence'
   import { persistence } from './persistence'

   export async function POST(request: Request) {
     const params = await chatParamsFromRequest(request)
     const stream = chat({
       adapter: openaiText('gpt-6.1-sol'),
       messages: params.messages,
       threadId: params.threadId,
       runId: params.runId,
       middleware: [withPersistence(persistence)],
     })
     return toServerSentEventsResponse(stream)
   }
   ```

4. Prove the store with the conformance suite. Run it against a test database.
   List the stores that you do not provide in `skip`:

   ```ts
   // persistence.test.ts
   import { runPersistenceConformance } from '@tanstack/ai-persistence/testkit'
   // Point `db` at a test database before you run this file.
   import { persistence } from './persistence'

   runPersistenceConformance('my adapter', () => persistence, {
     skip: [
       'runs',
       'interrupts',
       'metadata',
       'activities',
       'generationRuns',
       'artifacts',
       'blobs',
     ],
   })
   ```

Send a message, then load the thread from your database. The transcript is
there.

## How it works

- `withPersistence` calls `loadThread` at the start of a run. It merges the
  stored thread with the incoming messages.
- It calls `saveThread` at the start of a run, at an interrupt, and when the run
  finishes. See [Chat persistence](./chat-persistence).
- `saveThread` always gets the complete, merged transcript. Your store
  overwrites the row. It never appends.
- There is one `define*Store` helper per store. Each helper type-checks your
  object inline, so you do not write a type annotation.
- The schema stays yours. The core never reads a column or a table name.

## Which stores do you need?

Each store turns on one capability. Find the row for the feature you want and
implement the stores in it:

| You want | Stores |
| --- | --- |
| Save the transcript | `messages` |
| Rejoin a run after a reload | `messages` + `runs` |
| Durable approvals | `messages` + `runs` + `interrupts` |
| App key/value state | `messages` + `metadata` |
| Persist generation runs | `generationRuns` |
| Keep generated files | `generationRuns` + `artifacts` + `blobs` |
| Rebuild sandbox files | `messages` + `artifacts` + `blobs` |

- **Rows stack.** Chat plus sandbox files means `messages` + `artifacts` +
  `blobs`. Durable approvals plus generated files means the union of both rows.
- **Two pairs stay together.** `interrupts` needs `runs`, and `artifacts` needs
  `blobs`.
- **Generation runs need no chat store.** See
  [Generation persistence](./generation-persistence).
- **Sandbox files also need a checkpoint store.** That store lives in
  `@tanstack/ai-sandbox`, not in this table. See
  [Keep Files After Reload](../sandbox/portable-snapshots-configure).

The usual production shape is `messages` + `runs` + `interrupts`. Add
`artifacts` and `blobs` when you keep generated files or rebuild sandbox files.

Then build each group:

- [Build a chat adapter](./build-your-own-chat-adapter): `messages`, `runs`,
  `interrupts`, and `metadata`, method by method, on SQLite.
- [Build a generation adapter](./build-your-own-generation-adapter):
  `generationRuns`, `artifacts`, and `blobs`.
- [Build a sandbox adapter](./build-a-sandbox-adapter): the sandbox instance
  store, and the fields a durable sandboxed run adds to `runs`. Read it only if
  you run sandboxes.

## Third-party adapters

These adapters are published and maintained outside TanStack AI. Each one
returns an `AIPersistence` for `withPersistence`, so the rest of this page
applies to them too.

| Adapter | Package | Backend | Stores |
| --- | --- | --- | --- |
| [Upstash](../community-adapters/upstash) | `@upstash/agentkit-tanstack-ai/persistence` | Upstash Redis, plus Upstash Blob for `blobs` | All seven |

Do you maintain an adapter? Add a row with a pull request. Run it against the
[conformance suite](#verify-with-the-conformance-suite) first, and list the
stores that it passes.

## Let your agent write it

`@tanstack/ai-persistence` ships [Agent Skills](../getting-started/agent-skills).
They turn this page into a recipe for your stack: your ORM configuration, your
schema file, and your database handle.

1. Install the skills into your coding assistant. Run this after the package is
   installed:

   <!-- ::start:tabs variant="package-manager" mode="local-install" -->

   react: @tanstack/intent@latest install
   vue: @tanstack/intent@latest install
   solid: @tanstack/intent@latest install
   svelte: @tanstack/intent@latest install
   preact: @tanstack/intent@latest install
   angular: @tanstack/intent@latest install
   vanilla: @tanstack/intent@latest install
   octane: @tanstack/intent@latest install

   <!-- ::end:tabs -->

2. Ask your assistant to "add chat persistence to this app".

There are recipes for these stacks:

- Drizzle
- Prisma
- Cloudflare D1
- Anything else (raw `pg`, Kysely, SQLite, Mongo, Supabase)

The skills are plain Markdown under
`node_modules/@tanstack/ai-persistence/skills/`, so you can also read them.

## Advanced

### Existing database: map the contracts onto your schema

Nothing on this page needs new tables.

- Name your columns as you like.
- Use your native types (`jsonb`, `timestamptz`) and convert them inside the
  store functions.
- Keep extra columns, such as `user_id` or audit timestamps, nullable or
  defaulted. The stores never write a column that they do not know.

Your existing migration tool owns these tables. See [Migrations](./migrations).

### Own only part of it

Put `messages` and `runs` in your database, and fill the rest from somewhere
else with `composePersistence`:

```ts
import { composePersistence, memoryPersistence } from '@tanstack/ai-persistence'
// Your own MessageStore and RunStore objects.
import { messages, runs } from './my-postgres-stores'

export const persistence = composePersistence(memoryPersistence(), {
  overrides: { messages, runs },
})
```

There is no transaction across the two systems, so a write that touches both is
two writes. The store invariants (idempotent creates, insert-if-absent) make a
retry of those writes safe. See [Controls](./controls) for every override rule.

### Verify with the conformance suite

Do not check a store by eye. Every packaged backend runs this suite, and it
ships for yours too. It calls every method of every store that you provide,
and it tests the ordering and idempotency rules that are easy to get wrong.

```ts
import { runPersistenceConformance } from '@tanstack/ai-persistence/testkit'
import { sqlitePersistence } from './sqlite-persistence'

runPersistenceConformance('my sqlite adapter', () =>
  sqlitePersistence({ url: ':memory:', migrate: true }),
)
```

Declare what you left out:

- A store that you do not provide goes in `skip`.
- An optional `runs` method that you do not implement goes in `skipMethods`.

```ts
import { runPersistenceConformance } from '@tanstack/ai-persistence/testkit'
import { chatOnlyPersistence } from './chat-only'

runPersistenceConformance('chat-only adapter', () => chatOnlyPersistence(), {
  skip: ['activities', 'generationRuns', 'artifacts', 'blobs'],
  skipMethods: ['runs.listByThread'],
})
```

The optional `runs` methods are `listByThread`, `listByParentRun`, and
`listReclaimable`.

- If you omit `listByThread` or `listReclaimable`, add it to `skipMethods`.
- If you omit `listByParentRun`, add nothing. The subagent checks skip on their
  own.

A store or method that is absent and not declared fails, with a message that
names what to add. A half-wired adapter cannot report a pass. When the suite is
green, your adapter works with `withPersistence`. With the generation stores, it
also works with `withGenerationPersistence`.

### Turn on the opt-in checks

Some checks are off by default, so an adapter that passed before still passes.
Turn them on to prove that your adapter supports run timings on reload
(`reconstructChat` with `includeRuns: true`):

```ts
import { runPersistenceConformance } from '@tanstack/ai-persistence/testkit'
import { sqlitePersistence } from './sqlite-persistence'

runPersistenceConformance(
  'my sqlite adapter',
  () => sqlitePersistence({ url: ':memory:', migrate: true }),
  { checks: ['messages.metadata', 'runs.listByThread.state'] },
)
```

- `messages.metadata`: `loadThread` returns the `metadata` of each message as it
  was saved.
- `runs.listByThread.state`: `listByThread` returns the current `status` and
  `finishedAt` of each run after `update`.

A check that you do not turn on shows as skipped, with the option to add.

### Reference

- [Store reference](./store-reference): every signature and invariant, and how
  the records relate.
- [Controls](./controls): compose stores from different systems.
- [Migrations](./migrations): who owns the schema.
- [Keep Files After Reload](../sandbox/portable-snapshots-configure): use this
  adapter for portable snapshots. You need `messages`, `artifacts`, and `blobs`.
