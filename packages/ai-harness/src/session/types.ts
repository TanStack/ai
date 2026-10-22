import type { CredentialStore } from '@tanstack/ai/byok'
import type {
  SubagentBudget,
  Interrupt,
  Logger,
  ModelMessage,
  PromptCacheOptions,
  RunAgentResumeItem,
  StreamChunk,
  UIMessage,
} from '@tanstack/ai'
import type { OperationImpl } from '../operation'
import type { ObservabilityOptions } from '../observability'
import type { HeldPlugins } from './helpers'
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
import type { SessionUsage, UsageCall } from '../usage'
import type { SessionImpl } from './harness-session'
import type { AgentInputOf, AgentResultOf, AnyAgent } from '../agents'
import type { PendingWait } from '../waits'
import type { HandoffRecord } from '../log-records'
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
  HarnessUser,
  Receipt,
  ResolveOptions,
  RunNode,
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
  /** Who sends the input when it runs. Default: the user of the open. */
  user?: HarnessUser
}

/** Options for running an agent from code: the options of `start` without `startTurnWhenDone`. */
export type AgentRunOptions = Omit<AgentStartOptions, 'startTurnWhenDone'>

/** What the `onModelError` option of an agent run gets. */
export interface AgentModelErrorContext {
  /** The id of the agent run. */
  runId: string
  /** The name of the agent. */
  agent: string
  error: { message: string; code?: string; retryAfterMs?: number }
  /** The model calls of this run that failed before this one. */
  retries: number
  /** Aborted when the run is cancelled. */
  signal: AbortSignal
}

/** Options for starting an agent in the background. */
export interface AgentStartOptions {
  /**
   * Add a short note with the result or the error to the transcript, so the
   * main model learns about it on its next turn. `false` adds nothing.
   * Default `true`.
   */
  addResultNote?: boolean
  /**
   * When the agent finishes or fails, start a new chat turn with its result
   * or its error. This also occurs when the host stopped during the run.
   */
  startTurnWhenDone?: boolean
  /**
   * When the host stops during the run, the host that takes over runs the agent again with the same input, instead of failing
   * it. The agent code runs again from its start: put each side effect in
   * `ctx.harness.step.do(name, fn)`, so a finished step returns its
   * stored value.
   * Its `ctx.chat` calls continue from their saved transcript. After
   * `durability.maxAttempts` runs (default 10), the run fails with
   * `attempts_exhausted`.
   */
  runAgainAfterCrash?: boolean
  /**
   * Who starts the agent. The run, its credentials, and its wake turn are
   * theirs. Default: the user that opened the session. In a tool, pass
   * the user of the tool call: `ctx.context.run.user`.
   */
  user?: HarnessUser
  /**
   * The run that starts the agent, in a tool: `ctx.context.run`. When it
   * names an agent run of this session that runs, the agent is a child of
   * that run, as `ctx.harness.agents` starts it. It then counts in the tree
   * and the budget of that run, and runs for its user. It takes no
   * `maxConcurrent` slot, so the run can await it. Without it, a start of
   * `ctx.agents` in a plugin tool that an agent run calls is a child of that
   * run too, when no other run of the session is in a tool call. A running
   * turn of this session (the run of a tool of the main model) gives a
   * top-level run. Any other run id throws: an unknown id, a run of another
   * session, a run that ended, an older run of a chain, or a run that
   * another host runs. `null`: a top-level run, which takes a
   * `maxConcurrent` slot.
   */
  parent?: { runId: string } | null
  /**
   * The durable name of the run in a group or in a run started with
   * `runAgainAfterCrash: true`. When the parent runs again, a start with the same key
   * gets the run it started before.
   */
  key?: string
  /**
   * Limits of this run. `timeoutMs`: the run fails with code `timeout` after
   * this time. It is never later than the deadline of the parent run.
   * `maxAttempts`: replaces `durability.maxAttempts` for this run.
   */
  limits?: { timeoutMs?: number; maxAttempts?: number }
  /**
   * The model use of this run and its children. The run fails with code
   * `budget` after the first model call over it.
   */
  budget?: { maxTokens?: number; maxCost?: number }
  /**
   * What to do when a model call of this run fails before it streams
   * output. Only that model call runs again, after a short backoff (or the
   * `retryAfterMs` of the error, up to 5 s), so a tool that ran before does
   * not run twice. One model call runs at most 3 times. A tool that throws,
   * or an error of the agent code, does not count.
   *
   * - `{ retries, transientOnly }`: retry up to `retries` times. With
   *   `transientOnly` (default `true`), only an error that
   *   `isTransientModelError` finds transient. The log keeps this form, so
   *   a run that another host takes over or resumes retries too.
   * - A function: return `'retry'` or `'fail'`. The log keeps no function:
   *   a run that another host takes over runs without it.
   */
  onModelError?:
    | { retries: 1 | 2; transientOnly?: boolean }
    | ((
        ctx: AgentModelErrorContext,
      ) => 'retry' | 'fail' | Promise<'retry' | 'fail'>)
}

