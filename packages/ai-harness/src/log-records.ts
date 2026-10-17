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
import type { HarnessInput, ThreadSettings } from './types'

/** A change to a run record, as `RunStore.update` takes it. */
export type RunPatch = Parameters<RunStore['update']>[1]

/** A field of a run record that a change can remove. */
export type ClearableRunField = Exclude<keyof RunPatch, 'status'>

/** Who sent an input, as the log keeps it. */
export interface RecordPrincipal {
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
  /** Who sent the input of the stopped turn. */
  principal?: RecordPrincipal
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

/** An input that the session runs at `at` (epoch ms). */
export type ScheduleRecord = {
  at: number
  input: HarnessInput
}

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
      principal?: RecordPrincipal
    }
  /** One config value. `null` unsets the key. */
  | {
      type: 'harness.config'
      key: string
      value: unknown
      inputId?: string
      principal?: RecordPrincipal
    }
  /** A change to the thread state of one plugin. */
  | { type: 'harness.plugin.state'; plugin: string; delta: PluginStateDelta }
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
  'harness.interrupt',
  'harness.interrupt.end',
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
  /** Every interrupt of the thread and of its child runs, by id, oldest first. */
  interrupts: Map<string, InterruptRecord>
}

/** The thread state of a log with no thread-state records. */
export function emptyThreadState() {
  const state: ThreadStateFold = {
    settings: {},
    config: new Map(),
    plugins: new Map(),
    interrupted: null,
    agentResults: new Map(),
    turnOverrides: new Map(),
    schedules: new Map(),
    runs: new Map(),
    interrupts: new Map(),
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

/** A copy of `map` with `key` set to `value`. */
function withEntry<V>(map: Map<string, V>, key: string, value: V) {
  return new Map(map).set(key, value)
}

/** A copy of `map` without `key`, or `map` when it has no `key`. */
function withoutEntry<V>(map: Map<string, V>, key: string) {
  if (!map.has(key)) return map
  const next = new Map(map)
  next.delete(key)
  return next
}

/**
 * Fold one log record into the thread state. It is pure: it returns a new
 * state, or `state` itself for a record type it does not fold. It never
 * changes `state`. So the same records always fold to the same state.
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
      return {
        ...state,
        agentResults: withEntry(state.agentResults, runId, ended),
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
      const { scheduleId, at, input } = record
      return {
        ...state,
        schedules: withEntry(state.schedules, scheduleId, { at, input }),
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
      return { ...state, runs: withEntry(state.runs, run.runId, run) }
    }
    case 'harness.run.update': {
      const current = state.runs.get(record.runId)
      if (!current) return state
      const next: RunRecord = { ...current, ...record.patch }
      for (const field of record.unset ?? []) delete next[field]
      return { ...state, runs: withEntry(state.runs, record.runId, next) }
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
    default: {
      const unhandled: never = record
      return unhandled
    }
  }
}
