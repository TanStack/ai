import { loadChildTranscript } from '@tanstack/ai-persistence'
import { logIdOf, logMessageStore, revertOf, visibleMessages } from '../log'
import { createMediaStore } from '../media'
import { tenantStores } from '../tenant-stores'
import { emptyUsage, isSessionUsage } from '../usage'
import { INTERRUPTED, USAGE, isInterruptedTurn } from './helpers'
import type { ModelMessage } from '@tanstack/ai'
import type { BlobRange, SessionIndexEntry } from '@tanstack/ai-persistence'
import type { LogReader, ReduceOptions } from '../log'
import type { MediaPersistence, MediaStore } from '../media'
import type { SessionUsage } from '../usage'
import type {
  AnyHarness,
  HarnessLogStateOf,
  SessionMetadataOf,
} from '../define'
import type { HarnessPersistence, SessionIndexWriter } from '../host'
import type { Cursor, MediaRecord, SessionEvent } from '../types'
import type { SessionImpl } from './harness-session'
import type { SessionSnapshot } from './types'

/**
 * A read-only view of one thread, from `host.observe`. It mounts no plugins,
 * claims nothing, and writes nothing, so a read of an idle thread costs only
 * store reads. When the session of the thread is open on this host, the view
 * reads through it. The view never holds that session: it closes on idle as
 * if the view did not exist. Each call reads again, so a view can live as
 * long as you need it.
 *
 * @example
 * ```ts
 * const view = await host.observe(assistant, { threadId, principal })
 * const messages = await view.transcript()
 * ```
 */
export interface ObservedSession<THarness extends AnyHarness = AnyHarness> {
  readonly threadId: string
  /**
   * The events of the thread after `from` (exclusive), then each new event,
   * until `signal` aborts.
   *
   * - A durable host (`stores.log`) reads the log. The read follows what the
   *   sessions of every host append, also when no session is open.
   * - A host with no log has the events of an open session only. When the
   *   session is not open on this host, the read ends at once, as there is
   *   nothing to stream. When the session closes, the read ends.
   *
   * Stop the read with `signal`, or by leaving the loop: on a durable host,
   * a read keeps the log open until it stops.
   */
  events: (options?: {
    from?: Cursor
    signal?: AbortSignal
  }) => AsyncIterable<SessionEvent>
  /**
   * The saved messages of the thread, oldest first, as
   * `session.transcript()` gives them: while a revert stands, the messages
   * after its message are hidden.
   */
  transcript: () => Promise<Array<ModelMessage>>
  /**
   * The snapshot of the thread. When the session is open on this host, it is
   * `session.snapshot()`. Else it is built from the stores, with no plugin
   * setup:
   *
   * - `status` is `requires_action` while interrupts wait, else `idle`.
   * - `pendingInterrupts` come from `stores.metadata`, and `usage` from the
   *   log or `stores.metadata`.
   * - `plugins` has only the plugin state that `stores.metadata` keeps. The
   *   state of a plugin that never saved one is left out, because its first
   *   value comes from the plugin setup.
   * - There are no active operations, queued turns, waiting inputs, or
   *   questions: those live in an open session.
   * - `cursor` is the log position on a durable host, else `'0'`.
   */
  snapshot: () => Promise<SessionSnapshot>
  /**
   * The saved messages of a child agent run of the thread, as
   * `session.agentTranscript()` gives them. Empty for an unknown id.
   */
  agentTranscript: (subagentRunId: string) => Promise<Array<ModelMessage>>
  /** The record of a media file of the thread, or `null` when it is not found. */
  getMedia: (id: string) => Promise<MediaRecord | null>
  /**
   * The bytes of the media file `id`, or of one `range` of them. Throws a
   * `MediaError` with 404 when it is not found.
   */
  loadMedia: (options: {
    id: string
    range?: BlobRange
  }) => Promise<Uint8Array<ArrayBuffer>>
  /** The token usage of the thread, as `session.usage()` gives it. */
  usage: () => Promise<SessionUsage>
  /** The session index entry of the thread, or `undefined` when it has none. */
  entry: () => Promise<
    SessionIndexEntry<SessionMetadataOf<THarness>> | undefined
  >
  /**
   * The `durability.reduce` fold of the harness for the log of the thread,
   * as `host.logState` gives it. `undefined` on a host with no log, and when
   * the reduce of another harness folds the log.
   */
  logState: () => Promise<HarnessLogStateOf<THarness> | undefined>
}

/** What a view reads, from the host that makes it. */
export interface ObservedSources<THarness extends AnyHarness> {
  harness: THarness
  threadId: string
  tenantId: string | undefined
  /** The open session of the thread on this host, or `undefined`. */
  live: () => SessionImpl<THarness> | undefined
  /** Throws when the host is closed. */
  check: () => void
  index: SessionIndexWriter
  /** The stores of the host, in all tenants. */
  persistence: HarnessPersistence
  media: MediaPersistence
  /**
   * On a durable host: a reader of the log of the thread, and the `reduce`
   * that folds the log. The caller closes the reader.
   */
  readLog:
    | (() => Promise<{
        reader: LogReader
        reduce: ReduceOptions<unknown> | undefined
      }>)
    | undefined
}

/** The open session of each view, for the HTTP handler. Not public API. */
const liveSessions = new WeakMap<
  object,
  () => Pick<SessionImpl, 'operation'> | undefined
>()

/**
 * @internal The session that `view` reads through now, or `undefined` when
 * it is not open on this host.
 */
export function liveSessionOf(view: ObservedSession) {
  return liveSessions.get(view)?.()
}

