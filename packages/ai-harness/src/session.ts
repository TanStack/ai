import {
  EventType,
  RUN_CANCEL_REASON,
  chat,
  compactForModel,
  convertSchemaToJsonSchema,
  createSubagentId,
  runAgentStream,
  validateWithStandardSchema,
} from '@tanstack/ai'
import { credentialsFor } from './auth'
import { checkConfigValue } from './config'
import { withPersistence } from '@tanstack/ai-persistence'
import { AgentRegistry } from './agents'
import { SessionFeed } from './feed'
import { OperationImpl } from './operation'
import { mountPlugins } from './plugins'
import {
  checkpointMiddleware,
  findCrashedRuns,
  repairTranscript,
} from './resume'
import { HARNESS_EVENTS } from './types'
import type {
  AnyChatMiddleware,
  Interrupt,
  ModelMessage,
  RunAgentResumeItem,
  SchemaInput,
  StreamChunk,
  SubagentBinding,
} from '@tanstack/ai'
import type {
  CredentialStore,
  InboxEntry,
  InboxStore,
} from '@tanstack/ai-persistence'
import type { CredentialsAccess } from './auth'
import type { PluginSessionApi, Question } from './commands'
import type { ConfigOption } from './config'
import type {
  AgentInputOf,
  AgentRegistryView,
  AgentResultOf,
  AnyAgent,
} from './agents'
import type { AnyHarness, HarnessAgentsOf } from './define'
import type { HarnessPersistence } from './host'
import type {
  HarnessPlugin,
  MountedPlugins,
  PluginServices,
  PluginState,
} from './plugins'
import type {
  BusyPolicy,
  ChatTurnResult,
  Cursor,
  HarnessInput,
  Operation,
  Principal,
  Receipt,
  SessionEvent,
  UserInput,
} from './types'

/** Options for running an agent from code. */
export interface AgentRunOptions {
  /**
   * How the main model learns about the result on its next turn:
   * `'reference'` (default) adds a short note to the transcript, `'none'` adds
   * nothing.
   */
  attach?: 'reference' | 'none'
}

/** Options for starting an agent in the background. */
export interface AgentStartOptions extends AgentRunOptions {
  /** When the agent finishes, start a new chat turn with its result. */
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
  }>
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

/** What the host hands a new session. */
export interface SessionDependencies {
  harness: AnyHarness
  threadId: string
  persistence: HarnessPersistence
  inbox: InboxStore
  credentials: CredentialStore
  principal?: Principal
  /** Identifies this host on run leases. */
  hostId: string
  onClose: () => void
}

interface QueuedTurn {
  operation: OperationImpl<ChatTurnResult>
  message?: UserInput
  resume?: Array<RunAgentResumeItem>
  parentRunId?: string
  inputId?: string
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

/** A short transcript note about an agent result, for the next turn. */
function referenceNote(agent: string, result: unknown): string {
  const body =
    typeof result === 'string'
      ? result
      : JSON.stringify(compactForModel(result))
  const clipped = body.length > 2000 ? `${body.slice(0, 2000)}...` : body
  return `[${agent} finished] ${clipped}`
}

/**
 * A live harness session: one conversation (`threadId`) with its plugins,
 * operations, inbox, and event stream. Open one with `host.open()`.
 */
export class HarnessSession<THarness extends AnyHarness = AnyHarness> {
  readonly threadId: string
  readonly agents: AgentHandles<THarness>
  /** The agents this session can run, for discovery. */
  readonly registry: AgentRegistryView

  private readonly harness: THarness
  private readonly persistence: HarnessPersistence
  private readonly inbox: InboxStore
  private readonly principal: Principal | undefined
  private readonly feed = new SessionFeed()
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
  private readonly pendingNotes: Array<string> = []
  private activeTurn: OperationImpl<ChatTurnResult> | undefined
  private interrupted:
    | { runId: string; interrupts: Array<Interrupt> }
    | undefined
  private plugins: ReadonlyArray<HarnessPlugin> = []
  private sessionPlugins: MountedPlugins | undefined
  private closing: Promise<void> | undefined
  private readonly onClose: () => void
  private readonly checkpoint: AnyChatMiddleware
  private readonly listeners = new Map<string, Set<(value: unknown) => void>>()
  private readonly configValues = new Map<string, unknown>()
  private readonly questions = new Map<
    string,
    {
      message: string
      schema: SchemaInput | undefined
      resolve: (value: unknown) => void
      reject: (error: unknown) => void
    }
  >()
  private readonly stateDoc: Record<string, unknown> = {}
  private readonly localState = new Map<string, unknown>()
  private readonly credentialAccess: CredentialsAccess
  private readonly services: PluginServices

