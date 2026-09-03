/**
 * Syncs modelschemas catalogs into native provider model-meta.ts files.
 *
 * For each supported provider (OpenAI, Anthropic, Gemini, Grok), this script:
 * 1. Lists that provider's models from modelschemas (`@modelschemas/client`)
 * 2. Enriches empty pricing/modalities/capabilities from the OpenRouter
 *    catalog on modelschemas
 * 3. Identifies models missing from the provider's model-meta.ts
 * 4. Generates and inserts new model constants, array entries, and type map entries
 *
 * Usage:
 *   pnpm tsx scripts/sync-provider-models.ts
 *
 * Optional: MODELSCHEMAS_API_KEY raises the modelschemas rate limit.
 *
 * ## Providers deliberately NOT synced
 *
 * The sync is only safe when the provider's own model ids are the catalog
 * ids. These are excluded on purpose:
 *
 * - **byteplus** (`@tanstack/ai-byteplus`) — capability tables are
 *   live-probe-verified because published metadata is wrong in both
 *   directions. Use `/gap-analysis byteplus` instead; the probe recipe is
 *   in that package's `model-meta.ts`.
 * - **fal**, **elevenlabs** — media-only providers whose endpoint ids need
 *   manual size/duration maps. fal image fields have their own generator
 *   (`scripts/generate-fal-image-field-map.ts`).
 * - **bedrock** — ids are AWS-region-qualified; see
 *   `scripts/fetch-bedrock-models.ts`.
 */

import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  alreadySynced,
  findOpenRouterEnrichment,
  hasImageOutput,
  outputsText,
  skipNativeModelReason,
  toSyncModel,
} from './model-sync/catalog'
import type { SyncModel } from './model-sync/catalog'
import { toModelConstName } from './model-sync/ids'
import {
  applyChatModelCatalogInserts,
  insertConstants,
} from './model-sync/native-insert'
import { createSyncClient, fetchSyncCatalogs } from './model-sync/modelschemas'
import {
  buildAnthropicProviderOptionsType,
  buildProviderSupportsBody,
} from './model-sync/provider-supports'
import type { SyncedProvider } from './model-sync/provider-supports'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

/** Seconds in 30 days — models older than this before the last sync are skipped */
const MAX_MODEL_AGE_SECONDS = 30 * 24 * 60 * 60
const LAST_RUN_FILE = resolve(ROOT, 'scripts/.sync-models-last-run')

interface ProviderConfig {
  /** npm package name for changeset */
  packageName: string
  metaFile: string
  /** How array entries reference the constant, e.g. '.name' or '.id' */
  arrayRef: '.name' | '.id'
  /** Which field name is used for context window size */
  contextField: 'context_window' | 'max_input_tokens'
  /** Name of the exported chat model array */
  chatArrayName: string
  /** Name of the provider options type map */
  providerOptionsTypeName: string
  /** Name of the input modalities type map */
  inputModalitiesTypeName: string
  /**
   * Name of the per-model tool-capabilities type map. Missing this lets
   * `ResolveToolCapabilities` fall back to `readonly []` and every provider
   * tool stops type-checking on the new model.
   */
  toolCapabilitiesTypeName?: string
  /**
   * Name of the runtime `Record<string, number>` mapping model id →
   * `max_output_tokens`, if the provider maintains one. Anthropic uses this to
   * default the required `max_tokens` request field to the model's real ceiling
   * (issue #849); other providers treat token limits as optional and omit it.
   */
  maxOutputTokensMapName?: string
  /** Provider key for conservative supports generation */
  kind: SyncedProvider
  /** Valid input modality types for this provider's ModelMeta interface */
  validInputModalities: Array<InputModality>
  /** The satisfies type clause (after 'as const satisfies') */
  referenceSatisfies: string
  /** The type string for provider options map entries */
  referenceProviderOptionsEntry: string
  /** Whether this provider has both name AND id fields */
  hasBothNameAndId: boolean
  /** Whether the provider options type is a mapped type (skip insertion) */
  providerOptionsIsMappedType: boolean
  /** Model ID patterns to always skip (matched against stripped ID) */
  skipPatterns: Array<string>
}

