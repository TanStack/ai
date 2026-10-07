import { EventType } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { SharedLog, loadLogState } from './log'
import { LEASE } from './resume'
import { HarnessSession } from './session'
import { HARNESS_EVENTS } from './types'
import { isRecord } from './utils'
import type { PromptCacheOptions, RunStore, StreamChunk } from '@tanstack/ai'
import type {
  AIPersistence,
  ArtifactStore,
  BlobStore,
  ChatTranscriptStores,
  CredentialStore,
  GenerationRunStore,
  InboxStore,
  InterruptStore,
  LeaseStore,
  LogStore,
  MetadataStore,
  WorkClaimStore,
  SessionIndexEntry,
  SessionIndexListOptions,
  SessionIndexPage,
  SessionIndexStore,
} from '@tanstack/ai-persistence'
import type { AnyHarness } from './define'
import type { ProjectOptions, ReduceOptions } from './log'
import type { LeaseOptions } from './resume'
import type { ForkPoint, Principal } from './types'

type SharedStores = {
  credentials?: CredentialStore
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
 *   `messages` and no `inbox`.
 *
 * Without `artifacts`, `blobs`, and `generationRuns`, media is kept in memory.
 * With `sessions`, the host keeps one index entry per thread (see
 * `host.sessions`).
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
        inbox?: never
      } & DurableLeases &
        SharedStores
    >

export interface HarnessHostOptions<TLogState = undefined> {
  /** Where sessions keep their state. Default: in memory, lost on restart. */
  persistence?: HarnessPersistence
  /**
   * How a durable host folds your own log records into the model context.
   * Only a host with `stores.log` reads it.
   */
  project?: ProjectOptions
  /**
   * A fold of every host record of a log, across all its sessions, in log
   * order. Read it with `host.logState(logId)`. Only a host with
   * `stores.log` reads it.
   */
  reduce?: ReduceOptions<TLogState>
  /**
   * How long a durable host merges streamed text before it appends it to the
   * log, in milliseconds. Boundaries (a message start or end, a tool call, a
   * run event) append at once. Default 100.
   */
  coalesceMs?: number
  /** How long a run lease lasts, and how often the host renews it. */
  lease?: LeaseOptions
}

export interface OpenSessionOptions {
  /** The conversation id. Opening the same id again returns the live session. */
  threadId: string
  /** Who opened the session. Stored on inputs and run records. */
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
 * The session index of a host: one entry per thread, for a list of
 * sessions. The host writes the entry when a session opens and after each
 * turn. Without `stores.sessions`, `list` is empty, `get` is `undefined`,
 * and `rename` and `delete` write nothing.
 */
export interface HostSessions {
  /**
   * Entries, newest `updatedAt` first. Default: only top-level sessions
   * (`parentThreadId: null`). Pass a thread id to get its child sessions.
   * Pass `principal` to get only the sessions of that user.
   */
  list: (options?: SessionIndexListOptions) => Promise<SessionIndexPage>
  /** The entry of a thread, or `undefined`. */
  get: (threadId: string) => Promise<SessionIndexEntry | undefined>
  /**
   * Set the title of a thread. Resolves to the changed entry, or to
   * `undefined` for a thread that has no entry.
   */
  rename: (
    threadId: string,
    title: string,
  ) => Promise<SessionIndexEntry | undefined>
  /**
   * Remove the index entry of a thread. Only the entry: the transcript, the
   * log, and the other data of the thread stay in their stores.
   */
  delete: (threadId: string) => Promise<void>
  /**
   * Fork a thread into a new thread with `host.fork`, so the fork gets the
   * settings, plugin config, and media too. `{ through: id }` copies the
   * messages up to and including `id`. `{ before: id }` copies the messages
   * before `id`, so a fork before the first message has no messages. The new
   * thread gets its own entry, with the title of the old one plus ` (fork)`,
   * the harness, and the owner of the old one. Resolves to the new entry.
   * Throws when the message id is not in the transcript, or when the entry
   * of the thread names another harness.
   *
   * @example
   * ```ts
   * const entry = await host.sessions.fork(assistant, 't-1', { before: messageId })
   * const fork = await host.open(assistant, { threadId: entry.threadId })
   * ```
   */
  fork: (
    harness: AnyHarness,
    threadId: string,
    at: ForkPoint,
  ) => Promise<SessionIndexEntry>
}

/**
 * An open session of the host changed its status. `running`: an operation
 * runs. `waiting`: a question or an interrupt waits for an answer. `idle`:
 * nothing runs or waits. `at` is the time of the change, in epoch ms.
 */
export interface HostStatusEvent {
  type: 'status'
  threadId: string
  status: 'idle' | 'running' | 'waiting'
  at: number
}

/**
 * The host wrote the index entry of a thread: a new session, the end of a
 * turn, a rename, or a fork. `entry` is the new entry.
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
  /** Who opens the new thread, as in `open`. */
  principal?: Principal
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
  /** How many expired claims one call reads. Default 100. */
  limit?: number
}

