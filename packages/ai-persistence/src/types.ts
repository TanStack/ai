import type {
  ModelMessage,
  PersistedArtifactRef,
  RunStatus,
  RunStore,
  Scope,
  TokenUsage,
} from '@tanstack/ai'

// Re-export the shared identity type so app code can import Scope from either
// `@tanstack/ai` or `@tanstack/ai-persistence`. See {@link Scope} security notes:
// pair a client-visible `threadId` with a server-trusted `userId`/`tenantId`
// before authorizing load/save (e.g. via `reconstructChat({ authorize })`).
export type { Scope }

// ===========================================================================
// Store contracts
// ===========================================================================
//
// EVOLUTION POLICY
// ----------------
// These store interfaces are the compatibility surface between the core
// middleware and every backend — the in-memory reference store and every
// adapter an application writes against its own database.
//
//   - Store METHODS are REQUIRED. A new method is a breaking contract change:
//     every adapter gets a compile error and implements it. Do NOT add methods
//     as optional-and-feature-detected (`store.method?.(...)`) — an adapter
//     that has not implemented one is then indistinguishable from one whose
//     answer is legitimately empty, so the feature silently does nothing in
//     production instead of failing at build time. `findActiveRun` was optional
//     for exactly one release cycle and cost us precisely that: reconnect
//     degraded to "no active run" on every backend that had not caught up.
//   - Capability tiers belong at the STORE level, not the method level. A
//     backend that only stores a transcript declares `ChatTranscriptStores`
//     (no `runs`); it does not declare a half-implemented `RunStore`.
//   - Never tighten an existing method's required arguments or widen its
//     required return shape in a breaking way.
//
// The shared conformance testkit (`./testkit/conformance.ts`) is the
// authoritative compatibility gate: every invariant documented on the methods
// below is asserted there, and every backend runs the identical suite. If an
// invariant is not encoded in the testkit, adapters cannot discover it — so
// promote new invariants into both the JSDoc here AND the testkit.
//
// TIMESTAMP CONVENTION
// --------------------
// Store *records* (`RunRecord`, `InterruptRecord`, `ArtifactRecord`,
// `BlobRecord`) speak **epoch milliseconds** (`number`), the native unit for
// SQL/`BIGINT` columns and `Date.now()`. Wire/result references that leave the
// persistence layer (e.g. core's `PersistedArtifactRef.createdAt`) speak
// **ISO-8601 strings**. The middleware performs the number→ISO conversion at
// the boundary; do not mix the two on a single field.

/**
 * Durable store for a thread's full message transcript.
 *
 * A "thread" is the unit of conversation history. The key is
 * {@link Scope.threadId} (the same conversation id as
 * `ChatMiddlewareContext.threadId`). Store methods take a bare string for
 * adapter simplicity; multi-user isolation is the **host's** job — authorize
 * against `Scope.userId` / `Scope.tenantId` (derived server-side from session)
 * before calling load/save, and never treat a client-supplied thread id alone
 * as an ownership proof (see `Scope` security notes in `@tanstack/ai`).
 *
 * `saveThread` always receives and persists the **complete, authoritative**
 * message list — it is an overwrite, never an append. The middleware snapshots
 * `ctx.messages` (the full running transcript) into it.
 */
export interface MessageStore {
  /**
   * Return the full stored transcript for `threadId` ({@link Scope.threadId}),
   * in insertion order.
   *
   * INVARIANT: returns an empty array (never `null`/`undefined`) for a thread
   * that was never saved. Callers treat `[]` as "no history".
   */
  loadThread: (threadId: string) => Promise<Array<ModelMessage>>
  /**
   * Overwrite the stored transcript for `threadId` with `messages`.
   *
   * INVARIANT: this is a full replace. `messages` is the complete authoritative
   * history; the previous contents are discarded (not merged or appended).
   */
  saveThread: (threadId: string, messages: Array<ModelMessage>) => Promise<void>
}

// Run lifecycle types live in `@tanstack/ai` and are re-exported here: one run,
// one record — shared by this package's `runs` store and `@tanstack/ai-sandbox`'s
// run driver, instead of each package keeping a rival definition that can drift.
export type {
  RunStatus,
  TerminalRunStatus,
  RunRecord,
  RunStore,
} from '@tanstack/ai'
export { isTerminalRunStatus, defineRunStore } from '@tanstack/ai'

