import {
  EventType,
  INTERRUPT_PAYLOAD_METADATA_KEY,
  compactForModel,
  provideDetachableRun,
  readInterruptBinding,
} from '@tanstack/ai'
import { isRecord } from '../utils'
import type {
  AnyChatMiddleware,
  AnyTool,
  Interrupt,
  Modality,
  ModelMessage,
  PromptCacheOptions,
  Scope,
  StreamChunk,
  SubagentsBag,
} from '@tanstack/ai'
import type { LogRecord, MessageStore } from '@tanstack/ai-persistence'
import type { EventFeed, EventListener, ListenedFeed } from '../feed'
import type { InputState } from '../log'
import type { MountedPlugins } from '../plugins'
import type {
  MediaKind,
  OperationStatus,
  Principal,
  ThreadSettings,
} from '../types'
import type {
  AgentRunInfo,
  InterruptedTurn,
  AgentMessage,
  AgentInputState,
} from './types'

/** Where `stores.metadata` keeps the interrupted turn of each thread. */
export const INTERRUPTED = 'harness:interrupted'

/** Where `stores.metadata` keeps the usage totals of a host without a log. */
export const USAGE = 'harness:usage'

/**
 * The key of a resumable agent run in the session log: its steps, and the
 * tool results of its chat. Not a tool call id, so a turn never reads them.
 */
export const agentKey = (inputId: string) => `agent:${inputId}`

/** The chain fields that the `agent` input of a first run keeps. */
export const chainFields = (first: AgentInputState) => ({
  runInputId: first.inputId,
  target: first.input.agent,
  input: first.input.input,
  options: {
    wake: first.input.detached === true,
    ...(first.input.resume ? { resume: true } : {}),
    ...(first.input.attach ? { attach: first.input.attach } : {}),
  },
  ...(first.principal ? { principal: first.principal } : {}),
  ...(first.input.parentRunId ? { parentRunId: first.input.parentRunId } : {}),
})

/** A message to an agent run as a user message. Its id is its input id. */
export const asUserMessage = (sent: AgentMessage): ModelMessage => ({
  id: sent.inputId,
  role: 'user',
  content: sent.message,
})

/** True for the `agent` input of a first run. */
export const isAgentInput = (
  input: InputState | undefined,
): input is AgentInputState => input?.input.op === 'agent'

/**
 * The `agent` input of the chain that `input` runs: the input itself, or
 * the first run of a follow-up message. `undefined` for other inputs, and
 * for a steer that joined a run.
 */
export const chainInputOf = (
  inputs: ReadonlyMap<string, InputState>,
  input: InputState,
): AgentInputState | undefined => {
  if (isAgentInput(input)) return input
  if (input.input.op !== 'agentMessage' || input.into !== undefined) {
    return undefined
  }
  const first = inputs.get(input.input.run ?? '')
  return isAgentInput(first) ? first : undefined
}

/** The `agentRuns()` status of a live run. */
export const runStatus = (status: OperationStatus): AgentRunInfo['status'] => {
  switch (status) {
    case 'accepted':
      return 'queued'
    case 'interrupted':
      return 'running'
    case 'running':
    case 'completed':
    case 'failed':
    case 'cancelled':
      return status
  }
}

/** The `agentRuns()` status of a run in the log, from how it ended. */
export const loggedStatus = (input: InputState): AgentRunInfo['status'] => {
  const outcome = input.settlement?.outcome
  switch (outcome) {
    case undefined:
      return 'running'
    case 'aborted':
      return 'cancelled'
    case 'failed':
      return 'failed'
    case 'completed':
    case 'interrupted':
      return 'completed'
  }
}

/** True for an interrupted turn as `stores.metadata` gives it back. */
export function isInterruptedTurn(value: unknown): value is InterruptedTurn {
  if (!isRecord(value) || typeof value.runId !== 'string') return false
  if (!Array.isArray(value.interrupts)) return false
  if (!value.interrupts.every((item) => isRecord(item))) return false
  const { routed, principal } = value
  const isPrincipal =
    principal === undefined ||
    (isRecord(principal) && typeof principal.id === 'string')
  return (
    isPrincipal &&
    (routed === undefined ||
      (isRecord(routed) &&
        Array.isArray(routed.messages) &&
        typeof routed.root === 'boolean'))
  )
}

