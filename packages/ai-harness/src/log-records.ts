import { isRecord } from './utils'
import type {
  Interrupt,
  ModelMessage,
  PromptCacheOptions,
  ReasoningOption,
  UIMessage,
} from '@tanstack/ai'
import type {
  InterruptRecord,
  LogRecord,
  RunRecord,
  RunStore,
} from '@tanstack/ai-persistence'
import type {
  HarnessInput,
  RunNode,
  SettlementOutcome,
  ThreadSettings,
} from './types'
import type { Wait, WaitOutcome } from './waits'

/** A change to a run record, as `RunStore.update` takes it. */
export type RunPatch = Parameters<RunStore['update']>[1]

/** A field of a run record that a change can remove. */
export type ClearableRunField = Exclude<keyof RunPatch, 'status'>

/** Who sent an input, as the log keeps it. */
export interface RecordUser {
  id: string
  tenantId?: string
}

/**
 * A change to the value of one plugin's thread state. `path` names the field
 * to set, from the top of the value. An empty `path` replaces the whole
 * value. Each object on the path that is missing (or is not a plain object)
 * becomes `{}`.
 *
 * ponytail: one operation, "set the value at this path". There is no delete
 * and no array index. To remove a field or change an array, set the parent
 * value (or the whole value) again.
 */
export interface PluginStateDelta {
  path: Array<string>
  /** JSON. */
  value: unknown
}

/**
 * The JSON parts of an interrupted turn: the turn stopped for these
 * interrupts, and a resolve continues it.
 */
export interface InterruptedTurnRecord {
  runId: string
  interrupts: Array<Interrupt>
  /** A routed turn stopped: the messages a resolve continues from. */
  routed?: { messages: Array<UIMessage>; root: boolean }
  /** The part that stopped handed off too: the resolve acts on it. */
  handoff?: Omit<HandoffRecord, 'runId'>
  /** Who sent the input of the stopped turn. */
  user?: RecordUser
  /** The `context` of the stopped turn's input. JSON. */
  context?: unknown
}

// A type, not an interface: a record type must fit the index of `LogRecord`.
/** How an agent run ended, with its raw result or its error. */
export type AgentResultRecord = {
  inputId: string
  status: 'completed' | 'failed' | 'cancelled'
  /** The raw result of the run. JSON. */
  result?: unknown
  error?: { message: string; code?: string }
}

/**
 * The turn overrides that the log can keep: each one is JSON. An adapter
 * object and `tools` are not here, so a run after a restart goes on
 * without them. `liveOnly` names the ones that the turn had.
 */
export interface NamedTurnOverrides {
  /** A key of `defineHarness({ models })`. */
  model?: string
  /** JSON. */
  modelOptions?: Record<string, unknown>
  reasoning?: ReasoningOption
  promptCache?: PromptCacheOptions
  systemPreamble?: Array<string>
  ephemeral?: Array<ModelMessage>
  /** The overrides of the turn that are not JSON, so the log does not keep them. */
  liveOnly?: Array<'adapter' | 'tools'>
}

/**
 * Work that the session does at `at` (epoch ms). With `input`, the session
 * runs the input then, as `user`. With no `input`, it is a wake: a
 * `step.sleep` waits for it, and the host that owns the log then recovers
 * the run.
 */
export type ScheduleRecord = {
  at: number
  input?: HarnessInput
  user?: RecordUser
}

/** A wait as the log keeps it, with what only a question has. */
export type WaitRecord = {
  wait: Wait
  /** When the wait opened (epoch ms). */
  at: number
  /** The answer is a secret: the log never keeps it. */
  secret?: true
  /** A page the user must open before they answer. */
  url?: string
  /**
   * A promise of the host that opened the wait holds it, so only that host
   * can take the answer (an `ask()`). It ends when that host stops.
   */
  live?: true
}

/** A wait of the fold: its record, and how it ended once it did. */
export type WaitState = WaitRecord & {
  outcome?: WaitOutcome
  /** When it ended (epoch ms). */
  settledAt?: number
  /** The answer of a wait that no promise holds. JSON. Never a secret. */
  value?: unknown
}

/** The other end of a transfer: a thread of a harness, in the same tenant. */
export type TransferLink = {
  /** The name of the harness that runs the thread. */
  harness: string
  threadId: string
}