/**
 * Lifecycle status of a generation run. Deliberately the same vocabulary as
 * {@link RunStatus}, so an adapter that stores both kinds of run can share one
 * status column and one set of checks.
 */
export type GenerationRunStatus = RunStatus

/**
 * A single generation run (one `generateImage` / `generateVideo` / … call).
 *
 * Its primary identity is `runId`: the run/request id the activity mints, the
 * same AG-UI run id the client sends on the wire. `threadId` is the SLOT the
 * run fills, a stable app-chosen name that groups successive runs of the same
 * thing, and it is what a server-driven client hydrates by. Generation state is
 * kept here, never in the chat {@link RunStore}.
 *
 * `result` holds terminal result METADATA (ids, model, urls, a provider video
 * job id), never the media bytes — those live in a {@link BlobStore}.
 * `artifacts` are the durable {@link PersistedArtifactRef}s, present only when
 * byte storage is on.
 *
 * @property startedAt - Epoch ms when the run was first created.
 * @property finishedAt - Epoch ms when the run reached a terminal status.
 */
export interface GenerationRunRecord {
  runId: string
  /**
   * The scope this run belongs to: a stable, app-chosen name for the slot
   * successive runs fill (`product-123-hero`, `video-9-start-frame`).
   *
   * REQUIRED, per the store-contract rule at the top of this file.
   * {@link GenerationRunStore.findLatestForThread} is the only query that
   * hydrates a run, and it keys on this — so a record without one can be
   * written and then never found again. `withGenerationPersistence` already
   * refuses to start a run without a scope, and a server-driven client
   * discards a snapshot that arrives without one, so an optional field here
   * only described a record no path could produce and no client would accept.
   */
  threadId: string
  /** `'image' | 'audio' | 'tts' | 'video' | 'transcription'`. */
  activity: string
  provider: string
  model: string
  status: GenerationRunStatus
  startedAt: number
  finishedAt?: number
  error?: { message: string; code?: string }
  /** Terminal result metadata (ids, model, urls). Never the media bytes. */
  result?: unknown
  /** Durable artifact references, when an artifacts + blobs backend is used. */
  artifacts?: Array<PersistedArtifactRef>
  usage?: TokenUsage
}

/**
 * Durable store for generation run records, the generation counterpart to
 * {@link RunStore}. Keyed by its own `runId`, with `threadId` the slot
 * {@link GenerationRunStore.findLatestForThread} looks runs up by.
 */
export interface GenerationRunStore {
  /**
   * Create a run record, or return the existing one if `runId` is already
   * present (resume).
   *
   * INVARIANT (idempotency): a second call for a `runId` returns the existing
   * record unchanged; `startedAt`/`activity`/`provider`/`model`/`threadId` are
   * not mutated. `status` defaults to `'running'` on first creation.
   */
  createOrResume: (
    input: Pick<
      GenerationRunRecord,
      'runId' | 'threadId' | 'activity' | 'provider' | 'model' | 'startedAt'
    > & { status?: GenerationRunStatus },
  ) => Promise<GenerationRunRecord>
  /**
   * Patch a run record's mutable fields.
   *
   * INVARIANT: patching a `runId` that does not exist is a **no-op** — it must
   * not throw and must not create a record.
   */
  update: (
    runId: string,
    patch: Partial<
      Pick<
        GenerationRunRecord,
        'status' | 'finishedAt' | 'error' | 'result' | 'artifacts' | 'usage'
      >
    >,
  ) => Promise<void>
  /** Return the run record for `runId`, or `null` if none exists. */
  get: (runId: string) => Promise<GenerationRunRecord | null>
  /**
   * The most recent run linked to `threadId`, or `null`.
   *
   * REQUIRED, per the store-contract rule at the top of this file: a
   * server-authoritative client hydrates by the stable thread id on every
   * mount, so an adapter without this would be indistinguishable from one that
   * legitimately has no run — `persistence: true` would silently restore
   * nothing, forever. `null` is the correct answer only when the thread really
   * has no runs. The chat parallel is {@link RunStore.findActiveRun}.
   */
  findLatestForThread: (threadId: string) => Promise<GenerationRunRecord | null>
}