/** The connector a sign-in interrupt (`require` with `wait`) waits for. */
export function signInConnector(interrupt: Interrupt | undefined) {
  if (interrupt?.reason !== 'auth_required') return undefined
  const payload = interrupt.metadata?.[INTERRUPT_PAYLOAD_METADATA_KEY]
  const request = isRecord(payload) ? payload.request : undefined
  return isRecord(request) && typeof request.connector === 'string'
    ? request.connector
    : undefined
}

/** Limits for a harness's children when `subagents.limits` is not set. */
export const DEFAULT_SUBAGENT_LIMITS = {
  maxDepth: 2,
  maxConcurrent: 3,
  maxCalls: 12,
}

export function createInputId(): string {
  return `in-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

export function createMessageId(): string {
  return `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

export function customEvent(
  name: string,
  value: Record<string, unknown>,
): StreamChunk {
  return { type: EventType.CUSTOM, name, value, timestamp: Date.now() }
}

export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

/** A `promptCache` option as an object. A string is the retention alone. */
export const cacheObject = (option: PromptCacheOptions | undefined) =>
  typeof option === 'string' ? { retention: option, key: undefined } : option

/** The credential scope of `principal` in a thread, with only the set fields. */
export const scopeOf = (
  threadId: string,
  principal: Principal | undefined,
): Scope => ({
  threadId,
  ...(principal ? { userId: principal.id } : {}),
  ...(principal?.tenantId ? { tenantId: principal.tenantId } : {}),
})

/** What the log and the inbox keep of a principal: its id and tenant. */
/** The `metadata.tanstack` of a logged event, if it has one. */
export const tanstackOf = (event: Record<string, unknown>) =>
  isRecord(event.metadata) && isRecord(event.metadata.tanstack)
    ? event.metadata.tanstack
    : undefined

/** The tool call an interrupt waits on: an approval or a client tool. */
export const toolCallOf = (interrupt: Interrupt) => {
  const binding = readInterruptBinding(interrupt)
  return binding && 'toolCallId' in binding ? binding.toolCallId : undefined
}

export const storedPrincipal = (principal: Principal | undefined) =>
  principal
    ? {
        principal: {
          id: principal.id,
          ...(principal.tenantId ? { tenantId: principal.tenantId } : {}),
        },
      }
    : {}

/** One sender: the same id and tenant, or no principal on both. */
export const isSameSender = (
  a: Pick<Principal, 'id' | 'tenantId'> | undefined,
  b: Pick<Principal, 'id' | 'tenantId'> | undefined,
) => a?.id === b?.id && a?.tenantId === b?.tenantId

/**
 * What makes two inputs with one id the same input: the payload and the
 * sender. The same id from another sender is a conflict, not a retry.
 */
export const inputKey = (
  input: unknown,
  principal: Pick<Principal, 'id' | 'tenantId'> | undefined,
) => JSON.stringify([input, principal?.id ?? null, principal?.tenantId ?? null])

export const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> =>
  isRecord(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value))

/**
 * The chat() context of a turn. Two plain objects merge, and the harness
 * value wins, so a client cannot replace a server value. Else the harness
 * value when it is set, else the input's.
 */
export function turnContext(harness: unknown, input: unknown) {
  if (isPlainObject(harness) && isPlainObject(input)) {
    return { ...input, ...harness }
  }
  return harness !== undefined ? harness : input
}

/** Where `stores.metadata` keeps the stored settings of each thread. */
export const SETTINGS = 'harness:settings'

export const SETTING_KEYS = new Set<string>([
  'model',
  'reasoning',
  'instructions',
  'tools',
  'plugins',
  'cwd',
])

export const isNames = (value: unknown): value is Array<string> =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

/** The names a setting can point at: the harness models and plugins. */
export interface SettingNames {
  models: ReadonlySet<string>
  plugins: ReadonlySet<string>
}

/** One checked setting value. Throws with a short reason for a bad one. */
export function checkSetting(
  key: string,
  value: unknown,
  names: SettingNames,
): unknown {
  if (key === 'model') {
    if (typeof value === 'string' && names.models.has(value)) return value
    throw new Error(
      `Unknown model ${JSON.stringify(value)}. Add it to defineHarness({ models }).`,
    )
  }
  if (key === 'instructions' || key === 'cwd') {
    if (typeof value === 'string') return value
    throw new Error(`The setting "${key}" must be a string.`)
  }
  if (key === 'reasoning') {
    // chat() checks the level itself.
    const isOption =
      typeof value === 'string' ||
      (isRecord(value) && typeof value.level === 'string')
    if (isOption) return value
    throw new Error('The setting "reasoning" must be a level or { level }.')
  }
  if (key === 'tools') {
    if (isNames(value)) return [...value]
    if (isRecord(value) && isNames(value.remove)) {
      return { remove: [...value.remove] }
    }
    throw new Error(
      'The setting "tools" must be a list of tool names or { remove: [names] }.',
    )
  }
  // `plugins`
  if (!isRecord(value) || !isNames(value.remove)) {
    throw new Error('The setting "plugins" must be { remove: [plugin names] }.')
  }
  const unknown = value.remove.find((name) => !names.plugins.has(name))
  if (unknown !== undefined) {
    throw new Error(`Unknown plugin ${JSON.stringify(unknown)}.`)
  }
  return { remove: [...value.remove] }
}