/**
 * One end of a transfer, as the log of each thread keeps it. The log of the
 * target has `from`, the log of the source has `to`. Both have the same
 * `transferId`.
 */
export type TransferRecord = {
  /** The thread that the conversation came from. Only in the target log. */
  from?: TransferLink
  /** The thread that the conversation went to. Only in the source log. */
  to?: TransferLink
  /** Who made the transfer. */
  user?: RecordUser
  /** When the transfer was made (epoch ms). */
  at: number
}

/** The target of a handoff to a person: an operator answers. */
export type HumanTarget = { human: true }

/** True for `{ human: true }`, the target of a handoff to a person. */
export function isHumanTarget(value: unknown): value is HumanTarget {
  return isRecord(value) && value.human === true
}

/**
 * A change of who answers the turns of a thread. An agent name is a root
 * agent of the harness. `null` is the main model. `{ human: true }` is a
 * person: an operator.
 */
export type HandoffRecord = {
  /** Who answered before the handoff. */
  from: string | null | HumanTarget
  /** Who answers from now on. */
  to: string | null | HumanTarget
  /** A note for the target. */
  note?: string
  /** The turn that made the handoff. */
  runId: string
  /**
   * What made the handoff: a `handoff` tool call, agent code, the router,
   * or an operator who ended a handoff to a person.
   */
  by: 'tool' | 'code' | 'router' | 'operator'
  /** The `human` wait that a handoff to a person opens. */
  waitId?: string
  /**
   * The root agents of the turn that handed off to a person. An operator
   * can hand the thread back to one of them.
   */
  agents?: Array<string>
}

/**
 * A person answers the turns of a thread: the `human` wait `waitId` of a
 * handoff is open. `from` answered before the handoff. `agents` are the
 * root agents an operator can hand back to.
 */
export type HumanAnswerer = HumanTarget & {
  waitId: string
  from: string | null
  agents?: Array<string>
}

/**
 * Where the workspace of a thread is, as the session log keeps it. The root
 * is the boundary of the workspace tools.
 *
 * - `'sandbox'`: a sandbox of `provider` with the id `sandboxId`. Another
 *   host can resume it.
 * - `'host'`: a folder on the host `hostId`. Only that host can continue
 *   the thread, so the log is pinned to it. Without `hostId` (a host with
 *   no stable id), every host counts as that host.
 */
export type WorkspaceBinding =
  | { kind: 'sandbox'; provider: string; sandboxId: string; root: string }
  | { kind: 'host'; hostId?: string; root: string }

/**
 * A run of the run tree, with what the session needs to find its input: the
 * input that the run applies, and for an agent run, the `agent` input of the
 * first run of its chain. The fields after `RunNode` are bookkeeping of the
 * session, and can change.
 */
export type RunTreeNode = RunNode & {
  /** @internal The input that the run applies. */
  inputId?: string
  /** @internal The `agent` input of the first run of the chain. */
  chainInputId?: string
  /**
   * @internal The `agent` input of the chain whose code started this run.
   * The tree budget of that chain counts this run, also after a restart.
   */
  parentChainInputId?: string
  /**
   * @internal The start options that the log cannot keep: a function. A run
   * that another host takes over runs without them.
   */
  liveOnly?: Array<'onModelError'>
  /** @internal The `onModelError` start option as data. */
  onModelError?: { retries: 1 | 2; transientOnly?: boolean }
  /**
   * @internal The child id that the model got for a background child of a
   * turn. The node keeps it from the start, before the run record does.
   */
  subagentRunId?: string
}

/**
 * What the log keeps of a run when the owner admits it: the fields that a
 * run record does not have. The status, the result, and the error come from
 * later records.
 */
export type RunNodeRecord = Omit<RunTreeNode, 'status' | 'result' | 'error'>

/**
 * The thread-state records of a session log. Each change to what a record
 * means takes a new record type, never a new shape of one of these.
 */