/** Lifecycle status of a human-in-the-loop interrupt. */
export type InterruptStatus = 'pending' | 'resolved' | 'cancelled'

/**
 * A human-in-the-loop interrupt (tool approval, client-tool input request, …).
 *
 * @property requestedAt - Epoch ms when the interrupt was created.
 * @property resolvedAt - Epoch ms when the interrupt was resolved/cancelled;
 *   absent while pending.
 */
export interface InterruptRecord {
  interruptId: string
  runId: string
  threadId: string
  status: InterruptStatus
  requestedAt: number
  resolvedAt?: number
  payload: Record<string, unknown>
  response?: unknown
}

/** A terminal interrupt write for {@link InterruptStore.commitBatch}. */
export type InterruptCommitEntry =
  | {
      interruptId: string
      status: 'resolved'
      response?: unknown
    }
  | {
      interruptId: string
      status: 'cancelled'
    }

/** Durable store for human-in-the-loop interrupts. */
export interface InterruptStore {
  /**
   * Persist a new interrupt in the `'pending'` state.
   *
   * The record is accepted without `status`/`resolvedAt` so a "born resolved"
   * interrupt is unrepresentable — every interrupt begins pending and only
   * `resolve`/`cancel` may move it to a terminal state.
   *
   * INVARIANT (insert-if-absent): if an interrupt with the same `interruptId`
   * already exists, `create` is a **no-op** — it must NOT overwrite the
   * existing record. This is the canonical behaviour (SQL backends implement it
   * via `ON CONFLICT DO NOTHING` / upsert-with-empty-update), so a duplicate
   * create can never clobber a resolved interrupt back to pending.
   */
  create: (
    record: Omit<InterruptRecord, 'status' | 'resolvedAt'>,
  ) => Promise<void>
  /**
   * Move an interrupt to `'resolved'`, stamping `resolvedAt` and storing
   * `response`. A no-op if `interruptId` does not exist.
   */
  resolve: (interruptId: string, response?: unknown) => Promise<void>
  /**
   * Move an interrupt to `'cancelled'`, stamping `resolvedAt`. A no-op if
   * `interruptId` does not exist.
   */
  cancel: (interruptId: string) => Promise<void>
  /**
   * Commit terminal writes for a validated resume batch.
   *
   * Optional. When present, `withPersistence` calls it once instead of
   * calling `resolve` and `cancel` for each entry. Apply every entry or none.
   *
   * Reject the whole batch (throw, writing nothing) when any entry has a
   * duplicate `interruptId`, references an `interruptId` that does not exist,
   * or references an interrupt whose status is not `'pending'`. This is
   * stricter than `resolve` / `cancel`, which are no-ops for a missing
   * `interruptId`.
   */
  commitBatch?: (entries: ReadonlyArray<InterruptCommitEntry>) => Promise<void>
  /** Return the interrupt for `interruptId`, or `null` if none exists. */
  get: (interruptId: string) => Promise<InterruptRecord | null>
  /**
   * All interrupts for a thread.
   *
   * INVARIANT: ordered by insertion (equivalently `requestedAt` ascending). SQL
   * backends MUST `ORDER BY requested_at` — the middleware and testkit rely on
   * this stable ordering.
   */
  list: (threadId: string) => Promise<Array<InterruptRecord>>
  /** Pending interrupts for a thread, ordered by `requestedAt` ascending. */
  listPending: (threadId: string) => Promise<Array<InterruptRecord>>
  /** All interrupts for a run, ordered by `requestedAt` ascending. */
  listByRun: (runId: string) => Promise<Array<InterruptRecord>>
  /** Pending interrupts for a run, ordered by `requestedAt` ascending. */
  listPendingByRun: (runId: string) => Promise<Array<InterruptRecord>>
}

/**
 * Namespaced key/value store for arbitrary JSON metadata (app-owned).
 *
 * The first argument is an **app-defined namespace string**, not the shared
 * {@link Scope} identity type from `@tanstack/ai`. Composite identity is
 * `(namespace, key)` as two independent fields (SQL backends use a composite
 * primary key; the in-memory store uses nested maps). Do not encode both into a
 * single delimited string — `${namespace}:${key}` collides when either part
 * contains `:`.
 *
 * The same `key` under different namespaces is independent.
 */
