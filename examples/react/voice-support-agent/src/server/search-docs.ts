import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const RAW = 'https://raw.githubusercontent.com/TanStack/ai/main/docs'

/** Every docs page, from the same file the docs site reads. Fetched once. */
let pages: Promise<Array<{ label: string; to: string }>> | undefined

/** Start the page list download early, so the first search does not wait. */
export function warmDocs() {
  listPages().catch(() => {})
}

/** "useChat" reads as "use chat", on both sides of the match. */
const words = (text: string) =>
  text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/\W+/)
    .filter(Boolean)

async function fetchDoc(path: string) {
  const response = await fetch(`${RAW}/${path}`)
  if (!response.ok) {
    throw new Error(`Docs fetch failed: ${response.status} ${path}`)
  }
  return response
}

function listPages() {
  pages ??= fetchDoc('config.json')
    .then((r) => r.json())
    .then((config: unknown) => {
      const found: Array<{ label: string; to: string }> = []
      // The section label joins the page label, so "Chat & Streaming" pages
      // match "chat". Reference and example entries have no markdown page.
      const walk = (node: unknown, section: string) => {
        if (Array.isArray(node)) return node.forEach((n) => walk(n, section))
        if (typeof node !== 'object' || node === null) return
        const label =
          'label' in node && typeof node.label === 'string' ? node.label : ''
        if (
          'to' in node &&
          typeof node.to === 'string' &&
          !/^reference\/|\/examples\//.test(node.to)
        ) {
          found.push({ label: `${section} ${label}`, to: node.to })
        }
        Object.values(node).forEach((n) => walk(n, label || section))
      }
      walk(config, '')
      return found
    })
    .catch((error: unknown) => {
      // Do not cache a failure. The next call retries.
      pages = undefined
      throw error
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
  const terms = words(query)
  const ranked = (await listPages())
    .map((page) => {
      const haystack = words(`${page.label} ${page.to}`).join(' ')
      return { page, score: terms.filter((w) => haystack.includes(w)).length }
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)

  const results = await Promise.all(
    ranked.map(async ({ page }) => {
      const markdown = await fetchDoc(`${page.to}.md`).then((r) => r.text())
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
