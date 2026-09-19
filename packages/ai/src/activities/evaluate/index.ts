/**
 * Evaluate Activity
 *
 * Asks typed questions about a shared state and returns values your code can
 * branch on. This is a self-contained module with implementation, types, and
 * JSDoc.
 */

import { aiEventClient } from '@tanstack/ai-event-client'
import { resolveDebugOption } from '../../logger/resolve'
import { isAbortShapedError } from '../error-payload'
import {
  createGenerationContext,
  runGenerationAbort,
  runGenerationError,
  runGenerationFinish,
  runGenerationStart,
  runGenerationUsage,
} from '../middleware/run'
import type { InternalLogger } from '../../logger/internal-logger'
import type { DebugOption } from '../../logger/types'
import type { TokenUsage } from '../../types'
import type { GenerationMiddleware } from '../middleware/types'
import type {
  EvaluateAdapter,
  EvaluateInstructions,
  EvaluateState,
  WireAnswer,
  WireChoiceAnswer,
  WireNoulAnswer,
  WireQuestion,
  WireScoreAnswer,
  WireScoreQuestion,
} from './adapter'

// ===========================
// Activity Kind
// ===========================

/** The adapter kind this activity handles */
export const kind = 'evaluate' as const

/** Question key reserved for `result.meta`. */
const RESERVED_QUESTION_KEY = 'meta' as const

// ===========================
// Type Extraction Helpers
// ===========================

/** Extract provider options from an EvaluateAdapter via ~types */
export type EvaluateProviderOptions<TAdapter> = TAdapter extends {
  '~types': { providerOptions: infer P extends object }
}
  ? P
  : object

// ===========================
// Unified answers
// ===========================

/**
 * Public choice answer. `.value` is the selected option key.
 */
export interface ChoiceAnswer<TValue extends string = string> {
  type: 'choice'
  value: TValue
  /** P(selected option). */
  probability: number
  confidence: number
  probabilities: Record<TValue, number>
}

/**
 * Public score answer. `.value` is the nearest level label.
 * `.score` is the raw TypeSafe fraction.
 */
export interface ScoreAnswer<TLevel extends string = string> {
  type: 'score'
  value: TLevel
  /** P(nearest level). */
  probability: number
  confidence: number
  score: number
  legend: Record<string, string>
  probabilities: Record<string, number>
}

/**
 * Public yes/no answer. `.value` is `true` when P(true) is 0.5 or more.
 * There is no `.confidence`.
 */
export interface BooleanAnswer {
  type: 'boolean'
  value: boolean
  /** P(true), from the wire `noul` field. */
  probability: number
}

export interface EvaluateResultMeta {
  /** Resolved model id from the provider. */
  model: string
  usage: TokenUsage
}

/**
 * Map a helper question (or wire question) to its public answer type.
 */
export type InferEvaluateAnswer<TQuestion> = TQuestion extends {
  type: 'choice'
  criteria: infer TCriteria
}
  ? TCriteria extends Record<string, string | null>
    ? ChoiceAnswer<Extract<keyof TCriteria, string>>
    : ChoiceAnswer
  : TQuestion extends { type: 'score'; criteria: infer TLevels }
    ? TLevels extends ReadonlyArray<string>
      ? ScoreAnswer<TLevels[number] & string>
      : ScoreAnswer
    : TQuestion extends { type: 'noul' }
      ? BooleanAnswer
      : never

/**
 * Result of `decide()`. Each question key is a top-level answer.
 * `meta` holds the resolved model id and usage.
 */
export type EvaluateResult<TQuestions extends Record<string, WireQuestion>> = {
  [K in keyof TQuestions as K extends typeof RESERVED_QUESTION_KEY
    ? never
    : K]: InferEvaluateAnswer<TQuestions[K]>
} & {
  meta: EvaluateResultMeta
}

// ===========================
// Activity Options Types
// ===========================

/**
 * Options for the evaluate activity. The model is extracted from the
 * adapter's model property.
 *
 * @template TAdapter - The evaluate adapter type
 * @template TQuestions - The questions object passed to `decide`
 */
export interface EvaluateActivityOptions<
  TAdapter extends EvaluateAdapter<string, EvaluateProviderOptions<TAdapter>>,
  TQuestions extends Record<string, WireQuestion>,
