/**
 * Syncs Anthropic models from the first-party Models API snapshot
 * (scripts/anthropic.models.json, produced by fetch-anthropic-models.ts)
 * into packages/ai-anthropic/src/model-meta.ts.
 *
 * This replaces the OpenRouter-based sync for the Anthropic adapter. The
 * Models API is authoritative for:
 *   - model IDs (OpenRouter slugs use dots, e.g. 'claude-opus-4.8', which
 *     are not valid Anthropic API model IDs)
 *   - context windows and max output tokens
 *   - per-model capabilities (image input, adaptive vs extended thinking)
 *
 * Pricing is NOT exposed by the Models API, so new models require an entry
 * in the PRICING table below — the script fails loudly if one is missing
 * rather than inventing numbers.
 *
 * Usage:
 *   pnpm regenerate:anthropic-models                       # sync from committed snapshot
 *   pnpm tsx scripts/sync-anthropic-models.ts --dry-run    # print without writing
 *   pnpm tsx scripts/sync-anthropic-models.ts --input <json> --meta <ts>  # test against fixtures
 */

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const DEFAULT_INPUT = resolve(__dirname, 'anthropic.models.json')
const DEFAULT_META = resolve(ROOT, 'packages/ai-anthropic/src/model-meta.ts')
const CHANGESET_FILE = resolve(ROOT, '.changeset/sync-anthropic-models.md')

// ---------------------------------------------------------------------------
// Pricing (USD per million tokens)
//
// The Models API does not expose pricing, so this table is maintained by
// hand from https://platform.claude.com/docs/en/about-claude/pricing
// ("Cache Hits & Refreshes" is the `cached` column). When a new model
// appears in the catalog, add a row here — the sync fails with a clear
// error until it has one.
// ---------------------------------------------------------------------------

interface Pricing {
  input: number
  cached?: number
  output: number
}

const PRICING: Record<string, Pricing> = {
  'claude-fable-5': { input: 10, cached: 1, output: 50 },
  'claude-opus-4-8': { input: 5, cached: 0.5, output: 25 },
  'claude-opus-4-7': { input: 5, cached: 0.5, output: 25 },
  'claude-opus-4-6': { input: 5, cached: 0.5, output: 25 },
  'claude-opus-4-5': { input: 5, cached: 0.5, output: 25 },
  'claude-opus-4-1': { input: 15, cached: 1.5, output: 75 },
  'claude-sonnet-4-6': { input: 3, cached: 0.3, output: 15 },
  'claude-sonnet-4-5': { input: 3, cached: 0.3, output: 15 },
  'claude-haiku-4-5': { input: 1, cached: 0.1, output: 5 },
}

// ---------------------------------------------------------------------------
// Models API types (subset we consume; capability leaves are optional so the
// script degrades gracefully if the API adds/renames fields)
// ---------------------------------------------------------------------------

interface Capability {
  supported?: boolean
}

interface AnthropicApiModel {
  type?: string
  id: string
  display_name?: string
  created_at?: string
  max_input_tokens?: number
  max_tokens?: number
  capabilities?: {
    image_input?: Capability
    document_input?: Capability
    pdf_input?: Capability
    priority_tier?: Capability
    thinking?: Capability & {
      types?: {
        enabled?: Capability
        adaptive?: Capability
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Utilities (same conventions as sync-provider-models.ts)
// ---------------------------------------------------------------------------

/** Strip a trailing date suffix, e.g. 'claude-haiku-4-5-20251001' -> 'claude-haiku-4-5' */
function toAlias(id: string): string {
  return id.replace(/-20\d{6}$/, '')
}

/** Normalize for comparison (OpenRouter-style dotted IDs vs dashed IDs) */
function normalizeId(id: string): string {
  return id.replace(/[.]/g, '-')
}

function toConstName(alias: string): string {
  return alias.replace(/[-.:/]/g, '_').toUpperCase()
}

function formatNumber(n: number): string {
  if (n < 1000) return String(n)
  const str = String(n)
  const parts: Array<string> = []
  let remaining = str
  while (remaining.length > 3) {
    parts.unshift(remaining.slice(-3))
    remaining = remaining.slice(0, -3)
  }
  parts.unshift(remaining)
  return parts.join('_')
}

function extractExistingModelIds(content: string): Set<string> {
  const ids = new Set<string>()
  const nameRegex = /^\s+name:\s*'([^']+)'/gm
  const idRegex = /^\s+id:\s*'([^']+)'/gm
  let match
  while ((match = nameRegex.exec(content)) !== null) {
    ids.add(normalizeId(match[1]!))
  }
  while ((match = idRegex.exec(content)) !== null) {
    ids.add(normalizeId(match[1]!))
  }
  return ids
}

