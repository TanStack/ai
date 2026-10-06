import type { ModelReasoning, ModelRecord, ReasoningLevel } from './types'

/**
 * The record's reasoning data for an adapter's `reasoning` config:
 * `createAnthropicChat(record.id, key, { reasoning: modelReasoning(record) })`.
 */
export function modelReasoning(
  model: Pick<ModelRecord, 'reasoning' | 'reasoningMap' | 'reasoningBudget'>,
): ModelReasoning {
  if (!model.reasoning) return false
  return {
    ...(model.reasoningMap ? { map: model.reasoningMap } : {}),
    budget: model.reasoningBudget === true,
  }
}

// ponytail: the same rules as `supportedReasoningLevels` and
// `clampReasoningLevel` in `@tanstack/ai` (pi's rules). They are copied so
// this package has no dependencies. A test runs both on the same table.
const LEVELS: ReadonlyArray<ReasoningLevel> = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]

/**
 * The levels a model supports: only `off` for a model that does not reason.
 * Otherwise every level except the ones mapped to `null`, and `xhigh` and
 * `max` only when the map has a value for them.
 */
export function supportedReasoningLevels(
  model: Pick<ModelRecord, 'reasoning' | 'reasoningMap'>,
): ReadonlyArray<ReasoningLevel> {
  if (!model.reasoning) return ['off']
  const map = model.reasoningMap
  return LEVELS.filter((level) => {
    const mapped = map?.[level]
    if (mapped === null) return false
    if (level === 'xhigh' || level === 'max') return mapped !== undefined
    return true
  })
}

/**
 * The level to use: `level` when the model supports it, else the nearest
 * supported level above it, else the nearest below it, else `off`.
 */
export function clampReasoningLevel(
  model: Pick<ModelRecord, 'reasoning' | 'reasoningMap'>,
  level: ReasoningLevel,
): ReasoningLevel {
  const supported = supportedReasoningLevels(model)
  if (supported.includes(level)) return level
  const index = LEVELS.indexOf(level)
  const above = LEVELS.slice(index + 1).find((candidate) =>
    supported.includes(candidate),
  )
  if (above) return above
  const below = LEVELS.slice(0, index)
    .reverse()
    .find((candidate) => supported.includes(candidate))
  return below ?? supported[0] ?? 'off'
}
