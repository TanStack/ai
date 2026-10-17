import { EventType } from '@tanstack/ai'
import { memoryCredentialStore } from '@tanstack/ai/byok/server'
import { memoryPersistence } from '@tanstack/ai-persistence'
import type { CredentialStore } from '@tanstack/ai/byok'
import { SharedLog, loadLogState, logIdOf } from './log'
import { LEASE } from './resume'
import { SessionImpl } from './session/harness-session'
import { HARNESS_EVENTS } from './types'
import { isRecord } from './utils'
import { changedEntry } from './session-entry'
import type { PromptCacheOptions, RunStore, StreamChunk } from '@tanstack/ai'
import type {
  AIPersistence,
  ArtifactStore,
  BlobStore,
  ChatTranscriptStores,
  GenerationRunStore,
  InboxStore,
  InterruptStore,
  LeaseStore,
  LogStore,
  MetadataStore,
  WorkClaimStore,
  SessionIndexEntry,
  SessionIndexKey,
  SessionIndexListOptions,
  SessionIndexPage,
  SessionIndexStore,
} from '@tanstack/ai-persistence'
import type { AnyHarness, HarnessLogStateOf, SessionMetadataOf } from './define'
import type { SessionEntryChange, SessionEntryUpdate } from './session-entry'
import type { ReduceOptions } from './log'
import type { LeaseOptions } from './resume'
import type { HarnessSession } from './session/index'
import type { ForkPoint, Principal } from './types'

type SharedStores = {
  artifacts?: ArtifactStore
  blobs?: BlobStore
  generationRuns?: GenerationRunStore
  /** Claims on busy threads, for `resumePending`. */
  workClaims?: WorkClaimStore
  /** The session index that `host.sessions` reads. */
  sessions?: SessionIndexStore
}

/** A durable host needs run leases, host leases, or both. */
type DurableLeases =
  | { runs: RunStore; leases?: LeaseStore }
  | { runs?: RunStore; leases: LeaseStore }

/**
 * The stores a host needs. Two shapes:
 *
 * - A message store, plus any of runs, interrupts, metadata, and inbox.
 *   Without an inbox, inputs are kept in memory and a restart loses the ones
 *   not yet applied.
 * - Durable mode: a `log`, and `runs` or `leases`. The log holds the events,
 *   transcript, inputs, and tool steps of each thread, so this shape has no
 *   `messages`. With several hosts, add `workClaims`: an input that reaches a
 *   host while another host owns the thread is refused (`owned_elsewhere`),
 *   so it never stops the owner's turn. Add `inbox` too, and that input waits
 *   in the inbox for the owner instead (receipt `queued`).
 *
 * Without `artifacts`, `blobs`, and `generationRuns`, media is kept in memory.
 * With `sessions`, the host keeps one index entry per tenant and thread (see
 * `host.sessions`). The store needs `getVersioned` and `upsertIf`, or the host
 * throws at the start.
 */
export type HarnessPersistence =
  | AIPersistence<
      ChatTranscriptStores & {
        inbox?: InboxStore
        log?: never
        leases?: never
      } & SharedStores
    >
  | AIPersistence<
      {
        log: LogStore
        interrupts?: InterruptStore
        metadata?: MetadataStore
        messages?: never
        /** Inputs for the host that owns a thread. Needs `workClaims`. */
        inbox?: InboxStore
      } & DurableLeases &
        SharedStores
    >

export interface HarnessHostOptions {
  /** Where sessions keep their state. Default: in memory, lost on restart. */
  persistence?: HarnessPersistence
  /**
   * Where users' API keys and OAuth tokens are saved: a table in your own
   * database, or a secrets manager. Encrypt the secrets at rest. Default: in
   * memory, lost on restart.
   */
  credentials?: CredentialStore
  /**
   * How a durable host (`stores.log`) appends to the log. Leave it out for
   * the defaults.
   */
  log?: {
    /**
     * How long the host merges streamed text before it appends it, in
     * milliseconds. Boundaries (a message start or end, a tool call, a run
     * event) append at once. Default 100.
     */
    coalesceMs?: number
  }
  /**
   * How this host holds the runs it owns: how long a run lease lasts
   * (default 30000 ms), and how often the host renews it (default 10000 ms).
   * Leave it out for the defaults.
   */
  ownership?: LeaseOptions
}

export interface OpenSessionOptions {
  /** The conversation id. Opening the same id again returns the live session. */
  threadId: string
  /**
   * Who opened the session. Stored on inputs and run records. Its
   * `tenantId` is the tenant of the session (without it, the default
   * tenant): one `threadId` in two tenants is two sessions, with two index
   * entries and two logs.
   */
  principal?: Principal
  /**
   * The log of the session, on a durable host. Sessions with the same log id
   * share one log and one writer: one append can hold records for several of
   * them. Default: `threadId`.
   */
  logId?: string
  /**
   * Prompt caching for this session. It overrides the harness `promptCache`,
   * for example with a stable affinity key. Opening the same `threadId` again
   * returns the live session, which keeps the value of the first open.
   */
  promptCache?: PromptCacheOptions
}