/**
 * The options of an agent run inside the session. `offered`: the run starts
 * from an input that another host offered. It keeps the input id, and the
 * run id that the host which offered it follows in the log. A submitted
 * input has no run id. `inputId`: the input id of the run, from its key in
 * the run that starts it, so a run again finds the same child. `ready`: a
 * child that waits for a slot of its group starts when it resolves `true`,
 * and ends cancelled on `false`. A rejection fails the run. `enter`: a
 * child of a group enters the group with it, once, as its start admits it
 * (see `SessionAgents.admitStart`).
 */
export type AgentRunStartOptions = AgentStartOptions & {
  offered?: { inputId: string; runId?: string }
  inputId?: string
  ready?: Promise<boolean>
  enter?: (admit?: () => void) => true | Promise<boolean>
}

/** Start one agent run. `start`, `run`, and `group` of `AgentActions` use it. */
export type AgentStartFn = (
  target: string | AnyAgent,
  input: unknown,
  options: AgentRunStartOptions,
) => AgentRunImpl

/** The runs that the body of a `group` returns. */
export type GroupRuns = ReadonlyArray<AgentRun<unknown>>

/** One agent run as a child of the session thread. */
export interface AgentChild {
  /** The run id of the child. Its index entry is `subagent:<subagentRunId>`. */
  subagentRunId: string
  /** The agent tool call that started the run. */
  parentToolCallId?: string
  /** Text for an agent without `inputSchema`: one user message at the end. */
  prompt?: string
  /** The turn whose tool started the run. */
  turnRunId?: string
  /**
   * The subagent tree budget of the turn, for a start from a tool-mode
   * child. The start took a call of it already.
   */
  budget?: SubagentBudget
  /** The plugins of the turn that started the run. */
  plugins?: HeldPlugins
}

export type RunArgs<TAgent, TOptions> =
  AgentInputOf<TAgent> extends undefined
    ? [input?: undefined, options?: TOptions]
    : [input: AgentInputOf<TAgent>, options?: TOptions]

/**
 * Run one agent of a session, typed from its definition. `run` and `start`
 * are the calls of `AgentActions` with the agent already given.
 */
export interface AgentHandle<TAgent> {
  run: (
    ...args: RunArgs<TAgent, AgentRunOptions>
  ) => AgentRun<AgentResultOf<TAgent>>
  start: (
    ...args: RunArgs<TAgent, AgentStartOptions>
  ) => AgentRun<AgentResultOf<TAgent>>
}

/** A handle for an agent picked by name at runtime. */
export interface DynamicAgentHandle {
  run: (input?: unknown, options?: AgentRunOptions) => AgentRun<unknown>
  start: (input?: unknown, options?: AgentStartOptions) => AgentRun<unknown>
}

/** `session.agents`: one typed handle per registered agent name. */
export type AgentHandles<THarness> = {
  [TAgent in HarnessAgentsOf<THarness> as TAgent['name']]: AgentHandle<TAgent>
}

/** One agent run, as `session.agentRuns()` lists it. */
export interface AgentRunInfo {
  operationId: string
  /** The id of the run in the run tree: the same as `operationId`. */
  runId: string
  kind: 'agent'
  agent: string
  /**
   * The id of the run as a child of the session thread
   * (`AgentRun.subagentRunId`). A run that did not start yet has none.
   */
  subagentRunId?: string
  /**
   * `queued`: a follow-up that waits for the run before it. `waiting`: the
   * run stopped for its waits (an approval, a sign-in), and an answer
   * resumes it. See `pendingWaits`.
   */
  status:
    | 'running'
    | 'queued'
    | 'waiting'
    | 'completed'
    | 'failed'
    | 'cancelled'
  /**
   * The run that started this run: the agent run whose code started it, or
   * the turn whose tool started it.
   */
  parentRunId?: string
  /** Who the run runs for. */
  user?: HarnessUser
  /** The model use the run can have (`AgentStartOptions.budget`). */
  budget?: RunNode['budget']
  /** The raw result of a run that completed, as `agentResult` gives it. JSON. */
  result?: unknown
  /** Why the run failed. */
  error?: RunNode['error']
}

/**
 * A background job that started and did not end, as `session.jobs()` lists
 * it: a `bash` job, or a call that `session.moveToolCallToBackground()` moved.
 */
