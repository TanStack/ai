import { EventType } from '@tanstack/ai'
import { LogConflictError } from '@tanstack/ai-persistence'
import { isRecord } from './utils'
import type { ModelMessage, StreamChunk } from '@tanstack/ai'
import type {
  LogEntry,
  LogRecord,
  LogStore,
  MessageStore,
  MetadataStore,
} from '@tanstack/ai-persistence'
import type { EventFeed } from './feed'
import type {
  Cursor,
  HarnessInput,
  InputSettlement,
  SessionEvent,
} from './types'

/** The records the harness writes to a session log. */
export type HarnessRecord =
  | { type: 'harness.event'; operationId: string; event: StreamChunk }
  | { type: 'harness.transcript'; keep: number; add: Array<ModelMessage> }
  | {
      type: 'harness.input'
      inputId: string
      input: HarnessInput
      principal?: { id: string }
      at: number
    }
  | {
      type: 'harness.input.applied'
      inputId: string
      operationId: string
      attempt: number
      timeoutAt?: number
    }
  | { type: 'harness.input.joined'; inputId: string; into: string }
  | { type: 'harness.input.rejected'; inputId: string; reason: string }
  | { type: 'harness.input.abort'; inputId: string }
  | {
      type: 'harness.input.settled'
      inputId: string
      outcome: InputSettlement['outcome']
      operationId?: string
      error?: InputSettlement['error']
    }
  | { type: 'harness.tool.result'; toolCallId: string; message: ModelMessage }
  | {
      type: 'harness.tool.step'
      toolCallId: string
      name: string
      value: unknown
    }

const HARNESS_RECORD_TYPES = new Set<string>([
  'harness.event',
  'harness.transcript',
  'harness.input',
  'harness.input.applied',
  'harness.input.joined',
  'harness.input.rejected',
  'harness.input.abort',
  'harness.input.settled',
  'harness.tool.result',
  'harness.tool.step',
])

// The harness wrote every record of these types, so the fields are its own.
function isHarnessRecord(record: LogRecord): record is HarnessRecord {
  return HARNESS_RECORD_TYPES.has(record.type)
}

/**
 * Fold one host record into the model context. Return the new message list,
 * or `undefined` for no change. It must be pure: the same log always folds to
 * the same context, live and after a restart.
 */
export type ProjectRecord = (args: {
  messages: ReadonlyArray<ModelMessage>
  record: LogRecord
}) => Array<ModelMessage> | undefined

/** How a host folds its own records into the model context. */
export interface ProjectOptions {
  record: ProjectRecord
  /**
   * The version of `record`. A fold checkpoint with another version is
   * ignored, so a change to `record` never reads an old fold.
   */
  version?: string
}

/** What the log knows about one input. */
export interface InputState {
  inputId: string
  input: HarnessInput
  principal?: { id: string }
  at: number
  status: 'pending' | 'applied' | 'joined' | 'rejected' | 'settled'
  operationId?: string
  attempt: number
  timeoutAt?: number
  /** The host input that this input joined. */
  into?: string
  abortRequested: boolean
  /** Transcript length when the input was last applied. */
  appliedAt?: number
  settlement?: InputSettlement
  reason?: string
}

/** The fold of a session log. */
export interface LogState {
  /** The position of the last folded record. */
  seq: number
  messages: Array<ModelMessage>
  /** In admission order. */
  inputs: Map<string, InputState>
  toolResults: Map<string, ModelMessage>
  /** By {@link stepKey}. */
  steps: Map<string, unknown>
}

export function emptyLogState() {
  const state: LogState = {
    seq: 0,
    messages: [],
    inputs: new Map(),
    toolResults: new Map(),
    steps: new Map(),
  }
  return state
}

export const stepKey = (toolCallId: string, name: string) =>
  `${toolCallId}\u0000${name}`

/** A JSON copy: what a store gives back for `record`. */
const normalize = <T>(value: T) => JSON.parse(JSON.stringify(value)) as T

const sameJson = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right)

/** A message out of the log gets its `createdAt` back as a `Date`. */
function revive(message: ModelMessage) {
  const createdAt: unknown = message.createdAt
  return typeof createdAt === 'string'
    ? { ...message, createdAt: new Date(createdAt) }
    : message
}

