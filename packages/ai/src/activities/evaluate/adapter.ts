import type { InternalLogger } from '../../logger/internal-logger'
import type { TokenUsage } from '../../types'

/**
 * Configuration for evaluate adapter instances.
 */
export interface EvaluateAdapterConfig {
  apiKey?: string
  baseUrl?: string
  timeout?: number
  headers?: Record<string, string>
}

/**
 * Shared JSON value for `state` and question `instructions`.
 * A JSON array is one value, not a batch.
 */
export type EvaluateJsonValue = string | object | Array<unknown>

/** Content the model judges. A JSON array is one state, not a batch. */
export type EvaluateState = EvaluateJsonValue

/** Question text. Matches TypeSafe: string, object, or array. */
export type EvaluateInstructions = EvaluateJsonValue

/**
 * TypeSafe choice question on the adapter wire.
 *
 * Generic parameters:
 * - TOptions: option key to description (or `null` when the key is enough)
 */
export interface WireChoiceQuestion<
  TOptions extends Record<string, string | null> = Record<
    string,
    string | null
  >,
> {
  type: 'choice'
  instructions: EvaluateInstructions
  criteria: TOptions
}

/**
 * TypeSafe score question on the adapter wire.
 *
 * Generic parameters:
 * - TLevels: ordered level labels, at least two
 */
export interface WireScoreQuestion<
  TLevels extends ReadonlyArray<string> = ReadonlyArray<string>,
> {
  type: 'score'
  instructions: EvaluateInstructions
  criteria: TLevels
}

/**
 * TypeSafe yes/no question on the adapter wire.
 * Public helpers call this `boolean`. The wire type is `noul`.
 */
export interface WireNoulQuestion {
  type: 'noul'
  instructions: EvaluateInstructions
  criteria?: {
    true?: string
    false?: string
  }
}

/** Question payload adapters send to the provider. */
export type WireQuestion =
  | WireChoiceQuestion
  | WireScoreQuestion
  | WireNoulQuestion

/** TypeSafe choice answer. Adapters do not invent a public `.value`. */
export interface WireChoiceAnswer {
  type: 'choice'
  choice: string
  probabilities: Record<string, number>
  confidence: number
}

/** TypeSafe score answer. `score` is the raw fraction. */
export interface WireScoreAnswer {
  type: 'score'
  score: number
  legend: Record<string, string>
  probabilities: Record<string, number>
  confidence: number
}

/** TypeSafe yes/no answer. `noul` is P(true). */
export interface WireNoulAnswer {
  type: 'noul'
  noul: number
}

/** Provider payload for one question. The activity maps this to a unified answer. */
export type WireAnswer = WireChoiceAnswer | WireScoreAnswer | WireNoulAnswer

/**
 * Options passed to {@link EvaluateAdapter.evaluate}.
 */
export interface EvaluateOptions<
  TProviderOptions extends object = Record<string, unknown>,
> {
  model: string
  /** Shared state every question judges. A JSON array is one state, not a batch. */
  state: EvaluateState
  /** TypeSafe wire questions, keyed by the caller's question ids. */
  questions: Record<string, WireQuestion>
  /** Provider-specific options forwarded by `decide()`. */
  modelOptions?: TProviderOptions
  /** Forwarded to the provider request for cancellation. */
  abortSignal?: AbortSignal
  /**
   * Internal logger threaded from `decide()`. Adapters must call
   * `logger.request()` before the provider call and `logger.errors()` in catch
   * blocks.
   */
  logger: InternalLogger
}

/**
 * Provider-level evaluate result. Adapters return the wire payload plus usage.
 * The activity maps answers to the unified public shape.
 */
export interface EvaluateAdapterResult {
  /** Resolved model id from the provider. */
  model: string
  answers: Record<string, WireAnswer>
  usage: TokenUsage
  /** Provider response id, for example to look the request up later. */
  id?: string
  /** Upstream provider that served the request, when a router reports it. */
  provider?: string
}

/** `EvaluateError.code` when the provider declined to answer a question. */
export const EVALUATE_REFUSAL_CODE = 'refusal'