export interface JobInfo {
  jobId: string
  /** The thread of the workspace that runs the job. */
  threadId: string
  /** The id of its process in the workspace backend, when it has one. */
  backendId?: string
  /** Who moved the call to the background. */
  user?: HarnessUser
  /** When the job started, in epoch ms. */
  startedAt?: number
  /** The command, or the name of the tool. */
  label?: string
  /** This host runs the job. Else another host runs it, or a crash stopped it. */
  running: boolean
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
   * The inputs that wait, in the order they run: `session.waitingInputs()`. A
   * session always sets it. A snapshot built by hand (a test fixture) can
   * leave it out.
   */
  waitingInputs?: Array<WaitingInput>
  /**
   * Every wait that is open: the interrupts of the last turn, then the
   * waits of the log (background agent runs, questions, human waits),
   * oldest first. `kind` says what each one waits for. A wait with an
   * `interrupt` takes `resolve`, the others take `answer`.
   */
  pendingWaits: Array<PendingWait>
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
  /** The stored settings of the thread (`session.updateThreadSettings`). */
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
  user?: HarnessUser
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
   * A `step.sleep` of the session started to wait longer than
   * `LONG_SLEEP_MS`, and the session has no background job. The host ends
   * the attempt of a session that only a worker holds (see `sleepUntil`).
   */
  onLongSleep?: () => void
  /**
   * The host checks access (`access` on the host). Then an entry with no
   * owner stays without one, and provider keys read env vars only with
   * `allowServerEnvKeys`.
   */
  access?: { allowServerEnvKeys: boolean }
  /**
   * Open a session of `harness` on a child thread of this log, for
   * `harnessAgent`. The host sets it.
   */
  openChild?: OpenChildSession
  /** Set on a child session only: what it takes from its parent. */
  child?: ChildSessionLink
  /** The `observability` option of the host: spans and `onOperation`. */
  observability?: ObservabilityOptions
  /** The `logger` of the host, safe to call: it never throws. */
  logger: Logger
}

/** What a child session of `harnessAgent` takes from its parent. */
export interface ChildSessionLink {
  /** The root thread of the tree. The child reads the credentials of the root. */
  rootThreadId: string
  /** The thread of the session that started the child. Its index entry names it. */
  parentThreadId: string
  /**
   * Count one model call of the child in the run that started it, and check
   * the budget of that run. The child keeps no usage of its own.
   */
  countUsage: (call: UsageCall) => Promise<void>
}

/** A child session of `harnessAgent` that a run of a session has open. */
export interface HarnessChild {
  session: SessionImpl
  /** Answer waits of the child. Its run goes on with the answers. */
  answer: (options: ResolveForRunOptions) => Promise<Receipt>
}

/** See {@link SessionDependencies.openChild}. */
export type OpenChildSession = (
  harness: AnyHarness,
  options: {
    threadId: string
    user: HarnessUser | undefined
    child: ChildSessionLink
  },
) => Promise<SessionImpl>

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
  /** A `runTool()`: its only model call asks for this tool. */
  tool?: ToolTurn
  /** The settings of this one turn. The log keeps the JSON ones. */
  overrides?: TurnOverrides
  /** The `ephemeral` messages of the input. The log keeps them, as `overrides`. */
  ephemeral?: ReadonlyArray<ModelMessage>
  /** Who sent the input. Its credentials and keys run the turn. */
  user?: HarnessUser
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
  /** A `continueWithoutMessage()`: it runs only when the model can answer the transcript. */
  isContinue?: boolean
  /**
   * `send(text, { as: 'operator' })`: `message` goes in the transcript as
   * the reply of an operator, and no model runs.
   */
  operator?: boolean
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
  user?: HarnessUser
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
   * The part that stopped also handed off. Its record is in the log. The
   * resolve ends the part after the answered tools, and the target runs (or
   * the session pauses, for a person).
   */
  handoff?: Omit<HandoffRecord, 'runId'>
  /**
   * Who sent the input of the stopped turn. Only this user's saved
   * credential answers its sign-ins.
   */
  user?: { id: string; tenantId?: string }
  /** The `context` of the stopped turn's input, so the resume sees it too. */
  context?: unknown
}

/** What `resolveForRun` takes: the `resolve` options, plus the run id. */
export interface ResolveForRunOptions extends ResolveOptions {
  user?: HarnessUser
  /** The AG-UI `runId` of a `POST run` request. The turn runs as it. */
  runId?: string
}

/** An agent run operation. `send` adds a message to its chain. */
export type AgentRunImpl = OperationImpl<unknown> & AgentRun<unknown>

/** A message to an agent run: a steer or a follow-up. */
export interface AgentMessage {
  inputId: string
  message: UserInput
  user?: HarnessUser
}

/** One run of an agent chain, and who it runs for. */
export interface AgentRunEntry {
  operation: AgentRunImpl
  user?: HarnessUser
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
  user?: HarnessUser
  /** The run whose agent code started this chain. */
  parentRunId?: string
  /** The `agent` input of the chain whose code started this chain. */
  parentChainInputId?: string
  /**
   * Gives back the call that the start of this chain took from its parent's
   * tree budget. A start that fails before its run applies calls it once.
   */
  release?: () => void
  /**
   * The turn whose tool started this chain. Only the run tree keeps it: the
   * run record does not, so core does not show the run as a child of the
   * turn.
   */
  turnRunId?: string
  budget: SubagentBudget
  /**
   * The plugins of the turn that started this chain, or the chain above it.
   * A run of the chain gets them while they are not disposed.
   */
  plugins?: HeldPlugins
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
  /**
   * Recovery starts a top-level run whose start waited for a slot when its
   * host stopped. The log has its input, so the run waits for a slot again.
   */
  queued?: boolean
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
