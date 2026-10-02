import {
  EventType,
  RUN_CANCEL_REASON,
  SubagentBudget,
  chat,
  compactForModel,
  convertSchemaToJsonSchema,
  createSubagentId,
  maxIterations,
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
  sessionMessageStore,
  stepKey,
} from './log'
import { createMediaStore, mediaCapture, mediaMiddleware } from './media'
import { mediaIdOf, mediaOfMessage } from './media-ref'
import { OperationImpl } from './operation'
import { mountPlugins } from './plugins'
import {
  LEASE,
  checkpointMiddleware,
  findCrashedRuns,
  holdRunLease,
  repairTranscript,
} from './resume'
import { HARNESS_EVENTS, InputRejectedError } from './types'
import type {
  AnyChatMiddleware,
  AnyTextAdapter,
  AnyTool,
  Interrupt,
  Modality,
  ModelMessage,
  ProviderKeys,
  RunAgentResumeItem,
  RunRecord,
  SchemaInput,
  StreamChunk,
  SubagentBinding,
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
} from '@tanstack/ai-persistence'
import type { AuthRequiredError, CredentialsAccess } from './auth'
import type { EventFeed } from './feed'
import type { InputState, LogWriter, ProjectOptions } from './log'
import type { DurableBind } from './durable-tool'
import type { LeaseOptions } from './resume'
import type { MediaStore } from './media'
import type { PluginSessionApi, Question } from './commands'
import type { ConfigOption } from './config'
import type {
  AgentInputOf,
  AgentRegistryView,
  AgentResultOf,
  AnyAgent,
} from './agents'
import type { AnyHarness, HarnessAgentsOf } from './define'
import type { RecoverDecision, TurnAdditions } from './turn'
import type { HarnessPersistence } from './host'
import type {
  AgentGroup,
  HarnessPlugin,
  MountedPlugins,
  PluginAgentActions,
  PluginServices,
  PluginState,
} from './plugins'
import type {
  BusyPolicy,
  ChatTurnResult,
  Cursor,
  HarnessInput,
  InputSettlement,
  MediaKind,
  MediaRecord,
  Operation,
  Principal,
  Receipt,
  SessionEvent,
  UserInput,
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
  ) => Operation<AgentResultOf<TAgent>>
}

/** A handle for an agent picked by name at runtime. */
export interface DynamicAgentHandle {
  run: (input?: unknown, options?: AgentRunOptions) => Operation<unknown>
  start: (input?: unknown, options?: AgentStartOptions) => Operation<unknown>
}

/** `session.agents`: one typed handle per registered agent name. */
export type AgentHandles<THarness> = {
  [TAgent in HarnessAgentsOf<THarness> as TAgent['name']]: AgentHandle<TAgent>
}

/** What a session looks like right now. */
export interface SessionSnapshot {
  threadId: string
  /**
   * `running`: a chat turn runs. `requires_action`: the last turn stopped for
   * outside input. `idle`: ready for a prompt (agents may still run).
   */
  status: 'idle' | 'running' | 'requires_action'
  activeOperations: Array<{ id: string; kind: string; agent?: string }>
  queuedTurns: number
  pendingInterrupts: Array<Interrupt>
  /** Questions a command or a plugin asked, waiting for `session.answer`. */
  pendingQuestions: Array<{
    questionId: string
    message: string
    schema?: unknown
    /** The answer is a secret (a key or a password). Hide it as the user types. */
    secret?: boolean
  }>
  /** The state of each plugin that uses `ctx.state`, by plugin name. */
  plugins: Record<string, unknown>
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
  onClose: () => void
}

