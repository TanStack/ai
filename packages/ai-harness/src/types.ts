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

/** An input a client sends to a session. Stored in the inbox. */
export type HarnessInput =
  | { op: 'prompt'; message: UserInput; busy?: BusyPolicy }
  | { op: 'steer'; message: UserInput }
  | { op: 'followUp'; message: UserInput }
  | { op: 'resolve'; resume: Array<RunAgentResumeItem> }
  | { op: 'agent'; agent: string; input?: unknown; detached?: boolean }
  | { op: 'cancel'; operationId?: string }

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
  /** This operation's events, from `from` (exclusive) onward. */
  events: (options?: {
    from?: Cursor
    signal?: AbortSignal
  }) => AsyncIterable<SessionEvent>
  /** This operation's raw AG-UI chunks, for existing transports. */
  stream: (options?: { signal?: AbortSignal }) => AsyncIterable<StreamChunk>
  cancel: (reason?: string) => Promise<Receipt>
}

/** Names of the `CUSTOM` events a harness session adds to the stream. */
export const HARNESS_EVENTS = {
  operationStarted: 'harness.operation.started',
  operationFinished: 'harness.operation.finished',
  inputAccepted: 'harness.input.accepted',
  inputApplied: 'harness.input.applied',
  inputRejected: 'harness.input.rejected',
} as const
