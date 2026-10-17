import type {
  AnyTextAdapter,
  AnyTool,
  ContentPart,
  Interrupt,
  KeyedAdapter,
  ModelMessage,
  PromptCacheOptions,
  ProviderKeys,
  ReasoningOption,
  RunAgentResumeItem,
  StreamChunk,
} from '@tanstack/ai'
import type { LogRecord } from '@tanstack/ai-persistence'
import type { CredentialsAccess } from './auth'
import type { UsageCounts } from './usage'

/** A user message: plain text, or content parts (text, images, files). */
export type UserInput = string | Array<ContentPart>

/**
 * Settings for one chat turn: `session.send(message, { overrides })` or
 * `session.send(message, { mode: 'followUp', overrides })`. They apply to every model call
 * of the turn, retries included. The rest of the session keeps its defaults.
 *
 * They are not part of the input: the `inputId` duplicate check does not
 * read them. The log keeps the JSON ones (`model`, `modelOptions`,
 * `reasoning`, and `promptCache`), so a turn that recovery runs again after
 * a restart uses them too. `adapter` and `tools` are objects, so they live
 * only in memory: a turn that recovery runs again goes on without them, with
 * a warning. Name the model with `model` to keep it. A steer that joins a
 * running turn uses the overrides of that turn.
 *
 * @example
 * ```ts
 * session.send('Plan the migration.', {
 *   overrides: { reasoning: { level: 'high', summary: true }, tools: [planTool] },
 * })
 * ```
 */
export interface TurnOverrides {
  /** Replaces the harness adapter and every plugin pick for this turn. */
  adapter?: AnyTextAdapter | KeyedAdapter<AnyTextAdapter>
  /**
   * A model by name, from `defineHarness({ models })`, for this turn. It
   * replaces the stored model, the plugin picks, and the harness adapter.
   * `adapter` wins over it. An unknown name fails the turn.
   */
  model?: string
  /** Replaces `HarnessConfig.modelOptions` for this turn. JSON. */
  modelOptions?: Record<string, unknown>
  /** Replaces `HarnessConfig.reasoning` for this turn. */
  reasoning?: ReasoningOption
  /** Replaces the session and harness values for this turn, field by field. */
  promptCache?: PromptCacheOptions
  /**
   * Added to the static tools of this turn. A name that a static tool has
   * fails the turn. Durable tools get `step` and `append`.
   */
  tools?: ReadonlyArray<AnyTool>
}

/**
 * What a `send` (mode `'prompt'`) does when a chat turn is already running:
 * - `queue` (default): runs as a new turn after the current one settles.
 * - `steer`: joins the running turn at its next model call.
 * - `reject`: refuses the prompt.
 */
export type BusyPolicy = 'queue' | 'steer' | 'reject'

/** Options of `session.send` for a message to the session. See `send`. */
export type SendOptions = {
  to?: undefined
  inputId?: string
  principal?: Principal
  context?: unknown
  overrides?: TurnOverrides
  ephemeral?: ReadonlyArray<ModelMessage>
  /** System prompts ahead of the harness prompts, from server code only. */
  systemPreamble?: Array<string>
  /** @internal The AG-UI `runId` of a `POST run` request. The turn runs as it. */
  runId?: string
} & (
  | { mode?: 'prompt'; busy?: BusyPolicy }
  | { mode: 'steer' | 'followUp'; busy?: never }
)

/** Options of `session.send` for a message to an agent run. See `send`. */
export interface AgentSendOptions {
  /** The operation id of the agent run. Any run of its chain works. */
  to: string
  /** Default `'steer'`. See `AgentRun.send`. */
  mode?: 'steer' | 'followUp'
  inputId?: string
  principal?: Principal
}

/** Kinds of work a session runs. */
export type OperationKind = 'chat' | 'agent' | 'command' | 'compact'

export type OperationStatus =
  | 'accepted'
  | 'running'
  | 'interrupted'
  | 'completed'
  | 'failed'
  | 'cancelled'

