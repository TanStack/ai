import type { DurationOptions } from './adapter'

/**
 * `"6"`, `"6s"`, and `"6.5s"` are seconds. Anything else (`"auto"`) is a
 * keyword the model must list exactly.
 */
const DURATION_TEMPLATE = /^(\d+(?:\.\d+)?)s?$/

/**
 * Seconds from a caller-supplied template, or `null` when `input` is a
 * keyword (`"auto"`) rather than a length.
 */
function templateToSeconds(input: string): number | null {
  const match = DURATION_TEMPLATE.exec(input)
  const digits = match?.[1]
  if (digits === undefined) return null
  const seconds = Number(digits)
  return Number.isFinite(seconds) ? seconds : null
}

/**
 * Seconds from a duration a caller wrote: `6`, `"6"`, or `"6s"`.
 * Returns `undefined` for keywords such as `"auto"` and for non-finite numbers.
 */
export function durationToSeconds(input: number | string): number | undefined {
  if (typeof input === 'number') {
    return Number.isFinite(input) ? input : undefined
  }
  const seconds = templateToSeconds(input)
  return seconds === null ? undefined : seconds
}

/**
 * Extract a numeric seconds value from a `DurationOptions` entry. Returns
 * `null` for entries that don't parse as a number, for example `'auto'`.
 *
 * Handles the keyword-with-unit form FAL uses for Luma/Veo (`'8s'`, `'9s'`)
 * by stripping a trailing `s`. Pure-numeric strings (`'5'`, `'10'`) parse via
 * Number(). Numbers pass through.
 */
function entryToSeconds(entry: string | number): number | null {
  if (typeof entry === 'number') {
    return Number.isFinite(entry) ? entry : null
  }
  return templateToSeconds(entry)
}

/**
 * Snap a caller duration to the closest valid option.
 *
 * `input` may be seconds (`7`), a numeric string (`"7"`), a template
 * (`"6s"`), or a keyword the model lists (`"auto"`). A keyword that is not
 * in the set returns `undefined`. Equal numeric distances keep the earlier
 * option.
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
  input: number | string,
  options: DurationOptions<T>,
): T | undefined {
  if (typeof input === 'string') {
    const seconds = templateToSeconds(input)
    if (seconds === null) return matchKeyword(input, options)
    return snapSeconds(seconds, options)
  }
  return snapSeconds(input, options)
}

function matchKeyword<T extends string | number | undefined>(
  keyword: string,
  options: DurationOptions<T>,
): T | undefined {
  if (options.kind !== 'discrete' && options.kind !== 'mixed') return undefined
  for (const value of options.values) {
    if (value === keyword) return value
  }
  return undefined
}

function snapSeconds<T extends string | number | undefined>(
  seconds: number,
  options: DurationOptions<T>,
): T | undefined {
  switch (options.kind) {
    case 'none':
      return undefined

    case 'discrete': {
      return pickClosestDiscrete(seconds, options.values)
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
      if (!options.range) return discreteCandidate

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
            ? (entryToSeconds(discreteCandidate) ?? Infinity)
            : Infinity

      return Math.abs(discreteSeconds - seconds) <=
        Math.abs(rangeValue - seconds)
        ? discreteCandidate
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
