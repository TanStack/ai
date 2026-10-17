import { EventType } from '@tanstack/ai'
import {
  LogConflictError,
  LogTruncatedError,
  OwnershipLostError,
  UNOWNED_EPOCH,
} from '@tanstack/ai-persistence'
import { gapEvent } from './feed'
import { LogOwnedElsewhereError } from './ownership'
import { HARNESS_EVENTS } from './types'
import {
  THREAD_RECORD_TYPES,
  emptyThreadState,
  foldThreadRecord,
} from './log-records'
import { addUsage, emptyUsage, isSessionUsage } from './usage'
import { isRecord } from './utils'
import type { ModelMessage, StreamChunk } from '@tanstack/ai'
import type {
  InterruptRecord,
  LogEntry,
  LogRecord,
  LogSnapshot,
  LogStore,
  MessageStore,
  OfferResult,
  OfferedInput,
  RunRecord,
} from '@tanstack/ai-persistence'
import type { AccessRun } from './access'
import type { EventFeed } from './feed'
import type { HostOwnership } from './ownership'
import type {
  AgentResultRecord,
  InterruptedTurnRecord,
  NamedTurnOverrides,
  ScheduleRecord,
  ThreadRecord,
  ThreadStateFold,
} from './log-records'
import type {
  Cursor,
  HarnessInput,
  InputSettlement,
  SettlementOutcome,
  SessionEvent,
  ThreadSettings,
  WaitingInput,
} from './types'
import type { SessionUsage, UsageCall } from './usage'

/** The records the harness writes to a session log. */
export type HarnessRecord =
  | { type: 'harness.event'; operationId: string; event: StreamChunk }
  | { type: 'harness.transcript'; keep: number; add: Array<ModelMessage> }
  | {
      type: 'harness.input'
      inputId: string
      input: HarnessInput
      principal?: { id: string; tenantId?: string }
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
      type: 'harness.turn.retry'
      inputId: string
      operationId: string
      retries: number
    }
  | {
      type: 'harness.input.delivery'
      inputId: string
      delivery: WaitingInput['delivery']
    }
  | ({
      type: 'harness.input.settled'
      inputId: string
      operationId?: string
    } & SettlementOutcome)
  | { type: 'harness.tool.result'; toolCallId: string; message: ModelMessage }
  | {
      type: 'harness.tool.started'
      toolCallId: string
      name: string
      replay: 'safe' | 'never'
    }
  | {
      type: 'harness.tool.step'
      toolCallId: string
      name: string
      value: unknown
    }
  | ({ type: 'harness.usage' } & UsageCall)
  /** A revert that stands, or `null` when it ended. */
  | { type: 'harness.revert'; revert: RevertState | null }
  /** A background job started, or it ended. */
  | { type: 'harness.job'; jobId: string; ended: boolean }
  /** A note for the transcript. `noteId` is the id of its message. */
  | { type: 'harness.note'; noteId: string; note: string }
  /** Thread state: settings, config, plugin state, and the rest. */
  | ThreadRecord

/**
 * A revert that stands: the transcript hides the messages after
 * `messageId`. `files` is what the snapshots plugin needs to put the files
 * back, when it changed files.
 */
export interface RevertState {
  messageId: string
  files?: unknown
}

/** The {@link RevertState} in `value`, or `undefined` when it is not one. */
export function revertOf(value: unknown): RevertState | undefined {
  if (!isRecord(value) || typeof value.messageId !== 'string') return undefined
  return {
    messageId: value.messageId,
    ...(value.files !== undefined ? { files: value.files } : {}),
  }
}

/**
 * The messages that the transcript shows: while `revert` stands, the
 * messages after its message are hidden.
 */
export function visibleMessages(
  messages: ReadonlyArray<ModelMessage>,
  revert: RevertState | undefined,
) {
  const at =
    revert === undefined
      ? -1
      : messages.findIndex((message) => message.id === revert.messageId)
  return at < 0 ? [...messages] : messages.slice(0, at + 1)
}

const HARNESS_RECORD_TYPES = new Set<string>([
  'harness.event',
  'harness.transcript',
  'harness.input',
  'harness.input.applied',
  'harness.input.joined',
  'harness.input.rejected',
  'harness.input.abort',
  'harness.turn.retry',
  'harness.input.delivery',
  'harness.input.settled',
  'harness.tool.result',
  'harness.tool.started',
  'harness.tool.step',
  'harness.usage',
  'harness.revert',
  'harness.job',
  'harness.note',
  ...THREAD_RECORD_TYPES,
])

/**
 * The error a host gets when it writes a log that has a `harness.*` record
 * type it does not know: a newer harness wrote it, for example during a
 * rolling deploy. The host can read the log, but a write on a fold that
 * skipped a record could be wrong, so it stops. Deploy the newer version.
 *
 * So a change to what a record means takes a new record type, never a new
 * shape of an old type.
 */
export class LogVersionError extends Error {
  readonly logId: string
  readonly recordType: string
  constructor(logId: string, recordType: string) {
    super(
      `Log ${logId} has a "${recordType}" record from a newer harness. This host does not write it.`,
    )
    this.name = 'LogVersionError'
    this.logId = logId
    this.recordType = recordType
  }
}

// The harness wrote every record of these types, so the fields are its own.
function isHarnessRecord(record: LogRecord): record is HarnessRecord {
  return HARNESS_RECORD_TYPES.has(record.type)
}

/** The id of the call that a `harness.tool.result` answers, as the model knows it. */
function resultCallOf(record: LogRecord) {
  if (!isHarnessRecord(record) || record.type !== 'harness.tool.result') {
    return undefined
  }
  // An agent run keys its result by run. The message has the call's own id.
  return record.message.role === 'tool' ? record.message.toolCallId : undefined
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
   * The version of `record`. A fold snapshot with another version is
   * ignored, so a change to `record` never reads an old fold.
   */
  version?: string
}

/** What the log knows about one input. */
export interface InputState {
  inputId: string
  input: HarnessInput
  principal?: { id: string; tenantId?: string }
  at: number
  status: 'pending' | 'applied' | 'joined' | 'rejected' | 'settled'
  operationId?: string
  attempt: number
  timeoutAt?: number
  /** The host input that this input joined. */
  into?: string
  abortRequested: boolean
  /** Model retries since the last finished tool phase. Recovery starts from it. */
  retries?: number
  /** The delivery that a `setDelivery` input set. Recovery honors it. */
  delivery?: WaitingInput['delivery']
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
  /**
   * The position of the last transcript record. The events after it are not
   * in the transcript. Unknown after a fold snapshot with no value for this field.
   */
  transcriptSeq?: number
  /** In admission order. */
  inputs: Map<string, InputState>
  toolResults: Map<string, ModelMessage>
  /** Tool calls that started, by toolCallId. Batch repair reads them. */
  started: Map<string, { name: string; replay: 'safe' | 'never' }>
  /** By {@link stepKey}. */
  steps: Map<string, unknown>
  /** The usage of every model call of the thread. */
  usage: SessionUsage
  /** The revert that stands, if any. */
  revert?: RevertState
  /** Background jobs that started and did not end. */
  jobs: Set<string>
  /** Notes that are not in the transcript yet, by message id. */
  notes: Map<string, string>
  /** The thread state that the thread-state records fold to. */
  thread: ThreadStateFold
}

export function emptyLogState() {
  const state: LogState = {
    seq: 0,
    messages: [],
    transcriptSeq: 0,
    inputs: new Map(),
    toolResults: new Map(),
    started: new Map(),
    steps: new Map(),
    usage: emptyUsage(),
    jobs: new Set(),
    notes: new Map(),
    thread: emptyThreadState(),
  }
  return state
}

export const stepKey = (toolCallId: string, name: string) =>
  `${toolCallId}\u0000${name}`

/** A JSON copy: what a store gives back for `record`. */
const normalize = <T>(value: T) => JSON.parse(JSON.stringify(value)) as T

const sameJson = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right)

/** JSON text with sorted object keys. A store (jsonb) can reorder keys. */
export const stableJson = (value: unknown) =>
  JSON.stringify(value, (_key, item: unknown) =>
    isRecord(item) && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : item,
  )

/**
 * Run a host fold (`project` or `reduce`). One that throws skips its record
 * with a warning. The record is in the log already, so failing here would
 * fail every later open of the log too. A pure fold skips the same record
 * live and on each reopen.
 */