/** How many messages at the start of `a` and `b` are the same. */
export function commonPrefix(
  a: ReadonlyArray<ModelMessage>,
  b: ReadonlyArray<ModelMessage>,
) {
  const length = Math.min(a.length, b.length)
  let index = 0
  while (index < length && sameJson(a[index], b[index])) index += 1
  return index
}

/** The transcript record that turns `current` into `next`, or none. */
function transcriptRecord(
  current: ReadonlyArray<ModelMessage>,
  next: ReadonlyArray<ModelMessage>,
): Array<HarnessRecord> {
  const keep = commonPrefix(current, next)
  const isSame = keep === current.length && keep === next.length
  if (isSame) return []
  return [
    { type: 'harness.transcript', keep, add: normalize(next.slice(keep)) },
  ]
}

function updateInput(
  state: LogState,
  inputId: string,
  change: (input: InputState) => InputState,
) {
  const input = state.inputs.get(inputId)
  if (input) state.inputs.set(inputId, change(input))
}

/** Fold one entry into `state`. */
export function foldEntry(
  state: LogState,
  entry: LogEntry,
  project?: ProjectRecord,
) {
  state.seq = entry.seq
  const { record } = entry
  if (!record.type.startsWith('harness.')) {
    const next = project?.({ messages: state.messages, record })
    if (next) state.messages = next
    return
  }
  // A harness record type from a newer version is skipped.
  if (!isHarnessRecord(record)) return
  switch (record.type) {
    case 'harness.event':
      return
    case 'harness.transcript':
      state.messages = [
        ...state.messages.slice(0, record.keep),
        ...record.add.map(revive),
      ]
      return
    case 'harness.input':
      if (state.inputs.has(record.inputId)) return
      state.inputs.set(record.inputId, {
        inputId: record.inputId,
        input: record.input,
        ...(record.principal ? { principal: record.principal } : {}),
        at: record.at,
        status: 'pending',
        attempt: 0,
        abortRequested: false,
      })
      return
    case 'harness.input.applied': {
      const appliedAt = state.messages.length
      updateInput(state, record.inputId, (input) => ({
        ...input,
        status: 'applied',
        operationId: record.operationId,
        attempt: record.attempt,
        appliedAt,
        ...(record.timeoutAt !== undefined
          ? { timeoutAt: record.timeoutAt }
          : {}),
      }))
      return
    }
    case 'harness.input.joined':
      updateInput(state, record.inputId, (input) => ({
        ...input,
        status: 'joined',
        into: record.into,
      }))
      return
    case 'harness.input.rejected':
      updateInput(state, record.inputId, (input) => ({
        ...input,
        status: 'rejected',
        reason: record.reason,
      }))
      return
    case 'harness.input.abort':
      updateInput(state, record.inputId, (input) => ({
        ...input,
        abortRequested: true,
      }))
      return
    case 'harness.input.settled':
      updateInput(state, record.inputId, (input) => ({
        ...input,
        status: 'settled',
        settlement: {
          inputId: record.inputId,
          outcome: record.outcome,
          ...(record.operationId ? { operationId: record.operationId } : {}),
          ...(record.error ? { error: record.error } : {}),
        },
      }))
      return
    case 'harness.tool.result':
      state.toolResults.set(record.toolCallId, record.message)
      return
    case 'harness.tool.step':
      state.steps.set(stepKey(record.toolCallId, record.name), record.value)
      return
  }
}

/** A fold of every host record of a log, across its sessions, in log order. */
export interface ReduceOptions<TState> {
  /** The state of an empty log. JSON. */
  initial: TState
  /** Pure. Return the next state, or the same state for no change. */
  record: (args: { state: TState; record: LogRecord }) => TState
  /** A fold checkpoint with another version is ignored. */
  version?: string
}

/** The fold of a whole log: one state per session, and the reduce state. */
export interface SharedLogState<TState = unknown> {
  /** The position of the last folded record. */
  seq: number
  /** By thread id. */
  sessions: Map<string, LogState>
  reduced: TState | undefined
}

export function emptySharedLogState<TState = unknown>(
  reduce?: ReduceOptions<TState>,
) {
  const state: SharedLogState<TState> = {
    seq: 0,
    sessions: new Map(),
    reduced: reduce ? normalize(reduce.initial) : undefined,
  }
  return state
}

/** The fold of session `thread`. A session with no records yet gets an empty one. */
export function sessionOf(state: SharedLogState<unknown>, thread: string) {
  let session = state.sessions.get(thread)
  if (!session) {
    session = emptyLogState()
    state.sessions.set(thread, session)
  }
  return session
}