export interface MetadataStore {
  /**
   * Return the stored value for `(namespace, key)`, or `null` if absent.
   *
   * CAVEAT: the return type is `unknown | null`, where `| null` collapses into
   * `unknown` — a stored value of `null` is therefore **indistinguishable from
   * absence** at the type level. Callers that must persist a real `null`
   * distinctly from "not set" should wrap it (e.g. store `{ value: null }`).
   */
  get: (namespace: string, key: string) => Promise<unknown | null>
  /** Insert or overwrite the value for `(namespace, key)`. */
  set: (namespace: string, key: string, value: unknown) => Promise<void>
  /**
   * Remove `(namespace, key)`. A no-op if absent. Does not affect other
   * namespaces.
   */
  delete: (namespace: string, key: string) => Promise<void>
}

// ===========================================================================
// Store typers
// ===========================================================================
//
// Identity helpers that type a store implementation inline: pass an object
// literal and get autocomplete + contract checking, with no separate
// `: MessageStore` return annotation. They compose into `defineAIPersistence`,
// which infers **exact presence** — a store you define becomes a defined,
// non-optional, autocompleted key on `persistence.stores`, and accessing a store
// you did not define is a compile error.
//
// ```ts
// const persistence = defineAIPersistence({
//   stores: {
//     messages: defineMessageStore({ loadThread, saveThread }),
//     runs: defineRunStore({ createOrResume, update, get, findActiveRun }),
//   },
// })
// persistence.stores.runs        // RunStore (defined)
// persistence.stores.interrupts  // compile error — not provided
// ```
//
// Presence is per STORE, not per method: every method of a store you define is
// required (see the evolution policy above). Omitting one is a compile error,
// not a partial store.

/** Type a {@link MessageStore} implementation inline. */
export function defineMessageStore(store: MessageStore): MessageStore {
  return store
}
/** Type an {@link InterruptStore} implementation inline. */
export function defineInterruptStore(store: InterruptStore): InterruptStore {
  return store
}
/** Type a {@link MetadataStore} implementation inline. */
export function defineMetadataStore(store: MetadataStore): MetadataStore {
  return store
}
/** Type a {@link GenerationRunStore} implementation inline. */
export function defineGenerationRunStore(
  store: GenerationRunStore,
): GenerationRunStore {
  return store
}
/** Type an {@link ArtifactStore} implementation inline. */
export function defineArtifactStore(store: ArtifactStore): ArtifactStore {
  return store
}
/** Type a {@link BlobStore} implementation inline. */
export function defineBlobStore(store: BlobStore): BlobStore {
  return store
}

/**
 * Metadata row describing a persisted artifact (generated media, tool output).
 *
 * The bytes themselves live in a {@link BlobStore}; this record holds the
 * descriptive metadata and an optional `sourceUrl` for reference-only
 * backends.
 *
 * @property createdAt - Epoch ms. (Core's wire-facing `PersistedArtifactRef`
 *   exposes the same instant as an ISO string; see the timestamp convention.)
 */
export interface ArtifactRecord {
  artifactId: string
  runId: string
  threadId: string
  /**
   * The blob-store key these bytes actually live under.
   *
   * Optional for backwards compatibility: records written before this existed
   * resolve via the default `artifacts/<runId>/<artifactId>` convention. New
   * records always carry it, which is what lets `storageKey` put bytes anywhere
   * — a reader can no longer recompute the path, so it has to be remembered.
   * Use `resolveArtifactBlobKey(record)` rather than reading it directly.
   */
  blobKey?: string
  name: string
  mimeType: string
  size: number
  sourceUrl?: string
  createdAt: number
}