/**
 * `settings` with `change` applied: `null` clears a field, a missing field
 * stays. Throws with a short reason for an unknown field or a bad value.
 */
export function changeSettings(
  settings: ThreadSettings,
  change: unknown,
  names: SettingNames,
): ThreadSettings {
  if (!isRecord(change)) throw new Error('The settings must be an object.')
  const next: Record<string, unknown> = { ...settings }
  for (const [key, value] of Object.entries(change)) {
    if (!SETTING_KEYS.has(key)) {
      throw new Error(`Unknown setting ${JSON.stringify(key)}.`)
    }
    if (value === null) delete next[key]
    else if (value !== undefined) next[key] = checkSetting(key, value, names)
  }
  // `checkSetting` gave each field its type.
  return next as ThreadSettings
}

/**
 * `mounted` without what the `removed` plugins give a turn: their tools,
 * prompts, middleware, adapter picks, discoverers, and preparers.
 */
export function withoutPlugins(
  mounted: MountedPlugins,
  removed: ReadonlySet<string>,
): MountedPlugins {
  const { owners } = mounted
  const toolOwners = new Map(
    owners.tools.map((entry) => [entry.name, entry.owner]),
  )
  const isKept = (owner: string | undefined) =>
    owner === undefined || !removed.has(owner)
  return {
    ...mounted,
    tools: mounted.tools.filter((tool) => isKept(toolOwners.get(tool.name))),
    prompts: mounted.prompts.filter((_prompt, index) =>
      isKept(owners.prompts[index]?.owner),
    ),
    middleware: mounted.middleware.filter((_item, index) =>
      isKept(owners.middleware[index]),
    ),
    adapters: mounted.adapters.filter((_pick, index) =>
      isKept(owners.adapters[index]),
    ),
    discoverers: mounted.discoverers.filter((item) => isKept(item.owner)),
    preparers: mounted.preparers.filter((item) => isKept(item.owner)),
  }
}

/**
 * The tools that the `tools` setting keeps: the listed ones, or all but the
 * removed ones. The tools named in `keep` (the turn's own) always stay.
 */
export function settingTools(
  tools: Array<AnyTool>,
  setting: ThreadSettings['tools'],
  keep: ReadonlySet<string>,
) {
  if (setting === undefined) return tools
  const isList = Array.isArray(setting)
  const names = new Set(isList ? setting : setting.remove)
  return tools.filter(
    (tool) => keep.has(tool.name) || names.has(tool.name) === isList,
  )
}

/**
 * The metadata of the user message of a wake turn: the harness sent it (a
 * background job ended), not the user. The model gets it as usual. A view
 * does not show it as something the user said.
 */
export const WAKE_METADATA = { harness: { wake: true } }

/**
 * The transcript message of a `reset()`: a user message with
 * `metadata.harness.reset`. Its content is the note, which the model sees
 * first. The id comes from the input, so the marker goes in once.
 */
export function resetMarker(
  inputId: string,
  note: string | undefined,
): ModelMessage {
  return {
    id: `reset-${inputId}`,
    role: 'user',
    content: note ?? '',
    metadata: { harness: { reset: note !== undefined ? { note } : {} } },
  }
}

export const isResetMarker = (message: ModelMessage) =>
  isRecord(message.metadata?.harness) &&
  isRecord(message.metadata.harness.reset)

/**
 * What the model sees of `messages`: only the messages after the last reset
 * marker. A marker with a note stays, as a plain user message. Returns
 * `messages` itself when it has no marker.
 */
export function resetContext(
  messages: Array<ModelMessage>,
): Array<ModelMessage> {
  const at = messages.findLastIndex(isResetMarker)
  const marker = messages[at]
  if (!marker) return messages
  const after = messages.slice(at + 1)
  if (marker.content === '') return after
  const { metadata: _reset, ...note } = marker
  return [note, ...after]
}