function insertConstants(content: string, constants: Array<string>): string {
  const block = '\n' + constants.join('\n\n') + '\n'
  const exportIndex = content.indexOf('\nexport ')
  if (exportIndex === -1) {
    return content + block
  }
  return content.slice(0, exportIndex) + block + content.slice(exportIndex)
}

function addToArray(
  content: string,
  arrayName: string,
  entries: Array<string>,
): string {
  const pattern = new RegExp(
    `(export const ${arrayName} = \\[\\s*[\\s\\S]*?)(\\] as const)`,
  )
  const match = pattern.exec(content)
  if (!match) {
    console.warn(`  Warning: Could not find array '${arrayName}' in file`)
    return content
  }
  const newEntries = entries.map((constName) => `  ${constName}.id,`).join('\n')
  return content.replace(
    pattern,
    () => `${match[1]}\n${newEntries}\n${match[2]}`,
  )
}

function addToTypeMap(
  content: string,
  typeName: string,
  entries: Array<string>,
): string {
  const pattern = new RegExp(
    `(export type ${typeName} = \\{[\\s\\S]*?)(\\n\\})`,
  )
  const match = pattern.exec(content)
  if (!match) {
    console.warn(`  Warning: Could not find type map '${typeName}' in file`)
    return content
  }
  const newEntries = entries.join('\n')
  return content.replace(pattern, () => `${match[1]}\n${newEntries}${match[2]}`)
}

// ---------------------------------------------------------------------------
// Model constant generation
// ---------------------------------------------------------------------------

const PROVIDER_OPTIONS_TYPE =
  'AnthropicContainerOptions & AnthropicContextManagementOptions & AnthropicMCPOptions & AnthropicServiceTierOptions & AnthropicStopSequencesOptions & AnthropicThinkingOptions & AnthropicToolChoiceOptions & AnthropicSamplingOptions'

/**
 * All current Claude chat models support the full server-tool set; the
 * Models API does not enumerate server tools, so this stays a template
 * (same as the previous OpenRouter-based sync).
 */
const TOOLS_TEMPLATE = `    tools: ['web_search', 'web_fetch', 'code_execution', 'computer_use', 'bash', 'text_editor', 'memory'],`

function generateModelConstant(
  model: AnthropicApiModel,
  alias: string,
): string {
  const constName = toConstName(alias)
  const pricing = PRICING[alias]
  if (!pricing) {
    throw new Error(
      `No pricing entry for new model '${alias}'. The Anthropic Models API does not expose pricing — add a row to the PRICING table in scripts/sync-anthropic-models.ts (see https://platform.claude.com/docs/en/pricing) and re-run.`,
    )
  }

  const caps = model.capabilities ?? {}
  const imageInput = caps.image_input?.supported ?? true
  // The Models API has no separate document/PDF flag today; every current
  // vision-capable Claude model also accepts PDF documents.
  const documentInput =
    caps.document_input?.supported ?? caps.pdf_input?.supported ?? imageInput
  const extendedThinking =
    caps.thinking?.types?.enabled?.supported ??
    caps.thinking?.supported ??
    false
  const adaptiveThinking = caps.thinking?.types?.adaptive?.supported ?? false
  const priorityTier = caps.priority_tier?.supported ?? true

  const inputModalities = [
    'text',
    ...(imageInput ? ['image'] : []),
    ...(documentInput ? ['document'] : []),
  ]
  const inputStr = inputModalities.map((m) => `'${m}'`).join(', ')

  const lines: Array<string> = []
  lines.push(`const ${constName} = {`)
  lines.push(`  name: '${alias}',`)
  lines.push(`  id: '${alias}',`)
  if (model.max_input_tokens) {
    lines.push(`  context_window: ${formatNumber(model.max_input_tokens)},`)
  }
  if (model.max_tokens) {
    lines.push(`  max_output_tokens: ${formatNumber(model.max_tokens)},`)
  }
  lines.push(`  supports: {`)
  lines.push(`    input: [${inputStr}],`)
  lines.push(`    extended_thinking: ${extendedThinking},`)
  if (adaptiveThinking) {
    lines.push(`    adaptive_thinking: true,`)
  }
  lines.push(`    priority_tier: ${priorityTier},`)
  lines.push(TOOLS_TEMPLATE)
  lines.push(`  },`)
  lines.push(`  pricing: {`)
  lines.push(`    input: {`)
  lines.push(`      normal: ${pricing.input},`)
  if (pricing.cached !== undefined) {
    lines.push(`      cached: ${pricing.cached},`)
  }
  lines.push(`    },`)
  lines.push(`    output: {`)
  lines.push(`      normal: ${pricing.output},`)
  lines.push(`    },`)
  lines.push(`  },`)
  lines.push(`} as const satisfies ModelMeta<${PROVIDER_OPTIONS_TYPE}>`)
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (flag: string) => {
    const i = args.indexOf(flag)
    return i !== -1 ? args[i + 1] : undefined
  }
  return {
    dryRun: args.includes('--dry-run'),
    input: get('--input') ?? DEFAULT_INPUT,
    meta: get('--meta') ?? DEFAULT_META,
  }
}

