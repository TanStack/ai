import type {
  AnyTextAdapter,
  AnyTool,
  ContentPart,
  Interrupt,
  KeyedAdapter,
  PromptCacheOptions,
  ReasoningOption,
  RunAgentResumeItem,
  StreamChunk,
} from '@tanstack/ai'

/** A user message: plain text, or content parts (text, images, files). */
export type UserInput = string | Array<ContentPart>

/**
 * Settings for one chat turn: `session.prompt(message, { overrides })` or
 * `session.followUp(message, { overrides })`. They apply to every model call
 * of the turn, retries included. The rest of the session keeps its defaults.
 *
 * They live only in memory, on the queued turn, so they are not part of the
 * input: the `inputId` duplicate check does not read them. A turn that
 * recovery runs again after a restart uses the defaults. A steer that joins
 * a running turn uses the overrides of that turn.
 *
 * @example
 * ```ts
 * session.prompt('Plan the migration.', {
 *   overrides: { reasoning: { level: 'high', summary: true }, tools: [planTool] },
 * })
 * ```
 */
export interface TurnOverrides {
  /** Replaces the harness adapter and every plugin pick for this turn. */
  adapter?: AnyTextAdapter | KeyedAdapter<AnyTextAdapter>
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
 * What a `prompt` does when a chat turn is already running:
 * - `queue` (default): runs as a new turn after the current one settles.
 * - `steer`: joins the running turn at its next model call.
 * - `reject`: refuses the prompt.
 */
export type BusyPolicy = 'queue' | 'steer' | 'reject'

/** Kinds of work a session runs. */
export type OperationKind = 'chat' | 'agent' | 'command' | 'compact' | 'tool'

export type OperationStatus =
  | 'accepted'
  | 'running'
  | 'interrupted'
  | 'completed'
  | 'failed'
  | 'cancelled'

/** The immediate answer to an input. `applied` arrives later as an event. */
export interface Receipt {
  inputId: string
  status: 'accepted' | 'queued' | 'rejected'
  operationId?: string
  reason?: string
}

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
 * An input a client sends to a session. Stored in the inbox, or in the log of
 * a durable host.
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
 */
export type HarnessInput = (
// `systemPreamble` prepends per-run system/developer messages (e.g. pod memory)
// ahead of the harness's own system prompts — additive; the agent author does
// nothing, the trigger attaches them.
| {
      op: 'prompt'
      message: UserInput
      busy?: BusyPolicy
      systemPreamble?: Array<string>
      context?: unknown
    }
  | { op: 'steer'; message: UserInput; context?: unknown }
  | { op: 'followUp'; message: UserInput; context?: unknown }
  /** A turn from the stored transcript, with no new message. */
  | { op: 'continue'; context?: unknown }
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
  | { op: 'cancelInput'; inputId: string }
  | {
      op: 'setDelivery'
      inputId: string
      delivery: WaitingInput['delivery']
    }
  | { op: 'command'; name: string; input?: unknown }
  | { op: 'answer'; questionId: string; value: unknown }
  | { op: 'config'; key: string; value: unknown }
  // Out-of-band tool invocation: run one registered tool with no model turn.
  // `meta` carries provenance (e.g. an injection trigger) onto the result event.
  | { op: 'tool'; name: string; args?: unknown; meta?: Record<string, unknown> }
  | { op: 'configure'; settings: ThreadSettingsChange }
  | { op: 'reset'; note?: string }
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
 * after a restart (with `stores.metadata`), and a fork copies them. A turn's
 * `overrides` win over them.
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

/** How an input ended. `session.settled(inputId)` resolves to it. */
export interface InputSettlement {
  inputId: string
  /**
   * `interrupted`: the turn stopped for human input. The `resolve` that
   * answers it is a new input with its own settlement.
   */
  outcome: 'completed' | 'failed' | 'aborted' | 'interrupted'
  /** The operation that ran the input, when one started. */
  operationId?: string
  /** Set for `failed`. `code` is `'attempts_exhausted'`, `'timeout'`, or absent. */
  error?: { message: string; code?: string }
}

/**
 * An awaited operation rejects with this error when the session refused its
 * input (for example `busy: 'reject'` while a turn runs, or an `inputId`
 * conflict). `receipt` is the refused receipt.
 */
export class InputRejectedError extends Error {
  readonly receipt: Receipt

  constructor(receipt: Receipt) {
    super(rejectionMessage(receipt.reason))
    this.name = 'InputRejectedError'
    this.receipt = receipt
  }
}

function rejectionMessage(reason: string | undefined) {
  if (reason === 'busy') return 'A chat turn is already running.'
  if (reason === 'conflict') {
    return 'An earlier input has this inputId and another payload.'
  }
  return `The session rejected the input: ${reason ?? 'rejected'}.`
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
   * With a durable host, a resolved receipt means that the input survives a
   * restart.
   */
  readonly receipt: Promise<Receipt>
  /** This operation's events, from `from` (exclusive) onward. */
  events: (options?: {
    from?: Cursor
    signal?: AbortSignal
  }) => AsyncIterable<SessionEvent>
  /** This operation's raw AG-UI chunks, for existing transports. */
  stream: (options?: { signal?: AbortSignal }) => AsyncIterable<StreamChunk>
  cancel: (reason?: string) => Promise<Receipt>
}

/** A background agent run. `send` adds a message to it. */
export interface AgentRun<TResult> extends Operation<TResult> {
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
export interface MediaRecord {
  id: string
  threadId: string
  kind: MediaKind
  mimeType: string
  name: string
  /** Size in bytes. */
  size: number
  source: 'user' | 'generated'
  /** Epoch milliseconds. */
  createdAt: number
  /** The operation that made generated media. */
  runId?: string
  /** The child agent run that made it, when a subagent did. */
  subagentRunId?: string
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
   * `retries`, and `error`.
   */
  turnRetry: 'harness.turn.retry',
  /**
   * `session.reset()` started a fresh model context. The value has
   * `inputId` and the `note`, when there is one.
   */
  reset: 'harness.reset',
  /**
   * A model call reported its usage. The value has `model`, `sender` (when
   * known), the `usage` of the call, and the new thread `total`.
   */
  usage: 'harness.usage',
} as const
