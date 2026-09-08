/**
 * Generates adapter-coverage.json: which activities and models each adapter
 * package supports, read from the packages themselves so the file cannot
 * drift from the code. tanstack.com fetches it at request time for the AI
 * coverage page.
 *
 * Activities come from the adapter factories a package exports (`openaiText`,
 * `falSpeech`, `perplexitySearchTool`). Model lists come from the string
 * arrays its model-meta.ts exports. An activity with no model list is
 * open-ended: the adapter accepts whatever the provider serves.
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
  /** Activity → typed model ids. An empty list means open-ended. */
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

// Coding-agent harness packages: their `*Text` adapter drives a harness, not a model.
const HARNESS_PACKAGES = new Set([
  'acp',
  'claude-code',
  'codex',
  'opencode',
  'grok-build',
])

// Adapter factory suffix → activity.
const FACTORY_ACTIVITIES: Array<[RegExp, Activity]> = [
  [/Text$/, 'chat'],
  [/Image$/, 'image'],
  [/Video$/, 'video'],
  [/Speech$/, 'speech'],
  [/Transcription$/, 'transcription'],
  [/Audio$/, 'audio'],
  [/Realtime(Token)?$/, 'realtime'],
  [/Embedding$/, 'embedding'],
  [/Rerank$/, 'rerank'],
  [/Search(Tool)?$/, 'search'],
]

// model-meta.ts export-name suffix → activity. Checked in order, so
// VERTEX_CHAT wins over MODELS and INTERACTIONS_VIDEO over VIDEO.
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

// Shown next to adapters whose catalog is open-ended.
const NOTES: Record<string, string> = {
  fal: 'Any fal.ai endpoint. 600+ model ids are typed from the fal SDK.',
  cloudflare: 'Workers AI models, plus AI Gateway routing to other providers.',
  perplexity: 'Web search as a provider-executed tool.',
  vertex:
    'Gemini on Vertex AI. Claude, Grok, and Mistral on Vertex live in their own packages.',
  'openai-compatible':
    'Any endpoint that speaks the OpenAI chat completions shape.',
}

// Packages that are not provider adapters. Anything else that exports an
// adapter factory must have a docs/adapters page, or generation fails.
const NON_ADAPTER_PACKAGES =
  /^ai-(react|vue|solid|svelte|preact|angular|octane|remix|client|devtools|utils|persistence|durable-stream|memory|compaction|mcp|code-mode.*|isolate-.*|sandbox.*|skills|event-client|.*-ui|typescript|.*-devtools)$/

// Adapters whose docs page is not docs/adapters/<id>.md.
const DOC_SLUGS: Record<string, string> = { acp: 'acp-compatible' }

// Adapters that are a sub-entry of another package.
const EXTRA_ADAPTERS = [
  {
    id: 'openai-compatible',
    package: '@tanstack/ai-openai/compatible',
    entry: 'ai-openai/src/compatible/index.ts',
  },
]

/** Activities an index.ts exposes, read from the adapter factory names it exports. */
export function extractActivities(
  packageId: string,
  source: string,
): Array<Activity> {
  const exported = new Set<string>()
  for (const block of source.matchAll(/^\s*export \{([^}]*)\}/gm)) {
    for (const name of block[1]!.split(',')) {
      const bare = name
        .trim()
        .split(/\s+as\s+/)
        .pop()
      if (bare) exported.add(bare)
    }
  }
  for (const fn of source.matchAll(/^\s*export (?:async )?function (\w+)/gm)) {
    exported.add(fn[1]!)
  }

  const activities = new Set<Activity>()
  for (const name of exported) {
    if (!/^[a-z][A-Za-z]*$/.test(name)) continue
    for (const [pattern, activity] of FACTORY_ACTIVITIES) {
      if (!pattern.test(name)) continue
      activities.add(
        activity === 'chat' && HARNESS_PACKAGES.has(packageId)
          ? 'harness'
          : activity,
      )
    }
  }
  return [...activities]
}

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
  const docs = `adapters/${DOC_SLUGS[id] ?? id}`
  const source = await readFile(join(ROOT, 'docs', `${docs}.md`), 'utf8')
  const title = /^title:\s*(.+)$/m.exec(source)?.[1]?.trim()
  if (!title) throw new Error(`docs/${docs}.md has no title`)
  return { name: title, docs }
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

export async function generateCoverage(): Promise<Coverage> {
  const packagesDir = join(ROOT, 'packages')
  const targets = [...EXTRA_ADAPTERS]

  for (const dir of (await readdir(packagesDir)).sort()) {
    if (!dir.startsWith('ai-') || NON_ADAPTER_PACKAGES.test(dir)) continue
    const entry = join(dir, 'src', 'index.ts')
    const source = await readOptional(join(packagesDir, entry))
    const id = dir.replace(/^ai-/, '')
    // Only packages that export at least one adapter factory are adapters.
    if (!source || extractActivities(id, source).length === 0) continue
    targets.push({ id, package: `@tanstack/ai-${id}`, entry })
  }

  const adapters: Array<AdapterCoverage> = []

  for (const target of targets) {
    const indexSource = await readFile(join(packagesDir, target.entry), 'utf8')
    const activities: AdapterCoverage['activities'] = {}
    for (const activity of extractActivities(target.id, indexSource)) {
      activities[activity] = []
    }

    const metaPath = join(
      packagesDir,
      `ai-${target.id}`,
      'src',
      'model-meta.ts',
    )
    const metaSource = await readOptional(metaPath)

    if (metaSource) {
      const mod: Record<string, unknown> = await import(metaPath)
      for (const [exportName, value] of Object.entries(mod)) {
        if (
          !Array.isArray(value) ||
          !value.every((item) => typeof item === 'string')
        ) {
          continue
        }
        const activity = classifyExport(target.id, exportName)
        if (activity === 'ignored') continue
        if (activity === null) {
          throw new Error(
            `ai-${target.id}/src/model-meta.ts exports ${exportName}, which generate-coverage cannot classify. Add it to SUFFIX_ACTIVITIES or IGNORED_EXPORTS.`,
          )
        }
        const models = new Set([...(activities[activity] ?? []), ...value])
        activities[activity] = [...models]
      }
    }

    const note = NOTES[target.id]
    adapters.push({
      id: target.id,
      package: target.package,
      ...(await docTitle(target.id)),
      ...(note ? { note } : {}),
      activities: sortActivities(activities),
      models: sortKeys(metaSource ? extractModalities(metaSource) : {}),
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
