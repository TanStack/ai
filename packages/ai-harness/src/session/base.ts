import {
  EventType,
  SubagentBudget,
  combineStrategies,
  maxIterations,
  untilFinishReason,
} from '@tanstack/ai'
import { credentialsFor, providerKeysFor, scrubSecrets } from '../auth'
import { AgentRegistry } from '../agents'
import {
  SessionFeed,
  onAuthRequiredOf,
  onEventOf,
  onMediaOf,
  onQuestionOf,
  onUsageOf,
} from '../feed'
import { createMediaStore } from '../media'
import { logIdOf } from '../log'
import { tenantStores } from '../tenant-stores'
import { SESSION_PLUGIN_CREDENTIALS, SESSION_PLUGIN_KEYS } from '../plugins'
import { LEASE } from '../resume'
import { HARNESS_EVENTS } from '../types'
import { emptyUsage } from '../usage'
import {
  DEFAULT_SUBAGENT_LIMITS,
  createMessageId,
  customEvent,
  cacheObject,
  dropOldest,
  scopeOf,
  storedPrincipal,
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
  InboxEntry,
  InboxStore,
  MessageStore,
  RunStore,
  SessionIndexKey,
  SessionIndexStore,
} from '@tanstack/ai-persistence'
import type { AuthRequiredError, CredentialsAccess } from '../auth'
import type { EventListener, ListenedFeed } from '../feed'
import type { LogWriter, RevertState, engineMessageStore } from '../log'
import type { DurableBind } from '../durable-tool'
import type { LeaseOptions } from '../resume'
import type { MediaStore } from '../media'
import type { PluginSessionApi } from '../commands'
import type { SessionUsage } from '../usage'
import type { AgentRegistryView, AnyAgent } from '../agents'
import type { AnyHarness } from '../define'
import type { SessionIndexWriter } from '../host'
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
  HarnessInput,
  InputSettlement,
  OnEvent,
  Operation,
  Principal,
  Receipt,
  RunContext,
  SessionEvent,
  ThreadSettings,
  SendOptions,
  TurnInfo,
} from '../types'
import type {
  AgentRunOptions,
  AgentStartOptions,
  AgentChild,
  AgentHandles,
  DynamicAgentHandle,
  SessionInspection,
  SessionDependencies,
  QueuedTurn,
  ResolveForRunOptions,
  WaitingSteer,
  InterruptedTurn,
  AgentRunImpl,
  AgentChain,
} from './types'
import type { HarnessSession } from './harness-session'

/**
 * What a session keeps for its inputs, by input id: the duplicate check, the
 * receipt, the settlement, the turn operation, and the inputs that joined an
 * operation. An input goes as one piece, so no map keeps a part of it.
 *
 * - A chat turn input goes with its operation, when that operation falls out
 *   of the window of settled operations.
 * - Every other input (an agent run, a message to one, a command, a cancel, a
 *   setting) joins its own window of the same size when it ends. So these
 *   inputs never push a turn out.
 */
// ponytail: after its window, `settled()` and a duplicate input fall back to
// the log (a durable host) or the inbox. An input whose work stops on a
// failed store write, and never ends, stays until the session closes.
export class InputRecords {
  /**
   * The input and its sender as JSON, by input id: the duplicate check.
   * `recover()` skips these inputs.
   */
  readonly admitted = new Map<string, string>()
  /** The inputs that joined each turn or agent run, by operation id. */
  readonly turnJoins = new Map<string, Array<string>>()
  /** The receipt of each chat input this session answered, by input id. */
  private readonly receipts = new Map<string, Receipt>()
  /** How the inputs of this session ended, for `settled()`, by input id. */
  private readonly settlements = new Map<string, InputSettlement>()
  private readonly turns = new Map<string, OperationImpl<ChatTurnResult>>()
  private readonly inputOf = new Map<string, string>()
  /** The turn operation of each chat input, by input id. See `bind`. */
  readonly turnOperations: ReadonlyMap<string, OperationImpl<ChatTurnResult>> =
    this.turns
  /** The input of each turn operation, by operation id. See `bind`. */
  readonly operationInputs: ReadonlyMap<string, string> = this.inputOf
  /** The inputs that ended and have no turn operation, oldest first. */
  private readonly ended = new Set<string>()
  private readonly limit: number

  /** `limit`: how many ended inputs with no turn operation to keep. */
  constructor(limit: number) {
    this.limit = limit
  }