export type ThreadRecord =
  /** The full thread settings after a change, after validation. */
  | {
      type: 'harness.settings'
      settings: ThreadSettings
      inputId?: string
      user?: RecordUser
    }
  /** One config value. `null` unsets the key. */
  | {
      type: 'harness.config'
      key: string
      value: unknown
      inputId?: string
      user?: RecordUser
    }
  /** A change to the thread state of one plugin. */
  | { type: 'harness.plugin.state'; plugin: string; delta: PluginStateDelta }
  /** A change to one key of the state that the agents of a session share. */
  | { type: 'harness.state'; key: string; delta: PluginStateDelta }
  /** The turn that stopped for interrupts, or `null` when none stands. */
  | { type: 'harness.interrupted'; turn: InterruptedTurnRecord | null }
  /** An agent run ended. */
  | ({ type: 'harness.agent.result'; runId: string } & AgentResultRecord)
  /** The JSON overrides of the turn that input `inputId` starts. */
  | {
      type: 'harness.input.turn'
      inputId: string
      overrides: NamedTurnOverrides
    }
  /** An input to run later. */
  | ({ type: 'harness.schedule'; scheduleId: string } & ScheduleRecord)
  /** A schedule ran, or was cancelled. */
  | { type: 'harness.schedule.done'; scheduleId: string }
  /** A run started. A run id that the fold has already keeps its record. */
  | { type: 'harness.run'; run: RunRecord }
  /** The owner admitted a run of the run tree. */
  | ({ type: 'harness.run.node' } & RunNodeRecord)
  /**
   * A change to a known run. `unset` names the fields that the change
   * removes: JSON has no `undefined`.
   */
  | {
      type: 'harness.run.update'
      runId: string
      patch: RunPatch
      unset?: Array<ClearableRunField>
    }
  /** An interrupt opened. An interrupt id that the fold has already keeps its record. */
  | {
      type: 'harness.interrupt'
      interrupt: Omit<InterruptRecord, 'status' | 'resolvedAt'>
    }
  /** A known interrupt was answered or cancelled at `at` (epoch ms). */
  | {
      type: 'harness.interrupt.end'
      interruptId: string
      status: 'resolved' | 'cancelled'
      at: number
      response?: unknown
    }
  /** A wait opened. A wait id that the fold has already keeps its record. */
  | ({ type: 'harness.wait' } & WaitRecord)
  /** A known wait ended at `at` (epoch ms), with the answer when it has one. */
  | {
      type: 'harness.wait.settled'
      waitId: string
      outcome: WaitOutcome
      at: number
      value?: unknown
    }
  /** A transfer moved the conversation to or from this thread. */
  | ({ type: 'harness.transferred'; transferId: string } & TransferRecord)
  /** Another agent, or the main model, answers the turns from now on. */
  | ({ type: 'harness.handoff' } & HandoffRecord)
  /** The workspace tools bound the workspace of the thread. */
  | { type: 'harness.workspace.bound'; binding: WorkspaceBinding }

/** The record types that {@link foldThreadRecord} folds. */
export const THREAD_RECORD_TYPES = [
  'harness.settings',
  'harness.config',
  'harness.plugin.state',
  'harness.interrupted',
  'harness.agent.result',
  'harness.input.turn',
  'harness.schedule',
  'harness.schedule.done',
  'harness.run',
  'harness.run.update',
  'harness.run.node',
  'harness.interrupt',
  'harness.interrupt.end',
  'harness.wait',
  'harness.wait.settled',
  'harness.transferred',
  'harness.handoff',
  'harness.state',
  'harness.workspace.bound',
] as const satisfies ReadonlyArray<ThreadRecord['type']>

const THREAD_TYPES = new Set<string>(THREAD_RECORD_TYPES)

// The harness wrote every record of these types, so the fields are its own.
function isThreadRecord(record: LogRecord): record is ThreadRecord {
  return THREAD_TYPES.has(record.type)
}

/** The thread state that the records of a session log fold to. */
export interface ThreadStateFold {
  settings: ThreadSettings
  /** Config values by key. */
  config: Map<string, unknown>
  /** The thread state of each plugin, by plugin name. */
  plugins: Map<string, unknown>
  /** The state that the agents of the session share (`ctx.harness.state`), by key. */
  shared: Map<string, unknown>
  /** The turn that stopped for interrupts, or `null`. */
  interrupted: InterruptedTurnRecord | null
  /** By run id. */
  agentResults: Map<string, AgentResultRecord>
  /** By input id. */
  turnOverrides: Map<string, NamedTurnOverrides>
  /** The schedules that did not run yet, by schedule id. */
  schedules: Map<string, ScheduleRecord>
  /** Every run of the thread and of its child runs, by run id, oldest first. */
  runs: Map<string, RunRecord>
  /**
   * The run tree: the turns, agent runs, and commands of the thread, by run
   * id, in the order they were admitted. A run that runs again after a host
   * stop takes the place of the run before it.
   */
  tree: Map<string, RunTreeNode>
  /** Every interrupt of the thread and of its child runs, by id, oldest first. */
  interrupts: Map<string, InterruptRecord>
  /**
   * Every wait that the session opened (questions, human waits), by id,
   * oldest first. The pending ones have no `outcome`. The waits of
   * interrupts are in `interrupts`.
   */
  waits: Map<string, WaitState>
  /** The transfers to or from this thread, by transfer id, oldest first. */
  transfers: Map<string, TransferRecord>
  /**
   * The root agent that answers the turns of this thread, from the last
   * `harness.handoff` record. `null`: the main model answers. A
   * {@link HumanAnswerer}: a person answers, and the session pauses.
   */
  activeAgent: string | null | HumanAnswerer
  /** The workspace of the thread, from the last `harness.workspace.bound` record. */
  workspace: WorkspaceBinding | null
}

