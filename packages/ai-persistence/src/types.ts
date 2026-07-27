import type { ModelMessage, Scope, TokenUsage } from '@tanstack/ai'

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
// Store *records* (`RunRecord`, `InterruptRecord`) speak **epoch
// milliseconds** (`number`), the native unit for SQL/`BIGINT` columns and
// `Date.now()`. Wire/result references that leave the persistence layer speak
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

export type RunStatus = 'running' | 'completed' | 'failed' | 'interrupted'

/**
 * A single **chat** run (one agent turn within a conversation).
 *
 * `threadId` is the conversation key ({@link Scope.threadId}) — never a
 * generation `requestId`. Generation jobs must not reuse this record by
 * faking `threadId = requestId`; they need a separate job store (see
 * `withGenerationPersistence` JSDoc).
 *
 * @property startedAt - Epoch ms when the run was first created.
 * @property finishedAt - Epoch ms when the run reached a terminal status.
 */
export interface RunRecord {
  runId: string
  /** Conversation this run belongs to — same as {@link Scope.threadId}. */
  threadId: string
  status: RunStatus
  startedAt: number
  finishedAt?: number
  error?: string
  usage?: TokenUsage
}

/** Durable store for run lifecycle records. */
export interface RunStore {
  /**
   * Create a run record, or return the existing one if `runId` is already
   * present (resume).
   *
   * INVARIANT (idempotency): if a record for `runId` already exists it is
   * returned **unchanged** and the passed `threadId`/`startedAt`/`status` are
   * ignored. This is what makes resuming a run safe — the second call for a
   * `runId` must not mutate `startedAt`, `threadId`, or status. `status`
   * defaults to `'running'` on first creation.
   */
  createOrResume: (
    input: Pick<RunRecord, 'runId' | 'threadId' | 'startedAt'> & {
      status?: RunStatus
    },
  ) => Promise<RunRecord>
  /**
   * Patch a run record's mutable fields.
   *
   * INVARIANT: updating a `runId` that does not exist is a **no-op** — it must
   * not throw and must not create a record.
   */
  update: (
    runId: string,
    patch: Partial<
      Pick<RunRecord, 'status' | 'finishedAt' | 'error' | 'usage'>
    >,
  ) => Promise<void>
  /** Return the run record for `runId`, or `null` if none exists. */
  get: (runId: string) => Promise<RunRecord | null>
  /**
   * The most recent `'running'` run for `threadId`, or `null` if none is active.
   *
   * This resolves "does this thread have a live run to attach to?" from the
   * STABLE thread id, which is the durable basis for reconnecting a client (a
   * reload, or the same thread opened on another device) — independent of the
   * ephemeral run id, which a single turn may mint several of. When more than
   * one run is `'running'`, the one with the greatest `startedAt` wins.
   *
   * REQUIRED: `reconstructChat` calls this to build the `activeRun` cursor a
   * reloading client tails. A backend that returns `null` unconditionally does
   * not "degrade" — it turns reconnect off, and does so silently, because
   * `null` is also the correct answer when nothing is running.
   */
  findActiveRun: (threadId: string) => Promise<RunRecord | null>
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
/** Type a {@link RunStore} implementation inline. */
export function defineRunStore(store: RunStore): RunStore {
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
  'interrupts',
  'metadata',
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
 * Generation middleware entrypoint rule: `runs` is required (run lifecycle is
 * the only generation state this middleware tracks).
 */
export function validateGenerationPersistenceStores(
  persistence: AIPersistence,
): void {
  validatePersistenceStoreKeys(persistence)
  if (!persistence.stores.runs) {
    throw new Error('Generation persistence requires stores.runs.')
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
