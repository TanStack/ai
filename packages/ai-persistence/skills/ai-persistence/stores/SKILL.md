---
name: ai-persistence/stores
description: >
  Implement the MessageStore, RunStore, InterruptStore, MetadataStore contracts
  for @tanstack/ai-persistence against any database. defineAIPersistence,
  composePersistence overrides, critical invariants (full-replace saveThread,
  insert-if-absent createOrResume and interrupt create), authorize thread
  access, runPersistenceConformance testkit. Use whenever you need server
  persistence — the package ships contracts, not a backend for your database.
type: sub-skill
library: tanstack-ai
library_version: '0.0.0'
sources:
  - 'TanStack/ai:docs/persistence/build-your-own-adapter.md'
  - 'TanStack/ai:docs/persistence/controls.md'
  - 'TanStack/ai:packages/ai-persistence/src/types.ts'
---

# Persistence Stores

> Builds on **ai-persistence** and **ai-persistence/server**.

`@tanstack/ai-persistence` ships **contracts**, not a backend for your
database. An adapter is an object with a `stores` map; implement the stores you
need against whatever you already run and hand the result to
`withPersistence`. The core never inspects your tables, so the schema is yours.

Use `memoryPersistence()` for dev and tests. Everything durable is an adapter
you write. This skill is the contract reference; the per-stack recipes that
write a `chat-persistence.ts` into an app are
`ai-persistence/build-{drizzle,prisma,cloudflare,custom}-adapter`, and
a complete `node:sqlite` implementation lives in
`examples/ts-react-chat/src/lib/sqlite-persistence.ts`.

## Choose a shape

```ts
import { defineAIPersistence } from '@tanstack/ai-persistence'
import type { ChatWithInterruptsPersistence } from '@tanstack/ai-persistence'

// Sparse is fine — only implement what you need.
export const persistence: ChatWithInterruptsPersistence = defineAIPersistence({
  stores: {
    messages, // required for withPersistence / reconstructChat
    runs, // required if you have interrupts
    interrupts,
    // metadata optional
  },
})
```

| Shape                           | Contents                                         |
| ------------------------------- | ------------------------------------------------ |
| `ChatTranscriptPersistence`     | `messages` (+ optional runs/interrupts/metadata) |
| `ChatWithInterruptsPersistence` | `messages` + `runs` + `interrupts`               |
| `ChatPersistence`               | all four chat stores                             |

`defineAIPersistence` preserves exact keys and rejects unknown keys at runtime.

**Annotate your factory with a named shape.** Bare `AIPersistence` is the
all-optional sparse bag, so `withPersistence` and `reconstructChat` reject it
(`stores.messages` is possibly `undefined`). This is the single most common
mistake when writing an adapter.

**`stores` accepts exactly four keys** — `messages`, `runs`, `interrupts`,
`metadata`. Anything else (notably `locks` or sandbox instance maps) throws
`Unknown AIPersistence store key` at runtime and fails to type-check. Locks:
**ai-core/locks** / `@tanstack/ai/locks`. Sandbox instance resume:
`@tanstack/ai-sandbox`.

## Contracts and invariants

### `MessageStore`

```ts
interface MessageStore {
  loadThread(threadId: string): Promise<Array<ModelMessage>>
  saveThread(threadId: string, messages: Array<ModelMessage>): Promise<void>
}
```

- `loadThread` → `[]` for unknown threads (never `null`).
- `saveThread` is a **full overwrite**, not append. A one-message payload wipes history.

### `RunStore`

```ts
interface RunStore {
  createOrResume(input: {
    runId: string
    threadId: string
    status?: RunStatus
    startedAt: number
  }): Promise<RunRecord>
  update(
    runId: string,
    patch: Partial<
      Pick<RunRecord, 'status' | 'finishedAt' | 'error' | 'usage'>
    >,
  ): Promise<void>
  get(runId: string): Promise<RunRecord | null>
  findActiveRun(threadId: string): Promise<RunRecord | null>
}
```

- **`createOrResume`**: if `runId` exists, return it **unchanged** (ignore new
  fields). Idempotent retries / resume depend on this.
- **`update`**: missing `runId` is a **no-op** (do not throw, do not insert).
- **`findActiveRun`**: latest `'running'` for `threadId` (max `startedAt`);
  this is what `reconstructChat` uses to reconnect a reloading client without a
  client-held run id. Stub it out and reconnect silently stops working — `null`
  is also the correct answer for an idle thread, so nothing can detect the
  difference.

Every method is **required**. Capability tiers live at the store level (omit
`runs` and declare `ChatTranscriptStores`), never at the method level.

### `InterruptStore`

```ts
interface InterruptStore {
  create(record: Omit<InterruptRecord, 'status' | 'resolvedAt'>): Promise<void>
  resolve(interruptId: string, response?: unknown): Promise<void>
  cancel(interruptId: string): Promise<void>
  get(interruptId: string): Promise<InterruptRecord | null>
  list(threadId: string): Promise<Array<InterruptRecord>>
  listPending(threadId: string): Promise<Array<InterruptRecord>>
  listByRun(runId: string): Promise<Array<InterruptRecord>>
  listPendingByRun(runId: string): Promise<Array<InterruptRecord>>
}
```