  /** Link a turn operation and its input. The input then goes with it. */
  bind(inputId: string, operation: OperationImpl<ChatTurnResult>) {
    this.turns.set(inputId, operation)
    this.inputOf.set(operation.id, inputId)
    this.ended.delete(inputId)
  }

  receipt(inputId: string) {
    return this.receipts.get(inputId)
  }

  settlement(inputId: string) {
    return this.settlements.get(inputId)
  }

  /** Keep the receipt of a chat input, for a duplicate. A refusal ends it. */
  keep(receipt: Receipt) {
    this.receipts.set(receipt.inputId, receipt)
    if (receipt.status === 'rejected') this.end(receipt.inputId)
    return receipt
  }

  /**
   * The session refused the input. It leaves the duplicate check: the store
   * has it, so a retry with its id is still a duplicate.
   */
  reject(receipt: Receipt) {
    this.admitted.delete(receipt.inputId)
    return this.keep(receipt)
  }

  /** The input ended with `settlement`. */
  settle(settlement: InputSettlement) {
    const { inputId } = settlement
    // A turn input leaves the duplicate check with its operation: a client
    // may send its id again until then. Other inputs leave now.
    if (!this.turns.has(inputId)) this.admitted.delete(inputId)
    this.settlements.set(inputId, settlement)
    this.end(inputId)
  }

  /**
   * The input ended. One with no turn operation goes to the end of the
   * window of ended inputs, and the oldest past the window are forgotten.
   */
  end(inputId: string) {
    if (this.turns.has(inputId)) return
    // A command ends when it is stored, and again when it settles.
    this.ended.delete(inputId)
    this.ended.add(inputId)
    for (const old of dropOldest(this.ended, this.limit)) this.forget(old)
  }

  /** Forget what is kept for the settled operation `operationId`. */
  forgetOperation(operationId: string) {
    this.turnJoins.delete(operationId)
    const inputId = this.inputOf.get(operationId)
    this.inputOf.delete(operationId)
    // A newer operation of the input (a steer that runs as its own turn)
    // keeps it.
    if (inputId === undefined || this.turns.get(inputId)?.id !== operationId) {
      return
    }
    this.turns.delete(inputId)
    this.forget(inputId)
  }

  private forget(inputId: string) {
    this.admitted.delete(inputId)
    this.receipts.delete(inputId)
    this.settlements.delete(inputId)
    this.ended.delete(inputId)
  }
}

/**
 * The fields of a {@link HarnessSession}, and the helpers every layer uses. The
 * session class is split into layers, one per file: base, inputs, state,
 * requests, turn-parts, agents, turn, harness-session.
 */
/** How often the owner of a thread reads `stores.inbox`. */
const INBOX_POLL_MS = 1_000

export abstract class SessionBase<THarness extends AnyHarness = AnyHarness> {
  readonly threadId: string
  /** The log of this session. Sessions with the same log id share one log. */
  readonly logId: string
  readonly agents: AgentHandles<THarness>
  /** The agents this session can run, for discovery. */
  readonly registry: AgentRegistryView

