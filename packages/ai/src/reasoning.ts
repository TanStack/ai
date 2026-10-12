/**
 * How hard a model thinks. `off` asks for no thinking. The levels are ordered
 * from least to most, and the clamp rule walks this order.
 */
export type ReasoningLevel =
  | 'off'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'

/** Every level, from least to most thinking. */
export const REASONING_LEVELS: ReadonlyArray<ReasoningLevel> = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]

/**
 * A model's levels: the provider value to send for each level the model has.
 * A level with no entry is not supported.
 */
export type ReasoningLevels = Partial<Record<ReasoningLevel, string>>

/**
 * What a model supports, at the type level. Adapters declare it per model in
 * `'~types'.reasoning`. `levels` is a union of the model's levels. `budget`
 * says whether the model takes a thinking token budget.
 */
export interface ReasoningCapability {
  levels: ReasoningLevel
  budget: boolean
}

/**
 * The `reasoning` option of `chat()`: a level, or an object. `summary` asks
 * the provider to stream the thinking text (default `true`). `budgetTokens`
 * sets an exact thinking budget, on models that take one.
 */
export type ReasoningOption<
  TCapability extends ReasoningCapability = ReasoningCapability,
> =
  | TCapability['levels']
  | ({
      level: TCapability['levels']
      summary?: boolean
    } & (true extends TCapability['budget']
      ? { budgetTokens?: number }
      : { budgetTokens?: never }))

/** The reasoning capability an adapter declares in `'~types'`, or `never`. */
export type AdapterReasoning<TAdapter> = TAdapter extends {
  '~types': { reasoning?: infer TCapability }
}
  ? TCapability
  : never

/** The `reasoning` option a model's capability allows. `never` for a model that does not reason. */
export type ReasoningOptionFor<TCapability> = [TCapability] extends [never]
  ? never
  : TCapability extends ReasoningCapability
    ? ReasoningOption<TCapability>
    : never

/** The `reasoning` an adapter gets in `TextOptions`, after `chat()` normalized it. */
export interface ReasoningRequest {
  level: ReasoningLevel
  summary: boolean
  budgetTokens?: number
}

/**
 * A model's reasoning data at runtime. `false`: the model does not reason.
 * Otherwise the levels it has, and whether it takes a token budget.
 */
export type ModelReasoning =
  | false
  | { levels: ReasoningLevels; budget: boolean }

/**
 * The type-level capability of a model's reasoning data, for an adapter's
 * `'~types'.reasoning`. Provider packages keep the data in their model meta
 * `as const`, and derive the levels from it with this type.
 */
export type ModelReasoningCapability<
  TReasoning extends { levels: ReasoningLevels; budget: boolean },
> = {
  levels: keyof TReasoning['levels'] & ReasoningLevel
  budget: TReasoning['budget']
}

/** A level or an object, as the user passed it, into the one shape adapters read. */
export function normalizeReasoning(
  option: ReasoningOption | undefined,
): ReasoningRequest | undefined {
  if (option === undefined) return undefined
  if (typeof option === 'string') return { level: option, summary: true }
  return {
    level: option.level,
    summary: option.summary ?? true,
    ...(option.budgetTokens !== undefined
      ? { budgetTokens: option.budgetTokens }
      : {}),
  }
}

/**
 * The levels a model supports, from least to most thinking: the levels in its
 * data. A model that does not reason, or has no data, supports only `off`.
 */
export function supportedReasoningLevels(
  reasoning: ModelReasoning | undefined,
): ReadonlyArray<ReasoningLevel> {
  if (!reasoning) return ['off']
  return REASONING_LEVELS.filter((level) => level in reasoning.levels)
}

/**
 * A level the model supports: the level itself, else the nearest supported
 * level above it, else the nearest below it, else `off`. The same rule as pi.
 */
export function clampReasoningLevel(
  reasoning: ModelReasoning | undefined,
  level: ReasoningLevel,
): ReasoningLevel {
  const supported = supportedReasoningLevels(reasoning)
  if (supported.includes(level)) return level
  const index = REASONING_LEVELS.indexOf(level)
  const above = REASONING_LEVELS.slice(index + 1).find((candidate) =>
    supported.includes(candidate),
  )
  if (above) return above
  const below = REASONING_LEVELS.slice(0, index)
    .reverse()
    .find((candidate) => supported.includes(candidate))
  return below ?? supported[0] ?? 'off'
}

/**
 * pi's thinking budgets for budget-based models. `xhigh` and `max` get the
 * `high` budget: budget-based models have no higher level.
 */
export const DEFAULT_REASONING_BUDGETS: Readonly<
  Record<Exclude<ReasoningLevel, 'off'>, number>
> = {
  minimal: 1024,
  low: 2048,
  medium: 8192,
  high: 16384,
  xhigh: 16384,
  max: 16384,
}

/** The thinking budget for a request: `budgetTokens`, else pi's table. `0` for `off`. */
export function reasoningBudget(request: ReasoningRequest): number {
  if (request.budgetTokens !== undefined) return request.budgetTokens
  return request.level === 'off' ? 0 : DEFAULT_REASONING_BUDGETS[request.level]
}

/** A request resolved for one model: the clamped level and its provider value. */
export interface ResolvedReasoning {
  level: ReasoningLevel
  /** The provider value to send for `level`. */
  value: string
  summary: boolean
  budgetTokens?: number
}

/**
 * Resolve `request` for a model: clamp the level to the model's levels, and
 * look up its provider value. `undefined` when there is nothing to send: no
 * request, or a model that does not reason, has no data, or has no levels.
 */
export function resolveReasoning(
  request: ReasoningRequest | undefined,
  reasoning: ModelReasoning | undefined,
): ResolvedReasoning | undefined {
  if (!request || !reasoning) return undefined
  const level = clampReasoningLevel(reasoning, request.level)
  const value = reasoning.levels[level]
  if (value === undefined) return undefined
  return {
    level,
    value,
    summary: request.summary,
    ...(request.budgetTokens !== undefined
      ? { budgetTokens: request.budgetTokens }
      : {}),
  }
}