- `create` always births `'pending'`; **insert-if-absent** on `interruptId`
  (never clobber resolved back to pending).
- All `list*` ordered by `requestedAt` ascending.
- Requires a `runs` store when used with chat persistence.

### `MetadataStore`

```ts
interface MetadataStore {
  get(namespace: string, key: string): Promise<unknown | null>
  set(namespace: string, key: string, value: unknown): Promise<void>
  delete(namespace: string, key: string): Promise<void>
}
```

- The first argument is an **app-defined namespace string**, not the `Scope`
  identity type — despite SQL backends conventionally naming the column
  `scope`.
- Identity is **two fields** `(namespace, key)` — do not join with `:`
  (`('a:b','c')` and `('a','b:c')` must stay distinct).
- Stored `null` is type-indistinguishable from absence; wrap if you must
  persist real null (`{ value: null }`).
- SQL backends usually reject nullish `set` (NOT NULL JSON columns) with a
  clear `TypeError` — match that or document your semantics.

## Timestamp convention

Store _records_ (`RunRecord`, `InterruptRecord`) speak **epoch milliseconds**
(`number`). Wire/result references that leave the persistence layer speak
**ISO-8601 strings**; the middleware converts at the boundary. Do not mix the
two on one field.

## Minimal message store example

Type each store with its `define*Store` helper (`defineMessageStore`,
`defineRunStore`, `defineInterruptStore`, `defineMetadataStore`): pass the object
literal and get autocomplete + contract checking inline, with no `: MessageStore`
annotation. The result composes into `defineAIPersistence` with exact presence.

```ts
import { defineMessageStore } from '@tanstack/ai-persistence'
import type { ModelMessage } from '@tanstack/ai'

const threads = new Map<string, Array<ModelMessage>>()

export const messages = defineMessageStore({
  async loadThread(threadId) {
    return [...(threads.get(threadId) ?? [])]
  },
  async saveThread(threadId, next) {
    threads.set(threadId, [...next])
  },
})
```

For durable DBs, preserve the same semantics with upserts / full-row replace.

## Adopt part of it

You rarely need all four stores in the same system. Implement the ones you own
and fill the rest from another base with `composePersistence`:

```ts
import { composePersistence, memoryPersistence } from '@tanstack/ai-persistence'
import { messages, runs } from './my-postgres-stores'

export const persistence = composePersistence(memoryPersistence(), {
  overrides: { messages, runs },
})
```

Only listed keys move; others stay on the base. Pass `false` to drop a store.
There is **no cross-store transaction** — if `messages` lives in Postgres and
`interrupts` in Redis, a write touching both is two writes. The store
invariants (idempotent `createOrResume`, insert-if-absent `create`) are exactly
what make those retries safe.

`composePersistence` accepts the four state keys. Locks and sandbox instance
maps are not composable here.

## Map onto an existing schema

- **Your column names, your types.** Name columns anything; use `jsonb`,
  `timestamptz`, whatever — convert in the row mapper. The record shape the
  methods return is fixed; how you store it is not.
- **Extra columns are fine.** Add `user_id`, audit columns, a tenant id. Keep
  them nullable or defaulted so the store's inserts still succeed. The stores
  never read or write columns they do not know about.
- **Omit absent optionals** in row mappers (`...(row.error != null ? { error: row.error } : {})`)
  so records compare cleanly.

## Authorization

Store methods take bare `threadId`s. **Authorize at the route** before
`loadThread` / `saveThread` / `reconstructChat({ authorize })`. Derive user
identity from session, not the client body alone.

## Conformance tests (required)

```ts
import { runPersistenceConformance } from '@tanstack/ai-persistence/testkit'
import { myPersistence } from '../src/persistence'

runPersistenceConformance('my-backend', () => myPersistence())

// Declare intentional omissions — only the four state stores are valid keys:
// runPersistenceConformance('msgs-only', () => p, {
//   skip: ['runs', 'interrupts', 'metadata'],
// })
```

The testkit is the compatibility gate: round-trips, rich message shapes,
empty-thread `[]`, `createOrResume` idempotency, interrupt insert-if-absent,
list ordering, composite-key non-aliasing. A missing store that is not listed
in `skip` fails loudly.

`skip` accepts only `'messages' | 'runs' | 'interrupts' | 'metadata'`. **Do not
pass `'locks'`** — it is not a state store and the suite does not cover it.

Reference implementation: `memoryPersistence()` in `@tanstack/ai-persistence`.

## Common mistakes

### CRITICAL: Append-only `saveThread`

Breaks the authoritative-history contract.

### CRITICAL: `createOrResume` overwriting existing runs

Breaks safe resume / double-submit.

### CRITICAL: Interrupt `create` upserting to pending

Can resurrect a resolved approval.

### HIGH: Returning bare `AIPersistence` from the factory

`withPersistence` rejects it. Annotate a named shape.

### HIGH: `list*` without stable `requestedAt` order

Middleware and tests assume ascending order.

### HIGH: Skipping the testkit

Silent semantic drift shows up as stuck approvals or wiped history in prod.

## Cross-references

- **ai-persistence/server** — when middleware calls each store
- **ai-persistence/build-drizzle-adapter** / **-prisma-** / **-cloudflare-** / **-custom-** — per-stack recipes
- **ai-core/locks** — not a state store
