import { loadChildTranscript } from '@tanstack/ai-persistence'
import { runStartOf, visibleMessages } from '../log'
import { agentRunThread } from '../log-records'
import { createMediaStore } from '../media'
import { untilRevoked } from './handle'
import { jobsOf, loggedChildWaits, snapshotFrom } from './helpers'
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
import type { HandleGuard } from './handle'
import type { SessionImpl } from './harness-session'
import type { JobInfo, SessionSnapshot } from './types'

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
 * const view = await host.observe(assistant, { threadId, user })
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
   * `session.snapshot()`. Else the same builder makes it from the log, with
   * no plugin setup, so the status rule and the shape are the same. What
   * only an open session knows is not there:
   *
   * - `status` is never `running`: a turn runs in memory. It is
   *   `requires_action` while the last turn waits for interrupts, else
   *   `idle`.
   * - There are no active operations, queued turns, or waiting inputs. The
   *   waits of `harnessAgent` children come from the log.
   * - `plugins` has only the plugin state that the log keeps. The state of
   *   a plugin that never saved one is left out, because its first value
   *   comes from the plugin setup.
   * - `cursor` is the log position.
   */
  snapshot: () => Promise<SessionSnapshot>
  /**
   * The saved messages of a child agent run of the thread, by its
   * `subagentRunId` or by its `runId`, as `session.agentTranscript()` gives
   * them. Empty for an unknown id.
   */
  agentTranscript: (
    run: { subagentRunId: string } | { runId: string },
  ) => Promise<Array<ModelMessage>>
  /** The record of a media file of the thread, or `null` when it is not found. */
  getMedia: (options: { id: string }) => Promise<MediaRecord | null>
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
  indexEntry: () => Promise<
    SessionIndexEntry<SessionMetadataOf<THarness>> | undefined
  >
  /**
   * The `durability.logState` fold of the harness for the log of the thread,
   * as `session.logState()` gives it. For a child thread, it is the fold of
   * the log of its root. `undefined` when the harness has no `durability.logState`.
   */
  logState: () => Promise<HarnessLogStateOf<THarness> | undefined>
  /**
   * The background jobs of the thread, as `session.jobs()` lists them. When
   * the session is not open on this host, `running` is `false` for each.
   */
  jobs: () => Promise<Array<JobInfo>>
}

/** What a view reads, from the host that makes it. */
export interface ObservedSources<THarness extends AnyHarness> {
  harness: THarness
  threadId: string
  tenantId: string | undefined
  /** The open session of the thread on this host, or `undefined`. */
  live: () => SessionImpl<THarness> | undefined
  /** Throws when the host is closed, and when a revoke took the access. */
  check: () => void
  /**
   * With access: call `listener` when `host.revoke` (or `unshare`) takes the
   * access of the user of the view. A read that runs then stops.
   */
  onRevoke?: HandleGuard['onRevoke']
  index: SessionIndexWriter
  media: MediaPersistence
  /**
   * A reader of the thread in the log of its session tree (the log of its
   * root thread), and the `durability.logState` that folds the log. The caller closes
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

  const { onRevoke } = sources
  const view: ObservedSession<THarness> = {
    threadId,
    // A revoke ends a read that runs now, not only the next call.
    events: (options) =>
      onRevoke
        ? untilRevoked({
            onRevoke,
            threadId,
            signal: options?.signal,
            read: (signal) => events({ ...options, signal }),
          })
        : events(options ?? {}),
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
      return fromLog((reader) => {
        const { thread } = reader.state
        const saved = [...thread.plugins].filter(([name]) => names.has(name))
        // The same builder as `session.snapshot()`, with no live part.
        return structuredClone(
          snapshotFrom({
            threadId,
            thread,
            stopped: thread.interrupted,
            // fromEntries defines own keys, so a plugin named `__proto__`
            // stays a key.
            plugins: Object.fromEntries(saved),
            usage: reader.state.usage,
            cursor: reader.head(),
            childWaits: loggedChildWaits(reader, threadId),
          }),
        )
      })
    },
    async agentTranscript(run) {
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
        if ('subagentRunId' in run) {
          const child = await loadChildTranscript(
            children,
            run.subagentRunId,
            threadId,
          )
          if (child) return child
        }
        const thread = agentRunThread(reader.state.thread, threadId, run)
        return thread === undefined ? [] : children.loadThread(thread)
      } finally {
        reader.close()
      }
    },
    getMedia({ id }) {
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
    async indexEntry() {
      check()
      // The schema checked the metadata on each write.
      return (await index.get({ tenantId, threadId })) as
        | SessionIndexEntry<SessionMetadataOf<THarness>>
        | undefined
    },
    async logState() {
      check()
      return fromLog((reader, reduce) =>
        // The open of a log with another reduce throws, so the reduce of
        // `harness` folded it, and the state has that type. A map of logs
        // cannot carry a state type per log.
        reduce === harness.durability?.logState
          ? (reader.reduced as HarnessLogStateOf<THarness> | undefined)
          : undefined,
      )
    },
    async jobs() {
      const session = open()
      if (session) return session.jobs()
      return fromLog((reader) => jobsOf(reader, threadId, new Set()))
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