  constructor(deps: SessionDependencies) {
    this.harness = deps.harness as THarness
    this.threadId = deps.threadId
    this.persistence = deps.persistence
    this.inbox = deps.inbox
    this.principal = deps.principal
    this.onClose = deps.onClose
    this.checkpoint = checkpointMiddleware(deps.persistence, deps.hostId)
    this.credentialAccess = credentialsFor(
      deps.credentials,
      {
        threadId: deps.threadId,
        ...(deps.principal ? { userId: deps.principal.id } : {}),
      },
      (error) =>
        this.feed.publish(
          'session',
          customEvent(HARNESS_EVENTS.authRequired, {
            connector: error.connector,
            ...(error.url ? { url: error.url } : {}),
          }),
        ),
    )
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
      session: this.pluginApi(),
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
    await this.recoverCrashedTurn()
    await this.recoverInbox()
  }

  // ===========================
  // Inputs
  // ===========================

  /** Start a chat turn, or queue it while one runs (see `busy`). */
  prompt(
    message: UserInput,
    options?: { busy?: BusyPolicy },
  ): Operation<ChatTurnResult> {
    const busy = options?.busy ?? this.harness.busy ?? 'queue'
    const inputId = createInputId()
    const operation = this.createTurnOperation()
    void this.accept(inputId, { op: 'prompt', message, busy }).then(() => {
      if (this.activeTurn && busy === 'reject') {
        this.reject(inputId, 'busy')
        operation.fail('failed', new Error('A chat turn is already running.'))
        return
      }
      if (this.activeTurn && busy === 'steer') {
        this.steerQueue.push({ inputId, message, operation })
        return
      }
      this.enqueueTurn({ operation, message, inputId })
    })
    return operation
  }

  /** Add a message to the running turn at its next model call. */
  async steer(message: UserInput): Promise<Receipt> {
    const inputId = createInputId()
    await this.accept(inputId, { op: 'steer', message })
    if (!this.activeTurn) {
      const operation = this.createTurnOperation()
      this.enqueueTurn({ operation, message, inputId })
      return { inputId, status: 'accepted', operationId: operation.id }
    }
    this.steerQueue.push({ inputId, message })
    return { inputId, status: 'accepted', operationId: this.activeTurn.id }
  }

  /** Run a turn after the current work settles. */
  async followUp(message: UserInput): Promise<Receipt> {
    const inputId = createInputId()
    await this.accept(inputId, { op: 'followUp', message })
    const operation = this.createTurnOperation()
    const status =
      this.activeTurn || this.queue.length > 0 ? 'queued' : 'accepted'
    this.enqueueTurn({ operation, message, inputId })
    return { inputId, status, operationId: operation.id }
  }

  /**
   * Answer the interrupts of the last turn. One resume must answer every open
   * interrupt of that turn (the AG-UI rule).
   */
  async resolve(resume: Array<RunAgentResumeItem>): Promise<Receipt> {
    const inputId = createInputId()
    await this.accept(inputId, { op: 'resolve', resume })
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
    this.enqueueTurn({ operation, resume, parentRunId, inputId })
    return { inputId, status: 'accepted', operationId: operation.id }
  }

  /** Cancel one operation, or the running chat turn. */
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
    const queued = this.queue.findIndex((turn) => turn.operation === target)
    if (queued >= 0) {
      this.queue.splice(queued, 1)
      target.fail('cancelled', new Error('Cancelled before it started.'))
      this.publishFinished(target)
    } else {
      target.abortController.abort(RUN_CANCEL_REASON)
    }
    await this.inbox.markApplied(inputId, target.id)
    return { inputId, status: 'accepted', operationId: target.id }
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
      queuedTurns: this.queue.length,
      pendingInterrupts: this.interrupted?.interrupts ?? [],
      pendingQuestions: [...this.questions.entries()].map(
        ([questionId, question]) => ({
          questionId,
          message: question.message,
          ...(question.schema
            ? { schema: convertSchemaToJsonSchema(question.schema) }
            : {}),
        }),
      ),
      cursor: this.feed.head(),
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
    await this.accept(inputId, { op: 'answer', questionId, value })
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