function hostFold<T>(seq: number, fold: () => T, unchanged: T): T {
  try {
    return fold()
  } catch (error) {
    console.warn(
      `The fold of log record ${seq} threw, so the fold skips it.`,
      error,
    )
    return unchanged
  }
}

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

/** Drop the stored result, start, and steps of each call that `isDone`. */
function forgetCalls(state: LogState, isDone: (toolCallId: string) => boolean) {
  for (const toolCallId of state.toolResults.keys()) {
    if (isDone(toolCallId)) state.toolResults.delete(toolCallId)
  }
  for (const toolCallId of state.started.keys()) {
    if (isDone(toolCallId)) state.started.delete(toolCallId)
  }
  for (const key of state.steps.keys()) {
    if (isDone(key.slice(0, key.indexOf('\u0000')))) state.steps.delete(key)
  }
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
    const next = project
      ? hostFold(
          entry.seq,
          () => project({ messages: state.messages, record }),
          undefined,
        )
      : undefined
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
      state.transcriptSeq = entry.seq
      for (const message of record.add) {
        if (message.id) state.notes.delete(message.id)
      }
      // A call with its result in the transcript never runs again, so its
      // stored result, start, and steps are not needed any more.
      forgetCalls(state, (toolCallId) =>
        record.add.some(
          (message) =>
            message.role === 'tool' && message.toolCallId === toolCallId,
        ),
      )
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
    case 'harness.turn.retry':
      updateInput(state, record.inputId, (input) => ({
        ...input,
        retries: record.retries,
      }))
      return
    case 'harness.input.delivery':
      updateInput(state, record.inputId, (input) => ({
        ...input,
        delivery: record.delivery,
      }))
      return
    case 'harness.input.settled': {
      // An agent run keeps its calls under `agent:<inputId>` (agentKey). A
      // settled run never resumes. ponytail: agent runs `x` and `x:y` share
      // this prefix, so the settle of `x` also drops what `x:y` stored.
      // Generated input ids have no colon.
      const key = `agent:${record.inputId}`
      forgetCalls(
        state,
        (toolCallId) => toolCallId === key || toolCallId.startsWith(`${key}:`),
      )
      updateInput(state, record.inputId, (input) => ({
        ...input,
        status: 'settled',
        settlement: {
          inputId: record.inputId,
          ...(record.operationId ? { operationId: record.operationId } : {}),
          ...(record.outcome === 'failed'
            ? { outcome: 'failed', error: record.error }
            : { outcome: record.outcome }),
        },
      }))
      return
    }
    case 'harness.tool.result':
      state.toolResults.set(record.toolCallId, record.message)
      return
    case 'harness.tool.started':
      state.started.set(record.toolCallId, {
        name: record.name,
        replay: record.replay,
      })
      return
    case 'harness.tool.step':
      state.steps.set(stepKey(record.toolCallId, record.name), record.value)
      return
    case 'harness.usage':
      addUsage(state.usage, record)
      return
    case 'harness.revert':
      if (record.revert) state.revert = record.revert
      else delete state.revert
      return
    case 'harness.job':
      if (record.ended) state.jobs.delete(record.jobId)
      else state.jobs.add(record.jobId)
      return
    case 'harness.note':
      state.notes.set(record.noteId, record.note)
      return
    case 'harness.settings':
    case 'harness.config':
    case 'harness.plugin.state':
    case 'harness.interrupted':
    case 'harness.agent.result':
    case 'harness.input.turn':
    case 'harness.schedule':
    case 'harness.schedule.done':
    case 'harness.run':
    case 'harness.run.update':
    case 'harness.interrupt':
    case 'harness.interrupt.end':
      state.thread = foldThreadRecord(state.thread, record)
      return
  }
}

/** A fold of every host record of a log, across its sessions, in log order. */
export interface ReduceOptions<TState> {
  /** The state of an empty log. JSON. */
  initial: TState
  /** Pure. Return the next state, or the same state for no change. */
  record: (args: { state: TState; record: LogRecord }) => TState
  /** A fold snapshot with another version is ignored. */
  version?: string
}