/** The immediate answer to an input. `applied` arrives later as an event. */
export type Receipt = { inputId: string } & (
  | {
      status: 'accepted' | 'queued'
      /** The operation that runs the input, when the session knows it already. */
      operationId?: string
    }
  | { status: 'rejected'; reason: string; operationId?: never }
)

/** Opaque position in a session's event stream. */
export type Cursor = string

/** One event in a session's ordered stream. */
export interface SessionEvent {
  cursor: Cursor
  /** The operation that produced the event. */
  operationId: string
  event: StreamChunk
}

/**
 * The event an `onEvent` listener gets, at the moment the session publishes
 * it. It has no cursor: to read events again after a restart, use
 * `events({ from })`.
 */
export interface LiveEvent<TEvent extends StreamChunk = StreamChunk> {
  /** The operation that produced the event. */
  operationId: string
  event: TEvent
}

/** The `type` of an AG-UI event, as a string: `'TEXT_MESSAGE_CONTENT'`. */
export type StreamChunkType = `${StreamChunk['type']}`

/** The AG-UI event whose `type` is `TType`. */
export type StreamChunkOf<TType extends StreamChunkType> =
  StreamChunk extends infer TEvent
    ? TEvent extends StreamChunk
      ? `${TEvent['type']}` extends `${TType}`
        ? TEvent
        : never
      : never
    : never

/**
 * Call `listener` for each event, as the session publishes it. Pass a `type`
 * first to get only the events of that type. Returns a function that stops
 * the calls.
 *
 * The session calls listeners in order, right after it publishes the event.
 * A listener that throws does not stop the turn. Keep listeners fast: a slow
 * listener slows the stream.
 *
 * @example
 * ```ts
 * const stop = session.onEvent('TEXT_MESSAGE_CONTENT', ({ event }) => {
 *   process.stdout.write(event.delta)
 * })
 * await session.send('Write a haiku.')
 * stop()
 * ```
 */
export interface OnEvent {
  (listener: (entry: LiveEvent) => void): () => void
  <TType extends StreamChunkType>(
    type: TType,
    listener: (entry: LiveEvent<StreamChunkOf<TType>>) => void,
  ): () => void
}

/**
 * An input a client sends to a session. Stored in the session log. While
 * another host owns the thread, it waits in the input lane of the log.
 *
 * `inputId` is an optional id that the caller chooses. A second input with the
 * same id and the same payload gets the first input's receipt and does not run
 * again. The same id with another payload is rejected with `'conflict'`.
 *
 * `context` is JSON data the client sends with a message, for example the
 * screen the user is on. It is stored with the input, so a turn that runs
 * again after a restart sees the same value. It is client data: do not trust
 * it. Who sent the input is the principal from `authorize`, not a field here.
 *
 * In `cancelInput` and `setDelivery`, `inputId` is the input that waits.
 *
 * `ephemeral` of `prompt` and `continue` are messages for the model calls of
 * that turn only, as in `session.prompt`. The log does not keep them, and
 * the duplicate check does not read them. Client data: do not trust it.
 */