/**
 * Gives the model only the context after the last reset. It changes only
 * what the adapter gets (`providerMessages`), so every save keeps the
 * messages before the reset.
 */
export const resetCut: AnyChatMiddleware = {
  name: 'harness:reset',
  onConfig: (ctx, config) => {
    if (ctx.phase !== 'init' && ctx.phase !== 'beforeModel') return undefined
    const messages = config.providerMessages ?? config.messages
    const cut = resetContext(messages)
    return cut === messages ? undefined : { providerMessages: cut }
  },
}

/**
 * Gives the next model call the `pending` messages after its context, and
 * empties `pending`. It changes only what the adapter gets
 * (`providerMessages`), so no save keeps them.
 */
export function ephemeralCall(pending: Array<ModelMessage>): AnyChatMiddleware {
  return {
    name: 'harness:ephemeral',
    onConfig: (ctx, config) => {
      if (ctx.phase !== 'beforeModel' || pending.length === 0) return undefined
      const messages = config.providerMessages ?? config.messages
      return { providerMessages: [...messages, ...pending.splice(0)] }
    },
  }
}

/**
 * Gives each model call of a turn the `ephemeral` messages of its input,
 * after `start`: the last message of the context when the turn started. The
 * messages that the turn adds come after them. It changes only what the
 * adapter gets (`providerMessages`), so no save keeps them.
 */
export function turnEphemeral(
  ephemeral: ReadonlyArray<ModelMessage>,
  start: ModelMessage,
): AnyChatMiddleware {
  const isStart = (message: ModelMessage) =>
    start.id !== undefined
      ? message.id === start.id
      : JSON.stringify(message) === JSON.stringify(start)
  return {
    name: 'harness:turn-ephemeral',
    onConfig: (ctx, config) => {
      if (ctx.phase !== 'beforeModel') return undefined
      const messages = config.providerMessages ?? config.messages
      // Count from the end: a reset cut or a middleware can change the start
      // of what the adapter gets. When a compaction dropped `start`, they go
      // first.
      const after =
        config.messages.length - 1 - config.messages.findLastIndex(isStart)
      const at = Math.max(0, messages.length - after)
      return {
        providerMessages: [
          ...messages.slice(0, at),
          ...ephemeral,
          ...messages.slice(at),
        ],
      }
    },
  }
}

/** A short transcript note about how an agent ended, for the next turn. */
export function referenceNote(
  agent: string,
  result: unknown,
  ended: 'finished' | 'failed' = 'finished',
): string {
  const body =
    typeof result === 'string'
      ? result
      : JSON.stringify(compactForModel(result))
  const clipped = body.length > 2000 ? `${body.slice(0, 2000)}...` : body
  return `[${agent} ${ended}] ${clipped}`
}

/** Why recovery fails an agent run whose host stopped. */
export const AGENT_STOPPED = 'The host stopped during this agent run.'

/**
 * The kinds a model reads: the adapter's input list, narrowed by
 * `media.accepts`. Either one alone when only one is known, and `undefined`
 * (send every kind) when neither is.
 */
export function acceptedKinds(
  modalities: ReadonlyArray<Modality> | undefined,
  accepts: ReadonlyArray<MediaKind> | undefined,
) {
  if (modalities === undefined || accepts === undefined)
    return accepts ?? modalities
  return accepts.filter((kind) => modalities.includes(kind))
}

/** The inputs that run as chat turns. They settle, and so do agent inputs. */
export const CHAT_OPS = new Set<string>([
  'prompt',
  'steer',
  'followUp',
  'continue',
  'resolve',
])

/** The inputs that leave work to do: the thread is busy until they end. */
export const WORK_OPS = new Set<string>([
  'prompt',
  'steer',
  'followUp',
  'continue',
  'resolve',
  'reset',
  'agent',
  'agentMessage',
])

/** The inputs that change a waiting input. */
export const CONTROL_OPS = new Set<string>(['cancelInput', 'setDelivery'])

/** Why a turn stops when its input passes its time limit. */
export const TIMEOUT_REASON = 'harness:input-timeout'

/** What the model gets after its partial answer, on a `'continue'`. */
export const CONTINUE_NOTE =
  'Your last answer stopped early because of an error. Continue from the exact point where it stopped. Do not repeat the text you already wrote.'

/**
 * Why work stops at `close({ recoverable: true })`. A user cancel stops it
 * with `RUN_CANCEL_REASON`.
 */
