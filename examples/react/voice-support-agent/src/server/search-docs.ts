import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const RAW = 'https://raw.githubusercontent.com/TanStack/ai/main/docs'

/** Every docs page, from the same file the docs site reads. Fetched once. */
let pages: Promise<Array<{ label: string; to: string }>> | undefined

function listPages() {
  pages ??= fetch(`${RAW}/config.json`)
    .then((r) => r.json())
    .then((config: unknown) => {
      const found: Array<{ label: string; to: string }> = []
      const walk = (node: unknown) => {
        if (Array.isArray(node)) return node.forEach(walk)
        if (typeof node !== 'object' || node === null) return
        if (
          'to' in node &&
          'label' in node &&
          typeof node.to === 'string' &&
          typeof node.label === 'string'
        ) {
          found.push({ label: node.label, to: node.to })
        }
        Object.values(node).forEach(walk)
      }
      walk(config)
      return found
    })
  return pages
}

/**
 * Looks up TanStack AI docs by keyword. The model calls this before it
 * answers a question about the library, so answers come from the docs and
 * not from memory.
 */
export const searchDocs = toolDefinition({
  name: 'search_docs',
  description:
    'Search the TanStack AI documentation. Call this before answering any question about TanStack AI features, APIs, adapters, or setup.',
  inputSchema: z.object({
    query: z.string().meta({
      description: 'Two to five keywords, for example "tool approval"',
    }),
  }),
  outputSchema: z.object({
    pages: z.array(
      z.object({ title: z.string(), url: z.string(), text: z.string() }),
    ),
  }),
}).server(async ({ query }) => {
  const words = query.toLowerCase().split(/\W+/).filter(Boolean)
  const ranked = (await listPages())
    .map((page) => {
      const haystack = `${page.label} ${page.to}`.toLowerCase()
      return { page, score: words.filter((w) => haystack.includes(w)).length }
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)

  const results = await Promise.all(
    ranked.map(async ({ page }) => {
      const markdown = await fetch(`${RAW}/${page.to}.md`).then((r) => r.text())
      // ponytail: keyword match on titles plus the first 4000 chars of each
      // page. Swap in embeddings when answers need the middle of long pages.
      const text = markdown.replace(/^---[\s\S]*?---\s*/, '').slice(0, 4000)
      return {
        title: page.label,
        url: `https://tanstack.com/ai/latest/docs/${page.to}`,
        text,
      }
    }),
  )
  return { pages: results }
})