/** The media store of each view, for the HTTP handler. Not public API. */
const mediaStores = new WeakMap<object, MediaStore>()

/** @internal The media store that `view` reads, so a route can stream bytes. */
export function mediaStoreOf(view: ObservedSession) {
  return mediaStores.get(view)
}

/** The view of `host.observe`. See {@link ObservedSession}. */
export function observedSession<THarness extends AnyHarness>(
  sources: ObservedSources<THarness>,
) {
  const { harness, threadId, tenantId, live, check, index, readLog } = sources
  const { stores } = sources.persistence
  const { metadata } = stores
  const storeThreadId = logIdOf({ tenantId, logId: threadId })
  const tenant = tenantId !== undefined ? { tenantId } : {}
  const messages = tenantStores(stores, tenantId).messages
  const project = harness.durability?.project
  // The children of a durable session each have their own log.
  const childMessages = stores.log
    ? logMessageStore({
        store: stores.log,
        ...(project ? { project } : {}),
        ...tenant,
      })
    : messages
  const mediaStore = createMediaStore({
    persistence: sources.media,
    threadId,
    ...tenant,
    options: harness.media,
  })

  /** The open session of the thread, once the host is known to be open. */
  const open = () => {
    check()
    return live()
  }

  /** `read` on a reader of the log from `logReader`, which closes after it. */
  const fromLog = async <T>(
    logReader: NonNullable<typeof readLog>,
    read: (reader: LogReader, reduce: ReduceOptions<unknown> | undefined) => T,
  ) => {
    const { reader, reduce } = await logReader()
    try {
      return read(reader, reduce)
    } finally {
      reader.close()
    }
  }

  /** The usage totals and the cursor of a session that is not open. */
  const storedTotals = async () => {
    if (readLog) {
      return fromLog(readLog, (reader) => ({
        usage: structuredClone(reader.state.usage),
        cursor: reader.head(),
      }))
    }
    const stored = await metadata?.get(USAGE, storeThreadId)
    return {
      usage: isSessionUsage(stored) ? stored : emptyUsage(),
      cursor: '0',
    }
  }

  /** The plugin state that `stores.metadata` keeps, by plugin name. */
  const storedPluginState = async () => {
    const state = new Map<string, unknown>()
    if (!metadata) return Object.fromEntries(state)
    // The plugin list only: no plugin is set up.
    const names = (harness.plugins?.() ?? []).map((plugin) => plugin.name)
    const saved = await Promise.all(
      names.map(async (name) => ({
        name,
        value: await metadata.get(`plugin:${name}`, storeThreadId),
      })),
    )
    for (const { name, value } of saved) {
      if (value !== null && value !== undefined) state.set(name, value)
    }
    // fromEntries defines own keys, so a plugin named `__proto__` stays a key.
    return Object.fromEntries(state)
  }

  async function* events(options: { from?: Cursor; signal?: AbortSignal }) {
    check()
    if (readLog) {
      const { reader } = await readLog()
      try {
        yield* reader.read(options)
      } finally {
        reader.close()
      }
      return
    }
    // A host with no log: only an open session has events.
    const session = live()
    if (session) yield* session.events(options)
  }

  const view: ObservedSession<THarness> = {
    threadId,
    events: (options) => events(options ?? {}),
    async transcript() {
      const session = open()
      if (session) return session.transcript()
      if (readLog) {
        return fromLog(readLog, ({ state }) =>
          visibleMessages(state.messages, state.revert),
        )
      }
      const [stored, revert] = await Promise.all([
        messages?.loadThread(threadId),
        metadata?.get('harness:revert', storeThreadId),
      ])
      return visibleMessages(stored ?? [], revertOf(revert))
    },
    async snapshot() {
      const session = open()
      if (session) return session.snapshot()
      const [interrupted, plugins, totals] = await Promise.all([
        metadata?.get(INTERRUPTED, storeThreadId),
        storedPluginState(),
        storedTotals(),
      ])
      const pendingInterrupts = isInterruptedTurn(interrupted)
        ? interrupted.interrupts
        : []
      const snapshot: SessionSnapshot = {
        threadId,
        status: pendingInterrupts.length > 0 ? 'requires_action' : 'idle',
        activeOperations: [],
        queuedTurns: 0,
        waitingInputs: [],
        pendingInterrupts,
        pendingQuestions: [],
        plugins,
        ...totals,
      }
      return snapshot
    },
    async agentTranscript(subagentRunId) {
      check()
      if (!childMessages) return []
      return (
        (await loadChildTranscript(childMessages, subagentRunId, threadId)) ??
        []
      )
    },
    getMedia(id) {
      check()
      return mediaStore.get(id)
    },
    loadMedia({ id, range }) {
      check()
      return mediaStore.load(id, range)
    },
    async usage() {
      const session = open()
      if (session) return session.usage()
      return (await storedTotals()).usage
    },
    async entry() {
      check()
      // The schema checked the metadata on each write.
      return (await index.get({ tenantId, threadId })) as
        | SessionIndexEntry<SessionMetadataOf<THarness>>
        | undefined
    },
    async logState() {
      check()
      if (!readLog) return undefined
      return fromLog(readLog, (reader, reduce) =>
        // The reduce of another harness folded this log: its state has
        // another type. Else the reduce of `harness` folded it, so it has
        // that type. A map of logs cannot carry a state type per log.
        reduce === harness.durability?.reduce
          ? (reader.reduced as HarnessLogStateOf<THarness> | undefined)
          : undefined,
      )
    },
  }
  liveSessions.set(view, live)
  mediaStores.set(view, mediaStore)
  return view
}
