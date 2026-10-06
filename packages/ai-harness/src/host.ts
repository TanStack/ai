import { memoryPersistence } from '@tanstack/ai-persistence'
import { SharedLog, loadLogState } from './log'
import { LEASE } from './resume'
import { HarnessSession } from './session'
import type { PromptCacheOptions, RunStore } from '@tanstack/ai'
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
} from '@tanstack/ai-persistence'
import type { AnyHarness } from './define'
import type { ProjectOptions, ReduceOptions } from './log'
import type { LeaseOptions } from './resume'
import type { Principal } from './types'

type SharedStores = {
  credentials?: CredentialStore
  artifacts?: ArtifactStore
  blobs?: BlobStore
  generationRuns?: GenerationRunStore
  /** Claims on busy threads, for `resumePending`. */
  workClaims?: WorkClaimStore
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

export interface ForkSessionOptions {
  /** The thread to copy. */
  threadId: string
  /** The new thread. It must have no messages yet. */
  newThreadId: string
  /**
   * The id of the last message to copy. Default: the whole transcript. An id
   * the thread does not have throws.
   */
  at?: string
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
   * its session does not recover again.
   *
   * @example
   * ```ts
   * await host.resumePending({ harnesses: [assistant] })
   * ```
   */
  resumePending: (
    options: ResumePendingOptions,
  ) => Promise<Array<{ threadId: string; harness: string }>>
  /** Close every live session. */
  close: () => Promise<void>
  /**
   * The `reduce` fold of a log that has an open session in this host, or
   * `undefined`.
   */
  logState: (logId: string) => TLogState | undefined
}

let warned = false

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
  const { metadata } = persistence.stores
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
          // A sweep may have put a new session under this key already.
          onClose: () => {
            if (sessions.get(key) === session) sessions.delete(key)
          },
        })
        // A swept session under this key may still close: it lets go of
        // the thread first.
        const closed = closing.get(key) ?? Promise.resolve()
        session = closed
          .then(() => created.open())
          .then(
            () => created,
            (error: unknown) => {
              sessions.delete(key)
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
          : transcript.findIndex((message) => message.id === at) + 1
      if (end === 0) {
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
            // ponytail: the session is idle while it still stores an input,
            // such as the wake turn of a stopped agent. Look again after one
            // macrotask. A store write slower than that loses the race; count
            // inputs in flight in `isIdle` if that matters.
            setTimeout(() => {
              const again = session.onIdle(() => {
                again()
                // The app opened it since: it stays open.
                if (!sweptOnly.delete(key)) return
                // From here on, an open gets a new session, so a new prompt
                // never reaches this one while it closes.
                sessions.delete(key)
                // ponytail: a failed close is dropped, as an idle session
                // has no work to lose.
                const closed = session.close().catch(() => {})
                closing.set(key, closed)
                void closed.then(() => {
                  if (closing.get(key) === closed) closing.delete(key)
                })
              })
            })
          })
        }
        opened.push({ threadId, harness: name })
      }
      return opened
    },
    async close() {
      await Promise.allSettled(closing.values())
      const live = await Promise.allSettled(sessions.values())
      await Promise.all(
        live
          .filter((entry) => entry.status === 'fulfilled')
          .map((entry) => entry.value.close()),
      )
    },
    logState: (logId) => resolved.get(logId)?.state.reduced,
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
