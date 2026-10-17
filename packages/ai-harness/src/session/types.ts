import type { CredentialStore } from '@tanstack/ai/byok'
import type {
  SubagentBudget,
  Interrupt,
  ModelMessage,
  PromptCacheOptions,
  RunAgentResumeItem,
  StreamChunk,
  UIMessage,
} from '@tanstack/ai'
import type { OperationImpl } from '../operation'
import type { RefreshFlights } from '../auth'
import type { ToolTurn } from '../tool-turn'
import type {
  AIPersistence,
  ArtifactStore,
  BlobStore,
  GenerationRunStore,
  LogStore,
} from '@tanstack/ai-persistence'
import type { InputState, LogViewHooks, LogWriter } from '../log'
import type { ConfigOption } from '../config'
import type { SessionUsage } from '../usage'
import type { AgentInputOf, AgentResultOf, AnyAgent } from '../agents'
import type { Wait } from '../waits'
import type { AnyHarness, HarnessAgentsOf } from '../define'
import type {
  HarnessPersistence,
  Retention,
  SessionIndexWriter,
  SubmitInput,
} from '../host'
import type { PluginLifetime } from '../plugins'
import type { HostPlugins } from '../host-plugins'
import type {
  AgentRun,
  ChatTurnResult,
  Cursor,
  HarnessInput,
  Operation,
  PendingQuestion,
  Principal,
  ResolveOptions,
  ThreadSettings,
  TurnOverrides,
  UserInput,
  WaitingInput,
} from '../types'

/** Options for `session.schedule`. */
export interface ScheduleOptions {
  /** When the input runs, in epoch milliseconds. A time that passed runs at once. */
  at: number
  /** The input to run then. Any input that `host.submit` takes. */
  input: SubmitInput
  /**
   * The id of the schedule, for `cancelSchedule`. A second call with the
   * id of a schedule that waits writes nothing. Default: a new id.
   */
  scheduleId?: string
  /** Who sends the input when it runs. Default: the principal of the open. */
  principal?: Principal
}

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
   * or its error. This also occurs when the host stopped during the run.
   */
  wake?: boolean
  /**
   * When the host stops during the run, the host that takes over runs the agent again with the same input, instead of failing
   * it. The agent code runs again from its start: put each side effect in
   * `ctx.harness.step.do(name, fn)`, so a finished step returns its
   * stored value.
   * Its `ctx.chat` calls continue from their saved transcript. After
   * `durability.maxAttempts` runs (default 10), the run fails with
   * `attempts_exhausted`. A host without `stores.log` throws at start.
   */
  resume?: boolean
  /**
   * Who starts the agent. The run, its credentials, and its wake turn are
   * theirs. Default: the principal that opened the session. In a tool, pass
   * the user of the tool call: `ctx.context.run.principal`.
   */
  principal?: Principal
}

/**
 * The options of an agent run inside the session. `offered`: the run starts
 * from an input that another host offered. It keeps the input id, and the
 * run id that the host which offered it follows in the log. A submitted
 * input has no run id.
 */
export type AgentRunStartOptions = AgentStartOptions & {
  offered?: { inputId: string; runId?: string }
}

/** One agent run as a child of the session thread. */
export interface AgentChild {
  /** The run id of the child. Its index entry is `subagent:<subagentRunId>`. */
  subagentRunId: string
  /** The agent tool call that started the run. */
  parentToolCallId?: string
  /** Text for an agent without `inputSchema`: one user message at the end. */
  prompt?: string
}

export type RunArgs<TAgent, TOptions> =
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
  /**
   * `queued`: a follow-up that waits for the run before it. `waiting`: the
   * run stopped for its waits (an approval, a sign-in), and an answer
   * resumes it. See `pendingWaits`.
   */
  status: 'running' | 'queued' | 'waiting' | 'completed' | 'failed' | 'cancelled'
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
  /** The interrupts of `pendingWaits`, as the last turn stopped for them. */
  pendingInterrupts: Array<Interrupt>
  /**
   * The questions of `pendingWaits` that a command or a plugin asked,
   * waiting for `session.answer`.
   */
  pendingQuestions: Array<PendingQuestion>
  /**
   * Every wait that is open: the interrupts of the last turn, then the
   * questions and the human waits, oldest first. Read the kind with
   * `waitKind`. A session always sets it. A snapshot built by hand (a test
   * fixture) can leave it out.
   */
  pendingWaits?: Array<Wait>
  /** The state of each plugin that uses `ctx.state`, by plugin name. */
  plugins: Record<string, unknown>
  /** The token usage of the thread, the same as `session.usage()`. */
  usage: SessionUsage
  /** The cursor of the newest event. */
  cursor: Cursor
}