> {
  /** The evaluate adapter to use (must be created with a model) */
  adapter: TAdapter & { kind: typeof kind }
  /** Shared state every question judges. A JSON array is one state, not a batch. */
  state: EvaluateState
  /**
   * Questions built with `choice`, `score`, and `boolean`.
   * The key `meta` is reserved.
   */
  questions: TQuestions
  /** Provider-specific options */
  modelOptions?: EvaluateProviderOptions<TAdapter>
  /** Forwarded to the provider request for cancellation. */
  abortSignal?: AbortSignal
  /**
   * Observe-only middleware notified on start, usage, success, abort, and
   * error. Pass `otelMiddleware()` to emit OpenTelemetry spans, or implement
   * the `GenerationMiddleware` contract for a custom backend.
   */
  middleware?: Array<GenerationMiddleware>
  /**
   * Enable debug logging. Pass `true` to enable all categories, `false` to
   * silence everything including errors, or a `DebugConfig` object for granular
   * control and/or a custom `Logger`.
   */
  debug?: DebugOption
}

// ===========================
// Helper Functions
// ===========================

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  // Prefer the error's own identity over the signal state. A genuine
  // cancellation throws an abort-shaped error (DOM `AbortError`, the OpenRouter
  // SDK's `RequestAbortedError`, ...). Classifying on `signal.aborted` alone
  // would misroute a real failure to the abort hook whenever a shared signal
  // happens to already be aborted, hiding it from `onError` observers.
  if (isAbortShapedError(error)) return true
  // Fall back to signal state only for non-Error throws we can't otherwise
  // identify; a real Error with a non-abort name is never an abort.
  return error instanceof Error ? false : signal?.aborted === true
}

function questionKeys(questions: Record<string, WireQuestion>) {
  return Object.keys(questions)
}

function assertQuestions(questions: Record<string, WireQuestion>) {
  const keys = questionKeys(questions)
  if (keys.length === 0) {
    throw new Error('decide() requires at least one question')
  }
  if (Object.hasOwn(questions, RESERVED_QUESTION_KEY)) {
    throw new Error('decide() reserves the question key "meta"')
  }
  return keys
}

function mapChoiceAnswer(wire: WireChoiceAnswer, key: string) {
  const probability = wire.probabilities[wire.choice]
  if (typeof probability !== 'number') {
    throw new Error(
      `decide(): missing probability for choice "${wire.choice}" on "${key}"`,
    )
  }
  return {
    type: 'choice' as const,
    value: wire.choice,
    probability,
    confidence: wire.confidence,
    probabilities: wire.probabilities,
  }
}

function mapScoreAnswer(
  question: WireScoreQuestion,
  wire: WireScoreAnswer,
  key: string,
) {
  const levels = question.criteria
  if (levels.length < 2) {
    throw new Error(
      `decide(): score question "${key}" needs at least two levels`,
    )
  }
  const lastIndex = levels.length - 1
  const rounded = Math.round(wire.score)
  const nearestIndex =
    rounded < 0 ? 0 : rounded > lastIndex ? lastIndex : rounded
  const value = levels[nearestIndex]
  if (value === undefined) {
    throw new Error(
      `decide(): score question "${key}" has no level at index ${nearestIndex}`,
    )
  }
  const probability = wire.probabilities[String(nearestIndex)]
  if (typeof probability !== 'number') {
    throw new Error(
      `decide(): missing probability for score level ${nearestIndex} on "${key}"`,
    )
  }
  return {
    type: 'score' as const,
    value,
    probability,
    confidence: wire.confidence,
    score: wire.score,
    legend: wire.legend,
    probabilities: wire.probabilities,
  }
}

function mapBooleanAnswer(wire: WireNoulAnswer) {
  return {
    type: 'boolean' as const,
    value: wire.noul >= 0.5,
    probability: wire.noul,
  }
}

function mapWireAnswer(question: WireQuestion, wire: WireAnswer, key: string) {
  switch (question.type) {
    case 'choice': {
      if (wire.type !== 'choice') {
        throw new Error(
          `decide(): expected choice answer for "${key}", got ${wire.type}`,
        )
      }
      return mapChoiceAnswer(wire, key)
    }
    case 'score': {
      if (wire.type !== 'score') {
        throw new Error(
          `decide(): expected score answer for "${key}", got ${wire.type}`,
        )
      }
      return mapScoreAnswer(question, wire, key)
    }
    case 'noul': {
      if (wire.type !== 'noul') {
        throw new Error(
          `decide(): expected noul answer for "${key}", got ${wire.type}`,
        )
      }
      return mapBooleanAnswer(wire)
    }
  }
}

