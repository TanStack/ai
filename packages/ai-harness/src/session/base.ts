import {
  EventType,
  SubagentBudget,
  combineStrategies,
  maxIterations,
  untilFinishReason,
} from '@tanstack/ai'
import {
  createRedactor,
  credentialsFor,
  providerKeysFor,
  refreshFlights,
} from '../auth'
import { AgentRegistry, NO_SESSION_CONTEXT } from '../agents'
import {
  SessionFeed,
  onAuthRequiredOf,
  onEventOf,
  onMediaOf,
  onQuestionOf,
  onUsageOf,
} from '../feed'
import { runStartOf } from '../log'
import { createMediaStore } from '../media'
import { OperationTracing } from '../observability'
import { pluginStateDeltas } from '../log-records'
import {
  SESSION_PLUGIN_CREDENTIALS,
  SESSION_PLUGIN_KEYS,
  SESSION_PLUGIN_KEYS_NO_ENV,
} from '../plugins'
import { HARNESS_EVENTS } from '../types'
import {
  DEFAULT_SUBAGENT_LIMITS,
  createMessageId,
  customEvent,
  cacheObject,
  dropOldest,
  jobsOf,
  scopeOf,
  storedUser,
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
  MessageStore,
  SessionIndexKey,
  SessionIndexStore,
} from '@tanstack/ai-persistence'
import type { CredentialStore } from '@tanstack/ai/byok'
import type { AuthRequiredError, CredentialsAccess } from '../auth'
import type { EventListener, ListenedFeed } from '../feed'
import type { LogWriter, RevertState, engineMessageStore } from '../log'
import type { logChatStores } from '../log-stores'
import type { MediaStore } from '../media'
import type { PluginSessionApi } from '../commands'
import type { SessionUsage } from '../usage'
import type {
  AgentActions,
  AgentGroup,
  AgentGroupOptions,
  AgentRegistryView,
  AnyAgent,
} from '../agents'
import type { AnyHarness } from '../define'
import type { HarnessPersistence, SessionIndexWriter } from '../host'
import type {
  HarnessPlugin,
  MountedPlugins,
  PluginModelCall,
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
  HarnessUser,
  Receipt,
  RunContext,
  SessionEvent,
  ThreadSettings,
  SendForRunOptions,
  TurnInfo,
  UserInput,
} from '../types'
import type {
  AgentRunOptions,
  AgentRunStartOptions,
  AgentStartFn,
  AgentStartOptions,
  AgentChild,
  AgentHandles,
  DynamicAgentHandle,
  GroupRuns,
  JobInfo,
  SessionInspection,
  SessionDependencies,
  QueuedTurn,
  ResolveForRunOptions,
  WaitingSteer,
  InterruptedTurn,
  AgentRunImpl,
  AgentChain,
  ChildSessionLink,
  HarnessChild,
  OpenChildSession,
} from './types'
import type { HarnessSession } from './harness-session'

const NO_NAMES: ReadonlySet<string> = new Set()

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
// the log. An input whose work stops on a failed store write, and never ends,
// stays until the session closes.
export class InputRecords {
  /**
   * The input and its sender as JSON, by input id: the duplicate check.
   * `recoverPendingWork()` skips these inputs.
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
export abstract class SessionBase<THarness extends AnyHarness = AnyHarness> {
  readonly threadId: string
  readonly agents: AgentHandles<THarness>
  /** The agents this session can run, for discovery. */
  readonly registry: AgentRegistryView

  protected readonly harness: THarness
  /** The tenant of this session: the tenant of the user that opened it. */
  protected readonly tenantId: string | undefined
  /** The id of the log of this session in the store, with the tenant. */
  protected readonly storeLogId: string
  /** The key of the session index entry of this thread. */
  protected readonly indexKey: SessionIndexKey
  /**
   * The stores of the host. The runs, interrupts, and transcript of the
   * session are in its log (see `runStore`).
   */
  protected readonly persistence: HarnessPersistence
  protected readonly user: HarnessUser | undefined
  /** The owner of the index entry, once the session read it. */
  protected owner: HarnessUser | undefined
  /** The session log writer, once `open()` opened it. It is also the feed. */
  protected logWriter: LogWriter | undefined
  /** The session log writer. Throws before `open()` opened it. */
  protected get writer() {
    if (!this.logWriter) throw new Error('The session log is not open yet.')
    return this.logWriter
  }