  protected readonly harness: THarness
  /** The tenant of this session: the tenant of the principal that opened it. */
  protected readonly tenantId: string | undefined
  /** The id of the log of this session in the store, with the tenant. */
  protected readonly storeLogId: string
  /**
   * The key of this thread in the stores that the session keys by thread
   * id: the tenant and the thread id, from `logIdOf`. The metadata rows, the
   * inbox, the work claims, and the leases use it. `persistence` gives the
   * messages, runs, and interrupts in the tenant already.
   */
  protected readonly storeThreadId: string
  /** The key of the session index entry of this thread. */
  protected readonly indexKey: SessionIndexKey
  /**
   * The stores of the host. Its messages, runs, and interrupts are in the
   * tenant of this session (see `tenantStores`): they take the thread id of
   * the app.
   */
  protected readonly persistence: AIPersistence
  /**
   * The run store of the host, in all tenants. A run id is one key for all
   * tenants, so the check of a client run id reads this one.
   */
  protected readonly hostRuns: RunStore | undefined
  protected readonly inbox: InboxStore
  protected readonly principal: Principal | undefined
  /** The owner of the index entry, once the session read it. */
  protected owner: Principal | undefined
  /** The session log writer of a durable host. It is also the feed. */
  protected writer: LogWriter | undefined
  protected feed: ListenedFeed
  /** The host's view of each event: its status feed. */
  protected readonly notifyHost: (event: StreamChunk) => void
  /** The `onEvent` listeners. Each feed tap shares this set. */
  protected readonly eventListeners = new Set<EventListener>()
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
  /** How much this session keeps in memory. */
  protected readonly retention: SessionDependencies['retention']
  protected readonly hostPlugins: SessionDependencies['hostPlugins']
  /** What this session keeps for its inputs. */
  protected readonly inputRecords: InputRecords
  protected readonly agentRegistry = new AgentRegistry()
  protected readonly operations = new Map<string, OperationImpl<unknown>>()
  /** The settled operations in `operations` that are not agent runs, oldest first. */
  protected readonly settledIds = new Set<string>()
  /** The settled agent runs in `operations`, oldest first. */
  protected readonly settledRuns = new Set<string>()
  /**
   * The ids of forgotten operations, oldest first, so a client `runId` does
   * not take one.
   */
  // ponytail: as many ids as both windows keep. Past that, only
  // `stores.runs` refuses a reused run id.
  protected readonly retiredIds = new Set<string>()
  /** See {@link InputRecords.admitted}. */
  protected get admitted() {
    return this.inputRecords.admitted
  }
  /** See {@link InputRecords.turnOperations}. */
  protected get turnOperations() {
    return this.inputRecords.turnOperations
  }
  /** See {@link InputRecords.operationInputs}. */
  protected get operationInputs() {
    return this.inputRecords.operationInputs
  }
  /** See {@link InputRecords.turnJoins}. */
  protected get turnJoins() {
    return this.inputRecords.turnJoins
  }
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
  /** The last claim write found another host's claim. */
  protected claimLost = false
  /** Drains `stores.inbox` while this host owns the thread. */
  protected inboxTimer: ReturnType<typeof setInterval> | undefined
  /** Reads the inbox until the inputs this host left there have run. */
  protected inboxWatch: ReturnType<typeof setInterval> | undefined
  /** The open skipped recovery: another host owned the thread then. */
  protected recoveryDeferred = false
  private draining: Promise<void> | undefined
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
  /** Tells the host each time the thread goes idle. See `SessionDependencies`. */
  protected readonly notifyIdle: (() => void) | undefined
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
  /** Plugin state by plugin name. No prototype, so any name is a plain key. */
  protected readonly stateDoc: Record<string, unknown> = Object.create(null)
  /** Reads each plugin's saved state, so the first snapshot has it. */
  protected readonly stateLoaders = new Map<string, () => Promise<unknown>>()
  protected readonly localState = new Map<string, unknown>()
  /** The last plugin state update of each namespace, for a store without `setIf`. */
  protected readonly stateWrites = new Map<string, Promise<unknown>>()
  /** The revert that stands. See `revert`. */
  protected reverted: RevertState | undefined
  /** Each secret value a credentials access of this session handed out. */
  protected readonly secrets = new Set<string>()
  /**
   * The connectors whose sign-in the user cancelled. Their `require` with
   * `wait` fails the tool, as without `wait`, until the next new turn.
   */
  protected readonly declinedSignIns = new Set<string>()
  /**
   * The credentials of one principal: the user of a run. A save there can
   * answer that user's sign-ins. With `canWait`, a `require` with `wait` can
   * stop the run for the sign-in.
   */
  protected readonly credentialsOf: (
    principal: Principal | undefined,
    canWait?: (id: string) => boolean,
  ) => CredentialsAccess
  /**
   * The model provider keys of one principal: saved with
   * `/connect <provider>`, else the env var.
   */
  protected readonly keysOf: (principal: Principal | undefined) => ProviderKeys
  /** What session plugins get. A turn plugin gets `pluginServices(turn)`. */
  protected readonly services: PluginServices
  protected readonly media: SessionDependencies['media']
  protected readonly mediaStore: MediaStore
  /** The prompt cache of every chat turn of this session. */
  protected readonly promptCache: ResolvedPromptCache
  /** The host checks access. See `SessionDependencies.access`. */
  protected readonly hasAccess: boolean