function mapAnswers<TQuestions extends Record<string, WireQuestion>>(
  questions: TQuestions,
  wireAnswers: Record<string, WireAnswer>,
) {
  const answers = {} as {
    [K in keyof TQuestions]: InferEvaluateAnswer<TQuestions[K]>
  }
  const keys = Object.keys(questions) as Array<keyof TQuestions>
  for (const key of keys) {
    const question = questions[key]
    const wire = wireAnswers[String(key)]
    if (question === undefined) {
      throw new Error(`decide(): missing question "${String(key)}"`)
    }
    if (wire === undefined) {
      throw new Error(`decide(): missing answer for question "${String(key)}"`)
    }
    answers[key] = mapWireAnswer(
      question,
      wire,
      String(key),
    ) as InferEvaluateAnswer<TQuestions[typeof key]>
  }
  return answers
}

function withMeta<TAnswers extends object>(
  answers: TAnswers,
  meta: EvaluateResultMeta,
) {
  return { ...answers, meta }
}

// ===========================
// Question helpers
// ===========================

/**
 * Build a choice question. The model picks one key from `options`.
 *
 * Option keys become the union on `.value`. Use `null` when a key needs no
 * extra description. On the wire, `options` is sent as TypeSafe `criteria`.
 *
 * @param options.instructions What the model should decide.
 * @param options.options Map of option key to description, or `null`.
 *
 * @example
 * ```ts
 * const queue = choice({
 *   instructions: 'Which team should handle this ticket?',
 *   options: {
 *     billing: 'Payments, invoices, refunds',
 *     tech: 'Bugs, outages, integrations',
 *     sales: 'Pricing, upgrades, new accounts',
 *   },
 * })
 * ```
 */
export function choice<
  const TOptions extends Record<string, string | null>,
>(options: { instructions: EvaluateInstructions; options: TOptions }) {
  return {
    type: 'choice' as const,
    instructions: options.instructions,
    criteria: options.options,
  }
}

/**
 * Build a score question. The model rates `state` on ordered `levels`.
 *
 * You must pass at least two levels. `.value` is the nearest level label.
 * The raw fraction stays on `.score`. On the wire, `levels` is sent as
 * TypeSafe `criteria`.
 *
 * @param options.instructions What the model should rate.
 * @param options.levels Ordered labels, lowest first. At least two.
 *
 * @example
 * ```ts
 * const urgency = score({
 *   instructions: 'How urgent is this ticket?',
 *   levels: ['low', 'medium', 'high'],
 * })
 * ```
 */
export function score<const TLevels extends ReadonlyArray<string>>(options: {
  instructions: EvaluateInstructions
  levels: TLevels
}) {
  if (options.levels.length < 2) {
    throw new Error('score() requires at least two levels')
  }
  return {
    type: 'score' as const,
    instructions: options.instructions,
    criteria: options.levels,
  }
}

/**
 * Build a yes/no question.
 *
 * `.value` is `true` when P(true) is 0.5 or more. There is no `.confidence`.
 * On the wire, the type is TypeSafe `noul`.
 *
 * @param options.instructions The yes/no question to judge.
 * @param options.criteria Optional descriptions of yes and no.
 *
 * @example
 * ```ts
 * const refund = boolean({
 *   instructions: 'Is the customer asking for a refund?',
 * })
 * ```
 */
export function boolean(options: {
  instructions: EvaluateInstructions
  criteria?: {
    true?: string
    false?: string
  }
}) {
  if (options.criteria === undefined) {
    return {
      type: 'noul' as const,
      instructions: options.instructions,
    }
  }
  return {
    type: 'noul' as const,
    instructions: options.instructions,
    criteria: options.criteria,
  }
}

// ===========================
// Activity Implementation
// ===========================

