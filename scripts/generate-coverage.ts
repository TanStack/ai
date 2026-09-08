/**
 * Generates adapter-coverage.json: which activities and models each adapter
 * package supports, read from the packages' model-meta.ts files so the file
 * cannot drift from the code. tanstack.com fetches it at request time for the
 * AI coverage page.
 *
 * Usage:
 *   pnpm generate:coverage
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ACTIVITIES = [
  'chat',
  'image',
  'video',
  'speech',
  'transcription',
  'audio',
  'realtime',
  'embedding',
  'rerank',
  'search',
  'harness',
] as const

export type Activity = (typeof ACTIVITIES)[number]

export interface ModelModalities {
  input: Array<string>
  output: Array<string>
}

export interface AdapterCoverage {
  id: string
  package: string
  name: string
  docs: string
  /** Free-form note for adapters whose model list is open-ended. */
  note?: string
  activities: Partial<Record<Activity, Array<string>>>
  /** Per-model input and output modalities, where the package declares them. */
  models: Record<string, ModelModalities>
}

export interface Coverage {
  generatedAt: string
  activities: ReadonlyArray<Activity>
  adapters: Array<AdapterCoverage>
}

const ROOT = fileURLToPath(new URL('..', import.meta.url))

// Coding-agent harness packages expose one `*_MODELS` array that is not chat.
const HARNESS_PACKAGES = new Set([
  'claude-code',
  'codex',
  'opencode',
  'grok-build',
])

// Export-name suffix → activity. Checked longest-first, so VERTEX_CHAT wins
// over MODELS and INTERACTIONS_VIDEO over VIDEO.
const SUFFIX_ACTIVITIES: Array<[RegExp, Activity]> = [
  [/_(VERTEX_CHAT|CHAT|TEXT|CONVERSE|RESPONSES)_MODELS$/, 'chat'],
  [/_(INTERACTIONS_)?VIDEO_MODELS$/, 'video'],
  [/_IMAGE_MODELS$/, 'image'],
  [/_TTS_MODELS$/, 'speech'],
  [/_TRANSCRIPTION_MODELS$/, 'transcription'],
  [/_AUDIO_MODELS$/, 'audio'],
  [/_REALTIME_MODELS$/, 'realtime'],
  [/_EMBEDDING_MODELS$/, 'embedding'],
  [/_RERANK_MODELS$/, 'rerank'],
]

// String-array exports that are not model lists, or are subsets of one.
const IGNORED_EXPORTS = new Set([
  'BYTEPLUS_STRUCTURED_OUTPUT_CHAT_MODELS',
  'BYTEPLUS_THINKING_SUMMARY_MODELS',
  'GEMINI_TTS_VOICES',
  'VERCEL_GATEWAY_MODEL_TAGS',
  'VERCEL_GATEWAY_PROVIDERS',
])

// Adapters with no model-meta.ts, or whose model list is open-ended.
const MANUAL_ADAPTERS: Array<
  Pick<AdapterCoverage, 'id' | 'activities' | 'note'>
> = [
  {
    id: 'fal',
    activities: { image: [], video: [] },
    note: 'Any fal.ai endpoint. 600+ model ids are typed from the fal SDK.',
  },
  {
    id: 'cloudflare',
    activities: {
      chat: [],
      embedding: [],
      image: [],
      speech: [],
      transcription: [],
    },
    note: 'Workers AI models, plus AI Gateway routing to other providers.',
  },
  {
    id: 'perplexity',
    activities: { search: [] },
    note: 'Web search as a provider-executed tool.',
  },
  {
    id: 'vertex',
    activities: { chat: [] },
    note: 'Gemini on Vertex AI. Claude, Grok, and Mistral on Vertex live in their own packages.',
  },
  {
    id: 'openai-compatible',
    activities: { chat: [], embedding: [] },
    note: 'Any endpoint that speaks the OpenAI chat and embeddings shape.',
  },
]

export function classifyExport(
  packageId: string,
  exportName: string,
): Activity | 'ignored' | null {
  if (IGNORED_EXPORTS.has(exportName)) return 'ignored'
  if (HARNESS_PACKAGES.has(packageId) && /_MODELS$/.test(exportName)) {
    return 'harness'
  }
  for (const [pattern, activity] of SUFFIX_ACTIVITIES) {
    if (pattern.test(exportName)) return activity
  }
  // ANTHROPIC_MODELS, GEMINI_MODELS: the bare list is the chat list.
  if (/^[A-Z]+_MODELS$/.test(exportName)) return 'chat'
  return null
}

