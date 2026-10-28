import type { LazyToolsConfig } from '../../../types'

/**
 * Extract the first sentence of a description (up to the first ., !, or ?
 * followed by whitespace or end-of-string). Falls back to the whole trimmed
 * string when there is no sentence terminator.
 */
export function firstSentence(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  const match = trimmed.match(/^.*?[.!?](?=\s|$)/)
  return (match ? match[0] : trimmed).trim()
}

/**
 * Render one entry in a lazy-tool catalog according to `includeDescription`.
 * - 'none' (default) → bare name (preserves legacy chat behavior)
 * - 'first-sentence' → `name — <first sentence>`
 * - 'full' → `name — <full description>`
 * Falls back to the bare name when there is no description.
 */
export function renderLazyCatalogEntry(
  name: string,
  description: string,
  includeDescription: LazyToolsConfig['includeDescription'] = 'none',
): string {
  if (includeDescription === 'none' || !description.trim()) return name
  const desc =
    includeDescription === 'first-sentence'
      ? firstSentence(description)
      : description.trim()
  return desc ? `${name} — ${desc}` : name
}