/**
 * Ask typed questions about `state` and get answers your code can branch on.
 *
 * You have state (a ticket, a record, a log) and you need typed answers, not
 * prose. Pass questions built with `choice`, `score`, and `boolean`. Then
 * branch on `result.queue.value` in ordinary TypeScript.
 *
 * The question key `meta` is reserved. Throws if `questions` is empty or uses
 * that key.
 *
 * @param options.adapter Evaluate adapter created with a model.
 * @param options.state Shared state every question judges.
 * @param options.questions Questions built with `choice`, `score`, `boolean`.
 * @param options.modelOptions Provider-specific options.
 * @param options.abortSignal Cancels the in-flight request.
 * @param options.middleware Observe-only generation middleware.
 * @param options.debug Debug logging option.
 *
 * @example Route a support ticket
 * ```ts
 * import { decide, choice, score, boolean } from '@tanstack/ai'
 * import { typesafeDecider } from '@tanstack/ai-typesafe'
 *
 * const result = await decide({
 *   adapter: typesafeDecider('jev-latest'),
 *   state: ticket,
 *   questions: {
 *     queue: choice({
 *       instructions: 'Which team should handle this ticket?',
 *       options: {
 *         billing: 'Payments, invoices, refunds',
 *         tech: 'Bugs, outages, integrations',
 *         sales: 'Pricing, upgrades, new accounts',
 *       },
 *     }),
 *     urgency: score({
 *       instructions: 'How urgent is this ticket?',
 *       levels: ['low', 'medium', 'high'],
 *     }),
 *     refund: boolean({
 *       instructions: 'Is the customer asking for a refund?',
 *     }),
 *   },
 * })
 *
 * result.queue.value
 * result.meta.model
 * result.meta.usage
 * ```
 */
export async function decide<
  TAdapter extends EvaluateAdapter<string, EvaluateProviderOptions<TAdapter>>,
  TQuestions extends Record<string, WireQuestion>,
>(options: EvaluateActivityOptions<TAdapter, TQuestions>) {
  const {
    adapter,
    state,
    questions,
    modelOptions,
    abortSignal,
    middleware,
    debug,
  } = options
  const model = adapter.model
  const keys = assertQuestions(questions)
  const requestId = createId('evaluate')
  const startTime = Date.now()
  const logger: InternalLogger = resolveDebugOption(debug)

  const mwCtx = createGenerationContext({
    requestId,
    activity: 'evaluate',
    provider: adapter.name,
    model,
    modelOptions,
    createId,
  })

  await runGenerationStart(middleware, mwCtx)

  aiEventClient.emit('evaluate:request:started', {
    requestId,
    provider: adapter.name,
    model,
    questionCount: keys.length,
    timestamp: startTime,
  })

  logger.request(`activity=evaluate provider=${adapter.name}`, {
    provider: adapter.name,
    model,
    questionCount: keys.length,
  })

  try {
    const result = await adapter.evaluate({
      model,
      state,
      questions,
      modelOptions,
      abortSignal,
      logger,
    })

    const answers = mapAnswers(questions, result.answers)
    const duration = Date.now() - startTime

    aiEventClient.emit('evaluate:request:completed', {
      requestId,
      provider: adapter.name,
      model: result.model,
      questionCount: keys.length,
      duration,
      timestamp: Date.now(),
    })

    aiEventClient.emit('evaluate:usage', {
      requestId,
      model: result.model,
      usage: result.usage,
      timestamp: Date.now(),
    })

    logger.output(`activity=evaluate answers=${keys.length}`, {
      answerCount: keys.length,
    })

    await runGenerationUsage(middleware, mwCtx, result.usage)
    await runGenerationFinish(middleware, mwCtx, {
      duration,
      usage: result.usage,
    })

    return withMeta(answers, {
      model: result.model,
      usage: result.usage,
    })
  } catch (error) {
    const duration = Date.now() - startTime
    if (isAbortError(error, abortSignal)) {
      await runGenerationAbort(middleware, mwCtx, {
        reason: error instanceof Error ? error.message : undefined,
        duration,
      })
    } else {
      await runGenerationError(middleware, mwCtx, { error, duration })
    }
    logger.errors('evaluate activity failed', { error, source: 'evaluate' })
    throw error
  }
}

// Re-export adapter types
export type {
  EvaluateAdapter,
  EvaluateAdapterConfig,
  AnyEvaluateAdapter,
  EvaluateOptions,
  EvaluateAdapterResult,
  EvaluateState,
  EvaluateInstructions,
  EvaluateJsonValue,
  WireQuestion,
  WireAnswer,
  WireChoiceQuestion,
  WireScoreQuestion,
  WireNoulQuestion,
  WireChoiceAnswer,
  WireScoreAnswer,
  WireNoulAnswer,
} from './adapter'
export { BaseEvaluateAdapter } from './adapter'