/**
 * The session index of a host: one entry per tenant and thread, for a list
 * of sessions. The host writes the entry when a session opens and after each
 * turn. Without `stores.sessions`, `list` is empty, `get` is `undefined`,
 * and `rename` and `delete` write nothing.
 *
 * Each method takes a `principal`. Its `tenantId` picks the tenant (without
 * it, the default tenant), as in `host.open`. A method never reads or
 * changes the entries of another tenant.
 */
export interface HostSessions {
  /**
   * The entries of the tenant of `principal`, newest `updatedAt` first.
   * Default: only top-level sessions (`parentThreadId: null`). Pass a thread
   * id to get its child sessions.
   *
   * @example
   * ```ts
   * const page = await host.sessions.list({ principal, limit: 20 })
   * ```
   */
  list: (
    options?: Omit<SessionIndexListOptions, 'tenantId' | 'memberId'> & {
      principal?: Principal
    },
  ) => Promise<SessionIndexPage>
  /**
   * The entry of a thread, or `undefined`.
   *
   * @example
   * ```ts
   * const entry = await host.sessions.get({ threadId: 't-1', principal })
   * ```
   */
  get: (options: {
    threadId: string
    principal?: Principal
  }) => Promise<SessionIndexEntry | undefined>
  /**
   * Set the title of a thread. Resolves to the changed entry, or to
   * `undefined` for a thread that has no entry.
   */
  rename: (change: {
    threadId: string
    title: string
    principal?: Principal
  }) => Promise<SessionIndexEntry | undefined>
  /**
   * Change the entry of a thread from app code, with no session open: its
   * `title`, `pinned`, or `metadata`. Each field you pass replaces the stored
   * one. Pass a function of the current entry to change part of `metadata`:
   * with a store that has `upsertIf`, it runs again when another host wrote
   * first, so neither change is lost. The harness `metadataSchema` checks
   * `metadata`, and types it. Resolves to the changed entry, or `undefined`
   * for a thread that has no entry. Throws `SessionMetadataError` for
   * metadata the schema refuses, and an error when the entry names another
   * harness.
   *
   * @example
   * ```ts
   * await host.sessions.update({
   *   harness: assistant,
   *   threadId,
   *   update: (entry) => ({
   *     metadata: { ...entry.metadata, pinned: [...(entry.metadata?.pinned ?? []), file] },
   *   }),
   * })
   * ```
   */
  update: <THarness extends AnyHarness>(change: {
    harness: THarness
    threadId: string
    update: SessionEntryUpdate<SessionMetadataOf<THarness>>
    principal?: Principal
  }) => Promise<SessionIndexEntry<SessionMetadataOf<THarness>> | undefined>
  /**
   * Remove the index entry of a thread. After it, `get` is `undefined`, and
   * the next open of the thread writes a new entry. Only the entry goes: the
   * transcript, the log, and the other data of the thread stay in their
   * stores.
   *
   * @example
   * ```ts
   * await host.sessions.delete({ threadId: 't-1', principal })
   * ```
   */
  delete: (options: {
    threadId: string
    principal?: Principal
  }) => Promise<void>
  /**
   * Fork a thread into a new thread with `host.fork`, so the fork gets the
   * settings, plugin config, and media too. `{ through: id }` copies the
   * messages up to and including `id`. `{ before: id }` copies the messages
   * before `id`, so a fork before the first message has no messages. The new
   * thread gets its own entry in the same tenant, with the title of the old
   * one plus ` (fork)`, the harness, and the owner and members of the old
   * one. Resolves to the new entry. Throws when the message id is not in the
   * transcript, or when the entry of the thread names another harness.
   *
   * @example
   * ```ts
   * const entry = await host.sessions.fork({
   *   harness: assistant,
   *   threadId: 't-1',
   *   at: { before: messageId },
   *   principal,
   * })
   * const fork = await host.open(assistant, { threadId: entry.threadId, principal })
   * ```
   */
  fork: (options: {
    harness: AnyHarness
    threadId: string
    at: ForkPoint
    principal?: Principal
  }) => Promise<SessionIndexEntry>
}

/**
 * An open session of the host changed its status. `running`: an operation
 * runs. `waiting`: a question or an interrupt waits for an answer. `idle`:
 * nothing runs or waits. `at` is the time of the change, in epoch ms.
 * `tenantId` is the tenant of the session, when it is not the default
 * tenant.
 */
export interface HostStatusEvent {
  type: 'status'
  threadId: string
  tenantId?: string
  status: 'idle' | 'running' | 'waiting'
  at: number
}

/**
 * The host wrote the index entry of a thread: a new session, the end of a
 * turn, a rename, or a fork. `entry` is the new entry, with its `tenantId`.
 */
export interface HostSessionEvent {
  type: 'session'
  threadId: string
  entry: SessionIndexEntry
}

/** The host removed the index entry of a thread. `entry` is the removed entry. */
export interface HostSessionDeletedEvent {
  type: 'session-deleted'
  threadId: string
  entry: SessionIndexEntry
}

/** What `host.events()` yields. */
export type HostEvent =
  | HostStatusEvent
  | HostSessionEvent
  | HostSessionDeletedEvent

export interface ForkSessionOptions {
  /** The thread to copy. */
  threadId: string
  /** The new thread. It must have no messages yet. */
  newThreadId: string
  /**
   * The id of the last message to copy. `null` copies no messages, but still
   * copies the settings and plugin config. Default: the whole transcript. An
   * id the thread does not have throws.
   */
  at?: string | null
  /**
   * Who opens the new thread, as in `open`. Its `tenantId` is the tenant of
   * both threads.
   */
  principal?: Principal
  /** The log of the source thread, as in `open`. Default: `threadId`. */
  logId?: string
}