/**
 * The thread of the chain of an agent run of the thread `threadId`, where
 * the run keeps its messages: `<threadId>:<agent>:<first input>`. `run`
 * names the run by its run id, or by the `subagentRunId` of its run record.
 * `undefined` when the thread has no such agent run.
 */
export function agentRunThread(
  state: Pick<ThreadStateFold, 'runs' | 'tree'>,
  threadId: string,
  run: { runId: string } | { subagentRunId: string },
) {
  const runId =
    'runId' in run
      ? run.runId
      : [...state.runs.values()].find(
          (record) => record.subagentRunId === run.subagentRunId,
        )?.runId
  const node = runId === undefined ? undefined : state.tree.get(runId)
  if (node?.kind !== 'agent' || node.chainInputId === undefined) return
  return `${threadId}:${node.agent}:${node.chainInputId}`
}

/** The thread state of a log with no thread-state records. */
export function emptyThreadState() {
  const state: ThreadStateFold = {
    settings: {},
    config: new Map(),
    plugins: new Map(),
    shared: new Map(),
    interrupted: null,
    agentResults: new Map(),
    turnOverrides: new Map(),
    schedules: new Map(),
    runs: new Map(),
    tree: new Map(),
    interrupts: new Map(),
    waits: new Map(),
    transfers: new Map(),
    activeAgent: null,
    workspace: null,
  }
  return state
}

/** `current` with `value` at `path`. A copy: `current` does not change. */
function setAt(current: unknown, path: ReadonlyArray<string>, value: unknown) {
  const [head, ...rest] = path
  if (head === undefined) return value
  const base = isPlainObject(current) ? current : {}
  const next: Record<string, unknown> = {
    ...base,
    [head]: setAt(base[head], rest, value),
  }
  return next
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) && !Array.isArray(value)

/**
 * The deltas that turn the plugin state `current` into `next`. When both are
 * plain objects and `next` keeps every field of `current`, one delta for
 * each field whose JSON changed. Else one delta that sets the whole value.
 *
 * @example
 * ```ts
 * pluginStateDeltas({ a: 1, b: 2 }, { a: 1, b: 3 }) // [{ path: ['b'], value: 3 }]
 * ```
 */
export function pluginStateDeltas(current: unknown, next: unknown) {
  const isFieldChange =
    isPlainObject(current) &&
    isPlainObject(next) &&
    Object.keys(current).every((key) => Object.hasOwn(next, key))
  if (!isFieldChange) {
    const whole: Array<PluginStateDelta> = [{ path: [], value: next }]
    return whole
  }
  return Object.keys(next)
    .filter((key) => JSON.stringify(current[key]) !== JSON.stringify(next[key]))
    .map((key) => ({ path: [key], value: next[key] }))
}

// ponytail: the fold changes the maps of its state in place, so a step costs
// O(1), not a copy of the map. Each log folds its own state, and a snapshot
// is a JSON copy, so no other state shares a map. The entries are new
// objects on each change, so an entry that a caller holds does not change.

/** `map` with `key` set to `value`. */
function withEntry<V>(map: Map<string, V>, key: string, value: V) {
  return map.set(key, value)
}

/** `map` without `key`. */
function withoutEntry<V>(map: Map<string, V>, key: string) {
  map.delete(key)
  return map
}

/**
 * How many ended runs, run nodes, interrupts, and agent results the fold
 * keeps, for the history views. Older ended ones leave the fold, so a long
 * thread does not grow its fold and its snapshot with each turn.
 */
