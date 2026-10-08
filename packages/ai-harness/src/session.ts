import {
  EventType,
  INTERRUPT_PAYLOAD_METADATA_KEY,
  LogRecordsCapability,
  RUN_CANCEL_REASON,
  StreamProcessor,
  SubagentBudget,
  chat,
  compactForModel,
  convertSchemaToJsonSchema,
  createSubagentId,
  maxIterations,
  modelMessagesToUIMessages,
  provideDetachableRun,
  provideLogRecords,
  readInterruptBinding,
  runAgentStream,
  validateWithStandardSchema,
} from '@tanstack/ai'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { credentialsFor, providerKeysFor } from './auth'
import { checkConfigValue } from './config'
import { LogConflictError, withPersistence } from '@tanstack/ai-persistence'
import { AgentRegistry } from './agents'
import { SessionFeed } from './feed'
import { isRecord } from './utils'
import { bindDurable, createToolStep } from './durable-tool'
import {
  commonPrefix,
  engineMessageStore,
  revertOf,
  sessionMessageStore,
  stepKey,
} from './log'
import { createMediaStore, mediaCapture, mediaMiddleware } from './media'
import { mediaIdOf, mediaOfMessage, mediaPart } from './media-ref'
import { OperationImpl } from './operation'
import {
  CapabilityValues,
  RevertFiles,
  SessionMetadata,
  mountPlugins,
} from './plugins'
import {
  CUT_OFF_NOTE,
  LEASE,
  checkpointMiddleware,
  findCrashedRuns,
  holdRunLease,
  repairTranscript,
} from './resume'
import { HARNESS_EVENTS, InputRejectedError } from './types'
import { addUsage, callUsage, emptyUsage, isSessionUsage } from './usage'
import type {
  AgentStarter,
  AnyChatMiddleware,
  AnyTextAdapter,
  AnyTool,
  Interrupt,
  Modality,
  ModelMessage,
  PromptCacheOptions,
  ProviderKeys,
  ResolvedPromptCache,
  RunAgentResumeItem,
  RunRecord,
  SchemaInput,
  Scope,
  StreamChunk,
  SubagentBinding,
  SubagentRouterPick,
  SubagentsBag,
  ToolExecutionContext,
  UIMessage,
} from '@tanstack/ai'
import type {
  AIPersistence,
  ArtifactStore,
  BlobBody,
  BlobRange,
  BlobStore,
  ChatTranscriptStores,
  CredentialStore,
  GenerationRunStore,
  InboxEntry,
  InboxStore,
  LogRecord,
  LogStore,
  MessageStore,
  SessionIndexStore,
} from '@tanstack/ai-persistence'
import type { AuthRequiredError, CredentialsAccess } from './auth'
import type { EventFeed } from './feed'
import type {
  HarnessRecord,
  InputState,
  LogWriter,
  ProjectOptions,
  RevertState,
} from './log'
import type { DurableBind } from './durable-tool'
import type { LeaseOptions } from './resume'
import type { MediaStore } from './media'
import type { PluginSessionApi, Question } from './commands'
import type { ConfigOption } from './config'
import type { SessionUsage, UsageCall } from './usage'
import type {
  AgentInputOf,
  AgentRegistryView,
  AgentResultOf,
  AnyAgent,
} from './agents'
import type { AnyHarness, HarnessAgentsOf } from './define'
import type { RecoverDecision, TurnAdditions } from './turn'
import type { HarnessPersistence, SessionIndexWriter } from './host'
import type {
  AgentGroup,
  HarnessPlugin,
  MountedPlugins,
  PluginAgentActions,
  PluginServices,
  PluginState,
} from './plugins'
import type {
  AgentRun,
  BusyPolicy,
  ChatTurnResult,
  Cursor,
  HarnessInput,
  InputSettlement,
  MediaKind,
  MediaRecord,
  Operation,
  OperationStatus,
  Principal,
  Receipt,
  SessionEvent,
  ThreadSettings,
  ThreadSettingsChange,
  TurnInfo,
  TurnOverrides,
  UserInput,
  WaitingInput,
} from './types'

/** Options for running an agent from code. */
export interface AgentRunOptions {
  /**
   * How the main model learns about the result or the error on its next
   * turn: `'reference'` (default) adds a short note to the transcript,
   * `'none'` adds nothing.
   */
  attach?: 'reference' | 'none'
}

/** Options for starting an agent in the background. */
export interface AgentStartOptions extends AgentRunOptions {
  /**
   * When the agent finishes or fails, start a new chat turn with its result
   * or its error. On a durable host, this also occurs when the host stopped
   * during the run.
   */
  wake?: boolean
  /**
   * On a durable host, when the host stops during the run, the host that
   * takes over runs the agent again with the same input, instead of failing
   * it. The agent code runs again from its start: put each side effect in
   * `ctx.step.do(name, fn)`, so a finished step returns its stored value.
   * Its `ctx.chat` calls continue from their saved transcript. After
   * `durability.maxAttempts` runs (default 10), the run fails with
   * `attempts_exhausted`. A host without `stores.log` throws at start.
   */
  resume?: boolean
}

/** One agent run as a child of the session thread. */
interface AgentChild {
  /** The run id of the child. Its index entry is `subagent:<subagentRunId>`. */
  subagentRunId: string
  /** The `subagent` tool call that started the run. */
  parentToolCallId?: string
  /** Text for an agent without `inputSchema`: one user message at the end. */
  prompt?: string
}

type RunArgs<TAgent, TOptions> =
  AgentInputOf<TAgent> extends undefined
    ? [input?: undefined, options?: TOptions]
    : [input: AgentInputOf<TAgent>, options?: TOptions]

/** Run one agent of a session, typed from its definition. */
export interface AgentHandle<TAgent> {
  run: (
    ...args: RunArgs<TAgent, AgentRunOptions>
  ) => Operation<AgentResultOf<TAgent>>
  start: (
    ...args: RunArgs<TAgent, AgentStartOptions>
  ) => AgentRun<AgentResultOf<TAgent>>
}

/** A handle for an agent picked by name at runtime. */
export interface DynamicAgentHandle {
  run: (input?: unknown, options?: AgentRunOptions) => Operation<unknown>
  start: (input?: unknown, options?: AgentStartOptions) => AgentRun<unknown>
}

/** `session.agents`: one typed handle per registered agent name. */
export type AgentHandles<THarness> = {
  [TAgent in HarnessAgentsOf<THarness> as TAgent['name']]: AgentHandle<TAgent>
}

/** One agent run, as `session.agentRuns()` lists it. */
export interface AgentRunInfo {
  operationId: string
  agent: string
  /** `queued`: a follow-up that waits for the run before it. */
  status: 'running' | 'queued' | 'completed' | 'failed' | 'cancelled'
  /** The run whose agent code started this run. */
  parentRunId?: string
  /** Who the run runs for. */
  principal?: Principal
}

/** What a session looks like right now. */
export interface SessionSnapshot {
  threadId: string
  /**
   * `running`: a chat turn runs. `requires_action`: the last turn stopped for
   * outside input. `idle`: ready for a prompt (agents may still run).
   */
  status: 'idle' | 'running' | 'requires_action'
  activeOperations: Array<{
    id: string
    kind: string
    agent?: string
    /**
     * Every event of this operation comes after this cursor. Pass it as
     * `from` to `events()` to read the operation from its first event.
     */
    startedCursor?: Cursor
  }>
  queuedTurns: number
  /**
   * The inputs that wait, in the order they run: `session.inputs()`. A
   * session always sets it. A snapshot built by hand (a test fixture) can
   * leave it out.
   */
  waitingInputs?: Array<WaitingInput>
  pendingInterrupts: Array<Interrupt>
  /** Questions a command or a plugin asked, waiting for `session.answer`. */
  pendingQuestions: Array<{
    questionId: string
    message: string
    schema?: unknown
    /** The answer is a secret (a key or a password). Hide it as the user types. */
    secret?: boolean
    /** A page the user must open before they answer. Show the link. */
    url?: string
  }>
  /** The state of each plugin that uses `ctx.state`, by plugin name. */
  plugins: Record<string, unknown>
  /** The token usage of the thread, the same as `session.usage()`. */
  usage: SessionUsage
  /** The cursor of the newest event. */
  cursor: Cursor
}

/** The resolved plugin plan of a session, for debugging and tooling. */
export interface SessionInspection {
  plugins: MountedPlugins['owners']['plugins']
  tools: MountedPlugins['owners']['tools']
  prompts: MountedPlugins['owners']['prompts']
  commands: Array<{ name: string; owner: string }>
  config: Array<{ key: string; owner: string }>
  extensionPoints: Record<string, Array<string>>
  agents: Array<string>
}

/** What a UI can show and run in a session: commands, settings, and tools. */
export interface SessionDescription {
  commands: Array<{
    name: string
    description: string
    owner: string
    /** The command input as JSON Schema, when it has one. */
    input?: unknown
  }>
  config: Array<{
    key: string
    owner: string
    value: unknown
    option: ConfigOption
  }>
  tools: SessionInspection['tools']
  /** The stored settings of the thread (`session.configure`). */
  settings?: ThreadSettings
  /** The names of `defineHarness({ models })`, for a model menu. */
  models?: Array<string>
}

/** What the host hands a new session. */
export interface SessionDependencies {
  harness: AnyHarness
  threadId: string
  persistence: HarnessPersistence
  inbox: InboxStore
  credentials: CredentialStore
  /** Where media lives: file records, bytes, and generation runs. */
  media: AIPersistence<{
    artifacts: ArtifactStore
    blobs: BlobStore
    generationRuns: GenerationRunStore
  }>
  principal?: Principal
  /** Identifies this host on run leases. */
  hostId: string
  /** Writes the session index entry of the thread. */
  index: SessionIndexWriter
  /** The session log of a durable host. */
  log?: {
    store: LogStore
    project?: ProjectOptions
    /** The view of this session in its shared log. */
    open: (
      threadId: string,
      onFailure: (error: unknown) => void,
    ) => Promise<LogWriter>
  }
  /** The log of the session. Default: the thread id. */
  logId: string
  lease?: LeaseOptions
  /** The `promptCache` of `host.open()`. It overrides the harness value. */
  promptCache?: PromptCacheOptions
  /** Gets each event the session publishes, after the feed has it. */
  onEvent: (event: StreamChunk) => void
  onClose: () => void
}

interface QueuedTurn {
  operation: OperationImpl<ChatTurnResult>
  message?: UserInput
  resume?: Array<RunAgentResumeItem>
  /** A resolve: the interrupted turn it answers. */
  answers?: InterruptedTurn
  /** A `resume` input: the interrupted run it continues. */
  parentRunId?: string
  inputId?: string
  /** The settings of this one turn. Kept in memory only, not in the log. */
  overrides?: TurnOverrides
  /** Who sent the input. Its credentials and keys run the turn. */
  principal?: Principal
  /** The `context` of the input. */
  context?: unknown
  /**
   * The message of a turn that recovery runs again. The transcript has it
   * already, so only plugins and the router read it.
   */
  sentMessage?: UserInput
  /** A `reset()`: it adds its marker to the transcript and runs no model. */
  reset?: { note?: string }
  /** A `continue()`: it runs only when the model can answer the transcript. */
  isContinue?: boolean
}

/**
 * A message for the running turn. A steer that the turn never reached (no
 * further model call) runs as the next turn instead.
 */
interface WaitingSteer {
  inputId: string
  message: UserInput
  operation?: OperationImpl<ChatTurnResult>
  /** Used only when the steer runs as its own turn. A join ignores them. */
  overrides?: TurnOverrides
  principal?: Principal
  /** Used only when the steer runs as its own turn, as `overrides`. */
  context?: unknown
}

/** The interrupts the last turn stopped for, and how a resolve continues it. */
interface InterruptedTurn {
  runId: string
  interrupts: Array<Interrupt>
  /**
   * A routed turn stopped: the messages a resolve continues from, with the
   * agents' cards. `root` is true when `routing` sent the turn to root
   * agents, and false for `subagents.router`.
   */
  routed?: { messages: Array<UIMessage>; root: boolean }
  /**
   * Who sent the input of the stopped turn. Only this principal's saved
   * credential answers its sign-ins. A copy from an older version has none.
   */
  principal?: { id: string; tenantId?: string }
  /** The `context` of the stopped turn's input, so the resume sees it too. */
  context?: unknown
}

/** An agent run operation. `send` adds a message to its chain. */
type AgentRunImpl = OperationImpl<unknown> & AgentRun<unknown>

/** A message to an agent run: a steer or a follow-up. */
interface AgentMessage {
  inputId: string
  message: UserInput
  principal?: Principal
}

/** One run of an agent chain, and who it runs for. */
interface AgentRunEntry {
  operation: AgentRunImpl
  principal?: Principal
}

/**
 * The runs of one agent start: the first run, then one run per follow-up.
 * They share one thread, `<threadId>:<name>:<runInputId>`, and one tree
 * budget.
 */
interface AgentChain {
  /** The input id of the first run. */
  runInputId: string
  /** The thread that keeps the messages of every run of the chain. */
  thread: string
  target: string | AnyAgent
  agent: string
  input: unknown
  options: AgentStartOptions
  /** Who started the chain. */
  principal?: Principal
  /** The run whose agent code started this chain. */
  parentRunId?: string
  budget: SubagentBudget
  /** The newest run that started. */
  current: AgentRunEntry
  /** Every run that started, oldest first. */
  runs: Array<AgentRunEntry>
  /** Steers that wait for the current run's next model call. */
  steers: Array<AgentMessage>
  /** Follow-ups that run after the current run ends, in order. */
  followUps: Array<AgentMessage & { operation: AgentRunImpl }>
  /** The chains that agent code of this chain started. */
  children: Set<AgentChain>
}

/** What one run of a chain applies. */
interface AgentRunStart {
  /** The input this run applies. */
  inputId: string
  /** The follow-up message this run adds to the chain's thread. */
  message?: AgentMessage
  /** Recovery runs again a run whose host stopped. */
  resumed?: boolean
  /** The `subagent` tool call that started a first run. */
  child?: AgentChild
}

/** The `agent` input of a first run, as the log keeps it. */
type AgentInputState = InputState & {
  input: Extract<HarnessInput, { op: 'agent' }>
}

/** Where `stores.metadata` keeps the interrupted turn of each thread. */
const INTERRUPTED = 'harness:interrupted'

/** Where `stores.metadata` keeps the usage totals of a host without a log. */
const USAGE = 'harness:usage'

/**
 * The key of a resumable agent run in the session log: its steps, and the
 * tool results of its chat. Not a tool call id, so a turn never reads them.
 */
const agentKey = (inputId: string) => `agent:${inputId}`

