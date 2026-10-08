import type { ModelMessage } from '@tanstack/ai'
import type { LogRecord } from '@tanstack/ai-persistence'
import type { HarnessSession } from './session'
import type { HarnessInput, Principal, TurnOverrides, UserInput } from './types'

/** What recovery does with one input. */
export type RecoverDecision =
  | {
      action: 'run'
      /**
       * The overrides of the turn that runs, as in `prompt()`. Not kept in
       * the log: a later recovery asks the hook again. A steer that joins
       * the running turn ignores them.
       */
      overrides?: TurnOverrides
    }
  | {
      action: 'settle'
      outcome: 'completed' | 'failed' | 'aborted'
      error?: { message: string; code?: string }
    }

/** What `durability.recover` gets for one input. */
export interface RecoverContext {
  session: HarnessSession
  input: {
    inputId: string
    input: HarnessInput
    attempt: number
    timeoutAt?: number
    abortRequested: boolean
    operationId?: string
    /** Model retries since the last finished tool phase, from the log. */
    retries: number
  }
  /** The transcript of the session, from the log. */
  messages: ReadonlyArray<ModelMessage>
  /**
   * The tool calls of this input that recovery closes with an error result,
   * in call order: `'interrupted'` for a `replay: 'never'` call that a crash
   * cut (it gets `durability.interruptedToolResult`), and `'truncated'` for a
   * call of an answer that stopped at the output limit (it gets
   * `durability.truncatedToolResult`). A finished call and a `replay: 'safe'`
   * call (it runs again) are not in it. The list is the same when the hook
   * settles the input, so then it names the calls that a run would close.
   */
  interruptedTools: ReadonlyArray<{
    toolCallId: string
    toolName: string
    reason: 'interrupted' | 'truncated'
  }>
  /** What the harness does when the hook returns `undefined`. */
  decision: RecoverDecision
}

/** Decide how an input that a crashed host left recovers. */
export type RecoverHook = (
  ctx: RecoverContext,
) => RecoverDecision | undefined | Promise<RecoverDecision | undefined>

/** Messages and host records that a turn hook adds, in one append. */
export interface TurnAdditions {
  /** Messages after the transcript, for the next model call. */
  messages?: Array<ModelMessage>
  /** Host records in the same append. A durable host only. */
  records?: ReadonlyArray<LogRecord>
  /**
   * Messages at the end of the context of the next model call only. No store
   * keeps them: not the transcript, and not the log.
   */
  ephemeral?: ReadonlyArray<ModelMessage>
}

/** What `turn.onModelError` gets. */
export interface ModelErrorContext {
  session: HarnessSession
  operationId: string
  inputId?: string
  error: { message: string; code?: string }
  /**
   * Retries since the last finished tool phase of this turn. A durable host
   * keeps the count, so an attempt that recovery runs goes on from it. The
   * log has the count with this failed call before the hook runs, so a host
   * that stops during a backoff loses no retry.
   */
  retries: number
  /** True when the failed call streamed text before the error. */
  partial: boolean
  /** Aborted when the turn is cancelled. */
  signal: AbortSignal
}

/** What `turn.beforeFinish` gets. */
export interface FinishContext {
  session: HarnessSession
  operationId: string
  inputId?: string
  /** How many times this hook continued the turn so far. */
  cycle: number
  messages: ReadonlyArray<ModelMessage>
  signal: AbortSignal
}

/** An input that waits to join the running turn. */
export interface JoinCandidate {
  inputId: string
  message: UserInput
  /**
   * Who sent the input. A joined input runs with the credentials of the
   * turn's sender, so refuse a join from another person when that matters.
   */
  principal?: Principal
  /**
   * Who sent the running turn. Compare it with `principal` to keep one
   * person's message out of another person's turn.
   */
  turnPrincipal?: Principal
}

/** What `turn.onJoin` gets. */
export interface JoinContext {
  session: HarnessSession
  operationId: string
  /** The inputs that join now, in admission order. */
  inputs: ReadonlyArray<JoinCandidate>
  signal: AbortSignal
}