export const SHUTDOWN_REASON = 'harness:shutdown'

/**
 * A shutdown abort is a detach, not an end: `withPersistence` then writes no
 * aborted state to the run record. It goes before `withPersistence`, which
 * reads the detach in its own `onAbort`.
 */
export const detachOnShutdown: AnyChatMiddleware = {
  name: 'harness:detach-on-shutdown',
  onAbort: (ctx, info) => {
    if (info.reason === SHUTDOWN_REASON) provideDetachableRun(ctx, true)
  },
}

/** Why a turn fails when no option gives it an adapter. */
export const NO_MODEL =
  'This turn has no model. Set `adapter` in defineHarness, return one from a plugin `adapter()`, or pass `overrides.adapter` to the turn.'

/**
 * The text of the last assistant message: the answer of an operation rebuilt
 * from the log, or of a routed turn.
 */
export function lastAssistantText(messages: ReadonlyArray<ModelMessage>) {
  const last = messages.findLast((message) => message.role === 'assistant')
  return typeof last?.content === 'string' ? last.content : ''
}

/**
 * True when chat() runs its routed path for this bag: the router picks, and
 * the engine does not run. So the middleware that gives the engine its
 * history and its run lease does not run, and the turn does that work.
 */
export function isRoutedBag(
  bag: Pick<SubagentsBag, 'agents' | 'router'> | undefined,
) {
  return bag !== undefined && bag.agents.length > 0 && bag.router !== undefined
}

/**
 * Middleware that keeps the override tools of a turn. A middleware `onConfig`
 * can return a tool list without them, and this adds back each one whose
 * name is missing.
 */
export function keepTurnTools(kept: ReadonlyArray<AnyTool>) {
  return {
    name: 'harness:turn-tools',
    onConfig: (ctx, config) => {
      if (ctx.phase !== 'init' && ctx.phase !== 'beforeModel') return
      const names = new Set(config.tools.map((tool) => tool.name))
      const missing = kept.filter((tool) => !names.has(tool.name))
      if (missing.length === 0) return
      return { tools: [...config.tools, ...missing] }
    },
  } satisfies AnyChatMiddleware
}

/** The turn has its final answer: an assistant message with no open tool call after it was applied. */
export function hasFinalAnswer(
  messages: ReadonlyArray<ModelMessage>,
  appliedAt: number,
) {
  const last = messages.at(-1)
  return (
    messages.length > appliedAt &&
    last?.role === 'assistant' &&
    (last.toolCalls?.length ?? 0) === 0
  )
}

/** Throw for a record that a host may not write. */
export function checkHostRecords(records: ReadonlyArray<LogRecord>) {
  for (const record of records) {
    if (record.type.startsWith('harness.')) {
      throw new Error(
        `The record type ${JSON.stringify(record.type)} is reserved for the harness.`,
      )
    }
    if (record.thread !== undefined && typeof record.thread !== 'string') {
      throw new Error(
        'The thread field of a log record must be a string: the thread id of a session of the same log.',
      )
    }
  }
}

export const notOpen = () =>
  Promise.reject(new Error('The session is not open yet.'))

/** The message store of a durable session before `open()` reads its log. */
export const notOpenMessages: MessageStore = {
  loadThread: notOpen,
  saveThread: notOpen,
}

/**
 * `feed`, then `notifyHost` and each of `listeners` after each publish. This
 * is how the host and `onEvent` see events. The caller keeps `listeners`, so
 * they survive a new tap of another feed.
 */
export function tapFeed(
  feed: EventFeed,
  notifyHost: (event: StreamChunk) => void,
  listeners: Set<EventListener>,
): ListenedFeed {
  return {
    publish: (operationId, event) => {
      feed.publish(operationId, event)
      notifyHost(event)
      const report = (error: unknown) =>
        console.error(
          '[@tanstack/ai-harness] An onEvent listener threw.',
          error,
        )
      for (const listener of [...listeners]) {
        // A listener that an earlier listener stopped gets nothing.
        if (!listeners.has(listener)) continue
        try {
          const result: unknown = listener({ operationId, event })
          if (result instanceof Promise) result.catch(report)
        } catch (error) {
          report(error)
        }
      }
    },
    listen: (listener) => {
      // A new entry per call: a listener added twice is called twice.
      const entry: EventListener = (value) => listener(value)
      listeners.add(entry)
      return () => {
        listeners.delete(entry)
      }
    },
    head: () => feed.head(),
    read: (options) => feed.read(options),
    close: () => feed.close(),
  }
}