export interface ResumePendingOptions {
  /** The harnesses whose threads this sweep may open, matched by name. */
  harnesses: ReadonlyArray<AnyHarness>
  /**
   * What happens to a session that the sweep opened. `'whenIdle'`
   * (default): it closes when its pending work ends, unless the app opened
   * the thread too. `'never'`: it stays open, like any opened session.
   */
  close?: 'whenIdle' | 'never'
  /**
   * At most how many expired claims of `harnesses` one call takes. Default
   * 100.
   */
  limit?: number
}

/** Runs sessions for one or more harnesses in this process. */
export interface HarnessHost {
  /**
   * Open a session of `harness`, or return the live one for this harness,
   * tenant, and thread. Session plugins are set up here, so a plugin error
   * rejects the promise. A subagent child thread (its index entry has a
   * `parentThreadId`) does not open: open its root thread, and read the
   * child with `session.agentTranscript`.
   *
   * @example
   * ```ts
   * const session = await host.open(assistant, { threadId: 't-1' })
   * ```
   */
  open: <THarness extends AnyHarness>(
    harness: THarness,
    options: OpenSessionOptions,
  ) => Promise<HarnessSession<THarness>>
  /**
   * Is a session of `harness` open on `threadId` on this host, in the tenant
   * of `principal`?
   */
  isOpen: (
    harness: AnyHarness,
    options: { threadId: string; principal?: Principal },
  ) => boolean
  /**
   * Start a new thread as a copy of another one, and return its open
   * session of `harness`. It copies the transcript up to and including the
   * message `at`, the media that those messages use, the stored settings,
   * and the plugin config. It does not copy plugin state, pending
   * interrupts, queued inputs, or running work. A `newThreadId` with
   * messages is refused.
   *
   * @example
   * ```ts
   * const fork = await host.fork(assistant, { threadId: 't-1', newThreadId: 't-2', at: messageId })
   * ```
   */
  fork: <THarness extends AnyHarness>(
    harness: THarness,
    options: ForkSessionOptions,
  ) => Promise<HarnessSession<THarness>>
  /**
   * Continue the work of hosts that stopped. Needs `stores.workClaims`. It
   * opens each thread whose claim expired, for a harness in `harnesses`, and
   * the session recovers its pending work. Two hosts can call it at once:
   * each thread goes to one of them. Call it at boot, and from a cron job or
   * a Durable Object alarm. Resolves with the threads it opened.
   *
   * Known limits: a thread that this host has open already is claimed, but
   * its session does not recover again. Call `host.recover(threadId)` for it.
   * A claim has no tenant, so the sweep opens each thread in the default
   * tenant.
   *
   * @example
   * ```ts
   * await host.resumePending({ harnesses: [assistant] })
   * ```
   */
  resumePending: (
    options: ResumePendingOptions,
  ) => Promise<Array<{ threadId: string; harness: string }>>
  /**
   * Run `session.recover()` on the open sessions of `threadId`, or on every
   * open session without it. A turn that another host ran when its session
   * opened runs here once that host's lease expires.
   *
   * @example
   * ```ts
   * await host.recover('thread-1')
   * ```
   */
  recover: (threadId?: string) => Promise<void>
  /**
   * Run `session.reload()` on every open session of `harness`. Rejects when
   * one of them fails. The other sessions still reload.
   *
   * @example
   * ```ts
   * await host.reload(assistant)
   * ```
   */
  reload: (harness: AnyHarness) => Promise<void>
  /**
   * Close every live session. With `recoverable`, their running work stops
   * with no settlement, and the next host that opens a thread runs it again.
   * See `session.close`.
   *
   * @example
   * ```ts
   * await host.close({ recoverable: true })
   * ```
   */
  close: (options?: { recoverable?: boolean }) => Promise<void>
  /**
   * The `durability.reduce` fold of `harness` for a log that has an open
   * session in this host. `logId` is the `logId` of `open`, in the tenant of
   * `principal`. `undefined` when no session has the log open, or when the
   * reduce of another harness folded the log (the harness of its first
   * session folds a shared log).
   *
   * @example
   * ```ts
   * const state = host.logState({ harness: assistant, logId: 'agent-1' })
   * ```
   */
  logState: <THarness extends AnyHarness>(options: {
    harness: THarness
    logId: string
    principal?: Principal
  }) => HarnessLogStateOf<THarness> | undefined
  /** The session index: list, rename, delete, and fork sessions. */
  sessions: HostSessions
  /**
   * The status changes and the session index changes of this host, for a
   * list of sessions that stays current. First the current status of each
   * open session, then each change as it occurs. Each call reads on its own.
   * The read stops when `signal` aborts or the loop ends.
   *
   * @example
   * ```ts
   * for await (const event of host.events({ signal })) {
   *   if (event.type === 'status') console.log(event.threadId, event.status)
   * }
   * ```
   */
  events: (options?: { signal?: AbortSignal }) => AsyncIterable<HostEvent>
}