/** Durable store for artifact metadata records. */
export interface ArtifactStore {
  /** Insert or overwrite the artifact metadata record. */
  save: (record: ArtifactRecord) => Promise<void>
  /** Return the artifact for `artifactId`, or `null` if none exists. */
  get: (artifactId: string) => Promise<ArtifactRecord | null>
  /** All artifacts for a run. Returns `[]` when the run has none. */
  list: (runId: string) => Promise<Array<ArtifactRecord>>
  /**
   * Delete a single artifact by id. A no-op if absent, mirroring
   * {@link BlobStore.delete} — the two are written and deleted as a pair, so
   * their contracts match.
   */
  delete: (artifactId: string) => Promise<void>
  /**
   * Delete every artifact belonging to `runId`. A no-op when the run has none.
   *
   * Required rather than feature-detected: retention and erasure are the point
   * of storing media durably, and an adapter silently lacking deletion is
   * indistinguishable from one where there was nothing to delete.
   */
  deleteForRun: (runId: string) => Promise<void>
}

/**
 * Accepted body shapes for {@link BlobStore.put}. `ArrayBufferView` already
 * covers `Uint8Array` and every other typed-array/`DataView`, so no separate
 * `Uint8Array` member is needed.
 */
export type BlobBody =
  | ReadableStream<Uint8Array>
  | ArrayBuffer
  | ArrayBufferView
  | string
  | Blob

/**
 * Metadata for a stored blob.
 *
 * @property size - Byte length, when known.
 * @property createdAt - Epoch ms first written.
 * @property updatedAt - Epoch ms last overwritten.
 */
export interface BlobRecord {
  key: string
  size?: number
  etag?: string
  contentType?: string
  customMetadata?: Record<string, string>
  createdAt?: number
  updatedAt?: number
}

/**
 * A byte range to read, in the shape an HTTP `Range` header resolves to.
 *
 * `offset` is measured from the start of the object and must be inside it;
 * `length` defaults to "everything from `offset` to the end" and is clamped to
 * the end when it overshoots. Suffix ranges (`bytes=-500`) are the caller's to
 * resolve against the known size — a serve route has the size on the artifact
 * record, and has to compare against it anyway to answer `416` before reading.
 */
export interface BlobRange {
  offset: number
  length?: number
}

/** Options for {@link BlobStore.get}. */
export interface BlobGetOptions {
  /**
   * Read only this slice of the object. `body`, `arrayBuffer()` and `text()`
   * then cover the slice, `size` still reports the WHOLE object, and `range`
   * reports the slice actually served — the three numbers a `206` response
   * needs (`Content-Range: bytes <offset>-<offset+length-1>/<size>`).
   */
  range?: BlobRange
}

/** A stored blob's metadata plus lazy accessors for its bytes. */
export interface BlobObject extends BlobRecord {
  arrayBuffer: () => Promise<ArrayBuffer>
  text: () => Promise<string>
  body?: ReadableStream<Uint8Array>
  /**
   * The slice this object exposes, when a {@link BlobGetOptions.range} was
   * requested and honoured: `offset` as asked, `length` as actually served
   * (clamped to the end of the object). Absent on a whole-object read.
   */
  range?: { offset: number; length: number }
}

/**
 * One page of a {@link BlobStore.list} scan.
 *
 * @property cursor - Opaque continuation token; present only when `truncated`.
 * @property truncated - `true` when more objects match beyond this page.
 */
export interface BlobListPage {
  objects: Array<BlobRecord>
  cursor?: string
  truncated?: boolean
}

export interface BlobPutOptions {
  contentType?: string
  customMetadata?: Record<string, string>
  /**
   * The exact byte length of `body`, when the producer knows it up front.
   *
   * Advisory, not a contract the store must honor: it exists so a store can
   * pick an upload strategy knowingly instead of discovering the length by
   * buffering. Most useful to an SDK that wants the length as a separate
   * argument rather than reading it off the stream — S3's `PutObject`
   * (`ContentLength`) is the archetype — and to a runtime that can re-attach
   * one (workerd's `FixedLengthStream` ahead of `R2Bucket.put`).
   *
   * Only ever set when the length is exact — a wrong value is worse than none,
   * since runtimes that enforce declared lengths fail the write. Absent means
   * unknown, and a store must accept a length-less stream regardless:
   * producers hand one over whenever the origin does not declare a length.
   */
  expectedLength?: number
}

export interface BlobListOptions {
  prefix?: string
  cursor?: string
  limit?: number
}

