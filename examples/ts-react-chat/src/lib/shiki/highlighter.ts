import { tanstackInkTheme } from './theme'
import type { Highlighter } from 'shiki'

/**
 * Lazy shiki singleton.
 *
 * Uses shiki's high-level `createHighlighter` API rather than the
 * fine-grained `shiki/core` entry — keeps us free of pinning to internal
 * `@shikijs/langs` subpaths that aren't hoisted by pnpm. The dynamic import
 * is only triggered the first time a `<CodeBlock>` mounts.
 */
let highlighterPromise: Promise<Highlighter> | null = null

export function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const { createHighlighter } = await import('shiki')
      return createHighlighter({
        themes: [tanstackInkTheme],
        langs: ['diff', 'markdown', 'typescript', 'tsx', 'json', 'bash'],
      })
    })()
  }
  return highlighterPromise
}

const KNOWN_LANGS = new Set([
  'diff',
  'markdown',
  'md',
  'typescript',
  'ts',
  'tsx',
  'json',
  'bash',
  'sh',
])

/** Map a filename extension to a shiki-known language id. Falls back to
 *  'typescript' for unknown extensions — this helper is used by the file
 *  panel, which renders applied file content (not diffs); typescript is the
 *  realistic default for LLM-generated server code in this demo. Callers
 *  that want diff highlighting (e.g. the inline patch line in the log)
 *  should pass `lang="diff"` explicitly. */
export function inferLangFromFilename(filename: string | undefined): string {
  if (!filename) return 'typescript'
  const ext = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase()
  switch (ext) {
    case 'ts':
      return 'typescript'
    case 'tsx':
      return 'tsx'
    case 'js':
    case 'mjs':
    case 'cjs':
      return 'typescript'
    case 'json':
      return 'json'
    case 'md':
    case 'mdx':
      return 'markdown'
    case 'sh':
      return 'bash'
    default:
      return 'typescript'
  }
}

export function normalizeLang(lang: string | undefined): string {
  if (!lang) return 'typescript'
  return KNOWN_LANGS.has(lang) ? lang : 'typescript'
}