/** Throw when `entry` names another harness than `harness`. */
function checkHarness(
  entry: SessionIndexEntry | undefined,
  harness: AnyHarness,
) {
  if (entry?.harness !== undefined && entry.harness !== harness.name) {
    throw new Error(
      `Thread ${JSON.stringify(entry.threadId)} belongs to harness ${JSON.stringify(entry.harness)}, not ${JSON.stringify(harness.name)}.`,
    )
  }
}

let warned = false

/**
 * Writes to the session index. A write replaces the whole entry, so a change
 * reads the entry with its revision, changes a copy, and writes it back with
 * `upsertIf`. A change that another host wrote first runs again on the new
 * entry. The changes of one key run one at a time on this host, so no change
 * loses the fields of another. `onChange` gets each write and each removal.
 */
function sessionIndex(
  store: SessionIndexStore | undefined,
  onChange: (event: HostSessionEvent | HostSessionDeletedEvent) => void,
) {
  const tails = new Map<string, Promise<void>>()
  const serial = <T>(key: SessionIndexKey, task: () => Promise<T>) => {
    const id = logIdOf({ tenantId: key.tenantId, logId: key.threadId })
    // The tail never rejects, so a failed change does not stop the next one.
    const run = (tails.get(id) ?? Promise.resolve()).then(task)
    const tail = run.then(
      () => {},
      () => {},
    )
    tails.set(id, tail)
    void tail.then(() => {
      if (tails.get(id) === tail) tails.delete(id)
    })
    return run
  }
  return {
    get: async (key: SessionIndexKey) => store?.get(key),
    /**
     * Write `change(entry)` for the key. `change` gets `undefined` when the
     * key has no entry, and returns `undefined` to write nothing.
     */
    update: (
      key: SessionIndexKey,
      change: (
        entry: SessionIndexEntry | undefined,
      ) =>
        | SessionIndexEntry
        | undefined
        | Promise<SessionIndexEntry | undefined>,
    ) =>
      serial(key, async () => {
        if (!store) return undefined
        const { threadId } = key
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const current = await store.getVersioned(key)
          const next = await change(current?.entry)
          if (!next) return undefined
          const written = await store.upsertIf({
            entry: next,
            revision: current?.revision ?? null,
          })
          if (!written.ok) continue
          onChange({ type: 'session', threadId, entry: next })
          return next
        }
        throw new Error(
          `The session index entry of ${threadId} changed on another host 5 times in a row.`,
        )
      }),
    /** Remove the entry of the key: a hard delete. */
    remove: (key: SessionIndexKey) =>
      serial(key, async () => {
        if (!store) return
        const entry = await store.get(key)
        await store.delete(key)
        if (entry) {
          onChange({ type: 'session-deleted', threadId: key.threadId, entry })
        }
      }),
  }
}

/**
 * Throw a clear error for a sessions store without compare-and-set. The
 * types need both methods, but a store in plain JS can leave them out.
 */
function checkSessionStore(store: SessionIndexStore | undefined) {
  if (store === undefined) return
  const hasCompareAndSet =
    typeof store.getVersioned === 'function' &&
    typeof store.upsertIf === 'function'
  if (!hasCompareAndSet) {
    throw new Error(
      'stores.sessions needs getVersioned and upsertIf. The host changes an index entry with compare-and-set, so two hosts do not lose the changes of each other.',
    )
  }
}

/**
 * The key of an open session in the host: the harness, the tenant, and the
 * thread. One thread id in two tenants is two sessions.
 */
const sessionKey = (
  harness: string,
  tenantId: string | undefined,
  threadId: string,
) => `${harness}\u0000${logIdOf({ tenantId, logId: threadId })}`

/** @internal How a session writes its index entry. */
export type SessionIndexWriter = ReturnType<typeof sessionIndex>

/**
 * The status rule: the status of `session` after `event`, or `undefined`
 * when the event changes nothing. An operation that starts runs, and a
 * question waits. When an operation ends or a question gets its answer, the
 * session waits while a question or an interrupt still waits, runs while
 * another operation runs, and else is idle.
 */
function statusAfter(session: HarnessSession, event: StreamChunk) {
  if (event.type !== EventType.CUSTOM) return undefined
  switch (event.name) {
    case HARNESS_EVENTS.operationStarted:
      return 'running'
    case HARNESS_EVENTS.question:
      return 'waiting'
    case HARNESS_EVENTS.operationFinished:
    case HARNESS_EVENTS.questionAnswered: {
      const { pendingQuestions, pendingInterrupts, activeOperations } =
        session.snapshot()
      const isInterrupted =
        isRecord(event.value) && event.value.status === 'interrupted'
      const stillWaits =
        isInterrupted ||
        pendingQuestions.length > 0 ||
        pendingInterrupts.length > 0
      if (stillWaits) return 'waiting'
      return activeOperations.length > 0 ? 'running' : 'idle'
    }
    default:
      return undefined
  }
}

/** Where a host looks for the open session of a chat turn. */
interface TurnLookup {
  harness: AnyHarness
  /** Only the sessions of this tenant. */
  tenantId: string | undefined
  operationId: string
}

/** How each host finds the open session of a chat turn. Not public API. */
const turnFinders = new WeakMap<
  object,
  (lookup: TurnLookup) => Promise<HarnessSession | undefined>
>()