  constructor(deps: SessionDependencies) {
    this.harness = deps.harness as THarness
    this.threadId = deps.threadId
    this.logId = deps.logId
    this.tenantId = deps.tenantId
    this.storeLogId = deps.storeLogId
    this.storeThreadId = logIdOf({
      tenantId: deps.tenantId,
      logId: deps.threadId,
    })
    this.indexKey = { tenantId: deps.tenantId, threadId: deps.threadId }
    // The session value wins over the harness value, field by field.
    const own = cacheObject(deps.promptCache)
    const shared = cacheObject(this.harness.promptCache)
    this.promptCache = {
      retention: own?.retention ?? shared?.retention ?? 'short',
      key: own?.key ?? shared?.key ?? deps.threadId,
    }
    const { stores } = deps.persistence
    this.persistence = {
      stores: { ...stores, ...tenantStores(stores, deps.tenantId) },
    }
    this.hostRuns = stores.runs
    this.inbox = deps.inbox
    this.media = deps.media
    this.mediaStore = createMediaStore({
      persistence: deps.media,
      threadId: deps.threadId,
      ...(deps.tenantId !== undefined ? { tenantId: deps.tenantId } : {}),
      options: this.harness.media,
    })
    this.principal = deps.principal
    this.retention = deps.retention
    this.hostPlugins = deps.hostPlugins
    this.inputRecords = new InputRecords(deps.retention.settledOperations)
    this.notifyHost = deps.onEvent
    this.feed = tapFeed(
      new SessionFeed({ eventBytes: deps.retention.eventBytes }),
      deps.onEvent,
      this.eventListeners,
    )
    this.onClose = deps.onClose
    this.notifyIdle = deps.onIdle
    this.hostId = deps.hostId
    this.index = deps.index
    this.lease = deps.lease
    this.log = deps.log
    // A durable host gets its log view in `open()`.
    this.messages = this.persistence.stores.messages ?? notOpenMessages
    const onMissing = (error: AuthRequiredError) =>
      this.feed.publish(
        'session',
        customEvent(HARNESS_EVENTS.authRequired, {
          connector: error.connector,
          ...(error.url ? { url: error.url } : {}),
        }),
      )
    this.credentialsOf = (principal, canWait) =>
      credentialsFor(
        deps.credentials,
        scopeOf(deps.threadId, principal),
        onMissing,
        {
          ...(canWait ? { canWait } : {}),
          onSet: () => this.resumeSignIns(),
          secrets: this.secrets,
        },
      )
    this.hasAccess = deps.access !== undefined
    // Without access, one user runs the host, so the env vars are theirs.
    const envFallback = deps.access?.envKeys ?? true
    this.keysOf = (principal) =>
      providerKeysFor(this.credentialsOf(principal), onMissing, {
        secrets: this.secrets,
        envFallback,
      })
    this.services = this.pluginServices()
    this.registry = this.agentRegistry
    for (const agent of this.harness.agents ?? []) {
      this.agentRegistry.add(agent, 'the harness')
    }
    for (const agent of this.harness.subagents?.agents ?? []) {
      this.agentRegistry.add(agent, 'the harness')
    }
    this.agents = new Proxy({} as AgentHandles<THarness>, {
      get: (_target, name) =>
        typeof name === 'string' ? this.agentHandle(name) : undefined,
    })
  }

  /**
   * @internal `run` and `start` of the agent `name`, for `principal` when
   * given. `session.agents` and `session.agent` use it, and so does the
   * handle of `host.open`, which passes its own principal.
   */
  agentHandle(name: string, principal?: Principal): DynamicAgentHandle {
    const user = principal ? { principal } : {}
    return {
      run: (input?: unknown, options?: AgentRunOptions) =>
        this.runAgent(name, input, { ...options, ...user, wake: false }),
      start: (input?: unknown, options?: AgentStartOptions) =>
        this.runAgent(name, input, { ...options, ...user }),
    }
  }

  /**
   * An operation of this session by id: a running one, or one of the last
   * operations that settled. The host option `lifecycle.retention` sets how
   * many settled operations and agent runs a session keeps (default 500
   * each).
   */
  operation(id: string): Operation<unknown> | undefined {
    return this.operations.get(id)
  }

  /**
   * Keep `operation` in `operations`. Once settled, it joins its window: the
   * agent runs, or the other operations.
   */
  protected track(operation: OperationImpl<unknown>) {
    this.operations.set(operation.id, operation)
    const isRun = operation.kind === 'agent'
    const window = isRun ? this.settledRuns : this.settledIds
    const limit = isRun
      ? this.retention.settledAgentRuns
      : this.retention.settledOperations
    const settled = () => {
      window.add(operation.id)
      for (const old of dropOldest(window, limit)) this.forget(old)
    }
    void operation.then(settled, settled)
  }

  /** Drop what this session keeps for the settled operation `id`. */
  protected forget(id: string) {
    const chain = this.chainOf.get(id)
    this.operations.delete(id)
    this.chainOf.delete(id)
    this.retiredIds.add(id)
    const { settledOperations, settledAgentRuns } = this.retention
    dropOldest(this.retiredIds, settledOperations + settledAgentRuns)
    this.inputRecords.forgetOperation(id)
    if (chain) this.forgetRun(chain, id)
  }

