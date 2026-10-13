import {
  EventType,
  SubagentBudget,
  combineStrategies,
  maxIterations,
  untilFinishReason,
} from '@tanstack/ai'
import { credentialsFor, providerKeysFor } from '../auth'
import { AgentRegistry } from '../agents'
import { SessionFeed } from '../feed'
import { createMediaStore } from '../media'
import { LEASE } from '../resume'
import { HARNESS_EVENTS } from '../types'
import { emptyUsage } from '../usage'
import {
  DEFAULT_SUBAGENT_LIMITS,
  createMessageId,
  customEvent,
  cacheObject,
  scopeOf,
  notOpenMessages,
  tapFeed,
} from './helpers'
import type { OperationImpl } from '../operation'
import type {
  AgentLoopStrategy,
  AnyChatMiddleware,
  ModelMessage,
  ProviderKeys,
  ResolvedPromptCache,
  SchemaInput,
  StreamChunk,
} from '@tanstack/ai'
import type {
  AIPersistence,
  ChatTranscriptStores,
  InboxStore,
  MessageStore,
  SessionIndexStore,
} from '@tanstack/ai-persistence'
import type { AuthRequiredError, CredentialsAccess } from '../auth'
import type { EventFeed } from '../feed'
import type { LogWriter, RevertState, engineMessageStore } from '../log'
import type { DurableBind } from '../durable-tool'
import type { LeaseOptions } from '../resume'
import type { MediaStore } from '../media'
import type { PluginSessionApi } from '../commands'
import type { SessionUsage } from '../usage'
import type { AgentRegistryView, AnyAgent } from '../agents'
import type { AnyHarness } from '../define'
import type { HarnessPersistence, SessionIndexWriter } from '../host'
import type {
  AgentGroup,
  HarnessPlugin,
  MountedPlugins,
  PluginAgentActions,
  PluginServices,
  PluginState,
} from '../plugins'
import type {
  ChatTurnResult,
  Cursor,
  InputSettlement,
  Operation,
  Principal,
  Receipt,
  SessionEvent,
  ThreadSettings,
} from '../types'
import type {
  AgentRunOptions,
  AgentStartOptions,
  AgentChild,
  AgentHandles,
  SessionInspection,
  SessionDependencies,
  QueuedTurn,
  WaitingSteer,
  InterruptedTurn,
  AgentRunImpl,
  AgentChain,
} from './types'
import type { HarnessSession } from './harness-session'

/**
 * The fields of a {@link HarnessSession}, and the helpers every layer uses. The
 * session class is split into layers, one per file: base, inputs, state,
 * requests, turn-parts, agents, turn, harness-session.
 */
export abstract class SessionBase<THarness extends AnyHarness = AnyHarness> {
  readonly threadId: string
  /** The log of this session. Sessions with the same log id share one log. */
  readonly logId: string
  readonly agents: AgentHandles<THarness>
  /** The agents this session can run, for discovery. */
  readonly registry: AgentRegistryView