/** Pull `{ name: '...', supports: { input: [...], output: [...] } }` literals out of a source file. */
// ponytail: TypeScript 7 ships no compiler API, so this is a regex over the
// literal shape every model-meta.ts uses. A model that declares `supports`
// differently is simply absent from `models`; the activity lists do not depend on it.
export function extractModalities(
  source: string,
): Record<string, ModelModalities> {
  const models: Record<string, ModelModalities> = {}
  const list = (block: string, key: string): Array<string> | null => {
    const match = new RegExp(`\\b${key}:\\s*\\[([^\\]]*)\\]`).exec(block)
    if (!match) return null
    return [...match[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!)
  }

  const chunks = source.split(/\bname:\s*'/).slice(1)
  for (const chunk of chunks) {
    const name = chunk.slice(0, chunk.indexOf("'"))
    const supportsAt = chunk.indexOf('supports:')
    if (!name || supportsAt === -1) continue
    const block = chunk.slice(supportsAt)
    const input = list(block, 'input')
    if (!input) continue
    models[name] = { input, output: list(block, 'output') ?? [] }
  }

  return models
}

async function docTitle(id: string): Promise<{ name: string; docs: string }> {
  const docs = `adapters/${id}`
  const source = await readFile(join(ROOT, 'docs', `${docs}.md`), 'utf8')
  const title = /^title:\s*(.+)$/m.exec(source)?.[1]?.trim()
  if (!title) throw new Error(`docs/${docs}.md has no title`)
  return { name: title, docs }
}

export async function generateCoverage(): Promise<Coverage> {
  const packagesDir = join(ROOT, 'packages')
  const adapters: Array<AdapterCoverage> = []

  for (const dir of (await readdir(packagesDir)).sort()) {
    const metaPath = join(packagesDir, dir, 'src', 'model-meta.ts')
    let source: string
    try {
      source = await readFile(metaPath, 'utf8')
    } catch {
      continue
    }
    const id = dir.replace(/^ai-/, '')
    if (MANUAL_ADAPTERS.some((manual) => manual.id === id)) continue

    const mod: Record<string, unknown> = await import(metaPath)
    const activities: AdapterCoverage['activities'] = {}

    for (const [exportName, value] of Object.entries(mod)) {
      if (
        !Array.isArray(value) ||
        !value.every((item) => typeof item === 'string')
      ) {
        continue
      }
      const activity = classifyExport(id, exportName)
      if (activity === 'ignored') continue
      if (activity === null) {
        throw new Error(
          `${dir}/src/model-meta.ts exports ${exportName}, which generate-coverage cannot classify. Add it to SUFFIX_ACTIVITIES or IGNORED_EXPORTS.`,
        )
      }
      const models = new Set([...(activities[activity] ?? []), ...value])
      activities[activity] = [...models]
    }

    adapters.push({
      id,
      package: `@tanstack/ai-${id}`,
      ...(await docTitle(id)),
      activities: sortActivities(activities),
      models: sortKeys(extractModalities(source)),
    })
  }

  for (const manual of MANUAL_ADAPTERS) {
    adapters.push({
      id: manual.id,
      package: `@tanstack/ai-${manual.id === 'openai-compatible' ? 'openai' : manual.id}`,
      ...(await docTitle(manual.id)),
      note: manual.note,
      activities: manual.activities,
      models: {},
    })
  }

  adapters.sort((a, b) => a.name.localeCompare(b.name))

  return {
    generatedAt: new Date().toISOString(),
    activities: ACTIVITIES,
    adapters,
  }
}

// Module export order differs between runtimes, so pin the JSON key order.
function sortActivities(
  activities: AdapterCoverage['activities'],
): AdapterCoverage['activities'] {
  const sorted: AdapterCoverage['activities'] = {}
  for (const activity of ACTIVITIES) {
    const models = activities[activity]
    if (models) sorted[activity] = [...models].sort()
  }
  return sorted
}

function sortKeys<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => a.localeCompare(b)),
  )
}

export function serializeCoverage(coverage: Coverage): string {
  return `${JSON.stringify(coverage, null, 2)}\n`
}

export const COVERAGE_PATH = join(ROOT, 'adapter-coverage.json')

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const coverage = await generateCoverage()
  await writeFile(COVERAGE_PATH, serializeCoverage(coverage))
  console.log(
    `Wrote ${coverage.adapters.length} adapters to adapter-coverage.json`,
  )
}
