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
- **In the run driver and `RunStore` path only**, terminal status names changed to match the shared `TerminalRunStatus`: `done` is now `completed`, `error` is now `failed`, `aborted` stays `aborted`. This rename does **not** apply to the event log that moved to `@tanstack/ai-sandbox-cloudflare`, which keeps `'done' | 'error' | 'aborted'` verbatim (see below). Do not rewrite `'done'` to `'completed'` in event-log code.

`pipeToRunLog` is now total: it never rejects. `RunDeps.logger` is an optional sink for the failures the driver absorbs (a failing `runs.update`, a failing `durability.close()`, a record that vanished before the terminal re-read), because a detached run has no caller left to receive an error. Every exit path still terminalizes, so a store or log failure no longer leaves a run wedged at `'running'` with live tailers parked on a log that never closes.

### Breaking: `@tanstack/ai-sandbox-cloudflare`

New home of the run event log. `@tanstack/ai-sandbox-cloudflare/agent` now exports `InMemoryRunEventLog` alongside the existing `DurableObjectRunEventLog`, plus the `RunEventLog`, `RunEvent`, and `RunEventLogReadOptions` types.

The log keeps its own legacy vocabulary (`'running' | 'done' | 'error' | 'aborted'`, over a record shaped `{ runId; threadId?; status; lastSeq; error?; createdAt; updatedAt }`), because adopting core's shape would mean migrating the Durable Object's persisted record layout. Since `@tanstack/ai` now publishes public types under four of those same names with different meanings, the colliding four are renamed on the way out of `./agent`:

- `RunRecord` is now `LegacyRunRecord`
- `RunStatus` is now `LegacyRunStatus`
- `TerminalRunStatus` is now `LegacyTerminalRunStatus`
- `RunError` is now `LegacyRunError`

Rewrite `import type { RunStatus } from '@tanstack/ai-sandbox-cloudflare/agent'` to `LegacyRunStatus`, and likewise for the other three. Before the rename, that import silently handed you the legacy `'running' | 'done' | 'error' | 'aborted'` union under a name core also publishes with a different terminal set. `RunEventLog`, `RunEvent`, and `RunEventLogReadOptions` have no core equivalent and keep their original names. The module-local `isTerminalRunStatus` stays unexported, so no app can import the wrong helper by name.
