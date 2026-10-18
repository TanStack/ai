import { loadChildTranscript } from '@tanstack/ai-persistence'
import { runStartOf, visibleMessages } from '../log'
import { snapshotWaits } from '../waits'
import { createMediaStore } from '../media'
import type { ModelMessage } from '@tanstack/ai'
import type {
  BlobRange,
  MessageStore,
  RunRecord,
  SessionIndexEntry,
} from '@tanstack/ai-persistence'
import type { LogReader, ReduceOptions } from '../log'
import type { MediaPersistence, MediaStore } from '../media'
import type { SessionUsage } from '../usage'
import type {
  AnyHarness,
  HarnessLogStateOf,
  SessionMetadataOf,
} from '../define'
import type { SessionIndexWriter } from '../host'
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
   * until `signal` aborts. The read follows what the sessions of every host
   * append to the log, also when no session is open.
   *
   * Stop the read with `signal`, or by leaving the loop: a read keeps the log
   * open until it stops.
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
   * - `pendingInterrupts`, `pendingQuestions`, `pendingWaits`, `usage`,
   *   and `plugins` come from the log. `plugins` has only the plugin state
   *   that the log keeps. The state of a plugin that never saved one is left
   *   out, because its first value comes from the plugin setup.
   * - There are no active operations, queued turns, or waiting inputs:
   *   those live in an open session.
   * - `cursor` is the log position.
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
   * as `session.logState()` gives it. For a child thread, it is the fold of
   * the log of its root. `undefined` when the harness has no `reduce`, and
   * when the reduce of another harness folds the log.
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
  media: MediaPersistence
  /**
   * A reader of the thread in the log of its session tree (the log of its
   * root thread), and the `reduce` that folds the log. The caller closes
   * the reader.
   */
  readLog: () => Promise<{
    reader: LogReader
    reduce: ReduceOptions<unknown> | undefined
  }>
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

/** How each view reads the runs in its log, for the HTTP handler. Not public API. */
const storedRuns = new WeakMap<
  object,
  () => Promise<ReadonlyMap<string, RunRecord>>
>()
/** How each view reads one run and its start, for the HTTP handler. */
const storedRun = new WeakMap<
  object,
  (
    runId: string,
  ) => Promise<{ record: RunRecord | undefined; start: Cursor | undefined }>
>()

/**
 * @internal The runs in the log of the thread of `view`, by run id: the
 * runs that any host wrote to it.
 */
export function storedRunsOf(view: ObservedSession) {
  const read = storedRuns.get(view)
  if (!read) throw new Error('Not a view of host.observe.')
  return read()
}

/**
 * @internal The run `runId` in the log of the thread of `view`, and the
 * cursor before its first event (`undefined` when the log does not know it).
 */
export function storedRunOf(view: ObservedSession, runId: string) {
  const read = storedRun.get(view)
  if (!read) throw new Error('Not a view of host.observe.')
  return read(runId)
}

/** The view of `host.observe`. See {@link ObservedSession}. */
export function observedSession<THarness extends AnyHarness>(
  sources: ObservedSources<THarness>,
) {
  const { harness, threadId, tenantId, live, check, index, readLog } = sources
  const tenant = tenantId !== undefined ? { tenantId } : {}
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

  /** `read` on a reader of the log, which closes after it. */
  const fromLog = async <T>(
    read: (reader: LogReader, reduce: ReduceOptions<unknown> | undefined) => T,
  ) => {
    const { reader, reduce } = await readLog()
    try {
      return read(reader, reduce)
    } finally {
      reader.close()
    }
  }

  /** The usage totals and the cursor of a session that is not open. */
  const storedTotals = () =>
    fromLog((reader) => ({
      usage: structuredClone(reader.state.usage),
      cursor: reader.head(),
    }))

  async function* events(options: { from?: Cursor; signal?: AbortSignal }) {
    check()
    const { reader } = await readLog()
    try {
      yield* reader.read(options)
    } finally {
      reader.close()
    }
  }

  const view: ObservedSession<THarness> = {
    threadId,
    events: (options) => events(options ?? {}),
    async transcript() {
      const session = open()
      if (session) return session.transcript()
      return fromLog(({ state }) =>
        visibleMessages(state.messages, state.revert),
      )
    },
    async snapshot() {
      const session = open()
      if (session) return session.snapshot()
      // The plugin list only: no plugin is set up.
      const names = new Set(
        (harness.plugins?.() ?? []).map((plugin) => plugin.name),
      )
      const { pendingInterrupts, waits, plugins, totals } = await fromLog(
        (reader) => {
          const { thread } = reader.state
          const saved = [...thread.plugins].filter(([name]) => names.has(name))
          const interrupts = thread.interrupted?.interrupts ?? []
          return structuredClone({
            pendingInterrupts: interrupts,
            waits: snapshotWaits({
              stopped: thread.interrupted,
              interrupts,
              waits: thread.waits,
            }),
            // fromEntries defines own keys, so a plugin named `__proto__`
            // stays a key.
            plugins: Object.fromEntries(saved),
            totals: { usage: reader.state.usage, cursor: reader.head() },
          })
        },
      )
      const snapshot: SessionSnapshot = {
        threadId,
        status: pendingInterrupts.length > 0 ? 'requires_action' : 'idle',
        activeOperations: [],
        queuedTurns: 0,
        waitingInputs: [],
        pendingInterrupts,
        ...waits,
        plugins,
        ...totals,
      }
      return snapshot
    },
    async agentTranscript(subagentRunId) {
      check()
      const { reader } = await readLog()
      try {
        // The child threads are in the log of the session tree. A read
        // writes nothing.
        const children: MessageStore = {
          loadThread: (thread) =>
            Promise.resolve([...reader.stateOf(thread).messages]),
          saveThread: () =>
            Promise.reject(new Error('host.observe writes nothing.')),
        }
        return (
          (await loadChildTranscript(children, subagentRunId, threadId)) ?? []
        )
      } finally {
        reader.close()
      }
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
      return fromLog((reader, reduce) =>
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
  // The fold changes by copy, so this map stays as it is after the read.
  storedRuns.set(view, () => {
    check()
    return fromLog(({ state }) => state.thread.runs)
  })
  storedRun.set(view, (runId) => {
    check()
    return fromLog(({ state }) => ({
      record: state.thread.runs.get(runId),
      start: runStartOf(state, runId),
    }))
  })
  return view
}