/** The session of a record: its `thread`, or the session whose thread id is the log id. */
export const threadOf = (record: LogRecord, logId: string) =>
  typeof record.thread === 'string' ? record.thread : logId

interface FoldOptions<TState> {
  logId: string
  project?: ProjectRecord
  reduce?: ReduceOptions<TState>
}

/** Fold one entry of a shared log. */
export function foldLogEntry<TState>(
  state: SharedLogState<TState>,
  entry: LogEntry,
  options: FoldOptions<TState>,
) {
  state.seq = entry.seq
  const { record } = entry
  const { reduce } = options
  if (reduce && !record.type.startsWith('harness.')) {
    state.reduced = reduce.record({
      state: state.reduced ?? reduce.initial,
      record,
    })
  }
  foldEntry(
    sessionOf(state, threadOf(record, options.logId)),
    entry,
    options.project,
  )
}

const CHECKPOINT_NAMESPACE = 'harness:log-checkpoint'
// ponytail: a checkpoint every 50 appends. Tune it when a cold fold is slow.
const CHECKPOINT_EVERY = 50
const READ_PAGE = 500
// ponytail: the in-memory event tail, like SessionFeed. Older cursors page
// from the store.
const MAX_TAIL = 10_000

interface CheckpointVersions {
  version?: string
  reduceVersion?: string
}

function serialize(state: SharedLogState, versions: CheckpointVersions) {
  return {
    v: 2,
    seq: state.seq,
    ...versions,
    sessions: [...state.sessions].map(([thread, session]) => [
      thread,
      {
        messages: session.messages,
        inputs: [...session.inputs.values()],
        toolResults: [...session.toolResults.entries()],
        steps: [...session.steps.entries()],
      },
    ]),
    reduced: state.reduced ?? null,
  }
}

/** One session of a checkpoint at `seq`, or `undefined` when it is not shaped. */
function parseSession(value: unknown, seq: number) {
  if (!isRecord(value)) return undefined
  const { messages, inputs, toolResults, steps } = value
  const isShaped =
    Array.isArray(messages) &&
    Array.isArray(inputs) &&
    Array.isArray(toolResults) &&
    Array.isArray(steps)
  if (!isShaped) return undefined
  // The harness wrote these arrays with `serialize`.
  const session: LogState = {
    seq,
    messages: (messages as Array<ModelMessage>).map(revive),
    inputs: new Map(
      (inputs as Array<InputState>).map((input) => [input.inputId, input]),
    ),
    toolResults: new Map(toolResults as Array<[string, ModelMessage]>),
    steps: new Map(steps as Array<[string, unknown]>),
  }
  return session
}

/** A checkpoint that the harness wrote with `versions`, or `undefined`. */
function parseCheckpoint<TState>(
  value: unknown,
  versions: CheckpointVersions,
): SharedLogState<TState> | undefined {
  if (!isRecord(value) || value.v !== 2 || typeof value.seq !== 'number') {
    return undefined
  }
  if (
    value.version !== versions.version ||
    value.reduceVersion !== versions.reduceVersion ||
    !Array.isArray(value.sessions)
  ) {
    return undefined
  }
  const sessions = new Map<string, LogState>()
  for (const item of value.sessions) {
    if (!Array.isArray(item) || typeof item[0] !== 'string') return undefined
    const session = parseSession(item[1], value.seq)
    if (!session) return undefined
    sessions.set(item[0], session)
  }
  return {
    seq: value.seq,
    sessions,
    // The harness wrote this value with `serialize`, from `reduce`.
    reduced: (value.reduced ?? undefined) as TState | undefined,
  }
}

const versionsOf = (
  project: ProjectOptions | undefined,
  reduce: { version?: string } | undefined,
): CheckpointVersions => ({
  ...(project ? { version: project.version ?? '' } : {}),
  // A checkpoint with a reduce fold never loads without reduce, or the reverse.
  ...(reduce ? { reduceVersion: reduce.version ?? '' } : {}),
})

/**
 * Fold the log `logId`. With `metadata`, start from the newest fold
 * checkpoint when it is valid for this log and these versions.
 */