/** The fold of a whole log: one state per session, and the reduce state. */
export interface SharedLogState<TState = unknown> {
  /** The position of the last folded record. */
  seq: number
  /** By thread id. */
  sessions: Map<string, LogState>
  reduced: TState | undefined
  /** The position of the snapshot that the fold started from. */
  snapshotSeq?: number
  /** The first `harness.*` record type of the log that this version does not know. */
  newerRecord?: string
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

/**
 * The id of a log in the `LogStore`: the tenant and the log id, each
 * URL-encoded, with a `:` between them. Without `tenantId`, the log is in the
 * default tenant. So one log id in two tenants is two logs. `logId` is the
 * thread id of the root session: one log keeps the root and all of its child
 * threads (agent chains and subagent runs).
 *
 * The other stores that the harness keys by thread (metadata and media) use
 * the same key, with the thread id as `logId`.
 *
 * @example
 * ```ts
 * const entries = await log.read({ logId: logIdOf({ tenantId: 'org-1', logId: threadId }) })
 * ```
 */
export function logIdOf({
  tenantId,
  logId,
}: {
  tenantId?: string
  logId: string
}) {
  return `${encodeURIComponent(tenantId ?? '')}:${encodeURIComponent(logId)}`
}

/**
 * The tenant and the log id of a store id from {@link logIdOf}. The first
 * `:` splits them. An empty tenant is the default tenant: no `tenantId`.
 */
export function parseLogId(id: string) {
  const at = id.indexOf(':')
  const tenantId = decodeURIComponent(id.slice(0, Math.max(at, 0)))
  const logId = decodeURIComponent(id.slice(at + 1))
  return tenantId === '' ? { logId } : { tenantId, logId }
}

/**
 * The session of a record: its `thread`, or the root thread of the log. The
 * root thread is the thread whose id is the log id (see {@link logIdOf}).
 */
export const threadOf = (record: LogRecord, rootThread: string) =>
  typeof record.thread === 'string' ? record.thread : rootThread

interface FoldOptions<TState> {
  /** The thread of the records that have no `thread` field. */
  rootThread: string
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
  if (record.type.startsWith('harness.') && !isHarnessRecord(record)) {
    state.newerRecord ??= record.type
  }
  if (reduce && !record.type.startsWith('harness.')) {
    const current = state.reduced ?? reduce.initial
    state.reduced = hostFold(
      entry.seq,
      () => reduce.record({ state: current, record }),
      current,
    )
  }
  foldEntry(
    sessionOf(state, threadOf(record, options.rootThread)),
    entry,
    options.project,
  )
}

const READ_PAGE = 500

/** The default bytes of new records (their JSON length) after which the owner writes a snapshot. */
export const SNAPSHOT_AFTER_BYTES = 1_000_000
/** The default milliseconds after the first record with no snapshot, after which the owner writes one. */
export const SNAPSHOT_AFTER_MS = 300_000

/** When the owner of a log writes a snapshot: at the first limit it meets. */
export interface SnapshotTiming {
  /** Default {@link SNAPSHOT_AFTER_BYTES}. */
  afterBytes?: number
  /** Default {@link SNAPSHOT_AFTER_MS}. */
  afterMs?: number
}

/**
 * Which records a log keeps. `'all'` keeps every record. `'since-snapshot'`
 * drops the records before each new snapshot.
 */
export type LogRecordRetention = 'all' | 'since-snapshot'

interface SnapshotVersions {
  version?: string
  reduceVersion?: string
}

/**
 * The version of the snapshot state shape. A snapshot of another version is
 * not used: the fold starts at the first record. Version 4 was the metadata
 * checkpoint, which a host does not read any more.
 */
export const SNAPSHOT_VERSION = '5'

/** The thread state of a session as JSON: each map as its entries. */
function serializeThread(thread: ThreadStateFold) {
  return {
    settings: thread.settings,
    config: [...thread.config],
    plugins: [...thread.plugins],
    interrupted: thread.interrupted,
    agentResults: [...thread.agentResults],
    turnOverrides: [...thread.turnOverrides],
    schedules: [...thread.schedules],
    runs: [...thread.runs],
    interrupts: [...thread.interrupts],
  }
}

/** The thread state of a snapshot, or `undefined` when it is not shaped. */
function parseThread(value: unknown) {
  if (!isRecord(value) || !isRecord(value.settings)) return undefined
  const { config, plugins, agentResults, turnOverrides, schedules } = value
  const { runs, interrupts } = value
  const isShaped =
    Array.isArray(config) &&
    Array.isArray(plugins) &&
    Array.isArray(agentResults) &&
    Array.isArray(turnOverrides) &&
    Array.isArray(schedules) &&
    Array.isArray(runs) &&
    Array.isArray(interrupts)
  if (!isShaped) return undefined
  // The harness wrote these values with `serializeThread`.
  const thread: ThreadStateFold = {
    settings: value.settings as ThreadSettings,
    config: new Map(config as Array<[string, unknown]>),
    plugins: new Map(plugins as Array<[string, unknown]>),
    interrupted: (value.interrupted ?? null) as InterruptedTurnRecord | null,
    agentResults: new Map(agentResults as Array<[string, AgentResultRecord]>),
    turnOverrides: new Map(
      turnOverrides as Array<[string, NamedTurnOverrides]>,
    ),
    schedules: new Map(schedules as Array<[string, ScheduleRecord]>),
    runs: new Map(runs as Array<[string, RunRecord]>),
    interrupts: new Map(interrupts as Array<[string, InterruptRecord]>),
  }
  return thread
}

/** The state of a snapshot of `state`. Its position is `state.seq`. */
function serialize(state: SharedLogState, versions: SnapshotVersions) {
  return {
    ...versions,
    // A host that does not know one of these types folds from the start.
    recordTypes: [...HARNESS_RECORD_TYPES],
    sessions: [...state.sessions].map(([thread, session]) => [
      thread,
      {
        messages: session.messages,
        transcriptSeq: session.transcriptSeq,
        inputs: [...session.inputs.values()],
        toolResults: [...session.toolResults.entries()],
        started: [...session.started.entries()],
        steps: [...session.steps.entries()],
        usage: session.usage,
        revert: session.revert ?? null,
        jobs: [...session.jobs],
        notes: [...session.notes.entries()],
        thread: serializeThread(session.thread),
      },
    ]),
    reduced: state.reduced ?? null,
  }
}

/** One session of a snapshot at `seq`, or `undefined` when it is not shaped. */
function parseSession(value: unknown, seq: number) {
  if (!isRecord(value)) return undefined
  const { messages, inputs, toolResults, steps } = value
  const isShaped =
    Array.isArray(messages) &&
    Array.isArray(inputs) &&
    Array.isArray(toolResults) &&
    Array.isArray(steps)
  const thread = parseThread(value.thread)
  if (!isShaped || !thread) return undefined
  const revert = revertOf(value.revert)
  // The harness wrote these arrays with `serialize`.
  const session: LogState = {
    seq,
    messages: (messages as Array<ModelMessage>).map(revive),
    // A state with no `transcriptSeq` gets an empty value.
    ...(typeof value.transcriptSeq === 'number'
      ? { transcriptSeq: value.transcriptSeq }
      : {}),
    inputs: new Map(
      (inputs as Array<InputState>).map((input) => [input.inputId, input]),
    ),
    toolResults: new Map(toolResults as Array<[string, ModelMessage]>),
    // A state with no `started` gets an empty value.
    started: new Map(
      Array.isArray(value.started)
        ? (value.started as Array<
            [string, { name: string; replay: 'safe' | 'never' }]
          >)
        : [],
    ),
    steps: new Map(steps as Array<[string, unknown]>),
    // A state with no usage totals gets an empty value.
    usage: isSessionUsage(value.usage) ? value.usage : emptyUsage(),
    // A state with no reverts gets an empty value.
    ...(revert ? { revert } : {}),
    // A state with no jobs and notes gets an empty value.
    jobs: new Set(
      Array.isArray(value.jobs) ? (value.jobs as Array<string>) : [],
    ),
    notes: new Map(
      Array.isArray(value.notes)
        ? (value.notes as Array<[string, string]>)
        : [],
    ),
    thread,
  }
  return session
}

/** The fold of a snapshot that the harness wrote with `versions`, or `undefined`. */
function parseSnapshot<TState>(
  snapshot: LogSnapshot | null,
  versions: SnapshotVersions,
): SharedLogState<TState> | undefined {
  if (!snapshot || snapshot.version !== SNAPSHOT_VERSION) return undefined
  const { seq } = snapshot
  // A copy: the fold changes its state in place (usage totals), and a store
  // can hand back the object it holds.
  const value = isRecord(snapshot.state)
    ? normalize(snapshot.state)
    : snapshot.state
  if (!isRecord(value) || typeof seq !== 'number') return undefined
  if (
    value.version !== versions.version ||
    value.reduceVersion !== versions.reduceVersion ||
    !Array.isArray(value.sessions)
  ) {
    return undefined
  }
  // A newer harness folded record types this one would skip.
  if (
    Array.isArray(value.recordTypes) &&
    value.recordTypes.some((type) => !HARNESS_RECORD_TYPES.has(String(type)))
  ) {
    return undefined
  }
  const sessions = new Map<string, LogState>()
  for (const item of value.sessions) {
    if (!Array.isArray(item) || typeof item[0] !== 'string') return undefined
    const session = parseSession(item[1], seq)
    if (!session) return undefined
    sessions.set(item[0], session)
  }
  return {
    seq,
    snapshotSeq: seq,
    sessions,
    // The harness wrote this value with `serialize`, from `reduce`.
    reduced: (value.reduced ?? undefined) as TState | undefined,
  }
}

const versionsOf = (
  project: ProjectOptions | undefined,
  reduce: { version?: string } | undefined,
): SnapshotVersions => ({
  ...(project ? { version: project.version ?? '' } : {}),
  // A snapshot folded with reduce or project never loads without it, or the reverse.
  ...(reduce ? { reduceVersion: reduce.version ?? '' } : {}),
})

/**
 * Fold the log `logId`, the id in the store (see {@link logIdOf}). The
 * records with no `thread` field belong to `rootThread`. The fold starts
 * from the snapshot of the log when it is valid for these versions, and
 * reads only the records after it.
 *
 * When the snapshot is not valid and a truncate dropped the first records,
 * it rejects with `LogTruncatedError`.
 */
export async function loadLogState<TState = unknown>(options: {
  store: LogStore
  logId: string
  rootThread: string
  project?: ProjectOptions
  reduce?: ReduceOptions<TState>
}) {
  const { store, logId, rootThread, project, reduce } = options
  // A snapshot that does not load only makes the fold longer.
  const snapshot = await store.getSnapshot({ logId }).catch(() => null)
  const state =
    parseSnapshot<TState>(snapshot, versionsOf(project, reduce)) ??
    emptySharedLogState(reduce)
  const fold: FoldOptions<TState> = {
    rootThread,
    ...(project ? { project: project.record } : {}),
    ...(reduce ? { reduce } : {}),
  }
  await readAll(store, logId, state, (entry) =>
    foldLogEntry(state, entry, fold),
  )
  return state
}

/**
 * The run that `input` targets (an answer, a cancel, a `cancelInput`, a
 * resolve), and who started it, from the log `logId`: what the owner of the
 * log checks for a handle. The host that sends an input checks it with this
 * before the input goes to the owner. Who started a run does not change
 * once the run starts. `undefined`: the input targets no run. `null`: the
 * log does not have the run, or a cancel names no operation.
 */
// ponytail: this reads the whole log for each such input. Fold only the
// tail after a snapshot if a host sends many of them.
export async function loggedRunOf({
  store,
  logId,
  rootThread,
  input,
}: {
  store: LogStore
  logId: string
  rootThread: string
  input: HarnessInput
}): Promise<AccessRun | null | undefined> {
  if (
    input.op !== 'answer' &&
    input.op !== 'cancel' &&
    input.op !== 'cancelInput' &&
    input.op !== 'resolve'
  ) {
    return undefined
  }
  const state = emptySharedLogState()
  /** The operation of each question that the log asked, by question id. */
  const questions = new Map<string, string>()
  const fold = { rootThread }
  try {
    await readAll(store, logId, state, (entry) => {
      foldLogEntry(state, entry, fold)
      const { record } = entry
      if (!isHarnessRecord(record) || record.type !== 'harness.event') return
      const { event } = record
      const isQuestion =
        event.type === EventType.CUSTOM &&
        event.name === HARNESS_EVENTS.question &&
        isRecord(event.value) &&
        typeof event.value.questionId === 'string'
      if (isQuestion) questions.set(event.value.questionId, record.operationId)
    })
  } catch (error) {
    // A truncated log: the snapshot has the inputs, but no question.
    if (!(error instanceof LogTruncatedError)) throw error
    Object.assign(state, await loadLogState({ store, logId, rootThread }))
  }
  const root = sessionOf(state, rootThread)
  const inputs = [...state.sessions.values()].flatMap((session) => [
    ...session.inputs.values(),
  ])
  const by = (principal: { id: string } | undefined) =>
    principal ? { principalId: principal.id } : {}
  /** The operation `operationId`, and who sent the input that started it. */
  const startedBy = (operationId: string): AccessRun | null => {
    const first = inputs.find((logged) => logged.operationId === operationId)
    if (!first && !root.thread.runs.has(operationId)) return null
    return { runId: operationId, ...by(first?.principal) }
  }
  switch (input.op) {
    case 'answer': {
      const operationId = questions.get(input.questionId)
      if (operationId === undefined) return null
      // A question of the session belongs to no run.
      return operationId === 'session'
        ? { runId: operationId }
        : startedBy(operationId)
    }
    case 'cancel':
      return input.operationId === undefined
        ? null
        : startedBy(input.operationId)
    case 'cancelInput': {
      const logged = inputs.find((item) => item.inputId === input.inputId)
      return logged ? { runId: input.inputId, ...by(logged.principal) } : null
    }
    case 'resolve': {
      const stopped = root.thread.interrupted
      return stopped ? { runId: stopped.runId, ...by(stopped.principal) } : null
    }
  }
}

/**
 * Read the entries of `logId` after `from.seq`, page by page, until a page
 * is empty. A store can return fewer than `limit` before the end.
 */
async function readAll(
  store: LogStore,
  logId: string,
  from: { seq: number },
  onEntry: (entry: LogEntry) => void,
) {
  for (;;) {
    const page = await store.read({
      logId,
      after: from.seq,
      limit: READ_PAGE,
    })
    if (page.length === 0) return
    for (const entry of page) onEntry(entry)
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
  /** The id of the log in the store. See {@link logIdOf}. */
  readonly logId: string
  /**
   * The fold of this session. In a shared log, `seq` is this session's last
   * folded record. `head()` is the log position.
   */
  readonly state: LogState
  /**
   * Append `records` after the pending events, in one batch. `consumes`: the
   * offers that the batch applies. The store removes them in the same write.
   */
  append: (
    records: ReadonlyArray<LogRecord>,
    options?: { consumes?: ReadonlyArray<string> },
  ) => Promise<void>
  /**
   * Offer `record` to the owner of the log, for a host that cannot write to
   * it. The owner applies it, and consumes it with `append`.
   */
  offer: (inputId: string, record: LogRecord) => Promise<OfferResult>
  /** The pending offers of this session, in offer order. */
  offered: () => Promise<Array<OfferedInput>>
  /**
   * Hold `records` until the next transcript commit of this session. With
   * `toolCallId`, hold them until the `harness.tool.result` of that call
   * instead, and append them with it.
   */
  stage: (records: ReadonlyArray<LogRecord>, toolCallId?: string) => void
  /**
   * The fold of `thread` in this log: a child thread of the session (an
   * agent chain or a subagent run). Empty when the log has no record of it.
   */
  stateOf: (thread: string) => LogState
  /**
   * The `reduce` fold of the whole log, when `reduce` is the reduce that
   * folds this log. Else `undefined`.
   */
  reducedBy: (reduce: ReduceOptions<unknown> | undefined) => unknown
  /**
   * One batch: the pending events, the transcript change to `messages` (if
   * any), the staged records of this session, then `records`. With
   * `thread`, the transcript is the one of that child thread of the
   * session, and its records carry that thread.
   */
  commit: (options: {
    messages: ReadonlyArray<ModelMessage>
    records?: ReadonlyArray<LogRecord>
    thread?: string
  }) => Promise<void>
  /** Append the pending events now. */
  flush: () => Promise<void>
  /** Fold the records that another writer appended, after the queued writes. */
  catchUp: () => Promise<void>
  /**
   * The epoch at which this host owns the log, or {@link UNOWNED_EPOCH} when
   * it does not own it now.
   */
  readonly epoch: number
  /**
   * Another host took the log, and the work of this session that the loss
   * stopped has not ended yet. Until `unfence()`, `append` and `commit`
   * reject, and `publish` and `stage` do nothing.
   */
  readonly fenced: boolean
  /** The work that the loss stopped has ended. A later write acquires the log again. */
  unfence: () => void
  /**
   * Own the log before a write that recovery decides on: acquire it, then
   * fold the records up to the head of the log. Resolves `false` when
   * another live host owns it.
   */
  own: () => Promise<boolean>
  /**
   * The session has no work now. When no session of the log has work, the
   * host gives the log up, so it makes no store calls for it. Resolves after
   * that check, and never rejects.
   */
  rest: () => Promise<void>
}

/** What a session gives its view of a shared log. */
export interface LogViewHooks {
  /** A write failed, so the log stopped. */
  onFailure: (error: unknown) => void
  /**
   * Another host took the log. Stop the running work: its writes are
   * refused. The session still reads the log.
   */
  onLost: (error: OwnershipLostError) => void
  /** The session has work, so the host keeps the log. */
  isBusy: () => boolean
  /**
   * The session has work that can run now, not only work that waits for a
   * schedule. When its view closes with such work (a recoverable close), the
   * release asks the store to wake a worker at once. Default: `isBusy`.
   */
  hasWorkNow?: () => boolean
  /**
   * The log can have offers for the session to apply: another host offered
   * an input to this owner, this host got the log, or an input that this
   * host offered still waits.
   */
  onOffers: () => void
  /**
   * An event of the session that another host wrote, after this log folded
   * it. Own events never come here: the session saw them at publish.
   */
  onRemoteEvent?: (entry: SessionEvent) => void
}

/**
 * A read view of one session of a shared log, from {@link SharedLog.reader}.
 * It follows what the writers append, and it never writes.
 */
export interface LogReader<TState = unknown> {
  /** The fold of the session. Empty when the log has no record of it. */
  readonly state: LogState
  /** The fold of another thread of the log: a child thread of the session. */
  stateOf: (thread: string) => LogState
  /** The `reduce` fold of the whole log. */
  readonly reduced: TState | undefined
  /** The log position. */
  head: () => Cursor
  /**
   * The events of the session after `from` (exclusive), then each new one,
   * until `signal` aborts, the reader closes, or the log fails.
   */
  read: (options: {
    from?: Cursor
    signal?: AbortSignal
  }) => AsyncIterable<SessionEvent>
  /** Let go of the log. A second call does nothing. */
  close: () => void
}

/**
 * Writes one log for every session that shares it, and keeps its fold.
 * All writes run one after another. Each batch goes at the next position,
 * with the epoch of this host.
 *
 * - The first write acquires the log, then folds the records up to the head
 *   of the log, then appends. When another live host owns the log, the write
 *   rejects with `LogOwnedElsewhereError`, and the log still reads.
 * - When the host loses the log (a refused epoch, a refused renewal, or
 *   records of another owner), every session of the log gets `onLost`, and
 *   the sessions read on. A later write acquires the log again.
 * - When no session of the log has work, the host releases the log.
 * - A host that cannot write offers its inputs instead (the input lane). The
 *   owner applies them: each session of the log gets `onOffers` when another
 *   host offered, and when this host gets the log.
 * - When a write fails for another reason (another writer took the
 *   position, or the store failed twice), every session of the log gets
 *   `onFailure`, and every later write rejects.
 * - The owner writes a snapshot of the whole fold after `afterBytes` of new
 *   records, or `afterMs` after the first record with no snapshot. With
 *   `logRecords: 'since-snapshot'`, it then truncates the records before it.
 */
export class SharedLog<TState = unknown> {
  /** The id of the log in the store. See {@link logIdOf}. */
  readonly logId: string
  /** The thread of the records that have no `thread` field. */
  readonly rootThread: string
  readonly state: SharedLogState<TState>
  private readonly store: LogStore
  private readonly fold: FoldOptions<TState>
  private readonly versions: SnapshotVersions
  private readonly snapshotAfterBytes: number
  private readonly snapshotAfterMs: number
  private readonly logRecords: LogRecordRetention
  /** The position of the newest snapshot that this host knows. */
  private snapshotSeq: number
  /** The JSON length of the records folded after `snapshotSeq`. */
  private bytesSinceSnapshot = 0
  /** When the first record after `snapshotSeq` folded. */
  private firstUnsnapshottedAt: number | undefined
  private snapshotTimer: ReturnType<typeof setTimeout> | undefined
  private readonly coalesceMs: number
  private readonly onIdle: () => void
  private readonly ownership: HostOwnership
  /** The harness name that the ownership record of the log keeps. */
  private readonly harness: string
  /**
   * The epoch of this host, once it acquired the log and folded the records
   * before its first append. `undefined` while it does not own the log.
   */
  private epoch: number | undefined
  /** The open views, by thread. */
  private readonly views = new Map<
    string,
    { hooks: LogViewHooks; fenced: boolean }
  >()
  /** Events and host records that wait for the next append. */
  private readonly pending: Array<LogRecord> = []
  /** The offers that the next append consumes. */
  private readonly consumes: Array<string> = []
  /** The offers of this host that may still wait for an owner. */
  private readonly offeredHere = new Set<string>()
  /** The merge key of the last pending record, when it is a delta event. */
  private pendingKey: string | undefined
  /**
   * Host records that wait for the next transcript commit, by thread. The
   * records of one tool call wait for its result instead, by
   * `<thread>\0<toolCallId>`.
   */
  private readonly staged = new Map<string, Array<LogRecord>>()
  /**
   * The tool calls whose result landed and is not in the transcript yet, by
   * `<thread>\0<toolCallId>`.
   */
  private readonly resulted = new Set<string>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private scheduled = false
  private chain: Promise<void> = Promise.resolve()
  private failure: unknown
  /**
   * The newest events, like SessionFeed: at most `eventBytes` of them (the
   * JSON length of each). Older cursors page from the store.
   */
  private readonly tail: Array<{
    thread: string
    entry: SessionEvent
    size: number
  }> = []
  /** The sum of the sizes in `tail`. */
  private tailBytes = 0
  /** While `catchUp` folds: the events that other writers appended. */
  private remote: Array<{ thread: string; entry: SessionEvent }> | undefined
  private readonly eventBytes: number
  /** Every event after this position is in `tail`. */
  private tailFrom: number
  private readonly waiters = new Set<() => void>()
  /** The open readers. Like the views, they keep the log open. */
  private readers = 0
  /** `stopReaders` ran: every read of a reader ends. */
  private readersStopped = false
  private idle = false
  /**
   * A view closed while its session had work: the next owner must run it.
   * The next acquire of this host clears it.
   */
  private hasLeftWork = false
  private writing = false
  private readonly unsubscribe: () => void
  private readonly stopLost: () => void
  private readonly stopWake: () => void

  constructor(options: {
    store: LogStore
    /** The logs that this host owns. */
    ownership: HostOwnership
    /** The harness of the sessions, for the ownership record. */
    harness: string
    /** The id of the log in the store. See {@link logIdOf}. */
    logId: string
    /** The thread of the records that have no `thread` field. */
    rootThread: string
    state: SharedLogState<TState>
    coalesceMs: number
    /** How many bytes of events the in-memory tail keeps. */
    eventBytes: number
    project?: ProjectOptions
    reduce?: ReduceOptions<TState>
    /** When the owner writes a snapshot. */
    snapshot?: SnapshotTiming
    /** Which records the log keeps after a snapshot. Default `'all'`. */
    logRecords?: LogRecordRetention
    /** Called when the last session closes, or when a write fails. */
    onIdle?: () => void
  }) {
    this.store = options.store
    this.ownership = options.ownership
    this.harness = options.harness
    this.logId = options.logId
    this.rootThread = options.rootThread
    this.state = options.state
    this.snapshotAfterBytes =
      options.snapshot?.afterBytes ?? SNAPSHOT_AFTER_BYTES
    this.snapshotAfterMs = options.snapshot?.afterMs ?? SNAPSHOT_AFTER_MS
    this.logRecords = options.logRecords ?? 'all'
    this.snapshotSeq = options.state.snapshotSeq ?? 0
    this.coalesceMs = options.coalesceMs
    this.eventBytes = options.eventBytes
    this.onIdle = options.onIdle ?? (() => {})
    this.fold = {
      rootThread: options.rootThread,
      ...(options.project ? { project: options.project.record } : {}),
      ...(options.reduce ? { reduce: options.reduce } : {}),
    }
    this.versions = versionsOf(options.project, options.reduce)
    this.tailFrom = options.state.seq
    // Records from another writer join the fold. A call during this
    // writer's own append is its own records.
    this.unsubscribe = options.store.subscribe({
      logId: options.logId,
      listener: () => {
        if (this.writing) return
        this.catchUpLater()
        // The call can be a new offer. The owner applies it. A host that
        // offered applies its own offers when no live host owns the log.
        if (this.epoch !== undefined || this.offeredHere.size > 0) {
          this.notifyOffers()
        }
      },
    })
    this.stopLost = options.ownership.onLost(options.logId, (error) =>
      this.lose(error),
    )
    this.stopWake = options.ownership.setWake(options.logId, () =>
      this.wakeInMs(),
    )
  }

  /**
   * The milliseconds until the first schedule of any session of the log is
   * due (0 when one is due now), or `undefined` when the log has none. A
   * release gives it to the store, so a worker takes the log then.
   */
  private wakeInMs() {
    if (this.hasLeftWork) return 0
    const sessions = [...this.state.sessions.values()]
    const times = sessions.flatMap((session) =>
      [...session.thread.schedules.values()].map((schedule) => schedule.at),
    )
    if (times.length === 0) return undefined
    return Math.max(0, Math.min(...times) - Date.now())
  }

  /**
   * False after the last view and the last reader closed, or after a write
   * failed. The host then opens a new log.
   */
  get isOpen() {
    return !this.idle
  }

  /**
   * A read view of session `threadId`: its fold and its events, which follow
   * what the writers append. It never writes, and it is not a view of the
   * thread, so a session of the thread can open while it reads. The readers
   * of one log share its fold and its tail of events. Close it after the
   * read: the log stays open while a view or a reader is open.
   */
  reader(threadId: string): LogReader<TState> {
    if (this.idle) {
      throw new Error(`The log ${JSON.stringify(this.logId)} is closed.`)
    }
    this.readers += 1
    const shared = this.state
    let closed = false
    return {
      get state() {
        // Not `sessionOf`: a read adds no session to the fold.
        return shared.sessions.get(threadId) ?? emptyLogState()
      },
      stateOf: (thread) => shared.sessions.get(thread) ?? emptyLogState(),
      get reduced() {
        return shared.reduced
      },
      head: () => this.head(),
      read: (options) =>
        this.read(threadId, {
          ...options,
          isClosed: () =>
            closed || this.readersStopped || this.failure !== undefined,
        }),
      close: () => {
        if (closed) return
        closed = true
        this.readers -= 1
        // Its readers end. The others wait again.
        this.wake()
        this.idleWhenUnused()
      },
    }
  }

  /** End the reads of every reader, for a host that closes. */
  stopReaders() {
    this.readersStopped = true
    this.wake()
  }

  /** The view of session `threadId`. Close it when the session closes. */
  view(threadId: string, hooks: LogViewHooks): LogWriter {
    if (this.idle) {
      throw new Error(`The log ${JSON.stringify(this.logId)} is closed.`)
    }
    if (this.views.has(threadId)) {
      throw new Error(
        `The thread ${JSON.stringify(threadId)} already has an open session on this log. Two harnesses cannot open one thread on a durable host.`,
      )
    }
    const own = { hooks, fenced: false }
    this.views.set(threadId, own)
    const shared = this.state
    // `this` in a getter below is the view.
    const epochOf = () => this.epoch ?? UNOWNED_EPOCH
    let closed = false
    // A closed view writes nothing more, like a host that stopped. After a
    // failed write, a write still rejects with that failure. A fenced view
    // writes nothing either, but its writes reject: nothing was stored.
    const isDropped = () =>
      (closed && this.failure === undefined) || (!closed && own.fenced)
    const refused = () =>
      own.fenced && !closed
        ? Promise.reject(new LogOwnedElsewhereError(this.logId))
        : Promise.resolve()
    return {
      threadId,
      logId: this.logId,
      get state() {
        return sessionOf(shared, threadId)
      },
      get epoch() {
        return epochOf()
      },
      get fenced() {
        return own.fenced
      },
      stateOf: (thread) => sessionOf(shared, thread),
      reducedBy: (reduce) =>
        reduce !== undefined && reduce === this.fold.reduce
          ? shared.reduced
          : undefined,
      publish: (operationId, event) => {
        if (!isDropped()) this.publish(threadId, operationId, event)
      },
      append: (records, appendOptions) =>
        isDropped()
          ? refused()
          : this.append(threadId, records, appendOptions?.consumes ?? []),
      offer: (inputId, record) => this.offer(threadId, inputId, record),
      offered: () => this.offered(threadId),
      stage: (records, toolCallId) => {
        if (!isDropped()) this.stage(threadId, records, toolCallId)
      },
      commit: (options) =>
        isDropped()
          ? refused()
          : this.commit(options.thread ?? threadId, options),
      flush: () => this.flush(),
      catchUp: () => this.enqueue(() => this.catchUp()),
      unfence: () => {
        own.fenced = false
      },
      own: () => this.enqueue(() => this.ownForRecovery()),
      rest: () => this.releaseWhenIdle(),
      head: () => this.head(),
      read: (options) =>
        this.read(threadId, { ...options, isClosed: () => closed }),
      wake: () => this.wake(),
      close: () => {
        if (closed) return
        closed = true
        // A session that closes with work (a recoverable close) leaves it
        // in the log. The release asks the store to wake a worker at once.
        const { hooks } = own
        if ((hooks.hasWorkNow ?? hooks.isBusy)()) this.hasLeftWork = true
        this.release(threadId, own)
      },
    }
  }

  private release(
    threadId: string,
    own: { hooks: LogViewHooks; fenced: boolean },
  ) {
    if (this.views.get(threadId) === own) this.views.delete(threadId)
    // Like a crash: the records of a cut tool batch do not land later.
    for (const key of [...this.staged.keys()]) {
      if (key === threadId || key.startsWith(`${threadId}\u0000`)) {
        this.staged.delete(key)
      }
    }
    for (const key of [...this.resulted]) {
      if (key.startsWith(`${threadId}\u0000`)) this.resulted.delete(key)
    }
    // The readers of the closed view end. The others wait again.
    this.wake()
    this.idleWhenUnused()
  }

  /**
   * Close the log when no view and no reader uses it. Only after the last
   * append landed: until then the host keeps this log, so an open of the
   * thread gets it, not a fold without it.
   */
  private idleWhenUnused() {
    void this.flush()
      .catch(() => {})
      // A log that no session of this host writes goes back first, so the
      // next log of this id can acquire it.
      .then(() => this.enqueue(() => this.releaseIfIdle()))
      .catch(() => {})
      .then(() => {
        if (this.views.size > 0 || this.readers > 0) return
        this.idle = true
        this.stopSnapshotTimer()
        this.unsubscribe()
        this.stopLost()
        this.stopWake()
        this.onIdle()
      })
  }

  /** Give the log up after the pending writes, when no session of it has work. */
  private releaseWhenIdle() {
    return (
      this.flush()
        .catch(() => {})
        .then(() => this.enqueue(() => this.releaseIfIdle()))
        // A release that fails lets the ownership expire.
        .catch(() => {})
    )
  }

  private async releaseIfIdle() {
    const { epoch } = this
    const isBusy = [...this.views.values()].some((view) => view.hooks.isBusy())
    if (epoch === undefined || isBusy || this.pending.length > 0) return
    this.epoch = undefined
    await this.ownership.release(this.logId, epoch)
  }

  /** Fold the records of another writer, after the queued writes. */
  private catchUpLater() {
    // ponytail: a read that fails leaves the fold behind until the next
    // notification. A reader never fails, and an owner has no other writer.
    this.enqueue(() => this.catchUp()).catch(() => {})
  }

  /**
   * Another host owns the log now. The work of this host on it stops: the
   * pending and staged records are dropped, each view is fenced until its
   * session says its work ended, and each session gets `onLost`. The fold
   * then takes the records of the new owner.
   */
  private lose(error: OwnershipLostError) {
    const { epoch } = this
    if (epoch === undefined) return
    this.epoch = undefined
    // A newer ownership of this host (a new acquire) stays.
    if (this.ownership.epochOf(this.logId) === epoch) {
      this.ownership.forget(this.logId)
    }
    this.takePending()
    this.staged.clear()
    this.resulted.clear()
    const views = [...this.views.values()]
    for (const view of views) view.fenced = true
    for (const view of views) view.hooks.onLost(error)
    this.catchUpLater()
  }

  /** Stamp a record with its session, unless it names one or the session is the root thread. */
  private stamp(record: LogRecord, thread: string): LogRecord {
    if (typeof record.thread === 'string' || thread === this.rootThread) {
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

  private append(
    thread: string,
    records: ReadonlyArray<LogRecord>,
    consumes: ReadonlyArray<string>,
  ) {
    this.consumes.push(...consumes)
    for (const record of records) {
      // The records of a tool call land in the same append as its result.
      const toolCallId = resultCallOf(record)
      if (toolCallId !== undefined) {
        const key = `${thread}\u0000${toolCallId}`
        this.pending.push(...(this.staged.get(key) ?? []))
        this.staged.delete(key)
        this.resulted.add(key)
      }
      this.pending.push(normalize(this.stamp(record, thread)))
    }
    this.pendingKey = undefined
    return this.flush()
  }

  private stage(
    thread: string,
    records: ReadonlyArray<LogRecord>,
    toolCallId?: string,
  ) {
    // A call whose result landed (a background job) waits for the commit.
    const isWaiting =
      toolCallId !== undefined && !this.hasResult(thread, toolCallId)
    const key = isWaiting ? `${thread}\u0000${toolCallId}` : thread
    const staged = this.staged.get(key) ?? []
    staged.push(
      ...records.map((record) => normalize(this.stamp(record, thread))),
    )
    this.staged.set(key, staged)
  }

  /** The result of the call landed: it waits for a commit, or the transcript has it. */
  private hasResult(thread: string, toolCallId: string) {
    if (this.resulted.has(`${thread}\u0000${toolCallId}`)) return true
    // ponytail: a scan of the transcript, only when a call stages records.
    return sessionOf(this.state, thread).messages.some(
      (message) => message.role === 'tool' && message.toolCallId === toolCallId,
    )
  }

  private commit(
    thread: string,
    options: {
      messages: ReadonlyArray<ModelMessage>
      records?: ReadonlyArray<LogRecord>
    },
  ) {
    const { batch: events, consumes } = this.takePending()
    const staged = this.staged.get(thread)?.splice(0) ?? []
    const records = (options.records ?? []).map((record) =>
      normalize(this.stamp(record, thread)),
    )
    return this.enqueue(() =>
      this.write(
        [
          ...events,
          ...transcriptRecord(
            sessionOf(this.state, thread).messages,
            options.messages,
          ).map((record) => this.stamp(record, thread)),
          ...staged,
          ...records,
        ],
        consumes,
      ),
    )
  }

  /** Append the pending events now. */
  flush(): Promise<void> {
    const { batch, consumes } = this.takePending()
    return this.enqueue(() => this.write(batch, consumes))
  }

  /** The records and the consumed offers that wait for the next append. */
  private takePending() {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    this.scheduled = false
    this.pendingKey = undefined
    return { batch: this.pending.splice(0), consumes: this.consumes.splice(0) }
  }

  /** Call `onOffers` of each session of the log that can write. */
  private notifyOffers() {
    const views = [...this.views.values()]
    for (const view of views) {
      if (!view.fenced) view.hooks.onOffers()
    }
  }

  private async offer(thread: string, inputId: string, record: LogRecord) {
    // Before the call: the store calls the listeners in it.
    this.offeredHere.add(inputId)
    const offered = await this.store
      .offer({
        logId: this.logId,
        harness: this.harness,
        inputId,
        record: normalize(this.stamp(record, thread)),
      })
      .catch((error: unknown) => {
        this.offeredHere.delete(inputId)
        throw error
      })
    if (offered === 'conflict') this.offeredHere.delete(inputId)
    return offered
  }

  /** The pending offers of session `thread`. */
  private async offered(thread: string) {
    const offers = await this.store.offered({ logId: this.logId })
    // The offers of this host that the owner consumed wait no more.
    const pending = new Set(offers.map((offer) => offer.inputId))
    for (const inputId of [...this.offeredHere]) {
      if (!pending.has(inputId)) this.offeredHere.delete(inputId)
    }
    return offers.filter(
      (offer) => threadOf(offer.record, this.rootThread) === thread,
    )
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

  private enqueue<T>(task: () => Promise<T>) {
    const run = this.chain.then(task)
    this.chain = run.then(
      () => {},
      () => {},
    )
    return run
  }

  /**
   * The epoch of this host. The first write acquires the log, then folds
   * the records of the last owner, so its append goes at the head of the
   * log. Throws `LogOwnedElsewhereError` when another live host owns it.
   */
  private async own() {
    if (this.epoch !== undefined) return this.epoch
    const epoch = await this.ownership.acquire(this.logId, this.harness)
    if (epoch === null) throw new LogOwnedElsewhereError(this.logId)
    try {
      await this.catchUp()
    } catch (error) {
      // Not caught up, so it does not write: the log goes back.
      await this.ownership.release(this.logId, epoch).catch(() => {})
      throw error
    }
    this.epoch = epoch
    this.hasLeftWork = false
    // The new owner applies the inputs that wait for an owner. Later, so the
    // write that acquired the log goes first.
    queueMicrotask(() => this.notifyOffers())
    return epoch
  }

  /** `own()` for recovery: `false` when another live host owns the log. */
  private async ownForRecovery() {
    if (this.failure !== undefined) throw this.failure
    try {
      await this.own()
      return true
    } catch (error) {
      if (error instanceof LogOwnedElsewhereError) return false
      throw error
    }
  }

  private async write(
    batch: ReadonlyArray<LogRecord>,
    consumes: ReadonlyArray<string> = [],
  ) {
    if (this.failure !== undefined) throw this.failure
    if (batch.length === 0 && consumes.length === 0) return
    if (this.state.newerRecord !== undefined) {
      const error = new LogVersionError(this.logId, this.state.newerRecord)
      this.fail(error)
      throw error
    }
    const epoch = await this.own()
    const seq = this.state.seq + 1
    this.writing = true
    try {
      await this.appendOnce({ seq, epoch, batch, consumes })
    } catch (error) {
      // Another host took the log: this host reads on.
      if (error instanceof OwnershipLostError) this.lose(error)
      else this.fail(error)
      throw error
    } finally {
      this.writing = false
    }
    batch.forEach((record, index) => this.apply({ seq: seq + index, record }))
    this.wake()
    // In this write, so no queued release takes the epoch first.
    if (this.isSnapshotDue()) await this.snapshot()
    else this.startSnapshotTimer()
    // A write of a session with no work (a setting, a title) gives the log
    // back after it.
    if (![...this.views.values()].some((view) => view.hooks.isBusy())) {
      void this.releaseWhenIdle()
    }
  }

  /**
   * True when this host owns the log, and enough bytes or time passed since
   * the last snapshot. Only the owner writes one.
   */
  private isSnapshotDue() {
    if (this.epoch === undefined || this.state.seq <= this.snapshotSeq) {
      return false
    }
    const since = Date.now() - (this.firstUnsnapshottedAt ?? Date.now())
    return (
      this.bytesSinceSnapshot >= this.snapshotAfterBytes ||
      since >= this.snapshotAfterMs
    )
  }

  /** A timer for the time limit of the records with no snapshot. */
  private startSnapshotTimer() {
    if (this.snapshotTimer !== undefined) return
    if (this.firstUnsnapshottedAt === undefined) return
    const since = Date.now() - this.firstUnsnapshottedAt
    // A host that gave the log back when the timer fires writes none. The
    // next owner does, at its next write.
    this.snapshotTimer = setTimeout(() => {
      this.snapshotTimer = undefined
      if (this.isSnapshotDue()) {
        this.enqueue(() => this.snapshot()).catch(() => {})
      }
    }, this.snapshotAfterMs - since)
    // Like the coalescing timer, it must not keep a process alive.
    const timer = this.snapshotTimer
    if (typeof timer === 'object' && 'unref' in timer) timer.unref()
  }

  private stopSnapshotTimer() {
    if (this.snapshotTimer !== undefined) clearTimeout(this.snapshotTimer)
    this.snapshotTimer = undefined
  }

  /** Save the fold of the whole log at its head, with the epoch of this host. */
  private async snapshot() {
    const { epoch } = this
    const { seq } = this.state
    const isStale = seq <= this.snapshotSeq || this.failure !== undefined
    if (epoch === undefined || isStale) return
    try {
      await this.store.putSnapshot({
        logId: this.logId,
        epoch,
        seq,
        version: SNAPSHOT_VERSION,
        state: normalize(serialize(this.state, this.versions)),
      })
      this.snapshotSeq = seq
      this.bytesSinceSnapshot = 0
      this.firstUnsnapshottedAt = undefined
      this.stopSnapshotTimer()
      if (this.logRecords === 'since-snapshot') {
        await this.store.truncate({
          logId: this.logId,
          epoch,
          beforeSeq: seq + 1,
        })
      }
    } catch (error) {
      // Another host took the log: this host reads on. Another lost
      // snapshot or truncate only makes the next open read more records.
      if (error instanceof OwnershipLostError) this.lose(error)
    }
  }

  /** Stop every session of the log. The host drops it, so the next open folds again. */
  private fail(error: unknown) {
    this.failure = error
    this.idle = true
    this.stopSnapshotTimer()
    for (const view of [...this.views.values()]) view.hooks.onFailure(error)
    // The readers end: their log stopped.
    this.wake()
    // The host drops this log, so it gives the ownership back.
    const { epoch } = this
    this.epoch = undefined
    if (epoch !== undefined) {
      this.ownership.release(this.logId, epoch).catch(() => {})
    }
    this.onIdle()
  }

  /**
   * Append once. After an error, read back: the batch may have landed before
   * the error. When it did not land, a conflict or a refused epoch fails at
   * once, and another error gets one more try.
   */
  private async appendOnce(write: {
    seq: number
    epoch: number
    batch: ReadonlyArray<LogRecord>
    consumes: ReadonlyArray<string>
  }) {
    const { seq, epoch, batch, consumes } = write
    const append = {
      logId: this.logId,
      seq,
      epoch,
      records: batch,
      ...(consumes.length > 0 ? { consumes } : {}),
    }
    try {
      await this.store.append(append)
      return
    } catch (error) {
      if (await this.landed(write)) return
      const isFinal =
        error instanceof LogConflictError || error instanceof OwnershipLostError
      if (isFinal) throw error
    }
    try {
      await this.store.append(append)
    } catch (error) {
      if (await this.landed(write)) return
      throw error
    }
  }

  /**
   * Did the batch land before an error? The batch and its consumes land
   * together, so a batch with records reads the records back. A batch of
   * consumes only landed when none of them waits any more.
   */
  private async landed({
    seq,
    batch,
    consumes,
  }: {
    seq: number
    batch: ReadonlyArray<LogRecord>
    consumes: ReadonlyArray<string>
  }) {
    try {
      if (batch.length === 0) {
        const offers = await this.store.offered({ logId: this.logId })
        return !offers.some((offer) => consumes.includes(offer.inputId))
      }
      const entries = await this.store.read({
        logId: this.logId,
        after: seq - 1,
        limit: batch.length,
      })
      return (
        entries.length === batch.length &&
        entries.every(
          (entry, index) =>
            stableJson(entry.record) === stableJson(batch[index]),
        )
      )
    } catch {
      return false
    }
  }

  /**
   * Fold records that another writer appended. A reader follows the log,
   * and never fails because of them. Only the owner appends, so records of
   * another writer while this host owns the log mean another host took it.
   */
  private async catchUp() {
    if (this.failure !== undefined) return
    const before = this.state.seq
    // Only this fold reads the records of other writers. Own records fold
    // in `write`, so an own event never reaches `onRemoteEvent`.
    const remote: Array<{ thread: string; entry: SessionEvent }> = []
    this.remote = remote
    try {
      await readAll(this.store, this.logId, this.state, (entry) =>
        this.apply(entry),
      )
    } catch (error) {
      if (!(error instanceof LogTruncatedError)) throw error
      await this.foldFromSnapshot(error)
    } finally {
      this.remote = undefined
    }
    if (this.state.seq === before) return
    if (this.epoch !== undefined) {
      this.lose(new OwnershipLostError(this.logId, this.epoch))
    }
    this.wake()
    // After the whole fold, so a hook reads the state after the events.
    for (const { thread, entry } of remote) {
      try {
        this.views.get(thread)?.hooks.onRemoteEvent?.(entry)
      } catch {
        // A hook never stops the fold of the log.
      }
    }
  }

  /**
   * The owner truncated records that this fold did not read yet. Take the
   * fold of the snapshot, then read the records after it. The events of the
   * dropped records are not in the tail, so a reader of them gets a gap.
   */
  private async foldFromSnapshot(truncated: LogTruncatedError) {
    const snapshot = await this.store.getSnapshot({ logId: this.logId })
    const loaded = parseSnapshot<TState>(snapshot, this.versions)
    if (!loaded) throw truncated
    // The views read their state from `sessions` by thread on each call, so
    // new entries replace the old ones.
    this.state.sessions.clear()
    for (const [thread, session] of loaded.sessions) {
      this.state.sessions.set(thread, session)
    }
    this.state.seq = loaded.seq
    this.state.reduced = loaded.reduced
    this.snapshotSeq = loaded.seq
    this.tail.length = 0
    this.tailBytes = 0
    this.tailFrom = loaded.seq
    await readAll(this.store, this.logId, this.state, (entry) =>
      this.apply(entry),
    )
  }

  private apply(entry: LogEntry) {
    foldLogEntry(this.state, entry, this.fold)
    // ponytail: one more JSON length per record, for the snapshot limit.
    this.bytesSinceSnapshot += JSON.stringify(entry.record).length
    this.firstUnsnapshottedAt ??= Date.now()
    const { record } = entry
    const thread = threadOf(record, this.rootThread)
    // A result in the transcript does not wait for a commit any more.
    if (isHarnessRecord(record) && record.type === 'harness.transcript') {
      for (const message of record.add) {
        if (message.role !== 'tool') continue
        this.resulted.delete(`${thread}\u0000${message.toolCallId}`)
      }
    }
    const event = sessionEventOf(entry)
    if (!event) return
    this.remote?.push({ thread, entry: event })
    // The fold has JSON values only, so this cannot throw.
    const size = JSON.stringify(event.event).length
    this.tail.push({ thread, entry: event, size })
    this.tailBytes += size
    // The newest event stays, so a live reader gets it from memory.
    while (this.tailBytes > this.eventBytes && this.tail.length > 1) {
      const dropped = this.tail.shift()
      if (!dropped) break
      this.tailBytes -= dropped.size
      this.tailFrom = Number(dropped.entry.cursor)
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
        let page: Array<LogEntry>
        try {
          page = await this.store.read({
            logId: this.logId,
            after,
            limit: READ_PAGE,
          })
        } catch (error) {
          if (!(error instanceof LogTruncatedError)) throw error
          // A truncate dropped the events after `after`: say so once, then
          // go on from the first stored record.
          const resumeAt = error.firstSeq - 1
          yield gapEvent(String(after), String(resumeAt), 'truncated')
          after = resumeAt
          continue
        }
        for (const entry of page) {
          if (entry.seq > upTo || signal?.aborted) break
          after = entry.seq
          const event = sessionEventOf(entry)
          const isOwn = threadOf(entry.record, this.rootThread) === thread
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
        // The events that the end published (an operation's finished
        // event) are still in flight: they land first.
        await this.chain
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

/** What a durable session needs for the message stores of its log. */
interface SessionLogView {
  writer: LogWriter
}

/**
 * The `MessageStore` a durable session gives `withPersistence`. Every
 * thread goes through the session's writer, into the one log of the session
 * tree: its own thread, and each child thread (an agent chain or a subagent
 * transcript), whose records carry that thread.
 */
export function sessionMessageStore({ writer }: SessionLogView) {
  const messages: MessageStore = {
    loadThread: async (threadId: string) => [
      ...writer.stateOf(threadId).messages,
    ],
    saveThread: (threadId, list) =>
      writer.commit({
        messages: list,
        ...(threadId === writer.threadId ? {} : { thread: threadId }),
      }),
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
export function engineMessageStore(options: SessionLogView) {
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
   * - The engine changed older messages itself (a compaction middleware, or
   *   the run tags of `withPersistence` at the end of a turn): `list` wins,
   *   and host messages that the fold added after `base` stay after it.
   */
  const rebase = (base: Array<ModelMessage>, list: Array<ModelMessage>) => {
    const current = writer.state.messages
    const isFoldExtension = commonPrefix(base, current) === base.length
    const hostAdded = isFoldExtension ? current.slice(base.length) : []
    const isEngineExtension = commonPrefix(base, list) === base.length
    if (!isEngineExtension) return [...list, ...hostAdded]
    const added = list.slice(base.length)
    return isFoldExtension
      ? [...base, ...added, ...hostAdded]
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
    /**
     * Host records from a middleware of the running turn. The messages that
     * the engine added since its last save (the tool results of the last
     * phase) go first in the same append, as a save puts them. So a record
     * that counts them lands on a fold that has them. A `list` that changed
     * older messages is not written: the last save keeps them (for example
     * the run id that `withPersistence` puts on a reply). A `list` with no
     * new messages appends only the records, so the staged records of a
     * running tool batch stay staged.
     */
    appendRecords: (
      list: ReadonlyArray<ModelMessage>,
      records: ReadonlyArray<LogRecord>,
    ) => {
      const kept = commonPrefix(held, list)
      if (kept < held.length || list.length === held.length) {
        return writer.append(records)
      }
      const target = rebase(held, [...list])
      held = [...list]
      return writer.commit({ messages: target, records })
    },
  } satisfies MessageStore & {
    beforeModel: (
      list: ReadonlyArray<ModelMessage>,
      records?: ReadonlyArray<LogRecord>,
    ) => Promise<Array<ModelMessage> | undefined>
    appendRecords: (
      list: ReadonlyArray<ModelMessage>,
      records: ReadonlyArray<LogRecord>,
    ) => Promise<void>
  }
  return engine
}

/**
 * A `MessageStore` view of a session log, for a reader outside a session
 * (for example `reconstructChat`). Each thread id is the root thread of a
 * session tree, whose log it reads. A child thread (an agent chain or a
 * subagent run) is in the log of its root: read it through `host.observe`.
 * `loadThread` folds the log. `saveThread` appends the change as one
 * transcript record, with no owner: the store refuses it on a log that a
 * host acquired.
 *
 * @example
 * ```ts
 * reconstructChat({ persistence: { stores: { messages: logMessageStore({ store: log }) } }, ... })
 * ```
 */
export function logMessageStore(options: {
  store: LogStore
  project?: ProjectOptions
  /**
   * The tenant of the threads: the `principal.tenantId` of `host.open`.
   * Default: the default tenant.
   */
  tenantId?: string
}) {
  const { store, project, tenantId } = options
  // ponytail: each read and save folds the log of the thread from its
  // snapshot. This store writes no snapshot (it owns no epoch), so a log
  // that only this store writes folds from the start: O(n) per save.
  const logOf = (threadId: string) => logIdOf({ tenantId, logId: threadId })
  const load = (threadId: string) =>
    loadLogState({
      store,
      logId: logOf(threadId),
      rootThread: threadId,
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
        )
        if (records.length === 0) return
        if (state.newerRecord !== undefined) {
          throw new LogVersionError(logOf(threadId), state.newerRecord)
        }
        try {
          await store.append({
            logId: logOf(threadId),
            seq: state.seq + 1,
            epoch: UNOWNED_EPOCH,
            records,
          })
          return
        } catch (error) {
          if (!(error instanceof LogConflictError) || attempt === 2) throw error
        }
      }
    },
  }
  return messages
}
