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
 * A model's level map: the provider value to send for a level, or `null` when
 * the model does not support that level. A level with no entry passes as its
 * own name (except `xhigh` and `max`, which need an entry). `off: null` means
 * "send nothing" for no thinking.
 */
export type ReasoningMap = Partial<Record<ReasoningLevel, string | null>>

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
 * Otherwise its level map (none means every level up to `high` passes as its
 * own name) and whether it takes a token budget.
 */
export type ModelReasoning = false | { map?: ReasoningMap; budget: boolean }

/** The levels a level map supports, with the rules of `supportedReasoningLevels`. */
type MapLevels<TMap> = Exclude<
  ReasoningLevel,
  | { [L in keyof TMap]: TMap[L] extends string ? never : L }[keyof TMap]
  | Exclude<'xhigh' | 'max', keyof TMap>
>

/**
 * The type-level capability of a model's reasoning data, for an adapter's
 * `'~types'.reasoning`. Provider packages keep the data in their model meta
 * `as const`, and derive the levels from it with this type.
 */
export type ModelReasoningCapability<
  TReasoning extends { map?: ReasoningMap; budget: boolean },
> = {
  levels: MapLevels<NonNullable<TReasoning['map']>>
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
 * The levels a model supports, with pi's rules:
 * - a model that does not reason supports only `off`
 * - a level whose map value is `null` is not supported
 * - `xhigh` and `max` are supported only when the map has a value for them
 * - every other level is supported
 *
 * `undefined` (a model with no data) counts as a reasoning model with no map.
 */
export function supportedReasoningLevels(
  reasoning: ModelReasoning | undefined,
): ReadonlyArray<ReasoningLevel> {
  if (reasoning === false) return ['off']
  const map = reasoning?.map
  return REASONING_LEVELS.filter((level) => {
    const mapped = map?.[level]
    if (mapped === null) return false
    if (level === 'xhigh' || level === 'max') return mapped !== undefined
    return true
  })
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
 * The provider value for a supported `level`: the map value, else the level's
 * own name. `null` means "send nothing" (only `off` can map to `null` here,
 * because a `null` on any other level makes it unsupported).
 */
export function reasoningValue(
  reasoning: ModelReasoning | undefined,
  level: ReasoningLevel,
): string | null {
  const mapped = reasoning === false ? undefined : reasoning?.map?.[level]
  return mapped === undefined ? level : mapped
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
  /** The value to send for `level`. `null`: send nothing. */
  value: string | null
  summary: boolean
  budgetTokens?: number
}

/**
 * Resolve `request` for a model: clamp the level to the model's levels, and
 * look up its provider value. `undefined` when there is nothing to send: no
 * request, or a model that does not reason or has no reasoning data.
 */
export function resolveReasoning(
  request: ReasoningRequest | undefined,
  reasoning: ModelReasoning | undefined,
): ResolvedReasoning | undefined {
  if (!request || !reasoning) return undefined
  const level = clampReasoningLevel(reasoning, request.level)
  return {
    level,
    value: reasoningValue(reasoning, level),
    summary: request.summary,
    ...(request.budgetTokens !== undefined
      ? { budgetTokens: request.budgetTokens }
      : {}),
  }
}