export async function loadLogState<TState = unknown>(options: {
  store: LogStore
  logId: string
  metadata?: MetadataStore
  project?: ProjectOptions
  reduce?: ReduceOptions<TState>
}) {
  const { store, logId, metadata, project, reduce } = options
  const saved = metadata
    ? await metadata.get(CHECKPOINT_NAMESPACE, logId).catch(() => null)
    : null
  let state =
    parseCheckpoint<TState>(saved, versionsOf(project, reduce)) ??
    emptySharedLogState(reduce)
  if (state.seq > 0) {
    // A checkpoint past the end of the log belongs to another log.
    const [atCheckpoint] = await store.read(logId, {
      after: state.seq - 1,
      limit: 1,
    })
    if (!atCheckpoint) state = emptySharedLogState(reduce)
  }
  const fold: FoldOptions<TState> = {
    logId,
    ...(project ? { project: project.record } : {}),
    ...(reduce ? { reduce } : {}),
  }
  for (;;) {
    const page = await store.read(logId, { after: state.seq, limit: READ_PAGE })
    for (const entry of page) foldLogEntry(state, entry, fold)
    if (page.length < READ_PAGE) return state
  }
}

const DELTA_TYPES = new Set<string>([
  EventType.TEXT_MESSAGE_CONTENT,
  EventType.REASONING_MESSAGE_CONTENT,
  EventType.TOOL_CALL_ARGS,
])

/** The fields of a delta event that must match for a merge. */
function deltaKey(thread: string, operationId: string, event: StreamChunk) {
  if (!DELTA_TYPES.has(event.type) || !('delta' in event)) return undefined
  const { delta: _delta, timestamp: _timestamp, ...rest } = event
  return JSON.stringify([thread, operationId, rest])
}

/** A session's view of its log. It is also the session's {@link EventFeed}. */
export interface LogWriter extends EventFeed {
  readonly threadId: string
  readonly logId: string
  /**
   * The fold of this session. In a shared log, `seq` is this session's last
   * folded record. `head()` is the log position.
   */
  readonly state: LogState
  /** Append `records` after the pending events, in one batch. */
  append: (records: ReadonlyArray<LogRecord>) => Promise<void>
  /** Hold `records` until the next transcript commit of this session. */
  stage: (records: ReadonlyArray<LogRecord>) => void
  /**
   * One batch: the pending events, the transcript change to `messages` (if
   * any), the staged records of this session, then `records`.
   */
  commit: (options: {
    messages: ReadonlyArray<ModelMessage>
    records?: ReadonlyArray<LogRecord>
  }) => Promise<void>
  /** Append the pending events now. */
  flush: () => Promise<void>
}

/**
 * Writes one log for every session that shares it, and keeps its fold.
 * All writes run one after another. Each batch goes at the next position.
 * When a write fails (another writer took the position, or the store failed
 * twice), every session of the log gets `onFailure`, and every later write
 * rejects.
 */
export class SharedLog<TState = unknown> {
  readonly logId: string
  readonly state: SharedLogState<TState>
  private readonly store: LogStore
  private readonly fold: FoldOptions<TState>
  private readonly versions: CheckpointVersions
  private readonly metadata: MetadataStore | undefined
  private readonly coalesceMs: number
  private readonly onIdle: () => void
  private readonly failureListeners = new Set<(error: unknown) => void>()
  /** Events and host records that wait for the next append. */
  private readonly pending: Array<LogRecord> = []
  /** The merge key of the last pending record, when it is a delta event. */
  private pendingKey: string | undefined
  /** Host records that wait for the next transcript commit, by thread. */
  private readonly staged = new Map<string, Array<LogRecord>>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private scheduled = false
  private chain: Promise<void> = Promise.resolve()
  private failure: unknown
  private readonly tail: Array<{ thread: string; entry: SessionEvent }> = []
  /** Every event after this position is in `tail`. */
  private tailFrom: number
  private readonly waiters = new Set<() => void>()
  /** The threads with an open view. */
  private readonly threads = new Set<string>()
  private idle = false
  private writing = false
  private hasWritten = false
  private writesSinceCheckpoint = 0
  private readonly unsubscribe: () => void