/**
 * @internal The open session of `harness` in `host`, in the tenant
 * `tenantId`, that has the chat turn `operationId`, running or ended. A
 * turn's events live in the host that runs it, so the handler joins a run
 * through this.
 */
export function sessionOfTurn(
  host: HarnessHost,
  lookup: TurnLookup,
): Promise<HarnessSession | undefined> {
  return turnFinders.get(host)?.(lookup) ?? Promise.resolve(undefined)
}

/** The log and run stores of each durable host. Not public API. */
const durableStores = new WeakMap<object, { log: LogStore; runs?: RunStore }>()

/**
 * @internal The log and run stores of `host` when it is durable
 * (`stores.log`), else `undefined`.
 */
export function durableStoresOf(host: HarnessHost) {
  return durableStores.get(host)
}

/** Throw a clear error for a durable store set that cannot work. */
function checkDurableStores(persistence: HarnessPersistence) {
  const { stores } = persistence
  if (stores.log === undefined) return
  if (stores.runs === undefined && stores.leases === undefined) {
    throw new Error(
      'A durable host (stores.log) needs stores.runs or stores.leases: a lease finds a crashed host.',
    )
  }
  if (stores.messages !== undefined) {
    throw new Error(
      'A durable host (stores.log) keeps the transcript and the inputs in the log. Remove stores.messages. A reader outside a session can use logMessageStore({ store }).',
    )
  }
  if (stores.inbox !== undefined && stores.workClaims === undefined) {
    throw new Error(
      'A durable host (stores.log) uses stores.inbox to pass inputs to the host that owns a thread. That needs stores.workClaims.',
    )
  }
}

/**
 * Create a host for harness sessions.
 *
 * @example
 * ```ts
 * const host = createHarnessHost({ persistence })
 * const session = await host.open(studio, { threadId: 'thread-1' })
 * const turn = await session.send('Write a haiku about the sea.')
 * ```
 */