/** Runs sessions for one or more harnesses in this process. */
export interface HarnessHost<TLogState = unknown> {
  /**
   * Open a session, or return the live one for this harness and thread.
   * Session plugins are set up here, so a plugin error rejects the promise.
   */
  open: <THarness extends AnyHarness>(
    harness: THarness,
    options: OpenSessionOptions,
  ) => Promise<HarnessSession<THarness>>
  /**
   * Start a new thread as a copy of another one, and return its open
   * session. It copies the transcript up to and including the message `at`,
   * the media that those messages use, the stored settings, and the plugin
   * config. It does not copy plugin state, pending interrupts, queued
   * inputs, or running work. A `newThreadId` with messages is refused.
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
   * Known limit: a thread that this host has open already is claimed, but
   * its session does not recover again. Call `host.recover(threadId)` for it.
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
   * The `reduce` fold of a log that has an open session in this host, or
   * `undefined`.
   */
  logState: (logId: string) => TLogState | undefined
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

let warned = false

/**
 * Writes to the session index. `upsert` replaces the whole entry, so a
 * change reads the entry, changes a copy, and writes it back. The changes of
 * one thread run one at a time, so no change loses the fields of another.
 * `onChange` gets each write and each removal.
 */
function sessionIndex(
  store: SessionIndexStore | undefined,
  onChange: (event: HostSessionEvent | HostSessionDeletedEvent) => void,
) {
  const tails = new Map<string, Promise<void>>()
  const serial = <T>(threadId: string, task: () => Promise<T>) => {
    // The tail never rejects, so a failed change does not stop the next one.
    const run = (tails.get(threadId) ?? Promise.resolve()).then(task)
    const tail = run.then(
      () => {},
      () => {},
    )
    tails.set(threadId, tail)
    void tail.then(() => {
      if (tails.get(threadId) === tail) tails.delete(threadId)
    })
    return run
  }
  return {
    get: async (threadId: string) => store?.get(threadId),
    /**
     * Write `change(entry)` for the thread. `change` gets `undefined` when
     * the thread has no entry, and returns `undefined` to write nothing.
     */
    update: (
      threadId: string,
      change: (
        entry: SessionIndexEntry | undefined,
      ) => SessionIndexEntry | undefined,
    ) =>
      serial(threadId, async () => {
        if (!store) return undefined
        const next = change(await store.get(threadId))
        if (next) {
          await store.upsert(next)
          onChange({ type: 'session', threadId, entry: next })
        }
        return next
      }),
    remove: (threadId: string) =>
      serial(threadId, async () => {
        if (!store) return
        const entry = await store.get(threadId)
        await store.delete(threadId)
        if (entry) onChange({ type: 'session-deleted', threadId, entry })
      }),
  }
}

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

/** How each host finds the open session of a chat turn. Not public API. */
const turnFinders = new WeakMap<
  object,
  (harness: string, operationId: string) => Promise<HarnessSession | undefined>
>()

/**
 * @internal The open session of `harness` in `host` that has the chat turn
 * `operationId`, running or ended. A turn's events live in the host that runs
 * it, so the handler joins a run through this.
 */
export function sessionOfTurn(
  host: HarnessHost,
  harness: AnyHarness,
  operationId: string,
): Promise<HarnessSession | undefined> {
  return (
    turnFinders.get(host)?.(harness.name, operationId) ??
    Promise.resolve(undefined)
  )
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
  if (stores.messages !== undefined || stores.inbox !== undefined) {
    throw new Error(
      'A durable host (stores.log) keeps the transcript and the inputs in the log. Remove stores.messages and stores.inbox. A reader outside a session can use logMessageStore({ store }).',
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
 * const turn = await session.prompt('Write a haiku about the sea.')
 * ```
 */
export function createHarnessHost<TLogState = undefined>(
  options: HarnessHostOptions<TLogState> = {},
): HarnessHost<TLogState> {
  if (!options.persistence && !warned) {
    warned = true
    console.warn(
      '[@tanstack/ai-harness] No persistence given: sessions live in memory and are lost on restart.',
    )
  }
  const persistence: HarnessPersistence =
    options.persistence ?? memoryPersistence()
  checkDurableStores(persistence)
  const memory = memoryPersistence().stores
  // ponytail: a memory inbox when the stores have none. Pass `stores.inbox`
  // to keep accepted inputs across restarts. A durable host keeps them in
  // the log instead.
  const inbox = persistence.stores.inbox ?? memory.inbox
  // ponytail: memory credentials when the stores have none. Pass
  // `stores.credentials` to keep sign-ins across restarts.
  const credentials = persistence.stores.credentials ?? memory.credentials
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
    for (const listener of listeners) listener(event)
  }
  /** The latest status of each open session, by session key. */
  const statuses = new Map<string, HostStatusEvent>()
  const setStatus = (
    key: string,
    threadId: string,
    status: HostStatusEvent['status'],
  ) => {
    if (statuses.get(key)?.status === status) return
    const event: HostStatusEvent = {
      type: 'status',
      threadId,
      status,
      at: Date.now(),
    }
    statuses.set(key, event)
    emit(event)
  }
  const index = sessionIndex(sessionStore, emit)
  const coalesceMs = options.coalesceMs ?? 100
  /** The shared log of each log id with an open session, by log id. */
  const logs = new Map<string, Promise<SharedLog<TLogState>>>()
  /** The resolved shared logs, for `logState`. */
  const resolved = new Map<string, SharedLog<TLogState>>()
  const sharedLog = (store: LogStore, logId: string) => {
    const open = logs.get(logId)
    if (open) return open
    const loaded = loadLogState({
      store,
      logId,
      ...(metadata ? { metadata } : {}),
      ...(options.project ? { project: options.project } : {}),
      ...(options.reduce ? { reduce: options.reduce } : {}),
    }).then((state) => {
      const log = new SharedLog<TLogState>({
        store,
        logId,
        state,
        coalesceMs,
        ...(options.project ? { project: options.project } : {}),
        ...(options.reduce ? { reduce: options.reduce } : {}),
        ...(metadata ? { metadata } : {}),
        // The next open folds the log again.
        onIdle: () => {
          if (logs.get(logId) === loaded) logs.delete(logId)
          if (resolved.get(logId) === log) resolved.delete(logId)
        },
      })
      resolved.set(logId, log)
      return log
    })
    loaded.catch(() => logs.delete(logId))
    logs.set(logId, loaded)
    return loaded
  }
  const sessions = new Map<string, Promise<HarnessSession>>()
  /**
   * The keys of sessions that only a `resumePending` sweep opened. With
   * `close: 'whenIdle'`, the sweep closes only these. An open by the app
   * takes a key out.
   */
  const sweptOnly = new Set<string>()
  /** The closes of swept sessions that left the cache, by key. */
  const closing = new Map<string, Promise<void>>()
  const hostId = `host-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`

  const host: HarnessHost<TLogState> = {
    open(harness, { threadId, principal, logId: openLogId, promptCache }) {
      const key = `${harness.name}\u0000${threadId}`
      let session = sessions.get(key)
      // The app opened a thread that a sweep opened: it stays open.
      if (session) sweptOnly.delete(key)
      if (!session) {
        const logId = openLogId ?? threadId
        const created = new HarnessSession({
          harness,
          threadId,
          logId,
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
                  ...(options.project ? { project: options.project } : {}),
                  open: async (sessionThread, onFailure) => {
                    let log = await sharedLog(logStore, logId)
                    // The log closed while this open waited, and the host
                    // dropped it.
                    while (!log.isOpen) log = await sharedLog(logStore, logId)
                    return log.view(sessionThread, onFailure)
                  },
                },
              }
            : {}),
          ...(options.lease ? { lease: options.lease } : {}),
          ...(principal ? { principal } : {}),
          ...(promptCache ? { promptCache } : {}),
          onEvent: (event) => {
            const status = statusAfter(created, event)
            if (status) setStatus(key, threadId, status)
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
          .then(() => created.open())
          .then(
            () => {
              // A recovered turn can run already. Else the new session is
              // idle.
              if (!statuses.has(key)) setStatus(key, threadId, 'idle')
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
      return session as Promise<HarnessSession<typeof harness>>
    },
    async fork(harness, { threadId, newThreadId, at, principal }) {
      if (newThreadId === threadId) {
        throw new Error('A fork needs a new thread: newThreadId is threadId.')
      }
      const source = await host.open(harness, { threadId })
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
      const isUsed = logStore
        ? (await logStore.read(newThreadId, { limit: 1 })).length > 0
        : ((await persistence.stores.messages?.loadThread(newThreadId))
            ?.length ?? 0) > 0
      if (isUsed) {
        throw new Error(
          `Thread ${JSON.stringify(newThreadId)} is not empty. Fork into a new thread.`,
        )
      }
      const fork = await host.open(harness, {
        threadId: newThreadId,
        ...(principal ? { principal } : {}),
      })
      await fork.adoptFork(source, transcript.slice(0, end))
      return fork
    },
    async resumePending({ harnesses, close = 'whenIdle', limit = 100 }) {
      const claims = persistence.stores.workClaims
      if (!claims) throw new Error('resumePending needs stores.workClaims.')
      const ttlMs = options.lease?.ttlMs ?? LEASE.ttlMs
      const byName = new Map(
        harnesses.map((harness) => [harness.name, harness]),
      )
      const expired = await claims.listExpired({ now: Date.now(), limit })
      const opened: Array<{ threadId: string; harness: string }> = []
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
        const key = `${name}\u0000${threadId}`
        // Only a session that this sweep opens closes when idle. A session
        // that the app has open stays open.
        const isOwn = close === 'whenIdle' && !sessions.has(key)
        if (isOwn) sweptOnly.add(key)
        const session = await host.open(harness, { threadId })
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
    logState: (logId) => resolved.get(logId)?.state.reduced,
    sessions: {
      list: async (listOptions) =>
        (await sessionStore?.list({
          parentThreadId: null,
          ...listOptions,
        })) ?? {
          entries: [],
        },
      get: (threadId) => index.get(threadId),
      rename: (threadId, title) =>
        index.update(
          threadId,
          (entry) => entry && { ...entry, title, updatedAt: Date.now() },
        ),
      delete: (threadId) => index.remove(threadId),
      async fork(harness, threadId, at) {
        // Check before a session opens. Without a sessions store there is no
        // entry, so there is nothing to check.
        const source = await index.get(threadId)
        if (source?.harness !== undefined && source.harness !== harness.name) {
          throw new Error(
            `Thread ${JSON.stringify(threadId)} belongs to harness ${JSON.stringify(source.harness)}, not ${JSON.stringify(harness.name)}.`,
          )
        }
        // `host.fork` takes the last message to copy, so `before` becomes
        // the message just before it, or `null` before the first one.
        let last: string | null = 'through' in at ? at.through : null
        if ('before' in at) {
          const opened = await host.open(harness, { threadId })
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
          ...(source?.principal ? { principal: source.principal } : {}),
        })
        const now = Date.now()
        // A sibling of the old thread, not a child: no parentThreadId.
        const entry: SessionIndexEntry = {
          threadId: forked.threadId,
          createdAt: now,
          updatedAt: now,
          harness: harness.name,
          ...(source?.title ? { title: `${source.title} (fork)` } : {}),
          ...(source?.principal ? { principal: source.principal } : {}),
        }
        await index.update(entry.threadId, () => entry)
        return entry
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
  turnFinders.set(host, async (name, operationId) => {
    for (const [key, opening] of sessions) {
      if (!key.startsWith(`${name}\u0000`)) continue
      const session = await opening.catch(() => undefined)
      if (session?.operation(operationId)?.kind === 'chat') return session
    }
    return undefined
  })
  return host
}