  constructor(options: {
    store: LogStore
    logId: string
    state: SharedLogState<TState>
    coalesceMs: number
    project?: ProjectOptions
    reduce?: ReduceOptions<TState>
    metadata?: MetadataStore
    /** Called when the last session closes, or when a write fails. */
    onIdle?: () => void
  }) {
    this.store = options.store
    this.logId = options.logId
    this.state = options.state
    this.metadata = options.metadata
    this.coalesceMs = options.coalesceMs
    this.onIdle = options.onIdle ?? (() => {})
    this.fold = {
      logId: options.logId,
      ...(options.project ? { project: options.project.record } : {}),
      ...(options.reduce ? { reduce: options.reduce } : {}),
    }
    this.versions = versionsOf(options.project, options.reduce)
    this.tailFrom = options.state.seq
    // Records from another writer (this host only reads) join the fold. A
    // call during this writer's own append is its own records.
    this.unsubscribe = options.store.subscribe(options.logId, () => {
      if (!this.writing) void this.enqueue(() => this.catchUp())
    })
  }

  /**
   * False after the last view closed or a write failed. The host then opens
   * a new log.
   */
  get isOpen() {
    return !this.idle
  }

  /** The view of session `threadId`. Close it when the session closes. */
  view(threadId: string, onFailure: (error: unknown) => void): LogWriter {
    if (this.idle) {
      throw new Error(`The log ${JSON.stringify(this.logId)} is closed.`)
    }
    if (this.threads.has(threadId)) {
      throw new Error(
        `The thread ${JSON.stringify(threadId)} already has an open session on this log. Two harnesses cannot open one thread on a durable host.`,
      )
    }
    this.threads.add(threadId)
    // Its own function, so two views with the same `onFailure` both count.
    const listener = (error: unknown) => onFailure(error)
    this.failureListeners.add(listener)
    const shared = this.state
    let closed = false
    return {
      threadId,
      logId: this.logId,
      get state() {
        return sessionOf(shared, threadId)
      },
      publish: (operationId, event) =>
        this.publish(threadId, operationId, event),
      append: (records) => this.append(threadId, records),
      stage: (records) => this.stage(threadId, records),
      commit: (options) => this.commit(threadId, options),
      flush: () => this.flush(),
      head: () => this.head(),
      read: (options) =>
        this.read(threadId, { ...options, isClosed: () => closed }),
      close: () => {
        if (closed) return
        closed = true
        this.release(threadId, listener)
      },
    }
  }

  private release(threadId: string, listener: (error: unknown) => void) {
    this.failureListeners.delete(listener)
    this.threads.delete(threadId)
    // Like a crash: the records of a cut tool batch do not land later.
    this.staged.delete(threadId)
    void this.flush().catch(() => {})
    // The readers of the closed view end. The others wait again.
    this.wake()
    if (this.threads.size > 0) return
    this.idle = true
    this.unsubscribe()
    this.onIdle()
  }

  /** Stamp a record with its session, unless it names one or the session is the log's own. */
  private stamp(record: LogRecord, thread: string): LogRecord {
    if (typeof record.thread === 'string' || thread === this.logId) {
      return record
    }
    return { ...record, thread }
  }

  // ===========================
  // Writes
  // ===========================

  private publish(thread: string, operationId: string, event: StreamChunk) {
    const normalized = normalize(event)
    const key = deltaKey(thread, operationId, normalized)
    const last = this.pending.at(-1)
    const isSameDelta =
      key !== undefined &&
      key === this.pendingKey &&
      last !== undefined &&
      isHarnessRecord(last) &&
      last.type === 'harness.event'
    if (isSameDelta) last.event = mergeDelta(last.event, normalized)
    else {
      this.pending.push(
        this.stamp(
          { type: 'harness.event', operationId, event: normalized },
          thread,
        ),
      )
    }
    this.pendingKey = key
    if (key === undefined) {
      void this.flush().catch(() => {})
      return
    }
    this.schedule()
  }

  private append(thread: string, records: ReadonlyArray<LogRecord>) {
    this.pending.push(
      ...records.map((record) => normalize(this.stamp(record, thread))),
    )
    this.pendingKey = undefined
    return this.flush()
  }

  private stage(thread: string, records: ReadonlyArray<LogRecord>) {
    const staged = this.staged.get(thread) ?? []
    staged.push(
      ...records.map((record) => normalize(this.stamp(record, thread))),
    )
    this.staged.set(thread, staged)
  }

