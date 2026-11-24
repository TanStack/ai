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

/** Lowercase words of a text, split at non-alphanumerics and camelCase. */
function words(text: string): Set<string> {
  return new Set(
    text
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  )
}

/**
 * Lazy tools that match a search query, best match first. A tool scores one
 * point for each query word in its name or description.
 */
// ponytail: keyword overlap, no stemming or synonyms. Swap in BM25 or
// embeddings here if recall on large catalogs is not good enough.
export function searchLazyTools<
  TTool extends { name: string; description: string },
>(tools: Iterable<TTool>, query: string, limit = 10): Array<TTool> {
  const asked = words(query)
  return Array.from(tools)
    .map((tool) => {
      const own = words(`${tool.name} ${tool.description}`)
      let score = 0
      for (const word of asked) if (own.has(word)) score++
      return { tool, score }
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((match) => match.tool)
}