export const KEPT_ENDED = 100

/**
 * Drop the oldest entries of `map` (in insertion order) that `isOver` says
 * ended, until `KEPT_ENDED` ended entries stay. ponytail: a scan of the
 * map, which holds `KEPT_ENDED` entries and the live ones.
 */
function trimEnded<V>(map: Map<string, V>, isOver: (value: V) => boolean) {
  let extra = -KEPT_ENDED
  for (const value of map.values()) if (isOver(value)) extra += 1
  for (const [key, value] of map) {
    if (extra <= 0) return
    if (!isOver(value)) continue
    map.delete(key)
    extra -= 1
  }
}

const isRunOver = (run: RunRecord) =>
  run.status === 'completed' ||
  run.status === 'failed' ||
  run.status === 'aborted'
const isNodeOver = (node: RunTreeNode) => isEnded(node.status)
const isInterruptOver = (interrupt: InterruptRecord) =>
  interrupt.status !== 'pending'

/**
 * Drop what the fold of a thread no longer needs: the ended runs, run
 * nodes, interrupts, and agent results past the last `KEPT_ENDED` of each.
 * The log calls it after each record that can end one of them.
 */
export function pruneThreadState(state: ThreadStateFold) {
  trimEnded(state.runs, isRunOver)
  trimEnded(state.tree, isNodeOver)
  trimEnded(state.interrupts, isInterruptOver)
  trimEnded(state.agentResults, () => true)
}

/** The status of a run node for each status of a run record. */
const NODE_STATUS: Record<RunRecord['status'], RunNode['status']> = {
  running: 'running',
  interrupted: 'waiting',
  completed: 'completed',
  failed: 'failed',
  aborted: 'cancelled',
}

/** The kind of a run node for each kind of a run record. */
const NODE_KIND: Record<NonNullable<RunRecord['kind']>, RunNode['kind']> = {
  chat: 'turn',
  agent: 'agent',
  activity: 'tool',
  command: 'command',
  compact: 'command',
}

/** True for a run that ended. Its status does not change again. */
export const isEnded = (status: RunNode['status']) =>
  status === 'completed' || status === 'failed' || status === 'cancelled'

/** `node` with `status`, and with `error` when there is one. */
function withStatus(
  node: RunTreeNode,
  status: RunNode['status'],
  error: RunNode['error'] | undefined,
): RunTreeNode {
  return { ...node, status, ...(error ? { error } : {}) }
}

/**
 * The tree after the run record `run` changed. A known node takes its
 * status, unless the node ended. A new run record makes a node only with
 * `create` and a `kind`: the runs that core writes inside a run (a chat run
 * of an agent, a subagent of a tool call) have no kind, so they never show
 * as a second node.
 */
function treeWithRun(
  tree: Map<string, RunTreeNode>,
  run: RunRecord,
  create: boolean,
) {
  const node = tree.get(run.runId)
  if (node) {
    if (isEnded(node.status)) return tree
    return withEntry(
      tree,
      run.runId,
      withStatus(node, NODE_STATUS[run.status], run.error),
    )
  }
  if (!create || run.kind === undefined) return tree
  const added: RunTreeNode = {
    runId: run.runId,
    kind: NODE_KIND[run.kind],
    status: NODE_STATUS[run.status],
    ...(run.parentRunId !== undefined ? { parentRunId: run.parentRunId } : {}),
    ...(run.agent !== undefined ? { agent: run.agent } : {}),
    // `RunRecord` is a published type: it keeps the user as `principal`.
    ...(run.principal ? { user: run.principal } : {}),
    ...(run.error ? { error: run.error } : {}),
  }
  return withEntry(tree, run.runId, added)
}

/**
 * The thread state after the input `inputId` applied as the run
 * `operationId`. The node of that run starts. A run before it that applied
 * the same input (a host stopped, and this run runs it again) leaves the
 * tree: this run takes its place. `previous` is the run that applied the
 * input before.
 */
export function applyRunNode(
  state: ThreadStateFold,
  applied: { inputId: string; operationId: string; previous?: string },
) {
  const { inputId, operationId, previous } = applied
  let { tree } = state
  if (previous !== undefined && previous !== operationId) {
    if (tree.get(previous)?.inputId === inputId) {
      tree = withoutEntry(tree, previous)
    }
  }
  const node = tree.get(operationId)
  if (node?.inputId === inputId && node.status === 'queued') {
    tree = withEntry(tree, operationId, { ...node, status: 'running' })
  }
  return tree === state.tree ? state : { ...state, tree }
}