  private commit(
    thread: string,
    options: {
      messages: ReadonlyArray<ModelMessage>
      records?: ReadonlyArray<LogRecord>
    },
  ) {
    const events = this.takePending()
    const staged = this.staged.get(thread)?.splice(0) ?? []
    const records = (options.records ?? []).map((record) =>
      normalize(this.stamp(record, thread)),
    )
    return this.enqueue(() =>
      this.write([
        ...events,
        ...transcriptRecord(
          sessionOf(this.state, thread).messages,
          options.messages,
        ).map((record) => this.stamp(record, thread)),
        ...staged,
        ...records,
      ]),
    )
  }

  /** Append the pending events now. */
  flush(): Promise<void> {
    const batch = this.takePending()
    return this.enqueue(() => this.write(batch))
  }

  private takePending() {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    this.scheduled = false
    this.pendingKey = undefined
    return this.pending.splice(0)
  }

  private schedule() {
    if (this.scheduled) return
    this.scheduled = true
    if (this.coalesceMs <= 0) {
      queueMicrotask(() => void this.flush().catch(() => {}))
      return
    }
    this.timer = setTimeout(
      () => void this.flush().catch(() => {}),
      this.coalesceMs,
    )
    // A coalescing timer must not keep a CLI or a test process alive.
    if (typeof this.timer === 'object' && 'unref' in this.timer) {
      this.timer.unref()
    }
  }

  private enqueue(task: () => Promise<void>) {
    const run = this.chain.then(task)
    this.chain = run.catch(() => {})
    return run
  }

  private async write(batch: ReadonlyArray<LogRecord>) {
    if (this.failure !== undefined) throw this.failure
    if (batch.length === 0) return
    const seq = this.state.seq + 1
    this.writing = true
    try {
      await this.appendOnce(seq, batch)
    } catch (error) {
      this.fail(error)
      throw error
    } finally {
      this.writing = false
    }
    batch.forEach((record, index) => this.apply({ seq: seq + index, record }))
    this.hasWritten = true
    this.writesSinceCheckpoint += 1
    if (this.writesSinceCheckpoint >= CHECKPOINT_EVERY) {
      this.writesSinceCheckpoint = 0
      // A lost checkpoint only makes the next cold fold longer.
      void this.metadata
        ?.set(
          CHECKPOINT_NAMESPACE,
          this.logId,
          normalize(serialize(this.state, this.versions)),
        )
        .catch(() => {})
    }
    this.wake()
  }

  /** Stop every session of the log. The host drops it, so the next open folds again. */
  private fail(error: unknown) {
    this.failure = error
    this.idle = true
    for (const listener of [...this.failureListeners]) listener(error)
    this.onIdle()
  }

  /**
   * Append once. After an error, read back: the batch may have landed before
   * the error. When it did not land, a conflict fails at once, and another
   * error gets one more try.
   */
  private async appendOnce(seq: number, batch: ReadonlyArray<LogRecord>) {
    try {
      await this.store.append(this.logId, seq, batch)
      return
    } catch (error) {
      if (await this.landed(seq, batch)) return
      if (error instanceof LogConflictError) throw error
    }
    try {
      await this.store.append(this.logId, seq, batch)
    } catch (error) {
      if (await this.landed(seq, batch)) return
      throw error
    }
  }

  private async landed(seq: number, batch: ReadonlyArray<LogRecord>) {
    try {
      const entries = await this.store.read(this.logId, {
        after: seq - 1,
        limit: batch.length,
      })
      return (
        entries.length === batch.length &&
        entries.every((entry, index) => sameJson(entry.record, batch[index]))
      )
    } catch {
      return false
    }
  }

  /**
   * Fold records that another writer appended. A host that only reads
   * follows the log. A writer that already wrote has lost the thread to
   * another host, so it stops, as after a conflict.
   */
  private async catchUp() {
    if (this.failure !== undefined) return
    const entries = await this.store.read(this.logId, {
      after: this.state.seq,
    })
    const [first] = entries
    if (first && this.hasWritten) {
      this.fail(new LogConflictError(this.logId, first.seq))
      return
    }
    for (const entry of entries) this.apply(entry)
    if (entries.length > 0) this.wake()
  }

  private apply(entry: LogEntry) {
    foldLogEntry(this.state, entry, this.fold)
    const event = sessionEventOf(entry)
    if (!event) return
    this.tail.push({ thread: threadOf(entry.record, this.logId), entry: event })
    if (this.tail.length > MAX_TAIL) {
      const dropped = this.tail.shift()
      if (dropped) this.tailFrom = Number(dropped.entry.cursor)
    }
  }

