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

`RunStatus`, `TerminalRunStatus`, `RunRecord`, `RunStore`, `defineRunStore`, and
`isTerminalRunStatus` are defined in `@tanstack/ai` and re-exported from
`@tanstack/ai-persistence`. Import those from either; the recipes in this skill
import from `@tanstack/ai-persistence` so an adapter author needs only one
package name.

**`RunError` is the exception — it is NOT re-exported.** Import it from
`@tanstack/ai` directly (`import type { RunError } from '@tanstack/ai'`); the
`@tanstack/ai-persistence` barrel has no such export and the import fails to
resolve.

Three methods are required (`createOrResume` / `update` / `get`). Three are
optional: implement only the ones your backend needs, and leave the rest off the
object entirely (not `undefined`, just absent). A three-method `RunStore` is a
fully valid backend.

`withPersistence` itself calls **none** of the three optional methods, so leaving
all of them off costs nothing in the middleware. Their consumers are elsewhere,
and each absence disables exactly one feature:

| method            | consumer                                                       | absent ⇒                                             |
| ----------------- | -------------------------------------------------------------- | ---------------------------------------------------- |
| `findActiveRun`   | `reconstruct.ts` (`stores.runs?.findActiveRun?.(threadId)`)     | no rejoin-by-thread; reconstruction answers `null`    |
| `listReclaimable` | `reapDetachedRuns` in `@tanstack/ai-sandbox`                    | the store cannot be reaped at all                    |
| `listByThread`    | application code — nothing in the framework calls it            | nothing framework-side breaks                        |

Each consumer feature-detects with `store.method?.(...)` and degrades rather than
throwing.

The conformance testkit does not feature-detect. An optional method that is
missing and not declared in `skipMethods` fails the suite, so an omission is
always a choice you made on purpose rather than a check that quietly did not
run. Declare yours and the suite reports them as skipped with a reason:

```ts
// The shipped sqlite example implements findActiveRun and listReclaimable and
// declares only the one it omits.
runPersistenceConformance('sqlite', () => persistence, {
  skipMethods: ['runs.listByThread'],
})
```

```ts
interface RunStore {
  // Required
  createOrResume(
    input: Pick<RunRecord, 'runId' | 'threadId' | 'startedAt'> & {
      status?: RunStatus
    },
  ): Promise<RunRecord>
  update(
    runId: string,
    patch: Partial<
      Pick<
        RunRecord,
        | 'status'
        | 'finishedAt'
        | 'error'
        | 'usage'
        | 'sandboxKey'
        | 'detachedSince'
        | 'cancelRequested'
        | 'driverEpoch'
      >
    >,
  ): Promise<void>
  get(runId: string): Promise<RunRecord | null>

  // Optional
  listByThread?(threadId: string): Promise<Array<RunRecord>>
  listReclaimable?(opts: {
    now: number
    ttlMs: number
  }): Promise<Array<RunRecord>>
  findActiveRun?(threadId: string): Promise<RunRecord | null>
}
```

`RunStatus` is `'running' | 'interrupted' | 'completed' | 'failed' | 'aborted'`.
`'interrupted'` is a human-in-the-loop pause, not terminal: it is what
interrupt-resume continues from, and must never be conflated with `'aborted'`
(an explicit cancellation). `TerminalRunStatus` narrows to
`'completed' | 'failed' | 'aborted'`. `isTerminalRunStatus(status)` is a type
predicate: `(status: RunStatus) => status is TerminalRunStatus`, so calling it
inside a guard narrows `status` to `TerminalRunStatus` for the rest of that
branch, with no cast needed.

`RunRecord.error` is a structured `RunError`, not a bare string:

```ts
interface RunError {
  message: string
  code?: string
}
```

`message` is the provider's prose (it changes between model versions and
cannot be branched on); `code` is the stable, machine-branchable
classification a consumer switches over to retry, escalate, or show specific
UI. Store both, and omit `code` from a mapped record when its column is
`null` rather than writing `code: undefined` (`...(row.errorCode != null ? { code: row.errorCode } : {})`).

`defineRunStore<const T extends RunStore>(store: T): T` returns the passed
object's own type, so an optional method your store implements (say,
`listByThread`) stays known-present on the returned value instead of widening
back to `RunStore`'s `| undefined`. You get autocomplete and contract checking
without a separate `: RunStore` annotation, and without a feature-detection
guard on your own return value.

#### The durable-agent-runs fields: `sandboxKey`, `detachedSince`, `cancelRequested`, `driverEpoch`

These four `RunRecord` fields exist for the sandbox/durable-run layer to
reattach a run a client disconnected from, and for out-of-band cancellation.
A `RunStore` you write must round-trip all four through `update` → `get`, even
if your app does not use sandboxes yet — the conformance testkit checks this
unconditionally (it is not behind `skipMethods`, because `update`/`get` are
REQUIRED methods).

- **`sandboxKey`** — compound key identifying the sandbox this run is bound
  to, so a reclaimer can find it to tear down.
- **`detachedSince`** — epoch ms when the last viewer detached; absent while
  someone is attached. Read by `listReclaimable`.
- **`cancelRequested`** — set by an explicit out-of-band cancel (see below),
  distinct from a mere disconnect.
- **`driverEpoch`** — monotonic fencing token, bumped by each host that
  claims the run, so a superseded host can discover it lost by comparing the
  stored value against the one it holds.