/**
 * The thread state after the input `inputId` of the run `operationId`
 * settled. Its node ends, unless it ended already. A run with no run record
 * (a command, a turn that failed before its model call) ends here. An
 * interrupted input does not end its node: its run record says it waits.
 */
export function settleRunNode(
  state: ThreadStateFold,
  settled: { inputId: string; operationId?: string } & SettlementOutcome,
) {
  const node =
    settled.operationId === undefined
      ? undefined
      : state.tree.get(settled.operationId)
  if (!node || node.inputId !== settled.inputId || isEnded(node.status)) {
    return state
  }
  const ended =
    settled.outcome === 'completed'
      ? withStatus(node, 'completed', undefined)
      : settled.outcome === 'failed'
        ? withStatus(node, 'failed', settled.error)
        : settled.outcome === 'aborted'
          ? withStatus(node, 'cancelled', undefined)
          : undefined
  if (!ended) return state
  return { ...state, tree: withEntry(state.tree, node.runId, ended) }
}

/**
 * The thread state after the input `inputId` was refused. A queued run of
 * that input (a start that waited for a slot) ends `failed`. ponytail: it
 * scans the tree, because a refusal names only its input. Refusals are rare.
 */
export function rejectRunNode(
  state: ThreadStateFold,
  rejected: { inputId: string; reason: string },
) {
  const node = [...state.tree.values()].find(
    (item) => item.inputId === rejected.inputId && item.status === 'queued',
  )
  if (!node) return state
  const error = {
    message: `The run was refused: ${rejected.reason}.`,
    code: rejected.reason,
  }
  return {
    ...state,
    tree: withEntry(state.tree, node.runId, withStatus(node, 'failed', error)),
  }
}

/** `node` as the agent result `ended` says the run ended. */
function endedNode(node: RunTreeNode, ended: AgentResultRecord) {
  const { result: _result, error: _error, ...rest } = node
  const next: RunTreeNode = {
    ...rest,
    status: ended.status,
    ...(ended.result !== undefined ? { result: ended.result } : {}),
    ...(ended.error ? { error: ended.error } : {}),
  }
  return next
}

/**
 * Fold one log record into the thread state. It returns the next state, or
 * `state` itself for a record type it does not fold. It changes the maps of
 * `state` in place (see `withEntry`), so fold each log into its own state.
 * The same records always fold to the same state.
 *
 * @example
 * ```ts
 * const state = records.reduce(foldThreadRecord, emptyThreadState())
 * ```
 */