interface QueuedTurn {
  operation: OperationImpl<ChatTurnResult>
  message?: UserInput
  resume?: Array<RunAgentResumeItem>
  parentRunId?: string
  inputId?: string
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
const CHAT_OPS = new Set<string>(['prompt', 'steer', 'followUp', 'resolve'])

/** Why a turn stops when its input passes its time limit. */
const TIMEOUT_REASON = 'harness:input-timeout'

/** The text of the last assistant message, for an operation rebuilt from the log. */
function lastAssistantText(messages: ReadonlyArray<ModelMessage>) {
  const last = messages.findLast((message) => message.role === 'assistant')
  return typeof last?.content === 'string' ? last.content : ''
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
  private feed: EventFeed = new SessionFeed()
  /** The transcript: `stores.messages`, or a view of the log. */
  private messages: MessageStore
  /** What `withPersistence` gets: the chat stores, with `messages`. */
  private chatPersistence: AIPersistence<ChatTranscriptStores> | undefined
  /** The message store the chat engine saves through, on a durable host. */
  private engine: ReturnType<typeof engineMessageStore> | undefined
  /** Why the session log stopped taking writes. */
  private logFailure: Error | undefined
  private readonly log: SessionDependencies['log']
  /** Inputs this session stored, by id, as JSON: the duplicate check. */
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
  private readonly queue: Array<QueuedTurn> = []
  /**
   * Messages for the running turn. A steer that the turn never reached (no
   * further model call) runs as the next turn instead.
   */
  private readonly steerQueue: Array<{
    inputId: string
    message: UserInput
    operation?: OperationImpl<ChatTurnResult>
  }> = []
  /**
   * Waiting steers with an abort request. An id lands here before the abort
   * append, so a join that runs during that append skips the steer.
   */
  private readonly abortedSteers = new Set<string>()
  /** The ids of the waiting steers that a join took. A cancel of one is refused. */
  private readonly joining = new Set<string>()
  private readonly pendingNotes: Array<string> = []
  private activeTurn: OperationImpl<ChatTurnResult> | undefined
  private interrupted:
    | { runId: string; interrupts: Array<Interrupt> }
    | undefined
  private plugins: ReadonlyArray<HarnessPlugin> = []
  private sessionPlugins: MountedPlugins | undefined
  private closing: Promise<void> | undefined
  private readonly onClose: () => void
  private checkpoint: AnyChatMiddleware | undefined
  /** Gives each durable tool call its steps in the log. One per session. */
  private bindTool: DurableBind | undefined
  private readonly hostId: string
  private readonly lease: LeaseOptions | undefined
  private readonly listeners = new Map<string, Set<(value: unknown) => void>>()
  private readonly configValues = new Map<string, unknown>()
  private readonly questions = new Map<
    string,
    {
      message: string
      schema: SchemaInput | undefined
      secret: boolean
      resolve: (value: unknown) => void
      reject: (error: unknown) => void
    }
  >()
  private readonly stateDoc: Record<string, unknown> = {}
  /** Reads each plugin's saved state, so the first snapshot has it. */
  private readonly stateLoaders = new Map<string, () => Promise<unknown>>()
  private readonly localState = new Map<string, unknown>()
  private readonly credentialAccess: CredentialsAccess
  /** Model provider keys: saved with `/connect <provider>`, else the env var. */
  private readonly keys: ProviderKeys
  private readonly services: PluginServices
  private readonly media: SessionDependencies['media']
  private readonly mediaStore: MediaStore

  constructor(deps: SessionDependencies) {
    this.harness = deps.harness as THarness
    this.threadId = deps.threadId
    this.logId = deps.logId
    this.persistence = deps.persistence
    this.inbox = deps.inbox
    this.media = deps.media
    this.mediaStore = createMediaStore({
      persistence: deps.media,
      threadId: deps.threadId,
      options: this.harness.media,
    })
    this.principal = deps.principal
    this.onClose = deps.onClose
    this.hostId = deps.hostId
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
    this.credentialAccess = credentialsFor(
      deps.credentials,
      {
        threadId: deps.threadId,
        ...(deps.principal ? { userId: deps.principal.id } : {}),
      },
      onMissing,
    )
    this.keys = providerKeysFor(this.credentialAccess, onMissing)
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

  /** @internal Mount session plugins and replay inputs left in the inbox. */
  async open(): Promise<void> {
    // First: plugins publish events while they mount.
    await this.openLog()
    try {
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
        },
      )
      await this.loadConfig()
      await this.loadPluginState()
      if (this.writer) {
        await this.recoverFromLog(this.writer)
        return
      }
      await this.recoverCrashedTurn()
      await this.recoverInbox()
    } catch (error) {
      // A session that fails to open gives its log view back, so the thread
      // can open again.
      this.feed.close()
      throw error
    }
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
      this.feed = this.writer
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
   */
  prompt(
    message: UserInput,
    options?: { busy?: BusyPolicy; inputId?: string },
  ): Operation<ChatTurnResult> {
    const busy = options?.busy ?? this.harness.busy ?? 'queue'
    const inputId = options?.inputId ?? createInputId()
    const input: HarnessInput = { op: 'prompt', message, busy }
    const known = this.knownTurn(inputId, input)
    if (known) return known
    const operation = this.createTurnOperation()
    this.bindTurn(inputId, operation)
    void this.accept(inputId, input).then(
      (admission) => {
        if (admission !== 'new') {
          this.answerDuplicate(operation, inputId, admission)
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
        const isWaiting = this.activeTurn !== undefined || this.queue.length > 0
        this.answerTurn(operation, {
          inputId,
          status: isWaiting && busy !== 'steer' ? 'queued' : 'accepted',
          operationId: operation.id,
        })
        if (this.activeTurn && busy === 'steer') {
          this.steerQueue.push({ inputId, message, operation })
          return
        }
        this.enqueueTurn({ operation, message, inputId })
      },
      (error: unknown) => {
        // The input was not stored. After a log failure, say why the
        // session stopped.
        const failure = this.logFailure ?? error
        this.answerTurn(operation, {
          inputId,
          status: 'rejected',
          reason: failure instanceof Error ? failure.message : String(failure),
        })
        operation.fail('failed', failure)
      },
    )
    return operation
  }

  /** Add a message to the running turn at its next model call. */
  async steer(
    message: UserInput,
    options?: { inputId?: string },
  ): Promise<Receipt> {
    const inputId = options?.inputId ?? createInputId()
    const admission = await this.accept(inputId, { op: 'steer', message })
    if (admission !== 'new') return this.duplicateReceipt(inputId, admission)
    if (!this.activeTurn) {
      const operation = this.createTurnOperation()
      this.bindTurn(inputId, operation)
      this.enqueueTurn({ operation, message, inputId })
      return this.keep({
        inputId,
        status: 'accepted',
        operationId: operation.id,
      })
    }
    this.steerQueue.push({ inputId, message })
    return this.keep({
      inputId,
      status: 'accepted',
      operationId: this.activeTurn.id,
    })
  }

  /** Run a turn after the current work settles. */
  async followUp(
    message: UserInput,
    options?: { inputId?: string },
  ): Promise<Receipt> {
    const inputId = options?.inputId ?? createInputId()
    const admission = await this.accept(inputId, { op: 'followUp', message })
    if (admission !== 'new') return this.duplicateReceipt(inputId, admission)
    const operation = this.createTurnOperation()
    this.bindTurn(inputId, operation)
    const status =
      this.activeTurn || this.queue.length > 0 ? 'queued' : 'accepted'
    this.enqueueTurn({ operation, message, inputId })
    return this.keep({ inputId, status, operationId: operation.id })
  }

  /**
   * Answer the interrupts of the last turn. One resume must answer every open
   * interrupt of that turn (the AG-UI rule).
   */
  async resolve(
    resume: Array<RunAgentResumeItem>,
    options?: { inputId?: string },
  ): Promise<Receipt> {
    const inputId = options?.inputId ?? createInputId()
    const admission = await this.accept(inputId, { op: 'resolve', resume })
    if (admission !== 'new') return this.duplicateReceipt(inputId, admission)
    if (!this.interrupted) {
      this.reject(inputId, 'no_pending_interrupts')
      return { inputId, status: 'rejected', reason: 'no_pending_interrupts' }
    }
    if (this.activeTurn) {
      this.reject(inputId, 'busy')
      return { inputId, status: 'rejected', reason: 'busy' }
    }
    const parentRunId = this.interrupted.runId
    this.interrupted = undefined
    const operation = this.createTurnOperation()
    this.bindTurn(inputId, operation)
    this.enqueueTurn({ operation, resume, parentRunId, inputId })
    return this.keep({ inputId, status: 'accepted', operationId: operation.id })
  }

  /**
   * Cancel one operation, or the running chat turn. On a durable host the
   * abort request is stored first, so a turn that a crash stops later settles
   * `aborted` and does not run again.
   */
  async cancel(operationId?: string): Promise<Receipt> {
    const inputId = createInputId()
    await this.accept(inputId, { op: 'cancel', operationId })
    const target = operationId
      ? this.operations.get(operationId)
      : this.activeTurn
    if (!target || target.isSettled()) {
      this.reject(inputId, 'not_running')
      return { inputId, status: 'rejected', reason: 'not_running' }
    }
    const waitingSteer = this.steerQueue.find(
      (steer) => steer.operation === target,
    )
    // A join took it, so it ends with the running turn, as a joined steer.
    if (waitingSteer && this.joining.has(waitingSteer.inputId)) {
      this.reject(inputId, 'not_running')
      return { inputId, status: 'rejected', reason: 'not_running' }
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
      target.fail('cancelled', new Error('Cancelled before it started.'))
      this.publishFinished(target)
    } else {
      target.abortController.abort(RUN_CANCEL_REASON)
    }
    await this.markApplied(inputId, target.id)
    return { inputId, status: 'accepted', operationId: target.id }
  }

  /**
   * How a chat input ended: `completed`, `failed`, `aborted`, or
   * `interrupted` (the turn waits for human input). It waits until the input
   * ends. On a durable host it reads the log, so it also works after a
   * restart and from another host that opens the thread.
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
      })),
      // A steer that waits to join the running turn waits too.
      queuedTurns: this.queue.length + this.steerQueue.length,
      pendingInterrupts: this.interrupted?.interrupts ?? [],
      pendingQuestions: [...this.questions.entries()].map(
        ([questionId, question]) => ({
          questionId,
          message: question.message,
          ...(question.schema
            ? { schema: convertSchemaToJsonSchema(question.schema) }
            : {}),
          ...(question.secret ? { secret: true } : {}),
        }),
      ),
      plugins: { ...this.stateDoc },
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
    if (!entry) {
      this.reject(inputId, 'unknown_config')
      return { inputId, status: 'rejected', reason: 'unknown_config' }
    }
    let checked: unknown
    try {
      checked = checkConfigValue(key, entry.option, value)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      this.reject(inputId, reason)
      return { inputId, status: 'rejected', reason }
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

  /** The saved messages of this thread, oldest first. */
  async transcript() {
    return [...(await this.messages.loadThread(this.threadId))]
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
    } satisfies SessionDescription
  }

  /** Run a plugin command. Its input is checked against the command's schema. */
  command(name: string, input?: unknown): Operation<unknown> {
    const operation = new OperationImpl<unknown>(
      'command',
      this.feed,
      (target) => this.cancel(target.id),
    )
    this.operations.set(operation.id, operation)
    void this.executeCommand(operation, name, input)
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
    if (!question) {
      this.reject(inputId, 'unknown_question')
      return { inputId, status: 'rejected', reason: 'unknown_question' }
    }
    let checked: unknown = value
    if (question.schema !== undefined) {
      const result = await validateWithStandardSchema(question.schema, value)
      if (!result.success) {
        const reason = `Invalid answer: ${result.issues.map((issue) => issue.message).join(', ')}`
        this.reject(inputId, reason)
        return { inputId, status: 'rejected', reason }
      }
      checked = result.data
    }
    this.questions.delete(questionId)
    await this.applied(inputId, 'session')
    this.feed.publish(
      'session',
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

  /** Put each plugin's saved state in the snapshot before the first read. */
  private async loadPluginState() {
    for (const [plugin, load] of this.stateLoaders) {
      if (!(plugin in this.stateDoc)) this.stateDoc[plugin] = await load()
    }
  }

  private ask(question: Question<SchemaInput | undefined>): Promise<unknown> {
    if (this.closing) return Promise.reject(new Error('Session closed.'))
    const questionId = `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
    return new Promise((resolve, reject) => {
      this.questions.set(questionId, {
        message: question.message,
        schema: question.schema,
        secret: question.secret === true,
        resolve,
        reject,
      })
      this.feed.publish(
        'session',
        customEvent(HARNESS_EVENTS.question, {
          questionId,
          message: question.message,
          ...(question.schema
            ? { schema: convertSchemaToJsonSchema(question.schema) }
            : {}),
          ...(question.secret ? { secret: true } : {}),
        }),
      )
    })
  }

  private pluginApi(): PluginSessionApi {
    return {
      threadId: this.threadId,
      principal: this.principal,
      snapshot: () => this.snapshot(),
      // A plugin turn always waits its turn. It cannot see a busy rejection.
      prompt: (text) => this.prompt(text, { busy: 'queue' }),
      transcript: () => this.transcript(),
      replaceTranscript: (messages) =>
        this.messages.saveThread(this.threadId, messages),
      // The public type narrows the answer from the schema.
      ask: ((question: Question<SchemaInput | undefined>) =>
        this.ask(question)) as PluginSessionApi['ask'],
      authRequired: (info) =>
        this.feed.publish(
          'session',
          customEvent(HARNESS_EVENTS.authRequired, { ...info }),
        ),
      setConfig: (key, value) => this.setConfig(key, value),
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
  ): Promise<void> {
    const inputId = createInputId()
    await this.accept(inputId, { op: 'command', name, input })
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
        session: this.services.session,
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
   * Stop every running operation, wait for them, then dispose session plugins.
   * Safe to call twice.
   */
  close(): Promise<void> {
    this.closing ??= (async () => {
      for (const turn of this.queue.splice(0)) {
        turn.operation.fail('cancelled', new Error('Session closed.'))
      }
      const running = [...this.operations.values()].filter(
        (operation) => !operation.isSettled(),
      )
      for (const operation of running) {
        operation.abortController.abort(RUN_CANCEL_REASON)
      }
      for (const question of this.questions.values()) {
        question.reject(new Error('Session closed.'))
      }
      this.questions.clear()
      await Promise.allSettled(
        running.map((operation) => Promise.resolve(operation)),
      )
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
    this.queue.push(turn)
    this.drain()
  }

  private drain(): void {
    if (this.activeTurn || this.closing) return
    const next = this.queue.shift()
    if (!next) return
    this.activeTurn = next.operation
    void this.runTurn(next).finally(() => {
      this.activeTurn = undefined
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
    tools: Array<AnyTool>,
    operation: OperationImpl<ChatTurnResult>,
  ): Promise<Array<AnyTool>> {
    let prepared = tools
    for (const { prepare, owner } of preparers) {
      try {
        prepared = [...(await prepare(prepared))]
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

  private isAbortRequested(inputId: string) {
    return (
      this.writer?.state.inputs.get(inputId)?.abortRequested === true ||
      this.abortedSteers.has(inputId)
    )
  }

  /**
   * Take the waiting steers that join now: the prefix up to the first one
   * that has an abort request, or that `turn.canJoin` refuses. A steer that
   * a join took already stays in, with no new check. Returns how many.
   */
  private async claimJoins() {
    const canJoin = this.harness.turn?.canJoin
    let count = 0
    for (const steer of this.steerQueue) {
      if (!this.joining.has(steer.inputId)) {
        if (this.isAbortRequested(steer.inputId)) break
        const candidate = { inputId: steer.inputId, message: steer.message }
        if (canJoin && !(await canJoin(candidate))) break
      }
      count += 1
    }
    // A cancel can land while canJoin runs. No await from here to the claim.
    const steers = this.steerQueue.slice(0, count)
    const late = steers.findIndex(
      (steer) =>
        !this.joining.has(steer.inputId) &&
        this.isAbortRequested(steer.inputId),
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
   * model gets the folded log when a host record changed the context.
   */
  private steering(): AnyChatMiddleware {
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
          // A retried call loads the saved transcript, so a host without a
          // log saves it before each model call when the harness can retry.
          if (!this.engine && this.harness.turn?.onModelError) {
            await this.messages.saveThread(this.threadId, list)
          }
          // Only now, so a hook or an append that fails leaves them waiting.
          this.steerQueue.splice(0, count)
          for (const steer of steers) this.join(ctx.runId, steer)
          if (list.length === config.messages.length && !synced) {
            return undefined
          }
          return { messages: synced ?? list }
        } finally {
          for (const steer of steers) this.joining.delete(steer.inputId)
        }
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
   * session's provider keys as `ctx.keys`.
   */
  private binding(
    operation: OperationImpl<unknown> | OperationImpl<ChatTurnResult>,
    captured: Array<MediaRecord>,
    runPlugins?: MountedPlugins,
  ) {
    const options = this.harness.media
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

  private async runTurn(turn: QueuedTurn): Promise<void> {
    const { operation } = turn
    operation.setStatus('running')
    if (turn.inputId) {
      try {
        await this.applied(turn.inputId, operation.id)
      } catch (error) {
        // The log refused the write, so the session stops.
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
      operation.fail('failed', error)
      this.publishFinished(operation)
      this.requeueWaitingSteers()
      return
    }
    const stopTimer = this.startTimeout(turn.inputId, operation)
    this.publishStarted(operation)

    let runPlugins: MountedPlugins | undefined
    let text = ''
    let interrupts: Array<Interrupt> | undefined
    let failure: string | undefined
    const captured: Array<MediaRecord> = []
    try {
      await this.flushNotes()
      const perRun = this.plugins.filter((plugin) => plugin.lifetime === 'run')
      if (perRun.length > 0) {
        runPlugins = await mountPlugins(perRun, {
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
      const session = this.sessionPlugins
      const bridges = [
        session?.capabilityBridge,
        runPlugins?.capabilityBridge,
      ].filter((bridge): bridge is AnyChatMiddleware => bridge !== undefined)
      // Agents the model can call: the harness's own, then the plugins'.
      const subagentList = [
        ...(this.harness.subagents?.agents ?? []),
        ...(session?.subagents ?? []),
        ...(runPlugins?.subagents ?? []),
      ]
      const picked = [
        ...(session?.adapters ?? []),
        ...(runPlugins?.adapters ?? []),
      ]
        .map((pick) => pick())
        .filter((adapter) => adapter !== undefined)
        .at(-1)
      const resolvePrompt = (prompt: string | (() => string)) =>
        typeof prompt === 'function' ? prompt() : prompt
      const staticTools = [
        ...(this.harness.tools ?? []),
        ...(session?.tools ?? []),
        ...(runPlugins?.tools ?? []),
      ]
      const discovered = await this.discoverTools(
        [...(session?.discoverers ?? []), ...(runPlugins?.discoverers ?? [])],
        new Set(staticTools.map((tool) => tool.name)),
        operation,
      )
      // Before the chat() options below: prompts may describe these tools.
      const prepared = await this.prepareTools(
        [...(session?.preparers ?? []), ...(runPlugins?.preparers ?? [])],
        [...staticTools, ...discovered],
        operation,
      )
      // A durable host gives each durableTool call its steps in the log. The
      // tools are bound here, so a middleware wrapper wraps the bound tool,
      // and again at each model call, for tools that a middleware returns.
      const { bindTool } = this
      const tools = bindTool
        ? prepared.map((tool) => bindDurable(tool, bindTool))
        : prepared
      // A keyed adapter is built for this turn with the user's key. A
      // missing key publishes `auth_required` and fails the turn.
      const adapter: AnyTextAdapter = await this.keys.adapter(
        picked ?? this.harness.adapter,
      )
      let message =
        turn.message !== undefined
          ? await this.userMessage(turn.message)
          : undefined
      let resume = turn.resume
      let parentRunId = turn.parentRunId
      const { chatPersistence, checkpoint } = this
      if (!chatPersistence || !checkpoint) {
        throw new Error('The session is not open yet.')
      }
      const durableTools = this.durableTools()
      const turnHooks = this.harness.turn
      const signal = operation.abortController.signal
      /** Retries since the last finished tool phase. */
      let retries = 0
      /** How many times `turn.beforeFinish` continued this turn. */
      let cycle = 0
      // One chat() run, and one more each time steers wait after a final
      // answer: a late join gets its answer in this turn. A run that failed
      // runs again when `turn.onModelError` answers 'retry'. A final answer
      // runs again when `turn.beforeFinish` adds to the transcript.
      for (;;) {
        let textBefore = text
        let runError: { message: string; code?: string } | undefined
        let heldError: StreamChunk | undefined
        try {
          const stream = chat({
            adapter,
            messages: message ? [message] : [],
            systemPrompts: [
              ...(this.harness.systemPrompts ?? []),
              ...[...(session?.prompts ?? []), ...(runPlugins?.prompts ?? [])]
                .map(resolvePrompt)
                .filter((prompt) => prompt !== ''),
            ],
            tools,
            middleware: [
              ...bridges,
              withPersistence(chatPersistence),
              checkpoint,
              ...(this.harness.middleware ?? []),
              ...(session?.middleware ?? []),
              ...(runPlugins?.middleware ?? []),
              ...(durableTools ? [durableTools] : []),
              this.steering(),
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
            ...(subagentList.length > 0
              ? {
                  subagents: {
                    ...this.harness.subagents,
                    agents: subagentList,
                    limits: this.limits(),
                    binding: this.binding(operation, captured, runPlugins),
                  },
                }
              : {}),
            // chat() stops after 5 model calls by default. An agent that
            // reads, searches, and calls tools needs more before it can answer.
            agentLoopStrategy:
              this.harness.agentLoopStrategy ?? maxIterations(50),
            ...(this.harness.modelOptions !== undefined
              ? { modelOptions: this.harness.modelOptions }
              : {}),
            ...(this.harness.interrupts
              ? { interrupts: this.harness.interrupts }
              : {}),
            ...(this.harness.context !== undefined
              ? { context: this.harness.context }
              : {}),
            threadId: this.threadId,
            runId: operation.id,
            ...(parentRunId ? { parentRunId } : {}),
            ...(resume ? { resume } : {}),
            abortController: operation.abortController,
            stream: true,
          } as never) as AsyncIterable<StreamChunk>

          for await (const chunk of stream) {
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
            if (
              chunk.type === EventType.RUN_FINISHED &&
              chunk.outcome?.type === 'interrupt'
            ) {
              interrupts = chunk.outcome.interrupts
            }
            if (chunk.type === EventType.RUN_ERROR) failure = chunk.message
            // A finished tool phase resets the retries, and its text stays in
            // the result. Streamed text does not reset them, so a call that
            // fails after some text still counts.
            if (chunk.type === EventType.TOOL_CALL_RESULT) {
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
          const answer =
            signal.aborted || this.logFailure
              ? undefined
              : await turnHooks.onModelError({
                  session: this,
                  operationId: operation.id,
                  ...(turn.inputId ? { inputId: turn.inputId } : {}),
                  error: runError,
                  retries,
                  signal,
                })
          if (answer === 'retry' && !signal.aborted) {
            retries += 1
            // The turn result has only the text of the calls that counted.
            text = textBefore
            operation.publish(
              customEvent(HARNESS_EVENTS.turnRetry, {
                operationId: operation.id,
                retries,
                error: runError,
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
        // Claimed, so a cancel after this check cannot leave a run with no
        // new input.
        const hasLateJoin = (await this.claimJoins()) > 0
        if (!hasLateJoin) {
          if (
            !(await this.continueBeforeFinish(operation, turn.inputId, cycle))
          ) {
            break
          }
          cycle += 1
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
      stopTimer()
      await runPlugins?.dispose().catch(() => {})
    }
    const timedOut = operation.abortController.signal.reason === TIMEOUT_REASON

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
      this.interrupted = { runId: operation.id, interrupts }
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
   * Steers a turn never reached run next, before other queued turns. A
   * steer with an abort request settles `aborted` instead.
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
    this.queue.unshift(
      ...rest.map((steer) => {
        const next = steer.operation ?? this.createTurnOperation()
        this.bindTurn(steer.inputId, next)
        return {
          operation: next,
          message: steer.message,
          inputId: steer.inputId,
        }
      }),
    )
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
   * the transcript, so the turn runs the model again.
   */
  private async continueBeforeFinish(
    operation: OperationImpl<ChatTurnResult>,
    inputId: string | undefined,
    cycle: number,
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
        (added.records?.length ?? 0) === 0)
    if (isEmpty) return false
    const max = hooks.maxFinishCycles ?? 32
    if (cycle >= max) {
      throw new Error(
        `beforeFinish continued the turn ${max} times. Return nothing from the hook when the work is done.`,
      )
    }
    return this.addToTurn(added)
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
  ): OperationImpl<unknown> {
    const name = typeof target === 'string' ? target : target.name
    const operation = new OperationImpl<unknown>(
      'agent',
      this.feed,
      (running) => this.cancel(running.id),
      name,
    )
    this.operations.set(operation.id, operation)
    void this.executeAgent(operation, target, input, options)
    return operation
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

  private async executeAgent(
    operation: OperationImpl<unknown>,
    target: string | AnyAgent,
    input: unknown,
    options: AgentStartOptions,
  ): Promise<void> {
    const name = typeof target === 'string' ? target : target.name
    const inputId = createInputId()
    await this.accept(inputId, {
      op: 'agent',
      agent: name,
      input,
      ...(options.wake ? { detached: true } : {}),
    })
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
      ...(this.principal ? { principal: { id: this.principal.id } } : {}),
    })
    operation.publish({
      type: EventType.RUN_STARTED,
      runId: operation.id,
      threadId: this.threadId,
      timestamp: Date.now(),
    })
    this.publishStarted(operation)

    let text = ''
    let result: unknown
    let failure: string | undefined
    let subagentRunId = ''
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
      const messages = await this.messages.loadThread(this.threadId)
      subagentRunId = createSubagentId()
      const stream = runAgentStream(
        agent,
        {
          input: checkedInput,
          messages: messages ?? [],
          threadId: `${this.threadId}:${name}`,
          runId: `${operation.id}:${subagentRunId}`,
          parentRunId: operation.id,
          subagentRunId,
          abortSignal: operation.abortController.signal,
        },
        undefined,
        undefined,
        // ponytail: the media of a background agent is kept and published,
        // but not written to history: its messages live in its own thread
        // (`<threadId>:<name>`). Write it to the session thread if a UI must
        // show it after a restart.
        { ...this.binding(operation, []), budget: this.codeBudget() },
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
      // A refused append stops the session. The operation still ends.
      await this.settle({
        inputId,
        operationId: operation.id,
        ...settlement,
      }).catch(() => {})
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
      await this.noteAgentEnd(name, 'failed', failure, options)
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
      await this.noteAgentEnd(name, 'finished', value, options)
      operation.finish('completed', value)
    }
    stopRunLease()
    await releaseLease?.()
    this.publishFinished(operation)
  }

  /**
   * Tell the main model how an agent ended: a transcript note (unless
   * `attach: 'none'`), and a new chat turn when `wake` is set.
   */
  private async noteAgentEnd(
    name: string,
    ended: 'finished' | 'failed',
    result: unknown,
    options: AgentStartOptions,
  ): Promise<void> {
    const note = referenceNote(name, result, ended)
    if ((options.attach ?? 'reference') === 'reference') {
      this.pendingNotes.push(note)
      if (!this.activeTurn) await this.flushNotes()
    }
    if (options.wake) {
      void this.followUp(`Background agent ${name} ${ended}: ${note}`)
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
  }): Promise<void> {
    const { operationId, inputId } = stopped
    await this.persistence.stores.runs?.update(operationId, {
      status: 'failed',
      finishedAt: Date.now(),
      error: { message: AGENT_STOPPED },
    })
    if (inputId) {
      await this.settle({
        inputId,
        operationId,
        outcome: 'failed',
        error: { message: AGENT_STOPPED },
      })
    }
    this.feed.publish(operationId, {
      type: EventType.RUN_ERROR,
      message: AGENT_STOPPED,
      timestamp: Date.now(),
    })
    this.feed.publish(
      operationId,
      customEvent(HARNESS_EVENTS.operationFinished, {
        operationId,
        status: 'failed',
      }),
    )
    await this.noteAgentEnd(stopped.agent, 'failed', AGENT_STOPPED, {
      wake: stopped.wake === true,
    })
  }

  /** Write queued agent notes to the transcript while no turn is writing it. */
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
   * tick is a duplicate too.
   */
  private async accept(
    inputId: string,
    input: HarnessInput,
  ): Promise<'new' | 'duplicate' | 'conflict'> {
    const payload = JSON.stringify(input)
    const local = this.admitted.get(inputId)
    if (local !== undefined) return local === payload ? 'duplicate' : 'conflict'
    const logged = this.writer?.state.inputs.get(inputId)
    if (logged) {
      return JSON.stringify(logged.input) === payload ? 'duplicate' : 'conflict'
    }
    this.admitted.set(inputId, payload)
    const at = Date.now()
    const principal = this.principal
      ? { principal: { id: this.principal.id } }
      : {}
    if (this.writer) {
      await this.writer.append([
        { type: 'harness.input', inputId, input, at, ...principal },
      ])
    } else {
      const stored = await this.inbox.append({
        inputId,
        threadId: this.threadId,
        input,
        createdAt: at,
        ...principal,
      })
      // The inbox had the id before this session: a restart.
      if (stored.createdAt !== at || stored.status !== 'pending') {
        return JSON.stringify(stored.input) === payload
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

  private reject(inputId: string, reason: string): void {
    if (this.writer) {
      void this.writer
        .append([{ type: 'harness.input.rejected', inputId, reason }])
        .catch(() => {})
    } else {
      void this.inbox.markRejected(inputId, reason)
    }
    this.receipts.set(inputId, { inputId, status: 'rejected', reason })
    this.feed.publish(
      'session',
      customEvent(HARNESS_EVENTS.inputRejected, { inputId, reason }),
    )
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
    if (input) return CHAT_OPS.has(input.op)
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
  private knownTurn(inputId: string, input: HarnessInput) {
    const payload = JSON.stringify(input)
    const local = this.admitted.get(inputId)
    const logged = this.writer?.state.inputs.get(inputId)
    const stored = local ?? (logged ? JSON.stringify(logged.input) : undefined)
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
    if (!newest) return
    await repairTranscript({
      messages: this.messages,
      threadId: newest.threadId,
      pending: newest.checkpoint?.pendingTools ?? [],
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
        this.admitted.set(entry.inputId, JSON.stringify(input))
        this.bindTurn(entry.inputId, operation)
        this.enqueueTurn({
          operation,
          message: input.message,
          inputId: entry.inputId,
        })
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
      },
      messages: [...writer.state.messages],
      decision,
    })
    return answer ?? decision
  }

  /**
   * Recover a durable session from its log, input by input, in admission
   * order. A chat turn whose host stopped (its run lease expired) settles
   * `aborted` when an abort was asked, settles `failed` when no attempt or no
   * time is left, settles `completed` when the log already has its final
   * answer, and else runs again as the next attempt. An agent run whose host
   * stopped settles `failed` and does not run again: it has no checkpoints.
   * An input that never ran runs now. Other inputs are rejected with
   * `expired_on_restart`.
   */
  private async recoverFromLog(writer: LogWriter): Promise<void> {
    const runs = this.persistence.stores.runs
    const maxAttempts = this.harness.durability?.maxAttempts ?? 10
    const inputs = [...writer.state.inputs.values()]
    for (const input of inputs) {
      const isChat = CHAT_OPS.has(input.input.op)
      if (input.status === 'pending') {
        if (!(isChat && 'message' in input.input)) {
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
        const operation = this.createTurnOperation()
        this.bindTurn(input.inputId, operation)
        this.enqueueTurn({
          operation,
          message: input.input.message,
          inputId: input.inputId,
        })
        continue
      }
      const isAgent = input.input.op === 'agent'
      if (input.status !== 'applied' || !(isChat || isAgent)) continue
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
      if (isAlive) continue
      if (input.input.op === 'agent') {
        // A run that ended before its settle record landed did not stop.
        if (!run || run.status === 'running') {
          await this.failStoppedAgent({
            operationId: input.operationId ?? '',
            agent: input.input.agent,
            inputId: input.inputId,
            wake: input.input.detached,
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
      const fallback: RecoverDecision = input.abortRequested
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
            : hasFinalAnswer(writer.state.messages, input.appliedAt ?? 0)
              ? { action: 'settle', outcome: 'completed' }
              : { action: 'run' }
      const decision = await this.recoverDecision(writer, input, fallback)
      if (decision.action === 'settle') {
        await ended({
          outcome: decision.outcome,
          ...(decision.error ? { error: decision.error } : {}),
        })
        continue
      }
      const started = [...writer.state.started]
        .filter(([toolCallId]) => !writer.state.toolResults.has(toolCallId))
        .map(([toolCallId, tool]) => ({ toolCallId, ...tool }))
      await repairTranscript({
        messages: this.messages,
        threadId: this.threadId,
        pending: [...(run?.checkpoint?.pendingTools ?? []), ...started],
        finished: writer.state.toolResults,
      })
      const operation = this.createTurnOperation()
      this.bindTurn(input.inputId, operation)
      this.feed.publish(
        operation.id,
        customEvent(HARNESS_EVENTS.operationResumed, {
          operationId: operation.id,
          ...(operationId ? { resumedFrom: operationId } : {}),
        }),
      )
      this.enqueueTurn({ operation, inputId: input.inputId })
    }
  }
}