const PROVIDER_MAP: Record<SyncedProvider, ProviderConfig> = {
  openai: {
    packageName: '@tanstack/ai-openai',
    metaFile: resolve(ROOT, 'packages/ai-openai/src/model-meta.ts'),
    arrayRef: '.name',
    contextField: 'context_window',
    chatArrayName: 'OPENAI_CHAT_MODELS',
    providerOptionsTypeName: 'OpenAIChatModelProviderOptionsByName',
    inputModalitiesTypeName: 'OpenAIModelInputModalitiesByName',
    toolCapabilitiesTypeName: 'OpenAIChatModelToolCapabilitiesByName',
    validInputModalities: ['text', 'image', 'audio', 'video'],
    kind: 'openai',
    referenceSatisfies:
      'ModelMeta<OpenAIBaseOptions & OpenAIReasoningOptions & OpenAIStructuredOutputOptions & OpenAIToolsOptions & OpenAIStreamingOptions & OpenAIMetadataOptions>',
    referenceProviderOptionsEntry:
      'OpenAIBaseOptions & OpenAIReasoningOptions & OpenAIStructuredOutputOptions & OpenAIToolsOptions & OpenAIStreamingOptions & OpenAIMetadataOptions',
    hasBothNameAndId: false,
    providerOptionsIsMappedType: false,
    skipPatterns: [
      'gpt-3.5-', // Legacy GPT-3.5 models
      'gpt-4-', // Legacy GPT-4 base models (not 4.1+)
      'gpt-4o', // GPT-4o variants (4o, 4o-mini, 4o-audio, etc.)
      'gpt-oss-', // Open-source/experimental models
      'chatgpt-', // ChatGPT branded models
    ],
  },
  anthropic: {
    packageName: '@tanstack/ai-anthropic',
    metaFile: resolve(ROOT, 'packages/ai-anthropic/src/model-meta.ts'),
    arrayRef: '.id',
    contextField: 'context_window',
    chatArrayName: 'ANTHROPIC_MODELS',
    providerOptionsTypeName: 'AnthropicChatModelProviderOptionsByName',
    inputModalitiesTypeName: 'AnthropicModelInputModalitiesByName',
    toolCapabilitiesTypeName: 'AnthropicChatModelToolCapabilitiesByName',
    maxOutputTokensMapName: 'ANTHROPIC_MODEL_MAX_OUTPUT_TOKENS',
    validInputModalities: ['text', 'image', 'audio', 'video', 'document'],
    kind: 'anthropic',
    referenceSatisfies:
      'ModelMeta<AnthropicContainerOptions & AnthropicContextManagementOptions & AnthropicMCPOptions & AnthropicServiceTierOptions & AnthropicStopSequencesOptions & AnthropicThinkingOptions & AnthropicToolChoiceOptions & AnthropicSamplingOptions>',
    referenceProviderOptionsEntry:
      'AnthropicContainerOptions & AnthropicContextManagementOptions & AnthropicMCPOptions & AnthropicServiceTierOptions & AnthropicStopSequencesOptions & AnthropicThinkingOptions & AnthropicToolChoiceOptions & AnthropicSamplingOptions',
    hasBothNameAndId: true,
    providerOptionsIsMappedType: false,
    skipPatterns: [],
  },
  gemini: {
    packageName: '@tanstack/ai-gemini',
    metaFile: resolve(ROOT, 'packages/ai-gemini/src/model-meta.ts'),
    arrayRef: '.name',
    contextField: 'max_input_tokens',
    chatArrayName: 'GEMINI_MODELS',
    providerOptionsTypeName: 'GeminiChatModelProviderOptionsByName',
    inputModalitiesTypeName: 'GeminiModelInputModalitiesByName',
    toolCapabilitiesTypeName: 'GeminiChatModelToolCapabilitiesByName',
    validInputModalities: ['text', 'image', 'audio', 'video', 'document'],
    kind: 'gemini',
    referenceSatisfies:
      'ModelMeta<GeminiToolConfigOptions & GeminiSafetyOptions & GeminiCommonConfigOptions & GeminiCachedContentOptions & GeminiStructuredOutputOptions & GeminiThinkingOptions>',
    referenceProviderOptionsEntry:
      'GeminiToolConfigOptions & GeminiSafetyOptions & GeminiCommonConfigOptions & GeminiCachedContentOptions & GeminiStructuredOutputOptions & GeminiThinkingOptions',
    hasBothNameAndId: false,
    providerOptionsIsMappedType: false,
    skipPatterns: [
      'gemma-', // Gemma open-source models (not Gemini API models)
    ],
  },
  grok: {
    packageName: '@tanstack/ai-grok',
    metaFile: resolve(ROOT, 'packages/ai-grok/src/model-meta.ts'),
    arrayRef: '.name',
    contextField: 'context_window',
    chatArrayName: 'GROK_CHAT_MODELS',
    providerOptionsTypeName: 'GrokChatModelProviderOptionsByName',
    inputModalitiesTypeName: 'GrokModelInputModalitiesByName',
    toolCapabilitiesTypeName: 'GrokChatModelToolCapabilitiesByName',
    validInputModalities: ['text', 'image', 'audio', 'video', 'document'],
    kind: 'grok',
    referenceSatisfies: 'ModelMeta',
    referenceProviderOptionsEntry: 'GrokProviderOptions',
    hasBothNameAndId: false,
    providerOptionsIsMappedType: true,
    skipPatterns: [],
  },
}

