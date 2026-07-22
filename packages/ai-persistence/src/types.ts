import type { ModelMessage, TokenUsage } from '@tanstack/ai'
import type { LockStore } from './locks'

// ===========================================================================
// Store contracts
// ===========================================================================
//
// EVOLUTION POLICY
// ----------------
// These store interfaces are the compatibility surface between the core
// middleware and every backend (memory, drizzle, prisma, cloudflare, …).
// To avoid breaking existing adapters:
//
//   - New store methods are added as OPTIONAL (`method?: (...) => ...`). The
//     middleware feature-detects them (`store.method?.(...)`) and degrades
//     gracefully when a backend has not implemented them yet.
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
 * A "thread" is the unit of conversation history. `saveThread` always receives
 * and persists the **complete, authoritative** message list — it is an
 * overwrite, never an append. The middleware snapshots `ctx.messages` (the full
 * running transcript) into it.
 */
export interface MessageStore {
  /**
   * Return the full stored transcript for `threadId`, in insertion order.
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
 * A single generation/chat run.
 *
 * @property startedAt - Epoch ms when the run was first created.
 * @property finishedAt - Epoch ms when the run reached a terminal status.
 */
export interface RunRecord {
  runId: string
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
 * Scoped key/value store for arbitrary JSON metadata.
 *
 * `(scope, key)` is the composite identity; the same `key` under different
 * scopes is independent.
 */
export interface MetadataStore {
  /**
   * Return the stored value for `(scope, key)`, or `null` if absent.
   *
   * CAVEAT: the return type is `unknown | null`, where `| null` collapses into
   * `unknown` — a stored value of `null` is therefore **indistinguishable from
   * absence** at the type level. Callers that must persist a real `null`
   * distinctly from "not set" should wrap it (e.g. store `{ value: null }`).
   */
  get: (scope: string, key: string) => Promise<unknown | null>
  /** Insert or overwrite the value for `(scope, key)`. */
  set: (scope: string, key: string, value: unknown) => Promise<void>
  /** Remove `(scope, key)`. A no-op if absent. Does not affect other scopes. */
  delete: (scope: string, key: string) => Promise<void>
}

export interface AIPersistenceStores {
  messages?: MessageStore
  runs?: RunStore
  interrupts?: InterruptStore
  metadata?: MetadataStore
  locks?: LockStore
}

export interface AIPersistence<
  TStores extends AIPersistenceStores = AIPersistenceStores,
> {
  stores: ExactStoreKeys<TStores>
}

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
  'locks',
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

export function validateChatPersistenceStores(
  persistence: AIPersistence,
): void {
  validatePersistenceStoreKeys(persistence)
  if (persistence.stores.interrupts && !persistence.stores.runs) {
    throw new Error('Chat persistence stores.interrupts requires stores.runs.')
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