  // ===========================
  // Reads
  // ===========================

  head(): Cursor {
    return String(this.state.seq)
  }

  /** The events of session `thread`. A cursor is a position in the log. */
  private async *read(
    thread: string,
    options: {
      from?: Cursor
      signal?: AbortSignal
      filter?: (entry: SessionEvent) => boolean
      until?: () => boolean
      isClosed: () => boolean
    },
  ): AsyncIterable<SessionEvent> {
    const { signal, filter, until, isClosed } = options
    const accepts = (entry: SessionEvent) => (filter ? filter(entry) : true)
    /** The events of this session in the tail after `after`. */
    const ownAfter = (after: number) =>
      this.tail
        .filter((item) => item.thread === thread)
        .map((item) => item.entry)
        .filter((entry) => Number(entry.cursor) > after && accepts(entry))
    let after = Number(options.from ?? '0')
    if (!Number.isFinite(after)) after = 0
    for (;;) {
      if (signal?.aborted) return
      if (after < this.tailFrom) {
        // Older than the in-memory tail: page it from the store.
        const upTo = this.tailFrom
        const page = await this.store.read(this.logId, {
          after,
          limit: READ_PAGE,
        })
        for (const entry of page) {
          if (entry.seq > upTo || signal?.aborted) break
          after = entry.seq
          const event = sessionEventOf(entry)
          const isOwn = threadOf(entry.record, this.logId) === thread
          if (event && isOwn && accepts(event)) yield event
        }
        if (page.length === 0) after = upTo
        continue
      }
      const next = ownAfter(after)
      for (const entry of next) {
        if (signal?.aborted) return
        after = Number(entry.cursor)
        yield entry
      }
      // Skip past records that are not this session's events, or that the
      // filter rejected.
      if (next.length === 0) after = Math.max(after, this.state.seq)
      if (isClosed() || until?.()) {
        yield* ownAfter(after)
        return
      }
      // A write while the reader handled `next` woke nobody: scan again.
      if (next.length > 0) continue
      await this.waitForNext(signal)
    }
  }

  private wake() {
    const waiters = [...this.waiters]
    this.waiters.clear()
    for (const wake of waiters) wake()
  }

  private waitForNext(signal?: AbortSignal) {
    return new Promise<void>((resolve) => {
      if (signal?.aborted) return resolve()
      const done = () => {
        signal?.removeEventListener('abort', done)
        this.waiters.delete(done)
        resolve()
      }
      this.waiters.add(done)
      signal?.addEventListener('abort', done, { once: true })
    })
  }
}

/** Join two adjacent deltas of one message or tool call. */
function mergeDelta(first: StreamChunk, second: StreamChunk): StreamChunk {
  const rest =
    'delta' in second && typeof second.delta === 'string'
      ? second.delta
      : undefined
  if (rest === undefined) return second
  if (
    first.type === EventType.TEXT_MESSAGE_CONTENT ||
    first.type === EventType.REASONING_MESSAGE_CONTENT ||
    first.type === EventType.TOOL_CALL_ARGS
  ) {
    return { ...first, delta: first.delta + rest, timestamp: second.timestamp }
  }
  return second
}

function sessionEventOf(entry: LogEntry) {
  const { record } = entry
  if (!isHarnessRecord(record) || record.type !== 'harness.event') {
    return undefined
  }
  const event: SessionEvent = {
    cursor: String(entry.seq),
    operationId: record.operationId,
    event: record.event,
  }
  return event
}

/**
 * The `MessageStore` a durable session gives `withPersistence`. Its own
 * thread goes through the session's writer. Another thread (a subagent
 * transcript) reads and appends that thread's log directly.
 */
export function sessionMessageStore(options: {
  writer: LogWriter
  store: LogStore
  project?: ProjectOptions
}) {
  const { writer } = options
  const other = logMessageStore({
    store: options.store,
    ...(options.project ? { project: options.project } : {}),
  })
  const messages: MessageStore = {
    loadThread: async (threadId: string) =>
      threadId === writer.threadId
        ? [...writer.state.messages]
        : other.loadThread(threadId),
    saveThread: (threadId, list) =>
      threadId === writer.threadId
        ? writer.commit({ messages: list })
        : other.saveThread(threadId, list),
  }
  return messages
}