export type HarnessInput = (
  | {
      op: 'prompt'
      message: UserInput
      busy?: BusyPolicy
      context?: unknown
      ephemeral?: ReadonlyArray<ModelMessage & { role: 'user' }>
    }
  | { op: 'steer'; message: UserInput; context?: unknown }
  | {
      op: 'followUp'
      message: UserInput
      context?: unknown
      /**
       * The harness wrote this input to wake the session, for example when a
       * background agent ended. Its user message gets
       * `metadata.harness.wake: true`. Only the harness sets it: the input
       * of a client never has it.
       */
      wake?: true
    }
  /** A turn from the stored transcript, with no new message. */
  | {
      op: 'continue'
      context?: unknown
      ephemeral?: ReadonlyArray<ModelMessage & { role: 'user' }>
    }
  | { op: 'resolve'; resume: Array<RunAgentResumeItem> }
  | {
      op: 'agent'
      agent: string
      input?: unknown
      detached?: boolean
      /** Run again after a host stop. See `AgentStartOptions.resume`. */
      resume?: boolean
      /** `'none'`: no note for the main model. See `AgentRunOptions.attach`. */
      attach?: 'none'
      /** The run whose agent code started this run. */
      parentRunId?: string
    }
  | { op: 'cancel'; operationId?: string }
  /** Move a running tool call to the background. See `session.background`. */
  | { op: 'background'; toolCallId?: string }
  | { op: 'cancelInput'; inputId: string }
  | {
      op: 'setDelivery'
      inputId: string
      delivery: WaitingInput['delivery']
    }
  | { op: 'command'; name: string; input?: unknown }
  | { op: 'answer'; questionId: string; value: unknown }
  | { op: 'config'; key: string; value: unknown }
  /** Run one tool in `expose.tools` with no model. See `session.tool`. */
  | { op: 'tool'; name: string; args?: unknown; meta?: Record<string, unknown> }
  /** Add host records of the types in `expose.records`. See `session.append`. */
  | { op: 'append'; records: Array<LogRecord> }
  | { op: 'configure'; settings: ThreadSettingsChange }
  | { op: 'reset'; note?: string }
  | { op: 'revert'; messageId: string }
  | { op: 'unrevert' }
  | {
      op: 'agentMessage'
      /** A run of the agent: any run of its chain. */
      operationId: string
      message: UserInput
      /** Default `'steer'`. See `AgentRun.send`. */
      mode?: 'steer' | 'followUp'
      /** The input id of the chain's first run. The session sets it. */
      run?: string
    }
) & { inputId?: string }

/**
 * An input that waits to run. `session.inputs()` lists them. Change one with
 * the `cancelInput` and `setDelivery` inputs.
 */
export interface WaitingInput {
  inputId: string
  /**
   * - `steer`: it joins the running turn at the next model call. When the
   *   turn makes no more model calls, it runs as the next turn.
   * - `queue`: it runs as its own turn, after the turns before it.
   */
  delivery: 'steer' | 'queue'
  /** The user message of the input. */
  message: UserInput
}

/**
 * Where a fork cuts the transcript, by message id. `before` keeps the
 * messages before that message. `through` keeps that message too.
 */
export type ForkPoint = { before: string } | { through: string }

/**
 * The stored settings of one thread. They apply from the next turn, stay
 * after a restart (the session log keeps them), and a fork copies them. A
 * turn's `overrides` win over them.
 */
export interface ThreadSettings {
  /** A name from `defineHarness({ models })`. */
  model?: string
  /** The `reasoning` of every turn, as `chat({ reasoning })` takes it. */
  reasoning?: ReasoningOption
  /** Text added as the last system prompt of every turn. */
  instructions?: string
  /** Exactly these tools (by name), or every tool but the `remove` ones. */
  tools?: Array<string> | { remove: Array<string> }
  /** Plugins whose tools, prompts, and middleware the turns leave out. */
  plugins?: { remove: Array<string> }
  /**
   * The working folder of the thread, from the root of the workspace tools.
   * A folder outside that root is refused when a tool uses it.
   */
  cwd?: string
}

/** A change to {@link ThreadSettings}: `null` clears a field, a missing field stays. */
export type ThreadSettingsChange = {
  [Key in keyof ThreadSettings]?: ThreadSettings[Key] | null
}

// The options that a session, a client, and a view source share. A session
// takes more: `principal` (who acts), and an `inputId` on every input.

/** What `resolve` takes: the answers to the interrupts of the last turn. */
export interface ResolveOptions {
  resume: Array<RunAgentResumeItem>
  /** An id you choose: a second call with the same id is a duplicate. */
  inputId?: string
}

/** What `cancel` takes. Without `operationId`, it stops the running turn. */
export interface CancelOptions {
  operationId?: string
}

/** What `command` takes: the plugin command `name`, and its `input`. */
export interface CommandOptions {
  name: string
  input?: unknown
}