  private ask(question: Question<SchemaInput | undefined>): Promise<unknown> {
    if (this.closing) return Promise.reject(new Error('Session closed.'))
    const questionId = `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
    return new Promise((resolve, reject) => {
      this.questions.set(questionId, {
        message: question.message,
        schema: question.schema,
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
        }),
      )
    })
  }

  private pluginApi(): PluginSessionApi {
    return {
      threadId: this.threadId,
      principal: this.principal,
      snapshot: () => this.snapshot(),
      prompt: (text) => {
        this.prompt(text).then(
          () => {},
          () => {},
        )
      },
      transcript: async () => [
        ...(await this.persistence.stores.messages.loadThread(this.threadId)),
      ],
      replaceTranscript: (messages) =>
        this.persistence.stores.messages.saveThread(this.threadId, messages),
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

  private createTurnOperation(): OperationImpl<ChatTurnResult> {
    const operation = new OperationImpl<ChatTurnResult>(
      'chat',
      this.feed,
      (target) => this.cancel(target.id),
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

  /** Middleware that adds queued steer messages before each model call. */
  private steering(): AnyChatMiddleware {
    return {
      name: 'harness:steering',
      onConfig: (ctx, config) => {
        if (ctx.phase !== 'beforeModel' || this.steerQueue.length === 0) {
          return undefined
        }
        const steers = this.steerQueue.splice(0)
        const running = this.activeTurn
        for (const steer of steers) {
          // A prompt that joined the running turn settles with that turn.
          if (steer.operation && running) {
            const joined = steer.operation
            this.operations.delete(joined.id)
            running.then(
              (result) => joined.finish('completed', result),
              (error: unknown) => joined.fail('failed', error),
            )
          }
          void this.inbox.markApplied(steer.inputId, ctx.runId)
          this.feed.publish(
            ctx.runId,
            customEvent(HARNESS_EVENTS.inputApplied, {
              inputId: steer.inputId,
              operationId: ctx.runId,
            }),
          )
        }
        return {
          messages: [
            ...config.messages,
            ...steers.map(
              (steer): ModelMessage => ({
                id: createMessageId(),
                role: 'user',
                content: steer.message,
              }),
            ),
          ],
        }
      },
    }
  }

  private binding(): SubagentBinding {
    return {
      generationMiddleware: this.sessionPlugins?.generationMiddleware ?? [],
    }
  }

  private async runTurn(turn: QueuedTurn): Promise<void> {
    const { operation } = turn
    operation.setStatus('running')
    if (turn.inputId) await this.applied(turn.inputId, operation.id)
    this.publishStarted(operation)

    let runPlugins: MountedPlugins | undefined
    let text = ''
    let interrupts: Array<Interrupt> | undefined
    let failure: string | undefined
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
      const subagents = this.harness.subagents
      const picked = [
        ...(session?.adapters ?? []),
        ...(runPlugins?.adapters ?? []),
      ]
        .map((pick) => pick())
        .filter((adapter) => adapter !== undefined)
        .at(-1)
      const resolvePrompt = (prompt: string | (() => string)) =>
        typeof prompt === 'function' ? prompt() : prompt
      const stream = chat({
        adapter: picked ?? this.harness.adapter,
        messages:
          turn.message !== undefined
            ? [{ id: createMessageId(), role: 'user', content: turn.message }]
            : [],
        systemPrompts: [
          ...(this.harness.systemPrompts ?? []),
          ...[...(session?.prompts ?? []), ...(runPlugins?.prompts ?? [])]
            .map(resolvePrompt)
            .filter((prompt) => prompt !== ''),
        ],
        tools: [
          ...(this.harness.tools ?? []),
          ...(session?.tools ?? []),
          ...(runPlugins?.tools ?? []),
        ],
        middleware: [
          ...bridges,
          withPersistence(this.persistence),
          this.checkpoint,
          ...(this.harness.middleware ?? []),
          ...(session?.middleware ?? []),
          ...(runPlugins?.middleware ?? []),
          this.steering(),
        ],
        ...(subagents
          ? { subagents: { ...subagents, binding: this.binding() } }
          : {}),
        ...(this.harness.agentLoopStrategy
          ? { agentLoopStrategy: this.harness.agentLoopStrategy }
          : {}),
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
        ...(turn.parentRunId ? { parentRunId: turn.parentRunId } : {}),
        ...(turn.resume ? { resume: turn.resume } : {}),
        abortController: operation.abortController,
        stream: true,
      } as never) as AsyncIterable<StreamChunk>

      for await (const chunk of stream) {
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
      }
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error)
      if (!operation.abortController.signal.aborted) {
        operation.publish({
          type: EventType.RUN_ERROR,
          message: failure,
          timestamp: Date.now(),
        })
      }
    } finally {
      await runPlugins?.dispose().catch(() => {})
    }

    if (operation.abortController.signal.aborted) {
      operation.fail('cancelled', new Error('Cancelled.'))
    } else if (failure !== undefined) {
      operation.fail('failed', new Error(failure))
    } else if (interrupts && interrupts.length > 0) {
      this.interrupted = { runId: operation.id, interrupts }
      operation.finish('interrupted', { text, interrupts })
    } else {
      operation.finish('completed', { text })
    }
    this.publishFinished(operation)
    // Steers the turn never reached run next, before other queued turns.
    this.queue.unshift(
      ...this.steerQueue.splice(0).map((steer) => ({
        operation: steer.operation ?? this.createTurnOperation(),
        message: steer.message,
        inputId: steer.inputId,
      })),
    )
  }

  // ===========================
  // Agents
  // ===========================

  private runAgent(
    name: string,
    input: unknown,
    options: AgentStartOptions,
  ): OperationImpl<unknown> {
    const operation = new OperationImpl<unknown>(
      'agent',
      this.feed,
      (target) => this.cancel(target.id),
      name,
    )
    this.operations.set(operation.id, operation)
    void this.executeAgent(operation, name, input, options)
    return operation
  }

  private async executeAgent(
    operation: OperationImpl<unknown>,
    name: string,
    input: unknown,
    options: AgentStartOptions,
  ): Promise<void> {
    const inputId = createInputId()
    await this.accept(inputId, {
      op: 'agent',
      agent: name,
      input,
      ...(options.wake ? { detached: true } : {}),
    })
    const agent: AnyAgent | undefined = this.agentRegistry.get(name)
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
    try {
      const messages = await this.persistence.stores.messages?.loadThread(
        this.threadId,
      )
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
        this.binding(),
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
    if (operation.abortController.signal.aborted) {
      operation.publish({
        type: EventType.RUN_FINISHED,
        runId: operation.id,
        threadId: this.threadId,
        outcome: { type: 'cancelled' },
        timestamp: Date.now(),
      } as StreamChunk)
      await runs?.update(operation.id, {
        status: 'aborted',
        finishedAt: Date.now(),
      })
      operation.fail('cancelled', new Error('Cancelled.'))
    } else if (failure !== undefined) {
      operation.publish({
        type: EventType.RUN_ERROR,
        message: failure,
        timestamp: Date.now(),
      })
      await runs?.update(operation.id, {
        status: 'failed',
        finishedAt: Date.now(),
        error: { message: failure },
      })
      operation.fail('failed', new Error(failure))
    } else {
      operation.publish({
        type: EventType.RUN_FINISHED,
        runId: operation.id,
        threadId: this.threadId,
        result: value,
        timestamp: Date.now(),
      } as StreamChunk)
      await runs?.update(operation.id, {
        status: 'completed',
        finishedAt: Date.now(),
        result: compactForModel(value),
      })
      if ((options.attach ?? 'reference') === 'reference') {
        this.pendingNotes.push(referenceNote(name, value))
        if (!this.activeTurn) await this.flushNotes()
      }
      operation.finish('completed', value)
      if (options.wake) {
        void this.followUp(
          `Background agent ${name} finished: ${referenceNote(name, value)}`,
        )
      }
    }
    this.publishFinished(operation)
  }

  /** Write queued agent notes to the transcript while no turn is writing it. */
  private async flushNotes(): Promise<void> {
    const messages = this.persistence.stores.messages
    if (!messages || this.pendingNotes.length === 0) return
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

  private async accept(inputId: string, input: HarnessInput): Promise<void> {
    await this.inbox.append({
      inputId,
      threadId: this.threadId,
      input,
      createdAt: Date.now(),
      ...(this.principal ? { principal: { id: this.principal.id } } : {}),
    })
    this.feed.publish(
      'session',
      customEvent(HARNESS_EVENTS.inputAccepted, { inputId, op: input.op }),
    )
  }

  private async applied(inputId: string, operationId: string): Promise<void> {
    await this.inbox.markApplied(inputId, operationId)
    this.feed.publish(
      operationId,
      customEvent(HARNESS_EVENTS.inputApplied, { inputId, operationId }),
    )
  }

  private reject(inputId: string, reason: string): void {
    void this.inbox.markRejected(inputId, reason)
    this.feed.publish(
      'session',
      customEvent(HARNESS_EVENTS.inputRejected, { inputId, reason }),
    )
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
   * crashed turns are marked failed.
   */
  private async recoverCrashedTurn(): Promise<void> {
    const crashed = await findCrashedRuns(this.persistence, this.threadId)
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
    await repairTranscript(this.persistence, newest)
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
}
