import type {
  ContentPart,
  Interrupt,
  RunAgentResumeItem,
  StreamChunk,
} from '@tanstack/ai'

/** A user message: plain text, or content parts (text, images, files). */
export type UserInput = string | Array<ContentPart>

/**
 * What a `prompt` does when a chat turn is already running:
 * - `queue` (default): runs as a new turn after the current one settles.
 * - `steer`: joins the running turn at its next model call.
 * - `reject`: refuses the prompt.
 */
export type BusyPolicy = 'queue' | 'steer' | 'reject'

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
 */
export type HarnessInput = (
  | { op: 'prompt'; message: UserInput; busy?: BusyPolicy }
  | { op: 'steer'; message: UserInput }
  | { op: 'followUp'; message: UserInput }
  | { op: 'resolve'; resume: Array<RunAgentResumeItem> }
  | { op: 'agent'; agent: string; input?: unknown; detached?: boolean }
  | { op: 'cancel'; operationId?: string }
  | { op: 'command'; name: string; input?: unknown }
  | { op: 'answer'; questionId: string; value: unknown }
  | { op: 'config'; key: string; value: unknown }
) & { inputId?: string }

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
}

/** What a chat turn operation resolves to. */
export interface ChatTurnResult {
  /** The main model's text for this turn (child agent text excluded). */
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
  question: 'harness.question',
  questionAnswered: 'harness.question.answered',
  pluginEvent: 'harness.plugin.event',
  authRequired: 'harness.auth_required',
  inputAccepted: 'harness.input.accepted',
  inputApplied: 'harness.input.applied',
  inputRejected: 'harness.input.rejected',
  /** An input ended. The value is an `InputSettlement`. */
  inputSettled: 'harness.input.settled',
  /** A media file was stored. The value is a `MediaRecord`. */
  media: 'harness.media',
  /** A turn runs the model again after an error. The value has `retries` and `error`. */
  turnRetry: 'harness.turn.retry',
} as const
