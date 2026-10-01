import { memoryPersistence } from '@tanstack/ai-persistence'
import { SharedLog, loadLogState } from './log'
import { HarnessSession } from './session'
import type { RunStore } from '@tanstack/ai'
import type {
  AIPersistence,
  ArtifactStore,
  BlobStore,
  ChatTranscriptStores,
  CredentialStore,
  GenerationRunStore,
  InboxStore,
  InterruptStore,
  LogStore,
  MetadataStore,
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
}

/**
 * The stores a host needs. Two shapes:
 *
 * - A message store, plus any of runs, interrupts, metadata, and inbox.
 *   Without an inbox, inputs are kept in memory and a restart loses the ones
 *   not yet applied.
 * - Durable mode: a `log` and `runs`. The log holds the events, transcript,
 *   inputs, and tool steps of each thread, so this shape has no `messages`
 *   and no `inbox`.
 *
 * Without `artifacts`, `blobs`, and `generationRuns`, media is kept in memory.
 */
export type HarnessPersistence =
  | AIPersistence<
      ChatTranscriptStores & { inbox?: InboxStore; log?: never } & SharedStores
    >
  | AIPersistence<
      {
        log: LogStore
        runs: RunStore
        interrupts?: InterruptStore
        metadata?: MetadataStore
        messages?: never
        inbox?: never
      } & SharedStores
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
  /** Close every live session. */
  close: () => Promise<void>
  /**
   * The `reduce` fold of a log that has an open session in this host, or
   * `undefined`.
   */
  logState: (logId: string) => TLogState | undefined
}

let warned = false

/** Throw a clear error for a durable store set that cannot work. */
function checkDurableStores(persistence: HarnessPersistence) {
  const { stores } = persistence
  if (stores.log === undefined) return
  if (stores.runs === undefined) {
    throw new Error(
      'A durable host (stores.log) needs stores.runs: run leases find a crashed host.',
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
  const hostId = `host-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`

  return {
    open(harness, { threadId, principal, logId: openLogId }) {
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
          onClose: () => sessions.delete(key),
        })
        session = created.open().then(
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
    async close() {
      const live = await Promise.allSettled(sessions.values())
      await Promise.all(
        live
          .filter((entry) => entry.status === 'fulfilled')
          .map((entry) => entry.value.close()),
      )
    },
    logState: (logId) => resolved.get(logId)?.state.reduced,
  }
}