  /**
   * The cursor before the first event of the logged run `id`, for an
   * operation that a restart rebuilds. `undefined` for a new run.
   */
  protected runStart(id: string | undefined) {
    if (id === undefined || !this.logWriter) return undefined
    return runStartOf(this.logWriter.state, id)
  }
  protected feed: ListenedFeed
  /** The host's view of each event: its status feed. */
  protected readonly notifyHost: (event: StreamChunk) => void
  /** The `onEvent` listeners. Each feed tap shares this set. */
  protected readonly eventListeners = new Set<EventListener>()
  /** The transcript: a view of the log. */
  protected messages: MessageStore
  /**
   * What `withPersistence` gets: the chat stores, with `messages`. With
   * `sessions`, each child the model starts gets an index entry.
   */
  protected chatPersistence:
    | AIPersistence<ChatTranscriptStores & { sessions?: SessionIndexStore }>
    | undefined
  /** The runs and interrupts of the session, in its log, once `open()` ran. */
  protected logStores: ReturnType<typeof logChatStores> | undefined
  /** The runs of the session and of its child runs, in its log. Throws before `open()`. */
  protected get runStore() {
    if (!this.logStores) throw new Error('The session log is not open yet.')
    return this.logStores.runs
  }
  /** The interrupts of the session and of its child runs, in its log. Throws before `open()`. */
  protected get interruptStore() {
    if (!this.logStores) throw new Error('The session log is not open yet.')
    return this.logStores.interrupts
  }
  /** The message store the chat engine saves through, once `open()` ran. */
  protected openEngine: ReturnType<typeof engineMessageStore> | undefined
  /** The message store the chat engine saves through. Throws before `open()`. */
  protected get engine() {
    if (!this.openEngine) throw new Error('The session log is not open yet.')
    return this.openEngine
  }
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
  // ponytail: as many ids as both windows keep. Past that, only the runs
  // in the log refuse a reused run id.
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
  /**
   * The tool calls that run now: for each chat call that runs tools, the
   * operation of the call, and how many of its tools run.
   */
  protected readonly toolCalls = new Map<
    object,
    { id: string; count: number }
  >()
  protected readonly queue: Array<QueuedTurn> = []
  protected readonly steerQueue: Array<WaitingSteer> = []
  /**
   * Waiting steers with an abort request. An id lands here before the abort
   * append, so a join that runs during that append skips the steer.
   */
  protected readonly abortedSteers = new Set<string>()
  /** The ids of the waiting steers that a join took. A cancel of one is refused. */
  protected readonly joining = new Set<string>()
  /** Notes that wait for the transcript. The log has each one. */
  protected readonly pendingNotes: Array<ModelMessage> = []
  /** Background jobs that run on this host. Recovery skips them. */
  protected readonly liveJobs = new Set<string>()
  /** Running tool calls that support `detach`: id to the move. */
  protected readonly detachable = new Map<
    string,
    (user: HarnessUser | undefined) => void
  >()
  protected activeTurn: OperationImpl<ChatTurnResult> | undefined
  /** The open skipped recovery: another host owned the thread then. */
  protected recoveryDeferred = false
  /**
   * Agent runs that another host runs for an input that this host offered.
   * They wait for the log, so they do not keep the thread busy here.
   */
  protected readonly remoteRuns = new Set<string>()
  /**
   * Agent runs of this host that wait for answers to their interrupts, by
   * operation id. The log keeps the waits, so they do not keep the thread
   * busy here: an answer on any host resumes the run.
   */
  protected readonly waitingRuns = new Map<
    string,
    {
      operation: AgentRunImpl
      chain: AgentChain
      /** The input the run applies. */
      inputId: string
      subagentRunId: string
    }
  >()
  /** Called each time the thread goes idle. See `onIdle`. */
  protected readonly idleListeners = new Set<() => void>()
  /** Work inputs that are being stored and are not queued yet. */
  protected inputsInFlight = 0
  /** Who sent the input of the running turn. */
  protected turnUser: HarnessUser | undefined
  /**
   * The last turn stopped for these interrupts. `routed`: a routed turn
   * stopped. The resolve continues its saved plan. The log keeps a copy, so
   * a resolve after a restart continues the turn too.
   */
  protected interrupted: InterruptedTurn | undefined
  protected activeResume = false
  protected plugins: ReadonlyArray<HarnessPlugin> = []
  protected sessionPlugins: MountedPlugins | undefined
  /** The last `reloadPlugins()`. The calls run one at a time. */
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
  /** The last `recoverPendingWork()`. The calls run one at a time. */
  protected recovery: Promise<void> = Promise.resolve()
  protected readonly onClose: () => void
  /** Tells the host each time the thread goes idle. See `SessionDependencies`. */
  protected readonly notifyIdle: (() => void) | undefined
  /** See `SessionDependencies.onLongSleep`. */
  protected readonly onLongSleep: (() => void) | undefined
  protected checkpoint: AnyChatMiddleware | undefined
  /**
   * Writes the final result of each tool call to the log. It goes at the
   * very end of the middleware list. See `toolResultRecorder`.
   */
  protected toolRecorder: AnyChatMiddleware | undefined
  protected readonly index: SessionIndexWriter
  /**
   * Why the work of this session stopped: another host took the log. Set
   * from the loss until the stopped work ended.
   */
  protected ownershipLoss: Error | undefined
  protected readonly listeners = new Map<
    string,
    Set<(value: unknown) => void>
  >()
  protected readonly configValues = new Map<string, unknown>()
  /**
   * The config values of the log when the running turn started. The turn
   * uses them until it ends.
   */
  protected turnConfig: ReadonlyMap<string, unknown> | undefined
  /** The stored settings of this thread: `session.updateThreadSettings`. */
  protected currentSettings: ThreadSettings = {}
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
      /** Stop the listener on the `signal` of the ask. */
      release: () => void
    }
  >()
  /**
   * The live `sign-in` waits of the OAuth logins that the commands of this
   * host run, by wait id: the connector, and the command that waits.
   */
  protected readonly signIns = new Map<
    string,
    { connector: string; operation: OperationImpl<unknown> }
  >()
  /** Plugin state by plugin name. No prototype, so any name is a plain key. */
  protected readonly stateDoc: Record<string, unknown> = Object.create(null)
  /** Reads each plugin's saved state, so the first snapshot has it. */
  protected readonly stateLoaders = new Map<string, () => unknown>()
  /** The last state update of each plugin. The updates of one plugin run in order. */
  protected readonly stateWrites = new Map<string, Promise<unknown>>()
  /** The revert that stands. See `revert`. */
  protected reverted: RevertState | undefined
  /**
   * Each secret value that a credentials access or the keys of this session
   * handed out. Every log record, feed event, and model call of the session
   * goes through it. Call `redactor.add` for a new secret value.
   */
  protected readonly redactor = createRedactor()
  /** The credential store of the app, for secret answers. See `SessionDependencies`. */
  protected readonly sharedCredentials: CredentialStore | undefined
  /**
   * The connectors whose sign-in the user cancelled. Their `require` with
   * `wait` fails the tool, as without `wait`, until the next new turn.
   */
  protected readonly declinedSignIns = new Set<string>()
  /**
   * The credentials of one user: the user of a run. A save there can
   * answer that user's sign-ins. With `canWait`, a `require` with `wait` can
   * stop the run for the sign-in.
   */
  protected readonly credentialsOf: (
    user: HarnessUser | undefined,
    canWait?: (id: string) => boolean,
  ) => CredentialsAccess
  /**
   * The model provider keys of one user: saved with
   * `/connect <provider>`, else the env var.
   */
  protected readonly keysOf: (user: HarnessUser | undefined) => ProviderKeys
  /** `ctx.keys` of a session plugin: it says if keys read env vars. */
  protected readonly sessionPluginKeys: ProviderKeys
  /** What session plugins get. A turn plugin gets `pluginServices(turn)`. */
  protected readonly services: PluginServices
  protected readonly media: SessionDependencies['media']
  protected readonly mediaStore: MediaStore
  /** The prompt cache of every chat turn of this session. */
  protected readonly promptCache: ResolvedPromptCache
  /** The host checks access. See `SessionDependencies.access`. */
  protected readonly hasAccess: boolean
  /** The root thread of the session tree: this thread, unless it is a child. */
  protected readonly rootThreadId: string
  /** See `SessionDependencies.openChild`. */
  protected readonly openChild: OpenChildSession | undefined
  /** See `SessionDependencies.child`. Set on a child session only. */
  protected readonly childLink: ChildSessionLink | undefined
  /**
   * The child sessions of `harnessAgent` that runs of this session have open
   * now, by thread. The snapshot lists their waits, and `resolve` sends an
   * answer to the child that waits for it.
   */
  protected readonly harnessChildren = new Map<string, HarnessChild>()
  /** Spans and `onOperation`. Without host `observability`, none. */
  protected readonly tracing: OperationTracing | undefined

  constructor(deps: SessionDependencies) {
    this.harness = deps.harness as THarness
    this.threadId = deps.threadId
    this.tenantId = deps.tenantId
    this.storeLogId = deps.storeLogId
    this.indexKey = { tenantId: deps.tenantId, threadId: deps.threadId }
    // The session value wins over the harness value, field by field.
    const own = cacheObject(deps.promptCache)
    const shared = cacheObject(this.harness.promptCache)
    this.promptCache = {
      retention: own?.retention ?? shared?.retention ?? 'short',
      key: own?.key ?? shared?.key ?? deps.threadId,
    }
    this.persistence = deps.persistence
    this.sharedCredentials = deps.sharedCredentials
    this.media = deps.media
    this.mediaStore = createMediaStore({
      persistence: deps.media,
      threadId: deps.threadId,
      ...(deps.tenantId !== undefined ? { tenantId: deps.tenantId } : {}),
      options: this.harness.media,
    })
    this.user = deps.user
    this.retention = deps.retention
    this.hostPlugins = deps.hostPlugins
    this.inputRecords = new InputRecords(deps.retention.keepSettledOperations)
    this.notifyHost = deps.onEvent
    this.feed = tapFeed(
      new SessionFeed({
        threadId: deps.threadId,
        eventBytes: deps.retention.maxEventBytesInMemory,
      }),
      deps.onEvent,
      this.eventListeners,
      this.redactor,
    )
    this.onClose = deps.onClose
    this.notifyIdle = deps.onIdle
    this.onLongSleep = deps.onLongSleep
    this.index = deps.index
    this.log = deps.log
    this.openChild = deps.openChild
    this.childLink = deps.child
    this.rootThreadId = deps.child?.rootThreadId ?? deps.threadId
    this.tracing = deps.observability
      ? new OperationTracing({
          ...deps.observability,
          threadId: deps.threadId,
          ...(deps.tenantId !== undefined ? { tenantId: deps.tenantId } : {}),
          warn: (error) => this.warnSession('harness:observability', error),
        })
      : undefined
    // The session gets its log view in `open()`.
    this.messages = notOpenMessages
    const onMissing = (error: AuthRequiredError) =>
      this.feed.publish(
        'session',
        customEvent(HARNESS_EVENTS.authRequired, {
          connector: error.connector,
          ...(error.url ? { url: error.url } : {}),
        }),
      )
    const refreshes = deps.refreshes ?? refreshFlights()
    // A child of `harnessAgent` reads the credentials of its root thread, so
    // it runs with the keys of the user of the run that started it.
    this.credentialsOf = (user, canWait) =>
      credentialsFor(
        deps.credentials,
        scopeOf(this.rootThreadId, user),
        onMissing,
        {
          ...(canWait ? { canWait } : {}),
          onSet: () => this.resumeSignIns(),
          secrets: this.redactor,
          refreshes,
        },
      )
    this.hasAccess = deps.access !== undefined
    // Without access, one user runs the host, so the env vars are theirs.
    const envFallback = deps.access?.allowServerEnvKeys ?? true
    this.sessionPluginKeys = envFallback
      ? SESSION_PLUGIN_KEYS
      : SESSION_PLUGIN_KEYS_NO_ENV
    this.keysOf = (user) =>
      providerKeysFor(this.credentialsOf(user), onMissing, {
        secrets: this.redactor,
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
   * @internal `run` and `start` of the agent `name`, for `user` when
   * given. `session.agents` and `session.agent` use it, and so does the
   * handle of `host.open`, which passes its own user.
   */
  agentHandle(name: string, user?: HarnessUser): DynamicAgentHandle {
    const asUser = user ? { user } : {}
    return {
      run: (input?: unknown, options?: AgentRunOptions) =>
        this.runAgent(name, input, {
          ...options,
          ...asUser,
          startTurnWhenDone: false,
        }),
      start: (input?: unknown, options?: AgentStartOptions) =>
        this.runAgent(name, input, { ...options, ...asUser }),
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
      ? this.retention.keepSettledAgentRuns
      : this.retention.keepSettledOperations
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
    const { keepSettledOperations, keepSettledAgentRuns } = this.retention
    dropOldest(this.retiredIds, keepSettledOperations + keepSettledAgentRuns)
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
    return this.redactor.scrub(text)
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
   * sender. `cost` is the sum of what the providers reported. The log keeps
   * the totals.
   *
   * @example
   * ```ts
   * const { total, bySender } = session.usage()
   * console.log(total.totalTokens, bySender['user-1']?.cost)
   * ```
   */
  usage(): SessionUsage {
    return structuredClone(this.writer.state.usage)
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

  /** A config value. Plugins read the copy of the running turn, if any. */
  protected configValue(
    key: string,
    values: ReadonlyMap<string, unknown> = this.turnConfig ?? this.configValues,
  ): unknown {
    if (values.has(key)) return values.get(key)
    return this.sessionPlugins?.config.get(key)?.option.default
  }

  /** The last `removedPlugins()` and `threadPlugins()` results. */
  private threadPluginsCache:
    | {
        settings: ThreadSettings
        removed: ReadonlySet<string>
        mounted?: MountedPlugins
        plugins?: MountedPlugins
      }
    | undefined

  /** The plugins that the `plugins.remove` setting of this thread names. */
  protected removedPlugins(): ReadonlySet<string> {
    const settings = this.currentSettings
    const remove = settings.plugins?.remove ?? []
    if (remove.length === 0) return NO_NAMES
    if (this.threadPluginsCache?.settings !== settings) {
      this.threadPluginsCache = { settings, removed: new Set(remove) }
    }
    return this.threadPluginsCache.removed
  }

  /**
   * The session plugins as this thread has them: without everything that
   * the removed plugins contribute (tools, prompts, every kind of
   * middleware, agents, subagents, commands, config, extension items, and
   * capabilities).
   */
  protected threadPlugins(): MountedPlugins | undefined {
    const mounted = this.sessionPlugins
    const removed = this.removedPlugins()
    if (!mounted || removed.size === 0) return mounted
    const cache = this.threadPluginsCache
    if (!cache) return mounted
    if (cache.mounted !== mounted || !cache.plugins) {
      cache.mounted = mounted
      cache.plugins = mounted.withoutOwners([...removed])
    }
    return cache.plugins
  }

  /**
   * The agent `name` of the session registry, as this thread has it:
   * `undefined` when a plugin that this thread removed added it.
   */
  protected threadAgent(name: string): AnyAgent | undefined {
    const owner = this.agentRegistry.ownerOf(name)
    if (owner === undefined || this.removedPlugins().has(owner)) {
      return undefined
    }
    return this.agentRegistry.get(name)
  }

  /** Put each plugin's saved state in the snapshot before the first read. */
  protected loadPluginState() {
    for (const [plugin, load] of this.stateLoaders) {
      if (!Object.hasOwn(this.stateDoc, plugin)) {
        this.stateDoc[plugin] = load()
      }
    }
  }

  /**
   * Who sent the input of the running turn, else the user that opened
   * the session. Turns run one at a time, so one value is enough. It never
   * picks credentials or keys: those come from the run context of each run.
   */
  protected sender(): HarnessUser | undefined {
    return this.turnUser ?? this.user
  }

  /**
   * The run context of one run: the user who started it, and the
   * credentials and provider keys of that user. `canWait` says if a sign-in
   * wait of a tool can stop this run now. `handoff` is the handoff of a
   * routed turn. Without it, `run.handoff` rejects.
   */
  protected runContext(options: {
    user: HarnessUser | undefined
    runId: string
    parentRunId?: string
    signal: AbortSignal
    canWait?: (id: string) => boolean
    handoff?: RunContext['handoff']
  }): RunContext {
    const { user } = storedUser(options.user)
    const { runId } = options
    const logId = this.storeLogId
    return {
      ...(this.tenantId !== undefined ? { tenantId: this.tenantId } : {}),
      user,
      logId,
      threadId: this.threadId,
      runId,
      ...(options.parentRunId ? { parentRunId: options.parentRunId } : {}),
      epoch: this.writer.epoch,
      // No attempt in the key: a run again on another host must send the
      // same key, so the other system refuses the second side effect.
      idempotencyKey: (step, scope) => `${logId}:${scope ?? runId}:${step}`,
      signal: options.signal,
      credentials: this.credentialsOf(options.user, options.canWait),
      keys: this.keysOf(options.user),
      handoff: options.handoff ?? NO_SESSION_CONTEXT.handoff,
    }
  }

  /**
   * What plugins get from the session. A session plugin has no user: its
   * `credentials` and `keys` throw, its `session.user` is the user
   * that opened the session, and its agents run for that user. A turn
   * plugin gets its `turn`: they are all of the run of that turn.
   */
  protected pluginServices(turn?: TurnInfo): PluginServices {
    const user = turn?.user
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
      keys: turn?.run.keys ?? this.sessionPluginKeys,
      session: this.pluginApi(user, undefined, operationId),
      sessionWith: (metadataSchema) =>
        this.pluginApi(user, metadataSchema, operationId),
      agents: this.pluginAgents(user),
      commandsChanged: () =>
        this.feed.publish(
          'session',
          customEvent(HARNESS_EVENTS.commandsChanged, {}),
        ),
      modelChat: (call) => this.modelChat(call),
    }
  }

  /**
   * `ctx.agents` of a plugin. The runs are for `user`, else for the
   * user that opened the session. A `user` option of `start` wins.
   * With no `parent` option, a start in a tool call of an agent run is a
   * child of that run (see `toolCallRun`).
   */
  protected pluginAgents(user?: HarnessUser): AgentActions {
    const asUser = user ? { user } : {}
    return this.agentActions((target, input, options) => {
      const runId =
        options.parent === undefined ? this.toolCallRun() : undefined
      return this.runAgent(target, input, {
        ...asUser,
        ...options,
        ...(runId !== undefined ? { parent: { runId } } : {}),
      })
    })
  }

  /**
   * The agent run whose tool call runs now, when it is the only operation
   * of this session in a tool call. ponytail: plugin code has no async
   * context here, so tool calls of two runs at once give no run. Pass
   * `parent` then.
   */
  protected toolCallRun(): string | undefined {
    const running = [
      ...new Set([...this.toolCalls.values()].map(({ id }) => id)),
    ].filter((id) => this.operations.get(id)?.status() === 'running')
    const [only] = running
    return running.length === 1 && only !== undefined && this.chainOf.has(only)
      ? only
      : undefined
  }

  /**
   * `start`, `run`, and `group` over one `start` function. `run` and the
   * children of a group start with `startTurnWhenDone: false`, unless the options say
   * else.
   */
  protected agentActions(start: AgentStartFn): AgentActions {
    return {
      start: ((
        target: string | AnyAgent,
        input?: unknown,
        options?: AgentStartOptions,
      ) => start(target, input, options ?? {})) as AgentActions['start'],
      run: ((
        target: string | AnyAgent,
        input?: unknown,
        options?: AgentRunOptions,
      ) =>
        start(target, input, {
          ...options,
          startTurnWhenDone: false,
        })) as AgentActions['run'],
      group: ((
        options: AgentGroupOptions,
        body: (g: AgentGroup) => GroupRuns | Promise<GroupRuns>,
      ) =>
        this.agentGroup(options, body, (target, input, childOptions) =>
          start(target, input, { startTurnWhenDone: false, ...childOptions }),
        )) as AgentActions['group'],
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

  /**
   * The thread state of `plugin`. The log keeps it: each update appends
   * the deltas from the current value, and the fold of the log gives the
   * value back, also after a restart.
   */
  protected pluginState<T>(plugin: string, initial: T): PluginState<T> {
    return this.loggedState({ kind: 'plugins', key: plugin, initial })
  }

  /**
   * `ctx.harness.state`: the value of `key` that the agents of this session
   * share. The log keeps it, as it keeps plugin state.
   */
  protected sharedState<T>(options: {
    key: string
    initial: T
  }): PluginState<T> {
    return this.loggedState({ kind: 'shared', ...options })
  }

  /**
   * One value of the thread state that the log keeps: the state of a plugin,
   * or a shared key. Each update appends the deltas from the current value.
   * The updates of one value run one at a time.
   */
  private loggedState<T>(options: {
    kind: 'plugins' | 'shared'
    key: string
    initial: T
  }): PluginState<T> {
    const { kind, key, initial } = options
    const read = () => {
      const values = this.writer.state.thread[kind]
      // The fold holds what was written for this key.
      return values.has(key) ? (values.get(key) as T) : initial
    }
    // A copy: the snapshot must not share objects with the fold.
    if (kind === 'plugins') {
      this.stateLoaders.set(key, () => structuredClone(read()))
    }
    const publish = (value: T) => {
      if (kind === 'plugins') this.stateDoc[key] = value
      this.feed.publish('session', {
        type: EventType.STATE_SNAPSHOT,
        snapshot: {
          plugins: { ...this.stateDoc },
          // fromEntries defines own keys, so a key named `__proto__` stays
          // a key.
          shared: structuredClone(
            Object.fromEntries(this.writer.state.thread.shared),
          ),
        },
        timestamp: Date.now(),
      })
    }
    const write = async (change: (current: T) => T) => {
      const values = this.writer.state.thread[kind]
      // The first write sets the whole value: the log has no value to change.
      const stored = values.has(key) ? values.get(key) : undefined
      // Scrubbed here, so the log, the snapshot, and the caller get one value.
      const next = this.redactor.redact(change(structuredClone(read())))
      // The append is a compare-and-set: it goes at the next position of
      // the log, so a write of another host makes it fail, and no update is
      // lost.
      await this.writer.append(
        pluginStateDeltas(stored, next).map((delta) =>
          kind === 'plugins'
            ? { type: 'harness.plugin.state' as const, plugin: key, delta }
            : { type: 'harness.state' as const, key, delta },
        ),
      )
      publish(next)
      return next
    }
    // A plugin name and a shared key can be the same string.
    const chain = JSON.stringify([kind, key])
    return {
      get: async () => structuredClone(read()),
      update: (change) => {
        // One at a time, so each change starts from the value that the
        // update before it wrote.
        const run = (this.stateWrites.get(chain) ?? Promise.resolve()).then(
          () => write(change),
        )
        this.stateWrites.set(
          chain,
          run.catch(() => {}),
        )
        return run
      },
    }
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
   * steer, no running agent, and no background job of this host. The host
   * closes an idle session that no handle holds.
   */
  isIdle(): boolean {
    // A follow-up that waits for its run keeps the thread busy.
    const hasFollowUps = [...this.agentChains.values()].some(
      (chain) => chain.followUps.length > 0,
    )
    if (hasFollowUps) return false
    return (
      // A background job of this host runs in its memory. A close stops it,
      // and its end note is lost.
      this.liveJobs.size === 0 &&
      // A live wait (an `ask()`) waits in this host's memory: its answer
      // must come here, so it keeps the log. A wait that only the log keeps
      // does not: the session is idle, and an answer reaches any host.
      this.questions.size === 0 &&
      this.inputsInFlight === 0 &&
      this.activeTurn === undefined &&
      this.queue.length === 0 &&
      this.steerQueue.length === 0 &&
      ![...this.operations.values()].some(
        (operation) =>
          (operation.kind === 'agent' || operation.kind === 'command') &&
          !operation.isSettled() &&
          !this.remoteRuns.has(operation.id) &&
          !this.waitingRuns.has(operation.id),
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
   * When the thread is idle, give the log back and tell the idle listeners.
   * A thread that waits for a human (an approval, a sign-in) is idle.
   */
  protected checkIdle(): void {
    if (!this.isIdle()) return
    // The work that a lost log stopped has ended: a later write acquires the
    // log again. An idle session owns nothing.
    if (this.logWriter?.fenced) {
      this.ownershipLoss = undefined
      this.logWriter.unfence()
    }
    void this.logWriter?.rest()
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
   * Resolves when the thread is idle: no input is being stored, no turn,
   * steer, agent run, or command runs or waits, and no background job of
   * this host runs. A thread that waits for a human (an approval, a sign-in)
   * is idle. When the thread is idle now, it
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
   * A tree budget for a chain started from code. The chain counts as the
   * first call, and its own children count against the same limits. Each
   * child that the log has under the chain `chainInputId` counts too, so a
   * chain that runs again after a restart keeps its count.
   */
  protected codeBudget(chainInputId?: string): SubagentBudget {
    const root = SubagentBudget.root(this.limits())
    const logged =
      chainInputId === undefined ? 0 : this.loggedCalls(chainInputId)
    for (let call = 0; call <= logged; call += 1) root.reserve(0)
    return root.child()
  }

  /**
   * How many chains the log has under the chain `chainInputId`, at any
   * depth: one for each child that agent code started.
   */
  protected loggedCalls(chainInputId: string) {
    const nodes = [...this.writer.state.thread.tree.values()]
    const found = new Set<string>()
    const parents = [chainInputId]
    for (let parent = parents.pop(); parent !== undefined;) {
      for (const { chainInputId: child, parentChainInputId } of nodes) {
        if (parentChainInputId !== parent || child === undefined) continue
        if (found.has(child)) continue
        found.add(child)
        parents.push(child)
      }
      parent = parents.pop()
    }
    return found.size
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
  protected async addNote(text: string) {
    const note = this.redactor.scrub(text)
    const id = createMessageId()
    this.pendingNotes.push({ id, role: 'assistant', content: note })
    // The log has the note first, so a crash does not lose it.
    await this.writer.append([{ type: 'harness.note', noteId: id, note }])
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
   * The background jobs of this thread and of its child threads that did
   * not end: `bash` jobs, and calls that `moveToolCallToBackground()` moved. It reads the
   * log, so it also lists the jobs of other hosts, and after a restart.
   * `running` is `true` for a job that this host runs.
   */
  jobs(): Array<JobInfo> {
    return jobsOf(this.writer, this.threadId, this.liveJobs)
  }

  /**
   * Track a background job of this host. The log also has its start and
   * end, so recovery can note a job that a crash stopped. The record goes
   * to `threadId`, the thread of the workspace that runs the job.
   * `user` is who moved the job to the background. `label` is the
   * command or the tool name.
   */
  protected logJob(
    job: {
      jobId: string
      backendId?: string
      threadId?: string
      user?: HarnessUser
      label?: string
    },
    ended: boolean,
  ) {
    const { jobId, backendId, threadId, user, label } = job
    if (ended) this.liveJobs.delete(jobId)
    else this.liveJobs.add(jobId)
    const isOtherThread = threadId !== undefined && threadId !== this.threadId
    const record = {
      type: 'harness.job',
      jobId,
      ended,
      ...(!ended ? { at: Date.now() } : {}),
      ...(!ended && backendId !== undefined ? { backendId } : {}),
      ...(!ended && label !== undefined ? { label } : {}),
      ...storedUser(user),
      ...(isOtherThread ? { thread: threadId } : {}),
    }
    // No one waits for a job record. A failed log write fails the session.
    this.writer.append([record]).catch(() => undefined)
    // The last job ended: the host can close the session now.
    if (ended) queueMicrotask(() => this.checkIdle())
  }

  // Implemented by a later layer of the class.
  protected abstract self(): HarnessSession<THarness>
  protected abstract drain(): void
  protected abstract agentGroup(
    options: AgentGroupOptions,
    body: (group: AgentGroup) => GroupRuns | Promise<GroupRuns>,
    start: AgentStartFn,
  ): Promise<Array<unknown>>
  protected abstract pluginApi(
    user?: HarnessUser,
    metadataSchema?: SchemaInput,
    operationId?: string,
  ): PluginSessionApi
  protected abstract resumeSignIns(): Promise<void>
  /** One model call of `ctx.model.chat`. See `SessionTurnParts.modelChat`. */
  protected abstract modelChat(call: PluginModelCall): Promise<unknown>
  /** Resume the agent runs whose waits all ended. See `SessionAgents`. */
  protected abstract resumeWaitingRuns(): Promise<void>
  /** The run that started an operation, for a child run. See `SessionAgents`. */
  protected abstract parentRunOf(operationId: string): string | undefined
  /** Set the timer of the next schedule. See `SessionImpl.armSchedules`. */
  protected abstract armSchedules(options?: { isRetry?: boolean }): void
  /** @internal See `SessionRequests.resolveForRun`. */
  abstract resolveForRun(options: ResolveForRunOptions): Promise<Receipt>
  /** @internal See `SessionRequests.sendForRun`. */
  abstract sendForRun(
    message: UserInput,
    options?: SendForRunOptions,
  ): Operation<ChatTurnResult>
  /** See `SessionRequests.applyCancelInput`. */
  protected abstract applyCancelInput(options: {
    inputId: string
    user?: HarnessUser
    controlId?: string
  }): Promise<Receipt>
  /** See `SessionRequests.applySetDelivery`. */
  protected abstract applySetDelivery(options: {
    inputId: string
    delivery: 'steer' | 'queue'
    user?: HarnessUser
    controlId?: string
  }): Promise<Receipt>
  /** See `SessionState.applyConfig`. */
  protected abstract applyConfig(options: {
    key: string
    value: unknown
    user?: HarnessUser
    controlId?: string
  }): Promise<Receipt>
  /** See `SessionState.applyAnswer`. */
  protected abstract applyAnswer(options: {
    questionId: string
    value: unknown
    user?: HarnessUser
    controlId?: string
    ref?: string
  }): Promise<Receipt>
  protected abstract recoverFromLog(writer: LogWriter): Promise<void>
  protected abstract startTurn(
    input: HarnessInput & { op: 'prompt' | 'steer' | 'followUp' },
    options?: SendForRunOptions & { wake?: boolean },
  ): Operation<ChatTurnResult>
  protected abstract runAgent(
    target: string | AnyAgent,
    input: unknown,
    options: AgentRunStartOptions,
    parent?: AgentChain,
    child?: AgentChild,
  ): AgentRunImpl
}