/** Fields for {@link EvaluateError}. */
export interface EvaluateErrorInit {
  /** Human-readable error text. */
  message: string
  /** Stable code to branch on, for example `EVALUATE_REFUSAL_CODE`. */
  code: string
  /** Tokens the provider reported for this call. */
  usage?: TokenUsage
  /** Resolved model id from the provider. */
  model?: string
  /**
   * Wire answers the provider did return, before `decide()` maps them. A
   * `choice()` answer has `choice`, and a `boolean()` answer is
   * `{ type: 'noul', noul }`. A refused question has no key.
   */
  answers?: Record<string, WireAnswer>
}

/**
 * Thrown by an evaluate adapter when the provider answered, but the call
 * cannot become a result. It carries what the provider already returned,
 * so callers can still read the billed usage and the answers that came back.
 *
 * The `name` is always `EvaluateError`.
 * Another package can read this shape without an import of this class.
 * Use {@link isEvaluateError} to narrow a caught value. `instanceof` fails
 * when the app has more than one copy of `@tanstack/ai`.
 */
export class EvaluateError extends Error {
  /** Stable code to branch on, for example `EVALUATE_REFUSAL_CODE`. */
  readonly code: string
  /** Tokens the provider reported for this call. */
  readonly usage?: TokenUsage
  /** Resolved model id from the provider. */
  readonly model?: string
  /**
   * Wire answers the provider did return, before `decide()` maps them. A
   * `choice()` answer has `choice`, and a `boolean()` answer is
   * `{ type: 'noul', noul }`. A refused question has no key.
   */
  readonly answers?: Record<string, WireAnswer>

  constructor(init: EvaluateErrorInit) {
    super(init.message)
    this.name = 'EvaluateError'
    this.code = init.code
    this.usage = init.usage
    this.model = init.model
    this.answers = init.answers
  }
}

/**
 * This function returns true when `value` has the evaluate error shape.
 *
 * The check reads `name` and `code`.
 * A plain object with those fields passes.
 * The check does not use `instanceof`, so it also matches an error from
 * another copy of `@tanstack/ai`.
 *
 * @param value - A thrown value, or a plain object
 *
 * @example
 * if (isEvaluateError(error) && error.code === EVALUATE_REFUSAL_CODE) {
 *   error.usage
 * }
 */
export function isEvaluateError(value: unknown): value is EvaluateError {
  if (typeof value !== 'object' || value === null) return false
  if (!('name' in value) || value.name !== 'EvaluateError') return false
  return 'code' in value && typeof value.code === 'string'
}

/**
 * Evaluate adapter interface with pre-resolved generics.
 *
 * An adapter is created by a provider function: `provider('model')` → `adapter`.
 * All type resolution happens at the provider call site, not in this interface.
 *
 * Generic parameters:
 * - TModel: The specific model name (e.g. `'jev-latest'`)
 * - TProviderOptions: Provider-specific options (already resolved)
 */
export interface EvaluateAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
> {
  /** Discriminator for adapter kind */
  readonly kind: 'evaluate'
  /** Adapter name identifier */
  readonly name: string
  /** The model this adapter is configured for */
  readonly model: TModel

  /**
   * @internal Type-only properties for inference. Not assigned at runtime.
   */
  '~types': {
    providerOptions: TProviderOptions
  }

  /**
   * Evaluate typed questions against `state`. Return the provider payload.
   * Do not invent unified `.value` fields. The activity maps wire answers.
   */
  evaluate: (
    options: EvaluateOptions<TProviderOptions>,
  ) => Promise<EvaluateAdapterResult>
}

/**
 * An EvaluateAdapter with any/unknown type parameters.
 * Useful as a constraint in generic functions and interfaces.
 */
export type AnyEvaluateAdapter = EvaluateAdapter<any, any>

/**
 * Abstract base class for evaluate adapters.
 * Extend this class to implement an evaluate adapter for a specific provider.
 *
 * Generic parameters match EvaluateAdapter. The provider function resolves them.
 */
export abstract class BaseEvaluateAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
> implements EvaluateAdapter<TModel, TProviderOptions> {
  readonly kind = 'evaluate' as const
  abstract readonly name: string
  readonly model: TModel

  // Type-only property - never assigned at runtime
  declare '~types': {
    providerOptions: TProviderOptions
  }

  protected config: EvaluateAdapterConfig

  constructor(config: EvaluateAdapterConfig = {}, model: TModel) {
    this.config = config
    this.model = model
  }

  abstract evaluate(
    options: EvaluateOptions<TProviderOptions>,
  ): Promise<EvaluateAdapterResult>

  protected generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  }
}