  protected readonly harness: THarness
  protected readonly persistence: HarnessPersistence
  protected readonly inbox: InboxStore
  protected readonly principal: Principal | undefined
  /** The session log writer of a durable host. It is also the feed. */
  protected writer: LogWriter | undefined
  protected feed: EventFeed
  protected readonly onEvent: (event: StreamChunk) => void
  /** The transcript: `stores.messages`, or a view of the log. */
  protected messages: MessageStore
  /**
   * What `withPersistence` gets: the chat stores, with `messages`. With
   * `sessions`, each child the model starts gets an index entry.
   */
  protected chatPersistence:
    | AIPersistence<ChatTranscriptStores & { sessions?: SessionIndexStore }>
    | undefined
  /** The message store the chat engine saves through, on a durable host. */
  protected engine: ReturnType<typeof engineMessageStore> | undefined
  /** Why the session log stopped taking writes. */
  protected logFailure: Error | undefined
  protected readonly log: SessionDependencies['log']
  /**
   * Inputs this session stored or recovered, by id, as JSON: the duplicate
   * check. `recover()` skips them.
   */
  protected readonly admitted = new Map<string, string>()
  /** The receipt of each chat input this session answered, by input id. */
  protected readonly receipts = new Map<string, Receipt>()
  /** The turn operation of each chat input, by input id. */
  protected readonly turnOperations = new Map<
    string,
    OperationImpl<ChatTurnResult>
  >()
  /** The input of each turn operation, by operation id. */
  protected readonly operationInputs = new Map<string, string>()
  /** The inputs that joined each turn, by operation id. */
  protected readonly turnJoins = new Map<string, Array<string>>()
  /** How the chat inputs of this session ended, for `settled()`. */
  protected readonly settlements = new Map<string, InputSettlement>()
  protected readonly agentRegistry = new AgentRegistry()
  protected readonly operations = new Map<string, OperationImpl<unknown>>()
  /** The agent chains of this session, by the input id of the first run. */
  protected readonly agentChains = new Map<string, AgentChain>()
  /** The chain of each agent run operation, by operation id. */
  protected readonly chainOf = new Map<string, AgentChain>()
  protected readonly queue: Array<QueuedTurn> = []
  protected readonly steerQueue: Array<WaitingSteer> = []
  /**
   * Waiting steers with an abort request. An id lands here before the abort
   * append, so a join that runs during that append skips the steer.
   */
  protected readonly abortedSteers = new Set<string>()
  /** The ids of the waiting steers that a join took. A cancel of one is refused. */
  protected readonly joining = new Set<string>()
  /** Notes that wait for the transcript. A durable host logged each one. */
  protected readonly pendingNotes: Array<ModelMessage> = []
  /** Background jobs that run on this host. Recovery skips them. */
  protected readonly jobs = new Set<string>()
  /** Running tool calls that support `detach`: id to the move. */
  protected readonly detachable = new Map<string, () => void>()
  protected activeTurn: OperationImpl<ChatTurnResult> | undefined
  /** Renews this host's claim on the thread while the thread has work. */
  protected claimTimer: ReturnType<typeof setInterval> | undefined
  /** The claim write of the last `markBusy`. An input waits for it. */
  protected claimWrite: Promise<void> = Promise.resolve()
  /** Called each time the thread goes idle. See `onIdle`. */
  protected readonly idleListeners = new Set<() => void>()
  /** Work inputs that are being stored and are not queued yet. */
  protected inputsInFlight = 0
  /** Who sent the input of the running turn. */
  protected turnPrincipal: Principal | undefined
  /**
   * The last turn stopped for these interrupts. `routed`: a routed turn
   * stopped. The resolve continues its saved plan. `stores.metadata` keeps a
   * copy, so a resolve after a restart continues the turn too.
   */
  protected interrupted: InterruptedTurn | undefined
  /** The usage totals of a host without a log. A durable host folds the log. */
  protected usageTotals: SessionUsage = emptyUsage()
  /** Saves of `usageTotals` to `stores.metadata`, one after the other. */
  protected usageSaved: Promise<unknown> = Promise.resolve()
  protected activeResume = false
  protected plugins: ReadonlyArray<HarnessPlugin> = []
  protected sessionPlugins: MountedPlugins | undefined
  /** The last `reload()`. The calls run one at a time. */
  protected reloads: Promise<void> = Promise.resolve()
  /**
   * The reloads and reverts that run. No new turn starts while one runs: a
   * reload waits for the running turn, and a revert changes the files.
   */
  protected holdTurns = 0
  /** Called when the running turn ends. A reload waits for it. */
  protected readonly turnEnds = new Set<() => void>()
  protected closing: Promise<void> | undefined
  /** Aborts on close, not on a reload. See {@link SessionSignal}. */
  protected readonly lifetime = new AbortController()
  /** The last `recover()`. The calls run one at a time. */
  protected recovery: Promise<void> = Promise.resolve()
  protected readonly onClose: () => void
  protected checkpoint: AnyChatMiddleware | undefined
  /** Gives each durable tool call its steps in the log. One per session. */
  protected bindTool: DurableBind | undefined
  protected readonly hostId: string
  protected readonly index: SessionIndexWriter
  protected readonly lease: LeaseOptions | undefined
  protected readonly listeners = new Map<
    string,
    Set<(value: unknown) => void>
  >()
  protected readonly configValues = new Map<string, unknown>()
  /** The stored settings of this thread: `session.configure`. */
  protected threadSettings: ThreadSettings = {}
  protected readonly questions = new Map<
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
  protected readonly stateDoc: Record<string, unknown> = {}
  /** Reads each plugin's saved state, so the first snapshot has it. */
  protected readonly stateLoaders = new Map<string, () => Promise<unknown>>()
  protected readonly localState = new Map<string, unknown>()
  /** The revert that stands. See `revert`. */
  protected reverted: RevertState | undefined
  /** The credentials of the running turn's sender, else of the session's principal. */
  protected readonly credentialAccess: CredentialsAccess
  /**
   * The connectors whose sign-in the user cancelled. Their `require` with
   * `wait` fails the tool, as without `wait`, until the next new turn.
   */
  protected readonly declinedSignIns = new Set<string>()
  /**
   * Model provider keys of the same principal as `credentialAccess`: saved
   * with `/connect <provider>`, else the env var.
   */
  protected readonly keys: ProviderKeys
  /**
   * The credentials of one principal: the user who runs a command, or an
   * agent that outlives a turn. A save there can answer that user's sign-ins.
   */
  protected readonly credentialsOf: (
    principal: Principal | undefined,
  ) => CredentialsAccess
  /** The provider keys of one principal, for an agent that outlives a turn. */
  protected readonly keysOf: (principal: Principal | undefined) => ProviderKeys
  protected readonly services: PluginServices
  protected readonly media: SessionDependencies['media']
  protected readonly mediaStore: MediaStore
  /** The prompt cache of every chat turn of this session. */
  protected readonly promptCache: ResolvedPromptCache

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
      sessionWith: (metadataSchema) =>
        this.pluginApi(undefined, metadataSchema),
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