export function createHarnessHost(options: HarnessHostOptions = {}) {
  if (!options.persistence && !warned) {
    warned = true
    console.warn(
      '[@tanstack/ai-harness] No persistence given: sessions live in memory and are lost on restart.',
    )
  }
  const persistence: HarnessPersistence =
    options.persistence ?? memoryPersistence()
  checkDurableStores(persistence)
  checkSessionStore(persistence.stores.sessions)
  const memory = memoryPersistence().stores
  // ponytail: a memory inbox when the stores have none. Pass `stores.inbox`
  // to keep accepted inputs across restarts. A durable host keeps them in
  // the log instead.
  const inbox = persistence.stores.inbox ?? memory.inbox
  // ponytail: memory credentials when none are given. Pass `credentials`
  // to keep sign-ins across restarts.
  const credentials = options.credentials ?? memoryCredentialStore()
  // ponytail: memory media stores when the stores have none. Pass
  // `stores.artifacts`, `stores.blobs`, and `stores.generationRuns` to keep
  // media across restarts.
  const media = {
    stores: {
      artifacts: persistence.stores.artifacts ?? memory.artifacts,
      blobs: persistence.stores.blobs ?? memory.blobs,
      generationRuns:
        persistence.stores.generationRuns ?? memory.generationRuns,
    },
  }
  const logStore = persistence.stores.log
  const { metadata, sessions: sessionStore } = persistence.stores
  /** One per running `host.events()` read. */
  const listeners = new Set<(event: HostEvent) => void>()
  const emit = (event: HostEvent) => {
    for (const listener of [...listeners]) {
      // One reader that throws must not stop the others.
      try {
        listener(event)
      } catch (error) {
        console.error(
          '[@tanstack/ai-harness] A host events reader threw.',
          error,
        )
      }
    }
  }
  /** The latest status of each open session, by session key. */
  const statuses = new Map<string, HostStatusEvent>()
  const setStatus = (
    key: string,
    of: SessionIndexKey,
    status: HostStatusEvent['status'],
  ) => {
    if (statuses.get(key)?.status === status) return
    const event: HostStatusEvent = {
      type: 'status',
      threadId: of.threadId,
      ...(of.tenantId !== undefined ? { tenantId: of.tenantId } : {}),
      status,
      at: Date.now(),
    }
    statuses.set(key, event)
    emit(event)
  }
  const index = sessionIndex(sessionStore, emit)
  const coalesceMs = options.log?.coalesceMs ?? 100
  /** The shared log of each log with an open session, by its store log id. */
  const logs = new Map<string, Promise<SharedLog>>()
  /** The resolved shared logs, and the reduce that folds each one, for `logState`. */
  const resolved = new Map<
    string,
    { log: SharedLog; reduce: ReduceOptions<unknown> | undefined }
  >()
  /**
   * The shared log with the store log id `logId`, whose records with no
   * `thread` field belong to `rootThread`. The harness of the session that
   * opens it first gives the `project` and `reduce` that fold it.
   */
  const sharedLog = (
    store: LogStore,
    { logId, rootThread }: { logId: string; rootThread: string },
    harness: AnyHarness,
  ) => {
    const open = logs.get(logId)
    if (open) return open
    const project = harness.durability?.project
    const reduce = harness.durability?.reduce
    const loaded = loadLogState({
      store,
      logId,
      rootThread,
      ...(metadata ? { metadata } : {}),
      ...(project ? { project } : {}),
      ...(reduce ? { reduce } : {}),
    }).then((state) => {
      const log = new SharedLog({
        store,
        logId,
        rootThread,
        state,
        coalesceMs,
        ...(project ? { project } : {}),
        ...(reduce ? { reduce } : {}),
        ...(metadata ? { metadata } : {}),
        // The next open folds the log again.
        onIdle: () => {
          if (logs.get(logId) === loaded) logs.delete(logId)
          if (resolved.get(logId)?.log === log) resolved.delete(logId)
        },
      })
      resolved.set(logId, { log, reduce })
      return log
    })
    loaded.catch(() => logs.delete(logId))
    logs.set(logId, loaded)
    return loaded
  }
  const sessions = new Map<string, Promise<SessionImpl>>()
  /**
   * The keys of sessions that only a `resumePending` sweep opened. With
   * `close: 'whenIdle'`, the sweep closes only these. An open by the app
   * takes a key out.
   */
  const sweptOnly = new Set<string>()
  /** The closes of swept sessions that left the cache, by key. */
  const closing = new Map<string, Promise<void>>()
  const hostId = `host-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`

  /** Throw when the index entry of the thread names a parent thread. */
  const refuseChild = async (key: SessionIndexKey) => {
    const parent = (await index.get(key))?.parentThreadId
    if (parent === undefined) return
    throw new Error(
      `${JSON.stringify(key.threadId)} is a child thread of ${JSON.stringify(parent)}. Open the root thread and read the child through it.`,
    )
  }

  /**
   * `host.open`, in the tenant `tenantId`. It gives the session class, so
   * the host can call the members that the `HarnessSession` type does not
   * have. An internal open can pass a tenant with no principal, so it does
   * not claim an entry with no owner.
   */
  const openSession = <THarness extends AnyHarness>(
    harness: THarness,
    { threadId, principal, logId: openLogId, promptCache }: OpenSessionOptions,
    tenantId: string | undefined,
  ) => {
    const key = sessionKey(harness.name, tenantId, threadId)
    const of = { tenantId, threadId }
    let session = sessions.get(key)
    // The app opened a thread that a sweep opened: it stays open.
    if (session) sweptOnly.delete(key)
    if (!session) {
      const logId = openLogId ?? threadId
      // The one place where the log id of the app becomes the id in the
      // store: the tenant is part of it.
      const storeLogId = logIdOf({ tenantId, logId })
      const created = new SessionImpl({
        harness,
        threadId,
        logId,
        storeLogId,
        ...(tenantId !== undefined ? { tenantId } : {}),
        persistence,
        inbox,
        credentials,
        media,
        hostId,
        index,
        ...(logStore
          ? {
              log: {
                store: logStore,
                ...(harness.durability?.project
                  ? { project: harness.durability.project }
                  : {}),
                open: async (sessionThread, onFailure) => {
                  const ids = { logId: storeLogId, rootThread: logId }
                  let log = await sharedLog(logStore, ids, harness)
                  // The log closed while this open waited, and the host
                  // dropped it.
                  while (!log.isOpen) {
                    log = await sharedLog(logStore, ids, harness)
                  }
                  return log.view(sessionThread, onFailure)
                },
              },
            }
          : {}),
        ...(options.ownership ? { lease: options.ownership } : {}),
        ...(principal ? { principal } : {}),
        ...(promptCache ? { promptCache } : {}),
        onEvent: (event) => {
          const status = statusAfter(created, event)
          if (status) setStatus(key, of, status)
        },
        onClose: () => {
          // A sweep may have put a new session under this key already. It
          // opens only after this one closed, so its status is not set yet.
          if (sessions.get(key) === session) sessions.delete(key)
          statuses.delete(key)
        },
      })
      // A swept session under this key may still close: it lets go of
      // the thread first.
      const closed = closing.get(key) ?? Promise.resolve()
      session = closed
        .then(() => refuseChild(of))
        .then(() => created.open())
        .then(
          () => {
            // A recovered turn can run already. Else the new session is
            // idle.
            if (!statuses.has(key)) setStatus(key, of, 'idle')
            return created
          },
          (error: unknown) => {
            sessions.delete(key)
            statuses.delete(key)
            throw error
          },
        )
      sessions.set(key, session)
    }
    return session as Promise<SessionImpl<THarness>>
  }

  const host: HarnessHost = {
    open: (harness, openOptions) =>
      openSession(harness, openOptions, openOptions.principal?.tenantId),
    isOpen(harness, { threadId, principal }) {
      return sessions.has(
        sessionKey(harness.name, principal?.tenantId, threadId),
      )
    },
    async fork(harness, { threadId, newThreadId, at, principal, logId }) {
      if (newThreadId === threadId) {
        throw new Error('A fork needs a new thread: newThreadId is threadId.')
      }
      const tenantId = principal?.tenantId
      // A source that only this fork opens closes again at the end.
      const wasOpen = sessions.has(sessionKey(harness.name, tenantId, threadId))
      // In the tenant of the fork, with no principal: the fork does not
      // become the owner of a source with no owner.
      const source = await openSession(
        harness,
        { threadId, ...(logId ? { logId } : {}) },
        tenantId,
      )
      try {
        const transcript = await source.transcript()
        const end =
          at === undefined
            ? transcript.length
            : at === null
              ? 0
              : transcript.findIndex((message) => message.id === at) + 1
        if (typeof at === 'string' && end === 0) {
          throw new Error(
            `Thread ${JSON.stringify(threadId)} has no message ${JSON.stringify(at)}.`,
          )
        }
        // The new thread opens with no `logId`, so its log is its own.
        const newLogId = logIdOf({ tenantId, logId: newThreadId })
        const isUsed = logStore
          ? (await logStore.read({ logId: newLogId, limit: 1 })).length > 0
          : ((await persistence.stores.messages?.loadThread(newThreadId))
              ?.length ?? 0) > 0
        if (isUsed) {
          throw new Error(
            `Thread ${JSON.stringify(newThreadId)} is not empty. Fork into a new thread.`,
          )
        }
        const fork = await openSession(
          harness,
          { threadId: newThreadId, ...(principal ? { principal } : {}) },
          tenantId,
        )
        await fork.adoptFork(source, transcript.slice(0, end))
        return fork
      } finally {
        // A failed close must not hide the fork's own error.
        if (!wasOpen)
          await source
            .close()
            .catch((error: unknown) =>
              console.error(
                '[@tanstack/ai-harness] The source session did not close.',
                error,
              ),
            )
      }
    },
    async resumePending({ harnesses, close = 'whenIdle', limit = 100 }) {
      const claims = persistence.stores.workClaims
      if (!claims) throw new Error('resumePending needs stores.workClaims.')
      const ttlMs = options.ownership?.ttlMs ?? LEASE.ttlMs
      const byName = new Map(
        harnesses.map((harness) => [harness.name, harness]),
      )
      // `listExpired` has no cursor, and claims of other harnesses come back
      // too. Read more until `limit` are ours or the store has no more.
      // ponytail: re-reads the first claims each round. Add a harness filter
      // to the store if many claims of other harnesses pile up.
      const now = Date.now()
      let expired: Array<{ threadId: string; harness: string }> = []
      for (let size = limit; ; size *= 2) {
        const page = await claims.listExpired({ now, limit: size })
        expired = page.filter((claim) => byName.has(claim.harness))
        if (expired.length >= limit || page.length < size) break
      }
      expired = expired.slice(0, limit)
      const opened: Array<{ threadId: string; harness: string }> = []
      const failures: Array<unknown> = []
      for (const { threadId, harness: name } of expired) {
        const harness = byName.get(name)
        if (!harness) continue
        // Compare-and-set: of two hosts that sweep at once, one gets it.
        const isMine = await claims.claim({
          threadId,
          harness: name,
          ownerId: hostId,
          until: Date.now() + ttlMs,
        })
        if (!isMine) continue
        // ponytail: a work claim has a thread id and no tenant, so the sweep
        // opens the thread in the default tenant. PR 5 replaces work claims.
        const key = sessionKey(name, undefined, threadId)
        // Only a session that this sweep opens closes when idle. A session
        // that the app has open stays open.
        const isOwn = close === 'whenIdle' && !sessions.has(key)
        if (isOwn) sweptOnly.add(key)
        let session: SessionImpl
        try {
          session = await openSession(harness, { threadId }, undefined)
        } catch (error) {
          // One thread that cannot open must not stop the sweep. The claim
          // goes back, so the next sweep tries again.
          sweptOnly.delete(key)
          await claims.release({ threadId, ownerId: hostId }).catch(() => {})
          failures.push(error)
          continue
        }
        if (isOwn) {
          const stop = session.onIdle(() => {
            stop()
            // The app opened it since: it stays open.
            if (!sweptOnly.delete(key)) return
            // From here on, an open gets a new session, so a new prompt
            // never reaches this one while it closes.
            sessions.delete(key)
            // ponytail: a failed close is dropped, as an idle session has no
            // work to lose.
            const closed = session.close().catch(() => {})
            closing.set(key, closed)
            void closed.then(() => {
              if (closing.get(key) === closed) closing.delete(key)
            })
          })
        }
        opened.push({ threadId, harness: name })
      }
      if (failures.length > 0) {
        // `opened` says which threads did start.
        throw Object.assign(
          new AggregateError(
            failures,
            `resumePending opened ${opened.length} threads; ${failures.length} failed to open.`,
          ),
          { opened },
        )
      }
      return opened
    },
    async recover(threadId) {
      const live = await Promise.allSettled(sessions.values())
      await Promise.all(
        live.flatMap((entry) =>
          entry.status === 'fulfilled' &&
          (threadId === undefined || entry.value.threadId === threadId)
            ? [entry.value.recover()]
            : [],
        ),
      )
    },
    async reload(harness) {
      const prefix = `${harness.name}\u0000`
      const live = await Promise.allSettled(
        [...sessions].flatMap(([key, session]) =>
          key.startsWith(prefix) ? [session] : [],
        ),
      )
      const results = await Promise.allSettled(
        live.flatMap((entry) =>
          entry.status === 'fulfilled' ? [entry.value.reload()] : [],
        ),
      )
      for (const result of results) {
        if (result.status === 'rejected') throw result.reason
      }
    },
    async close(closeOptions) {
      await Promise.allSettled(closing.values())
      const live = await Promise.allSettled(sessions.values())
      await Promise.all(
        live
          .filter((entry) => entry.status === 'fulfilled')
          .map((entry) => entry.value.close(closeOptions)),
      )
    },
    logState: ({ harness, logId, principal }) => {
      const folded = resolved.get(
        logIdOf({ tenantId: principal?.tenantId, logId }),
      )
      // The reduce of another harness folded this log: its state has
      // another type.
      if (folded?.reduce !== harness.durability?.reduce) return undefined
      // The reduce of `harness` folded the state, so it has that type. A
      // map of logs cannot carry a state type per log.
      return folded?.log.state.reduced as
        | HarnessLogStateOf<typeof harness>
        | undefined
    },
    sessions: {
      list: async ({ principal, ...filters } = {}) =>
        (await sessionStore?.list({
          parentThreadId: null,
          ...filters,
          // Last, so a filter never names another tenant.
          tenantId: principal?.tenantId,
        })) ?? {
          entries: [],
        },
      get: ({ threadId, principal }) =>
        index.get({ tenantId: principal?.tenantId, threadId }),
      rename: ({ threadId, title, principal }) =>
        index.update(
          { tenantId: principal?.tenantId, threadId },
          (entry) => entry && { ...entry, title, updatedAt: Date.now() },
        ),
      update: async ({ harness, threadId, update, principal }) =>
        // The schema checked the metadata, so it has the harness type.
        (await index.update(
          { tenantId: principal?.tenantId, threadId },
          (entry) => {
            checkHarness(entry, harness)
            return changedEntry(
              entry,
              update as SessionEntryUpdate<any, SessionEntryChange<any>>,
              harness.metadataSchema,
            )
          },
        )) as SessionIndexEntry<SessionMetadataOf<typeof harness>> | undefined,
      delete: ({ threadId, principal }) =>
        index.remove({ tenantId: principal?.tenantId, threadId }),
      async fork({ harness, threadId, at, principal }) {
        const tenantId = principal?.tenantId
        // Check before a session opens. Without a sessions store there is no
        // entry, so there is nothing to check.
        const source = await index.get({ tenantId, threadId })
        checkHarness(source, harness)
        // `host.fork` takes the last message to copy, so `before` becomes
        // the message just before it, or `null` before the first one.
        let last: string | null = 'through' in at ? at.through : null
        if ('before' in at) {
          // With no principal, as `host.fork` opens the source.
          const opened = await openSession(harness, { threadId }, tenantId)
          const transcript = await opened.transcript()
          const position = transcript.findIndex(({ id }) => id === at.before)
          if (position === -1) {
            throw new Error(
              `The transcript has no message with id ${at.before}.`,
            )
          }
          if (position > 0) {
            const previous = transcript[position - 1]?.id
            if (!previous) {
              throw new Error(`The message before ${at.before} has no id.`)
            }
            last = previous
          }
        }
        const forked = await host.fork(harness, {
          threadId,
          newThreadId: `thread-${crypto.randomUUID()}`,
          at: last,
          ...(principal ? { principal } : {}),
        })
        const now = Date.now()
        // A sibling of the old thread, not a child: no parentThreadId. The
        // same users can open it as the old thread.
        const entry: SessionIndexEntry = {
          ...(tenantId !== undefined ? { tenantId } : {}),
          threadId: forked.threadId,
          ...(source?.ownerId !== undefined ? { ownerId: source.ownerId } : {}),
          members: source?.members ?? [],
          createdAt: now,
          updatedAt: now,
          harness: harness.name,
          ...(source?.title ? { title: `${source.title} (fork)` } : {}),
        }
        return (
          (await index.update(
            { tenantId, threadId: entry.threadId },
            (current) => {
              // The open of the fork wrote an entry already: keep what it
              // holds, but not its owner. The owner and the members come
              // from the old thread.
              const { ownerId: _opener, ...opened } = current ?? entry
              return {
                ...entry,
                ...opened,
                ...(entry.title ? { title: entry.title } : {}),
                members: entry.members,
                updatedAt: now,
              }
            },
          )) ?? entry
        )
      },
    },
    async *events({ signal } = {}) {
      // The current statuses first. A change while the reader handles an
      // event waits in the queue.
      const queue: Array<HostEvent> = [...statuses.values()]
      let wake = () => {}
      const listener = (event: HostEvent) => {
        queue.push(event)
        wake()
      }
      const onAbort = () => wake()
      listeners.add(listener)
      signal?.addEventListener('abort', onAbort)
      try {
        while (!signal?.aborted) {
          const next = queue.shift()
          if (next) {
            yield next
            continue
          }
          await new Promise<void>((resolve) => {
            wake = resolve
          })
        }
      } finally {
        // A loop that ends (break, return, throw, abort) stops listening.
        listeners.delete(listener)
        signal?.removeEventListener('abort', onAbort)
      }
    },
  }
  if (logStore) {
    const { runs } = persistence.stores
    durableStores.set(host, { log: logStore, ...(runs ? { runs } : {}) })
  }
  turnFinders.set(host, async ({ harness, tenantId, operationId }) => {
    // The key of a session with an empty thread id is the start of the keys
    // of the harness and tenant: the encoded tenant has no `:`.
    const prefix = sessionKey(harness.name, tenantId, '')
    for (const [key, opening] of sessions) {
      if (!key.startsWith(prefix)) continue
      const session = await opening.catch(() => undefined)
      if (session?.operation(operationId)?.kind === 'chat') return session
    }
    return undefined
  })
  return host
}