/** Hooks that control a chat turn. */
export interface HarnessTurnOptions {
  /**
   * A run of the turn failed (a `RUN_ERROR`, or an error thrown by the run).
   * Return `'retry'` to run the model again in the same operation, after any
   * work (a backoff, a compaction record). The text of the failed call is
   * dropped. Return `'continue'` to keep that text: the model gets it and a
   * note to continue from where it stopped. With no partial text,
   * `'continue'` acts as `'retry'`. See `retryTransientErrors`.
   */
  onModelError?: (
    ctx: ModelErrorContext,
  ) =>
    | 'retry'
    | 'continue'
    | undefined
    | Promise<'retry' | 'continue' | undefined>
  /**
   * The model stopped calling tools and the turn would end. Return messages,
   * records, or ephemeral messages to send the model back to work in the same
   * turn.
   */
  beforeFinish?: (
    ctx: FinishContext,
  ) => TurnAdditions | undefined | Promise<TurnAdditions | undefined>
  /**
   * How many times `beforeFinish` can continue one turn. Default 32. At the
   * limit, a hook that still returns messages or records fails the turn
   * (records or ephemeral messages alone count too).
   */
  maxFinishCycles?: number
  /**
   * Whether a waiting input joins the running turn now. A refused input
   * stops the join: it and the inputs after it wait.
   */
  canJoin?: (candidate: JoinCandidate) => boolean | Promise<boolean>
  /** Runs before the model call that the joined inputs reach. */
  onJoin?: (
    ctx: JoinContext,
  ) => TurnAdditions | undefined | Promise<TurnAdditions | undefined>
}

// ponytail: the patterns of Flue's isRetryableModelError. A qualified finish
// reason (error_quota, content_filter) stays terminal. The status codes need
// word boundaries, or the 500 in "250000 tokens" would match.
const TRANSIENT_ERROR =
  /overloaded|rate.?limit|too many requests|\b(?:429|500|502|503|504)\b|service.?unavailable|server.?error|network.?error|connection.?(?:reset|refused|lost|error)|socket hang up|fetch failed|timed? out|timeout|terminated|provider finish_reason:\s*error(?![-\w])/i

/**
 * True for a model error that can pass when you try again: overloaded, rate
 * limits, 429 and 5xx, network and connection errors, timeouts, and a
 * provider `finish_reason: error`.
 */
export function isTransientModelError(error: {
  message: string
  code?: string
}): boolean {
  return (
    TRANSIENT_ERROR.test(error.message) ||
    (error.code !== undefined && TRANSIENT_ERROR.test(error.code))
  )
}

/** Resolve after `ms`, or at once when `signal` aborts. */
function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) return resolve()
    const done = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
  })
}

/**
 * A `turn.onModelError` policy: retry a transient model error after a
 * backoff of `baseDelayMs * 2^retries`, times a jitter from 0.75 to 1.0.
 * It answers `'continue'` when the failed call streamed text, so the model
 * continues that text, and `'retry'` otherwise.
 *
 * @example
 * ```ts
 * defineHarness({ ..., turn: { onModelError: retryTransientErrors() } })
 * ```
 */
export function retryTransientErrors(
  options: {
    /** Retries after the last finished tool phase. Default 3. */
    maxRetries?: number
    /** The first delay, in milliseconds. Default 2000. */
    baseDelayMs?: number
    /** Default {@link isTransientModelError}. */
    isTransient?: (error: { message: string; code?: string }) => boolean
  } = {},
) {
  const maxRetries = options.maxRetries ?? 3
  const baseDelayMs = options.baseDelayMs ?? 2_000
  const isTransient = options.isTransient ?? isTransientModelError
  return async (ctx: ModelErrorContext) => {
    if (ctx.retries >= maxRetries || !isTransient(ctx.error)) return undefined
    const jitter = 0.75 + Math.random() * 0.25
    await wait(Math.round(baseDelayMs * 2 ** ctx.retries * jitter), ctx.signal)
    if (ctx.signal.aborted) return undefined
    return ctx.partial ? 'continue' : 'retry'
  }
}