/** What `configure` takes: the change to the stored settings of the thread. */
export interface ConfigureOptions {
  settings: ThreadSettingsChange
  /** An id you choose: a second call with the same id is a duplicate. */
  inputId?: string
}

/** What `reset` takes: the `note` that the model sees first, if any. */
export interface ResetOptions {
  note?: string
  /** An id you choose: a second call with the same id is a duplicate. */
  inputId?: string
}

/** A file to store in the media store of a thread. */
export interface MediaUpload<TBody> {
  body: TBody
  mimeType: string
  name: string
}

/** How an input ended. `session.settled(inputId)` resolves to it. */
export type InputSettlement = {
  inputId: string
  /** The operation that ran the input, when one started. */
  operationId?: string
} & (
  | {
      /**
       * `interrupted`: the turn stopped for human input. The `resolve` that
       * answers it is a new input with its own settlement.
       */
      outcome: 'completed' | 'aborted' | 'interrupted'
      error?: never
    }
  | {
      outcome: 'failed'
      /** `code` is `'attempts_exhausted'`, `'timeout'`, or absent. */
      error: { message: string; code?: string }
    }
)

/** The `outcome` of a settlement, with its `error` when it failed. */
export type SettlementOutcome = InputSettlement extends infer S
  ? S extends InputSettlement
    ? Omit<S, 'inputId' | 'operationId'>
    : never
  : never

/**
 * An awaited operation rejects with this error when the session refused its
 * input (for example `busy: 'reject'` while a turn runs, or an `inputId`
 * conflict). `receipt` is the refused receipt.
 */
export class InputRejectedError extends Error {
  readonly receipt: Receipt

  constructor(receipt: Receipt) {
    super(
      rejectionMessage(
        receipt.status === 'rejected' ? receipt.reason : 'not rejected',
      ),
    )
    this.name = 'InputRejectedError'
    this.receipt = receipt
  }
}

function rejectionMessage(reason: string) {
  if (reason === 'busy') return 'A chat turn is already running.'
  if (reason === 'conflict') {
    return 'An earlier input has this inputId and another payload.'
  }
  return `The session rejected the input: ${reason}.`
}

/** Who sent an input, from the host's `authorize`. */
export interface Principal {
  id: string
  name?: string
  /**
   * The organization of the principal. The credential scope gets it, so two
   * organizations' credentials for one user stay apart.
   */
  tenantId?: string
}

/**
 * One run of a session: a chat turn, an agent run, or a command. Each run has
 * its own user, so a tool of one run never gets the credentials of another
 * run that runs at the same time.
 *
 * Tools and middleware read it as `ctx.context.run`. Type them with
 * {@link HarnessRunContext}. A turn plugin reads it as `ctx.turn.run`, and a
 * command as `ctx.run`.
 *
 * @example
 * ```ts
 * const listIssues = toolDefinition({ name: 'list_issues', description: 'List issues' })
 *   .server<HarnessRunContext>(async (_args, ctx) => {
 *     const credential = await ctx.context.run.credentials.require('github')
 *     return fetchIssues(credential)
 *   })
 * ```
 */
export interface RunContext {
  /**
   * The tenant of the session: the tenant of the principal that opened it.
   * `undefined` in the default tenant.
   */
  tenantId?: string
  /** The user who started this run. `undefined` in a session with no user. */
  principal: { id: string; tenantId?: string } | undefined
  /**
   * The id of the log of the session in the `LogStore`: the tenant and the
   * root thread of the session tree, from `logIdOf`.
   */
  logId: string
  threadId: string
  /** The operation id of this run. */
  runId: string
  /** The run that this run continues or that started it, when there is one. */
  parentRunId?: string
  /**
   * The ownership epoch of the log when the run started. Only one host owns
   * a log at an epoch, and a later owner has a larger one. Give it to a
   * system that fences writes, so a host that lost the log is refused.
   */
  epoch: number
  /**
   * A key for one side effect of this run, for a system that refuses a
   * second call with the same key:
   * `${logId}:${scope}:${step}`. `scope` defaults to `runId`. Pass the tool
   * call id from a tool (`ctx.toolCallId`). A run again after a host stop,
   * on any host, gets the same key, so the other system refuses the second
   * side effect.
   *
   * @example
   * ```ts
   * const charge = toolDefinition({ name: 'charge', description: 'Charge the card' })
   *   .server<HarnessRunContext>(async (_args, ctx) => {
   *     const key = ctx.context.run.idempotencyKey('charge', ctx.toolCallId)
   *     return payments.charge({ amount: 100, idempotencyKey: key })
   *   })
   * ```
   */
  idempotencyKey: (step: string, scope?: string) => string
  /** Aborts when this run stops. */
  signal: AbortSignal
  /** The credentials of the user of this run. */
  credentials: CredentialsAccess
  /** The model provider keys of the user of this run. */
  keys: ProviderKeys
}

