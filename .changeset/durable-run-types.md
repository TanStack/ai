---
'@tanstack/ai': minor
'@tanstack/ai-persistence': minor
'@tanstack/ai-durable-stream': patch
'@tanstack/ai-sandbox': minor
'@tanstack/ai-sandbox-cloudflare': minor
---

One run is now described by one record. Chat persistence and the sandbox run driver both read and write the same `RunRecord`, so they can no longer disagree about the status of a given `runId`.

- **`RunStatus`** (`'running' | 'interrupted' | 'completed' | 'failed' | 'aborted'`), **`TerminalRunStatus`** (`'completed' | 'failed' | 'aborted'`), **`RunRecord`**, **`RunError`**, **`RunStore`**, **`isTerminalRunStatus`**, **`defineRunStore`**, and **`InMemoryRunStore`** now live in `@tanstack/ai` (`packages/ai/src/activities/chat/middleware/run-store.ts`). A `RunStore` needs `createOrResume` / `update` / `get` / `findActiveRun`; `listByThread` and `listReclaimable` are optional.
- `RunRecord.error` is a structured **`RunError`** (`{ message: string; code?: string }`) instead of a bare `string`. `RUN_ERROR` chunks carry a provider `code`, and the Cloudflare event log already populated one, so a bare message forced consumers to string-match provider prose to decide whether to retry or escalate.
- `isTerminalRunStatus` is now a type predicate (`status is TerminalRunStatus`) over an exhaustiveness-checked map, so a caller inside the guard can pass the status where a `TerminalRunStatus` is required without a cast. Purely additive.
- `defineRunStore` is now generic (`<const T extends RunStore>(store: T): T`), so an optional method the implementation actually provides stays known-present on the result instead of collapsing back to `| undefined` on the interface. Purely additive.
- `AbortInfo` gains an optional `cancelRequested` field, and core populates it: `packages/ai/src/activities/chat/index.ts` sets it from the abort reason via `isCancelRequestedReason(reason)` — `true` for the `RUN_CANCEL_REASON` sentinel, `false` for any other abort. `stream-to-response.ts` relies on it to refuse treating an explicit cancel as a detach, so a user pressing Stop always gets a closed, terminal log. Middleware reading it to tell an explicit cancel from a plain disconnect gets a real answer.

### `StreamDurability`: single-argument `append`, upsert as a separate capability

`StreamDurability.append` takes exactly one argument:

```ts
append: (chunks: Array<StreamChunk>) => Promise<Array<TOffset>>
```

Idempotent re-persistence of an already-stored range is a separate, optional method on a separate interface:

```ts
export interface UpsertableStreamDurability<
  TOffset extends string = string,
> extends StreamDurability<TOffset> {
  upsert: (
    entries: Array<{ chunk: StreamChunk; offset: TOffset }>,
  ) => Promise<Array<TOffset>>
}
```

Pairing every chunk with its offset structurally makes a length mismatch, a sparse hole, and an unpaired chunk unrepresentable. `memoryStream` returns `UpsertableStreamDurability` and validates the whole batch before mutating any stored state, rejecting a foreign-format offset, an offset minted for a different run, a duplicate within one batch, and a new offset claiming a position at or before the current tail. `durableStream` in `@tanstack/ai-durable-stream` returns a plain `StreamDurability` and deliberately does **not** implement `upsert`, because its offsets embed a backend-assigned cursor a caller cannot choose: a consumer that requires upsert now gets a compile error at the wiring site instead of a runtime throw, and the guard that used to raise `DurableStreamError` for caller-supplied offsets is gone.

### Breaking: `@tanstack/ai-persistence`

- `RunStatus` widened to include `'aborted'` (previously `'running' | 'completed' | 'failed' | 'interrupted'`). The union appears in a read position (`get(): Promise<RunRecord | null>`), so an exhaustive `switch` over `record.status` with a `never` default in your code stops compiling until it handles `'aborted'`.
- Run types are re-exported from `@tanstack/ai` rather than declared here, so the `runs` store is typed against core's `RunStore` directly. `MemoryRunStore` implements both optional list methods, and the shared conformance testkit covers them.
- `runPersistenceConformance` accepts `skipMethods`. An optional method that is missing **and** not declared in `skipMethods` now throws instead of silently passing, so an existing backend running the suite may see a new failure telling it to implement the method or declare the omission.
- `RunRecord.error` changing from `string` to `RunError` costs no migration today: this package is still unreleased at `0.0.0`.

### Breaking: `@tanstack/ai-sandbox`

The package's own run-tracking types are gone in favor of the core ones:

- `RunEventLog`, `InMemoryRunEventLog`, `RunEvent`, and `RunEventLogReadOptions` are removed. If you were reading sandbox run events for Cloudflare, the same event-log implementation now lives in `@tanstack/ai-sandbox-cloudflare/agent`.
- `RunError` is removed along with the package's local `RunRecord`, `RunStatus`, `TerminalRunStatus`, and `isTerminalRunStatus`. Import these from `@tanstack/ai` instead.
- `pipeToRunLog` and `RunController` no longer take an event log. They take `RunDeps: { runs: RunStore; durability: (runId: string) => StreamDurability<TOffset>; logger?: InternalLogger }` — `durability` is a **per-run factory**, not a single instance (see the durable-agent-runs-takeover entry for why a single instance was unsafe).
- `RunController.attach` takes `(runId, fromOffset, signal?)`: the run being attached, an opaque `fromOffset: TOffset` (`string` by default) minted by `StreamDurability` instead of a numeric `fromSeq`, and an optional abort signal.
- `threadId` is now a required field wherever a run is created or looked up.
- Terminal status names changed to match the shared `TerminalRunStatus`: `done` is now `completed`, `error` is now `failed`, `aborted` stays `aborted`. The event log that moved to `@tanstack/ai-sandbox-cloudflare` converged on the same vocabulary, with a live-data migration for records persisted under the old one (see below).

`pipeToRunLog` is now total: it never rejects. `RunDeps.logger` is an optional sink for the failures the driver absorbs (a failing `runs.update`, a failing `durability.close()`, a record that vanished before the terminal re-read), because a detached run has no caller left to receive an error. Every exit path still terminalizes, so a store or log failure no longer leaves a run wedged at `'running'` with live tailers parked on a log that never closes.

### Breaking: `@tanstack/ai-sandbox-cloudflare`

New home of the run event log. `@tanstack/ai-sandbox-cloudflare/agent` now exports `InMemoryRunEventLog` alongside the existing `DurableObjectRunEventLog`, plus the `RunEventLog`, `RunEvent`, and `RunEventLogReadOptions` types.

The log now speaks core's run vocabulary rather than a legacy one of its own:

- Statuses are core's `'running' | 'completed' | 'failed' | 'aborted'` (`done` → `completed`, `error` → `failed`), and `isTerminalRunStatus` is core's helper. Import `RunStatus` / `TerminalRunStatus` / `RunRecord` / `RunError` from `@tanstack/ai`; the package no longer exports run vocabulary of its own.
- The record is **`RunLogRecord`** (exported from `./agent`): core's `RunRecord` — required `threadId`, `startedAt`/`finishedAt`, structured `RunError` — plus the two fields only an event log needs, the `lastSeq` cursor and the `updatedAt` activity clock.
- `RunEventLog.open` requires `threadId` (and accepts an optional `startedAt`), matching core's `RunRecord`. The interface also gains `update` (a `RunStore`-shaped patch of the record's mutable fields; implementations must wake blocked readers, because a driver that terminalizes through its `RunStore` is ending the log with that call) and `list` (every record the log holds).
- **The package no longer ships a run driver.** Its `pipeToRunLog`/`RunController` copy is deleted; `SandboxCoordinator` now drives runs with core's `RunController` from `@tanstack/ai-sandbox`, bound to the Durable Object log by two adapters exported from `./agent`: `runLogStore(log)` exposes the log as core's `RunStore`, and `runLogStream(log, { runId })` exposes one run of it as core's `StreamDurability` — so `alignToStoredLog`, `replayRunStream`, and the rest of the portable durable-runs machinery compose with the DO log directly. The coordinator's WebSocket tail and `?lastSeq` wire protocol are unchanged.
- **Live-data migration.** Records a Durable Object persisted under the old layout (`{ status: 'done' | 'error' | …; createdAt; updatedAt; threadId? }`) are migrated **in place, on first read**, and written back so each record pays the conversion once: `done` → `completed`, `error` → `failed`, `createdAt` → `startedAt`, a terminal record gains `finishedAt = updatedAt`, and a record stored without `threadId` gets `threadId = runId` (the log runs no thread-scoped queries, so the self-reference cannot leak into thread history). Event rows (`evt:`) are raw chunks and are untouched. `migrateStoredRunRecord` is exported from `./agent` for bring-your-own-backend logs that persisted the old layout.
- **Wire-visible.** `GET /runs/:id` and the coordinator's WebSocket terminal `status` frame now carry the converged status strings and field names. A client branching on `record.status === 'done'` must branch on `'completed'` (and `'error'` → `'failed'`).