  /**
   * Drop the run `id` from `chain`. A chain with no run left and no
   * follow-up that waits goes too.
   */
  private forgetRun(chain: AgentChain, id: string) {
    const at = chain.runs.findIndex((run) => run.operation.id === id)
    if (at >= 0) chain.runs.splice(at, 1)
    if (chain.runs.length > 0 || chain.followUps.length > 0) return
    if (this.agentChains.get(chain.runInputId) === chain) {
      this.agentChains.delete(chain.runInputId)
    }
    for (const parent of this.agentChains.values()) {
      parent.children.delete(chain)
    }
  }

  // ===========================
  // Events and state
  // ===========================

  /** `text` without the credential values this session handed out. */
  protected scrub(text: string) {
    return scrubSecrets(text, [...this.secrets])
  }

  /** {@link OnEvent} for the events of every operation of this session. */
  readonly onEvent: OnEvent = onEventOf((listener) =>
    this.feed.listen(listener),
  )

  /**
   * Call `listener` for each question that a command or a plugin asks.
   * Answer it with `session.answer`. Returns a function that stops the calls.
   *
   * @example
   * ```ts
   * session.onQuestion(({ question }) =>
   *   session.answer({ questionId: question.questionId, value: 'once' }),
   * )
   * ```
   */
  readonly onQuestion = onQuestionOf(this.onEvent)

  /**
   * Call `listener` when a tool needs a sign-in to a connector. Show the
   * `url` (and the `userCode`, for a device login) to the user.
   */
  readonly onAuthRequired = onAuthRequiredOf(this.onEvent)

  /** Call `listener` for each media file that an operation of this session saves. */
  readonly onMedia = onMediaOf(this.onEvent)

