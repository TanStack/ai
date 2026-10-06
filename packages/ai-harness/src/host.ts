import { EventType } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { SharedLog, loadLogState, logMessageStore } from './log'
import { HarnessSession } from './session'
import { HARNESS_EVENTS } from './types'
import { isRecord } from './utils'
import type {
  ModelMessage,
  PromptCacheOptions,
  RunStore,
  StreamChunk,
} from '@tanstack/ai'
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
   * Copy the transcript of a thread into a new thread, up to a message. The
   * new thread gets its own entry, with the title, harness, and owner of the
   * old one. Resolves to the new entry. Throws when the message id is not in
   * the transcript.
   */
  fork: (threadId: string, at: ForkPoint) => Promise<SessionIndexEntry>
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
  /** Close every live session. */
  close: () => Promise<void>
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

/** The messages of `messages` up to the message `at` names. */
function cutTranscript(messages: ReadonlyArray<ModelMessage>, at: ForkPoint) {
  const isBefore = 'before' in at
  const messageId = isBefore ? at.before : at.through
  const index = messages.findIndex((message) => message.id === messageId)
  if (index === -1) {
    throw new Error(`The transcript has no message with id ${messageId}.`)
  }
  return messages.slice(0, isBefore ? index : index + 1)
}

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
  // The transcript of any thread, for a fork. On a durable host, a view of
  // the log of that thread. ponytail: a thread that shares another log (a
  // `logId` that is not its thread id) is not found. Keep the log id in the
  // entry if that matters.
  const transcripts = logStore
    ? logMessageStore({
        store: logStore,
        ...(options.project ? { project: options.project } : {}),
      })
    : persistence.stores.messages
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
  const hostId = `host-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`

  const host: HarnessHost<TLogState> = {
    open(harness, { threadId, principal, logId: openLogId, promptCache }) {
      const key = `${harness.name}\u0000${threadId}`
      let session = sessions.get(key)
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
            sessions.delete(key)
            statuses.delete(key)
          },
        })
        session = created.open().then(
          () => {
            // A recovered turn can run already. Else the new session is idle.
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
    async close() {
      const live = await Promise.allSettled(sessions.values())
      await Promise.all(
        live
          .filter((entry) => entry.status === 'fulfilled')
          .map((entry) => entry.value.close()),
      )
    },
    logState: (logId) => resolved.get(logId)?.state.reduced,
    sessions: {
      list: async (listOptions) =>
        (await sessionStore?.list({ parentThreadId: null, ...listOptions })) ?? {
          entries: [],
        },
      get: (threadId) => index.get(threadId),
      rename: (threadId, title) =>
        index.update(
          threadId,
          (entry) => entry && { ...entry, title, updatedAt: Date.now() },
        ),
      delete: (threadId) => index.remove(threadId),
      async fork(threadId, at) {
        if (!transcripts) {
          throw new Error('host.sessions.fork needs stores.messages or stores.log.')
        }
        const kept = cutTranscript(await transcripts.loadThread(threadId), at)
        const source = await index.get(threadId)
        const now = Date.now()
        // A sibling of the old thread, not a child: no parentThreadId.
        const entry: SessionIndexEntry = {
          threadId: `thread-${crypto.randomUUID()}`,
          createdAt: now,
          updatedAt: now,
          ...(source?.harness ? { harness: source.harness } : {}),
          ...(source?.title ? { title: `${source.title} (fork)` } : {}),
          ...(source?.principal ? { principal: source.principal } : {}),
        }
        // On a durable host, this appends one transcript record to the new
        // log.
        await transcripts.saveThread(entry.threadId, kept)
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