export function foldThreadRecord(state: ThreadStateFold, record: LogRecord) {
  if (!isThreadRecord(record)) return state
  switch (record.type) {
    case 'harness.settings':
      return { ...state, settings: record.settings }
    case 'harness.config':
      return {
        ...state,
        config:
          record.value === null
            ? withoutEntry(state.config, record.key)
            : withEntry(state.config, record.key, record.value),
      }
    case 'harness.plugin.state': {
      const { plugin, delta } = record
      const value = setAt(state.plugins.get(plugin), delta.path, delta.value)
      return { ...state, plugins: withEntry(state.plugins, plugin, value) }
    }
    case 'harness.state': {
      const { key, delta } = record
      const value = setAt(state.shared.get(key), delta.path, delta.value)
      return { ...state, shared: withEntry(state.shared, key, value) }
    }
    case 'harness.interrupted':
      return { ...state, interrupted: record.turn }
    case 'harness.agent.result': {
      const { runId, inputId, status, result, error } = record
      const ended: AgentResultRecord = {
        inputId,
        status,
        ...(result !== undefined ? { result } : {}),
        ...(error ? { error } : {}),
      }
      const node = state.tree.get(runId)
      return {
        ...state,
        agentResults: withEntry(state.agentResults, runId, ended),
        tree: node
          ? withEntry(state.tree, runId, endedNode(node, ended))
          : state.tree,
      }
    }
    case 'harness.input.turn':
      return {
        ...state,
        turnOverrides: withEntry(
          state.turnOverrides,
          record.inputId,
          record.overrides,
        ),
      }
    case 'harness.schedule': {
      const { scheduleId, at, input, user } = record
      const schedule: ScheduleRecord = {
        at,
        ...(input ? { input } : {}),
        ...(user ? { user } : {}),
      }
      return {
        ...state,
        schedules: withEntry(state.schedules, scheduleId, schedule),
      }
    }
    case 'harness.schedule.done':
      return {
        ...state,
        schedules: withoutEntry(state.schedules, record.scheduleId),
      }
    case 'harness.run': {
      const { run } = record
      if (state.runs.has(run.runId)) return state
      return {
        ...state,
        runs: withEntry(state.runs, run.runId, run),
        tree: treeWithRun(state.tree, run, true),
      }
    }
    case 'harness.run.update': {
      const current = state.runs.get(record.runId)
      if (!current) return state
      const next: RunRecord = { ...current, ...record.patch }
      for (const field of record.unset ?? []) delete next[field]
      return {
        ...state,
        runs: withEntry(state.runs, record.runId, next),
        // A change of other fields (a checkpoint) keeps the status of the
        // node.
        tree:
          record.patch.status === undefined
            ? state.tree
            : treeWithRun(state.tree, next, false),
      }
    }
    case 'harness.run.node': {
      const { type: _type, ...fields } = record
      const known = state.tree.get(fields.runId)
      // A node that a run record made first keeps its status.
      const node: RunTreeNode = known
        ? { ...known, ...fields }
        : { ...fields, status: 'queued' }
      return { ...state, tree: withEntry(state.tree, fields.runId, node) }
    }
    case 'harness.interrupt': {
      const { interrupt } = record
      if (state.interrupts.has(interrupt.interruptId)) return state
      const opened: InterruptRecord = { ...interrupt, status: 'pending' }
      return {
        ...state,
        interrupts: withEntry(state.interrupts, interrupt.interruptId, opened),
      }
    }
    case 'harness.interrupt.end': {
      const current = state.interrupts.get(record.interruptId)
      if (!current) return state
      const { response: _response, ...rest } = current
      const ended: InterruptRecord =
        record.status === 'resolved'
          ? {
              ...rest,
              status: 'resolved',
              resolvedAt: record.at,
              ...(record.response !== undefined
                ? { response: record.response }
                : {}),
            }
          : { ...current, status: 'cancelled', resolvedAt: record.at }
      return {
        ...state,
        interrupts: withEntry(state.interrupts, record.interruptId, ended),
      }
    }
    case 'harness.wait': {
      const { type: _type, ...opened } = record
      if (state.waits.has(opened.wait.waitId)) return state
      return {
        ...state,
        waits: withEntry(state.waits, opened.wait.waitId, opened),
      }
    }
    case 'harness.wait.settled': {
      const current = state.waits.get(record.waitId)
      if (!current || current.outcome !== undefined) return state
      const ended: WaitState = {
        ...current,
        outcome: record.outcome,
        settledAt: record.at,
        ...(record.value !== undefined ? { value: record.value } : {}),
      }
      // The `human` wait of a handoff to a person ended (answered,
      // resolved, cancelled, expired): the agent before the handoff answers.
      const active = state.activeAgent
      const isPause = isHumanTarget(active) && active.waitId === record.waitId
      return {
        ...state,
        waits: withEntry(state.waits, record.waitId, ended),
        ...(isPause ? { activeAgent: active.from } : {}),
      }
    }
    case 'harness.transferred': {
      const { type: _type, transferId, ...transfer } = record
      if (state.transfers.has(transferId)) return state
      return {
        ...state,
        transfers: withEntry(state.transfers, transferId, transfer),
      }
    }
    case 'harness.handoff': {
      if (!isHumanTarget(record.to)) {
        return { ...state, activeAgent: record.to }
      }
      // A pause on a wait that nobody can answer: the record is corrupt.
      if (record.waitId === undefined) {
        throw new Error(
          `A harness.handoff record to a person (run ${JSON.stringify(record.runId)}) has no waitId.`,
        )
      }
      // Who answered before stays, for an operator answer `{ resume: true }`.
      const from = isHumanTarget(record.from) ? null : record.from
      const human: HumanAnswerer = {
        human: true,
        waitId: record.waitId,
        from,
        ...(record.agents ? { agents: record.agents } : {}),
      }
      return { ...state, activeAgent: human }
    }
    case 'harness.workspace.bound':
      return { ...state, workspace: record.binding }
    default: {
      const unhandled: never = record
      return unhandled
    }
  }
}