  /** An operation of this session by id, running or settled. */
  operation(id: string): Operation<unknown> | undefined {
    return this.operations.get(id)
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

  protected configValue(key: string): unknown {
    if (this.configValues.has(key)) return this.configValues.get(key)
    return this.sessionPlugins?.config.get(key)?.option.default
  }

  /** Put each plugin's saved state in the snapshot before the first read. */
  protected async loadPluginState() {
    for (const [plugin, load] of this.stateLoaders) {
      if (!(plugin in this.stateDoc)) this.stateDoc[plugin] = await load()
    }
  }

  /**
   * Who sent the input of the running turn, else the principal that opened
   * the session. Turns run one at a time, so one value is enough.
   */
  protected sender(): Principal | undefined {
    return this.turnPrincipal ?? this.principal
  }

  protected emitPluginEvent(
    plugin: string,
    name: string,
    value: unknown,
  ): void {
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

  protected pluginState<T>(plugin: string, initial: T): PluginState<T> {
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

  /**
   * The thread has work: claim it in `stores.workClaims` for this host, and
   * renew the claim while the work runs, so a sweep finds the thread after a
   * crash. A claim that another host holds is left alone: the log still keeps
   * one writer. A closing session claims nothing.
   */
  protected markBusy(): void {
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

  protected stopClaimTimer(): void {
    if (this.claimTimer) clearInterval(this.claimTimer)
    this.claimTimer = undefined
  }

  /** Give the thread's claim back. A failed write is a warning. */
  protected async releaseClaim(): Promise<void> {
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
  protected warnClaim(error: unknown): void {
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
  protected isIdle(): boolean {
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
  protected async admitting<T>(work: () => Promise<T>) {
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
  protected checkIdle(): void {
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

  protected warn(
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
   * A tree budget for a child started from code. The child counts as the
   * first call, and its own children count against the same limits.
   */
  protected codeBudget(): SubagentBudget {
    const root = SubagentBudget.root(this.limits())
    root.reserve(0)
    return root.child()
  }

  // ===========================
  // Agents
  // ===========================

  /** The limits for children of this session, with the harness defaults. */
  /**
   * chat() stops after 5 model calls by default. An agent that reads,
   * searches, and calls tools needs more before it can answer. Without
   * `durability.truncatedToolResult`, an answer cut at the output limit ends
   * the turn. With it, the model gets that text for each cut call and is
   * called again.
   */
  protected loopStrategy(): AgentLoopStrategy {
    const strategy = this.harness.agentLoopStrategy ?? maxIterations(50)
    return this.harness.durability?.truncatedToolResult === undefined
      ? combineStrategies([strategy, untilFinishReason(['length'])])
      : strategy
  }

  protected limits() {
    return this.harness.subagents?.limits ?? DEFAULT_SUBAGENT_LIMITS
  }

  /**
   * Add an assistant note to the transcript: at once when no turn runs, else
   * before the next turn starts.
   */
  protected async addNote(note: string) {
    const id = createMessageId()
    this.pendingNotes.push({ id, role: 'assistant', content: note })
    // A durable host logs the note first, so a crash does not lose it.
    await this.writer?.append([{ type: 'harness.note', noteId: id, note }])
    // While a revert stands, a note waits: the next turn or unrevert adds it.
    if (!this.activeTurn && !this.reverted) await this.flushNotes()
  }

  /** Write queued notes to the transcript while no turn is writing it. */
  protected async flushNotes(): Promise<void> {
    const messages = this.messages
    if (this.pendingNotes.length === 0) return
    const notes = this.pendingNotes.splice(0)
    const history = await messages.loadThread(this.threadId)
    await messages.saveThread(this.threadId, [...history, ...notes])
  }

  /**
   * Track a background job of this host. A durable host also logs its start
   * and end, so recovery can note a job that a crash stopped.
   */
  protected logJob(jobId: string, ended: boolean) {
    if (ended) this.jobs.delete(jobId)
    else this.jobs.add(jobId)
    // No one waits for a job record. A failed log write fails the session.
    this.writer
      ?.append([{ type: 'harness.job', jobId, ended }])
      .catch(() => undefined)
  }

  // Implemented by a later layer of the class.
  protected abstract self(): HarnessSession<THarness>
  protected abstract drain(): void
  protected abstract agentGroup<T>(
    options: { onFailure?: 'cancel-siblings' | 'collect' },
    body: (group: AgentGroup) => Promise<T>,
  ): Promise<T>
  protected abstract pluginApi(
    principal?: Principal,
    metadataSchema?: SchemaInput,
  ): PluginSessionApi
  protected abstract resumeSignIns(): Promise<void>
  protected abstract runAgent(
    target: string | AnyAgent,
    input: unknown,
    options: AgentStartOptions,
    parent?: AgentChain,
    child?: AgentChild,
  ): AgentRunImpl
}