  /** Call `listener` after each model call, with its usage and the new thread totals. */
  readonly onUsage = onUsageOf(this.onEvent)

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
    // fromEntries defines own keys, so a point named `__proto__` stays a key.
    const extensionPoints: Record<string, Array<string>> = Object.fromEntries(
      [...(mounted?.extensions ?? [])].map(([point, items]) => [
        point,
        [...new Set(items.map((item) => item.owner))],
      ]),
    )
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
      if (!Object.hasOwn(this.stateDoc, plugin)) {
        this.stateDoc[plugin] = await load()
      }
    }
  }

  /**
   * Who sent the input of the running turn, else the principal that opened
   * the session. Turns run one at a time, so one value is enough. It never
   * picks credentials or keys: those come from the run context of each run.
   */
  protected sender(): Principal | undefined {
    return this.turnPrincipal ?? this.principal
  }

  /**
   * The run context of one run: the user who started it, and the
   * credentials and provider keys of that user. `canWait` says if a sign-in
   * wait of a tool can stop this run now.
   */
  protected runContext(options: {
    principal: Principal | undefined
    runId: string
    parentRunId?: string
    signal: AbortSignal
    canWait?: (id: string) => boolean
  }): RunContext {
    const { principal } = storedPrincipal(options.principal)
    return {
      ...(this.tenantId !== undefined ? { tenantId: this.tenantId } : {}),
      principal,
      logId: this.storeLogId,
      threadId: this.threadId,
      runId: options.runId,
      ...(options.parentRunId ? { parentRunId: options.parentRunId } : {}),
      signal: options.signal,
      credentials: this.credentialsOf(options.principal, options.canWait),
      keys: this.keysOf(options.principal),
    }
  }

  /**
   * What plugins get from the session. A session plugin has no user: its
   * `credentials` and `keys` throw, its `session.principal` is the principal
   * that opened the session, and its agents run for that principal. A turn
   * plugin gets its `turn`: they are all of the run of that turn.
   */
  protected pluginServices(turn?: TurnInfo): PluginServices {
    const principal = turn?.principal
    const operationId = turn?.operationId
    return {
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
      credentials: turn?.run.credentials ?? SESSION_PLUGIN_CREDENTIALS,
      keys: turn?.run.keys ?? SESSION_PLUGIN_KEYS,
      session: this.pluginApi(principal, undefined, operationId),
      sessionWith: (metadataSchema) =>
        this.pluginApi(principal, metadataSchema, operationId),
      agents: this.pluginAgents(principal),
      commandsChanged: () =>
        this.feed.publish(
          'session',
          customEvent(HARNESS_EVENTS.commandsChanged, {}),
        ),
    }
  }

  /**
   * `ctx.agents` of a plugin. The runs are for `principal`, else for the
   * principal that opened the session. A `principal` option of `start` wins.
   */
  protected pluginAgents(principal?: Principal): PluginAgentActions {
    const user = principal ? { principal } : {}
    return {
      run: ((target: string | AnyAgent, input?: unknown) =>
        this.runAgent(target, input, {
          ...user,
          wake: false,
        })) as PluginAgentActions['run'],
      start: ((
        target: string | AnyAgent,
        input?: unknown,
        options?: AgentStartOptions,
      ) =>
        this.runAgent(target, input, {
          ...user,
          ...options,
        })) as PluginAgentActions['start'],
      group: (options, body) => this.agentGroup(options, body, principal),
    }
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
    // One broken listener must not stop the others. An async one may reject.
    const warn = (error: unknown) => this.warnSession('harness:events', error)
    for (const handler of this.listeners.get(name) ?? []) {
      try {
        const result: unknown = handler(value)
        if (result instanceof Promise) result.catch(warn)
      } catch (error) {
        warn(error)
      }
    }
  }

  protected pluginState<T>(plugin: string, initial: T): PluginState<T> {
    const metadata = this.persistence.stores.metadata
    const namespace = `plugin:${plugin}`
    const key = this.storeThreadId
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
    const write = async (change: (current: T) => T) => {
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
    }
    return {
      get: async () => (await read()).value,
      update: (change) => {
        if (metadata?.setIf) return write(change)
        // ponytail: without `setIf`, the updates of this session run one at
        // a time. Another host can still race them. Use a store with `setIf`
        // for that.
        const run = (this.stateWrites.get(namespace) ?? Promise.resolve()).then(
          () => write(change),
        )
        this.stateWrites.set(
          namespace,
          run.catch(() => {}),
        )
        return run
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
        // Another host's claim that has not expired is left alone: the call
        // returns false. The timer tries again while this thread has work,
        // so the work gets a claim once that one expires.
        const isHeld = await claims.claim({
          threadId: this.storeThreadId,
          harness: this.harness.name,
          ownerId: this.hostId,
          until: Date.now() + ttlMs,
        })
        this.claimLost = !isHeld
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
    if (this.writer && this.persistence.stores.inbox) {
      // ponytail: a 1s poll. A store that can push could wake the owner instead.
      const poll = setInterval(() => void this.drainInbox(), INBOX_POLL_MS)
      if (typeof poll === 'object' && 'unref' in poll) poll.unref()
      this.inboxTimer = poll
    }
  }

  protected stopClaimTimer(): void {
    if (this.claimTimer) clearInterval(this.claimTimer)
    this.claimTimer = undefined
    if (this.inboxTimer) clearInterval(this.inboxTimer)
    this.inboxTimer = undefined
  }

  /**
   * Does another host hold a live claim on this thread? Only a durable host
   * with `stores.workClaims` asks. Its inputs then go to that host, through
   * `stores.inbox`: a write here would take the log from the running owner.
   */
  protected async isOwnedElsewhere(): Promise<boolean> {
    const claims = this.persistence.stores.workClaims
    if (!this.writer || !claims) return false
    const held = await claims.get(this.storeThreadId)
    return (
      held !== null && held.ownerId !== this.hostId && held.until > Date.now()
    )
  }

  /**
   * This host left an input for the owner: read the inbox every second until
   * it is empty. If the owner stops, its claim expires, and this host claims
   * the thread and runs the input.
   */
  protected watchInbox(): void {
    const inbox = this.persistence.stores.inbox
    if (this.inboxWatch || !inbox) return
    const stop = () => {
      clearInterval(timer)
      this.inboxWatch = undefined
    }
    const check = async () => {
      if (this.closing) return stop()
      const pending = await inbox
        .listPending(this.storeThreadId)
        .catch(() => null)
      if (pending?.length === 0) return stop()
      void this.drainInbox()
    }
    const timer = setInterval(() => void check(), INBOX_POLL_MS)
    if (typeof timer === 'object' && 'unref' in timer) timer.unref()
    this.inboxWatch = timer
  }

  /**
   * Apply the inputs that other hosts left in `stores.inbox` for this
   * thread, in order. Only the host that holds the claim does: it claims the
   * thread first. An input that ran before (a drain cut by a crash) is a
   * duplicate in the log.
   */
  protected drainInbox(): Promise<void> {
    this.draining ??= this.drainOnce().finally(() => {
      this.draining = undefined
    })
    return this.draining
  }

  private async drainOnce(): Promise<void> {
    const inbox = this.persistence.stores.inbox
    const claims = this.persistence.stores.workClaims
    if (!this.writer || !inbox || !claims || this.closing) return
    try {
      const pending = await inbox.listPending(this.storeThreadId)
      if (pending.length === 0) return
      const isHeld = await claims.claim({
        threadId: this.storeThreadId,
        harness: this.harness.name,
        ownerId: this.hostId,
        until: Date.now() + (this.lease?.ttlMs ?? LEASE.ttlMs),
      })
      if (!isHeld) return
      // This host takes the thread from an owner that stopped. Its inputs
      // run first, as on an open.
      if (this.recoveryDeferred) {
        await this.recoverFromLog(this.writer)
        this.recoveryDeferred = false
      }
      for (const entry of pending) {
        await this.applyForwarded(entry)
        // The input was not stored. It waits for the next host.
        if (this.closing || this.logFailure) return
        const { inputId } = entry
        // The host that stored an answer did not know if it is a secret.
        // This host does, and logs it hidden. The entry goes.
        if ((entry.input as HarnessInput).op === 'answer') {
          await inbox.delete({ threadId: this.storeThreadId, inputId })
          continue
        }
        await inbox.markApplied({
          threadId: this.storeThreadId,
          inputId,
          operationId: 'forwarded',
        })
      }
      // A drain of controls only leaves the thread idle: give the claim back.
      this.checkIdle()
    } catch (error) {
      this.warnClaim(error)
    }
  }

  /** Apply an input that another host stored, as if it arrived here. */
  private async applyForwarded(entry: InboxEntry): Promise<unknown> {
    const session = this.self()
    // The host that stored it checked the input against `HarnessInput`.
    const input = entry.input as HarnessInput
    const { inputId } = entry
    const principal = entry.principal
    const user = principal ? { principal } : {}
    const sent = {
      inputId,
      ...user,
      ...('context' in input && input.context !== undefined
        ? { context: input.context }
        : {}),
    }
    const settle = (operation: PromiseLike<unknown>) => {
      // Nobody awaits a forwarded turn here. Its client reads the log.
      operation.then(
        () => {},
        () => {},
      )
    }
    // A turn is stored when its receipt comes. Only then is the entry applied.
    const stored = (operation: Operation<unknown>) => {
      settle(operation)
      return operation.receipt
    }
    const { runId } = entry.input as { runId?: unknown }
    const run = typeof runId === 'string' ? { runId } : {}
    switch (input.op) {
      case 'prompt':
        return stored(
          session.send(input.message, {
            ...sent,
            ...(input.busy ? { busy: input.busy } : {}),
            ...run,
          }),
        )
      case 'continue':
        return stored(session.continue(sent))
      case 'steer':
        return stored(session.send(input.message, { ...sent, mode: 'steer' }))
      case 'followUp':
        return stored(
          this.startTurn(input, {
            ...sent,
            mode: 'followUp',
            ...(input.wake ? { wake: true } : {}),
          }),
        )
      case 'resolve':
        return this.resolveForRun({ resume: input.resume, ...sent, ...run })
      case 'reset':
        return session.reset({ note: input.note, ...sent })
      case 'configure':
        return session.configure({ settings: input.settings, ...sent })
      case 'agentMessage':
        return stored(
          session.send(input.message, {
            ...sent,
            to: input.operationId,
            mode: input.mode,
          }),
        )
      case 'cancel':
        return session.cancel({
          operationId: input.operationId,
          inputId,
          ...user,
        })
      case 'cancelInput':
        return session.cancelInput(input.inputId, user)
      case 'setDelivery':
        return session.setDelivery({
          inputId: input.inputId,
          delivery: input.delivery,
          ...user,
        })
      case 'command':
        return settle(
          session.command({
            name: input.name,
            input: input.input,
            inputId,
            ...user,
          }),
        )
      case 'answer':
        return session.answer({
          questionId: input.questionId,
          value: input.value,
          inputId,
          ...user,
        })
      case 'config':
        return session.setConfig({
          key: input.key,
          value: input.value,
          inputId,
          ...user,
        })
      case 'tool':
        return stored(
          // Wire args are unknown here. The tool's input schema checks them.
          session.tool({
            name: input.name,
            args: input.args as never,
            inputId,
            ...user,
            ...(input.meta ? { meta: input.meta } : {}),
          }),
        )
      case 'revert':
      case 'unrevert':
      case 'agent':
      case 'background':
        // These run only on the owner. Another host never stores them.
        return undefined
      case 'append':
        // It goes to the log at once, not to the inbox.
        return undefined
    }
  }

  /** Give the thread's claim back. A failed write is a warning. */
  protected async releaseClaim(): Promise<void> {
    try {
      await this.claimWrite
      await this.persistence.stores.workClaims?.release({
        threadId: this.storeThreadId,
        ownerId: this.hostId,
      })
    } catch (error) {
      this.warnClaim(error)
    }
  }

  /**
   * A claim write failed. Without a claim, a sweep cannot find this work
   * after a crash, so clients get a warning. The work goes on.
   */
  protected warnClaim(error: unknown): void {
    this.warnSession('harness:work-claims', error)
  }

  /** Tell clients that a write no one waits for failed. The work goes on. */
  protected warnSession(plugin: string, error: unknown): void {
    this.feed.publish(
      'session',
      customEvent('harness.plugin.warning', {
        plugin,
        message: this.scrub(
          error instanceof Error ? error.message : String(error),
        ),
      }),
    )
  }

  /**
   * @internal No input being stored, no queued or running turn, no waiting
   * steer, and no running agent. The host closes an idle session that no
   * handle holds.
   */
  isIdle(): boolean {
    // A follow-up that waits for its run keeps the thread busy.
    const hasFollowUps = [...this.agentChains.values()].some(
      (chain) => chain.followUps.length > 0,
    )
    if (hasFollowUps) return false
    return (
      // A question waits in this host's memory: its answer must come here.
      this.questions.size === 0 &&
      this.inputsInFlight === 0 &&
      this.activeTurn === undefined &&
      this.queue.length === 0 &&
      this.steerQueue.length === 0 &&
      ![...this.operations.values()].some(
        (operation) =>
          (operation.kind === 'agent' || operation.kind === 'command') &&
          !operation.isSettled(),
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
    // An input that another host stored after the last drain runs now.
    void this.releaseClaim().then(() =>
      this.draining ? undefined : this.drainInbox(),
    )
    for (const listener of [...this.idleListeners]) listener()
    this.notifyIdle?.()
  }

  /** @internal `close()` ran: the session takes no new work. */
  isClosing(): boolean {
    return this.closing !== undefined
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
   * Resolves when the thread is idle: no input is being stored, and no turn,
   * steer, agent run, or command runs or waits. A thread that waits for a
   * human (an approval, a sign-in) is idle. When the thread is idle now, it
   * resolves at once. When `signal` aborts first, it rejects with the reason
   * of `signal`.
   *
   * @example
   * ```ts
   * session.send('Write a haiku about the sea.')
   * await session.whenIdle({ signal: AbortSignal.timeout(60_000) })
   * ```
   */
  whenIdle({ signal }: { signal?: AbortSignal } = {}) {
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason)
      if (this.isIdle()) return resolve()
      const onAbort = () => {
        stop()
        reject(signal?.reason)
      }
      const stop = this.onIdle(() => {
        stop()
        signal?.removeEventListener('abort', onAbort)
        resolve()
      })
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }

  protected warn(
    operation: OperationImpl<unknown> | OperationImpl<ChatTurnResult>,
    plugin: string,
    error: unknown,
  ) {
    operation.publish(
      customEvent('harness.plugin.warning', {
        plugin,
        message: this.scrub(
          error instanceof Error ? error.message : String(error),
        ),
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
    if (this.canFlushNotes()) await this.flushNotes()
  }

  /**
   * While a turn runs, waits, or a revert stands, a note waits: the next
   * turn or unrevert adds it. So a note never ends a transcript that a
   * queued turn continues.
   */
  protected canFlushNotes(): boolean {
    return !this.activeTurn && !this.reverted && this.queue.length === 0
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
    principal?: Principal,
  ): Promise<T>
  protected abstract pluginApi(
    principal?: Principal,
    metadataSchema?: SchemaInput,
    operationId?: string,
  ): PluginSessionApi
  protected abstract resumeSignIns(): Promise<void>
  /** @internal See `SessionRequests.resolveForRun`. */
  abstract resolveForRun(options: ResolveForRunOptions): Promise<Receipt>
  protected abstract recoverFromLog(writer: LogWriter): Promise<void>
  protected abstract startTurn(
    input: HarnessInput & { op: 'prompt' | 'steer' | 'followUp' },
    options?: SendOptions & { wake?: boolean },
  ): Operation<ChatTurnResult>
  protected abstract runAgent(
    target: string | AnyAgent,
    input: unknown,
    options: AgentStartOptions,
    parent?: AgentChain,
    child?: AgentChild,
  ): AgentRunImpl
}
