---
title: Store Reference (Advanced)
id: store-reference
---

These are the store contracts in `@tanstack/ai-persistence`. Implement the stores you need. The middleware enables a feature when its store is present.

| Store | Holds | Used by | Guide |
| --- | --- | --- | --- |
| `messages` | The model-message history of each thread | `withPersistence` (required), `reconstructChat` (required) | [Chat persistence](./chat-persistence) |
| `activities` | AG-UI activity rows of each thread | `withPersistence`, `reconstructChat` | [AG-UI activity rows](./chat-persistence-advanced#ag-ui-activity-rows-on-reload) |
| `runs` | Run status, timing, errors, usage | `withPersistence`, `reconstructChat` | [Chat persistence](./chat-persistence) |
| `interrupts` | Pending, resolved, or cancelled human waits. Needs `runs`. | `withPersistence` | [Chat persistence](./chat-persistence) |
| `metadata` | App and integration key/value state | `withPersistence`, `withCompaction` | [Compaction](../advanced/compaction#compaction-and-persistence) |
| `generationRuns` | Generation run status and result metadata | `withGenerationPersistence` (required), `reconstructGeneration` (required) | [Generation persistence](./generation-persistence) |
| `artifacts` | File metadata. Needs `blobs`. | `withGenerationPersistence`, portable snapshots | [Keep generated files](./keep-generated-files) |
| `blobs` | File bytes. Needs `artifacts`. | `withGenerationPersistence`, portable snapshots | [Keep generated files](./keep-generated-files) |
| `log` | The append-only session log, with ownership, an input lane, and snapshots | A harness host (required) | [Session stores](#session-stores) |
| `sessions` | One index entry per thread, for a list of sessions | `withPersistence` (subagent children), your host code | [Session stores](#session-stores) |

The named groups of chat stores (`ChatTranscriptStores`, `ChatPersistenceStores`, `ChatWithInterruptsStores`) are in [Controls](./controls). To build the stores, see [Build a chat adapter](./build-your-own-chat-adapter) and [Build a generation adapter](./build-your-own-generation-adapter). To test them, see [the conformance suite](./build-your-own-adapter#verify-with-the-conformance-suite).

## MessageStore

```ts
import type { ModelMessage } from '@tanstack/ai'

type MessagePage =
  | {
      messages: Array<ModelMessage>
      truncated: false
      cursor?: never
    }
  | {
      messages: Array<ModelMessage>
      truncated: true
      cursor: string
    }

interface MessageStore {
  loadThread(
    threadId: string,
    options?: { limit?: number; before?: string },
  ): Promise<Array<ModelMessage> | MessagePage>
  saveThread(threadId: string, messages: Array<ModelMessage>): Promise<void>
}
```

Rules:

- `loadThread` with only `threadId` (the middleware calls it this way) returns the full array, never a `MessagePage`.
- `loadThread` returns `[]`, never `null`, for a thread that was never saved.
- `limit` and `before` are a paging hint for hydrate. You can ignore them and return the full array. `reconstructChat` then slices after the UI conversion.
- To page in the database, return a `MessagePage`. `truncated: true` requires a `cursor`. The words `truncated` and `cursor` mean the same as in `BlobStore.list`.
- If you ignore `before` and return the newest array again, `reconstructChat` loads the full thread and slices it.
- `saveThread` gets the full merged list. It replaces the stored thread. It never appends. The merge by id happens in `withPersistence`, not in this store.

## ActivityStore

```ts
import type { ActivityRecord } from '@tanstack/ai-persistence'

interface ActivityStore {
  loadActivities(threadId: string): Promise<Array<ActivityRecord>>
  saveActivities(
    threadId: string,
    activities: Array<ActivityRecord>,
  ): Promise<void>
}
```

Rules:

- `loadActivities` returns `[]`, never `null`, for a thread that was never saved.
- `saveActivities` gets the complete activity list for the thread. It replaces the stored list.
- Activity rows are never model messages. Do not store them in `messages`.

The store is optional. Without it, activity rows are not durable on the server. Type an implementation with `defineActivityStore`. See [AG-UI activity rows on reload](./chat-persistence-advanced#ag-ui-activity-rows-on-reload).

## RunStore

`RunStore` and `RunRecord` come from `@tanstack/ai`. `@tanstack/ai-persistence` re-exports both. `RunError` is exported from `@tanstack/ai` only. One shared definition lets chat persistence and a sandbox run driver use the same record for one run.

```ts
import type { TokenUsage } from '@tanstack/ai'

type TerminalRunStatus = 'completed' | 'failed' | 'aborted'
type RunStatus = 'running' | 'interrupted' | TerminalRunStatus

// Why a run failed. `message` is the provider's text, which changes between
// model versions. `code` is the stable value to switch on (retry, escalate,
// show a specific UI). Providers do not always supply one.
interface RunError {
  message: string
  code?: string
}

interface RunRecord {
  runId: string
  threadId: string
  // Present on a subagent child run. Absent on the parent chat run.
  parentRunId?: string
  subagentRunId?: string
  name?: string
  status: RunStatus
  startedAt: number // epoch ms
  finishedAt?: number // epoch ms, set at a terminal status
  error?: RunError
  usage?: TokenUsage // reported usage added up for this runId
  // ---------------------------------------------------------------------------
  // DURABLE SANDBOXED RUNS ONLY. A chat app never writes these four, and
  // nothing in `@tanstack/ai-persistence` reads them. Leave the columns out
  // until you use `withSandbox(sandbox, { runs, durability })`. See
  // Build a Sandbox Adapter, "The four run fields".
  // ---------------------------------------------------------------------------
  sandboxKey?: string // the sandbox this run is bound to
  detachedSince?: number // epoch ms since the last viewer left
  cancelRequested?: boolean // an out-of-band cancel was recorded
  driverEpoch?: number // fencing token, incremented by each host that claims the run
  // ---------------------------------------------------------------------------
  // HOST SESSIONS ONLY. A host that runs agents and activities for a long
  // session writes these. `chat()` never writes them. A store that keeps the
  // whole record keeps them too.
  // ---------------------------------------------------------------------------
  kind?: 'chat' | 'agent' | 'activity' | 'command' | 'compact'
  activity?: string // the activity of a `kind: 'activity'` run
  agent?: string // the agent name of a `kind: 'agent'` run
  result?: unknown // terminal result metadata (ids, urls, text), never bytes
  artifacts?: Array<{ artifactId: string; name?: string; mimeType?: string; url?: string }>
  principal?: { id: string } // who started the run
  leaseOwner?: string // the host that drives the run now
  leaseExpiresAt?: number // epoch ms when that claim ends
  // Crash-resume data from the last model or tool boundary.
  checkpoint?: {
    at: number
    pendingTools?: Array<{ toolCallId: string; name: string; replay: 'safe' | 'never' }>
  }
}

interface RunStore {
  // Required. Insert-if-absent: an existing runId returns the stored record
  // unchanged, so a resume never resets its startedAt or status.
  createOrResume(input: {
    runId: string
    threadId: string
    status?: RunStatus
    startedAt: number
    // Copied on the first insert only. A later call leaves them unchanged.
    parentRunId?: string
    subagentRunId?: string
    name?: string
    kind?: RunRecord['kind']
    activity?: string
    agent?: string
    principal?: { id: string }
  }): Promise<RunRecord>
  // Required. A patch for an unknown runId does nothing. It does not throw.
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
        | 'result'
        | 'artifacts'
        | 'leaseOwner'
        | 'leaseExpiresAt'
        | 'checkpoint'
      >
    >,
  ): Promise<void>
  // Required.
  get(runId: string): Promise<RunRecord | null>
  // Required. The most recent 'running' run of a thread (greatest startedAt),
  // or null when the thread is idle. reconstructChat uses it to report
  // activeRun, which lets a hydrating client tail a run that still generates.
  findActiveRun(threadId: string): Promise<RunRecord | null>
  // Optional. Every run of a thread, startedAt ascending.
  listByThread?(threadId: string): Promise<Array<RunRecord>>
  // Optional. The child runs of one parent, oldest startedAt first.
  listByParentRun?(parentRunId: string): Promise<Array<RunRecord>>
  // Optional. Runs with status 'running' and detachedSince <= now - ttlMs.
  listReclaimable?(opts: {
    now: number
    ttlMs: number
  }): Promise<Array<RunRecord>>
}
```

Required methods and their rules:

| Method | Rule |
| --- | --- |
| `createOrResume` | Idempotent. A second call for an existing `runId` returns the complete stored record unchanged, `usage` included. Retries can repeat the same run id. |
| `createOrResume` | Copies `parentRunId`, `subagentRunId`, and `name` on the first insert only. If the caller leaves a field out, leave it out of the record. Do not write `''`. |
| `update` | A patch for an unknown `runId` does nothing. |
| `get` | Returns `null` for an unknown `runId`. |
| `findActiveRun` | Must do a real query. A stub that returns `null` makes `reconstructChat` always report `activeRun: null`. A reloaded client then restores the transcript but never resumes the live reply, and nothing reports the fault, because `null` is also correct for an idle thread. |

Optional methods. Consumers feature-detect each one:

| Method | Used by | If you leave it out |
| --- | --- | --- |
| `listByThread` | `reconstructChat` (finds the parent run of a child that a tool call started), `includeRuns` timings | A reload loses those subagent cards. Declare the omission in `skipMethods` for the conformance suite. |
| `listByParentRun` | `reconstructChat` (builds the subagent cards) | A reload shows the saved child text, without cards. The conformance suite skips the subagent checks. No `skipMethods` entry is necessary. |
| `listReclaimable` | `reapDetachedRuns` from `@tanstack/ai-sandbox` | The reaper logs one line and sweeps nothing. Detached runs never finish and their sandboxes are never reclaimed. Declare the omission in `skipMethods`. |

The reaper is a function that your app schedules, so `listReclaimable` alone is not enough. `withSandbox`'s detach path fills in `detachedSince` for you. See [Takeover & Detached Runs](../sandbox/takeover#configuration) and [Reaping & Retention](../sandbox/reaping).

Usage: `withPersistence` adds up the numeric usage fields across the provider calls of one `runId`. The opaque `providerUsageDetails` field keeps the latest reported value. Known usage is saved when the run interrupts or reaches a terminal status.

The four durable-run fields are a sandbox concern. `runPersistenceConformance` does not test them, and a chat-only backend can leave the columns out. If you use durable sandboxed runs, run `runDurableRunFieldsConformance` from `@tanstack/ai-sandbox/testkit` against the same `runs` store. Each field breaks one mechanism without an error when it is dropped. See [Build a Sandbox Adapter](./build-a-sandbox-adapter#the-four-run-fields).

Capability tiers belong at the store level, not the method level. A backend with no run lifecycle declares `ChatTranscriptStores` and leaves out `runs`. It does not supply a `RunStore` with a stubbed method. The type system catches a missing store. An incomplete store fails at runtime with no error.

Two helpers come with the contract:

- `isTerminalRunStatus` is a type predicate. Inside the guard, the status is a `TerminalRunStatus`:

  ```ts
  import { isTerminalRunStatus } from '@tanstack/ai-persistence'
  import type { RunRecord, TerminalRunStatus } from '@tanstack/ai-persistence'

  function finalStatus(run: RunRecord): TerminalRunStatus | null {
    return isTerminalRunStatus(run.status) ? run.status : null
  }
  ```

- `defineRunStore` is generic over the object you pass, so the result keeps that object's exact shape. An optional method that you implemented needs no `?.` in your own code. For example, `createRunStore(db).findActiveRun(threadId)` is a direct call on the store from the [chat walkthrough](./build-your-own-chat-adapter). A consumer that holds a plain `RunStore` still feature-detects the same method.

Reference implementations: `MemoryRunStore` in `packages/ai-persistence/src/memory.ts` and the SQLite adapter in `examples/ts-react-chat` (`src/lib/sqlite-persistence.ts`). Both implement all seven run methods.

## InterruptStore

```ts
interface InterruptRecord {
  interruptId: string
  runId: string
  threadId: string
  status: 'pending' | 'resolved' | 'cancelled'
  requestedAt: number // epoch ms
  resolvedAt?: number // epoch ms, set when resolved or cancelled
  payload: Record<string, unknown>
  response?: unknown
}

type InterruptCommitEntry =
  | { interruptId: string; status: 'resolved'; response?: unknown }
  | { interruptId: string; status: 'cancelled' }

interface InterruptStore {
  create(record: Omit<InterruptRecord, 'status' | 'resolvedAt'>): Promise<void>
  commitBatch?(entries: ReadonlyArray<InterruptCommitEntry>): Promise<void>
  resolve(interruptId: string, response?: unknown): Promise<void>
  cancel(interruptId: string): Promise<void>
  get(interruptId: string): Promise<InterruptRecord | null>
  list(threadId: string): Promise<Array<InterruptRecord>>
  listPending(threadId: string): Promise<Array<InterruptRecord>>
  listByRun(runId: string): Promise<Array<InterruptRecord>>
  listPendingByRun(runId: string): Promise<Array<InterruptRecord>>
}
```

Rules:

- `create` takes a record without `status` and `resolvedAt`, so every interrupt starts as `'pending'`.
- `create` is insert-if-absent. A duplicate `create` never changes an interrupt that is already resolved.
- `resolve` and `cancel` do nothing for an unknown `interruptId`.
- The `list*` methods return records in `requestedAt` ascending order.
- With chat persistence, an `interrupts` store requires a `runs` store.

`commitBatch` is optional. If you implement it, write all entries in one database transaction. Reject the whole batch (throw and write nothing) when any entry:

- repeats an `interruptId`,
- names an interrupt that does not exist, or
- names an interrupt that is not `'pending'`.

Without `commitBatch`, the middleware calls `resolve` and `cancel` one entry at a time. That fallback is not atomic.

## MetadataStore

`MetadataStore` comes from `@tanstack/ai` and is re-exported here.

```ts
interface MetadataStore {
  get(namespace: string, key: string): Promise<unknown | null>
  set(namespace: string, key: string, value: unknown): Promise<void>
  delete(namespace: string, key: string): Promise<void>
  // Optional: compare-and-set.
  getVersioned?(
    namespace: string,
    key: string,
  ): Promise<{ value: unknown; revision: string } | null>
  setIf?(
    namespace: string,
    key: string,
    value: unknown,
    expectedRevision: string | null,
  ): Promise<{ ok: true; revision: string } | { ok: false; reason: 'conflict' }>
}
```

Rules:

- `(namespace, key)` is the identity. Your app owns the namespaces and the value schemas.
- A stored `null` looks the same as an absent key. To store `null`, wrap it (for example, `{ value: null }`), or reject nullish values.
- Do not put the transcript in metadata. The `messages` store owns it.

Add `getVersioned` and `setIf` when two writers can change the same key at the same time. Then the second write cannot erase the first:

- `getVersioned` returns the value and its revision, or `null` when the key is absent.
- `setIf` writes only when the stored revision equals `expectedRevision`. Pass `null` to write only when the key is absent.
- `setIf` returns `{ ok: true, revision }` on success. On a different revision, it returns `{ ok: false, reason: 'conflict' }` and does not write.
- Every write gives the key a new revision, a plain `set` too. After `delete`, the next write gets a new revision. A deleted revision is never used again.

`memoryPersistence()` has both methods. The conformance suite tests them when your store has them.

`withPersistence` also provides this store through the core `MetadataCapability`. Other middleware can then use it without a dependency on `@tanstack/ai-persistence`. For example, `withCompaction` stores validated context checkpoints here.

## GenerationRunStore

The generation counterpart to `RunStore`. A record is keyed by its own `runId`. Its `threadId` is the slot that `findLatestForThread` looks it up by. `withGenerationPersistence` requires this store, not `runs`.

```ts
import type { PersistedArtifactRef, TokenUsage } from '@tanstack/ai'

// The same values as a chat run's `RunStatus`, so one status column and one
// set of checks cover both tables.
type GenerationRunStatus =
  | 'running'
  | 'interrupted'
  | 'completed'
  | 'failed'
  | 'aborted'

interface GenerationRunRecord {
  runId: string
  threadId: string // the slot this run fills, hydrated by findLatestForThread
  activity: string // 'image' | 'audio' | 'tts' | 'video' | 'transcription'
  provider: string
  model: string
  status: GenerationRunStatus
  startedAt: number // epoch ms
  finishedAt?: number // epoch ms, set at a terminal status
  error?: { message: string; code?: string }
  result?: unknown // terminal result metadata (ids, urls), never media bytes
  artifacts?: Array<PersistedArtifactRef> // present with an artifacts + blobs backend
  usage?: TokenUsage
}

interface GenerationRunStore {
  createOrResume(input: {
    runId: string
    activity: string
    provider: string
    model: string
    startedAt: number
    threadId: string
    status?: GenerationRunStatus
  }): Promise<GenerationRunRecord>
  update(
    runId: string,
    patch: Partial<
      Pick<
        GenerationRunRecord,
        'status' | 'finishedAt' | 'error' | 'result' | 'artifacts' | 'usage'
      >
    >,
  ): Promise<void>
  get(runId: string): Promise<GenerationRunRecord | null>
  // The most recent run filed under a thread (greatest startedAt), or null.
  findLatestForThread(threadId: string): Promise<GenerationRunRecord | null>
}
```

Rules:

- `createOrResume` is idempotent. A second call for an existing `runId` returns the stored record unchanged. It does not change `startedAt`, `activity`, `provider`, `model`, or `threadId`. `status` defaults to `'running'` on the first insert.
- `update` for an unknown `runId` does nothing. It does not throw and does not create a record.
- `findLatestForThread` is required. It is the only query that hydrates a generation. Without it, `persistence: true` restores nothing, and nothing reports the fault.

## ArtifactStore

Metadata rows for stored media. The bytes live in a `BlobStore`. Provide both stores together to keep generated bytes.

```ts
interface ArtifactRecord {
  artifactId: string
  runId: string
  threadId: string
  blobKey: string // where the bytes live
  name: string
  mimeType: string
  size: number
  sourceUrl?: string // where the bytes were fetched FROM (provenance)
  createdAt: number // epoch ms
}

interface ArtifactStore {
  save: (record: ArtifactRecord) => Promise<void>
  get: (artifactId: string) => Promise<ArtifactRecord | null>
  list: (runId: string) => Promise<Array<ArtifactRecord>> // [] when the run has none
  // Complete thread history, ordered by (createdAt, artifactId) ascending.
  listForThread: (threadId: string) => Promise<Array<ArtifactRecord>>
  delete: (artifactId: string) => Promise<void>
  deleteForRun: (runId: string) => Promise<void>
}
```

Rules:

- `save` inserts or overwrites the record.
- `list` and `listForThread` sort by `createdAt` first, then by `artifactId` in bytewise order. Compare the UTF-8 bytes from left to right. Do not use locale collation.
- `delete` and `deleteForRun` do nothing when there is nothing to delete.
- Every record must have `blobKey`. With a custom `storageKey`, the path cannot be computed again from the record. See [Keep generated files](./keep-generated-files).

## BlobStore

A durable object store for the bytes. By default, `withGenerationPersistence` writes each generated file under the key `artifacts/<runId>/<artifactId>`.

```ts
type BlobBody =
  | ReadableStream<Uint8Array>
  | ArrayBuffer
  | ArrayBufferView
  | string
  | Blob

interface BlobRecord {
  key: string
  size?: number
  etag?: string
  contentType?: string
  customMetadata?: Record<string, string>
  createdAt?: number // epoch ms first written
  updatedAt?: number // epoch ms last overwritten
}

interface BlobObject extends BlobRecord {
  arrayBuffer(): Promise<ArrayBuffer>
  text(): Promise<string>
  body?: ReadableStream<Uint8Array>
  // The slice served, when a range was requested. Absent on a whole read.
  range?: { offset: number; length: number }
}

interface BlobListPage {
  objects: Array<BlobRecord>
  cursor?: string // present only when `truncated`
  truncated?: boolean
}

interface BlobPutOptions {
  contentType?: string
  customMetadata?: Record<string, string>
  // Exact byte length of `body`, when the producer knows it. Advisory: use it
  // to pick an upload strategy (single-shot or multipart). Do not use it in
  // place of counting the bytes you store.
  expectedLength?: number
}

interface BlobRange {
  offset: number // from the start of the object, must be inside it
  length?: number // defaults to "to the end", clamped when it overshoots
}

interface BlobGetOptions {
  range?: BlobRange
}

interface BlobListOptions {
  prefix?: string
  cursor?: string
  limit?: number
}

interface BlobStore {
  put(key: string, body: BlobBody, options?: BlobPutOptions): Promise<BlobRecord>
  get(key: string, options?: BlobGetOptions): Promise<BlobObject | null>
  head(key: string): Promise<BlobRecord | null>
  delete(key: string): Promise<void>
  list(options?: BlobListOptions): Promise<BlobListPage>
}
```

Rules for `list`:

- `prefix` matches literally and is case-sensitive. Escape SQL `LIKE` metacharacters.
- When `limit` is set and more keys match, return `truncated: true` with a `cursor`. That cursor returns the keys strictly after it, so paging visits every key once.
- `limit: 0` returns an empty page that is not truncated.

Rules for `put`:

- The body can be a `ReadableStream` with **no declared length**. Your store must read a stream of unknown length to the end. Do not require a length first.
- A URL-fetched artifact arrives without a length when the origin does not declare one that can be enforced: a chunked reply, or a compressed reply whose `content-length` counts the compressed bytes.
- When the origin declares a usable length, the body arrives as `fetch` made it, and `expectedLength` has the same number.
- A backend that needs a declared length for a single-shot upload (Cloudflare R2 on workerd is one) can attach `expectedLength` when it is present. When it is absent, stream through a multipart upload. The `ai-persistence/build-cloudflare-artifact-store` skill has that recipe.

The conformance testkit tests the length-less case, so a store that handles only byte bodies fails the suite.

Rules for `get`:

- With `options.range`, return **only that slice**. `size` still reports the whole object, and the returned `range` reports what you served. A media player needs these values for a `206` response when it seeks.
- Use `resolveBlobRange(size, range)` to clamp. A `length` past the end is legal and clamps. An `offset` past the end throws, because a serve route answers `416` from the record's `size` before it calls the store.

```ts ignore
import { resolveBlobRange } from '@tanstack/ai-persistence'

async get(key: string, options?: BlobGetOptions) {
  const row = await selectBlob(key)
  if (!row) return null
  if (!options?.range) return blobObject(row, row.body)
  const served = resolveBlobRange(row.size, options.range)
  // Slice at the storage layer, not after loading the whole object.
  const bytes = await selectBlobSlice(key, served.offset, served.length)
  return blobObject(row, bytes, served)
}
```

Range support is required for a store that holds bytes, and the conformance testkit tests it. A store that ignores `range` sends the whole file on every seek. Then `<video>` seeking fails, and Safari does not play the video at all. A reference-only backend that stores no bytes leaves out `blobs` completely. See [Keep generated files](./keep-generated-files) for the serve route.

## Session stores

A host that keeps long-lived sessions needs more than a transcript. It must remember
the inputs it accepted, the state of each thread, which host works on which thread,
and a list of sessions to show. Two stores hold that data:

- `log`: one append-only log per session tree. A harness host needs it.
- `sessions`: one index entry per thread. `withPersistence` also uses it, to index
  subagent children.

A harness host keeps the data of each tenant apart. In `log`, `metadata`, and the
media artifacts, it writes the id of the root thread as
`logIdOf({ tenantId, logId: threadId })` from `@tanstack/ai-harness`: `acme:thread-1`,
or `:thread-1` in the default tenant. Keep it as an opaque string. The session index
is the one store that keeps `tenantId` and `threadId` as two fields.

## LogStore

A host keeps the events, the transcript, the inputs, the runs, the interrupts, the
settings, the plugin state, and the tool steps of a session tree in one append-only
log. The root thread and its child threads (agent runs and subagents) share it. With the log, a turn survives a crash. When several machines
serve the sessions, the log also records which host runs each session, and it keeps
the inputs that any machine accepts. `LogStore` stores all of this.

The types, `NO_OWNER_EPOCH`, and the three errors come from `@tanstack/ai-persistence`:

```ts
const NO_OWNER_EPOCH = 0 // the epoch of a log that no host ever acquired

interface LogRecord {
  type: string
  [key: string]: unknown
}

interface LogEntry {
  seq: number // the first record of a log is at 1
  record: LogRecord
}

interface LogSnapshot {
  seq: number // the last position that `state` includes
  version: string // the version of the `state` shape, yours to name
  state: unknown // JSON
}

type OfferResult = 'offered' | 'duplicate' | 'conflict' | 'deleted'

interface OfferedInput {
  inputId: string
  record: LogRecord
  offeredAt: number // epoch ms, from the store clock
}

interface OrphanedLog {
  logId: string
  harness: string // the name of the setup that runs the log
  reason: 'expired' | 'offered' | 'wake'
}

interface LogStore {
  // Records
  append(batch: {
    logId: string
    seq: number
    epoch: number
    records: ReadonlyArray<LogRecord>
    consumes?: ReadonlyArray<string> // input ids to consume in the same write
  }): Promise<void>
  read(query: {
    logId: string
    after?: number
    limit?: number
  }): Promise<Array<LogEntry>>
  subscribe(watch: { logId: string; listener: () => void }): () => void

  // Ownership
  acquireOwnership(claim: {
    logId: string
    harness: string
    ownerId: string
    ttlMs: number
    affinity?: string
  }): Promise<{ epoch: number; expired?: boolean } | null>
  renewOwnership(claim: {
    logId: string
    ownerId: string
    epoch: number
    ttlMs: number
  }): Promise<boolean>
  releaseOwnership(claim: {
    logId: string
    ownerId: string
    epoch: number
    wakeInMs?: number
  }): Promise<void>
  pinToWorkers(pin: {
    logId: string
    epoch: number
    affinity: string | null
  }): Promise<void>
  markHostAlive(beat: { hostId: string; ttlMs: number }): Promise<void>
  listLogsWithoutOwner(query: {
    limit: number
    harnesses?: ReadonlyArray<string>
    affinity?: string
  }): Promise<Array<OrphanedLog>>

  // Input lane
  offerInput(input: {
    logId: string
    harness: string
    inputId: string
    record: LogRecord
  }): Promise<OfferResult>
  listOfferedInputs(query: { logId: string }): Promise<Array<OfferedInput>>

  // Snapshots and lifecycle
  getSnapshot(query: { logId: string }): Promise<LogSnapshot | null>
  putSnapshot(
    snapshot: { logId: string; epoch: number } & LogSnapshot,
  ): Promise<void>
  truncate(cut: {
    logId: string
    epoch: number
    beforeSeq: number
  }): Promise<void>
  deleteLog(target: { logId: string }): Promise<void>
}
```

`memoryLogStore()` is the reference store. `memoryPersistence()` includes one. To
run two store instances on one memory log, as two machines on one database, share a
`memoryLogState()`:

```ts
import { memoryLogState, memoryLogStore } from '@tanstack/ai-persistence'

const state = memoryLogState()
const first = memoryLogStore({ state })
const second = memoryLogStore({ state })
```

### Fence the writes with the epoch

Two machines can work on one log. Host A owns the log, and then it stops for a
while: a long garbage collection pause, or a lost network. Its ownership expires,
and host B acquires the log. When host A continues, it writes again. Without a
fence, the log gets the records of two owners.

The epoch is the fence. Each `acquireOwnership` that starts a new ownership adds 1 to the
epoch of the log. The owner sends that epoch with each write, and the store refuses
an old epoch. So the late write of host A rejects with `OwnershipLostError`, and the
log does not change.

`append`, `putSnapshot`, `truncate`, and `pinToWorkers` are fenced. They check the
epoch before anything else:

- On a log that a host acquired, `epoch` must be the current epoch. A released log
  refuses every epoch.
- On a log that no host acquired, `append` needs `NO_OWNER_EPOCH`. A writer that never
  calls `acquireOwnership` writes with it. `putSnapshot`, `truncate`, and `pinToWorkers` need
  an owner, so they refuse `NO_OWNER_EPOCH`.
- A deleted log refuses every epoch until the next `acquireOwnership`.
- A call with any other epoch rejects with `OwnershipLostError`, and the store writes
  nothing.

### Rules for records

`append` writes `records` at `seq`, `seq + 1`, and so on. The first record of a log
is at 1. `append` checks in this order, and the first check that fails rejects:

1. The fence.
2. `seq` is the next free position: the last position plus 1, or 1 for a new log.
   Else it rejects with `LogConflictError`.
3. Each id in `consumes` is a pending offer. Else it rejects with a `TypeError`.
4. Each record can become JSON. Else it rejects with the error of the JSON copy.

The batch is atomic. The store writes all the records and consumes all of
`consumes`, or it changes nothing. An empty batch with no `consumes` resolves. It
writes nothing and checks nothing.

`read` gives the log back in order:

- It returns the entries with `seq` more than `after` (default 0), in `seq` order, at
  most `limit`.
- `limit: 0` returns `[]`. A log with no records returns `[]`.
- If a truncate dropped the record at `after + 1`, `read` rejects with
  `LogTruncatedError`.
- The entries are copies. A change to them does not change the log.

`subscribe` wakes a host when the log changes:

- The store calls the listener after each successful `append`, each `offerInput` that
  returns `'offered'`, and each `deleteLog` of the log.
- The calls come from every store instance on the same backend. That is how one
  machine hears the writes of another.
- A store that cannot push must poll inside `subscribe`.
- If a listener throws, the store logs the error with `console.error`. The write
  still succeeds.

### Rules for ownership

Each log has one ownership record: `harness`, `ownerId`, the epoch, the expiry time,
a released flag, and an optional affinity and wake time. The epoch never goes down.
It stays after `releaseOwnership` and after `deleteLog`. The store clock decides each expiry,
so callers pass `ttlMs` and `wakeInMs`, never a timestamp. A `ttlMs` of 0 or less,
or a `wakeInMs` less than 0, rejects with `RangeError`.

`acquireOwnership` gives the log to `ownerId` for `ttlMs` milliseconds:

- It returns `null` when another owner holds a live record: not released, and not
  expired.
- It returns `null` when the log has an affinity that is not `claim.affinity`, and
  the host of that affinity is alive.
- For the owner of a live record, it extends the expiry and returns the same epoch.
- Else it adds 1 to the epoch, stores `harness`, clears the wake time, opens a
  deleted log again, and returns `{ epoch }`.
- When the record had another owner that did not release, it returns
  `{ epoch, expired: true }`. That owner stopped. The harness then sends
  `harness.ownership.changed` with `reason: taken_over`.

For the other ownership methods:

- `renewOwnership` returns `true` only for the current epoch and owner of a log that is not
  released. In that case, it sets the expiry to `ttlMs` from now. A renew after the
  expiry also succeeds if no other host acquired the log in between.
- `releaseOwnership` with the current epoch and owner marks the log released. With
  `wakeInMs`, it also sets the wake time to `wakeInMs` from now. Any other `releaseOwnership`
  does nothing.
- `pinToWorkers` pins the log to the workers with that affinity, or unpins it with
  `null`. Only the owner pins: it needs the current epoch of an acquired log.
- `markHostAlive` marks the host `hostId` alive for `ttlMs` from now. `hostId` is the
  affinity of its pins. A pin counts only while its host is alive, so the logs of a
  host that stopped go to other hosts. A host that is alive keeps its pins, also on
  the logs that it released.

`listLogsWithoutOwner` finds the logs that have work and no live owner. A worker sweep
([`createHarnessWorker`](../harness/workers) or `host.resumePending`) calls it, then
calls `acquireOwnership` for each log. A log is listed for the first reason that
applies:

1. `'expired'`: the log is not released, and its expiry is due.
2. `'offered'`: the log has pending offers, and no live owner.
3. `'wake'`: the log is released, and its wake time is due.

Then:

- With `harnesses`, the store lists only the logs with one of those harness names.
- A log with an affinity is listed only when the query has the same `affinity`, or
  when the host of the affinity is not alive.
- The log that is due first comes first, and the store lists at most `limit` logs.
  `limit: 0` returns `[]`.

### Rules for the input lane

A client can send an input to any machine, but only the owner of the log runs it.
`offerInput` keeps the input as a pending offer. The owner consumes it with
`append({ consumes })`, in the same write as the records of the input.

- If `deleteLog` deleted the log and no host acquired it since, `offerInput` returns
  `'deleted'` and stores nothing.
- If the `inputId` is new, `offerInput` stores a pending offer with `offeredAt` from the
  store clock. It calls the listeners and returns `'offered'`.
- The harness of the owner names the log for `listLogsWithoutOwner`. A log with no owner
  keeps the `harness` of its first offer. A later offer does not change it.
- If the `inputId` was offered before (pending or consumed), `offerInput` changes nothing.
  It returns `'duplicate'` when the JSON of the record is equal, else `'conflict'`.
- If the record cannot become JSON, `offerInput` rejects and stores nothing.
- Offers belong to one log. The same `inputId` on two logs gives two offers.
- `listOfferedInputs` returns the pending offers in offer order.

### Rules for snapshots, truncate, and delete

A long log is slow to read from the start. A snapshot saves the state at one
position. Then a reader loads the snapshot and reads only the records after it.
With a snapshot, the owner can also drop the old records.

- `putSnapshot` needs the owner, and it replaces the previous snapshot. If `seq` is
  after the last position, or before `firstSeq - 1`, it rejects with `RangeError`.
  `firstSeq` is the first kept position, so an earlier snapshot needs records that
  a truncate dropped.
- `getSnapshot` returns the latest snapshot, or `null` when the log has none.
- `truncate` needs the owner. It drops the records with `seq` less than `beforeSeq`.
  If the log has no snapshot with a `seq` of `beforeSeq - 1` or more, it rejects
  with `RangeError`.
- After a truncate, the positions keep counting, so the next `append` is still at the
  last position plus 1. A `read` from before the cut rejects with
  `LogTruncatedError`, and its `firstSeq` is the first kept position.
- `deleteLog` removes the records, the offers, the snapshot, the truncation point,
  the affinity, and the wake time, and calls the listeners. The epoch counter stays.
  Every fenced write fails until the next `acquireOwnership`, also with `NO_OWNER_EPOCH`. So a
  late write cannot bring a deleted transcript back. An `offerInput` returns `'deleted'`
  and stores nothing.

### In SQL

Run each method that writes in one transaction. Three tables hold the records, the
ownership, and the offers:

- `log_records`: the primary key `(log_id, seq)` refuses a taken position.
- `log_owner`: one row per log, with the epoch, the last position (`head`), and the
  first kept position. `append`, `acquireOwnership`, and `deleteLog` insert the row with
  `epoch` 0 when it is missing. Then one compare-and-set on `epoch` and `released`
  fences every log: acquired, never acquired, and deleted.
- `log_offers`: the unique key `(log_id, input_id)` finds a duplicate offer.

```sql
CREATE TABLE log_records (
  log_id TEXT NOT NULL,
  seq BIGINT NOT NULL,
  record TEXT NOT NULL,
  PRIMARY KEY (log_id, seq)
);

CREATE TABLE log_owner (
  log_id TEXT PRIMARY KEY,
  epoch BIGINT NOT NULL DEFAULT 0, -- 0 is NO_OWNER_EPOCH. It never goes down.
  head BIGINT NOT NULL DEFAULT 0, -- the last position
  first_seq BIGINT NOT NULL DEFAULT 1, -- the first kept position, after a truncate
  harness TEXT,
  owner_id TEXT,
  expires_at TIMESTAMPTZ,
  released BOOLEAN NOT NULL DEFAULT FALSE,
  deleted BOOLEAN NOT NULL DEFAULT FALSE, -- set by deleteLog, cleared by acquire
  affinity TEXT,
  wake_at TIMESTAMPTZ
);

CREATE TABLE log_hosts (
  host_id TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL -- the heartbeat expires
);

CREATE TABLE log_offers (
  id BIGSERIAL PRIMARY KEY, -- the offer order
  log_id TEXT NOT NULL,
  input_id TEXT NOT NULL,
  harness TEXT NOT NULL,
  record TEXT NOT NULL,
  offered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (log_id, input_id)
);
```

`append` does the fence, the position check, and the consume in the same
transaction as the insert:

```sql
BEGIN;
INSERT INTO log_owner (log_id) VALUES (:log_id) ON CONFLICT DO NOTHING;

-- The fence and the position in one compare-and-set.
UPDATE log_owner SET head = :seq + :count - 1
WHERE log_id = :log_id AND epoch = :epoch AND NOT released AND head = :seq - 1;
-- No row changed: roll back. Read the row, then reject with
-- OwnershipLostError (epoch or released) or LogConflictError (head).

-- One row for each record of the batch.
INSERT INTO log_records (log_id, seq, record) VALUES (:log_id, :seq, :record);

UPDATE log_offers SET consumed = TRUE
WHERE log_id = :log_id AND input_id = ANY(:consumes) AND NOT consumed;
-- Fewer rows changed than ids in :consumes: roll back, and reject with TypeError.
COMMIT;
```

`acquireOwnership` adds the row too, so a host can take a new log before its first record.
It reads the row first, because the result needs the old owner:

```sql
BEGIN;
INSERT INTO log_owner (log_id) VALUES (:log_id) ON CONFLICT DO NOTHING;

SELECT owner_id, released, NOT released AND expires_at > now() AS live
FROM log_owner WHERE log_id = :log_id FOR UPDATE;
-- Live, and owner_id is not :owner_id: roll back, and return null.
-- A live pin of another host (see below): roll back, and return null.
-- Live, and owner_id is :owner_id: set expires_at, and return { epoch }.

UPDATE log_owner
SET epoch = epoch + 1, owner_id = :owner_id, harness = :harness,
  expires_at = now() + :ttl_ms * interval '1 millisecond',
  released = FALSE, deleted = FALSE, wake_at = NULL
WHERE log_id = :log_id
RETURNING epoch;
-- expired: true when the row that you read had an owner_id that is not
-- :owner_id, and released was FALSE.
COMMIT;
```

`deleted = FALSE` opens a deleted log again. For the other methods:

- `pinToWorkers`, `putSnapshot`, and `truncate` need the owner. Lock the row with
  `SELECT 1 FROM log_owner WHERE log_id = :log_id AND epoch = :epoch AND epoch > 0
  AND NOT released FOR UPDATE`. No row: reject with `OwnershipLostError`.
- `offerInput` first reads `deleted` with `SELECT deleted FROM log_owner WHERE log_id =
  :log_id FOR SHARE`. `TRUE`: return `'deleted'`, and insert nothing.
- In `listLogsWithoutOwner`, the harness of a log is `log_owner.harness`. When it is `NULL`,
  use the `harness` of the first offer of the log (the lowest `id`).
- Use the database clock (`now()`) for each expiry, wake time, and `offeredAt`. The
  clocks of the hosts can disagree.
- `markHostAlive` is one upsert into `log_hosts`. In `acquireOwnership` and `listLogsWithoutOwner`, an
  affinity counts only when its row has `expires_at > now()`:

```sql
INSERT INTO log_hosts (host_id, expires_at)
VALUES (:host_id, now() + :ttl_ms * interval '1 millisecond')
ON CONFLICT (host_id) DO UPDATE SET expires_at = EXCLUDED.expires_at;

-- The pin of a log that `acquireOwnership` and `listLogsWithoutOwner` respect.
SELECT o.affinity FROM log_owner o
JOIN log_hosts h ON h.host_id = o.affinity AND h.expires_at > now()
WHERE o.log_id = :log_id;
```

- Keep the snapshot in one more table, with one row per log.
- `deleteLog` deletes the rows of the log in the other tables. It inserts the
  `log_owner` row when it is missing, and sets `head = 0`, `first_seq = 1`,
  `released = TRUE`, `deleted = TRUE`, and no `wake_at` or `affinity`. It keeps
  `epoch`. The released row refuses every write, also with `NO_OWNER_EPOCH`, and
  `deleted` refuses every offer, until the next `acquireOwnership`. That owner starts a new
  log at position 1.
- Each record is JSON. Store it as text or as a JSON column. The store does not read
  the records.

Your store is done when the
[conformance suite](#check-the-session-stores-with-the-conformance-suite) passes
with `twin`.

## SessionIndexStore

Your app shows a list of sessions: the title, the owner, the time of the last change,
and the token totals. Reading every transcript to build that list is slow.
`SessionIndexStore` keeps one small entry per tenant and thread. The index holds no
messages. The data of each thread stays in the stores that hold it.

```ts
interface SessionMember {
  userId: string
  role: 'owner' | 'member' | 'viewer' | 'operator'
}

interface SessionIndexKey {
  tenantId?: string // without it, the default tenant
  threadId: string
}

interface SessionIndexEntry {
  tenantId?: string // with `threadId`, the key of the entry
  threadId: string
  members: Array<SessionMember> // the users who can open the thread. The owner has the role `owner`. Empty for a subagent child
  harness?: string // the name of the setup that runs the thread
  title?: string
  parentThreadId?: string // the parent thread. A subagent child's own threadId is `subagent:<runId>`
  parentToolCallId?: string // the tool call in the parent thread that started it
  createdAt: number // epoch ms, the first open
  updatedAt: number // epoch ms, the last change
  pinned?: boolean
  archived?: boolean // `list` leaves it out unless `withArchived` is `true`
  usage?: {
    turns: number // model calls
    promptTokens: number
    completionTokens: number
    totalTokens: number
    cachedTokens: number
    cacheWriteTokens: number
    cost?: number // USD
  }
  metadata?: Record<string, unknown> // app data, for example pinned files
}

interface SessionIndexListOptions {
  tenantId?: string // one tenant per list. Without it, the default tenant
  memberId?: string // only the entries with this user in `members`
  limit?: number
  cursor?: string
  parentThreadId?: string | null
  search?: string
  harness?: string
  metadata?: Record<string, string>
  withArchived?: boolean // `true`: also the entries with `archived: true`
}

interface SessionIndexPage {
  entries: Array<SessionIndexEntry>
  cursor?: string // only when `truncated`
  truncated?: boolean
}

interface SessionIndexStore {
  get(key: SessionIndexKey): Promise<SessionIndexEntry | undefined>
  getVersioned(
    key: SessionIndexKey,
  ): Promise<{ entry: SessionIndexEntry; revision: string } | undefined>
  upsert(entry: SessionIndexEntry): Promise<void>
  upsertIf(input: {
    entry: SessionIndexEntry
    revision: string | null
  }): Promise<{ ok: true; revision: string } | { ok: false; reason: 'conflict' }>
  list(options?: SessionIndexListOptions): Promise<SessionIndexPage>
  delete(key: SessionIndexKey): Promise<void>
}
```

The key of an entry is its `tenantId` and its `threadId` together. A key without
`tenantId` is in the default tenant. So one thread id in two tenants is two entries.
In SQL, store the default tenant as `''`, and make `(tenant_id, thread_id)` the
primary key.

Rules for `get`, `upsert`, and `delete`:

- `get` returns `undefined` for an unknown key, not `null`.
- `upsert` replaces the whole entry for the key of `entry`. A field that the new
  entry does not have is gone. Do not merge. To change one field, read the entry and
  write a changed copy with `upsertIf`.
- Keep `members` as they are written. The host decides what each role can do.
- `delete` is a hard delete. After it, `get` and `getVersioned` return `undefined`,
  and `upsertIf` with revision `null` writes a new entry. The messages, the log, and
  the other data of the thread stay. For an unknown key, `delete` does nothing.

Rules for `list`:

- Return the entries of one tenant only: the `tenantId` of the options, or the
  default tenant without it. Never return an entry of another tenant.
- Sort by `updatedAt`, the newest first. Entries with the same `updatedAt` go in
  `threadId` order. `pinned` gets no special place.
- `memberId` returns only the entries whose `members` have that user id, with any
  role. A subagent child has no members, so it never matches.
- `parentThreadId: 'x'` returns only the entries whose parent is `x`. `null` returns
  only the entries with no parent. `search` returns only the entries whose `title`
  contains the text, without case. `harness` and `metadata` match exact strings.
- Leave out the entries with `archived: true`, unless `withArchived` is `true`.
  Filter them in the query, so a page with `limit` stays full.
- All filters must match. With `limit`, when more entries match, return
  `truncated: true` and a `cursor`. The next call with that `cursor` returns the
  entries after the last entry of the page.

With `stores.sessions`, `withPersistence` writes an entry for each subagent child, in
the tenant of its `tenantId` option. The entry has the parent thread, the tool call
that started the child, and the `harness` of the parent entry. It has no members:
access to a child goes through its top-level thread.

### Keep the writes of several hosts

Two hosts can write one entry at the same time. For example, one host writes the
usage of a turn while another host writes the pinned files of the app. The host
changes an entry with `getVersioned` and `upsertIf`, so the second write never removes
the change of the first. Both methods are required: without them, `createHarnessHost`
throws.

Rules for `getVersioned` and `upsertIf`:

- `getVersioned` returns the entry and its revision, or `undefined` for an unknown
  key. The format of the revision is yours.
- A write that changes the entry gives it a new revision: `upsert` and `upsertIf`
  both. A revision can be a hash of the content (an ETag of S3 or Netlify Blobs).
  Then the same entry, written again after a `delete`, gets the same revision back.
- `upsertIf` writes only when the current revision of the key is `revision`, and
  returns `{ ok: true, revision }` with the new revision. Pass `null` to write only
  when the key has no entry.
- On any other revision, `upsertIf` writes nothing and returns
  `{ ok: false, reason: 'conflict' }`.

In SQL, keep a revision column. Then:

- For a revision, write with
  `UPDATE ... WHERE tenant_id = ? AND thread_id = ? AND revision = ?`. When no row
  changed, return a conflict.
- For `null`, write with `INSERT ... ON CONFLICT DO NOTHING`. When no row was
  added, return a conflict.

`memoryPersistence()` has every method. Its cursor is `<updatedAt>:<threadId>` of the
last entry of a page.

### Check the session stores with the conformance suite

`runPersistenceConformance` runs the cases of `log` and `sessions` when your
persistence has that store. A persistence without one
needs no `skip` entry for it. The `sessions` cases also check the tenants, the
`memberId` filter, the hard delete, and compare-and-set.

To check one session store alone, skip the stores that the suite reads by default:

```ts
import { runPersistenceConformance } from '@tanstack/ai-persistence/testkit'
import { mySessionIndex } from './session-index'

runPersistenceConformance(
  'my session index',
  () => ({ stores: { sessions: mySessionIndex() } }),
  {
    skip: [
      'messages',
      'activities',
      'runs',
      'interrupts',
      'metadata',
      'generationRuns',
      'artifacts',
      'blobs',
    ],
  },
)
```

Some `log` cases need two machines on one backend:

- A listener on one instance runs after an append on the other.
- Only one instance gets the log from `acquireOwnership`.
- An offer on one instance is a `'duplicate'` on the other.
- A listener that throws does not stop the listeners of the other instance.

Pass `twin`: a function that returns a second store set on the same backend. Its `log`
must be a new store instance, not the same object. If your persistence has `log` and
no `twin`, these cases fail.

```ts
import { runPersistenceConformance } from '@tanstack/ai-persistence/testkit'
import { db } from './db'
import { myLogStore } from './log-store'

runPersistenceConformance(
  'my log store',
  () => ({ stores: { log: myLogStore(db) } }),
  {
    skip: [
      'messages',
      'activities',
      'runs',
      'interrupts',
      'metadata',
      'generationRuns',
      'artifacts',
      'blobs',
    ],
    // A second store on the same database acts as a second machine.
    twin: (persistence) => ({
      stores: { ...persistence.stores, log: myLogStore(db) },
    }),
  },
)
```

For the memory store, share one `memoryLogState()`. Each
`memoryLogStore({ state })` call on it gives one more store instance on that
state.

## How the records relate

The thread is not a table. It exists as the `thread_id` that the other records refer to. `metadata` is separate, keyed by `(namespace, key)`. On the generation side, a run is keyed by its own `run_id` first. Its `thread_id` names the slot that the run fills, and `findLatestForThread` hydrates by it.

```mermaid
erDiagram
    MESSAGES ||--o{ RUN : "thread_id, a thread has many runs"
    RUN ||--o{ INTERRUPT : "run_id, a run can pause on interrupts"
    MESSAGES ||..o{ GENERATION_RUN : "thread_id, the slot a run fills"
    GENERATION_RUN ||--o{ ARTIFACT : "run_id, a run produces artifacts"
    ARTIFACT ||--|| BLOB : "blob_key, the bytes"

    MESSAGES {
        string thread_id PK
        json messages_json "full transcript, overwritten on save"
    }
    RUN {
        string run_id PK
        string thread_id
        string status "running | interrupted | completed | failed | aborted"
        int started_at
        int finished_at
    }
    INTERRUPT {
        string interrupt_id PK
        string run_id
        string thread_id
        string status "pending | resolved | cancelled"
        int requested_at
    }
    GENERATION_RUN {
        string run_id PK
        string thread_id "the slot this run fills"
        string activity "image | audio | tts | video | transcription"
        string status "running | interrupted | completed | failed | aborted"
    }
    ARTIFACT {
        string artifact_id PK
        string run_id
        string blob_key "where the bytes live"
        string mime_type
        int size
    }
    BLOB {
        string key PK
        blob bytes
    }
```

## Typing an adapter

Each store has a `define*Store` helper:

| Helper | Store |
| --- | --- |
| `defineMessageStore` | `messages` |
| `defineActivityStore` | `activities` |
| `defineRunStore` | `runs` |
| `defineInterruptStore` | `interrupts` |
| `defineMetadataStore` | `metadata` |
| `defineGenerationRunStore` | `generationRuns` |
| `defineArtifactStore` | `artifacts` |
| `defineBlobStore` | `blobs` |
| `defineLogStore` | `log` |
| `defineSessionIndexStore` | `sessions` |

The helpers compose into `defineAIPersistence`, which tracks exactly which stores exist. The stores you passed autocomplete on `persistence.stores`. A read of a store you did not pass is a compile error.

Those ten keys are the only ones that `stores` accepts. Any other key throws `Unknown AIPersistence store key` at construction.

To annotate the value, use a named shape:

| Shape | Stores |
| --- | --- |
| `ChatPersistence` | All four chat state stores: `messages`, `runs`, `interrupts`, `metadata` |
| `ChatTranscriptPersistence` | The `messages` floor |
| `AIPersistence` | All stores optional. `withPersistence` rejects it, because `stores.messages` can be `undefined`. |