type InputModality = 'text' | 'image' | 'audio' | 'video' | 'document'

const MODALITY_MAP: Record<string, InputModality> = {
  text: 'text',
  image: 'image',
  audio: 'audio',
  video: 'video',
  file: 'document',
  document: 'document',
}

function mapInputModalities(modalities: Array<string>): Array<InputModality> {
  const mapped = modalities
    .map((m) => MODALITY_MAP[m.toLowerCase()])
    .filter((m): m is InputModality => m !== undefined)
  if (!mapped.includes('text')) {
    mapped.unshift('text')
  }
  return mapped
}

function convertPrice(priceStr: string | undefined): number {
  const price = parseFloat(priceStr ?? '0')
  if (isNaN(price)) return 0
  const result = price * 1_000_000
  return Math.round(result * 1e10) / 1e10
}

function anthropicOptionsType(model: SyncModel): string {
  return buildAnthropicProviderOptionsType({
    supportedParameters: model.supportedParameters,
    reasoningMandatory: false,
    hasCachedPricing: convertPrice(model.pricing.input_cache_read) > 0,
  })
}

function providerOptionsEntryFor(
  model: SyncModel,
  config: ProviderConfig,
): string {
  if (config.kind === 'anthropic') return anthropicOptionsType(model)
  return config.referenceProviderOptionsEntry
}

function satisfiesClause(model: SyncModel, config: ProviderConfig): string {
  if (config.kind === 'anthropic') {
    return `ModelMeta<${anthropicOptionsType(model)}>`
  }
  return config.referenceSatisfies
}

function extractExistingModelIds(content: string): Set<string> {
  const ids = new Set<string>()
  const nameRegex = /^\s+name:\s*'([^']+)'/gm
  const idRegex = /^\s+id:\s*'([^']+)'/gm
  let match
  while ((match = nameRegex.exec(content)) !== null) {
    ids.add(match[1]!.replaceAll('.', '-'))
  }
  while ((match = idRegex.exec(content)) !== null) {
    ids.add(match[1]!.replaceAll('.', '-'))
  }
  return ids
}

function extractExistingConstNames(content: string): Set<string> {
  const names = new Set<string>()
  const regex = /^const\s+([A-Z][A-Z0-9_]+)\s*=/gm
  let match
  while ((match = regex.exec(content)) !== null) {
    names.add(match[1]!)
  }
  return names
}

async function readLastRunTimestamp(): Promise<number | null> {
  try {
    const content = await readFile(LAST_RUN_FILE, 'utf-8')
    const ts = parseInt(content.trim(), 10)
    return isNaN(ts) ? null : ts
  } catch {
    return null
  }
}

async function writeLastRunTimestamp(): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await writeFile(LAST_RUN_FILE, String(now) + '\n', 'utf-8')
}