/** Durable object/blob store (byte-storing or reference-only backends). */
export interface BlobStore {
  /** Insert or overwrite the object at `key`, returning its metadata. */
  put: (
    key: string,
    body: BlobBody,
    options?: BlobPutOptions,
  ) => Promise<BlobRecord>
  /**
   * Return the object at `key` (metadata + byte accessors), or `null`.
   *
   * RANGE SEMANTICS: with `options.range`, return only that slice — the bytes
   * a `206` response carries — and report it back as `range`. `size` still
   * reports the whole object, so the caller can build `Content-Range` without
   * a second `head`. The reported `length` is what was actually served: a
   * requested `length` past the end clamps. An `offset` at or past the end is
   * a caller error, not a store one — the size is on the artifact record, so a
   * serve route answers `416` before ever asking the store.
   *
   * Range support is part of the contract for any store that holds bytes (the
   * conformance testkit asserts it): serving a whole file where a slice was
   * asked for is what makes `<video>` seeking, and Safari playback at all,
   * fail. A reference-only backend that stores no bytes skips `blobs`
   * entirely rather than half-implementing it.
   */
  get: (key: string, options?: BlobGetOptions) => Promise<BlobObject | null>
  /** Return only the metadata for `key`, or `null`. */
  head: (key: string) => Promise<BlobRecord | null>
  /** Remove the object at `key`. A no-op if absent. */
  delete: (key: string) => Promise<void>
  /**
   * List objects, optionally filtered by `prefix`, in ascending key order.
   *
   * CURSOR SEMANTICS: `prefix` matches literally and case-sensitively (SQL
   * backends must escape LIKE metacharacters, so `run_` matches only the exact
   * bytes `run_`, not `_` as a wildcard). When `limit` is given and more keys
   * match, the page is `truncated: true` with a `cursor`; passing that `cursor`
   * back returns the strictly-following keys (keys `> cursor`). Cursor ordering
   * is the same byte ordering as the sort, so paging visits every key exactly
   * once with no gaps or repeats. `limit: 0` yields an empty, untruncated page
   * with no cursor.
   */
  list: (options?: BlobListOptions) => Promise<BlobListPage>
}

/**
 * Sparse bag of **state** store keys — composition / validation only.
 *
 * **Not a public product shape.** Prefer the named chat shapes below
 * ({@link ChatTranscriptStores}, {@link ChatPersistenceStores},
 * {@link ChatWithInterruptsStores}). Locks are not included — use
 * `withLocks` from `@tanstack/ai`.
 *
 * @internal Exported from this module for generics; the package root does not
 * re-export this type — use a named shape or `AIPersistence<{ … }>` instead.
 */
export interface AIPersistenceStores {
  messages?: MessageStore
  runs?: RunStore
  interrupts?: InterruptStore
  metadata?: MetadataStore
  generationRuns?: GenerationRunStore
  artifacts?: ArtifactStore
  blobs?: BlobStore
}

/**
 * Chat floor: durable transcript. `messages` is required.
 *
 * `runs` / `interrupts` / `metadata` remain optional. If `interrupts` is set,
 * `runs` is required (enforced by `withPersistence` / validators).
 */
export interface ChatTranscriptStores {
  messages: MessageStore
  runs?: RunStore
  interrupts?: InterruptStore
  metadata?: MetadataStore
}

/**
 * Full chat durability — all four state stores are present. This is what
 * `memoryPersistence()` returns, and the shape most adapters should declare.
 *
 * Backends that only need a transcript should use
 * {@link ChatTranscriptStores} instead.
 */
export interface ChatPersistenceStores {
  messages: MessageStore
  runs: RunStore
  interrupts: InterruptStore
  metadata: MetadataStore
}

/**
 * Chat with durable human-in-the-loop interrupts (and optional metadata).
 * Implies `runs` (interrupt records are run-scoped).
 *
 * Prefer {@link ChatPersistenceStores} when you also have metadata (packaged
 * backends). Use this when interrupts are required but metadata is not.
 */
export interface ChatWithInterruptsStores {
  messages: MessageStore
  runs: RunStore
  interrupts: InterruptStore
  metadata?: MetadataStore
}

/**
 * Persistence aggregate. Parameterize with a named store shape, or a sparse
 * map for composition (`defineAIPersistence` / `composePersistence`).
 *
 * Default is the sparse bag so untyped / dynamic bags still type-check;
 * prefer {@link ChatTranscriptPersistence} or {@link ChatPersistence} at
 * call sites.
 */