/**
 * The `MessageStore` the chat engine of a durable session saves through
 * (`withPersistence` and the checkpoints). It remembers the list the engine
 * holds. A host record can change the fold while the engine runs, and the
 * engine does not see that until its next model call. So a save that only
 * adds messages to what the engine holds puts them on top of the current
 * fold, and a projected message is not lost. `beforeModel` commits the
 * engine's list and gives the model the fold, so the two are the same at
 * every model call.
 */
export function engineMessageStore(options: {
  writer: LogWriter
  store: LogStore
  project?: ProjectOptions
}) {
  const { writer } = options
  const shared = sessionMessageStore(options)
  const fold = () => [...writer.state.messages]
  let held = fold()
  /**
   * What to write for an engine save of `list`, when the engine held `base`:
   *
   * - The fold only added host messages after `base`: the engine's new
   *   messages go first, then the host messages. So a signal never lands
   *   between a tool call and its result.
   * - A host record rewrote the fold (a compaction): the engine's new
   *   messages go after the rewritten fold.
   * - The engine changed older messages itself (a compaction middleware):
   *   `list` wins.
   */
  const rebase = (base: Array<ModelMessage>, list: Array<ModelMessage>) => {
    const current = writer.state.messages
    const isEngineExtension = commonPrefix(base, list) === base.length
    if (!isEngineExtension) return list
    const added = list.slice(base.length)
    const isFoldExtension = commonPrefix(base, current) === base.length
    return isFoldExtension
      ? [...base, ...added, ...current.slice(base.length)]
      : [...current, ...added]
  }
  const engine = {
    loadThread: async (threadId: string) => {
      if (threadId !== writer.threadId) return shared.loadThread(threadId)
      held = fold()
      return [...held]
    },
    saveThread: (threadId: string, list: Array<ModelMessage>) => {
      if (threadId !== writer.threadId) return shared.saveThread(threadId, list)
      const target = rebase(held, list)
      held = [...list]
      return writer.commit({ messages: target })
    },
    /**
     * Before each model call: commit the engine's `list` (it has the tool
     * results of the last phase) on top of the fold, with `records` in the
     * same append. Returns the list the model gets when a host record
     * changed it, else `undefined`.
     */
    beforeModel: async (
      list: ReadonlyArray<ModelMessage>,
      records: ReadonlyArray<LogRecord> = [],
    ) => {
      const target = rebase(held, [...list])
      held = [...target]
      await writer.commit({ messages: target, records })
      const isSame =
        target.length === list.length &&
        commonPrefix(target, list) === list.length
      return isSame ? undefined : [...target]
    },
  } satisfies MessageStore & {
    beforeModel: (
      list: ReadonlyArray<ModelMessage>,
      records?: ReadonlyArray<LogRecord>,
    ) => Promise<Array<ModelMessage> | undefined>
  }
  return engine
}

/**
 * A `MessageStore` view of a session log, for a reader outside a session
 * (for example `reconstructChat`). `loadThread` folds the log. `saveThread`
 * appends the change as one transcript record.
 *
 * @example
 * ```ts
 * reconstructChat({ persistence: { stores: { messages: logMessageStore({ store: log }) } }, ... })
 * ```
 */
export function logMessageStore(options: {
  store: LogStore
  project?: ProjectOptions
  /** Read the threads of this log. Default: each thread is its own log. */
  logId?: string
}) {
  const { store, project } = options
  const logOf = (threadId: string) => options.logId ?? threadId
  const load = (threadId: string) =>
    loadLogState({
      store,
      logId: logOf(threadId),
      ...(project ? { project } : {}),
    })
  const messages: MessageStore = {
    loadThread: async (threadId: string) =>
      sessionOf(await load(threadId), threadId).messages,
    saveThread: async (threadId, list) => {
      // ponytail: one retry after a conflict. The loser of a real race
      // reloads, so a second conflict is an error.
      for (let attempt = 1; ; attempt += 1) {
        const state = await load(threadId)
        const records = transcriptRecord(
          sessionOf(state, threadId).messages,
          list,
        ).map((record) =>
          logOf(threadId) === threadId
            ? record
            : { ...record, thread: threadId },
        )
        if (records.length === 0) return
        try {
          await store.append(logOf(threadId), state.seq + 1, records)
          return
        } catch (error) {
          if (!(error instanceof LogConflictError) || attempt === 2) throw error
        }
      }
    },
  }
  return messages
}