function generateModelConstant(
  model: SyncModel,
  config: ProviderConfig,
): string {
  const constName = toModelConstName(model.nativeId)

  const inputNormal = convertPrice(model.pricing.prompt)
  const inputCached = convertPrice(model.pricing.input_cache_read)
  const outputNormal = convertPrice(model.pricing.completion)

  const inputModalities = mapInputModalities(model.inputModalities).filter(
    (m) => config.validInputModalities.includes(m),
  )

  const lines: Array<string> = []
  lines.push(`const ${constName} = {`)
  lines.push(`  name: '${model.nativeId}',`)
  if (config.hasBothNameAndId) {
    lines.push(`  id: '${model.nativeId}',`)
  }
  if (model.contextWindow != null && model.contextWindow > 0) {
    lines.push(
      `  ${config.contextField}: ${formatNumber(model.contextWindow)},`,
    )
  }
  if (model.maxOutput != null && model.maxOutput > 0) {
    lines.push(`  max_output_tokens: ${formatNumber(model.maxOutput)},`)
  }
  lines.push(`  supports: {`)
  lines.push(
    buildProviderSupportsBody({
      provider: config.kind,
      inputModalities,
      supportedParameters: model.supportedParameters,
    }),
  )
  lines.push(`  },`)
  lines.push(`  pricing: {`)
  lines.push(`    input: {`)
  lines.push(`      normal: ${inputNormal},`)
  if (inputCached > 0) {
    lines.push(`      cached: ${inputCached},`)
  }
  lines.push(`    },`)
  lines.push(`    output: {`)
  lines.push(`      normal: ${outputNormal},`)
  lines.push(`    },`)
  lines.push(`  },`)
  lines.push(`} as const satisfies ${satisfiesClause(model, config)}`)
  return lines.join('\n')
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

function detectChangedPackages(): Set<string> {
  const changed = new Set<string>()
  try {
    const diff = execFileSync(
      'git',
      ['diff', 'HEAD', '--name-only', '--', 'packages/'],
      { encoding: 'utf-8', cwd: ROOT },
    ).trim()
    if (!diff) return changed

    for (const line of diff.split('\n')) {
      const match = line.match(/^packages\/([\w-]+)\//)
      if (match) {
        changed.add(`@tanstack/${match[1]}`)
      }
    }
  } catch {
    // git not available (e.g. running outside a repo) — fall back to empty set
  }
  return changed
}

async function main() {
  let totalAdded = 0
  const changedPackages = new Set<string>()

  const lastRun = await readLastRunTimestamp()
  const now = Math.floor(Date.now() / 1000)
  const cutoffTimestamp = (lastRun ?? now) - MAX_MODEL_AGE_SECONDS
  const cutoffDate = new Date(cutoffTimestamp * 1000)
    .toISOString()
    .split('T')[0]
  console.log(
    `Model age cutoff: ${cutoffDate} (skipping models created before this date)`,
  )

  const client = createSyncClient()
  const catalogs = await fetchSyncCatalogs(client)
  console.log(
    `Fetched modelschemas catalogs: openai=${catalogs.native.openai.length}, anthropic=${catalogs.native.anthropic.length}, gemini=${catalogs.native.gemini.length}, grok=${catalogs.native.grok.length}, openrouter=${catalogs.openrouter.length}`,
  )

  for (const [provider, config] of Object.entries(PROVIDER_MAP) as Array<
    [SyncedProvider, ProviderConfig]
  >) {
    console.log(`\nProcessing provider: ${provider}`)

    const providerModels = catalogs.native[provider]
    console.log(
      `  Found ${providerModels.length} modelschemas models for '${provider}'`,
    )

    let content: string
    try {
      content = await readFile(config.metaFile, 'utf-8')
    } catch {
      console.warn(`  Skipping: could not read ${config.metaFile}`)
      continue
    }

    const existingIds = extractExistingModelIds(content)
    const existingConstNames = extractExistingConstNames(content)

    console.log(
      `  Existing models in file: ${existingIds.size} IDs, ${existingConstNames.size} constants`,
    )

    const newModels: Array<{
      model: SyncModel
      activity: string | null
      constName: string
    }> = []

    for (const row of providerModels) {
      const skip = skipNativeModelReason(
        row,
        config.kind,
        config.skipPatterns,
        cutoffTimestamp,
      )
      if (skip) continue

      const enrich = findOpenRouterEnrichment(
        row,
        config.kind,
        catalogs.openrouter,
      )
      // Native catalogs often omit pricing/modalities/capabilities.
      // Skip until OpenRouter has a matching row so we do not insert
      // empty chat stubs for transcribe/live/experimental ids.
      if (!enrich) continue
      const model = toSyncModel(row, enrich, config.kind)
      if (
        hasImageOutput({
          activity: row.activity,
          outputModalities: model.outputModalities,
        })
      ) {
        continue
      }
      if (alreadySynced(model.nativeId, existingIds, existingConstNames)) {
        continue
      }
      newModels.push({
        model,
        activity: row.activity,
        constName: toModelConstName(model.nativeId),
      })
    }

    if (newModels.length === 0) {
      console.log('  No new models to add.')
      continue
    }

    console.log(`  Adding ${newModels.length} new models:`)
    for (const { model, constName } of newModels) {
      console.log(`    - ${model.nativeId} (${constName})`)
    }

    const constants = newModels.map(({ model }) =>
      generateModelConstant(model, config),
    )
    content = insertConstants(content, constants)

    const chatModels = newModels.filter(({ model, activity }) =>
      outputsText(model, activity),
    )
    content = applyChatModelCatalogInserts(
      content,
      {
        chatArrayName: config.chatArrayName,
        arrayRef: config.arrayRef,
        providerOptionsTypeName: config.providerOptionsTypeName,
        inputModalitiesTypeName: config.inputModalitiesTypeName,
        toolCapabilitiesTypeName: config.toolCapabilitiesTypeName,
        maxOutputTokensMapName: config.maxOutputTokensMapName,
        providerOptionsIsMappedType: config.providerOptionsIsMappedType,
      },
      chatModels.map(({ model, constName }) => ({
        constName,
        providerOptionsEntry: providerOptionsEntryFor(model, config),
        hasMaxOutputTokens: model.maxOutput != null && model.maxOutput > 0,
      })),
    )

    await writeFile(config.metaFile, content, 'utf-8')
    console.log(`  Wrote updated file: ${config.metaFile}`)
    totalAdded += newModels.length
    changedPackages.add(config.packageName)
  }

  console.log(`\nDone. Added ${totalAdded} new models total.`)

  await writeLastRunTimestamp()

  const allChangedPackages = detectChangedPackages()
  for (const pkg of changedPackages) {
    allChangedPackages.add(pkg)
  }

  if (allChangedPackages.size > 0) {
    await createChangeset(allChangedPackages)
  }
}

async function createChangeset(changedPackages: Set<string>) {
  const changesetDir = resolve(ROOT, '.changeset')
  const { readdir } = await import('node:fs/promises')
  const files = await readdir(changesetDir)
  const existing = files.find(
    (f) => f.startsWith('sync-models') && f.endsWith('.md'),
  )

  if (existing) {
    const existingPath = resolve(changesetDir, existing)
    const existingContent = await readFile(existingPath, 'utf-8')

    const pkgRegex = /'([^']+)':\s*patch/g
    let match
    while ((match = pkgRegex.exec(existingContent)) !== null) {
      changedPackages.add(match[1]!)
    }

    const content = buildChangesetContent(changedPackages)
    await writeFile(existingPath, content, 'utf-8')
    console.log(`\nChangeset updated: ${existingPath}`)
  } else {
    const changesetFile = resolve(changesetDir, 'sync-models.md')
    const content = buildChangesetContent(changedPackages)
    await writeFile(changesetFile, content, 'utf-8')
    console.log(`\nChangeset created: ${changesetFile}`)
  }

  console.log(`  Packages: ${Array.from(changedPackages).sort().join(', ')}`)
}

function buildChangesetContent(packages: Set<string>): string {
  const packageLines = Array.from(packages)
    .sort()
    .map((pkg) => `'${pkg}': patch`)
    .join('\n')
  return `---\n${packageLines}\n---\n\nUpdate model metadata from modelschemas\n`
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