export interface AIPersistence<
  TStores extends AIPersistenceStores = AIPersistenceStores,
> {
  stores: ExactStoreKeys<TStores>
}

/** {@link AIPersistence} for {@link ChatTranscriptStores}. */
export type ChatTranscriptPersistence = AIPersistence<ChatTranscriptStores>

/** {@link AIPersistence} for {@link ChatPersistenceStores}. */
export type ChatPersistence = AIPersistence<ChatPersistenceStores>

/** {@link AIPersistence} for {@link ChatWithInterruptsStores}. */
export type ChatWithInterruptsPersistence =
  AIPersistence<ChatWithInterruptsStores>

type StoreKey = keyof AIPersistenceStores
type ExactStoreKeys<TStores> =
  Exclude<keyof TStores, StoreKey> extends never
    ? TStores
    : TStores & Record<Exclude<keyof TStores, StoreKey>, never>

export type AIPersistenceOverrides = {
  [TKey in StoreKey]?: AIPersistenceStores[TKey] | false
}

type BaseStoreValue<
  TBase extends AIPersistenceStores,
  TKey extends StoreKey,
> = TKey extends keyof TBase ? TBase[TKey] : never

type OverrideStoreValue<
  TOverrides extends AIPersistenceOverrides,
  TKey extends StoreKey,
> = TKey extends keyof TOverrides ? TOverrides[TKey] : never

type ResolvedStoreValue<
  TBase extends AIPersistenceStores,
  TOverrides extends AIPersistenceOverrides,
  TKey extends StoreKey,
> = TKey extends keyof TOverrides
  ?
      | Exclude<OverrideStoreValue<TOverrides, TKey>, false | undefined>
      | (undefined extends OverrideStoreValue<TOverrides, TKey>
          ? Exclude<BaseStoreValue<TBase, TKey>, undefined>
          : never)
  : Exclude<BaseStoreValue<TBase, TKey>, undefined>

type BaseStoreIsRequired<
  TBase extends AIPersistenceStores,
  TKey extends StoreKey,
> = TKey extends keyof TBase
  ? object extends Pick<TBase, TKey>
    ? false
    : true
  : false

type ResolvedStoreIsRequired<
  TBase extends AIPersistenceStores,
  TOverrides extends AIPersistenceOverrides,
  TKey extends StoreKey,
> = TKey extends keyof TOverrides
  ? false extends OverrideStoreValue<TOverrides, TKey>
    ? false
    : undefined extends OverrideStoreValue<TOverrides, TKey>
      ? BaseStoreIsRequired<TBase, TKey>
      : true
  : BaseStoreIsRequired<TBase, TKey>

type ResolvedRequiredKeys<
  TBase extends AIPersistenceStores,
  TOverrides extends AIPersistenceOverrides,
> = {
  [TKey in StoreKey]-?: [ResolvedStoreValue<TBase, TOverrides, TKey>] extends [
    never,
  ]
    ? never
    : ResolvedStoreIsRequired<TBase, TOverrides, TKey> extends true
      ? TKey
      : never
}[StoreKey]

type ResolvedOptionalKeys<
  TBase extends AIPersistenceStores,
  TOverrides extends AIPersistenceOverrides,
> = {
  [TKey in StoreKey]-?: [ResolvedStoreValue<TBase, TOverrides, TKey>] extends [
    never,
  ]
    ? never
    : ResolvedStoreIsRequired<TBase, TOverrides, TKey> extends true
      ? never
      : TKey
}[StoreKey]

type Simplify<T> = { [TKey in keyof T]: T[TKey] }

export type ComposedAIPersistenceStores<
  TBase extends AIPersistenceStores,
  TOverrides extends AIPersistenceOverrides,
> = Simplify<
  {
    [TKey in ResolvedRequiredKeys<TBase, TOverrides>]: ResolvedStoreValue<
      TBase,
      TOverrides,
      TKey
    >
  } & {
    [TKey in ResolvedOptionalKeys<TBase, TOverrides>]?: ResolvedStoreValue<
      TBase,
      TOverrides,
      TKey
    >
  }
>