/** The chain fields that the `agent` input of a first run keeps. */
const chainFields = (first: AgentInputState) => ({
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
const asUserMessage = (sent: AgentMessage): ModelMessage => ({
  id: sent.inputId,
  role: 'user',
  content: sent.message,
})

/** True for the `agent` input of a first run. */
const isAgentInput = (
  input: InputState | undefined,
): input is AgentInputState => input?.input.op === 'agent'

/**
 * The `agent` input of the chain that `input` runs: the input itself, or
 * the first run of a follow-up message. `undefined` for other inputs, and
 * for a steer that joined a run.
 */
const chainInputOf = (
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
const runStatus = (status: OperationStatus): AgentRunInfo['status'] => {
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
const loggedStatus = (input: InputState): AgentRunInfo['status'] => {
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
function isInterruptedTurn(value: unknown): value is InterruptedTurn {
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
function signInConnector(interrupt: Interrupt | undefined) {
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

function createInputId(): string {
  return `in-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

function createMessageId(): string {
  return `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

function customEvent(
  name: string,
  value: Record<string, unknown>,
): StreamChunk {
  return { type: EventType.CUSTOM, name, value, timestamp: Date.now() }
}

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

/** A `promptCache` option as an object. A string is the retention alone. */
const cacheObject = (option: PromptCacheOptions | undefined) =>
  typeof option === 'string' ? { retention: option, key: undefined } : option

/** The credential scope of `principal` in a thread, with only the set fields. */
const scopeOf = (
  threadId: string,
  principal: Principal | undefined,
): Scope => ({
  threadId,
  ...(principal ? { userId: principal.id } : {}),
  ...(principal?.tenantId ? { tenantId: principal.tenantId } : {}),
})

/** What the log and the inbox keep of a principal: its id and tenant. */
/** The `metadata.tanstack` of a logged event, if it has one. */
const tanstackOf = (event: Record<string, unknown>) =>
  isRecord(event.metadata) && isRecord(event.metadata.tanstack)
    ? event.metadata.tanstack
    : undefined

/** The tool call an interrupt waits on: an approval or a client tool. */
const toolCallOf = (interrupt: Interrupt) => {
  const binding = readInterruptBinding(interrupt)
  return binding && 'toolCallId' in binding ? binding.toolCallId : undefined
}

const storedPrincipal = (principal: Principal | undefined) =>
  principal
    ? {
        principal: {
          id: principal.id,
          ...(principal.tenantId ? { tenantId: principal.tenantId } : {}),
        },
      }
    : {}

/** One sender: the same id and tenant, or no principal on both. */
const isSameSender = (
  a: Pick<Principal, 'id' | 'tenantId'> | undefined,
  b: Pick<Principal, 'id' | 'tenantId'> | undefined,
) => a?.id === b?.id && a?.tenantId === b?.tenantId

/**
 * What makes two inputs with one id the same input: the payload and the
 * sender. The same id from another sender is a conflict, not a retry.
 */
const inputKey = (
  input: unknown,
  principal: Pick<Principal, 'id' | 'tenantId'> | undefined,
) => JSON.stringify([input, principal?.id ?? null, principal?.tenantId ?? null])

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value))

/**
 * The chat() context of a turn. Two plain objects merge, and the harness
 * value wins, so a client cannot replace a server value. Else the harness
 * value when it is set, else the input's.
 */
function turnContext(harness: unknown, input: unknown) {
  if (isPlainObject(harness) && isPlainObject(input)) {
    return { ...input, ...harness }
  }
  return harness !== undefined ? harness : input
}

/** Where `stores.metadata` keeps the stored settings of each thread. */
const SETTINGS = 'harness:settings'

const SETTING_KEYS = new Set<string>([
  'model',
  'reasoning',
  'instructions',
  'tools',
  'plugins',
  'cwd',
])

const isNames = (value: unknown): value is Array<string> =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

/** The names a setting can point at: the harness models and plugins. */
interface SettingNames {
  models: ReadonlySet<string>
  plugins: ReadonlySet<string>
}

/** One checked setting value. Throws with a short reason for a bad one. */
function checkSetting(
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
function changeSettings(
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
function withoutPlugins(
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
function settingTools(
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
 * The transcript message of a `reset()`: a user message with
 * `metadata.harness.reset`. Its content is the note, which the model sees
 * first. The id comes from the input, so the marker goes in once.
 */
function resetMarker(inputId: string, note: string | undefined): ModelMessage {
  return {
    id: `reset-${inputId}`,
    role: 'user',
    content: note ?? '',
    metadata: { harness: { reset: note !== undefined ? { note } : {} } },
  }
}

const isResetMarker = (message: ModelMessage) =>
  isRecord(message.metadata?.harness) &&
  isRecord(message.metadata.harness.reset)

/**
 * What the model sees of `messages`: only the messages after the last reset
 * marker. A marker with a note stays, as a plain user message. Returns
 * `messages` itself when it has no marker.
 */
function resetContext(messages: Array<ModelMessage>): Array<ModelMessage> {
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
const resetCut: AnyChatMiddleware = {
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
function ephemeralCall(pending: Array<ModelMessage>): AnyChatMiddleware {
  return {
    name: 'harness:ephemeral',
    onConfig: (ctx, config) => {
      if (ctx.phase !== 'beforeModel' || pending.length === 0) return undefined
      const messages = config.providerMessages ?? config.messages
      return { providerMessages: [...messages, ...pending.splice(0)] }
    },
  }
}

/** A short transcript note about how an agent ended, for the next turn. */
function referenceNote(
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
const AGENT_STOPPED = 'The host stopped during this agent run.'

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
const CHAT_OPS = new Set<string>([
  'prompt',
  'steer',
  'followUp',
  'continue',
  'resolve',
])

/** The inputs that leave work to do: the thread is busy until they end. */
const WORK_OPS = new Set<string>([
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
const CONTROL_OPS = new Set<string>(['cancelInput', 'setDelivery'])

/** Why a turn stops when its input passes its time limit. */
const TIMEOUT_REASON = 'harness:input-timeout'

/** What the model gets after its partial answer, on a `'continue'`. */
const CONTINUE_NOTE =
  'Your last answer stopped early because of an error. Continue from the exact point where it stopped. Do not repeat the text you already wrote.'

/**
 * Why work stops at `close({ recoverable: true })`. A user cancel stops it
 * with `RUN_CANCEL_REASON`.
 */
const SHUTDOWN_REASON = 'harness:shutdown'

/**
 * A shutdown abort is a detach, not an end: `withPersistence` then writes no
 * aborted state to the run record. It goes before `withPersistence`, which
 * reads the detach in its own `onAbort`.
 */
const detachOnShutdown: AnyChatMiddleware = {
  name: 'harness:detach-on-shutdown',
  onAbort: (ctx, info) => {
    if (info.reason === SHUTDOWN_REASON) provideDetachableRun(ctx, true)
  },
}

/** Why a turn fails when no option gives it an adapter. */
const NO_MODEL =
  'This turn has no model. Set `adapter` in defineHarness, return one from a plugin `adapter()`, or pass `overrides.adapter` to the turn.'

/**
 * The text of the last assistant message: the answer of an operation rebuilt
 * from the log, or of a routed turn.
 */
function lastAssistantText(messages: ReadonlyArray<ModelMessage>) {
  const last = messages.findLast((message) => message.role === 'assistant')
  return typeof last?.content === 'string' ? last.content : ''
}

/**
 * True when chat() runs its routed path for this bag: the router picks, and
 * the engine does not run. So the middleware that gives the engine its
 * history and its run lease does not run, and the turn does that work.
 */
function isRoutedBag(bag: Pick<SubagentsBag, 'agents' | 'router'> | undefined) {
  return bag !== undefined && bag.agents.length > 0 && bag.router !== undefined
}

/**
 * Middleware that keeps the override tools of a turn. A middleware `onConfig`
 * can return a tool list without them, and this adds back each one whose
 * name is missing.
 */
function keepTurnTools(kept: ReadonlyArray<AnyTool>) {
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
function hasFinalAnswer(
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
function checkHostRecords(records: ReadonlyArray<LogRecord>) {
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

const notOpen = () => Promise.reject(new Error('The session is not open yet.'))

/** The message store of a durable session before `open()` reads its log. */
const notOpenMessages: MessageStore = {
  loadThread: notOpen,
  saveThread: notOpen,
}

/** `feed`, and `onEvent` after each publish. This is how the host sees events. */
function tapFeed(feed: EventFeed, onEvent: (event: StreamChunk) => void) {
  return {
    publish: (operationId, event) => {
      feed.publish(operationId, event)
      onEvent(event)
    },
    head: () => feed.head(),
    read: (options) => feed.read(options),
    close: () => feed.close(),
  } satisfies EventFeed
}

/**
 * A live harness session: one conversation (`threadId`) with its plugins,
 * operations, inbox, and event stream. Open one with `host.open()`.
 */
export class HarnessSession<THarness extends AnyHarness = AnyHarness> {
  readonly threadId: string
  /** The log of this session. Sessions with the same log id share one log. */
  readonly logId: string
  readonly agents: AgentHandles<THarness>
  /** The agents this session can run, for discovery. */
  readonly registry: AgentRegistryView

  private readonly harness: THarness
  private readonly persistence: HarnessPersistence
  private readonly inbox: InboxStore
  private readonly principal: Principal | undefined
  /** The session log writer of a durable host. It is also the feed. */
  private writer: LogWriter | undefined
  private feed: EventFeed
  private readonly onEvent: (event: StreamChunk) => void
  /** The transcript: `stores.messages`, or a view of the log. */
  private messages: MessageStore
  /**
   * What `withPersistence` gets: the chat stores, with `messages`. With
   * `sessions`, each child the model starts gets an index entry.
   */
  private chatPersistence:
    | AIPersistence<ChatTranscriptStores & { sessions?: SessionIndexStore }>
    | undefined
  /** The message store the chat engine saves through, on a durable host. */
  private engine: ReturnType<typeof engineMessageStore> | undefined
  /** Why the session log stopped taking writes. */
  private logFailure: Error | undefined
  private readonly log: SessionDependencies['log']
  /**
   * Inputs this session stored or recovered, by id, as JSON: the duplicate
   * check. `recover()` skips them.
   */
  private readonly admitted = new Map<string, string>()
  /** The receipt of each chat input this session answered, by input id. */
  private readonly receipts = new Map<string, Receipt>()
  /** The turn operation of each chat input, by input id. */
  private readonly turnOperations = new Map<
    string,
    OperationImpl<ChatTurnResult>
  >()
  /** The input of each turn operation, by operation id. */
  private readonly operationInputs = new Map<string, string>()
  /** The inputs that joined each turn, by operation id. */
  private readonly turnJoins = new Map<string, Array<string>>()
  /** How the chat inputs of this session ended, for `settled()`. */
  private readonly settlements = new Map<string, InputSettlement>()
  private readonly agentRegistry = new AgentRegistry()
  private readonly operations = new Map<string, OperationImpl<unknown>>()
  /** The agent chains of this session, by the input id of the first run. */
  private readonly agentChains = new Map<string, AgentChain>()
  /** The chain of each agent run operation, by operation id. */
  private readonly chainOf = new Map<string, AgentChain>()
  private readonly queue: Array<QueuedTurn> = []
  private readonly steerQueue: Array<WaitingSteer> = []
  /**
   * Waiting steers with an abort request. An id lands here before the abort
   * append, so a join that runs during that append skips the steer.
   */
  private readonly abortedSteers = new Set<string>()
  /** The ids of the waiting steers that a join took. A cancel of one is refused. */
  private readonly joining = new Set<string>()
  private readonly pendingNotes: Array<string> = []
  /** Running tool calls that support `detach`: id to the move. */
  private readonly detachable = new Map<string, () => void>()
  private activeTurn: OperationImpl<ChatTurnResult> | undefined
  /** Renews this host's claim on the thread while the thread has work. */
  private claimTimer: ReturnType<typeof setInterval> | undefined
  /** The claim write of the last `markBusy`. An input waits for it. */
  private claimWrite: Promise<void> = Promise.resolve()
  /** Called each time the thread goes idle. See `onIdle`. */
  private readonly idleListeners = new Set<() => void>()
  /** Work inputs that are being stored and are not queued yet. */
  private inputsInFlight = 0
  /** Who sent the input of the running turn. */
  private turnPrincipal: Principal | undefined
  /**
   * The last turn stopped for these interrupts. `routed`: a routed turn
   * stopped. The resolve continues its saved plan. `stores.metadata` keeps a
   * copy, so a resolve after a restart continues the turn too.
   */
  private interrupted: InterruptedTurn | undefined
  /** The usage totals of a host without a log. A durable host folds the log. */
  private usageTotals: SessionUsage = emptyUsage()
  /** Saves of `usageTotals` to `stores.metadata`, one after the other. */
  private usageSaved: Promise<unknown> = Promise.resolve()
  private activeResume = false
  private plugins: ReadonlyArray<HarnessPlugin> = []
  private sessionPlugins: MountedPlugins | undefined
  /** The last `reload()`. The calls run one at a time. */
  private reloads: Promise<void> = Promise.resolve()
  /** A reload waits for the running turn, so no new turn starts. */
  private holdTurns = false
  /** Called when the running turn ends. A reload waits for it. */
  private readonly turnEnds = new Set<() => void>()
  private closing: Promise<void> | undefined
  /** The last `recover()`. The calls run one at a time. */
  private recovery: Promise<void> = Promise.resolve()
  private readonly onClose: () => void
  private checkpoint: AnyChatMiddleware | undefined
  /** Gives each durable tool call its steps in the log. One per session. */
  private bindTool: DurableBind | undefined
  private readonly hostId: string
  private readonly index: SessionIndexWriter
  private readonly lease: LeaseOptions | undefined
  private readonly listeners = new Map<string, Set<(value: unknown) => void>>()
  private readonly configValues = new Map<string, unknown>()
  /** The stored settings of this thread: `session.configure`. */
  private threadSettings: ThreadSettings = {}
  private readonly questions = new Map<
    string,
    {
      message: string
      schema: SchemaInput | undefined
      secret: boolean
      url: string | undefined
      /** The operation whose events carry the question and its answer. */
      operationId: string
      resolve: (value: unknown) => void
      reject: (error: unknown) => void
    }
  >()
  private readonly stateDoc: Record<string, unknown> = {}
  /** Reads each plugin's saved state, so the first snapshot has it. */
  private readonly stateLoaders = new Map<string, () => Promise<unknown>>()
  private readonly localState = new Map<string, unknown>()
  /** The revert that stands. See `revert`. */
  private reverted: RevertState | undefined
  /** The credentials of the running turn's sender, else of the session's principal. */
  private readonly credentialAccess: CredentialsAccess
  /**
   * The connectors whose sign-in the user cancelled. Their `require` with
   * `wait` fails the tool, as without `wait`, until the next new turn.
   */
  private readonly declinedSignIns = new Set<string>()
  /**
   * Model provider keys of the same principal as `credentialAccess`: saved
   * with `/connect <provider>`, else the env var.
   */
  private readonly keys: ProviderKeys
  /**
   * The credentials of one principal: the user who runs a command, or an
   * agent that outlives a turn. A save there can answer that user's sign-ins.
   */
  private readonly credentialsOf: (
    principal: Principal | undefined,
  ) => CredentialsAccess
  /** The provider keys of one principal, for an agent that outlives a turn. */
  private readonly keysOf: (principal: Principal | undefined) => ProviderKeys
  private readonly services: PluginServices
  private readonly media: SessionDependencies['media']
  private readonly mediaStore: MediaStore
  /** The prompt cache of every chat turn of this session. */
  private readonly promptCache: ResolvedPromptCache

  constructor(deps: SessionDependencies) {
    this.harness = deps.harness as THarness
    this.threadId = deps.threadId
    this.logId = deps.logId
    // The session value wins over the harness value, field by field.
    const own = cacheObject(deps.promptCache)
    const shared = cacheObject(this.harness.promptCache)
    this.promptCache = {
      retention: own?.retention ?? shared?.retention ?? 'short',
      key: own?.key ?? shared?.key ?? deps.threadId,
    }
    this.persistence = deps.persistence
    this.inbox = deps.inbox
    this.media = deps.media
    this.mediaStore = createMediaStore({
      persistence: deps.media,
      threadId: deps.threadId,
      options: this.harness.media,
    })
    this.principal = deps.principal
    this.onEvent = deps.onEvent
    this.feed = tapFeed(new SessionFeed(), deps.onEvent)
    this.onClose = deps.onClose
    this.hostId = deps.hostId
    this.index = deps.index
    this.lease = deps.lease
    this.log = deps.log
    // A durable host gets its log view in `open()`.
    this.messages = deps.persistence.stores.messages ?? notOpenMessages
    const onMissing = (error: AuthRequiredError) =>
      this.feed.publish(
        'session',
        customEvent(HARNESS_EVENTS.authRequired, {
          connector: error.connector,
          ...(error.url ? { url: error.url } : {}),
        }),
      )
    // The scope is read at each call, so it follows the running turn.
    this.credentialAccess = credentialsFor(
      deps.credentials,
      () => scopeOf(deps.threadId, this.sender()),
      onMissing,
      {
        // A tool of a running turn can wait, unless the user cancelled the
        // sign-in for this turn.
        canWait: (id) =>
          this.activeTurn !== undefined && !this.declinedSignIns.has(id),
        onSet: () => this.resumeSignIns(),
      },
    )
    this.keys = providerKeysFor(this.credentialAccess, onMissing)
    this.credentialsOf = (principal) =>
      credentialsFor(
        deps.credentials,
        scopeOf(deps.threadId, principal),
        onMissing,
        { onSet: () => this.resumeSignIns() },
      )
    this.keysOf = (principal) =>
      providerKeysFor(this.credentialsOf(principal), onMissing)
    this.services = {
      emit: (plugin, name, value) => this.emitPluginEvent(plugin, name, value),
      on: (name, handler) => {
        let set = this.listeners.get(name)
        if (!set) {
          set = new Set()
          this.listeners.set(name, set)
        }
        set.add(handler)
        return () => set.delete(handler)
      },
      config: { get: (key) => this.configValue(key) },
      state: (plugin, initial) => this.pluginState(plugin, initial),
      credentials: this.credentialAccess,
      keys: this.keys,
      session: this.pluginApi(),
      agents: {
        run: ((target: string | AnyAgent, input?: unknown) =>
          this.runAgent(target, input, {
            wake: false,
          })) as PluginAgentActions['run'],
        start: ((
          target: string | AnyAgent,
          input?: unknown,
          options?: AgentStartOptions,
        ) =>
          this.runAgent(
            target,
            input,
            options ?? {},
          )) as PluginAgentActions['start'],
        group: (options, body) => this.agentGroup(options, body),
      },
      commandsChanged: () =>
        this.feed.publish(
          'session',
          customEvent(HARNESS_EVENTS.commandsChanged, {}),
        ),
    }
    this.registry = this.agentRegistry
    for (const agent of this.harness.agents ?? []) {
      this.agentRegistry.add(agent, 'the harness')
    }
    for (const agent of this.harness.subagents?.agents ?? []) {
      this.agentRegistry.add(agent, 'the harness')
    }
    this.agents = new Proxy({} as AgentHandles<THarness>, {
      get: (_target, name) => {
        if (typeof name !== 'string') return undefined
        return {
          run: (input?: unknown, options?: AgentRunOptions) =>
            this.runAgent(name, input, { ...options, wake: false }),
          start: (input?: unknown, options?: AgentStartOptions) =>
            this.runAgent(name, input, options ?? {}),
        }
      },
    })
  }

  /**
   * The agent named `name`, for names known only at runtime (a slash
   * command, a protocol input). `undefined` when no such agent exists.
   */
  agent(name: string): DynamicAgentHandle | undefined {
    if (!this.agentRegistry.get(name)) return undefined
    return {
      run: (input, options) =>
        this.runAgent(name, input, { ...options, wake: false }),
      start: (input, options) => this.runAgent(name, input, options ?? {}),
    }
  }

  /** An operation of this session by id, running or settled. */
  operation(id: string): Operation<unknown> | undefined {
    return this.operations.get(id)
  }

  /**
   * Add a message to the agent run `operationId`, as `AgentRun.send` does.
   * `principal` is who sent it. A follow-up runs for its sender. An unknown
   * run gets `not_running`.
   */
  async sendToAgent(
    operationId: string,
    message: UserInput,
    options?: {
      mode?: 'steer' | 'followUp'
      inputId?: string
      principal?: Principal
    },
  ): Promise<Receipt> {
    const inputId = options?.inputId ?? createInputId()
    const chain = this.chainOf.get(operationId) ?? this.loggedChain(operationId)
    if (!chain) return { inputId, status: 'rejected', reason: 'not_running' }
    const principal = options?.principal ?? this.principal
    const mode = options?.mode ?? 'steer'
    return this.admitting(async () => {
      const admission = await this.accept(
        inputId,
        {
          op: 'agentMessage',
          operationId,
          message,
          mode,
          run: chain.runInputId,
        },
        principal,
      )
      if (admission !== 'new') return this.duplicateReceipt(inputId, admission)
      const sent = { inputId, message, ...(principal ? { principal } : {}) }
      return this.keep({ inputId, ...this.deliver(chain, sent, mode) })
    })
  }

  /**
   * The agent run `operationId`: a run of this session, or on a durable
   * host a run in the log that ended, so a follow-up continues it after a
   * restart. `undefined` for an unknown run, and for one that another host
   * runs.
   */
  agentRun(operationId: string): AgentRun<unknown> | undefined {
    const chain = this.chainOf.get(operationId) ?? this.loggedChain(operationId)
    return [...(chain?.runs ?? []), ...(chain?.followUps ?? [])].find(
      (run) => run.operation.id === operationId,
    )?.operation
  }

  /**
   * The agent runs of this session, oldest first. On a durable host it also
   * lists the runs in the log, so it works after a restart.
   */
  agentRuns(): Array<AgentRunInfo> {
    const live = [...this.agentChains.values()].flatMap((chain) =>
      [...chain.runs, ...chain.followUps].map(
        ({ operation, principal }): AgentRunInfo => ({
          operationId: operation.id,
          agent: chain.agent,
          status: runStatus(operation.status()),
          ...(chain.parentRunId ? { parentRunId: chain.parentRunId } : {}),
          ...(principal ? { principal } : {}),
        }),
      ),
    )
    const known = new Set(live.map((run) => run.operationId))
    return [
      ...this.loggedRuns().filter((run) => !known.has(run.operationId)),
      ...live,
    ]
  }

  /** The agent runs in the log: each input that a run applied. */
  private loggedRuns(): Array<AgentRunInfo> {
    const inputs = this.writer?.state.inputs
    if (!inputs) return []
    return [...inputs.values()].flatMap((input): Array<AgentRunInfo> => {
      const first = chainInputOf(inputs, input)
      if (!first || input.operationId === undefined) return []
      return [
        {
          operationId: input.operationId,
          agent: first.input.agent,
          status: loggedStatus(input),
          ...(first.input.parentRunId
            ? { parentRunId: first.input.parentRunId }
            : {}),
          ...(input.principal ? { principal: input.principal } : {}),
        },
      ]
    })
  }

  /**
   * The chain of a run in the log, with every run it had, so a follow-up
   * continues its thread after a restart. `undefined` for an unknown run,
   * and while a run of the chain has not ended: another host runs it.
   */
  private loggedChain(operationId: string): AgentChain | undefined {
    const inputs = this.writer?.state.inputs
    if (!inputs) return undefined
    const own = [...inputs.values()].find(
      (input) => input.operationId === operationId,
    )
    const first = own && chainInputOf(inputs, own)
    if (!first) return undefined
    const known = this.agentChains.get(first.inputId)
    if (known) return known
    const logged = [...inputs.values()].filter(
      (input) =>
        input.operationId !== undefined &&
        chainInputOf(inputs, input) === first,
    )
    if (logged.some((input) => input.settlement === undefined)) {
      return undefined
    }
    // ponytail: a run rebuilt from the log resolves to `undefined`. The log
    // keeps how it ended, not its value. Read `stores.runs` if callers need
    // the value.
    const entries = logged.map((input) => {
      const operation = this.agentOperation(
        first.input.agent,
        input.operationId,
      )
      const settlement = input.settlement
      if (settlement?.outcome === 'completed') {
        operation.finish('completed', undefined)
      } else {
        operation.fail(
          settlement?.outcome === 'aborted' ? 'cancelled' : 'failed',
          new Error(settlement?.error?.message ?? 'The run did not complete.'),
        )
      }
      return {
        operation,
        ...(input.principal ? { principal: input.principal } : {}),
      }
    })
    const [firstRun, ...later] = entries
    if (!firstRun) return undefined
    const chain = this.createChain(chainFields(first), firstRun)
    for (const entry of later) {
      chain.runs.push(entry)
      this.chainOf.set(entry.operation.id, chain)
    }
    chain.current = later.at(-1) ?? firstRun
    return chain
  }

  /** The stores that first-party plugins read as capabilities. */
  private storeCapabilities() {
    const values = new CapabilityValues()
    const { metadata } = this.persistence.stores
    if (metadata) values.provide(SessionMetadata, metadata)
    return values
  }

  /** @internal Mount session plugins and replay inputs left in the inbox. */
  async open(): Promise<void> {
    // First: plugins publish events while they mount.
    await this.openLog()
    try {
      await this.mountSessionPlugins()
      await this.loadSettings()
      this.reverted = this.writer
        ? this.writer.state.revert
        : revertOf(
            await this.persistence.stores.metadata?.get(
              'harness:revert',
              this.threadId,
            ),
          )
      await this.loadInterrupted()
      // Before recovery: a turn that recovery runs updates this entry.
      await this.openEntry()
      if (this.writer) {
        await this.recoverFromLog(this.writer)
        return
      }
      await this.loadUsage()
      await this.recoverCrashedTurn()
      await this.recoverInbox()
    } catch (error) {
      // A session that fails to open gives its log view back, so the thread
      // can open again.
      this.feed.close()
      throw error
    }
  }

  /** Read `harness.plugins()` and set up its session plugins. */
  private async mountSessionPlugins(): Promise<void> {
    this.plugins = this.harness.plugins?.() ?? []
    this.sessionPlugins = await mountPlugins(
      this.plugins.filter(
        (plugin) => (plugin.lifetime ?? 'session') === 'session',
      ),
      {
        threadId: this.threadId,
        registry: this.agentRegistry,
        harnessTools: this.harness.tools ?? [],
        harnessProvides: (this.harness.middleware ?? []).flatMap(
          (middleware) => middleware.provides ?? [],
        ),
        services: this.services,
        inherited: this.storeCapabilities(),
      },
    )
    await this.loadConfig()
    await this.loadPluginState()
  }

  /**
   * Tear the plugins down and set them up again, with the list that
   * `harness.plugins()` gives now. It waits for the running turn, and no new
   * turn starts until it ends. The transcript, the log, the thread settings,
   * and the inbox stay. Clients get a `harness.reloaded` event.
   *
   * When the new setup throws, the session keeps working with no plugins,
   * and the promise rejects with the error. Call `reload()` again after a
   * fix.
   *
   * @example
   * ```ts
   * await session.reload()
   * ```
   */
  reload(): Promise<void> {
    const run = this.reloads.then(() => this.runReload())
    this.reloads = run.catch(() => {})
    return run
  }

  private async runReload(): Promise<void> {
    if (this.closing) return
    this.holdTurns = true
    try {
      while (this.activeTurn) {
        await new Promise<void>((resolve) => this.turnEnds.add(resolve))
      }
      const old = this.sessionPlugins
      // No plugins until the new setup works, so a failed setup leaves none.
      this.sessionPlugins = undefined
      this.plugins = []
      this.agentRegistry.deletePluginAgents()
      await old?.dispose()
      await this.mountSessionPlugins()
      this.feed.publish('session', customEvent(HARNESS_EVENTS.reloaded, {}))
    } catch (error) {
      this.sessionPlugins = undefined
      this.plugins = []
      this.agentRegistry.deletePluginAgents()
      this.feed.publish(
        'session',
        customEvent(HARNESS_EVENTS.reloaded, { error: errorText(error) }),
      )
      throw error
    } finally {
      this.holdTurns = false
      this.drain()
    }
  }

  /**
   * Recover the work in the log again, as `open()` does. `open()` skips a
   * turn while another host holds its lease. Call this after that lease
   * expires, and the turn runs here. The work that this session runs or
   * queues stays as it is. A session without `stores.log` does nothing.
   *
   * @example
   * ```ts
   * await session.recover()
   * ```
   */
  recover(): Promise<void> {
    const { writer } = this
    if (!writer || this.closing) return Promise.resolve()
    const run = this.recovery.then(async () => {
      // First the records that other hosts wrote since this session read.
      await writer.catchUp()
      if (this.logFailure) throw this.logFailure
      if (this.closing) return
      await this.recoverFromLog(writer)
    })
    this.recovery = run.catch(() => {})
    return run
  }

  /**
   * Write the index entry of this thread on open: a new entry the first
   * time, else a new `updatedAt`. The owner is who opened the thread first,
   * so an open by another user does not change it.
   */
  private async openEntry() {
    const now = Date.now()
    await this.index.update(this.threadId, (entry) => ({
      threadId: this.threadId,
      createdAt: now,
      ...entry,
      harness: entry?.harness ?? this.harness.name,
      updatedAt: now,
      ...storedPrincipal(entry?.principal ?? this.principal),
    }))
  }

  /**
   * A durable host gives the session its view of the log, and the session
   * writes through it: the log is the event feed and the transcript. Then
   * both modes build the stores that `withPersistence` and the checkpoints
   * get.
   */
  private async openLog(): Promise<void> {
    const { stores } = this.persistence
    if (this.log) {
      const { store, project } = this.log
      this.writer = await this.log.open(this.threadId, (error) =>
        this.stopOnLogFailure(error),
      )
      this.feed = tapFeed(this.writer, this.onEvent)
      const view = {
        writer: this.writer,
        store,
        ...(project ? { project } : {}),
      }
      this.messages = sessionMessageStore(view)
      this.engine = engineMessageStore(view)
    }
    const engineMessages = this.engine ?? this.messages
    this.chatPersistence = {
      stores: {
        messages: engineMessages,
        ...(stores.runs ? { runs: stores.runs } : {}),
        ...(stores.interrupts ? { interrupts: stores.interrupts } : {}),
        ...(stores.metadata ? { metadata: stores.metadata } : {}),
        ...(stores.sessions ? { sessions: stores.sessions } : {}),
      },
    }
    const { writer } = this
    this.checkpoint = checkpointMiddleware({
      ...(stores.runs ? { runs: stores.runs } : {}),
      messages: engineMessages,
      hostId: this.hostId,
      ...(this.lease ? { lease: this.lease } : {}),
      // A durable host keeps each finished tool result, so a crash later in
      // the batch does not lose it.
      ...(writer
        ? {
            onToolStart: ({ toolCallId, name, replay }) =>
              writer.append([
                { type: 'harness.tool.started', toolCallId, name, replay },
              ]),
            onToolResult: ({ toolCallId, message }) =>
              writer.append([
                { type: 'harness.tool.result', toolCallId, message },
              ]),
          }
        : {}),
    })
    if (writer) {
      this.bindTool = (toolCallId) => this.durableBinding(writer, toolCallId)
    }
  }

  /**
   * The `step` and `append` a durable tool call gets. A step value is in the
   * log before `step.do` resolves. Staged records land with the next
   * transcript commit, when the tool phase completes, so a batch that a
   * crash cuts leaves none of them.
   */
  private durableBinding(writer: LogWriter, toolCallId: string) {
    const step = createToolStep({
      recorded: (name) => {
        const key = stepKey(toolCallId, name)
        return writer.state.steps.has(key)
          ? { found: true, value: writer.state.steps.get(key) }
          : { found: false }
      },
      record: (name, value) =>
        writer.append([{ type: 'harness.tool.step', toolCallId, name, value }]),
    })
    const append = (records: ReadonlyArray<LogRecord>) => {
      checkHostRecords(records)
      writer.stage(records)
    }
    return { step, append }
  }

  /**
   * The log refused a write: another host wrote to this log, or the store
   * failed. The state of this session is not known any more, so it stops.
   * The next `host.open` folds the log again.
   */
  private stopOnLogFailure(error: unknown): void {
    if (this.logFailure) return
    this.logFailure = new Error(
      error instanceof LogConflictError
        ? 'Another host wrote to this log, so this session stopped. Open the thread again.'
        : `The session log failed, so this session stopped: ${error instanceof Error ? error.message : String(error)}`,
    )
    for (const operation of this.operations.values()) {
      if (!operation.isSettled())
        operation.abortController.abort(this.logFailure)
    }
    void this.close()
  }

  /**
   * Append host records to the session log, in one batch after the events
   * that wait. Only a durable host (with `stores.log`) has a log. A `type`
   * that starts with `harness.` is refused: the harness owns those.
   * A record can name another session of the same log with `thread`. The
   * append is all or nothing.
   *
   * With `project` on the host, a record can change the model context. The
   * running turn sees the change at its next model call.
   *
   * @example
   * ```ts
   * await session.append([{ type: 'app.signal', text: 'The build failed.' }])
   * ```
   */
  async append(records: ReadonlyArray<LogRecord>): Promise<void> {
    if (!this.writer) {
      throw new Error(
        'session.append needs a durable host (a host with stores.log).',
      )
    }
    checkHostRecords(records)
    await this.writer.append(records)
  }

  // ===========================
  // Inputs
  // ===========================

  /**
   * Start a chat turn, or queue it while one runs (see `busy`).
   *
   * `inputId` is an id you choose. A second prompt with the same id and the
   * same message returns the first input's operation and does not run again.
   * The same id with another message is rejected with `'conflict'`.
   * `await operation.receipt` resolves when the input is stored.
   *
   * `overrides` changes the adapter, reasoning, prompt cache, or tools of
   * this turn only (see `TurnOverrides`). A steer that joins the running
   * turn uses the overrides of that turn, and its own are ignored.
   *
   * `principal` is who sent the message. Default: the principal that opened
   * the session. The log keeps it, and the turn runs with its credentials
   * and provider keys. A steer that joins the running turn runs with the
   * credentials of that turn's sender.
   *
   * `context` is JSON data from the client, stored with the input. Tools
   * get it in their context (see `HarnessConfig.context`). Do not trust it.
   */
  prompt(
    message: UserInput,
    options?: {
      busy?: BusyPolicy
      inputId?: string
      overrides?: TurnOverrides
      principal?: Principal
      context?: unknown
      /** @internal The AG-UI `runId` of a `POST run` request. The turn runs as it. */
      runId?: string
    },
  ): Operation<ChatTurnResult> {
    const busy = options?.busy ?? this.harness.busy ?? 'queue'
    const inputId = options?.inputId ?? createInputId()
    const overrides = options?.overrides
    const principal = options?.principal ?? this.principal
    const context = options?.context
    const input: HarnessInput = {
      op: 'prompt',
      message,
      busy,
      ...(context !== undefined ? { context } : {}),
    }
    const known = this.knownTurn(inputId, input, principal)
    if (known) return known
    const runId = options?.runId
    // A run id must not take the id of another operation.
    if (runId !== undefined && this.operations.has(runId)) {
      const refused = this.createTurnOperation()
      this.refuse(refused, { inputId, status: 'rejected', reason: 'conflict' })
      return refused
    }
    const operation = this.createTurnOperation(runId)
    this.bindTurn(inputId, operation)
    void this.admitting(() =>
      this.accept(inputId, input, principal).then(
        async (admission) => {
          if (admission !== 'new') {
            this.answerDuplicate(operation, inputId, admission)
            return
          }
          // Awaited only for a client run id, so other prompts keep their order.
          if (runId !== undefined && (await this.isRunTaken(runId))) {
            this.reject(inputId, 'conflict')
            this.refuse(operation, {
              inputId,
              status: 'rejected',
              reason: 'conflict',
            })
            return
          }
          if (this.activeTurn && busy === 'reject') {
            this.reject(inputId, 'busy')
            this.refuse(operation, {
              inputId,
              status: 'rejected',
              reason: 'busy',
            })
            return
          }
          const isWaiting =
            this.activeTurn !== undefined || this.queue.length > 0
          // A steer joins the running turn, so the receipt names that turn, as
          // `steer()` does.
          const running = busy === 'steer' ? this.activeTurn : undefined
          this.answerTurn(operation, {
            inputId,
            status: isWaiting && busy !== 'steer' ? 'queued' : 'accepted',
            operationId: running?.id ?? operation.id,
          })
          const sent = { principal, context }
          if (running) {
            this.steerQueue.push({
              inputId,
              message,
              operation,
              overrides,
              ...sent,
            })
            return
          }
          this.enqueueTurn({ operation, message, inputId, overrides, ...sent })
        },
        (error: unknown) => {
          // The input was not stored. After a log failure, say why the
          // session stopped.
          const failure = this.logFailure ?? error
          this.answerTurn(operation, {
            inputId,
            status: 'rejected',
            reason:
              failure instanceof Error ? failure.message : String(failure),
          })
          operation.fail('failed', failure)
        },
      ),
    )
    return operation
  }

  /**
   * Add a message to the running turn at its next model call. `principal`
   * and `context` mean the same as in `prompt`.
   */
  async steer(
    message: UserInput,
    options?: { inputId?: string; principal?: Principal; context?: unknown },
  ): Promise<Receipt> {
    return this.admitting(async () => {
      const inputId = options?.inputId ?? createInputId()
      const principal = options?.principal ?? this.principal
      const context = options?.context
      const admission = await this.accept(
        inputId,
        {
          op: 'steer',
          message,
          ...(context !== undefined ? { context } : {}),
        },
        principal,
      )
      if (admission !== 'new') return this.duplicateReceipt(inputId, admission)
      if (!this.activeTurn) {
        const operation = this.createTurnOperation()
        this.bindTurn(inputId, operation)
        this.enqueueTurn({ operation, message, inputId, principal, context })
        return this.keep({
          inputId,
          status: 'accepted',
          operationId: operation.id,
        })
      }
      this.steerQueue.push({ inputId, message, principal, context })
      return this.keep({
        inputId,
        status: 'accepted',
        operationId: this.activeTurn.id,
      })
    })
  }

  /**
   * Run a turn after the current work settles. `overrides` changes the
   * adapter, reasoning, prompt cache, or tools of this turn only.
   * `principal` and `context` mean the same as in `prompt`.
   */
  async followUp(
    message: UserInput,
    options?: {
      inputId?: string
      overrides?: TurnOverrides
      principal?: Principal
      context?: unknown
    },
  ): Promise<Receipt> {
    return this.admitting(async () => {
      const inputId = options?.inputId ?? createInputId()
      const principal = options?.principal ?? this.principal
      const context = options?.context
      const admission = await this.accept(
        inputId,
        {
          op: 'followUp',
          message,
          ...(context !== undefined ? { context } : {}),
        },
        principal,
      )
      if (admission !== 'new') return this.duplicateReceipt(inputId, admission)
      const operation = this.createTurnOperation()
      this.bindTurn(inputId, operation)
      const status =
        this.activeTurn || this.queue.length > 0 ? 'queued' : 'accepted'
      this.enqueueTurn({
        operation,
        message,
        inputId,
        overrides: options?.overrides,
        principal,
        context,
      })
      return this.keep({ inputId, status, operationId: operation.id })
    })
  }

  /**
   * Start a chat turn from the stored transcript, with no new message. While
   * a turn runs, it queues. When it starts, the transcript must end with a
   * user or a tool message. Else the input is rejected with
   * `'nothing_to_continue'`. `inputId`, `overrides`, `principal`, and
   * `context` mean the same as in `prompt`.
   *
   * @example
   * ```ts
   * await session.append([{ type: 'app.signal', text: 'The build failed.' }])
   * await session.continue({ inputId: 'after-signal' })
   * ```
   */
  continue(options?: {
    inputId?: string
    overrides?: TurnOverrides
    principal?: Principal
    context?: unknown
  }): Operation<ChatTurnResult> {
    const inputId = options?.inputId ?? createInputId()
    const principal = options?.principal ?? this.principal
    const context = options?.context
    const input: HarnessInput = {
      op: 'continue',
      ...(context !== undefined ? { context } : {}),
    }
    const known = this.knownTurn(inputId, input, principal)
    if (known) return known
    const operation = this.createTurnOperation()
    this.bindTurn(inputId, operation)
    void this.admitting(() =>
      this.accept(inputId, input, principal).then(
        (admission) => {
          if (admission !== 'new') {
            this.answerDuplicate(operation, inputId, admission)
            return
          }
          const isWaiting =
            this.activeTurn !== undefined || this.queue.length > 0
          this.answerTurn(operation, {
            inputId,
            status: isWaiting ? 'queued' : 'accepted',
            operationId: operation.id,
          })
          this.enqueueTurn({
            operation,
            inputId,
            overrides: options?.overrides,
            principal,
            context,
            isContinue: true,
          })
        },
        (error: unknown) => {
          // As in `prompt`: the input was not stored.
          const failure = this.logFailure ?? error
          this.answerTurn(operation, {
            inputId,
            status: 'rejected',
            reason: errorText(failure),
          })
          operation.fail('failed', failure)
        },
      ),
    )
    return operation
  }

  /**
   * Start a fresh model context. From the next turn, the model sees only
   * `note` (when you give one) and what comes after the reset.
   * `transcript()` keeps every message: the reset adds a user message with
   * `metadata.harness.reset`, whose content is the note.
   *
   * While a turn runs, the reset waits and applies when that turn ends,
   * before the next queued turn. A thread that waits for interrupts is
   * refused with `'pending_interrupts'`: resolve them first. `principal` and
   * `inputId` mean the same as in `prompt`.
   */
  async reset(
    note?: string,
    options?: { principal?: Principal; inputId?: string },
  ): Promise<Receipt> {
    return this.admitting(async () => {
      const inputId = options?.inputId ?? createInputId()
      const principal = options?.principal ?? this.principal
      // An empty note is no note: the model never gets an empty message.
      const text = note?.trim() ? note : undefined
      const admission = await this.accept(
        inputId,
        { op: 'reset', ...(text !== undefined ? { note: text } : {}) },
        principal,
      )
      if (admission !== 'new') return this.duplicateReceipt(inputId, admission)
      const isRunning = this.activeTurn !== undefined
      if (!isRunning && this.queue.length === 0 && this.interrupted) {
        this.reject(inputId, 'pending_interrupts')
        return { inputId, status: 'rejected', reason: 'pending_interrupts' }
      }
      const operation = this.queueReset(inputId, text, principal, 'front')
      return this.keep({
        inputId,
        status: isRunning ? 'queued' : 'accepted',
        operationId: operation.id,
      })
    })
  }

  /**
   * Answer the interrupts of the last turn. One resume must answer every open
   * interrupt of that turn (the AG-UI rule). `principal` means the same as in
   * `prompt`: the turn that continues runs with its credentials.
   */
  async resolve(
    resume: Array<RunAgentResumeItem>,
    options?: {
      inputId?: string
      principal?: Principal
      /** @internal The AG-UI `runId` of a `POST run` request. The turn runs as it. */
      runId?: string
    },
  ): Promise<Receipt> {
    return this.admitting(async () => {
      const inputId = options?.inputId ?? createInputId()
      const principal = options?.principal ?? this.principal
      const admission = await this.accept(
        inputId,
        { op: 'resolve', resume },
        principal,
      )
      if (admission !== 'new') return this.duplicateReceipt(inputId, admission)
      const runId = options?.runId
      // A run id must not take the id of another operation or stored run.
      const isTaken =
        runId !== undefined &&
        (this.operations.has(runId) || (await this.isRunTaken(runId)))
      if (isTaken) {
        this.reject(inputId, 'conflict')
        return { inputId, status: 'rejected', reason: 'conflict' }
      }
      const answers = this.interrupted
      if (!answers) {
        this.reject(inputId, 'no_pending_interrupts')
        return { inputId, status: 'rejected', reason: 'no_pending_interrupts' }
      }
      // A client answers on RUN_FINISHED, while the interrupted turn still
      // ends. The resolve runs right after it.
      const isEnding = this.activeTurn?.id === answers.runId
      if (
        (this.activeTurn && !isEnding) ||
        this.queue.some((turn) => turn.answers?.runId === answers.runId)
      ) {
        this.reject(inputId, 'busy')
        return { inputId, status: 'rejected', reason: 'busy' }
      }
      // A cancelled sign-in fails its tool when the turn runs it again.
      for (const entry of resume) {
        const connector = signInConnector(
          answers.interrupts.find((item) => item.id === entry.interruptId),
        )
        if (connector && entry.status === 'cancelled')
          this.declinedSignIns.add(connector)
      }
      const operation = this.createTurnOperation(runId)
      this.bindTurn(inputId, operation)
      // The turn goes on with the context its input sent.
      const turn: QueuedTurn = {
        operation,
        resume,
        inputId,
        answers,
        principal,
        context: answers.context,
      }
      if (isEnding) this.queue.unshift(turn)
      else this.enqueueTurn(turn)
      return this.keep({
        inputId,
        status: 'accepted',
        operationId: operation.id,
      })
    })
  }

  /**
   * Cancel one operation, or the running chat turn. On a durable host the
   * abort request is stored first, so a turn that a crash stops later settles
   * `aborted` and does not run again.
   */
  /**
   * Move a running tool call to the background: the call returns at once,
   * and the job keeps running. When it ends, a note tells the model and
   * wakes an idle session. Without `toolCallId`, it moves every running
   * call that supports it, such as `bash` and the single `subagent` tool.
   * With no such call, the receipt is rejected with `not_running`.
   *
   * @example
   * ```ts
   * await session.background()
   * ```
   */
  async background(toolCallId?: string): Promise<Receipt> {
    const inputId = createInputId()
    const ids =
      toolCallId === undefined ? [...this.detachable.keys()] : [toolCallId]
    const moves = ids.flatMap((id) => this.detachable.get(id) ?? [])
    if (moves.length === 0) {
      return { inputId, status: 'rejected', reason: 'not_running' }
    }
    for (const id of ids) this.detachable.delete(id)
    for (const move of moves) move()
    return { inputId, status: 'accepted' }
  }

  async cancel(operationId?: string): Promise<Receipt> {
    const inputId = createInputId()
    await this.accept(inputId, { op: 'cancel', operationId })
    const target = operationId
      ? this.operations.get(operationId)
      : this.activeTurn
    if (!target || target.isSettled()) {
      return this.reject(inputId, 'not_running')
    }
    const waitingSteer = this.steerQueue.find(
      (steer) => steer.operation === target,
    )
    // A join took it, so it ends with the running turn, as a joined steer.
    if (waitingSteer && this.joining.has(waitingSteer.inputId)) {
      return this.reject(inputId, 'not_running')
    }
    // It never joins now, and settles when the running turn ends.
    if (waitingSteer) this.abortedSteers.add(waitingSteer.inputId)
    const targetInput = this.operationInputs.get(target.id)
    if (this.writer && targetInput) {
      await this.writer.append([
        { type: 'harness.input.abort', inputId: targetInput },
      ])
    }
    if (waitingSteer) {
      await this.markApplied(inputId, target.id)
      return { inputId, status: 'accepted', operationId: target.id }
    }
    const chain = this.chainOf.get(target.id)
    const waiting =
      chain?.followUps.findIndex((item) => item.operation === target) ?? -1
    if (chain && waiting >= 0) {
      // A follow-up that did not start never runs.
      const [item] = chain.followUps.splice(waiting, 1)
      if (item) {
        await this.settle({
          inputId: item.inputId,
          outcome: 'aborted',
          operationId: target.id,
        })
      }
      target.fail('cancelled', new Error('Cancelled before it started.'))
      this.publishFinished(target)
      await this.markApplied(inputId, target.id)
      this.checkIdle()
      return { inputId, status: 'accepted', operationId: target.id }
    }
    // A run's children stop first, bottom-up.
    for (const child of chain?.children ?? []) {
      if (!child.current.operation.isSettled()) {
        await this.cancel(child.current.operation.id)
      }
    }
    const queued = this.queue.findIndex((turn) => turn.operation === target)
    if (queued >= 0) {
      this.queue.splice(queued, 1)
      if (targetInput) {
        await this.settle({
          inputId: targetInput,
          outcome: 'aborted',
          operationId: target.id,
        })
      }
      await this.refreshTurnInterrupts(target)
      target.fail('cancelled', new Error('Cancelled before it started.'))
      this.publishFinished(target)
    } else {
      target.abortController.abort(RUN_CANCEL_REASON)
    }
    await this.markApplied(inputId, target.id)
    return { inputId, status: 'accepted', operationId: target.id }
  }

  /**
   * The inputs that wait, in the order they run: first the steers for the
   * running turn, then the queued turns. Change one with `cancelInput` or
   * `setDelivery`.
   *
   * @example
   * ```ts
   * for (const input of session.inputs()) {
   *   if (input.delivery === 'queue') await session.cancelInput(input.inputId)
   * }
   * ```
   */
  inputs() {
    const waiting: Array<WaitingInput> = []
    // A steer with an abort request never runs. It settles with the turn.
    for (const steer of this.steerQueue) {
      if (this.isAbortRequested(steer.inputId)) continue
      waiting.push({
        inputId: steer.inputId,
        delivery: 'steer',
        message: steer.message,
      })
    }
    // A resolve and a turn that recovery runs again have no new message.
    for (const turn of this.queue) {
      if (turn.inputId === undefined || turn.message === undefined) continue
      waiting.push({
        inputId: turn.inputId,
        delivery: 'queue',
        message: turn.message,
      })
    }
    return waiting
  }

  /**
   * Cancel an input that waits, so it never runs, also after a restart. It
   * settles `aborted`. An input that started, or that joins the running
   * turn now, is refused with `not_waiting`: stop it with
   * `cancel(operationId)`.
   *
   * @example
   * ```ts
   * await session.followUp('Then write the tests.', { inputId: 'tests' })
   * await session.cancelInput('tests')
   * ```
   */
  async cancelInput(target: string): Promise<Receipt> {
    const inputId = createInputId()
    await this.accept(inputId, { op: 'cancelInput', inputId: target })
    const taken = this.takeWaiting(target)
    if (!taken) return this.reject(inputId, 'not_waiting')
    await this.applyControl(inputId, {
      type: 'harness.input.abort',
      inputId: target,
    })
    // Without a log, the inbox entry must not stay pending: a restart runs
    // pending entries.
    if (!this.writer) await this.inbox.markRejected(target, 'cancelled')
    const { operation } = taken
    await this.settle({
      inputId: target,
      outcome: 'aborted',
      ...(operation ? { operationId: operation.id } : {}),
    })
    if (operation) {
      operation.fail('cancelled', new Error('Cancelled before it started.'))
      this.publishFinished(operation)
    }
    return { inputId, status: 'accepted' }
  }

  /**
   * Move an input that waits. `'steer'` joins it to the running turn at the
   * next model call. `'queue'` runs it as its own turn, after the queued
   * turns. An input that started, or that joins the running turn now, is
   * refused with `not_waiting`. On a durable host the log keeps the
   * delivery, and a restart honors it. Without a log, it is kept in memory.
   *
   * @example
   * ```ts
   * await session.followUp('Use tabs, not spaces.', { inputId: 'style' })
   * await session.setDelivery('style', 'steer')
   * ```
   */
  async setDelivery(
    target: string,
    delivery: WaitingInput['delivery'],
  ): Promise<Receipt> {
    const inputId = createInputId()
    await this.accept(inputId, { op: 'setDelivery', inputId: target, delivery })
    const current = this.inputs().find((input) => input.inputId === target)
    if (current?.delivery !== delivery) {
      const taken = this.takeWaiting(target)
      if (!taken) return this.reject(inputId, 'not_waiting')
      if (delivery === 'steer') this.steerQueue.push(taken)
      else this.enqueueTurn(this.steerTurn(taken))
    }
    await this.applyControl(inputId, {
      type: 'harness.input.delivery',
      inputId: target,
      delivery,
    })
    this.feed.publish(
      'session',
      customEvent(HARNESS_EVENTS.inputDelivery, { inputId: target, delivery }),
    )
    return { inputId, status: 'accepted' }
  }

  /**
   * How a chat input ended: `completed`, `failed`, `aborted`, or
   * `interrupted` (the turn waits for human input). It waits until the input
   * ends. On a durable host it reads the log, so it also works after a
   * restart and from another host that opens the thread. There it also
   * takes the input id of an agent run from the log.
   *
   * Rejects with `InputRejectedError` when the session refused the input,
   * and with an error for an id this session does not know.
   *
   * @example
   * ```ts
   * const turn = session.prompt('Summarize the report.', { inputId: 'req-42' })
   * const { outcome } = await session.settled('req-42')
   * ```
   */
  async settled(inputId: string): Promise<InputSettlement> {
    const known = this.knownSettlement(inputId)
    if (known) return known
    if (!this.isChatInput(inputId)) {
      throw new Error(
        `The session knows no chat input with the id ${JSON.stringify(inputId)}.`,
      )
    }
    const settledEvent = (entry: SessionEvent) =>
      entry.event.type === EventType.CUSTOM &&
      entry.event.name === HARNESS_EVENTS.inputSettled &&
      isRecord(entry.event.value) &&
      entry.event.value.inputId === inputId
    for await (const _entry of this.feed.read({
      from: this.feed.head(),
      filter: settledEvent,
    })) {
      const settlement = this.knownSettlement(inputId)
      if (settlement) return settlement
    }
    throw new Error('The session closed before the input ended.')
  }

  // ===========================
  // Events and state
  // ===========================

  /** The ordered events of every operation, from `from` (exclusive). */
  events(options?: {
    from?: Cursor
    signal?: AbortSignal
  }): AsyncIterable<SessionEvent> {
    return this.feed.read(options ?? {})
  }

  /**
   * The token usage of this thread: every model call of its turns, their
   * subagents, and its agent runs, in total, by `provider/model`, and by
   * sender. `cost` is the sum of what the providers reported. A durable host
   * keeps the totals in the log, a host with `stores.metadata` keeps them
   * there, and other hosts keep them in memory.
   *
   * @example
   * ```ts
   * const { total, bySender } = session.usage()
   * console.log(total.totalTokens, bySender['user-1']?.cost)
   * ```
   */
  usage(): SessionUsage {
    return structuredClone(this.writer?.state.usage ?? this.usageTotals)
  }

  snapshot(): SessionSnapshot {
    const active = [...this.operations.values()].filter(
      (operation) => !operation.isSettled(),
    )
    return {
      threadId: this.threadId,
      status: this.activeTurn
        ? 'running'
        : this.interrupted
          ? 'requires_action'
          : 'idle',
      activeOperations: active.map((operation) => ({
        id: operation.id,
        kind: operation.kind,
        ...(operation.agent ? { agent: operation.agent } : {}),
        startedCursor: operation.startedCursor,
      })),
      // A steer that waits to join the running turn waits too.
      queuedTurns: this.queue.length + this.steerQueue.length,
      waitingInputs: this.inputs(),
      pendingInterrupts:
        this.activeResume && !this.activeTurn?.isSettled()
          ? []
          : (this.interrupted?.interrupts ?? []),
      pendingQuestions: [...this.questions.entries()].map(
        ([questionId, question]) => ({
          questionId,
          message: question.message,
          ...(question.schema
            ? { schema: convertSchemaToJsonSchema(question.schema) }
            : {}),
          ...(question.secret ? { secret: true } : {}),
          ...(question.url ? { url: question.url } : {}),
        }),
      ),
      plugins: { ...this.stateDoc },
      usage: this.usage(),
      cursor: this.feed.head(),
    }
  }

  // ===========================
  // Media
  // ===========================

  /**
   * Store a file in the media store of this thread. Send it to a turn with
   * `mediaPart(record)`. Throws a `MediaError`: 413 when the file is bigger
   * than `media.maxBytes`, 415 for a type or kind the harness does not take.
   *
   * @example
   * const record = await session.putMedia(bytes, { mimeType: 'image/png', name: 'cat.png' })
   * session.prompt([{ type: 'text', content: 'What is this?' }, mediaPart(record)])
   */
  putMedia(body: BlobBody, info: { mimeType: string; name: string }) {
    return this.mediaStore.put(body, info)
  }

  /** The record of a media file of this thread, or `null` when it is not found. */
  getMedia(id: string) {
    return this.mediaStore.get(id)
  }

  /**
   * The bytes of a media file, or of one `range` of them. Throws a
   * `MediaError` with 404 when it is not found.
   */
  loadMedia(id: string, range?: BlobRange) {
    return this.mediaStore.load(id, range)
  }

  /**
   * A URL for a media file, for `<img>`, `<audio>`, or `<video>`. A session
   * has no server, so this is a data URL for a file up to 1 MB, and `{}` for
   * a bigger file (use `loadMedia`).
   */
  async mediaUrl(id: string) {
    const url = await this.mediaStore.dataUrl(id)
    const answer: { url?: string; expiresAt?: number } =
      url === undefined ? {} : { url }
    return answer
  }

  /**
   * @internal Start this new thread as a fork of `source`, before its first
   * turn: `messages` with their media copied to this thread, and the stored
   * settings and plugin config of `source`. `host.fork` calls it.
   */
  async adoptFork(
    source: HarnessSession,
    messages: ReadonlyArray<ModelMessage>,
  ): Promise<void> {
    // A media id belongs to one thread, so each file gets a copy here.
    const copies = new Map<string, MediaRecord | null>()
    const copy = async (id: string) => {
      if (!copies.has(id)) {
        const record = await source.getMedia(id)
        copies.set(
          id,
          record &&
            (await this.putMedia(await source.loadMedia(id), {
              mimeType: record.mimeType,
              name: record.name,
            })),
        )
      }
      return copies.get(id) ?? undefined
    }
    const forked: Array<ModelMessage> = []
    for (const message of messages) {
      const content = Array.isArray(message.content)
        ? await Promise.all(
            message.content.map(async (part) => {
              const id = mediaIdOf(part)
              const made = id === undefined ? undefined : await copy(id)
              return made ? mediaPart(made) : part
            }),
          )
        : message.content
      const media = mediaOfMessage(message)
      if (media.length === 0) {
        forked.push({ ...message, content })
        continue
      }
      const harness = {
        ...message.metadata?.harness,
        media: await Promise.all(
          media.map(async (record) => (await copy(record.id)) ?? record),
        ),
      }
      forked.push({
        ...message,
        content,
        metadata: { ...message.metadata, harness },
      })
    }
    await this.messages.saveThread(this.threadId, forked)
    const { metadata } = this.persistence.stores
    this.threadSettings = source.settings()
    if (Object.keys(this.threadSettings).length > 0) {
      await metadata?.set(SETTINGS, this.threadId, this.threadSettings)
    }
    for (const [key, value] of source.configValues) {
      if (this.sessionPlugins?.config.has(key))
        this.configValues.set(key, value)
    }
    if (this.configValues.size > 0) {
      await metadata?.set(
        'harness:config',
        this.threadId,
        Object.fromEntries(this.configValues),
      )
    }
  }

  // ===========================
  // Config, commands, questions
  // ===========================

  /** Every session setting, with its option and current value. */
  config(): Record<
    string,
    { option: ConfigOption; value: unknown; owner: string }
  > {
    const result: Record<
      string,
      { option: ConfigOption; value: unknown; owner: string }
    > = {}
    for (const [key, entry] of this.sessionPlugins?.config ?? []) {
      result[key] = {
        option: entry.option,
        owner: entry.owner,
        value: this.configValue(key),
      }
    }
    return result
  }

  /** Change a session setting. It applies at the next turn. */
  async setConfig(key: string, value: unknown): Promise<Receipt> {
    const inputId = createInputId()
    await this.accept(inputId, { op: 'config', key, value })
    const entry = this.sessionPlugins?.config.get(key)
    if (!entry) return this.reject(inputId, 'unknown_config')
    let checked: unknown
    try {
      checked = checkConfigValue(key, entry.option, value)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      return this.reject(inputId, reason)
    }
    this.configValues.set(key, checked)
    await this.persistence.stores.metadata?.set(
      'harness:config',
      this.threadId,
      Object.fromEntries(this.configValues),
    )
    await this.applied(inputId, 'session')
    this.feed.publish(
      'session',
      customEvent(HARNESS_EVENTS.configChanged, { key, value: checked }),
    )
    return { inputId, status: 'accepted' }
  }

  /** The stored settings of this thread. See `configure`. */
  settings(): ThreadSettings {
    return structuredClone(this.threadSettings)
  }

  /**
   * Change the stored settings of this thread: the model by name (from
   * `defineHarness({ models })`), `reasoning`, `instructions`, `tools`,
   * `plugins`, and the working folder `cwd`. A field set to `null` is
   * cleared, and a missing field stays. They apply from the next turn, and
   * the turn's `overrides` win over them. `stores.metadata` keeps them.
   *
   * It is an input, so the log keeps who changed what (`principal`). An
   * unknown field, model, or plugin, or a bad value, is rejected.
   *
   * @example
   * ```ts
   * await session.configure({ model: 'strong', instructions: 'Answer in French.' })
   * ```
   */
  async configure(
    settings: ThreadSettingsChange,
    options?: { principal?: Principal; inputId?: string },
  ): Promise<Receipt> {
    const inputId = options?.inputId ?? createInputId()
    const principal = options?.principal ?? this.principal
    const admission = await this.accept(
      inputId,
      { op: 'configure', settings },
      principal,
    )
    if (admission !== 'new') return this.duplicateReceipt(inputId, admission)
    let next: ThreadSettings
    try {
      next = changeSettings(this.threadSettings, settings, this.settingNames())
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      this.reject(inputId, reason)
      return this.keep({ inputId, status: 'rejected', reason })
    }
    await this.persistence.stores.metadata?.set(SETTINGS, this.threadId, next)
    const movedFrom = this.threadSettings.cwd
    this.threadSettings = next
    // Tell the model about a new folder, so it stops using the old paths.
    // A new thread gets no note: some providers refuse a conversation that
    // starts with an assistant message.
    const isNew = (await this.messages.loadThread(this.threadId)).length === 0
    if (next.cwd !== movedFrom && !isNew) {
      await this.addNote(
        next.cwd === undefined
          ? 'The working folder is the default folder again.'
          : `The working folder is now ${next.cwd}. Paths are relative to it.`,
      )
    }
    await this.applied(inputId, 'session')
    this.feed.publish(
      'session',
      customEvent(HARNESS_EVENTS.settingsChanged, { settings: next }),
    )
    return this.keep({ inputId, status: 'accepted' })
  }

  /** The model and plugin names that a setting can use. */
  private settingNames(): SettingNames {
    return {
      models: new Set(Object.keys(this.harness.models ?? {})),
      plugins: new Set(this.plugins.map((plugin) => plugin.name)),
    }
  }

  /** The commands of this session, for hosts to list. */
  commands(): Array<{
    name: string
    description: string
    owner: string
    input?: unknown
  }> {
    return [...(this.sessionPlugins?.commands ?? [])].map(([name, entry]) => ({
      name,
      description: entry.command.description,
      owner: entry.owner,
      ...(entry.command.input
        ? { input: convertSchemaToJsonSchema(entry.command.input) }
        : {}),
    }))
  }

  /**
   * The saved messages of this thread, oldest first. While a revert stands,
   * the messages after its message are hidden.
   */
  async transcript() {
    const messages = [...(await this.messages.loadThread(this.threadId))]
    const at = this.revertedAt(messages)
    return at < 0 ? messages : messages.slice(0, at + 1)
  }

  /** The index of the revert message in `messages`, or -1. */
  private revertedAt(messages: ReadonlyArray<ModelMessage>) {
    const id = this.reverted?.messageId
    return id === undefined
      ? -1
      : messages.findIndex((message) => message.id === id)
  }

  /**
   * Go back to the message `messageId`. The transcript hides the messages
   * after it. With the snapshots plugin, the files that their tool calls
   * changed go back too. `unrevert()` undoes it. The next turn drops the
   * hidden messages for good. The revert state is saved, so it survives a
   * restart. Refused while the session is not idle (`'busy'`), and for a
   * message that is not in the transcript (`'unknown_message'`).
   */
  async revert(messageId: string): Promise<Receipt> {
    const inputId = createInputId()
    if (this.snapshot().status !== 'idle') {
      return { inputId, status: 'rejected', reason: 'busy' }
    }
    const messages = await this.messages.loadThread(this.threadId)
    const at = messages.findIndex((message) => message.id === messageId)
    if (at < 0)
      return { inputId, status: 'rejected', reason: 'unknown_message' }
    // A revert that stands ends first, so its files come back.
    await this.unrevert()
    const handler = this.sessionPlugins?.values.get(RevertFiles)
    const files = await handler?.revert(messages.slice(at + 1), (type) =>
      this.hostRecords(type),
    )
    await this.saveRevert({
      messageId,
      ...(files !== undefined ? { files } : {}),
    })
    return { inputId, status: 'accepted' }
  }

  /** End the revert that stands: its files and messages come back. */
  async unrevert(): Promise<Receipt> {
    const inputId = createInputId()
    if (this.snapshot().status !== 'idle') {
      return { inputId, status: 'rejected', reason: 'busy' }
    }
    const reverted = this.reverted
    if (!reverted) return { inputId, status: 'accepted' }
    if (reverted.files !== undefined) {
      await this.sessionPlugins?.values
        .get(RevertFiles)
        ?.unrevert(reverted.files)
    }
    await this.saveRevert(undefined)
    return { inputId, status: 'accepted' }
  }

  /** Drop the messages that a standing revert hides, and end the revert. */
  private async commitRevert() {
    if (!this.reverted) return
    const messages = await this.messages.loadThread(this.threadId)
    const at = this.revertedAt(messages)
    if (at >= 0) {
      await this.messages.saveThread(this.threadId, messages.slice(0, at + 1))
    }
    await this.saveRevert(undefined)
  }

  /** Keep the revert state in the log, else in the metadata store. */
  private async saveRevert(revert: RevertState | undefined) {
    this.reverted = revert
    if (this.writer) {
      await this.writer.append([
        { type: 'harness.revert', revert: revert ?? null },
      ])
    } else {
      await this.persistence.stores.metadata?.set(
        'harness:revert',
        this.threadId,
        revert ?? null,
      )
    }
    this.feed.publish(
      'session',
      customEvent(HARNESS_EVENTS.revert, {
        messageId: revert?.messageId ?? null,
      }),
    )
  }

  /** The host records of `type` of this thread, from the log, oldest first. */
  private async hostRecords(type: string) {
    const found: Array<Record<string, unknown>> = []
    if (!this.writer || !this.log) return found
    let after = 0
    for (;;) {
      const entries = await this.log.store.read(this.logId, {
        after,
        limit: 256,
      })
      for (const { seq, record } of entries) {
        after = seq
        const isOwn = (record.thread ?? this.logId) === this.threadId
        if (isOwn && record.type === type) found.push(record)
      }
      if (entries.length < 256) return found
    }
  }

  /** The commands, settings, and tools of this session, for a UI. */
  describe() {
    return {
      commands: this.commands(),
      config: Object.entries(this.config()).map(([key, entry]) => ({
        key,
        ...entry,
      })),
      tools: this.inspect().tools,
      settings: this.settings(),
      models: Object.keys(this.harness.models ?? {}),
    } satisfies SessionDescription
  }

  /**
   * Run a plugin command. Its input is checked against the command's schema.
   * `principal` is who runs it. Default: the principal that opened the
   * session. The log keeps it, and the command gets that user's credentials.
   */
  command(
    name: string,
    input?: unknown,
    options?: { principal?: Principal },
  ): Operation<unknown> {
    const operation = new OperationImpl<unknown>(
      'command',
      this.feed,
      (target) => this.cancel(target.id),
    )
    this.operations.set(operation.id, operation)
    const principal = options?.principal ?? this.principal
    void this.executeCommand(operation, name, input, principal)
    return operation
  }

  /** Answer a question from `ctx.session.ask`. */
  async answer(questionId: string, value: unknown): Promise<Receipt> {
    const inputId = createInputId()
    // A secret (a key or a password) stays out of the inbox. A restart does
    // not replay an answer, so the inbox never needs it.
    const isSecret = this.questions.get(questionId)?.secret === true
    await this.accept(inputId, {
      op: 'answer',
      questionId,
      value: isSecret ? '[secret]' : value,
    })
    const question = this.questions.get(questionId)
    if (!question) return this.reject(inputId, 'unknown_question')
    let checked: unknown = value
    if (question.schema !== undefined) {
      const result = await validateWithStandardSchema(question.schema, value)
      if (!result.success) {
        const reason = `Invalid answer: ${result.issues.map((issue) => issue.message).join(', ')}`
        return this.reject(inputId, reason)
      }
      checked = result.data
    }
    this.questions.delete(questionId)
    await this.applied(inputId, 'session')
    this.feed.publish(
      question.operationId,
      customEvent(HARNESS_EVENTS.questionAnswered, { questionId }),
    )
    question.resolve(checked)
    return { inputId, status: 'accepted' }
  }

  /** The resolved plugin plan: order, owners, and extension contributors. */
  inspect(): SessionInspection {
    const mounted = this.sessionPlugins
    const extensionPoints: Record<string, Array<string>> = {}
    for (const [point, items] of mounted?.extensions ?? []) {
      extensionPoints[point] = [...new Set(items.map((item) => item.owner))]
    }
    return {
      plugins: mounted?.owners.plugins ?? [],
      tools: mounted?.owners.tools ?? [],
      prompts: mounted?.owners.prompts ?? [],
      commands: [...(mounted?.commands ?? [])].map(([name, entry]) => ({
        name,
        owner: entry.owner,
      })),
      config: [...(mounted?.config ?? [])].map(([key, entry]) => ({
        key,
        owner: entry.owner,
      })),
      extensionPoints,
      agents: this.agentRegistry.list().map((agent) => agent.name),
    }
  }

  private configValue(key: string): unknown {
    if (this.configValues.has(key)) return this.configValues.get(key)
    return this.sessionPlugins?.config.get(key)?.option.default
  }

  private async loadConfig(): Promise<void> {
    const stored = await this.persistence.stores.metadata?.get(
      'harness:config',
      this.threadId,
    )
    if (typeof stored !== 'object' || stored === null) return
    for (const [key, value] of Object.entries(stored)) {
      const entry = this.sessionPlugins?.config.get(key)
      if (!entry) continue
      try {
        this.configValues.set(key, checkConfigValue(key, entry.option, value))
      } catch {
        // A stored value an option no longer accepts falls back to the default.
      }
    }
  }

  /** Read the stored settings of this thread. */
  private async loadSettings(): Promise<void> {
    const stored = await this.persistence.stores.metadata?.get(
      SETTINGS,
      this.threadId,
    )
    if (!isRecord(stored)) return
    const names = this.settingNames()
    for (const [key, value] of Object.entries(stored)) {
      try {
        this.threadSettings = changeSettings(
          this.threadSettings,
          { [key]: value },
          names,
        )
      } catch {
        // A value the harness no longer takes (a removed model or plugin)
        // is dropped.
      }
    }
  }

  /** Restore the usage totals that `stores.metadata` keeps for this thread. */
  private async loadUsage(): Promise<void> {
    const stored = await this.persistence.stores.metadata?.get(
      USAGE,
      this.threadId,
    )
    if (isSessionUsage(stored)) this.usageTotals = stored
  }

  /** Restore the interrupted turn that `stores.metadata` keeps for this thread. */
  private async loadInterrupted(): Promise<void> {
    const stored = await this.persistence.stores.metadata?.get(
      INTERRUPTED,
      this.threadId,
    )
    if (isInterruptedTurn(stored)) this.interrupted = stored
    await this.refreshInterrupted()
  }

  /** Keep the snapshot in line with the committed interrupt records. */
  private async refreshInterrupted(
    observed?: InterruptedTurn,
    consumed = false,
    persist = true,
  ): Promise<void> {
    const previous = observed ?? this.interrupted
    const store = this.persistence.stores.interrupts
    let next = previous
    if (store) {
      const pending = await store.listPending(this.threadId)
      const owned = pending.filter((record) => {
        const payload = record.payload
        const metadata = isRecord(payload.metadata)
          ? payload.metadata
          : undefined
        return (
          previous?.interrupts.some((item) => item.id === record.interruptId) ||
          typeof payload.toolCallId === 'string' ||
          metadata?.kind === 'approval' ||
          metadata?.kind === 'client_tool' ||
          (metadata !== undefined && 'tanstack:interruptBinding' in metadata) ||
          typeof payload.id !== 'string' ||
          typeof payload.reason !== 'string' ||
          typeof payload.message !== 'string'
        )
      })
      if (new Set(owned.map((record) => record.runId)).size > 1) {
        throw new Error('Pending interrupts belong to more than one run.')
      }
      const runId = owned.at(-1)?.runId
      const records = owned.filter((record) => record.runId === runId)
      const interrupts: Array<Interrupt> = []
      for (const record of records) {
        const payload = record.payload
        if (
          payload.id !== record.interruptId ||
          record.threadId !== this.threadId ||
          typeof payload.reason !== 'string' ||
          typeof payload.message !== 'string'
        ) {
          throw new Error('The stored interrupt descriptor is invalid.')
        }
        interrupts.push({
          ...payload,
          id: payload.id,
          reason: payload.reason,
          message: payload.message,
        })
      }
      const savedInput = [...(this.writer?.state.inputs.values() ?? [])].find(
        (input) => input.operationId === runId,
      )
      const context =
        previous !== undefined && previous.runId === runId
          ? previous.context
          : savedInput && 'context' in savedInput.input
            ? savedInput.input.context
            : undefined
      next =
        runId && interrupts.length > 0
          ? {
              runId,
              interrupts,
              ...(previous !== undefined &&
              previous.runId === runId &&
              previous.routed
                ? { routed: previous.routed }
                : {}),
              ...storedPrincipal(
                previous !== undefined && previous.runId === runId
                  ? previous.principal
                  : savedInput?.principal,
              ),
              ...(context !== undefined ? { context } : {}),
            }
          : undefined
    } else if (consumed && observed === undefined) {
      next = undefined
    } else if (observed === undefined && this.writer && this.log) {
      let after = 0
      for (;;) {
        const entries = await this.log.store.read(this.logId, {
          after,
          limit: 256,
        })
        for (const { seq, record } of entries) {
          after = seq
          if (
            (record.thread ?? this.logId) !== this.threadId ||
            record.type !== 'harness.event' ||
            !isRecord(record.event)
          )
            continue
          const event = record.event
          // A later result of an interrupt's tool call: its resume ran, so it
          // is used up, also when that turn failed after the tool.
          if (
            event.type === EventType.TOOL_CALL_RESULT &&
            typeof event.toolCallId === 'string' &&
            next !== undefined
          ) {
            if (!(await this.isRunResult(event, record.operationId))) continue
            const remaining = next.interrupts.filter(
              (interrupt) => toolCallOf(interrupt) !== event.toolCallId,
            )
            if (remaining.length !== next.interrupts.length) {
              next =
                remaining.length > 0
                  ? { ...next, interrupts: remaining }
                  : undefined
            }
            continue
          }
          if (
            event.type !== EventType.RUN_FINISHED ||
            event.subagentRunId ||
            typeof record.operationId !== 'string'
          )
            continue
          if (
            isRecord(event.outcome) &&
            event.outcome.type === 'interrupt' &&
            Array.isArray(event.outcome.interrupts)
          ) {
            const interrupts: Array<Interrupt> = []
            for (const item of event.outcome.interrupts) {
              if (
                !isRecord(item) ||
                typeof item.id !== 'string' ||
                typeof item.reason !== 'string' ||
                typeof item.message !== 'string'
              ) {
                throw new Error('The logged interrupt descriptor is invalid.')
              }
              interrupts.push({
                ...item,
                id: item.id,
                reason: item.reason,
                message: item.message,
              })
            }
            const savedInput = [
              ...(this.writer?.state.inputs.values() ?? []),
            ].find((input) => input.operationId === record.operationId)
            const context =
              previous !== undefined && previous.runId === record.operationId
                ? previous.context
                : savedInput && 'context' in savedInput.input
                  ? savedInput.input.context
                  : undefined
            next = {
              runId: record.operationId,
              interrupts,
              ...(previous !== undefined &&
              previous.runId === record.operationId &&
              previous.routed
                ? { routed: previous.routed }
                : {}),
              ...storedPrincipal(
                previous !== undefined && previous.runId === record.operationId
                  ? previous.principal
                  : savedInput?.principal,
              ),
              ...(context !== undefined ? { context } : {}),
            }
          } else if (
            (await this.persistence.stores.runs?.get(record.operationId))
              ?.status === 'completed'
          )
            next = undefined
        }
        if (entries.length < 256) break
      }
    }
    this.interrupted = next
    if (!persist) return
    if (next)
      await this.persistence.stores.metadata?.set(
        INTERRUPTED,
        this.threadId,
        next,
      )
    else if (previous !== undefined) {
      try {
        await this.persistence.stores.metadata?.delete(
          INTERRUPTED,
          this.threadId,
        )
      } catch (error) {
        if (!consumed || observed !== undefined) throw error
        await this.persistence.stores.metadata?.set(
          INTERRUPTED,
          this.threadId,
          null,
        )
      }
    }
  }

  /**
   * True when a logged tool result means its tool ran: it is not cancelled,
   * and an error result does not come from a stopped run.
   */
  private async isRunResult(
    event: Record<string, unknown>,
    operationId: unknown,
  ) {
    const tanstack = tanstackOf(event)
    if (tanstack?.toolResultOutcome === 'cancelled') return false
    if (tanstack?.state !== 'output-error') return true
    if (typeof operationId !== 'string') return false
    const run = await this.persistence.stores.runs?.get(operationId)
    return run !== null && run !== undefined && run.status !== 'aborted'
  }

  /**
   * Mark the interrupts of `resume` answered in the interrupt store, the same
   * way `withPersistence` commits them at a success boundary. Records that are
   * no longer pending are left as they are.
   */
  private async consumeResume(resume: ReadonlyArray<RunAgentResumeItem>) {
    const store = this.persistence.stores.interrupts
    if (!store) return
    for (const item of resume) {
      const record = await store.get(item.interruptId)
      if (record?.status !== 'pending' || record.threadId !== this.threadId) {
        continue
      }
      if (item.status === 'resolved') {
        await store.resolve(item.interruptId, item.payload)
      } else {
        await store.cancel(item.interruptId)
      }
    }
  }

  /** Refresh even when a turn failed before its main try block. */
  private async refreshTurnInterrupts(
    operation: OperationImpl<unknown> | OperationImpl<ChatTurnResult>,
    observed?: InterruptedTurn,
    consumed = false,
  ): Promise<void> {
    await this.refreshInterrupted(observed, consumed).catch((error: unknown) =>
      this.warn(operation, 'harness:interrupts', error),
    )
  }

  /**
   * Make `stopped` the interrupted turn. `stores.metadata` gets it first, so a
   * restart can resolve it too, and a resolve cannot delete the copy before
   * it is written. A failed write is a warning.
   */
  private async keepInterrupted(
    operation: OperationImpl<ChatTurnResult>,
    stopped: InterruptedTurn,
  ): Promise<void> {
    await this.persistence.stores.metadata
      ?.set(INTERRUPTED, this.threadId, stopped)
      .catch((error: unknown) =>
        this.warn(operation, 'harness:interrupts', error),
      )
    this.interrupted = stopped
  }

  /**
   * A saved credential can answer the sign-ins the last turn waits for. When
   * every open interrupt is a sign-in and each of their connectors has a
   * credential of the turn's sender now, the turn goes on as that sender and
   * its tools run again. The input id comes from the interrupts, so a second
   * save does not resolve them twice.
   */
  private async resumeSignIns(): Promise<void> {
    const stopped = this.interrupted
    const waiting = stopped?.interrupts ?? []
    const connectors = waiting.map(signInConnector)
    if (waiting.length === 0) return
    // Another user's credential never answers this sign-in.
    const principal = stopped?.principal ?? this.principal
    const credentials = this.credentialsOf(principal)
    for (const connector of connectors) {
      if (!connector || !(await credentials.get(connector))) return
    }
    if (this.interrupted !== stopped) return
    await this.resolve(
      waiting.map((interrupt, index) => ({
        interruptId: interrupt.id,
        status: 'resolved',
        payload: { connector: connectors[index] },
      })),
      {
        inputId: `sign-in:${waiting.map((item) => item.id).join(',')}`,
        ...(principal ? { principal } : {}),
      },
    )
  }

  /** Put each plugin's saved state in the snapshot before the first read. */
  private async loadPluginState() {
    for (const [plugin, load] of this.stateLoaders) {
      if (!(plugin in this.stateDoc)) this.stateDoc[plugin] = await load()
    }
  }

  private ask(question: Question<SchemaInput | undefined>): Promise<unknown> {
    if (this.closing) return Promise.reject(new Error('Session closed.'))
    const questionId = `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
    // On the running chat turn, so a client that streams the turn (`POST
    // run`) sees it. The session stream has every operation's events.
    const operationId = this.activeTurn?.id ?? 'session'
    return new Promise((resolve, reject) => {
      this.questions.set(questionId, {
        message: question.message,
        schema: question.schema,
        secret: question.secret === true,
        url: question.url,
        operationId,
        resolve,
        reject,
      })
      this.feed.publish(
        operationId,
        customEvent(HARNESS_EVENTS.question, {
          questionId,
          message: question.message,
          ...(question.schema
            ? { schema: convertSchemaToJsonSchema(question.schema) }
            : {}),
          ...(question.secret ? { secret: true } : {}),
          ...(question.url ? { url: question.url } : {}),
        }),
      )
    })
  }

  /**
   * Who sent the input of the running turn, else the principal that opened
   * the session. Turns run one at a time, so one value is enough.
   */
  private sender(): Principal | undefined {
    return this.turnPrincipal ?? this.principal
  }

  /**
   * The session API of plugins. With `principal` (a command), it acts for
   * that user. Without it, it follows the sender of the running turn.
   */
  private pluginApi(principal?: Principal): PluginSessionApi {
    const sender = () => principal ?? this.sender()
    return {
      threadId: this.threadId,
      get principal() {
        return sender()
      },
      snapshot: () => this.snapshot(),
      // A plugin turn always waits its turn. It cannot see a busy rejection.
      prompt: (text) =>
        this.prompt(text, { busy: 'queue', principal: sender() }),
      note: async (text, options) => {
        await this.addNote(text)
        if (options?.wake) await this.followUp(text, { principal: sender() })
      },
      transcript: () => this.transcript(),
      replaceTranscript: (messages) =>
        this.messages.saveThread(this.threadId, messages),
      entry: () => this.index.get(this.threadId),
      // Only these fields: a plugin cannot change the owner or the parent.
      updateEntry: ({ title, metadata, usage }) =>
        this.index.update(
          this.threadId,
          (entry) =>
            entry && {
              ...entry,
              ...(title !== undefined ? { title } : {}),
              ...(metadata !== undefined ? { metadata } : {}),
              ...(usage !== undefined ? { usage } : {}),
              updatedAt: Date.now(),
            },
        ),
      // The public type narrows the answer from the schema.
      ask: ((question: Question<SchemaInput | undefined>) =>
        this.ask(question)) as PluginSessionApi['ask'],
      authRequired: (info) =>
        this.feed.publish(
          'session',
          customEvent(HARNESS_EVENTS.authRequired, { ...info }),
        ),
      setConfig: (key, value) => this.setConfig(key, value),
      settings: () => this.settings(),
    }
  }

  private emitPluginEvent(plugin: string, name: string, value: unknown): void {
    this.feed.publish(
      'session',
      customEvent(HARNESS_EVENTS.pluginEvent, { plugin, name, value }),
    )
    for (const handler of this.listeners.get(name) ?? []) {
      try {
        handler(value)
      } catch {
        // One broken listener must not stop the others.
      }
    }
  }

  private pluginState<T>(plugin: string, initial: T): PluginState<T> {
    const metadata = this.persistence.stores.metadata
    const namespace = `plugin:${plugin}`
    const key = this.threadId
    const read = async (): Promise<{ value: T; revision: string | null }> => {
      if (metadata?.getVersioned) {
        const stored = await metadata.getVersioned(namespace, key)
        // The store holds what this plugin wrote.
        return stored
          ? { value: stored.value as T, revision: stored.revision }
          : { value: initial, revision: null }
      }
      if (metadata) {
        const stored = await metadata.get(namespace, key)
        return {
          value: stored === null ? initial : (stored as T),
          revision: null,
        }
      }
      return {
        value: this.localState.has(namespace)
          ? (this.localState.get(namespace) as T)
          : initial,
        revision: null,
      }
    }
    this.stateLoaders.set(plugin, async () => (await read()).value)
    const publish = (value: T) => {
      this.stateDoc[plugin] = value
      this.feed.publish('session', {
        type: EventType.STATE_SNAPSHOT,
        snapshot: { plugins: { ...this.stateDoc } },
        timestamp: Date.now(),
      })
    }
    return {
      get: async () => (await read()).value,
      update: async (change) => {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const current = await read()
          const next = change(structuredClone(current.value))
          if (metadata?.setIf) {
            const written = await metadata.setIf(
              namespace,
              key,
              next,
              current.revision,
            )
            if (!written.ok) continue
          } else if (metadata) {
            await metadata.set(namespace, key, next)
          } else {
            this.localState.set(namespace, next)
          }
          publish(next)
          return next
        }
        throw new Error(`Plugin ${plugin}: state update conflicted 5 times.`)
      },
    }
  }

  private async executeCommand(
    operation: OperationImpl<unknown>,
    name: string,
    input: unknown,
    principal: Principal | undefined,
  ): Promise<void> {
    const inputId = createInputId()
    await this.accept(inputId, { op: 'command', name, input }, principal)
    const entry = this.sessionPlugins?.commands.get(name)
    if (!entry) {
      this.reject(inputId, 'unknown_command')
      operation.fail('failed', new Error(`Unknown command: ${name}`))
      return
    }
    let checked: unknown = input
    if (entry.command.input !== undefined) {
      const result = await validateWithStandardSchema(
        entry.command.input,
        input ?? {},
      )
      if (!result.success) {
        const reason = `Input validation failed for command ${name}: ${result.issues
          .map((issue) => issue.message)
          .join(', ')}`
        this.reject(inputId, 'invalid_input')
        operation.fail('failed', new Error(reason))
        return
      }
      checked = result.data
    }
    operation.setStatus('running')
    await this.applied(inputId, operation.id)
    this.publishStarted(operation)
    try {
      const result: unknown = await entry.command.run(checked, {
        signal: operation.abortController.signal,
        // The command acts for its sender, also while another user's turn runs.
        session: principal ? this.pluginApi(principal) : this.services.session,
        ...(principal ? { principal } : {}),
        credentials: this.credentialsOf(principal),
      })
      operation.publish(
        customEvent('harness.command.result', {
          name,
          result: compactForModel(result),
        }),
      )
      operation.finish('completed', result)
    } catch (error) {
      operation.publish({
        type: EventType.RUN_ERROR,
        message: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      })
      operation.fail(
        operation.abortController.signal.aborted ? 'cancelled' : 'failed',
        error,
      )
    }
    this.publishFinished(operation)
  }

  /**
   * The thread has work: claim it in `stores.workClaims` for this host, and
   * renew the claim while the work runs, so a sweep finds the thread after a
   * crash. A claim that another host holds is left alone: the log still keeps
   * one writer. A closing session claims nothing.
   */
  private markBusy(): void {
    const claims = this.persistence.stores.workClaims
    if (!claims || this.claimTimer || this.closing) return
    const ttlMs = this.lease?.ttlMs ?? LEASE.ttlMs
    const claim = async () => {
      try {
        const isHeld = await claims.claim({
          threadId: this.threadId,
          harness: this.harness.name,
          ownerId: this.hostId,
          until: Date.now() + ttlMs,
        })
        // Renew only a claim this host holds.
        if (!isHeld) this.stopClaimTimer()
      } catch (error) {
        // The work goes on without a claim.
        this.warnClaim(error)
      }
    }
    const timer = setInterval(
      () => void claim(),
      this.lease?.renewMs ?? LEASE.renewMs,
    )
    // A claim timer must not keep a CLI or a test process alive.
    if (typeof timer === 'object' && 'unref' in timer) timer.unref()
    this.claimTimer = timer
    this.claimWrite = claim()
  }

  private stopClaimTimer(): void {
    if (this.claimTimer) clearInterval(this.claimTimer)
    this.claimTimer = undefined
  }

  /** Give the thread's claim back. A failed write is a warning. */
  private async releaseClaim(): Promise<void> {
    try {
      await this.persistence.stores.workClaims?.release(
        this.threadId,
        this.hostId,
      )
    } catch (error) {
      this.warnClaim(error)
    }
  }

  /**
   * A claim write failed. Without a claim, a sweep cannot find this work
   * after a crash, so clients get a warning. The work goes on.
   */
  private warnClaim(error: unknown): void {
    this.feed.publish(
      'session',
      customEvent('harness.plugin.warning', {
        plugin: 'harness:work-claims',
        message: error instanceof Error ? error.message : String(error),
      }),
    )
  }

  /**
   * No input being stored, no queued or running turn, no waiting steer, and
   * no running agent.
   */
  private isIdle(): boolean {
    // A follow-up that waits for its run keeps the thread busy.
    const hasFollowUps = [...this.agentChains.values()].some(
      (chain) => chain.followUps.length > 0,
    )
    if (hasFollowUps) return false
    return (
      this.inputsInFlight === 0 &&
      this.activeTurn === undefined &&
      this.queue.length === 0 &&
      this.steerQueue.length === 0 &&
      ![...this.operations.values()].some(
        (operation) => operation.kind === 'agent' && !operation.isSettled(),
      )
    )
  }

  /**
   * Run `work`, a public entry that stores a work input and queues its work.
   * The thread is busy until `work` ends, so it is not idle while the input
   * is stored.
   */
  private async admitting<T>(work: () => Promise<T>) {
    this.inputsInFlight += 1
    try {
      return await work()
    } finally {
      this.inputsInFlight -= 1
      this.checkIdle()
    }
  }

  /**
   * When the thread is idle, give its claim back and tell the idle
   * listeners. A thread that waits for a human (an approval, a sign-in) is
   * idle.
   */
  private checkIdle(): void {
    if (!this.isIdle()) return
    this.stopClaimTimer()
    // ponytail: one release write per idle thread, also when this host
    // holds no claim (a sweep may hold one for it). Track the claim if the
    // writes matter.
    void this.releaseClaim()
    for (const listener of [...this.idleListeners]) listener()
  }

  /**
   * @internal Call `listener` each time the thread goes idle, and once soon
   * when it is idle now. Returns a function that stops the calls. The host
   * uses it to close a session that `resumePending` opened.
   */
  onIdle(listener: () => void): () => void {
    this.idleListeners.add(listener)
    queueMicrotask(() => this.checkIdle())
    return () => {
      this.idleListeners.delete(listener)
    }
  }

  /**
   * Stop every running operation, wait for them, then dispose session plugins.
   * Safe to call twice.
   *
   * With `recoverable`, the running turns and agent runs stop as on a host
   * crash: the log gets none of their later writes, they do not settle, and
   * the run store gets no aborted state. They give their leases back, so the
   * next host that opens the thread runs them again at once. Use it when a
   * durable host shuts down, for example for a deploy.
   *
   * @example
   * ```ts
   * await session.close({ recoverable: true })
   * ```
   */
  close(options?: { recoverable?: boolean }): Promise<void> {
    this.closing ??= (async () => {
      // A thread with work keeps its claim, so a sweep finds that work after
      // the claim expires. An idle thread gives it back.
      const wasIdle = this.isIdle()
      this.stopClaimTimer()
      if (wasIdle) await this.releaseClaim()
      // Before the stop, so no write of the stopped work lands.
      if (options?.recoverable) this.writer?.close()
      for (const turn of this.queue.splice(0)) {
        await this.refreshTurnInterrupts(turn.operation)
        turn.operation.fail('cancelled', new Error('Session closed.'))
      }
      const running = [...this.operations.values()].filter(
        (operation) => !operation.isSettled(),
      )
      for (const operation of running) {
        operation.abortController.abort(
          options?.recoverable ? SHUTDOWN_REASON : RUN_CANCEL_REASON,
        )
      }
      for (const question of this.questions.values()) {
        question.reject(new Error('Session closed.'))
      }
      this.questions.clear()
      await Promise.allSettled(
        running.map((operation) => Promise.resolve(operation)),
      )
      // The events from before the close land first, so the next host has
      // the text of a cut answer.
      if (options?.recoverable) await this.writer?.flush().catch(() => {})
      try {
        await this.sessionPlugins?.dispose()
      } finally {
        this.feed.close()
        this.onClose()
      }
    })()
    return this.closing
  }

  // ===========================
  // Chat turns
  // ===========================

  private createTurnOperation(id?: string): OperationImpl<ChatTurnResult> {
    const operation = new OperationImpl<ChatTurnResult>(
      'chat',
      this.feed,
      (target) => this.cancel(target.id),
      undefined,
      id,
    )
    this.operations.set(operation.id, operation as OperationImpl<unknown>)
    return operation
  }

  private enqueueTurn(turn: QueuedTurn): void {
    // Recovery queues turns without `accept`, so they claim here too.
    this.markBusy()
    this.queue.push(turn)
    this.drain()
  }

  /**
   * Where a turn that runs next goes: after a resolve that answers the turn
   * that just ended, and after the resets that wait, in their order.
   */
  private frontOfQueue(): number {
    const at = this.queue.findIndex((turn) => !turn.answers && !turn.reset)
    return at < 0 ? this.queue.length : at
  }

  private drain(): void {
    if (this.activeTurn || this.closing || this.holdTurns) return
    const next = this.queue.shift()
    if (!next) return this.checkIdle()
    this.activeTurn = next.operation
    this.activeResume = next.resume !== undefined
    this.turnPrincipal = next.principal
    void this.runTurn(next).finally(() => {
      this.activeResume = false
      this.activeTurn = undefined
      this.turnPrincipal = undefined
      for (const end of this.turnEnds) end()
      this.turnEnds.clear()
      this.drain()
    })
  }

  /**
   * Ask each plugin for the tools it found since the last turn. A plugin
   * that fails (for example an MCP server that is down) is skipped, and
   * clients get a `harness.plugin.warning` event.
   */
  private async discoverTools(
    discoverers: MountedPlugins['discoverers'],
    taken: Set<string>,
    operation: OperationImpl<ChatTurnResult>,
  ): Promise<Array<AnyTool>> {
    const found: Array<AnyTool> = []
    for (const { discover, owner } of discoverers) {
      try {
        for (const tool of await discover()) {
          if (taken.has(tool.name)) continue
          taken.add(tool.name)
          found.push(tool)
        }
      } catch (error) {
        this.warn(operation, owner, error)
      }
    }
    return found
  }

  /**
   * Let each plugin change the tool list of this turn, in plugin order. A
   * plugin that fails leaves the list as it was, with a warning event.
   */
  private async prepareTools(
    preparers: MountedPlugins['preparers'],
    turn: { tools: Array<AnyTool>; model: string },
    operation: OperationImpl<ChatTurnResult>,
  ): Promise<Array<AnyTool>> {
    let prepared = turn.tools
    for (const { prepare, owner } of preparers) {
      try {
        prepared = [...(await prepare({ tools: prepared, model: turn.model }))]
      } catch (error) {
        this.warn(operation, owner, error)
      }
    }
    return prepared
  }

  private warn(
    operation: OperationImpl<unknown> | OperationImpl<ChatTurnResult>,
    plugin: string,
    error: unknown,
  ) {
    operation.publish(
      customEvent('harness.plugin.warning', {
        plugin,
        message: error instanceof Error ? error.message : String(error),
      }),
    )
  }

  /**
   * Middleware that binds the durable tools of each model call: a
   * middleware can return new tools from `onConfig`, and the engine runs the
   * tools of that list.
   */
  private durableTools(): AnyChatMiddleware | undefined {
    const { bindTool } = this
    if (!bindTool) return undefined
    return {
      name: 'harness:durable-tools',
      onConfig: (ctx, config) => {
        if (ctx.phase !== 'init' && ctx.phase !== 'beforeModel') return
        const tools = config.tools.map((tool) => bindDurable(tool, bindTool))
        const isSame = tools.every(
          (tool, index) => tool === config.tools[index],
        )
        return isSame ? undefined : { tools }
      },
    }
  }

  /**
   * Middleware that gives each tool call of a turn `detach` in its context,
   * so `background()` can move the call to the background. A tool that
   * calls `detach` supports it.
   */
  private detachTools(): AnyChatMiddleware {
    // Each model call gets the tools of the last one. Wrap each tool once.
    const wrapped = new WeakSet<AnyTool>()
    const wrap = (tool: AnyTool): AnyTool => {
      const { execute } = tool
      if (!execute || wrapped.has(tool)) return tool
      const next: AnyTool = {
        ...tool,
        execute: (args: unknown, context?: ToolExecutionContext) => {
          const id = context?.toolCallId
          if (!context || id === undefined) return execute(args, context)
          context.detach = (work) =>
            new Promise((moved) => {
              this.detachable.set(id, () => {
                moved(
                  `The job moved to the background. Its id is ${id}. You get a note when it ends.`,
                )
                // Like other background jobs: a note that wakes the session.
                work
                  .then(
                    (result) =>
                      `Background job ${id} ended.\n${typeof result === 'string' ? result : JSON.stringify(result)}`,
                    (error: unknown) =>
                      `Background job ${id} failed: ${error instanceof Error ? error.message : String(error)}`,
                  )
                  .then((text) => this.pluginApi().note(text, { wake: true }))
                  .catch(() => undefined)
              })
            })
          return Promise.resolve(execute(args, context)).finally(() =>
            this.detachable.delete(id),
          )
        },
      }
      wrapped.add(next)
      return next
    }
    return {
      name: 'harness:detach-tools',
      onConfig: (ctx, config) => {
        if (ctx.phase !== 'init' && ctx.phase !== 'beforeModel') return
        return { tools: config.tools.map(wrap) }
      },
    }
  }

  /**
   * On a durable host, each turn's chat run gets `LogRecordsCapability`. A
   * middleware, for example a durable compaction, appends host records with
   * it. They land in the log at once and fold, with the checks of
   * `session.append`. The engine's new messages go in the same append, so a
   * record that counts the tool results of the last phase lands after them.
   * Agent runs do not get it: a child writes to its own thread.
   */
  private logRecords(): AnyChatMiddleware | undefined {
    const { engine } = this
    if (!engine) return undefined
    return {
      name: 'harness:log-records',
      provides: [LogRecordsCapability],
      setup: (ctx) =>
        provideLogRecords(ctx, {
          append: async (records) => {
            checkHostRecords(records)
            // The engine's live list, read at the time of the append.
            await engine.appendRecords(ctx.messages, records)
          },
        }),
    }
  }

  /**
   * Middleware that counts the usage of each model call of `operation` for
   * `principal`. The count does not hold back the stream: chat() waits for it
   * after the run.
   */
  private usageCounter(
    operation: OperationImpl<unknown> | OperationImpl<ChatTurnResult>,
    principal: Principal | undefined,
  ): AnyChatMiddleware {
    return {
      name: 'harness:usage',
      onUsage: (ctx, usage) => {
        ctx.defer(
          this.countUsage(operation, {
            model: `${ctx.provider}/${ctx.model}`,
            ...storedPrincipal(principal),
            usage: callUsage(usage),
          }),
        )
      },
    }
  }

  /**
   * Add one model call to the totals, and send a `harness.usage` event. A
   * durable host writes a `harness.usage` record, and the log fold adds it.
   */
  private async countUsage(
    operation: OperationImpl<unknown> | OperationImpl<ChatTurnResult>,
    call: UsageCall,
  ): Promise<void> {
    try {
      if (this.writer) {
        await this.writer.append([{ type: 'harness.usage', ...call }])
      } else {
        addUsage(this.usageTotals, call)
        const { metadata } = this.persistence.stores
        if (metadata) {
          const totals = structuredClone(this.usageTotals)
          this.usageSaved = this.usageSaved.then(() =>
            metadata.set(USAGE, this.threadId, totals),
          )
          await this.usageSaved
        }
      }
    } catch (error) {
      // A refused log append stops the session already. A failed metadata
      // save keeps the totals in memory.
      this.usageSaved = Promise.resolve()
      this.warn(operation, 'harness:usage', error)
      return
    }
    operation.publish(
      customEvent(HARNESS_EVENTS.usage, {
        model: call.model,
        ...(call.principal ? { sender: call.principal.id } : {}),
        usage: call.usage,
        total: this.usage().total,
      }),
    )
  }

  private isAbortRequested(inputId: string) {
    return (
      this.writer?.state.inputs.get(inputId)?.abortRequested === true ||
      this.abortedSteers.has(inputId)
    )
  }

  /**
   * Take the waiting steers that join now: the prefix up to the first one
   * that has an abort request, or that `turn.canJoin` refuses. Without
   * `canJoin`, only a steer of the running turn's sender joins, so nobody's
   * message runs with another person's credentials. A steer that a join
   * took already stays in, with no new check. Returns how many.
   */
  private async claimJoins() {
    const canJoin = this.harness.turn?.canJoin
    const turnPrincipal = this.sender()
    let count = 0
    const checked = [...this.steerQueue]
    for (const steer of checked) {
      if (!this.joining.has(steer.inputId)) {
        if (this.isAbortRequested(steer.inputId)) break
        const candidate = {
          inputId: steer.inputId,
          message: steer.message,
          ...(steer.principal ? { principal: steer.principal } : {}),
          ...(turnPrincipal ? { turnPrincipal } : {}),
        }
        const isAllowed = canJoin
          ? await canJoin(candidate)
          : isSameSender(steer.principal, turnPrincipal)
        if (!isAllowed) break
      }
      count += 1
    }
    // A cancel or a move can land while canJoin runs. A moved steer shifts
    // the list, so only steers still at their checked place join. No await
    // from here to the claim.
    const steers = this.steerQueue.slice(0, count)
    const late = steers.findIndex(
      (steer, index) =>
        steer !== checked[index] ||
        (!this.joining.has(steer.inputId) &&
          this.isAbortRequested(steer.inputId)),
    )
    const taken = late >= 0 ? steers.slice(0, late) : steers
    for (const steer of taken) this.joining.add(steer.inputId)
    return taken.length
  }

  /**
   * Middleware that runs before each model call. Queued steers join the
   * running turn in admission order, as far as `claimJoins` lets them.
   * `turn.onJoin` adds its messages after theirs. On a durable host, one
   * append commits the engine's messages, the steer messages, the join
   * records, and the `onJoin` records, so a crash never splits a join. The
   * model gets the folded log when a host record changed the context. The
   * `onJoin` ephemeral messages go to `ephemeral`, for this model call.
   */
  private steering(ephemeral: Array<ModelMessage>): AnyChatMiddleware {
    return {
      name: 'harness:steering',
      onConfig: async (ctx, config) => {
        if (ctx.phase !== 'beforeModel') return undefined
        const count = await this.claimJoins()
        const steers = this.steerQueue.slice(0, count)
        try {
          const running =
            this.activeTurn?.id === ctx.runId ? this.activeTurn : undefined
          const onJoin = this.harness.turn?.onJoin
          let added: TurnAdditions | undefined
          if (steers.length > 0 && onJoin && running) {
            added = await onJoin({
              session: this,
              operationId: ctx.runId,
              inputs: steers.map((steer) => ({
                inputId: steer.inputId,
                message: steer.message,
                ...(steer.principal ? { principal: steer.principal } : {}),
              })),
              signal: running.abortController.signal,
            })
            // A cancelled turn gets nothing from the hook. Its steers run as
            // their own turns.
            if (running.abortController.signal.aborted) return undefined
          }
          const records = added?.records ?? []
          checkHostRecords(records)
          if (records.length > 0 && !this.engine) {
            throw new Error(
              'Records from a turn hook need a durable host (a host with stores.log).',
            )
          }
          const hostInput = this.operationInputs.get(ctx.runId)
          const joins = hostInput
            ? steers.map((steer) => ({
                type: 'harness.input.joined',
                inputId: steer.inputId,
                into: hostInput,
              }))
            : []
          const list = [
            ...config.messages,
            ...steers.map(
              (steer): ModelMessage => ({
                id: createMessageId(),
                role: 'user',
                content: steer.message,
              }),
            ),
            ...(added?.messages ?? []).map(
              (message): ModelMessage =>
                message.id ? message : { ...message, id: createMessageId() },
            ),
          ]
          const synced = await this.engine?.beforeModel(list, [
            ...joins,
            ...records,
          ])
          // A host without a log saves the transcript before each model call,
          // as a durable host commits it. A tool result is then kept when the
          // call fails, so a retried call, or a second resolve of a failed
          // continuation, does not run the tool again.
          if (!this.engine) {
            await this.messages.saveThread(this.threadId, list)
          }
          // Only now, so a hook or an append that fails leaves them waiting.
          this.steerQueue.splice(0, count)
          for (const steer of steers) this.join(ctx.runId, steer)
          ephemeral.push(...(added?.ephemeral ?? []))
          if (list.length === config.messages.length && !synced) {
            return undefined
          }
          const next = synced ?? list
          // An earlier middleware can change what this model call gets
          // (`providerMessages`). Keep that change, and add the new messages
          // after it. When the fold rewrote older messages (a compaction),
          // the fold wins.
          const provider = config.providerMessages
          const isAppend =
            provider !== undefined &&
            (!synced ||
              commonPrefix(config.messages, synced) === config.messages.length)
          return isAppend
            ? {
                messages: next,
                providerMessages: [
                  ...provider,
                  ...next.slice(config.messages.length),
                ],
              }
            : { messages: next }
        } finally {
          for (const steer of steers) this.joining.delete(steer.inputId)
        }
      },
    }
  }

  /**
   * Middleware of one agent run. Before each model call of the run's own
   * chat, the steers that wait join as user messages, in order. The chain's
   * thread keeps them before a durable host records the join, so a crash
   * does not lose one, and each message id is its input id, so a run again
   * does not add a steer twice. Nested children share the binding: their
   * thread is not the chain's, so they skip it.
   */
  private agentSteering(
    chain: AgentChain,
    runInput: string,
    operation: AgentRunImpl,
  ): AnyChatMiddleware {
    return {
      name: 'harness:agent-steering',
      onConfig: async (ctx, config) => {
        if (ctx.phase !== 'beforeModel' || ctx.threadId !== chain.thread) {
          return undefined
        }
        const steers = [...chain.steers]
        if (steers.length === 0) return undefined
        const known = new Set(config.messages.map((item) => item.id))
        const messages = [
          ...config.messages,
          ...steers
            .filter((steer) => !known.has(steer.inputId))
            .map(asUserMessage),
        ]
        await this.chatPersistence?.stores.messages.saveThread(
          chain.thread,
          messages,
        )
        await this.writer?.append(
          steers.map((steer) => ({
            type: 'harness.input.joined',
            inputId: steer.inputId,
            into: runInput,
          })),
        )
        // Only now, so a save that fails leaves them waiting.
        chain.steers.splice(0, steers.length)
        for (const steer of steers) this.join(operation.id, steer)
        // ponytail: user and agent middleware run after this one, so no
        // earlier `providerMessages` exists to keep (unlike `steering()`).
        return { messages }
      },
    }
  }

  /**
   * `steer` joined the running turn `operationId`: it settles with that
   * turn, and a prompt that joined gets the turn's result.
   */
  private join(
    operationId: string,
    steer: { inputId: string; operation?: OperationImpl<ChatTurnResult> },
  ) {
    const joined = this.turnJoins.get(operationId) ?? []
    joined.push(steer.inputId)
    this.turnJoins.set(operationId, joined)
    const running = this.activeTurn
    if (steer.operation && running) {
      const follower = steer.operation
      this.operations.delete(follower.id)
      running.then(
        (result) => follower.finish('completed', result),
        (error: unknown) => follower.fail('failed', error),
      )
    }
    if (!this.writer) void this.inbox.markApplied(steer.inputId, operationId)
    this.feed.publish(
      operationId,
      customEvent(HARNESS_EVENTS.inputApplied, {
        inputId: steer.inputId,
        operationId,
      }),
    )
  }

  /** The inputs that joined the turn of `hostInput` (or operation). */
  private joinedInputs(operationId: string, hostInput: string | undefined) {
    if (this.writer && hostInput !== undefined) {
      return [...this.writer.state.inputs.values()]
        .filter(
          (input) => input.status === 'joined' && input.into === hostInput,
        )
        .map((input) => input.inputId)
    }
    return this.turnJoins.get(operationId) ?? []
  }

  /**
   * A tree budget for a child started from code. The child counts as the
   * first call, and its own children count against the same limits.
   */
  private codeBudget(): SubagentBudget {
    const root = SubagentBudget.root(this.limits())
    root.reserve(0)
    return root.child()
  }

  /**
   * What every agent run of `operation` gets: the middleware of session
   * plugins, then of run plugins, then the session's media middleware. It
   * keeps the media the agents make, publishes a `harness.media` event for
   * each file, and pushes its record to `captured`. The agents read the
   * session's provider keys as `ctx.keys`. Their model calls count in the
   * usage of `principal`. With `agents` (the subagents of a turn), the
   * `subagent` tool can start one of them in the background.
   */
  private binding(
    operation: OperationImpl<unknown> | OperationImpl<ChatTurnResult>,
    captured: Array<MediaRecord>,
    principal: Principal | undefined,
    runPlugins?: MountedPlugins,
    agents?: ReadonlyArray<AnyAgent>,
  ) {
    const options = this.harness.media
    // The child runs as a background agent of this session, and its end
    // starts a new turn. Core does not pass `start` to nested children.
    const start: SubagentBinding['start'] =
      agents &&
      (async (call, startOptions) => {
        const agent = agents.find((entry) => entry.name === call.agent)
        if (!agent) throw new Error(`Unknown agent "${call.agent}".`)
        const subagentRunId = createSubagentId()
        this.runAgent(agent, call.input, startOptions, undefined, {
          subagentRunId,
          ...(call.prompt !== undefined && { prompt: call.prompt }),
          ...(call.parentToolCallId !== undefined && {
            parentToolCallId: call.parentToolCallId,
          }),
        })
        return { subagentRunId }
      })
    return {
      generationMiddleware: [
        ...(this.sessionPlugins?.generationMiddleware ?? []),
        ...(runPlugins?.generationMiddleware ?? []),
        ...mediaCapture({
          persistence: this.media,
          threadId: this.threadId,
          options,
          publish: (record) => {
            captured.push(record)
            operation.publish(customEvent(HARNESS_EVENTS.media, { ...record }))
          },
          onError: (error) =>
            this.warn(
              operation,
              'harness:media',
              `The media was not kept. ${String(error)}`,
            ),
        }),
      ],
      chatMiddleware: [
        ...(this.sessionPlugins?.agentMiddleware ?? []),
        ...(runPlugins?.agentMiddleware ?? []),
        // A routed root agent gets the thread too, so a reset cuts it as well.
        resetCut,
        this.usageCounter(operation, principal),
        // Last, because a later middleware that returns `messages` resets
        // what the model gets. A child's adapter is not known here, so only
        // `media.accepts` narrows what it reads.
        mediaMiddleware({
          store: this.mediaStore,
          accepted: options?.accepts,
          transcribe: options?.transcribe,
        }),
      ],
      keys: this.keys,
      // A child uses its own threadId as the key, so only the retention goes down.
      promptCache: this.promptCache.retention,
      ...(start && { start }),
    } satisfies SubagentBinding
  }

  /**
   * The user message of a turn. It keeps the records of its media files in
   * `metadata.harness.media`, so a UI can show their names and sizes later.
   * An id this thread does not know is skipped.
   */
  private async userMessage(content: UserInput) {
    const ids =
      typeof content === 'string'
        ? []
        : content.map(mediaIdOf).filter((id) => id !== undefined)
    const records = await Promise.all(ids.map((id) => this.getMedia(id)))
    const media = records.filter((record) => record !== null)
    const message: ModelMessage = {
      id: createMessageId(),
      role: 'user',
      content,
      ...(media.length > 0 ? { metadata: { harness: { media } } } : {}),
    }
    return message
  }

  /** Add the media a turn made to the last assistant message of the thread. */
  private async saveTurnMedia(media: Array<MediaRecord>) {
    const store = this.messages
    const history = await store.loadThread(this.threadId)
    const index = history.findLastIndex(
      (message) => message.role === 'assistant',
    )
    const last = history[index]
    if (!last) return
    const harness = {
      ...last.metadata?.harness,
      media: [...mediaOfMessage(last), ...media],
    }
    const updated: ModelMessage = {
      ...last,
      metadata: { ...last.metadata, harness },
    }
    await store.saveThread(this.threadId, history.with(index, updated))
  }

  /**
   * Abort `operation` when its input passes `timeoutAt` (a durable host with
   * `durability.timeoutMs`). Returns the function that stops the timer.
   */
  private startTimeout(
    inputId: string | undefined,
    operation: OperationImpl<ChatTurnResult>,
  ) {
    const timeoutAt =
      inputId === undefined
        ? undefined
        : this.writer?.state.inputs.get(inputId)?.timeoutAt
    if (timeoutAt === undefined) return () => {}
    const timer = setTimeout(
      () => operation.abortController.abort(TIMEOUT_REASON),
      Math.max(0, timeoutAt - Date.now()),
    )
    if (typeof timer === 'object' && 'unref' in timer) timer.unref()
    return () => clearTimeout(timer)
  }

  /**
   * Hold the lease of a turn or agent attempt in `stores.leases` while it
   * runs. Returns the function that releases it. Without a lease store (or
   * without a log), it returns nothing: the run lease decides.
   */
  private async holdLease(
    inputId: string | undefined,
    operation: OperationImpl<unknown> | OperationImpl<ChatTurnResult>,
  ): Promise<(() => Promise<void>) | undefined> {
    const leases = this.persistence.stores.leases
    const attempt =
      inputId === undefined
        ? undefined
        : this.writer?.state.inputs.get(inputId)?.attempt
    if (!leases || inputId === undefined || attempt === undefined) {
      return undefined
    }
    const ttlMs = this.lease?.ttlMs ?? LEASE.ttlMs
    const renewMs = this.lease?.renewMs ?? LEASE.renewMs
    const lease = () => ({
      threadId: this.threadId,
      inputId,
      operationId: operation.id,
      attempt,
      ownerId: this.hostId,
      expiresAt: Date.now() + ttlMs,
    })
    await leases.acquire(lease())
    const timer = setInterval(
      () => void leases.renew(lease()).catch(() => {}),
      renewMs,
    )
    // A lease timer must not keep a CLI or a test process alive.
    if (typeof timer === 'object' && 'unref' in timer) timer.unref()
    return async () => {
      clearInterval(timer)
      await leases.release(lease()).catch(() => {})
    }
  }

  /**
   * End work that `close({ recoverable: true })` stopped, with no settlement.
   * Its leases end now, so the next host that opens the thread runs it again
   * at once. Call it after the run lease renewal stopped.
   */
  private async giveBack(
    operation: OperationImpl<unknown> | OperationImpl<ChatTurnResult>,
    releaseLease: (() => Promise<void>) | undefined,
  ) {
    // An expired run lease, for a host without a lease store.
    await this.persistence.stores.runs
      ?.update(operation.id, { leaseExpiresAt: 0 })
      .catch(() => {})
    await releaseLease?.()
    operation.fail('cancelled', new Error('Session closed.'))
  }

  /**
   * Apply a `reset()`: add its marker to the transcript. A thread that waits
   * for interrupts gets no marker, and the reset fails.
   */
  private async runReset(
    turn: QueuedTurn,
    reset: { note?: string },
  ): Promise<void> {
    const { operation } = turn
    const inputId = turn.inputId ?? operation.id
    operation.setStatus('running')
    this.publishStarted(operation)
    let error: { message: string; code?: string } | undefined
    try {
      await this.applied(inputId, operation.id)
      await this.refreshInterrupted(undefined, false, false)
      if (this.interrupted) {
        error = {
          message: 'The thread waits for interrupts. Resolve them first.',
          code: 'pending_interrupts',
        }
      } else {
        const marker = resetMarker(inputId, reset.note)
        const history = await this.messages.loadThread(this.threadId)
        // Once: recovery can apply the same reset again.
        if (!history.some((message) => message.id === marker.id)) {
          await this.addToTurn({ messages: [marker] })
        }
        operation.publish(
          customEvent(HARNESS_EVENTS.reset, { inputId, ...reset }),
        )
      }
    } catch (failure) {
      error = { message: errorText(this.logFailure ?? failure) }
    }
    if (!this.logFailure) {
      await this.settle({
        inputId,
        operationId: operation.id,
        outcome: error ? 'failed' : 'completed',
        ...(error ? { error } : {}),
      }).catch(() => {})
    }
    if (error) operation.fail('failed', new Error(error.message))
    else operation.finish('completed', { text: '' })
    this.publishFinished(operation)
    // A steer that came while the reset ran runs as its own turn.
    this.requeueWaitingSteers()
  }

  /** The model can answer the context: it ends with a user or a tool message. */
  private async canContinue() {
    const history = await this.messages.loadThread(this.threadId)
    const last = resetContext(history).at(-1)
    return last?.role === 'user' || last?.role === 'tool'
  }

  private async runTurn(turn: QueuedTurn): Promise<void> {
    // The next turn drops the messages that a revert hides.
    try {
      await this.commitRevert()
    } catch (error) {
      turn.operation.fail('failed', error)
      this.publishFinished(turn.operation)
      this.requeueWaitingSteers()
      return
    }
    if (turn.reset) return this.runReset(turn, turn.reset)
    const { operation } = turn
    operation.setStatus('running')
    // A new turn may ask for a sign-in the user cancelled before.
    if (!turn.answers) this.declinedSignIns.clear()
    try {
      await this.refreshInterrupted(undefined, false, false)
    } catch (error) {
      this.warn(operation, 'harness:interrupts', error)
      operation.fail('failed', error)
      this.publishFinished(operation)
      this.requeueWaitingSteers()
      return
    }
    if (turn.inputId) {
      try {
        if (turn.isContinue && !(await this.canContinue())) {
          this.refuse(
            operation,
            this.reject(turn.inputId, 'nothing_to_continue'),
          )
          this.requeueWaitingSteers()
          return
        }
        await this.applied(turn.inputId, operation.id)
      } catch (error) {
        // The log refused the write, so the session stops.
        await this.refreshTurnInterrupts(operation)
        operation.fail('failed', this.logFailure ?? error)
        this.publishFinished(operation)
        this.requeueWaitingSteers()
        return
      }
    }
    let releaseLease: (() => Promise<void>) | undefined
    try {
      releaseLease = await this.holdLease(turn.inputId, operation)
    } catch (error) {
      await this.refreshTurnInterrupts(operation)
      operation.fail('failed', error)
      this.publishFinished(operation)
      this.requeueWaitingSteers()
      return
    }
    const stopTimer = this.startTimeout(turn.inputId, operation)
    this.publishStarted(operation)

    let runPlugins: MountedPlugins | undefined
    let stopRunLease = () => {}
    /** The next chat() call runs the root agents that `routing` picked. */
    let isRootPart = false
    /** chat() refused the resume of this turn, so it ran nothing. */
    let isResumeRefused = false
    /** The tool calls of this turn that got a result, and an error result. */
    const resultIds = new Set<string>()
    const errorResultIds = new Set<string>()
    let text = ''
    let interrupts: Array<Interrupt> | undefined
    let failure: string | undefined
    const captured: Array<MediaRecord> = []
    // What plugins and the router see of this turn. A turn that recovery
    // runs again gets the message its input sent.
    const sentMessage = turn.message ?? turn.sentMessage
    const sender = this.sender()
    const info: TurnInfo = {
      operationId: operation.id,
      ...(turn.inputId ? { inputId: turn.inputId } : {}),
      ...(sentMessage !== undefined ? { message: sentMessage } : {}),
      ...(turn.context !== undefined ? { context: turn.context } : {}),
      ...(sender ? { principal: sender } : {}),
      ...(turn.overrides ? { overrides: turn.overrides } : {}),
    }
    try {
      await this.flushNotes()
      // The stored settings of the thread, as they are when the turn starts.
      const stored = this.threadSettings
      const removed = new Set(stored.plugins?.remove ?? [])
      // 'turn' and the old 'run'. A removed turn plugin is not set up.
      const perRun = this.plugins.filter(
        (plugin) =>
          (plugin.lifetime ?? 'session') !== 'session' &&
          !removed.has(plugin.name),
      )
      if (perRun.length > 0) {
        runPlugins = await mountPlugins(perRun, {
          turn: info,
          threadId: this.threadId,
          registry: this.agentRegistry.fork(),
          harnessTools: [
            ...(this.harness.tools ?? []),
            ...(this.sessionPlugins?.tools ?? []),
          ],
          harnessProvides: (this.harness.middleware ?? []).flatMap(
            (middleware) => middleware.provides ?? [],
          ),
          ...(this.sessionPlugins
            ? {
                inherited: this.sessionPlugins.values,
                takenCommands: this.sessionPlugins.commands,
                takenConfig: this.sessionPlugins.config,
                inheritedExtensions: this.sessionPlugins.extensions,
              }
            : {}),
          services: this.services,
        })
      }
      // A removed session plugin stays mounted, but gives this turn nothing.
      const session =
        this.sessionPlugins && removed.size > 0
          ? withoutPlugins(this.sessionPlugins, removed)
          : this.sessionPlugins
      const bridges = [
        session?.capabilityBridge,
        runPlugins?.capabilityBridge,
        this.logRecords(),
      ].filter((bridge): bridge is AnyChatMiddleware => bridge !== undefined)
      // Agents the model can call: the harness's own, then the plugins'.
      const subagentList = [
        ...(this.harness.subagents?.agents ?? []),
        ...(session?.subagents ?? []),
        ...(runPlugins?.subagents ?? []),
      ]
      const subagents =
        subagentList.length > 0
          ? { ...this.harness.subagents, agents: subagentList }
          : undefined
      // Agents `routing` can pick: the harness's own, then the plugins'. An
      // agent object counts once.
      const rootAgents = [
        ...new Set([
          ...(this.harness.agents ?? []),
          ...(session?.agents ?? []),
          ...(runPlugins?.agents ?? []),
        ]),
      ]
      // The settings of this turn. Every chat() call below uses them: the
      // tool loop, retries, `beforeFinish` cycles, handoffs, and late joins.
      const { overrides } = turn
      const picked = [
        ...(session?.adapters ?? []),
        ...(runPlugins?.adapters ?? []),
      ]
        .map((pick) => pick(info))
        .filter((adapter) => adapter !== undefined)
        .at(-1)
      // A keyed adapter is built for this turn with the user's key. A
      // missing key publishes `auth_required` and fails the turn. It is
      // built before `prepareTools`, which gets its model id. The turn
      // override, the stored model, a plugin pick, the harness model.
      const named =
        stored.model === undefined
          ? undefined
          : this.harness.models?.[stored.model]
      const model =
        overrides?.adapter ?? named ?? picked ?? this.harness.adapter
      if (!model) throw new Error(NO_MODEL)
      const adapter: AnyTextAdapter = await this.keys.adapter(model)
      const resolvePrompt = (prompt: string | (() => string)) =>
        typeof prompt === 'function' ? prompt() : prompt
      const turnTools = overrides?.tools ?? []
      const turnToolNames = new Set(turnTools.map((tool) => tool.name))
      const staticTools = [
        ...(this.harness.tools ?? []),
        ...(session?.tools ?? []),
        ...(runPlugins?.tools ?? []),
        ...turnTools,
      ]
      const discovered = await this.discoverTools(
        [...(session?.discoverers ?? []), ...(runPlugins?.discoverers ?? [])],
        new Set(staticTools.map((tool) => tool.name)),
        operation,
      )
      // Before the chat() options below: prompts may describe these tools.
      // The `tools` setting picks from them first, so a preparer (code mode)
      // sees only the kept ones.
      const prepared = await this.prepareTools(
        [...(session?.preparers ?? []), ...(runPlugins?.preparers ?? [])],
        {
          tools: settingTools(
            [...staticTools, ...discovered],
            stored.tools,
            turnToolNames,
          ),
          model: adapter.model,
        },
        operation,
      )
      // A durable host gives each durableTool call its steps in the log. The
      // tools are bound here, so a middleware wrapper wraps the bound tool,
      // and again at each model call, for tools that a middleware returns.
      const { bindTool } = this
      const tools = bindTool
        ? prepared.map((tool) => bindDurable(tool, bindTool))
        : prepared
      // The override tools as the turn has them: prepared and bound.
      const keptTools = tools.filter((tool) => turnToolNames.has(tool.name))
      const keepTools =
        keptTools.length > 0 ? keepTurnTools(keptTools) : undefined
      const reasoning =
        overrides?.reasoning ?? stored.reasoning ?? this.harness.reasoning
      const context = turnContext(this.harness.context, turn.context)
      // The turn value wins over the session value, field by field.
      const turnCache = cacheObject(overrides?.promptCache)
      const promptCache = {
        retention: turnCache?.retention ?? this.promptCache.retention,
        key: turnCache?.key ?? this.promptCache.key,
      }
      let message =
        turn.message !== undefined
          ? await this.userMessage(turn.message)
          : undefined
      let resume = turn.resume
      let parentRunId = turn.answers?.runId ?? turn.parentRunId
      const { chatPersistence, checkpoint } = this
      if (!chatPersistence || !checkpoint) {
        throw new Error('The session is not open yet.')
      }
      const durableTools = this.durableTools()
      const signal = operation.abortController.signal
      const { routing } = this.harness
      // A new turn asks the router once. A resolve does not: it continues the
      // turn it answers, the main model or the saved plan of the root agents.
      let pick: SubagentRouterPick | undefined
      if (routing && rootAgents.length > 0 && turn.resume === undefined) {
        const history = await this.messages.loadThread(this.threadId)
        pick = await routing.router({
          messages: resetContext([...history, ...(message ? [message] : [])]),
          agents: rootAgents,
          abortSignal: signal,
          session: this,
          ...(sentMessage !== undefined ? { input: sentMessage } : {}),
          operationId: operation.id,
          ...(turn.inputId ? { inputId: turn.inputId } : {}),
          ...(sender ? { principal: sender } : {}),
          ...(turn.context !== undefined ? { context: turn.context } : {}),
          adapter,
        })
      }
      const isRootTurn =
        turn.answers?.routed?.root === true || (pick ?? 'main') !== 'main'
      const rootBag =
        routing && isRootTurn
          ? {
              ...routing,
              agents: rootAgents,
              router: () => {
                // A resolve has no pick. chat() continues its saved plan.
                if (pick === undefined) {
                  throw new Error('The routed turn has no saved plan.')
                }
                return pick
              },
              // The harness runs the handoff, so the main model keeps its
              // subagents.
              strategy: 'exclusive' as const,
            }
          : undefined
      isRootPart = rootBag !== undefined
      /** The subagents of the next chat() call. */
      let bag = rootBag ?? subagents
      let routed = isRoutedBag(bag)
      if (routed) {
        // The same record withPersistence opens, so its open resumes this one.
        const { runs } = this.persistence.stores
        await runs?.createOrResume({
          runId: operation.id,
          threadId: this.threadId,
          startedAt: Date.now(),
        })
        stopRunLease = await holdRunLease(
          runs,
          operation.id,
          this.hostId,
          this.lease,
        )
      }
      /** The messages a resolve of a routed turn continues from. */
      let routedFrom = turn.answers?.routed?.messages
      /** Retries since the last finished tool phase. The log keeps them. */
      let retries =
        this.writer?.state.inputs.get(turn.inputId ?? '')?.retries ?? 0
      /** The partial answer and the note that a `'continue'` adds. */
      let continued: Array<ModelMessage> = []
      /** How many times `turn.beforeFinish` continued this turn. */
      let cycle = 0
      /** The ephemeral messages of a turn hook, for the next model call. */
      const ephemeral: Array<ModelMessage> = []
      // One chat() run, and one more each time steers wait after a final
      // answer: a late join gets its answer in this turn. A run that failed
      // runs again when `turn.onModelError` answers 'retry'. A final answer
      // runs again when `turn.beforeFinish` adds to the transcript.
      for (;;) {
        // The root agents of a routed turn run no turn hooks. The main model
        // runs them, also in the main part of a handoff.
        const turnHooks = isRootPart ? undefined : this.harness.turn
        let textBefore = text
        let runError: { message: string; code?: string } | undefined
        let heldError: StreamChunk | undefined
        try {
          // The router and the routed agents get the full history. The
          // stores merge by message id, so no message is saved twice.
          const history =
            routed && !routedFrom
              ? await this.messages.loadThread(this.threadId)
              : []
          const turnMessages = [
            ...history,
            ...(message ? [message] : []),
            ...continued,
          ]
          // withPersistence saves them at the start of the call, so a later
          // call finds them in the thread.
          continued = []
          // The store keeps each agent in its own thread, and chat() finds a
          // stopped agent in the cards that a client sends back. So the
          // harness keeps the cards of a routed run, as a client does.
          const cards = routed
            ? new StreamProcessor({
                initialMessages:
                  routedFrom ?? modelMessagesToUIMessages(turnMessages),
              })
            : undefined
          const stream = chat({
            adapter,
            messages: routedFrom ?? turnMessages,
            systemPrompts: [
              ...(this.harness.systemPrompts ?? []),
              ...[...(session?.prompts ?? []), ...(runPlugins?.prompts ?? [])]
                .map(resolvePrompt)
                .filter((prompt) => prompt !== ''),
              // The thread's own instructions go last.
              ...(stored.instructions ? [stored.instructions] : []),
            ],
            tools,
            middleware: [
              ...bridges,
              detachOnShutdown,
              withPersistence(chatPersistence),
              checkpoint,
              // Before the harness middleware, so a compaction sees only the
              // context after a reset.
              resetCut,
              this.usageCounter(operation, sender),
              ...(this.harness.middleware ?? []),
              ...(session?.middleware ?? []),
              ...(runPlugins?.middleware ?? []),
              ...(keepTools ? [keepTools] : []),
              ...(durableTools ? [durableTools] : []),
              this.detachTools(),
              ...(rootBag ? [] : [this.steering(ephemeral)]),
              // Again: a middleware that returns `messages` (as steering
              // does) resets what the model gets to the whole transcript.
              resetCut,
              // After steering and the reset, so neither drops them.
              ephemeralCall(ephemeral),
              // Last, because a later middleware that returns `messages` (as
              // steering does) resets what the model gets.
              mediaMiddleware({
                store: this.mediaStore,
                accepted: acceptedKinds(
                  adapter.inputModalities,
                  this.harness.media?.accepts,
                ),
                transcribe: this.harness.media?.transcribe,
              }),
            ],
            ...(bag
              ? {
                  subagents: {
                    ...bag,
                    limits: bag.limits ?? this.limits(),
                    binding: this.binding(
                      operation,
                      captured,
                      sender,
                      runPlugins,
                      bag.agents,
                    ),
                  },
                }
              : {}),
            // chat() stops after 5 model calls by default. An agent that
            // reads, searches, and calls tools needs more before it can answer.
            agentLoopStrategy:
              this.harness.agentLoopStrategy ?? maxIterations(50),
            ...(this.harness.toolExecution !== undefined
              ? { toolExecution: this.harness.toolExecution }
              : {}),
            ...(this.harness.modelOptions !== undefined
              ? { modelOptions: this.harness.modelOptions }
              : {}),
            ...(this.harness.interrupts
              ? { interrupts: this.harness.interrupts }
              : {}),
            ...(context !== undefined ? { context } : {}),
            ...(reasoning !== undefined ? { reasoning } : {}),
            promptCache,
            threadId: this.threadId,
            runId: operation.id,
            ...(parentRunId ? { parentRunId } : {}),
            ...(resume ? { resume } : {}),
            abortController: operation.abortController,
            stream: true,
          } as never) as AsyncIterable<StreamChunk>

          routedFrom = undefined
          for await (const chunk of stream) {
            cards?.processChunk(chunk)
            // chat() refused the resume before it ran anything.
            if (
              chunk.type === EventType.RUN_ERROR &&
              (chunk.metadata?.tanstack?.interruptErrors?.length ?? 0) > 0
            ) {
              isResumeRefused = true
            }
            if (
              chunk.type === EventType.RUN_FINISHED &&
              chunk.outcome?.type === 'interrupt'
            ) {
              interrupts = chunk.outcome.interrupts
              const messages = cards?.getMessages()
              // Pending before a client sees RUN_FINISHED, so a resolve sent
              // at once is accepted.
              await this.keepInterrupted(operation, {
                runId: operation.id,
                interrupts,
                ...(messages ? { routed: { messages, root: isRootPart } } : {}),
                ...storedPrincipal(this.sender()),
                ...(turn.context !== undefined
                  ? { context: turn.context }
                  : {}),
              })
            }
            if (
              chunk.type === EventType.RUN_ERROR &&
              turnHooks?.onModelError &&
              runError === undefined
            ) {
              // Held until the hook answers: a retried call shows no error.
              runError = {
                message: chunk.message,
                ...(chunk.code !== undefined ? { code: chunk.code } : {}),
              }
              heldError = chunk
              continue
            }
            operation.publish(chunk)
            if (
              chunk.type === EventType.TEXT_MESSAGE_CONTENT &&
              !('subagentRunId' in chunk && chunk.subagentRunId)
            ) {
              text += chunk.delta
            }
            if (chunk.type === EventType.RUN_ERROR) failure = chunk.message
            // A finished tool phase resets the retries, and its text stays in
            // the result. Streamed text does not reset them, so a call that
            // fails after some text still counts.
            if (chunk.type === EventType.TOOL_CALL_RESULT) {
              // A cancelled call gets a result too, but its tool did not run.
              const tanstack = chunk.metadata?.tanstack
              if (tanstack?.toolResultOutcome !== 'cancelled') {
                if (tanstack?.state === 'output-error') {
                  errorResultIds.add(chunk.toolCallId)
                } else {
                  resultIds.add(chunk.toolCallId)
                }
              }
              if (retries > 0) this.stageRetries(turn, operation, 0)
              retries = 0
              textBefore = text
            }
          }
        } catch (error) {
          // The outer catch handles a cancelled turn, a log failure, and a
          // harness without the hook, as before.
          if (signal.aborted || this.logFailure || !turnHooks?.onModelError) {
            throw error
          }
          const { code } = toRunErrorPayload(error)
          runError = {
            message: errorText(error),
            ...(code !== undefined ? { code } : {}),
          }
        }
        if (runError && turnHooks?.onModelError) {
          const partial = text !== textBefore
          const answer =
            signal.aborted || this.logFailure
              ? undefined
              : await turnHooks.onModelError({
                  session: this,
                  operationId: operation.id,
                  ...(turn.inputId ? { inputId: turn.inputId } : {}),
                  error: runError,
                  retries,
                  partial,
                  signal,
                })
          if (
            (answer === 'retry' || answer === 'continue') &&
            !signal.aborted
          ) {
            retries += 1
            this.stageRetries(turn, operation, retries)
            const isContinued = answer === 'continue' && partial
            if (isContinued) {
              // The partial answer stays in the turn result and in the
              // transcript. The model continues it.
              continued = [
                { role: 'assistant', content: text.slice(textBefore.length) },
                { role: 'user', content: CONTINUE_NOTE },
              ]
            } else {
              // The turn result has only the text of the calls that counted.
              text = textBefore
            }
            operation.publish(
              customEvent(HARNESS_EVENTS.turnRetry, {
                operationId: operation.id,
                retries,
                error: runError,
                continued: isContinued,
              }),
            )
            // The resume stays: withPersistence commits it only when a call
            // succeeds, so its interrupts are still open.
            message = undefined
            // withPersistence failed the run. It runs again, for the retry.
            await this.persistence.stores.runs?.update(operation.id, {
              status: 'running',
              finishedAt: undefined,
              error: undefined,
            })
            continue
          }
          // A cancel or a log failure ends the turn without the held error.
          if (signal.aborted) break
          // Here, and not in the outer catch, for an error the run threw.
          operation.publish(
            heldError ?? {
              type: EventType.RUN_ERROR,
              message: runError.message,
              timestamp: Date.now(),
            },
          )
          failure = runError.message
          break
        }
        const isFinished =
          failure !== undefined ||
          (interrupts?.length ?? 0) > 0 ||
          signal.aborted
        if (isFinished) break
        if (isRootPart) {
          if (routing?.strategy !== 'handoff') break
          // The agents answered. The main model answers next, with the
          // transcript that has their answer.
          isRootPart = false
          bag = subagents
          routed = isRoutedBag(bag)
        } else {
          // A steer does not join a turn that `routing` sent to root agents.
          // It waits and runs as its own turn. Claimed, so a cancel after
          // this check cannot leave a run with no new input.
          const hasLateJoin = !rootBag && (await this.claimJoins()) > 0
          if (!hasLateJoin) {
            const goesOn = await this.continueBeforeFinish(
              operation,
              turn.inputId,
              cycle,
              ephemeral,
            )
            if (!goesOn) break
            cycle += 1
          }
        }
        message = undefined
        resume = undefined
        parentRunId = undefined
        // withPersistence finished the run. It runs again, for the join or
        // the hook's additions.
        await this.persistence.stores.runs?.update(operation.id, {
          status: 'running',
          finishedAt: undefined,
          error: undefined,
        })
      }
      // Routed agents stream their text with a subagentRunId, so the main
      // model wrote none. The turn text is the answer the transcript keeps.
      if (routed && text === '') {
        text = lastAssistantText(await this.messages.loadThread(this.threadId))
      }
    } catch (error) {
      failure = errorText(error)
      if (!operation.abortController.signal.aborted) {
        operation.publish({
          type: EventType.RUN_ERROR,
          message: failure,
          timestamp: Date.now(),
        })
      }
    } finally {
      stopRunLease()
      stopTimer()
      await runPlugins?.dispose().catch(() => {})
    }
    const timedOut = operation.abortController.signal.reason === TIMEOUT_REASON
    // A recoverable close: the turn stops as on a crash, and the next host
    // runs it again.
    if (operation.abortController.signal.reason === SHUTDOWN_REASON) {
      await this.giveBack(operation, releaseLease)
      this.requeueWaitingSteers()
      return
    }

    // The stream has ended, so withPersistence has saved the turn. A failed or
    // cancelled turn may not have saved its answer, and its last assistant
    // message can be an older turn's, so its media stays in the store only.
    const isSaved =
      failure === undefined && !operation.abortController.signal.aborted
    if (isSaved && captured.length > 0) {
      await this.saveTurnMedia(captured).catch((error: unknown) =>
        this.warn(
          operation,
          'harness:media',
          `The media was not added to the transcript. ${String(error)}`,
        ),
      )
    }

    // The index entry gets the time of the turn and the token totals of the
    // session, before the turn ends. chat() waits for the usage counts before
    // its stream ends, so the totals have every call of this turn. The totals
    // replace the stored ones. The cost stays: a usage plugin writes it. A
    // deleted entry stays deleted. A failed write does not fail the turn.
    const { total } = this.usage()
    await this.index
      .update(
        this.threadId,
        (entry) =>
          entry && {
            ...entry,
            updatedAt: Date.now(),
            ...(total.calls > 0
              ? {
                  usage: {
                    ...entry.usage,
                    turns: total.calls,
                    promptTokens: total.promptTokens,
                    completionTokens: total.completionTokens,
                    totalTokens: total.totalTokens,
                    cachedTokens: total.cachedTokens,
                    cacheWriteTokens: total.cacheWriteTokens,
                  },
                }
              : {}),
          },
      )
      .catch((error: unknown) =>
        this.warn(
          operation,
          'harness:sessions',
          `The session index was not updated. ${String(error)}`,
        ),
      )

    const { inputId } = turn
    // The turn and every input that joined it settle in one append. The
    // settlement lands before the operation ends, so a caller that sees the
    // result can also read it with `settled()`.
    const settled = [
      ...(inputId === undefined ? [] : [inputId]),
      ...this.joinedInputs(operation.id, inputId),
    ]
    this.turnJoins.delete(operation.id)
    const settleTurn = async (
      settlement: Omit<InputSettlement, 'inputId' | 'operationId'>,
    ) => {
      if (settled.length > 0 && !this.logFailure) {
        await this.settle(
          ...settled.map((id) => ({
            inputId: id,
            operationId: operation.id,
            ...settlement,
          })),
        ).catch(() => {})
      }
      // Release after the settlement, so a crash in between leaves a settled
      // input. Release before the operation ends, so the caller can act at
      // once.
      if (releaseLease) await releaseLease()
    }
    // A refused resume ran nothing, so its interrupts wait again. Before the
    // settlement, so a client that sees it can resolve once more.
    if (isResumeRefused && turn.answers) {
      await this.keepInterrupted(operation, turn.answers)
    }
    const observedInterrupts =
      interrupts && interrupts.length > 0
        ? {
            ...(this.interrupted?.runId === operation.id
              ? this.interrupted
              : {}),
            runId: operation.id,
            interrupts,
            ...storedPrincipal(sender),
            ...(turn.context !== undefined ? { context: turn.context } : {}),
          }
        : undefined
    // A resume whose tools ran is used up, even when the turn fails after
    // them. Offering its interrupts again would run the tools a second time.
    // A resume that failed before its tools ran stays open for a retry.
    const resumed = turn.resume ?? []
    const resumedFrom = (turn.answers ?? this.interrupted)?.interrupts ?? []
    const didResumedToolsRun =
      !isResumeRefused &&
      resumed.length > 0 &&
      resumed.every((item) => {
        const interrupt = resumedFrom.find(
          (candidate) => candidate.id === item.interruptId,
        )
        const toolCallId = interrupt ? toolCallOf(interrupt) : undefined
        if (toolCallId === undefined) return false
        // A stopped run gives the calls it did not run an error result.
        return (
          resultIds.has(toolCallId) ||
          (!operation.abortController.signal.aborted &&
            errorResultIds.has(toolCallId))
        )
      })
    // On a success, withPersistence committed them already, and this skips
    // them. A failure or a stop can also come after the tools ran.
    if (didResumedToolsRun) {
      await this.consumeResume(resumed).catch((error: unknown) =>
        this.warn(operation, 'harness:interrupts', error),
      )
    }
    await this.refreshTurnInterrupts(
      operation,
      observedInterrupts,
      didResumedToolsRun ||
        (turn.resume !== undefined &&
          failure === undefined &&
          !isResumeRefused &&
          !operation.abortController.signal.aborted),
    )
    if (this.logFailure) {
      if (releaseLease) await releaseLease()
      operation.fail('failed', this.logFailure)
    } else if (timedOut) {
      const message = 'The input passed its time limit.'
      await settleTurn({
        outcome: 'failed',
        error: { message, code: 'timeout' },
      })
      operation.fail('failed', new Error(message))
    } else if (operation.abortController.signal.aborted) {
      await settleTurn({ outcome: 'aborted' })
      operation.fail('cancelled', new Error('Cancelled.'))
    } else if (failure !== undefined) {
      await settleTurn({ outcome: 'failed', error: { message: failure } })
      operation.fail('failed', new Error(failure))
    } else if (interrupts && interrupts.length > 0) {
      // `this.interrupted` was kept at RUN_FINISHED.
      await settleTurn({ outcome: 'interrupted' })
      operation.finish('interrupted', { text, interrupts })
    } else {
      await settleTurn({ outcome: 'completed' })
      operation.finish('completed', { text })
    }
    this.publishFinished(operation)
    this.requeueWaitingSteers()
  }

  /**
   * Steers a turn never reached run next, before other queued turns (after
   * a resolve of that turn). A steer with an abort request settles `aborted`
   * instead.
   */
  private requeueWaitingSteers(): void {
    this.joining.clear()
    const waiting = this.steerQueue.splice(0)
    const aborted = waiting.filter((steer) =>
      this.isAbortRequested(steer.inputId),
    )
    const rest = waiting.filter((steer) => !aborted.includes(steer))
    for (const steer of aborted) {
      this.abortedSteers.delete(steer.inputId)
      const { operation } = steer
      // Not awaited: the session goes on to the next turn at once. The
      // settlement lands before the operation ends.
      void this.settle({
        inputId: steer.inputId,
        outcome: 'aborted',
        ...(operation ? { operationId: operation.id } : {}),
      })
        .catch(() => {})
        .then(() => {
          if (!operation) return
          operation.fail('cancelled', new Error('Cancelled before it started.'))
          this.publishFinished(operation)
        })
    }
    if (this.closing) {
      // close() ended the queued turns already. These end the same way.
      for (const steer of rest) {
        steer.operation?.fail('cancelled', new Error('Session closed.'))
      }
      return
    }
    this.queue.splice(
      this.frontOfQueue(),
      0,
      ...rest.map((steer) => this.steerTurn(steer)),
    )
  }

  /** A waiting steer as its own turn, with its own operation. */
  private steerTurn(steer: WaitingSteer) {
    const operation = steer.operation ?? this.createTurnOperation()
    this.bindTurn(steer.inputId, operation)
    const turn: QueuedTurn = { ...steer, operation }
    return turn
  }

  /**
   * Take a waiting input out of the steers or the queue, so it does not run
   * from there. `undefined` when it does not wait: it started, a join holds
   * it, it has an abort request, or the id is not known.
   */
  private takeWaiting(inputId: string) {
    const steer = this.steerQueue.find(
      (item) =>
        item.inputId === inputId &&
        !this.joining.has(inputId) &&
        !this.isAbortRequested(inputId),
    )
    // This shifts the later steers. `claimJoins` sees that and skips them.
    if (steer) {
      this.steerQueue.splice(this.steerQueue.indexOf(steer), 1)
      return steer
    }
    const turn = this.queue.find((item) => item.inputId === inputId)
    const message = turn?.message
    if (!turn || message === undefined) return undefined
    this.queue.splice(this.queue.indexOf(turn), 1)
    const taken: WaitingSteer = {
      inputId,
      message,
      operation: turn.operation,
      overrides: turn.overrides,
      principal: turn.principal,
      context: turn.context,
    }
    return taken
  }

  /**
   * Mark a `cancelInput` or `setDelivery` input applied. On a durable host,
   * `change` lands in the same append, so a crash never keeps one without
   * the other.
   */
  private async applyControl(inputId: string, change: HarnessRecord) {
    if (!this.writer) {
      await this.inbox.markApplied(inputId, 'session')
      return
    }
    await this.writer.append([
      change,
      {
        type: 'harness.input.applied',
        inputId,
        operationId: 'session',
        attempt: 1,
      },
    ])
  }

  /**
   * Keep the retry count of a turn in the log, so a recovered attempt starts
   * from it. It lands with the next append of the turn: the commit of the
   * model call that runs next.
   */
  private stageRetries(
    turn: QueuedTurn,
    operation: OperationImpl<ChatTurnResult>,
    retries: number,
  ) {
    const { inputId } = turn
    if (inputId === undefined) return
    this.writer?.stage([
      {
        type: 'harness.turn.retry',
        inputId,
        operationId: operation.id,
        retries,
      },
    ])
  }

  /**
   * Add hook messages and host records to the transcript, in one append.
   * Returns true when the transcript changed.
   */
  private async addToTurn(added: TurnAdditions): Promise<boolean> {
    const records = added.records ?? []
    const messages = (added.messages ?? []).map(
      (message): ModelMessage =>
        message.id ? message : { ...message, id: createMessageId() },
    )
    checkHostRecords(records)
    if (!this.writer) {
      if (records.length > 0) {
        throw new Error(
          'Records from a turn hook need a durable host (a host with stores.log).',
        )
      }
      if (messages.length === 0) return false
      const history = await this.messages.loadThread(this.threadId)
      await this.messages.saveThread(this.threadId, [...history, ...messages])
      return true
    }
    const before = this.writer.state.messages
    await this.writer.commit({ messages: [...before, ...messages], records })
    const after = this.writer.state.messages
    return (
      after.length !== before.length ||
      commonPrefix(before, after) !== before.length
    )
  }

  /**
   * Ask `turn.beforeFinish` whether the turn goes on. True when it added to
   * the transcript or to `ephemeral`, so the turn runs the model again.
   */
  private async continueBeforeFinish(
    operation: OperationImpl<ChatTurnResult>,
    inputId: string | undefined,
    cycle: number,
    ephemeral: Array<ModelMessage>,
  ): Promise<boolean> {
    const hooks = this.harness.turn
    if (!hooks?.beforeFinish) return false
    const added = await hooks.beforeFinish({
      session: this,
      operationId: operation.id,
      ...(inputId ? { inputId } : {}),
      cycle,
      messages: await this.messages.loadThread(this.threadId),
      signal: operation.abortController.signal,
    })
    // A cancelled turn adds nothing.
    if (operation.abortController.signal.aborted) return false
    const isEmpty =
      !added ||
      ((added.messages?.length ?? 0) === 0 &&
        (added.records?.length ?? 0) === 0 &&
        (added.ephemeral?.length ?? 0) === 0)
    if (isEmpty) return false
    const max = hooks.maxFinishCycles ?? 32
    if (cycle >= max) {
      throw new Error(
        `beforeFinish continued the turn ${max} times. Return nothing from the hook when the work is done.`,
      )
    }
    const isChanged = await this.addToTurn(added)
    ephemeral.push(...(added.ephemeral ?? []))
    return isChanged || ephemeral.length > 0
  }

  // ===========================
  // Agents
  // ===========================

  /** The limits for children of this session, with the harness defaults. */
  private limits() {
    return this.harness.subagents?.limits ?? DEFAULT_SUBAGENT_LIMITS
  }

  private runAgent(
    target: string | AnyAgent,
    input: unknown,
    options: AgentStartOptions,
    parent?: AgentChain,
    child?: AgentChild,
  ): AgentRunImpl {
    const name = typeof target === 'string' ? target : target.name
    if (options.resume && !this.writer) {
      throw new Error(
        `Agent ${name}: resume: true needs a durable host (a host with stores.log).`,
      )
    }
    const operation = this.agentOperation(name)
    this.markBusy()
    // The agent runs for the sender of the turn that starts it, also after
    // that turn ends. A child of agent code runs for its parent run's sender.
    const principal = parent ? parent.current.principal : this.sender()
    const sender = principal ? { principal } : {}
    const fromParent = parent
      ? {
          parentRunId: parent.current.operation.id,
          budget: parent.budget.child(),
        }
      : {}
    const chain = this.createChain(
      {
        runInputId: createInputId(),
        target,
        input,
        options,
        ...sender,
        ...fromParent,
      },
      { operation, ...sender },
    )
    parent?.children.add(chain)
    void this.executeAgent(operation, chain, {
      inputId: chain.runInputId,
      ...(child ? { child } : {}),
    })
    return operation
  }

  /**
   * `ctx.agents` in the runs of `chain`: start a child in the background.
   * The child counts against the chain's tree budget, and over it `start`
   * throws. The child records the run that started it, and runs for that
   * run's sender.
   */
  private agentStarter(chain: AgentChain): AgentStarter {
    return {
      start: (target, input, options) => {
        const active = [...chain.children].filter(
          (child) => !child.current.operation.isSettled(),
        ).length
        const refusal = chain.budget.reserve(active)
        if (refusal !== undefined) throw new Error(refusal)
        return this.runAgent(target, input, options ?? {}, chain)
      },
    }
  }

  /** A new agent run operation. `id`: a stored one, after a restart. */
  private agentOperation(agent: string, id?: string): AgentRunImpl {
    const operation = new OperationImpl<unknown>(
      'agent',
      this.feed,
      (running) => this.cancel(running.id),
      agent,
      id,
    )
    const run = Object.assign(operation, {
      send: (
        message: UserInput,
        options?: { mode?: 'steer' | 'followUp'; inputId?: string },
      ) => this.sendToAgent(operation.id, message, options),
    })
    this.operations.set(run.id, run)
    return run
  }

  /** A new chain, with `first` as its first run. */
  private createChain(
    fields: Pick<
      AgentChain,
      | 'runInputId'
      | 'target'
      | 'input'
      | 'options'
      | 'principal'
      | 'parentRunId'
    > & { budget?: SubagentBudget },
    first: AgentRunEntry,
  ): AgentChain {
    const agent =
      typeof fields.target === 'string' ? fields.target : fields.target.name
    const chain = {
      ...fields,
      agent,
      thread: `${this.threadId}:${agent}:${fields.runInputId}`,
      budget: fields.budget ?? this.codeBudget(),
      current: first,
      runs: [first],
      steers: [],
      followUps: [],
      children: new Set<AgentChain>(),
    }
    this.agentChains.set(chain.runInputId, chain)
    this.chainOf.set(first.operation.id, chain)
    return chain
  }

  /**
   * Run again an agent run with `resume: true` whose host stopped: a first
   * run, or a follow-up run of the chain of `first`. The new run applies the
   * same input, so its attempt counts up, and it continues the chain's saved
   * transcript.
   */
  private resumeAgent(input: InputState, first: AgentInputState) {
    const operation = this.agentOperation(first.input.agent)
    this.markBusy()
    const sender = input.principal ? { principal: input.principal } : {}
    const chain = this.createChain(chainFields(first), { operation, ...sender })
    this.feed.publish(
      operation.id,
      customEvent(HARNESS_EVENTS.operationResumed, {
        operationId: operation.id,
        ...(input.operationId ? { resumedFrom: input.operationId } : {}),
      }),
    )
    void this.executeAgent(operation, chain, {
      inputId: input.inputId,
      resumed: true,
      ...(input.input.op === 'agentMessage'
        ? {
            message: {
              inputId: input.inputId,
              message: input.input.message,
              ...sender,
            },
          }
        : {}),
    })
  }

  /**
   * What a resumable agent run adds on a durable host: checkpoints of its
   * `ctx.chat` tool phases, and `ctx.step` values in the session log, under
   * the key of the input the run applies.
   */
  private resumable(inputId: string) {
    const { chatPersistence, writer } = this
    if (!chatPersistence || !writer) return undefined
    const { runs } = this.persistence.stores
    const key = agentKey(inputId)
    const checkpoint = checkpointMiddleware({
      ...(runs ? { runs } : {}),
      messages: chatPersistence.stores.messages,
      hostId: this.hostId,
      ...(this.lease ? { lease: this.lease } : {}),
      // As in a turn, each finished tool result goes to the session log at
      // once, under a key of this run. A run again puts it back.
      onToolResult: ({ toolCallId, message }) =>
        writer.append([
          {
            type: 'harness.tool.result',
            toolCallId: `${key}:${toolCallId}`,
            message,
          },
        ]),
    })
    const durableTools = this.durableTools()
    return {
      middleware: [checkpoint, ...(durableTools ? [durableTools] : [])],
      step: this.durableBinding(writer, key).step,
    }
  }

  /**
   * The saved transcript of a resumable agent run whose host stopped. The
   * chat runs that host left running end `failed`, and the last tool batch
   * gets the same repair as in a turn: the results that finished, and an
   * error for a cut call that must not run twice.
   */
  private async continueAgentThread(agentThread: string, inputId: string) {
    const store = this.chatPersistence?.stores.messages
    if (!store) return []
    const runs = this.persistence.stores.runs
    const records = (await runs?.listByThread?.(agentThread)) ?? []
    for (const run of records.filter((item) => item.status === 'running')) {
      await runs?.update(run.runId, {
        status: 'failed',
        finishedAt: Date.now(),
        error: { message: AGENT_STOPPED },
      })
    }
    const newest = [...records].sort((a, b) => b.startedAt - a.startedAt)[0]
    const prefix = `${agentKey(inputId)}:`
    const finished = new Map(
      [...(this.writer?.state.toolResults ?? [])].flatMap(([id, message]) =>
        id.startsWith(prefix)
          ? [[id.slice(prefix.length), message] as const]
          : [],
      ),
    )
    await repairTranscript({
      messages: store,
      threadId: agentThread,
      pending: newest?.checkpoint?.pendingTools ?? [],
      finished,
      interrupted: this.harness.durability?.interruptedToolResult,
      truncated: this.harness.durability?.truncatedToolResult,
    })
    return store.loadThread(agentThread)
  }

  /** Run a group of agents. Every child settles before the group returns. */
  private async agentGroup<T>(
    options: { onFailure?: 'cancel-siblings' | 'collect' },
    body: (group: AgentGroup) => Promise<T>,
  ): Promise<T> {
    const started: Array<OperationImpl<unknown>> = []
    const cancelOthers = (failed: OperationImpl<unknown>) => {
      if (options.onFailure === 'collect') return
      for (const operation of started) {
        if (operation !== failed && !operation.isSettled())
          void operation.cancel()
      }
    }
    const group: AgentGroup = {
      run: (target: string | AnyAgent, input?: unknown) => {
        const operation = this.runAgent(target, input, { wake: false })
        started.push(operation)
        return Promise.resolve(operation).catch((error: unknown) => {
          cancelOthers(operation)
          throw error
        })
      },
      runSettled: (target: string | AnyAgent, input?: unknown) => {
        const operation = this.runAgent(target, input, { wake: false })
        started.push(operation)
        return Promise.resolve(operation).then(
          (value) => ({ ok: true as const, value }),
          (error: unknown) => ({ ok: false as const, error }),
        )
      },
    } as AgentGroup
    try {
      return await body(group)
    } finally {
      await Promise.allSettled(
        started.map((operation) => Promise.resolve(operation)),
      )
    }
  }

  /**
   * One run of `chain`. Then the steers it never took run as follow-ups,
   * before the follow-ups that wait, and the next follow-up starts.
   */
  private async executeAgent(
    operation: AgentRunImpl,
    chain: AgentChain,
    start: AgentRunStart,
  ): Promise<void> {
    try {
      await this.runAgentOnce(operation, chain, start)
    } finally {
      // After a log failure, another host owns the thread.
      if (!this.logFailure) {
        chain.followUps.unshift(
          ...chain.steers
            .splice(0)
            .map((steer) => this.followUpOf(chain, steer)),
        )
        this.nextFollowUp(chain)
      }
      this.checkIdle()
    }
  }

  /**
   * Give `sent` to `chain`. A steer waits for the running run's next model
   * call. A follow-up, or a steer to a run that ended, runs after the
   * current run. Returns the receipt fields.
   */
  private deliver(
    chain: AgentChain,
    sent: AgentMessage,
    mode: 'steer' | 'followUp',
  ) {
    const { operation: running, principal } = chain.current
    // A steer joins only a run of its own sender, so no message runs with
    // another person's credentials. Any other message runs as a follow-up,
    // for its sender.
    const isOwnSteer =
      mode === 'steer' &&
      !running.isSettled() &&
      isSameSender(sent.principal, principal)
    if (isOwnSteer) {
      chain.steers.push(sent)
      return { status: 'accepted' as const, operationId: running.id }
    }
    const isWaiting = !running.isSettled() || chain.followUps.length > 0
    const next = this.followUpOf(chain, sent)
    chain.followUps.push(next)
    this.nextFollowUp(chain)
    return {
      status: isWaiting ? ('queued' as const) : ('accepted' as const),
      operationId: next.operation.id,
    }
  }

  /** `sent` as a follow-up of `chain`, with the operation of its run. */
  private followUpOf(chain: AgentChain, sent: AgentMessage) {
    const operation = this.agentOperation(chain.agent)
    this.chainOf.set(operation.id, chain)
    return { ...sent, operation }
  }

  /** Start the next follow-up of `chain` once its current run ended. */
  private nextFollowUp(chain: AgentChain): void {
    if (!chain.current.operation.isSettled()) return
    const next = chain.followUps.shift()
    if (!next) return
    chain.current = {
      operation: next.operation,
      ...(next.principal ? { principal: next.principal } : {}),
    }
    chain.runs.push(chain.current)
    this.markBusy()
    void this.executeAgent(next.operation, chain, {
      inputId: next.inputId,
      message: next,
    })
  }

  /**
   * One run of `chain`. A new first run stores its `agent` input first.
   * Every run keeps its messages in the chain's thread, so a run again
   * after a host stop continues them.
   */
  private async runAgentOnce(
    operation: AgentRunImpl,
    chain: AgentChain,
    start: AgentRunStart,
  ): Promise<void> {
    const { agent: name, target, input, options } = chain
    const { inputId } = start
    // This run is the chain's current run.
    const { principal } = chain.current
    if (!start.resumed && !start.message) {
      await this.accept(
        inputId,
        {
          op: 'agent',
          agent: name,
          input,
          ...(options.wake ? { detached: true } : {}),
          ...(options.resume ? { resume: true } : {}),
          ...(options.attach === 'none' ? { attach: 'none' as const } : {}),
          ...(chain.parentRunId ? { parentRunId: chain.parentRunId } : {}),
        },
        principal,
      )
    }
    const agent: AnyAgent | undefined =
      typeof target === 'string' ? this.agentRegistry.get(target) : target
    if (!agent) {
      this.reject(inputId, 'unknown_agent')
      operation.fail('failed', new Error(`Unknown agent: ${name}`))
      return
    }
    let checkedInput: unknown = input
    if (agent.inputSchema !== undefined) {
      const checked = await validateWithStandardSchema(
        agent.inputSchema,
        input ?? {},
      )
      if (!checked.success) {
        const reason = `Input validation failed for agent ${name}: ${checked.issues
          .map((issue) => issue.message)
          .join(', ')}`
        this.reject(inputId, 'invalid_input')
        operation.fail('failed', new Error(reason))
        return
      }
      checkedInput = checked.data
    }

    operation.setStatus('running')
    await this.applied(inputId, operation.id)
    const runs = this.persistence.stores.runs
    await runs?.createOrResume({
      runId: operation.id,
      threadId: this.threadId,
      startedAt: Date.now(),
      kind: 'agent',
      agent: name,
      ...storedPrincipal(principal),
    })
    operation.publish({
      type: EventType.RUN_STARTED,
      runId: operation.id,
      threadId: this.threadId,
      timestamp: Date.now(),
    })
    this.publishStarted(operation)
    const child = start.child ?? { subagentRunId: createSubagentId() }
    await this.indexAgent(operation, child, principal)

    let text = ''
    let result: unknown
    let failure: string | undefined
    const { subagentRunId, prompt } = child
    let stopRunLease = () => {}
    let releaseLease: (() => Promise<void>) | undefined
    try {
      // A host that stops lets these leases expire. Then recovery fails the run.
      stopRunLease = await holdRunLease(
        runs,
        operation.id,
        this.hostId,
        this.lease,
      )
      releaseLease = await this.holdLease(inputId, operation)
      // A first run starts from the session thread. A run again after a
      // host stop continues the chain's thread. A follow-up run continues
      // the chain's thread, with its message added. The message id is its
      // input id, so a run again after a host stop does not add it twice.
      const { message } = start
      const saved = start.resumed
        ? await this.continueAgentThread(chain.thread, inputId)
        : message
          ? ((await this.chatPersistence?.stores.messages.loadThread(
              chain.thread,
            )) ?? [])
          : ((await this.messages.loadThread(this.threadId)) ?? [])
      const messages =
        message && !saved.some((item) => item.id === message.inputId)
          ? [...saved, asUserMessage(message)]
          : saved
      const binding = this.binding(operation, [], principal)
      const durable = options.resume ? this.resumable(inputId) : undefined
      const stream = runAgentStream(
        agent,
        {
          input: checkedInput,
          // A prompt is one more user message at the end, as in core.
          messages:
            prompt === undefined
              ? messages
              : [
                  ...messages,
                  { role: 'user', content: prompt } satisfies ModelMessage,
                ],
          threadId: chain.thread,
          runId: `${operation.id}:${subagentRunId}`,
          parentRunId: operation.id,
          subagentRunId,
          abortSignal: operation.abortController.signal,
        },
        undefined,
        undefined,
        // ponytail: the media of a background agent is kept and published,
        // but not written to history: its messages live in its chain's
        // thread. Write it to the session thread if a UI must show it after
        // a restart.
        {
          ...binding,
          chatMiddleware: [
            // Every run keeps its transcript in the chain's thread.
            ...(this.chatPersistence
              ? [withPersistence(this.chatPersistence)]
              : []),
            ...(durable?.middleware ?? []),
            this.agentSteering(chain, inputId, operation),
            ...binding.chatMiddleware,
          ],
          ...(durable ? { step: durable.step } : {}),
          keys: this.keysOf(principal),
          budget: chain.budget,
          agents: this.agentStarter(chain),
        },
      )
      for await (const chunk of stream) {
        operation.publish(chunk)
        if (
          chunk.type === EventType.TEXT_MESSAGE_CONTENT &&
          'subagentRunId' in chunk &&
          chunk.subagentRunId === subagentRunId
        ) {
          text += chunk.delta
        }
        if (
          chunk.type === EventType.SUBAGENT_FINISHED &&
          chunk.subagentRunId === subagentRunId
        ) {
          result = chunk.result
        }
        if (
          chunk.type === EventType.SUBAGENT_ERROR &&
          chunk.subagentRunId === subagentRunId
        ) {
          failure = chunk.message
        }
      }
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error)
    }

    const value = result !== undefined ? result : text
    // The run record and the log keep how the agent ended, so recovery
    // leaves it alone. After a log failure, another host owns the thread and
    // decides how the run ended, so this host writes neither.
    const end = async (
      run: Pick<RunRecord, 'status'> &
        Partial<Pick<RunRecord, 'error' | 'result'>>,
      settlement: Pick<InputSettlement, 'outcome' | 'error'>,
    ) => {
      if (this.logFailure) return
      await runs?.update(operation.id, { ...run, finishedAt: Date.now() })
      // A refused append stops the session. The operation still ends. The
      // steers that joined the run settle with it, in one append.
      const joined = this.joinedInputs(operation.id, inputId)
      await this.settle(
        ...[inputId, ...joined].map((id) => ({
          inputId: id,
          operationId: operation.id,
          ...settlement,
        })),
      ).catch(() => {})
    }
    // A recoverable close: the run stops as on a crash, and the next host
    // runs it again.
    if (operation.abortController.signal.reason === SHUTDOWN_REASON) {
      stopRunLease()
      await this.giveBack(operation, releaseLease)
      return
    }
    if (operation.abortController.signal.aborted) {
      operation.publish({
        type: EventType.RUN_FINISHED,
        runId: operation.id,
        threadId: this.threadId,
        outcome: { type: 'cancelled' },
        timestamp: Date.now(),
      } as StreamChunk)
      await end({ status: 'aborted' }, { outcome: 'aborted' })
      operation.fail('cancelled', new Error('Cancelled.'))
    } else if (failure !== undefined) {
      operation.publish({
        type: EventType.RUN_ERROR,
        message: failure,
        timestamp: Date.now(),
      })
      const error = { message: failure }
      await end({ status: 'failed', error }, { outcome: 'failed', error })
      await this.noteAgentEnd(name, 'failed', failure, options, principal)
      operation.fail('failed', new Error(failure))
    } else {
      operation.publish({
        type: EventType.RUN_FINISHED,
        runId: operation.id,
        threadId: this.threadId,
        result: value,
        timestamp: Date.now(),
      } as StreamChunk)
      await end(
        { status: 'completed', result: compactForModel(value) },
        { outcome: 'completed' },
      )
      await this.noteAgentEnd(name, 'finished', value, options, principal)
      operation.finish('completed', value)
    }
    stopRunLease()
    await releaseLease?.()
    this.publishFinished(operation)
  }

  /**
   * The index entry of an agent run: thread `subagent:<subagentRunId>`, with
   * this thread as its parent and the harness of this thread. `upsert`
   * replaces the whole entry, so the fields of other writers stay. A failed
   * write does not fail the run.
   */
  private async indexAgent(
    operation: OperationImpl<unknown>,
    child: AgentChild,
    principal: Principal | undefined,
  ) {
    const threadId = `subagent:${child.subagentRunId}`
    const now = Date.now()
    await this.index
      .update(threadId, (entry) => ({
        ...entry,
        threadId,
        parentThreadId: this.threadId,
        ...(child.parentToolCallId !== undefined && {
          parentToolCallId: child.parentToolCallId,
        }),
        harness: this.harness.name,
        createdAt: entry?.createdAt ?? now,
        updatedAt: now,
        ...storedPrincipal(entry?.principal ?? principal),
      }))
      .catch((error: unknown) =>
        this.warn(
          operation,
          'harness:sessions',
          `The session index was not updated. ${String(error)}`,
        ),
      )
  }

  /**
   * Tell the main model how an agent ended: a transcript note (unless
   * `attach: 'none'`), and a new chat turn when `wake` is set. The wake turn
   * runs as `principal`, the user who started the agent.
   */
  private async noteAgentEnd(
    name: string,
    ended: 'finished' | 'failed',
    result: unknown,
    options: AgentStartOptions,
    principal?: Principal,
  ): Promise<void> {
    const note = referenceNote(name, result, ended)
    if ((options.attach ?? 'reference') === 'reference') {
      await this.addNote(note)
    }
    if (options.wake) {
      void this.followUp(`Background agent ${name} ${ended}: ${note}`, {
        ...(principal ? { principal } : {}),
      })
    }
  }

  /**
   * Fail an agent run whose host stopped. Its events end the operation for
   * views, and the main model gets a note.
   */
  // ponytail: `wake` comes from the log. Without a log there is no wake, only
  // the note. Keep `wake` on the run record if a host without a log needs it.
  private async failStoppedAgent(stopped: {
    operationId: string
    agent: string
    inputId?: string
    wake?: boolean
    /** Who started the agent. The wake turn runs as this user. */
    principal?: Principal
    /** Why it failed. Default: the host stopped. */
    error?: InputSettlement['error']
  }): Promise<void> {
    const { operationId, inputId } = stopped
    const error = stopped.error ?? { message: AGENT_STOPPED }
    await this.persistence.stores.runs?.update(operationId, {
      status: 'failed',
      finishedAt: Date.now(),
      error,
    })
    if (inputId) {
      // The steers that joined the run settle with it.
      await this.settle(
        ...[inputId, ...this.joinedInputs(operationId, inputId)].map((id) => ({
          inputId: id,
          operationId,
          outcome: 'failed' as const,
          error,
        })),
      )
    }
    this.feed.publish(operationId, {
      type: EventType.RUN_ERROR,
      message: error.message,
      timestamp: Date.now(),
    })
    this.feed.publish(
      operationId,
      customEvent(HARNESS_EVENTS.operationFinished, {
        operationId,
        status: 'failed',
      }),
    )
    await this.noteAgentEnd(
      stopped.agent,
      'failed',
      error.message,
      { wake: stopped.wake === true },
      stopped.principal,
    )
  }

  /**
   * Add an assistant note to the transcript: at once when no turn runs, else
   * before the next turn starts.
   */
  private async addNote(note: string) {
    this.pendingNotes.push(note)
    if (!this.activeTurn) await this.flushNotes()
  }

  /** Write queued notes to the transcript while no turn is writing it. */
  private async flushNotes(): Promise<void> {
    const messages = this.messages
    if (this.pendingNotes.length === 0) return
    const notes = this.pendingNotes.splice(0)
    const history = await messages.loadThread(this.threadId)
    await messages.saveThread(this.threadId, [
      ...history,
      ...notes.map(
        (note): ModelMessage => ({
          id: createMessageId(),
          role: 'assistant',
          content: note,
        }),
      ),
    ])
  }

  // ===========================
  // Inbox and lifecycle events
  // ===========================

  /**
   * Store an input, unless its id is known. The check before the first
   * `await` is synchronous, so a second call with the same id in the same
   * tick is a duplicate too. `principal` is who sent it.
   */
  private async accept(
    inputId: string,
    input: HarnessInput,
    principal = this.principal,
  ): Promise<'new' | 'duplicate' | 'conflict'> {
    const sender = storedPrincipal(principal)
    const payload = inputKey(input, sender.principal)
    const local = this.admitted.get(inputId)
    if (local !== undefined) return local === payload ? 'duplicate' : 'conflict'
    const logged = this.writer?.state.inputs.get(inputId)
    if (logged) {
      return inputKey(logged.input, logged.principal) === payload
        ? 'duplicate'
        : 'conflict'
    }
    this.admitted.set(inputId, payload)
    // Before the input is stored, so a crash after the write leaves a claim
    // that a sweep finds.
    if (WORK_OPS.has(input.op)) {
      this.markBusy()
      await this.claimWrite
    }
    const at = Date.now()
    if (this.writer) {
      await this.writer.append([
        { type: 'harness.input', inputId, input, at, ...sender },
      ])
    } else {
      const stored = await this.inbox.append({
        inputId,
        threadId: this.threadId,
        input,
        createdAt: at,
        ...sender,
      })
      // The inbox had the id before this session: a restart.
      if (stored.createdAt !== at || stored.status !== 'pending') {
        return inputKey(stored.input, stored.principal) === payload
          ? 'duplicate'
          : 'conflict'
      }
    }
    this.feed.publish(
      'session',
      customEvent(HARNESS_EVENTS.inputAccepted, { inputId, op: input.op }),
    )
    return 'new'
  }

  /**
   * Does `stores.runs` have a run with this id, on any thread? A client run
   * id must not reuse it. A store that fails counts as yes, so nothing runs.
   */
  private async isRunTaken(runId: string): Promise<boolean> {
    const runs = this.persistence.stores.runs
    if (!runs) return false
    return runs.get(runId).then(
      (run) => run !== null,
      () => true,
    )
  }

  /** Record that `operationId` runs the input. A durable host counts attempts. */
  private async markApplied(
    inputId: string,
    operationId: string,
  ): Promise<void> {
    if (!this.writer) {
      await this.inbox.markApplied(inputId, operationId)
      return
    }
    const logged = this.writer.state.inputs.get(inputId)
    const timeoutMs = this.harness.durability?.timeoutMs
    // Stamped once, at the first apply. Retries do not move it.
    const timeoutAt =
      logged?.timeoutAt ??
      (timeoutMs !== undefined ? Date.now() + timeoutMs : undefined)
    await this.writer.append([
      {
        type: 'harness.input.applied',
        inputId,
        operationId,
        attempt: (logged?.attempt ?? 0) + 1,
        ...(timeoutAt !== undefined ? { timeoutAt } : {}),
      },
    ])
  }

  private async applied(inputId: string, operationId: string): Promise<void> {
    await this.markApplied(inputId, operationId)
    this.feed.publish(
      operationId,
      customEvent(HARNESS_EVENTS.inputApplied, { inputId, operationId }),
    )
  }

  /** Refuse an input. Returns its rejected receipt. */
  private reject(inputId: string, reason: string) {
    if (this.writer) {
      void this.writer
        .append([{ type: 'harness.input.rejected', inputId, reason }])
        .catch(() => {})
    } else {
      void this.inbox.markRejected(inputId, reason)
    }
    const receipt: Receipt = { inputId, status: 'rejected', reason }
    this.receipts.set(inputId, receipt)
    this.feed.publish(
      'session',
      customEvent(HARNESS_EVENTS.inputRejected, { inputId, reason }),
    )
    return receipt
  }

  /**
   * Record how inputs ended, all in one append: a turn and the inputs that
   * joined it settle together. Clients get a `harness.input.settled` event.
   */
  private async settle(...settlements: Array<InputSettlement>): Promise<void> {
    if (this.writer) {
      await this.writer.append(
        settlements.map((settlement) => ({
          type: 'harness.input.settled',
          ...settlement,
        })),
      )
    }
    for (const settlement of settlements) {
      this.settlements.set(settlement.inputId, settlement)
      this.feed.publish(
        settlement.operationId ?? 'session',
        customEvent(HARNESS_EVENTS.inputSettled, { ...settlement }),
      )
    }
  }

  /** How a chat input ended, when it did. Throws for a refused input. */
  private knownSettlement(inputId: string): InputSettlement | undefined {
    const logged = this.writer?.state.inputs.get(inputId)
    if (logged?.settlement) return logged.settlement
    const refused =
      logged?.status === 'rejected'
        ? { inputId, status: 'rejected' as const, reason: logged.reason ?? '' }
        : this.receipts.get(inputId)
    if (refused?.status === 'rejected') throw new InputRejectedError(refused)
    return this.settlements.get(inputId)
  }

  private isChatInput(inputId: string) {
    const input = this.writer?.state.inputs.get(inputId)?.input
    // A reset, an agent run, and a message to an agent run in the log
    // settle their input too.
    if (input)
      return (
        CHAT_OPS.has(input.op) ||
        input.op === 'reset' ||
        input.op === 'agent' ||
        input.op === 'agentMessage'
      )
    return this.turnOperations.has(inputId) || this.receipts.has(inputId)
  }

  /** Link a turn operation and its input. */
  private bindTurn(inputId: string, operation: OperationImpl<ChatTurnResult>) {
    this.turnOperations.set(inputId, operation)
    this.operationInputs.set(operation.id, inputId)
  }

  /** Keep a chat input's receipt, for a duplicate of the input. */
  private keep(receipt: Receipt): Receipt {
    this.receipts.set(receipt.inputId, receipt)
    return receipt
  }

  /** Resolve a turn's receipt, and keep it for a duplicate. */
  private answerTurn(
    operation: OperationImpl<ChatTurnResult>,
    receipt: Receipt,
  ) {
    operation.resolveReceipt(this.keep(receipt))
  }

  private refuse(operation: OperationImpl<ChatTurnResult>, receipt: Receipt) {
    this.answerTurn(operation, receipt)
    operation.fail('failed', new InputRejectedError(receipt))
  }

  /** What a duplicate or a conflicting chat input gets back. */
  private duplicateReceipt(
    inputId: string,
    admission: 'duplicate' | 'conflict',
  ): Receipt {
    if (admission === 'conflict') {
      return { inputId, status: 'rejected', reason: 'conflict' }
    }
    const kept = this.receipts.get(inputId)
    if (kept) return kept
    const operationId = this.writer?.state.inputs.get(inputId)?.operationId
    return {
      inputId,
      status: 'accepted',
      ...(operationId ? { operationId } : {}),
    }
  }

  /**
   * The operation for a prompt whose id is known: the live one, one that
   * settles from the log, or a refused one for another payload.
   */
  private knownTurn(
    inputId: string,
    input: HarnessInput,
    principal: Principal | undefined,
  ) {
    const payload = inputKey(input, principal)
    const local = this.admitted.get(inputId)
    const logged = this.writer?.state.inputs.get(inputId)
    const stored =
      local ?? (logged ? inputKey(logged.input, logged.principal) : undefined)
    if (stored === undefined) return undefined
    if (stored !== payload) {
      const refused = this.createTurnOperation()
      this.refuse(refused, { inputId, status: 'rejected', reason: 'conflict' })
      return refused
    }
    const live = this.turnOperations.get(inputId)
    if (live) return live
    const replay = this.createTurnOperation(logged?.operationId)
    this.answerDuplicate(replay, inputId, 'duplicate')
    return replay
  }

  /** Settle `operation` like the earlier input with the same id. */
  private answerDuplicate(
    operation: OperationImpl<ChatTurnResult>,
    inputId: string,
    admission: 'duplicate' | 'conflict',
  ) {
    const receipt = this.duplicateReceipt(inputId, admission)
    if (receipt.status === 'rejected') {
      this.refuse(operation, receipt)
      return
    }
    operation.resolveReceipt(receipt)
    if (!this.writer) {
      // Without a log, the result of an input from before a restart is gone.
      operation.fail(
        'failed',
        new Error(
          'This input ran before a restart. Keep its result with a durable host (stores.log).',
        ),
      )
      return
    }
    void this.settled(inputId).then(
      (settlement) => this.settleOperation(operation, settlement),
      (error: unknown) => operation.fail('failed', error),
    )
  }

  /** End `operation` with a stored settlement. */
  private settleOperation(
    operation: OperationImpl<ChatTurnResult>,
    settlement: InputSettlement,
  ) {
    const text = lastAssistantText(this.writer?.state.messages ?? [])
    switch (settlement.outcome) {
      case 'completed':
        operation.finish('completed', { text })
        return
      case 'interrupted':
        operation.finish('interrupted', { text, interrupts: [] })
        return
      case 'aborted':
        operation.fail('cancelled', new Error('Cancelled.'))
        return
      case 'failed':
        operation.fail(
          'failed',
          new Error(settlement.error?.message ?? 'The input failed.'),
        )
        return
    }
  }

  private publishStarted(
    operation: OperationImpl<unknown> | OperationImpl<ChatTurnResult>,
  ): void {
    operation.publish(
      customEvent(HARNESS_EVENTS.operationStarted, {
        operationId: operation.id,
        kind: operation.kind,
        ...(operation.agent ? { agent: operation.agent } : {}),
      }),
    )
  }

  private publishFinished(
    operation: OperationImpl<unknown> | OperationImpl<ChatTurnResult>,
  ): void {
    operation.publish(
      customEvent(HARNESS_EVENTS.operationFinished, {
        operationId: operation.id,
        status: operation.status(),
      }),
    )
  }

  /**
   * Continue the newest chat turn that a crashed host left running. Older
   * crashed turns are marked failed, and so are crashed agent runs.
   */
  private async recoverCrashedTurn(): Promise<void> {
    const runs = await findCrashedRuns(
      this.persistence.stores.runs,
      this.threadId,
    )
    for (const run of runs.filter((record) => record.kind === 'agent')) {
      await this.failStoppedAgent({
        operationId: run.runId,
        agent: run.agent ?? 'agent',
      })
    }
    const crashed = runs.filter((record) => record.kind !== 'agent')
    const newest = crashed.sort((a, b) => b.startedAt - a.startedAt)[0]
    for (const record of crashed) {
      await this.persistence.stores.runs?.update(record.runId, {
        status: 'failed',
        finishedAt: Date.now(),
        error: {
          message:
            record === newest
              ? 'The host stopped. The session continued this turn in a new run.'
              : 'The host stopped during this turn.',
        },
      })
    }
    if (!newest || this.interrupted) return
    await repairTranscript({
      messages: this.messages,
      threadId: newest.threadId,
      pending: newest.checkpoint?.pendingTools ?? [],
      interrupted: this.harness.durability?.interruptedToolResult,
      truncated: this.harness.durability?.truncatedToolResult,
    })
    const operation = this.createTurnOperation()
    this.feed.publish(
      operation.id,
      customEvent(HARNESS_EVENTS.operationResumed, {
        operationId: operation.id,
        resumedFrom: newest.runId,
      }),
    )
    this.enqueueTurn({ operation })
  }

  /**
   * Queue a reset: at the front for a new one (it applies when the running
   * turn ends), at the end for one from before a restart (in its admission
   * order). Its operation is a command, so clients do not see a chat turn.
   */
  private queueReset(
    inputId: string,
    note: string | undefined,
    principal: Principal | undefined,
    at: 'front' | 'end',
  ) {
    const operation = new OperationImpl<ChatTurnResult>(
      'command',
      this.feed,
      (target) => this.cancel(target.id),
    )
    this.operations.set(operation.id, operation as OperationImpl<unknown>)
    this.bindTurn(inputId, operation)
    const turn: QueuedTurn = {
      operation,
      inputId,
      principal,
      reset: note !== undefined ? { note } : {},
    }
    this.queue.splice(
      at === 'front' ? this.frontOfQueue() : this.queue.length,
      0,
      turn,
    )
    this.drain()
    return operation
  }

  /** Re-run turns that were accepted but never applied before a restart. */
  private async recoverInbox(): Promise<void> {
    const pending: Array<InboxEntry> = await this.inbox.listPending(
      this.threadId,
    )
    for (const entry of pending) {
      const input = entry.input as HarnessInput
      if (
        input.op === 'prompt' ||
        input.op === 'followUp' ||
        input.op === 'steer'
      ) {
        const operation = this.createTurnOperation()
        this.admitted.set(entry.inputId, inputKey(input, entry.principal))
        this.bindTurn(entry.inputId, operation)
        this.enqueueTurn({
          operation,
          message: input.message,
          inputId: entry.inputId,
          principal: entry.principal,
          context: input.context,
        })
      } else if (input.op === 'reset') {
        this.queueReset(entry.inputId, input.note, entry.principal, 'end')
      } else {
        this.reject(entry.inputId, 'expired_on_restart')
      }
    }
  }

  /** The recovery decision for `input`: the hook's, or `decision`. */
  private async recoverDecision(
    writer: LogWriter,
    input: InputState,
    decision: RecoverDecision,
  ): Promise<RecoverDecision> {
    const recover = this.harness.durability?.recover
    if (!recover) return decision
    const answer = await recover({
      session: this,
      input: {
        inputId: input.inputId,
        input: input.input,
        attempt: input.attempt,
        ...(input.timeoutAt !== undefined
          ? { timeoutAt: input.timeoutAt }
          : {}),
        abortRequested: input.abortRequested,
        ...(input.operationId ? { operationId: input.operationId } : {}),
        retries: input.retries ?? 0,
      },
      messages: [...writer.state.messages],
      decision,
    })
    return answer ?? decision
  }

  /**
   * The answer text that operation `operationId` streamed after the last
   * transcript record: the part of a cut answer that the log has. Thinking,
   * tool call arguments, and agent text are not in it.
   */
  private async cutOffText(writer: LogWriter, operationId: string) {
    const from = writer.state.transcriptSeq
    if (from === undefined) return ''
    let text = ''
    for await (const { event } of writer.read({
      from: String(from),
      filter: (entry) => entry.operationId === operationId,
      until: () => true,
    })) {
      if (
        event.type === EventType.TEXT_MESSAGE_CONTENT &&
        !('subagentRunId' in event && event.subagentRunId)
      ) {
        text += event.delta
      }
    }
    return text
  }

  /**
   * A `cancelInput` or `setDelivery` whose own record is in the log, but not
   * its change: a crash cut it. Apply it now, before any input runs. When
   * its input does not wait any more, reject it with `not_waiting`. Other
   * ops are not changed.
   */
  private async recoverControl(writer: LogWriter, logged: InputState) {
    const { input } = logged
    if (input.op !== 'cancelInput' && input.op !== 'setDelivery') return
    const target = writer.state.inputs.get(input.inputId)
    const isWaiting = target?.status === 'pending' && 'message' in target.input
    if (!isWaiting) {
      this.reject(logged.inputId, 'not_waiting')
      return
    }
    await this.applyControl(
      logged.inputId,
      input.op === 'cancelInput'
        ? { type: 'harness.input.abort', inputId: input.inputId }
        : {
            type: 'harness.input.delivery',
            inputId: input.inputId,
            delivery: input.delivery,
          },
    )
  }

  /**
   * Recover a durable session from its log, input by input, in admission
   * order. A chat turn whose host stopped (its run lease expired) settles
   * `completed` when the log already has its final answer. Else it settles
   * `aborted` when an abort was asked, settles `failed` when no attempt or no
   * time is left, and else runs again as the next attempt. An agent run (a
   * first run or a follow-up run) whose host stopped runs again with
   * `resume: true`, else settles `failed` with the steers that joined it. A
   * message that waited for such a run goes to the run again, else settles
   * `aborted`. An input that never ran runs now. One that a `setDelivery`
   * sent to `steer` joins the turn that runs, when one does. A `cancelInput`
   * or `setDelivery` that a crash cut before it was applied applies first.
   * Other inputs are rejected with `expired_on_restart`. An input that this
   * session stored or took already is skipped, so `recover()` can run this
   * again.
   */
  private async recoverFromLog(writer: LogWriter): Promise<void> {
    const runs = this.persistence.stores.runs
    const maxAttempts = this.harness.durability?.maxAttempts ?? 10
    // True for an input that this session stored or took. Else the session
    // takes it now, so `recover()` does not take it again.
    const isTaken = (input: InputState) => {
      if (this.admitted.has(input.inputId)) return true
      this.admitted.set(input.inputId, inputKey(input.input, input.principal))
      return false
    }
    const logged = [...writer.state.inputs.values()]
    for (const input of logged) {
      const isControl =
        input.status === 'pending' && CONTROL_OPS.has(input.input.op)
      if (isControl && !isTaken(input)) await this.recoverControl(writer, input)
    }
    // Read again: the pass above changed the inputs it applied to.
    const inputs = [...writer.state.inputs.values()]
    for (const input of inputs) {
      // A reset that did not settle applies now. Its marker goes in once.
      if (input.input.op === 'reset') {
        const isOpen =
          (input.status === 'pending' || input.status === 'applied') &&
          !isTaken(input)
        if (isOpen && input.abortRequested) {
          await this.settle({ inputId: input.inputId, outcome: 'aborted' })
        } else if (isOpen) {
          this.queueReset(
            input.inputId,
            input.input.note,
            input.principal,
            'end',
          )
        }
        continue
      }
      const isChat = CHAT_OPS.has(input.input.op)
      if (input.status === 'pending') {
        // The pass above handled a control input.
        if (CONTROL_OPS.has(input.input.op) || isTaken(input)) continue
        // A message to an agent run goes to the run that recovery continues.
        // That run's input is older, so its chain exists here.
        if (input.input.op === 'agentMessage') {
          const chain = this.agentChains.get(input.input.run ?? '')
          if (chain) {
            this.deliver(
              chain,
              {
                inputId: input.inputId,
                message: input.input.message,
                ...(input.principal ? { principal: input.principal } : {}),
              },
              input.input.mode ?? 'steer',
            )
          } else {
            // ponytail: a follow-up that waited for a run that had ended when
            // the host stopped settles aborted too. Start it from the chain
            // in the log if an app needs it.
            await this.settle({ inputId: input.inputId, outcome: 'aborted' })
          }
          continue
        }
        if (
          !isChat ||
          !('message' in input.input || input.input.op === 'continue')
        ) {
          this.reject(input.inputId, 'expired_on_restart')
          continue
        }
        // An input that was cancelled before it ran settles aborted.
        const decision = await this.recoverDecision(
          writer,
          input,
          input.abortRequested
            ? { action: 'settle', outcome: 'aborted' }
            : { action: 'run' },
        )
        if (decision.action === 'settle') {
          await this.settle({
            inputId: input.inputId,
            outcome: decision.outcome,
            ...(decision.error ? { error: decision.error } : {}),
          })
          continue
        }
        if (input.input.op === 'continue') {
          // It runs from the transcript, as `continue()` does.
          const operation = this.createTurnOperation()
          this.bindTurn(input.inputId, operation)
          this.enqueueTurn({
            operation,
            inputId: input.inputId,
            principal: input.principal,
            context: input.input.context,
            overrides: decision.overrides,
            isContinue: true,
          })
          continue
        }
        const steer: WaitingSteer = {
          inputId: input.inputId,
          message: input.input.message,
          principal: input.principal,
          context: input.input.context,
          overrides: decision.overrides,
        }
        // Else it runs as its own turn, as `steer()` does when no turn runs.
        if (input.delivery === 'steer' && this.activeTurn) {
          this.steerQueue.push(steer)
          continue
        }
        this.enqueueTurn(this.steerTurn(steer))
        continue
      }
      // An agent run: a first run, or a follow-up run of its chain.
      const first = chainInputOf(writer.state.inputs, input)
      if (input.status !== 'applied' || !(isChat || first)) continue
      const leases = this.persistence.stores.leases
      const run = input.operationId ? await runs?.get(input.operationId) : null
      const now = Date.now()
      // A host lease store decides when there is one. Else the run lease does.
      const isAlive =
        leases && input.operationId
          ? await leases.isAlive({
              threadId: this.threadId,
              inputId: input.inputId,
              operationId: input.operationId,
              attempt: input.attempt,
            })
          : run?.status === 'running' &&
            run.leaseExpiresAt !== undefined &&
            run.leaseExpiresAt >= now
      // Another host still drives this turn.
      if (isAlive || isTaken(input)) continue
      if (first) {
        // A run that ended before its settle record landed did not stop.
        if (!run || run.status === 'running') {
          const isResumable = first.input.resume === true
          if (isResumable && input.attempt < maxAttempts) {
            if (input.operationId) {
              await runs?.update(input.operationId, {
                status: 'failed',
                finishedAt: now,
                error: {
                  message:
                    'The host stopped. The session continued this agent run in a new run.',
                },
              })
            }
            this.resumeAgent(input, first)
            continue
          }
          await this.failStoppedAgent({
            operationId: input.operationId ?? '',
            agent: first.input.agent,
            inputId: input.inputId,
            wake: first.input.detached,
            ...(input.principal ? { principal: input.principal } : {}),
            ...(isResumable
              ? {
                  error: {
                    message: `The agent run stopped the host ${input.attempt} times.`,
                    code: 'attempts_exhausted',
                  },
                }
              : {}),
          })
        }
        continue
      }
      if (run?.status === 'running') {
        await runs?.update(run.runId, {
          status: 'failed',
          finishedAt: now,
          error: { message: 'The host stopped during this turn.' },
        })
      }
      const operationId = input.operationId
      // The inputs that joined this turn settle with it, in one append.
      const joined = this.joinedInputs(operationId ?? '', input.inputId)
      const ended = (settlement: Omit<InputSettlement, 'inputId'>) =>
        this.settle(
          ...[input.inputId, ...joined].map((inputId) => ({
            inputId,
            ...(operationId ? { operationId } : {}),
            ...settlement,
          })),
        )
      // A final answer in the log comes first: the turn ended.
      const fallback: RecoverDecision = hasFinalAnswer(
        writer.state.messages,
        input.appliedAt ?? 0,
      )
        ? { action: 'settle', outcome: 'completed' }
        : input.abortRequested
          ? { action: 'settle', outcome: 'aborted' }
          : input.attempt >= maxAttempts
            ? {
                action: 'settle',
                outcome: 'failed',
                error: {
                  message: `The input stopped the host ${input.attempt} times.`,
                  code: 'attempts_exhausted',
                },
              }
            : input.timeoutAt !== undefined && now >= input.timeoutAt
              ? {
                  action: 'settle',
                  outcome: 'failed',
                  error: {
                    message: 'The input passed its time limit.',
                    code: 'timeout',
                  },
                }
              : { action: 'run' }
      const decision = await this.recoverDecision(writer, input, fallback)
      if (decision.action === 'settle') {
        await ended({
          outcome: decision.outcome,
          ...(decision.error ? { error: decision.error } : {}),
        })
        continue
      }
      if (input.input.op === 'resolve') {
        const store = this.persistence.stores.interrupts
        const records = store
          ? await Promise.all(
              input.input.resume.map((item) => store.get(item.interruptId)),
            )
          : []
        const consumed =
          records.length > 0 &&
          records.every(
            (record) =>
              record !== null &&
              record.threadId === this.threadId &&
              record.status !== 'pending',
          )
        const newPhase =
          this.interrupted && this.interrupted.runId === operationId
        if (
          consumed ||
          newPhase ||
          (!this.interrupted && run?.status === 'completed')
        ) {
          await ended({
            outcome: this.interrupted ? 'interrupted' : 'completed',
          })
          continue
        }
        if (!this.interrupted) {
          await ended({
            outcome: 'failed',
            error: { message: 'The interrupted turn is no longer available.' },
          })
          continue
        }
        const operation = this.createTurnOperation()
        this.bindTurn(input.inputId, operation)
        this.feed.publish(
          operation.id,
          customEvent(HARNESS_EVENTS.operationResumed, {
            operationId: operation.id,
            ...(operationId ? { resumedFrom: operationId } : {}),
          }),
        )
        // The same turn as a live `resolve()`: it answers the stopped turn,
        // as the input's sender, with the context of the stopped turn.
        this.enqueueTurn({
          operation,
          inputId: input.inputId,
          resume: input.input.resume,
          answers: this.interrupted,
          principal: input.principal,
          context: this.interrupted.context,
          overrides: decision.overrides,
        })
        continue
      }
      const started = [...writer.state.started]
        .filter(([toolCallId]) => !writer.state.toolResults.has(toolCallId))
        .map(([toolCallId, tool]) => ({ toolCallId, ...tool }))
      // Before the repair, which can write a transcript record.
      const cutOff = this.harness.durability?.continueCutOff
      const partial =
        cutOff && operationId ? await this.cutOffText(writer, operationId) : ''
      await repairTranscript({
        messages: this.messages,
        threadId: this.threadId,
        pending: [...(run?.checkpoint?.pendingTools ?? []), ...started],
        finished: writer.state.toolResults,
        interrupted: this.harness.durability?.interruptedToolResult,
        truncated: this.harness.durability?.truncatedToolResult,
      })
      if (partial !== '') {
        const history = await this.messages.loadThread(this.threadId)
        // One append, so the transcript never ends with the cut answer.
        await this.messages.saveThread(this.threadId, [
          ...history,
          { id: createMessageId(), role: 'assistant', content: partial },
          {
            id: createMessageId(),
            role: 'user',
            content:
              (typeof cutOff === 'object' && cutOff.note) || CUT_OFF_NOTE,
          },
        ])
      }
      const operation = this.createTurnOperation()
      this.bindTurn(input.inputId, operation)
      this.feed.publish(
        operation.id,
        customEvent(HARNESS_EVENTS.operationResumed, {
          operationId: operation.id,
          ...(operationId ? { resumedFrom: operationId } : {}),
        }),
      )
      // The transcript has the message, so the turn adds none. Plugins and
      // the router still get what the input sent.
      const sent = input.input
      this.enqueueTurn({
        operation,
        inputId: input.inputId,
        principal: input.principal,
        ...('message' in sent ? { sentMessage: sent.message } : {}),
        ...('context' in sent ? { context: sent.context } : {}),
        overrides: decision.overrides,
      })
    }
  }
}