**Fresh-run reads must be `undefined`, not a coerced falsy default.** A
backend that reads a `NULL`/absent column back as `cancelRequested: false` or
`driverEpoch: 0` is claiming knowledge it does not have ("explicitly not
cancelled") — that is a different fact from "never set". Omit the field from
the mapped record instead
(`...(row.cancel_requested != null ? { cancelRequested: row.cancel_requested !== 0 } : {})`).

**`update` must use `'field' in patch`, not `patch.field !== undefined`, for
these four.** A caller clears `detachedSince` on reattach by passing it
explicitly as `undefined` — `store.update(runId, { detachedSince: undefined })`
— and that must write `NULL`, not be filtered out of the write. Checking
`!== undefined` cannot tell "clear this field" apart from "I didn't mention
this field", so it silently drops the clear and the run looks permanently
detached to the reaper forever after. `'detachedSince' in patch` is `true` for
an explicit `undefined` and `false` when the caller omitted the key entirely —
that is the distinction you need. The same applies to `cancelRequested`
(`false` is a real, meaningful value, not "unset") and to `sandboxKey` /
`driverEpoch`. See `examples/ts-react-chat/src/lib/sqlite-persistence.ts` for
a worked implementation of exactly this pattern.

#### Out-of-band cancellation

Cancel intent is **never inferred from a disconnect** — a user pressing Stop
and a user closing the tab produce an identical connection close, so the two
are indistinguishable from the abort alone. `@tanstack/ai` exports the actual
primitives:

- **`requestRunCancel`** — records durable cancel intent (writes
  `cancelRequested: true` through a `RunStore`), for a run being driven on a
  host other than the one handling the cancel request.
- **`wasCancelRequested`** — reads that intent back.
- **`RUN_CANCEL_REASON`** — the well-known abort reason string used for the
  in-process case (the same host aborting its own signal), paired with
  `isCancelRequestedReason` to check for it.

A `RunStore` you write does not call these directly — they operate on your
store through `update`/`get` — but `cancelRequested` must round-trip
faithfully (previous section) for the durable path to work at all.

- **`createOrResume`** (required): if `runId` exists, return it **unchanged**,
  ignoring the passed `threadId` / `startedAt` / `status`. Resuming a run does
  not reset `startedAt` or overwrite its current status. Idempotent retries and
  double-submit depend on this. `status` defaults to `'running'` on first
  creation.
- **`update`** (required): missing `runId` is a **no-op** (do not throw, do not
  insert).
- **`get`** (required): current record, or `null` when unknown.
- **`listByThread`** (optional): every run for `threadId`, ascending by
  `startedAt`. Only needed to render a thread's past agent activity.
- **`listReclaimable`** (optional): runs where `status === 'running'` AND
  `detachedSince` is set AND `detachedSince <= now - ttlMs`. The cutoff is
  inclusive: a run detached exactly at the cutoff qualifies. This is a query, not
  automatic behavior — the consumer is `reapDetachedRuns` from
  `@tanstack/ai-sandbox`, which the application schedules itself (cron, queue,
  `alarm()`, `waitUntil`), so returning this list has no side effect until that
  sweep runs. `detachedSince` is written for you by `withSandbox`'s detach path
  (alongside `sandboxKey`) and cleared by the takeover path; drop either field and
  nothing can reclaim the sandbox. `cancelRequested` is written by
  `requestRunCancel` and read by `wasCancelRequested`, and the reaper's expiry
  path goes through `requestRunCancel` to stop a run past its TTL.
- **`findActiveRun`** (optional): the most recent `'running'` run for
  `threadId` (max `startedAt`), or `null` if none is active. Enables reconnect
  from a stable thread id without a client-held run id.

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

// Declare an intentionally-unimplemented OPTIONAL RunStore method with
// skipMethods, so vitest reports it as a real SKIPPED case:
// runPersistenceConformance('my-backend', () => myPersistence(), {
//   skipMethods: ['runs.listByThread', 'runs.listReclaimable'],
// })
```

The testkit is the compatibility gate: round-trips, rich message shapes,
empty-thread `[]`, `createOrResume` idempotency, interrupt insert-if-absent,
list ordering, composite-key non-aliasing. A missing store that is not listed
in `skip` fails loudly.

`skip` accepts only `'messages' | 'runs' | 'interrupts' | 'metadata'`. **Do not
pass `'locks'`** — it is not a state store and the suite does not cover it.

**`skipMethods` (declare-or-fail for optional `RunStore` methods).** A backend
that omits an OPTIONAL `RunStore` method (`findActiveRun`, `listByThread`,
`listReclaimable`) must declare it in `skipMethods` as `'runs.<method>'`, e.g.
`skipMethods: ['runs.listByThread', 'runs.listReclaimable']`. An omitted
method that is NOT declared throws with an actionable message instead of
silently reporting a pass; a declared one is reported as a SKIPPED vitest
case, never as a pass. A case that did not run must never be
indistinguishable from one that did. See
`examples/ts-react-chat/src/lib/sqlite-persistence.test.ts` for a worked
example: it declares `skipMethods: ['runs.listByThread']` only, keeping both
`findActiveRun` and `listReclaimable` under test.

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

### HIGH: `listReclaimable` cutoff off by one

The cutoff is inclusive (`detachedSince <= now - ttlMs`). Using a strict `<`
drops runs detached exactly at the boundary.

### HIGH: Treating `listReclaimable` as automatic reclamation

It is a query a caller runs, not something the package acts on by itself.
Nothing reaps a returned run for you.

## Cross-references

- **ai-persistence/server** — when middleware calls each store
- **ai-persistence/build-drizzle-adapter** / **-prisma-** / **-cloudflare-** / **-custom-** — per-stack recipes
- **ai-core/locks** — not a state store