const storeKeys = [
  'messages',
  'runs',
  'generationRuns',
  'interrupts',
  'metadata',
  'artifacts',
  'blobs',
] satisfies Array<StoreKey>

const storeKeySet = new Set<string>(storeKeys)

function assertKnownStoreKeys(stores: object, location: string): void {
  for (const key of Object.keys(stores)) {
    if (!storeKeySet.has(key)) {
      throw new Error(`Unknown AIPersistence ${location} key: ${key}`)
    }
  }
}

export function validatePersistenceStoreKeys(persistence: AIPersistence): void {
  assertKnownStoreKeys(persistence.stores, 'store')
}

/**
 * Chat middleware entrypoint rules:
 * - `messages` is required (chat persistence means a durable transcript)
 * - `interrupts` requires `runs` (interrupt records are run-scoped)
 */
export function validateChatPersistenceStores(
  persistence: AIPersistence,
): void {
  validatePersistenceStoreKeys(persistence)
  if (!persistence.stores.messages) {
    throw new Error('Chat persistence requires stores.messages.')
  }
  if (persistence.stores.interrupts && !persistence.stores.runs) {
    throw new Error('Chat persistence stores.interrupts requires stores.runs.')
  }
}

/**
 * Generation middleware entrypoint rule: `generationRuns` is required (the
 * generation run lifecycle is keyed on its own `runId`, not a chat conversation
 * `threadId`). When artifact persistence is used, `artifacts` and `blobs` must
 * be provided together.
 */
export function validateGenerationPersistenceStores(
  persistence: AIPersistence,
): void {
  validatePersistenceStoreKeys(persistence)
  const hasArtifacts = persistence.stores.artifacts !== undefined
  const hasBlobs = persistence.stores.blobs !== undefined
  if (hasArtifacts !== hasBlobs) {
    throw new Error(
      'Generation artifact persistence requires both stores.artifacts and stores.blobs.',
    )
  }
  if (!persistence.stores.generationRuns) {
    throw new Error('Generation persistence requires stores.generationRuns.')
  }
}

/**
 * Server hydrate entrypoint rule: `messages` is required.
 */
export function validateReconstructChatStores(
  persistence: AIPersistence,
): void {
  validatePersistenceStoreKeys(persistence)
  if (!persistence.stores.messages) {
    throw new Error('reconstructChat requires stores.messages.')
  }
}

/**
 * Server hydrate entrypoint rule for generation: `generationRuns` is required.
 * The run store resolves the latest generation for a thread (or a specific run
 * id), so a server-authoritative client can hydrate the last generation's
 * status, result, and artifact refs on load.
 */
export function validateReconstructGenerationStores(
  persistence: AIPersistence,
): void {
  validatePersistenceStoreKeys(persistence)
  if (!persistence.stores.generationRuns) {
    throw new Error('reconstructGeneration requires stores.generationRuns.')
  }
}

export function defineAIPersistence<TStores extends AIPersistenceStores>(
  persistence: AIPersistence<ExactStoreKeys<TStores>>,
): AIPersistence<TStores> {
  validatePersistenceStoreKeys(persistence)
  return persistence
}

export function composePersistence<
  TBase extends AIPersistenceStores,
  TOverrides extends AIPersistenceOverrides,
>(
  base: AIPersistence<TBase>,
  config: {
    overrides: ExactStoreKeys<TOverrides>
  },
): AIPersistence<ComposedAIPersistenceStores<TBase, TOverrides>>
export function composePersistence(
  base: AIPersistence,
  config: { overrides: AIPersistenceOverrides },
): AIPersistence {
  validatePersistenceStoreKeys(base)
  assertKnownStoreKeys(config.overrides, 'override')

  const stores: AIPersistenceStores = { ...base.stores }
  for (const key of storeKeys) {
    if (!Object.prototype.hasOwnProperty.call(config.overrides, key)) continue
    const override = config.overrides[key]
    if (override === false) {
      delete stores[key]
    } else if (override !== undefined) {
      setStore(stores, key, override)
    }
  }
  return { stores }
}

function setStore<TKey extends StoreKey>(
  stores: AIPersistenceStores,
  key: TKey,
  value: NonNullable<AIPersistenceStores[TKey]>,
): void {
  stores[key] = value
}
