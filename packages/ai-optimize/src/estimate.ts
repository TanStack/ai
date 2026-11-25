/**
 * Token estimation (D8). No tokenizer dependency in v1.
 *
 * - text: `ceil(chars / 4)`
 * - JSON: `ceil(chars / 2)`
 *
 * The same documented heuristic family Strands' TS SDK uses. Every count these
 * functions produce is an estimate and is written with a leading `~` wherever
 * it is surfaced (markers, events, reports).
 */

/** Chars-per-token divisor for a plain text string. */
export const TEXT_DIVISOR = 4
/** Chars-per-token divisor for serialized JSON. */
export const JSON_DIVISOR = 2

/** Estimate tokens for an already-materialized string, picking the divisor by
 *  whether the source value was a raw string (text) or serialized JSON. */
export function estimateChars(charCount: number, isText: boolean): number {
  return Math.ceil(charCount / (isText ? TEXT_DIVISOR : JSON_DIVISOR))
}

/** Estimate tokens for a value. Strings use the text divisor; everything else
 *  is serialized and uses the JSON divisor. */
export function estimateTokens(value: unknown): number {
  if (typeof value === 'string') return estimateChars(value.length, true)
  let json = ''
  try {
    json = JSON.stringify(value) ?? ''
  } catch {
    json = ''
  }
  return estimateChars(json.length, false)
}
