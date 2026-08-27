import type { LazyToolsConfig } from '../../../types'

export function firstSentence(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  const match = trimmed.match(/^.*?[.!?](?=\s|$)/)
  return (match ? match[0] : trimmed).trim()
}

export function renderLazyCatalogEntry(
  name: string,
  description: string,
  includeDescription: LazyToolsConfig['includeDescription'] = 'none',
): string {
  const skipDescription = includeDescription === 'none' || !description.trim()
  if (skipDescription) return name
  const desc =
    includeDescription === 'first-sentence'
      ? firstSentence(description)
      : description.trim()
  return desc ? `${name} — ${desc}` : name
}
