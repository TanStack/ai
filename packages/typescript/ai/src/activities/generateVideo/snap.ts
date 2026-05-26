import type { DurationOptions } from './adapter'

/**
 * Extract a numeric seconds value from a `DurationOptions` entry. Returns
 * `null` for entries that don't parse as a number — e.g. `'auto'`.
 *
 * Handles the keyword-with-unit form FAL uses for Luma/Veo (`'8s'`, `'9s'`)
 * by stripping a trailing `s`. Pure-numeric strings (`'5'`, `'10'`) parse via
 * Number(). Numbers pass through.
 */
function entryToSeconds(entry: string | number): number | null {
  if (typeof entry === 'number') {
    return Number.isFinite(entry) ? entry : null
  }
  const stripped = entry.endsWith('s') ? entry.slice(0, -1) : entry
  const parsed = Number(stripped)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Snap a raw seconds value to the closest valid duration for a model's
 * `DurationOptions`.
 *
 * - `none`            → `undefined`
 * - `discrete`        → closest numeric-parseable entry; if none parse,
 *                       returns `values[0]` (keyword-only models like 'auto')
 * - `range`           → clamped to [min, max] and rounded to `step` (default 1)
 * - `mixed`           → closest of (discrete numerics ∪ range values)
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export function snapToDurationOption<T extends string | number | undefined>(
  seconds: number,
  options: DurationOptions<T>,
): T | undefined {
  switch (options.kind) {
    case 'none':
      return undefined

    case 'discrete': {
      return pickClosestDiscrete(seconds, options.values) as T
    }

    case 'range': {
      const step = options.step ?? 1
      const clamped = Math.min(options.max, Math.max(options.min, seconds))
      const snapped =
        Math.round((clamped - options.min) / step) * step + options.min
      return Math.min(options.max, Math.max(options.min, snapped)) as T
    }

    case 'mixed': {
      const discreteCandidate = pickClosestDiscrete(seconds, options.values)
      if (!options.range) return discreteCandidate as T

      const { min, max, step = 1 } = options.range
      const clamped = Math.min(max, Math.max(min, seconds))
      const rangeValue = Math.min(
        max,
        Math.max(min, Math.round((clamped - min) / step) * step + min),
      )

      // Compare distance; range value is numeric, discrete may have non-numeric
      // first-entry fallback (return distance Infinity for non-numerics).
      const discreteSeconds =
        typeof discreteCandidate === 'number'
          ? discreteCandidate
          : discreteCandidate !== undefined
            ? (entryToSeconds(discreteCandidate as string | number) ?? Infinity)
            : Infinity

      return Math.abs(discreteSeconds - seconds) <=
        Math.abs(rangeValue - seconds)
        ? (discreteCandidate as T)
        : (rangeValue as T)
    }
  }
}

function pickClosestDiscrete<T extends string | number>(
  seconds: number,
  values: ReadonlyArray<T>,
): T | undefined {
  if (values.length === 0) return undefined

  let best: T | undefined
  let bestDistance = Infinity
  for (const value of values) {
    const v = entryToSeconds(value)
    if (v === null) continue
    const distance = Math.abs(v - seconds)
    if (distance < bestDistance) {
      bestDistance = distance
      best = value
    }
  }

  // Keyword-only set (no numeric-parseable entries) — fall back to first entry.
  return best ?? values[0]
}