/** The resolved plugin plan of a session, for debugging and tooling. */
export interface SessionInspection {
  /** Each plugin, in mount order, with the capability names it uses. */
  plugins: Array<{
    name: string
    lifetime: PluginLifetime
    requires: Array<string>
    provides: Array<string>
  }>
  tools: Array<{ name: string; owner: string }>
  prompts: Array<{ id: string; owner: string }>
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
  credentials: CredentialStore
  /**
   * The credential store that the app gave the host, shared by every host.
   * A secret answer goes through it to the host that owns the log. Without
   * it, a secret answer that reaches another host is refused.
   */
  sharedCredentials?: CredentialStore
  /**
   * The OAuth refreshes that run now, shared by every session of the host,
   * so one host refreshes a token once. Without it, the session has its own.
   */
  refreshes?: RefreshFlights
  /** Where media lives: file records, bytes, and generation runs. */
  media: AIPersistence<{
    artifacts: ArtifactStore
    blobs: BlobStore
    generationRuns: GenerationRunStore
  }>
  principal?: Principal
  /** The tenant of the session. Without it, the default tenant. */
  tenantId?: string
  /** Writes the session index entry of the thread. */
  index: SessionIndexWriter
  /** How much the session keeps in memory. */
  retention: Retention
  /** The plugins with `lifetime: 'host'` that the host shares. */
  hostPlugins: HostPlugins
  /** The session log. */
  log: {
    store: LogStore
    /** The view of this session in its shared log. */
    open: (threadId: string, hooks: LogViewHooks) => Promise<LogWriter>
  }
  /**
   * The id of the log of the session in the store: its tenant and its
   * thread id (see `logIdOf`). The records of the log with no `thread`
   * field belong to this thread. Its child threads write to it too.
   */
  storeLogId: string
  /** The `promptCache` of `host.open()`. It overrides the harness value. */
  promptCache?: PromptCacheOptions
  /** Gets each event the session publishes, after the feed has it. */
  onEvent: (event: StreamChunk) => void
  onClose: () => void
  /**
   * Called each time the thread goes idle. The host starts the idle close of
   * a session that no handle holds.
   */
  onIdle?: () => void
  /**
   * The host checks access (`access` on the host). Then an entry with no
   * owner stays without one, and provider keys read env vars only with
   * `envKeys`.
   */
  access?: { envKeys: boolean }
}

export interface QueuedTurn {
  operation: OperationImpl<ChatTurnResult>
  message?: UserInput
  resume?: Array<RunAgentResumeItem>
  /** A resolve: the interrupted turn it answers. */
  answers?: InterruptedTurn
  /** A `resume` input: the interrupted run it continues. */
  parentRunId?: string
  inputId?: string
  /** Per-run system/developer messages prepended ahead of harness prompts. */
  systemPreamble?: Array<string>
  /** A `tool()`: its only model call asks for this tool. */
  tool?: ToolTurn
  /** The settings of this one turn. The log keeps the JSON ones. */
  overrides?: TurnOverrides
  /** The `ephemeral` messages of the input. The log keeps them, as `overrides`. */
  ephemeral?: ReadonlyArray<ModelMessage>
  /** Who sent the input. Its credentials and keys run the turn. */
  principal?: Principal
  /** The `context` of the input. */
  context?: unknown
  /** A wake input of the harness: its user message gets `metadata.harness.wake`. */
  wake?: boolean
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
export interface WaitingSteer {
  inputId: string
  message: UserInput
  operation?: OperationImpl<ChatTurnResult>
  /** Used only when the steer runs as its own turn. A join ignores them. */
  overrides?: TurnOverrides
  /** Used only when the steer runs as its own turn, as `overrides`. */
  ephemeral?: ReadonlyArray<ModelMessage>
  /** Used only when the steer runs as its own turn, as `overrides`. */
  systemPreamble?: Array<string>
  principal?: Principal
  /** Used only when the steer runs as its own turn, as `overrides`. */
  context?: unknown
  /** A wake input of the harness, as in `QueuedTurn`. */
  wake?: boolean
}

/** The interrupts the last turn stopped for, and how a resolve continues it. */
export interface InterruptedTurn {
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

/** What `resolveForRun` takes: the `resolve` options, plus the run id. */
export interface ResolveForRunOptions extends ResolveOptions {
  principal?: Principal
  /** The AG-UI `runId` of a `POST run` request. The turn runs as it. */
  runId?: string
}

/** An agent run operation. `send` adds a message to its chain. */
export type AgentRunImpl = OperationImpl<unknown> & AgentRun<unknown>

/** A message to an agent run: a steer or a follow-up. */
export interface AgentMessage {
  inputId: string
  message: UserInput
  principal?: Principal
}

/** One run of an agent chain, and who it runs for. */
export interface AgentRunEntry {
  operation: AgentRunImpl
  principal?: Principal
}

/**
 * The runs of one agent start: the first run, then one run per follow-up.
 * They share one thread, `<threadId>:<name>:<runInputId>`, and one tree
 * budget.
 */
export interface AgentChain {
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
  /**
   * Every run that started and that the session still keeps, oldest first.
   * A run leaves it when it falls out of the window of settled agent runs.
   */
  runs: Array<AgentRunEntry>
  /** Steers that wait for the current run's next model call. */
  steers: Array<AgentMessage>
  /** Follow-ups that run after the current run ends, in order. */
  followUps: Array<AgentMessage & { operation: AgentRunImpl }>
  /** The chains that agent code of this chain started. */
  children: Set<AgentChain>
}

/** What one run of a chain applies. */
export interface AgentRunStart {
  /** The input this run applies. */
  inputId: string
  /** The follow-up message this run adds to the chain's thread. */
  message?: AgentMessage
  /** Recovery runs again a run whose host stopped. */
  resumed?: boolean
  /** The agent tool call that started a first run. */
  child?: AgentChild
  /**
   * The answers to the interrupts that the run waited for: the run goes on
   * from its stopped chat run `interruptedRunId`.
   */
  answers?: {
    resume: Array<RunAgentResumeItem>
    interruptedRunId: string
    subagentRunId: string
    /** The connectors whose sign-in the user cancelled. */
    declined: ReadonlyArray<string>
  }
}

/** The `agent` input of a first run, as the log keeps it. */
export type AgentInputState = InputState & {
  input: Extract<HarnessInput, { op: 'agent' }>
}
