import type { ModelRecord, ReasoningLevel } from './types'

// ponytail: the same rules as `supportedReasoningLevels` and
// `clampReasoningLevel` in `@tanstack/ai` (pi's rules). They are copied so
// this package has no dependencies. A test runs both on the same data.
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
 * The levels a model supports, from least to most thinking: the levels in
 * its `reasoning` data. A model that does not reason supports only `off`.
 */
export function supportedReasoningLevels(
  model: Pick<ModelRecord, 'reasoning'>,
): ReadonlyArray<ReasoningLevel> {
  const reasoning = model.reasoning
  if (!reasoning) return ['off']
  return LEVELS.filter((level) => level in reasoning.levels)
}

/**
 * The level to use: `level` when the model supports it, else the nearest
 * supported level above it, else the nearest below it, else `off`.
 */
export function clampReasoningLevel(
  model: Pick<ModelRecord, 'reasoning'>,
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