/**
 * The part of the runtime context that the harness adds to every chat call
 * of a run. Use it as the context type of a tool or a middleware:
 * `.server<HarnessRunContext>(...)`, `ChatMiddleware<HarnessRunContext>`.
 */
export type HarnessRunContext = { run: RunContext }

/**
 * A chat turn as plugins and the router see it: the input that started it,
 * and who sent it.
 */
export interface TurnInfo {
  /** The id of the turn operation. */
  operationId: string
  /** The id of the turn input, when the turn has one. */
  inputId?: string
  /** The user message of the input. `undefined` for a resolve and a continue. */
  message?: UserInput
  /** The `context` of the input. Client data: do not trust it. */
  context?: unknown
  /** Who sent the input. Default: the principal that opened the session. */
  principal?: Principal
  /** The settings of this turn only. Not kept after a restart. */
  overrides?: TurnOverrides
  /** The run of this turn: its user, and that user's credentials and keys. */
  run: RunContext
}

/** What a chat turn operation resolves to. */
export interface ChatTurnResult {
  /**
   * The main model's text for this turn, without the text of agents it
   * called. When a router sends the turn to agents, it is their text, as the
   * transcript keeps it.
   */
  text: string
  /** Set when the turn stopped for outside input. */
  interrupts?: Array<Interrupt>
  /**
   * The media files that the agents of this turn saved, in order. Empty for
   * a turn that a restart finished, and for a duplicate input.
   */
  media: Array<MediaRecord>
}

/**
 * One accepted unit of work in a session. Await it for its result.
 */
export interface Operation<TResult> extends PromiseLike<TResult> {
  /** Also the AG-UI `runId` of the operation. */
  readonly id: string
  readonly kind: OperationKind
  /** The agent name, for `kind: 'agent'`. */
  readonly agent?: string
  status: () => OperationStatus
  /**
   * The answer to the input of this operation. It resolves after the session
   * stored the input (`accepted` or `queued`), or refused it (`rejected`).
   * A resolved receipt means that the input survives a restart.
   */
  readonly receipt: Promise<Receipt>
  /** This operation's events, from `from` (exclusive) onward. */
  events: (options?: {
    from?: Cursor
    signal?: AbortSignal
  }) => AsyncIterable<SessionEvent>
  /** This operation's raw AG-UI chunks, for existing transports. */
  stream: (options?: { signal?: AbortSignal }) => AsyncIterable<StreamChunk>
  /** {@link OnEvent} for the events of this operation only. */
  onEvent: OnEvent
  /**
   * Call `listener` for each media file that this operation saves, as it is
   * saved. Returns a function that stops the calls. A chat turn also gives
   * every record in `media` of its result.
   */
  onMedia: (listener: (entry: { media: MediaRecord }) => void) => () => void
  cancel: (reason?: string) => Promise<Receipt>
}

/** A background agent run. `send` adds a message to it. */
export interface AgentRun<TResult> extends Operation<TResult> {
  readonly kind: 'agent'
  readonly agent: string
  /**
   * Add a message to this run. `mode: 'steer'` (default) gives it to the
   * run's next model call. When the run makes no further model call, it
   * runs as a follow-up. `mode: 'followUp'` runs the agent again after the
   * run ends, on the run's transcript with the message added, with its
   * first input and options. A run that ended starts again at once. The
   * receipt names the run that gets the message.
   */
  send: (
    message: UserInput,
    options?: { mode?: 'steer' | 'followUp'; inputId?: string },
  ) => Promise<Receipt>
}