async function main() {
  const { dryRun, input, meta } = parseArgs()

  let rawJson: string
  try {
    rawJson = await readFile(input, 'utf-8')
  } catch {
    console.error(
      `Could not read ${input}. Run 'pnpm generate:anthropic-models:fetch' first (requires ANTHROPIC_API_KEY).`,
    )
    process.exit(1)
  }
  const parsed = JSON.parse(rawJson) as
    | { data: Array<AnthropicApiModel> }
    | Array<AnthropicApiModel>
  const apiModels = Array.isArray(parsed) ? parsed : parsed.data

  // Collapse dated IDs onto their alias and dedupe (preferring the entry
  // whose ID already is the alias, since that carries the alias metadata).
  const byAlias = new Map<string, AnthropicApiModel>()
  for (const model of apiModels) {
    const alias = toAlias(model.id)
    const existing = byAlias.get(alias)
    if (!existing || model.id === alias) {
      byAlias.set(alias, model)
    }
  }
  console.log(
    `Found ${apiModels.length} models in catalog (${byAlias.size} after alias dedupe)`,
  )

  let content = await readFile(meta, 'utf-8')
  const existingIds = extractExistingModelIds(content)

  const newModels: Array<{ alias: string; model: AnthropicApiModel }> = []
  for (const [alias, model] of byAlias) {
    if (!existingIds.has(normalizeId(alias))) {
      newModels.push({ alias, model })
    }
  }

  // Diagnostics: IDs in the meta file that the catalog doesn't know about.
  // These are either retired models, models the snapshot predates, or
  // artifacts of the old OpenRouter-slug sync (e.g. dotted IDs).
  const aliasSet = new Set([...byAlias.keys()].map(normalizeId))
  const unknown = [...existingIds].filter((id) => !aliasSet.has(id))
  if (unknown.length > 0) {
    console.log(
      `\nNote: ${unknown.length} IDs in model-meta.ts are not in the catalog snapshot` +
        ` (retired, stale snapshot, or invalid IDs — verify against the live API):`,
    )
    for (const id of unknown.sort()) {
      console.log(`    - ${id}`)
    }
  }

  if (newModels.length === 0) {
    console.log('\nNo new models to add.')
    return
  }

  console.log(`\nAdding ${newModels.length} new models:`)
  for (const { alias } of newModels) {
    console.log(`    - ${alias} (${toConstName(alias)})`)
  }

  const constants = newModels.map(({ alias, model }) =>
    generateModelConstant(model, alias),
  )

  if (dryRun) {
    console.log('\n--- dry run: generated constants ---\n')
    console.log(constants.join('\n\n'))
    return
  }

  const constNames = newModels.map(({ alias }) => toConstName(alias))
  content = insertConstants(content, constants)
  content = addToArray(content, 'ANTHROPIC_MODELS', constNames)
  content = addToTypeMap(
    content,
    'AnthropicChatModelProviderOptionsByName',
    constNames.map(
      (constName) => `  [${constName}.id]: ${PROVIDER_OPTIONS_TYPE}`,
    ),
  )
  content = addToTypeMap(
    content,
    'AnthropicModelInputModalitiesByName',
    constNames.map(
      (constName) => `  [${constName}.id]: typeof ${constName}.supports.input`,
    ),
  )
  content = addToTypeMap(
    content,
    'AnthropicChatModelToolCapabilitiesByName',
    constNames.map(
      (constName) => `  [${constName}.id]: typeof ${constName}.supports.tools`,
    ),
  )
  await writeFile(meta, content, 'utf-8')
  console.log(`\nWrote updated file: ${meta}`)

  const changeset = `---
'@tanstack/ai-anthropic': patch
---

Add new Anthropic models from the Models API: ${newModels
    .map(({ alias }) => `\`${alias}\``)
    .join(', ')}
`
  await writeFile(CHANGESET_FILE, changeset, 'utf-8')
  console.log(`Changeset created: ${CHANGESET_FILE}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