/** What a media file holds. It picks the content part a model gets. */
export type MediaKind = 'image' | 'audio' | 'video' | 'document'

/** A file in a thread's media store: sent by a user or made by an agent. */
export type MediaRecord = {
  id: string
  threadId: string
  kind: MediaKind
  mimeType: string
  name: string
  /** Size in bytes. */
  size: number
  /** Epoch milliseconds. */
  createdAt: number
} & (
  | { source: 'user'; runId?: never; subagentRunId?: never }
  | {
      source: 'generated'
      /** The operation that made it. */
      runId: string
      /** The child agent run that made it, when a subagent did. */
      subagentRunId?: string
    }
)

/** A question that a command or a plugin asked. `session.answer` answers it. */
export interface PendingQuestion {
  questionId: string
  message: string
  schema?: unknown
  /** The answer is a secret (a key or a password). Hide it as the user types. */
  secret?: boolean
  /** A page the user must open before they answer. Show the link. */
  url?: string
}

/** A tool needs a sign-in to `connector` before it can run. */
export interface AuthRequest {
  connector: string
  /** The page where the user signs in. */
  url?: string
  /** The code the user enters on that page, for a device login. */
  userCode?: string
}

/** One model call reported its usage. */
export interface UsageUpdate {
  /** `provider/model`. */
  model: string
  /** The principal id of the sender, when known. */
  sender?: string
  /** The usage of this call. */
  usage: Omit<UsageCounts, 'calls'>
  /** The new totals of the thread. */
  total: UsageCounts
}

/** Names of the `CUSTOM` events a harness session adds to the stream. */
export const HARNESS_EVENTS = {
  operationStarted: 'harness.operation.started',
  operationFinished: 'harness.operation.finished',
  operationResumed: 'harness.operation.resumed',
  configChanged: 'harness.config.changed',
  /** `session.configure` changed the settings. The value has `settings`. */
  settingsChanged: 'harness.settings.changed',
  /** A plugin added or removed a command with `ctx.commands`. */
  commandsChanged: 'harness.commands.changed',
  /**
   * `session.reload()` set the plugins up again. The value is empty, or has
   * the `error` message when the new setup failed. Read the commands, the
   * config, and the agents again.
   */
  reloaded: 'harness.reloaded',
  question: 'harness.question',
  questionAnswered: 'harness.question.answered',
  pluginEvent: 'harness.plugin.event',
  authRequired: 'harness.auth_required',
  inputAccepted: 'harness.input.accepted',
  inputApplied: 'harness.input.applied',
  inputRejected: 'harness.input.rejected',
  /** An input ended. The value is an `InputSettlement`. */
  inputSettled: 'harness.input.settled',
  /**
   * A `setDelivery` input moved a waiting input. The value has `inputId` and
   * `delivery`.
   */
  inputDelivery: 'harness.input.delivery',
  /** A media file was stored. The value is a `MediaRecord`. */
  media: 'harness.media',
  /**
   * A turn runs the model again after an error. The value has `operationId`,
   * `retries`, `error`, and `continued`. `continued` is true when the model
   * continues a partial answer.
   */
  turnRetry: 'harness.turn.retry',
  /**
   * `session.reset()` started a fresh model context. The value has
   * `inputId` and the `note`, when there is one.
   */
  reset: 'harness.reset',
  /**
   * `session.revert` or `session.unrevert` changed what the transcript
   * shows. The value has the `messageId` of the revert, or `null` when no
   * revert stands. Read the transcript again.
   */
  revert: 'harness.revert',
  /**
   * A model call reported its usage. The value has `model`, `sender` (when
   * known), the `usage` of the call, and the new thread `total`.
   */
  usage: 'harness.usage',
} as const
