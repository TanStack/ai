/**
 * Syncs modelschemas catalogs into native provider model-meta.ts files.
 *
 * For each synced provider, this script:
 * 1. Lists that provider's models from modelschemas (`@modelschemas/client`)
 * 2. Uses native limits, modalities, pricing, and capabilities. Fills any
 *    field the native row left empty from the modelschemas OpenRouter catalog
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
 * - **fal** — 1k+ model-grained endpoints; image field maps have their own
 *   generator (`scripts/generate-fal-image-field-map.ts`).
 * - **bedrock** — ids are AWS-region-qualified; see
 *   `scripts/fetch-bedrock-models.ts`.
 * - **ollama**, **llmgateway**, **vercel-gateway**, **lovable** — different
 *   catalogs (local, aggregator, or their own fetch scripts).
 * - **claude-code**, **codex**, **opencode**, **grok-build** — harness aliases.
 * BytePlus video/image duration and size tables stay hand-curated.
 */

import { execFileSync } from 'node:child_process'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ELEVENLABS_ID_ARRAYS,
  alreadySynced,
  outputsText,
  pricingLines,
  selectElevenLabsInserts,
  selectNativeInserts,
} from './model-sync/catalog'
import type { CatalogModel, SyncModel } from './model-sync/catalog'
import { toModelConstName } from './model-sync/ids'
import {
  addToStringLiteralArray,
  applyChatModelCatalogInserts,
  extractStringLiteralArrayValues,
  insertConstants,
} from './model-sync/native-insert'
import { createSyncClient, fetchSyncCatalogs } from './model-sync/modelschemas'
import {
  buildAnthropicProviderOptionsType,
  buildProviderSupportsBody,
} from './model-sync/provider-supports'
import type { ArrayRef } from './model-sync/native-insert'
import type { ModelMetaProvider } from './model-sync/provider-supports'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

/** Seconds in 30 days — models older than this before the last sync are skipped */
const MAX_MODEL_AGE_SECONDS = 30 * 24 * 60 * 60
const LAST_RUN_FILE = resolve(ROOT, 'scripts/.sync-models-last-run')

interface ProviderConfig {
  packageName: string
  metaFile: string
  /** How array entries reference the constant, e.g. '.name' or '.id' */
  arrayRef: ArrayRef
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
  /**
   * Runtime set of models that accept tools plus `output_config.format` in
   * one request. New Anthropic ids are inserted here. `-fast` variants stay
   * out: fast mode is a request parameter, and the model-meta test pins
   * `claude-opus-5-fast` as excluded.
   */
  combinedToolsAndSchemaSetName?: string
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
  /** Raw-id prefixes to always skip */
  skipPatterns: Array<string>
  /** Activities to insert. `null` means the catalog left activity unset. */
  acceptedActivities: Array<string | null>
  /** See `NativeInsertRules.requireOpenRouterEnrich`. */
  requireOpenRouterEnrich: boolean
  /**
   * Write a `pricing` block. An unknown side is left out, never written as
   * 0, so Groq/Mistral can insert with `pricing: {}`. BytePlus has none.
   */
  includePricing: boolean
  outputTokenField: 'max_output_tokens' | 'max_completion_tokens'
}

const PROVIDER_MAP: Record<ModelMetaProvider, ProviderConfig> = {
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
    acceptedActivities: ['chat'],
    requireOpenRouterEnrich: true,
    includePricing: true,
    outputTokenField: 'max_output_tokens',
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
    combinedToolsAndSchemaSetName: 'ANTHROPIC_COMBINED_TOOLS_AND_SCHEMA_MODELS',
    validInputModalities: ['text', 'image', 'audio', 'video', 'document'],
    referenceSatisfies:
      'ModelMeta<AnthropicContainerOptions & AnthropicContextManagementOptions & AnthropicMCPOptions & AnthropicServiceTierOptions & AnthropicStopSequencesOptions & AnthropicThinkingOptions & AnthropicToolChoiceOptions & AnthropicSamplingOptions>',
    referenceProviderOptionsEntry:
      'AnthropicContainerOptions & AnthropicContextManagementOptions & AnthropicMCPOptions & AnthropicServiceTierOptions & AnthropicStopSequencesOptions & AnthropicThinkingOptions & AnthropicToolChoiceOptions & AnthropicSamplingOptions',
    hasBothNameAndId: true,
    providerOptionsIsMappedType: false,
    skipPatterns: [],
    acceptedActivities: ['chat'],
    requireOpenRouterEnrich: true,
    includePricing: true,
    outputTokenField: 'max_output_tokens',
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
    referenceSatisfies:
      'ModelMeta<GeminiToolConfigOptions & GeminiSafetyOptions & GeminiCommonConfigOptions & GeminiCachedContentOptions & GeminiStructuredOutputOptions & GeminiThinkingOptions>',
    referenceProviderOptionsEntry:
      'GeminiToolConfigOptions & GeminiSafetyOptions & GeminiCommonConfigOptions & GeminiCachedContentOptions & GeminiStructuredOutputOptions & GeminiThinkingOptions',
    hasBothNameAndId: false,
    providerOptionsIsMappedType: false,
    skipPatterns: [
      'gemma-', // Gemma open-source models (not Gemini API models)
    ],
    acceptedActivities: ['chat'],
    requireOpenRouterEnrich: true,
    includePricing: true,
    outputTokenField: 'max_output_tokens',
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
    referenceSatisfies: 'ModelMeta',
    referenceProviderOptionsEntry: 'GrokProviderOptions',
    hasBothNameAndId: false,
    providerOptionsIsMappedType: true,
    skipPatterns: [],
    acceptedActivities: ['chat'],
    requireOpenRouterEnrich: true,
    includePricing: true,
    outputTokenField: 'max_output_tokens',
  },
  groq: {
    packageName: '@tanstack/ai-groq',
    metaFile: resolve(ROOT, 'packages/ai-groq/src/model-meta.ts'),
    arrayRef: '.name',
    contextField: 'context_window',
    chatArrayName: 'GROQ_CHAT_MODELS',
    providerOptionsTypeName: 'GroqChatModelProviderOptionsByName',
    inputModalitiesTypeName: 'GroqModelInputModalitiesByName',
    toolCapabilitiesTypeName: 'GroqChatModelToolCapabilitiesByName',
    validInputModalities: ['text', 'image', 'audio'],
    referenceSatisfies: 'ModelMeta<GroqTextProviderOptions>',
    referenceProviderOptionsEntry: 'GroqTextProviderOptions',
    hasBothNameAndId: false,
    providerOptionsIsMappedType: true,
    skipPatterns: ['whisper-', 'canopylabs/'],
    acceptedActivities: [null, 'chat'],
    requireOpenRouterEnrich: false,
    includePricing: true,
    outputTokenField: 'max_completion_tokens',
  },
  mistral: {
    packageName: '@tanstack/ai-mistral',
    metaFile: resolve(ROOT, 'packages/ai-mistral/src/model-meta.ts'),
    arrayRef: '.name',
    contextField: 'context_window',
    chatArrayName: 'MISTRAL_CHAT_MODELS',
    providerOptionsTypeName: 'MistralChatModelProviderOptionsByName',
    inputModalitiesTypeName: 'MistralModelInputModalitiesByName',
    validInputModalities: ['text', 'image', 'audio', 'document'],
    referenceSatisfies: 'ModelMeta<MistralTextProviderOptions>',
    referenceProviderOptionsEntry: 'MistralTextProviderOptions',
    hasBothNameAndId: false,
    providerOptionsIsMappedType: false,
    skipPatterns: [
      'mistral-embed',
      'codestral-embed',
      'mistral-ocr',
      'mistral-moderation',
      'voxtral-',
      'mistral-vibe',
      'mistral-code-fim',
      'mistral-code-',
      'glm-',
      'zai-',
    ],
    acceptedActivities: [null, 'chat'],
    requireOpenRouterEnrich: false,
    includePricing: true,
    outputTokenField: 'max_completion_tokens',
  },
  byteplus: {
    packageName: '@tanstack/ai-byteplus',
    metaFile: resolve(ROOT, 'packages/ai-byteplus/src/model-meta.ts'),
    arrayRef: '.name',
    contextField: 'context_window',
    chatArrayName: 'BYTEPLUS_CHAT_MODELS',
    providerOptionsTypeName: 'BytePlusChatModelProviderOptionsByName',
    inputModalitiesTypeName: 'BytePlusModelInputModalitiesByName',
    validInputModalities: ['text', 'image', 'audio', 'video', 'document'],
    referenceSatisfies: 'ModelMeta',
    referenceProviderOptionsEntry: 'BytePlusTextProviderOptions',
    hasBothNameAndId: false,
    providerOptionsIsMappedType: true,
    skipPatterns: [],
    acceptedActivities: ['chat'],
    requireOpenRouterEnrich: false,
    includePricing: false,
    outputTokenField: 'max_output_tokens',
  },
}

/** ElevenLabs model-meta is id-literal arrays, not ModelMeta constants. */
const ELEVENLABS = {
  packageName: '@tanstack/ai-elevenlabs',
  metaFile: resolve(ROOT, 'packages/ai-elevenlabs/src/model-meta.ts'),
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

function anthropicOptionsType(model: SyncModel): string {
  return buildAnthropicProviderOptionsType({
    supportedParameters: model.supportedParameters,
    reasoningMandatory: model.reasoningMandatory,
    // modelschemas has no cache price, and every current Claude model
    // supports prompt caching.
    hasCachedPricing: true,
  })
}

function providerOptionsEntryFor(
  model: SyncModel,
  provider: ModelMetaProvider,
  config: ProviderConfig,
): string {
  if (provider === 'anthropic') return anthropicOptionsType(model)
  return config.referenceProviderOptionsEntry
}

function satisfiesClause(
  model: SyncModel,
  provider: ModelMetaProvider,
  config: ProviderConfig,
): string {
  if (provider === 'anthropic') {
    return `ModelMeta<${anthropicOptionsType(model)}>`
  }
  return config.referenceSatisfies
}

function extractExistingModelIds(content: string): Set<string> {
  return new Set(
    Array.from(content.matchAll(/^\s+(?:name|id):\s*'([^']+)'/gm), (m) =>
      m[1]!.replaceAll('.', '-'),
    ),
  )
}

function extractExistingConstNames(content: string): Set<string> {
  return new Set(
    Array.from(
      content.matchAll(/^const\s+([A-Z][A-Z0-9_]+)\s*=/gm),
      (m) => m[1]!,
    ),
  )
}

async function readLastRunTimestamp(): Promise<number | null> {
  let content: string
  try {
    content = await readFile(LAST_RUN_FILE, 'utf-8')
  } catch (error) {
    // First run. Any other read error must not silently reset the cutoff.
    if (isNodeError(error) && error.code === 'ENOENT') return null
    throw error
  }
  const ts = parseInt(content.trim(), 10)
  if (isNaN(ts)) throw new Error(`${LAST_RUN_FILE} is not a timestamp`)
  return ts
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

async function writeLastRunTimestamp(): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await writeFile(LAST_RUN_FILE, String(now) + '\n', 'utf-8')
}

function generateModelConstant(
  model: SyncModel,
  provider: ModelMetaProvider,
  config: ProviderConfig,
): string {
  const constName = toModelConstName(model.nativeId)

  const inputModalities = mapInputModalities(model.inputModalities).filter(
    (m) => config.validInputModalities.includes(m),
  )

  const lines: Array<string> = []
  lines.push(`const ${constName} = {`)
  lines.push(`  name: '${model.nativeId}',`)
  if (config.hasBothNameAndId) {
    lines.push(`  id: '${model.nativeId}',`)
  }
  if (isPositive(model.contextWindow)) {
    lines.push(
      `  ${config.contextField}: ${formatNumber(model.contextWindow)},`,
    )
  }
  if (isPositive(model.maxOutput)) {
    lines.push(
      `  ${config.outputTokenField}: ${formatNumber(model.maxOutput)},`,
    )
  }
  lines.push(`  supports: {`)
  lines.push(
    buildProviderSupportsBody({
      provider,
      inputModalities,
      outputModalities: model.outputModalities,
      supportedParameters: model.supportedParameters,
      reasoningMandatory: model.reasoningMandatory,
    }),
  )
  lines.push(`  },`)
  if (config.includePricing) {
    lines.push(...pricingLines(model.pricing))
  }
  lines.push(`} as const satisfies ${satisfiesClause(model, provider, config)}`)
  return lines.join('\n')
}

function isPositive(n: number | null): n is number {
  return n != null && n > 0
}

/** 1048576 → 1_048_576 */
function formatNumber(n: number): string {
  return n.toLocaleString('en-US').replaceAll(',', '_')
}

/** Packages the fetch scripts changed, so the changeset covers them too. */
function detectChangedPackages(): Set<string> {
  const diff = execFileSync(
    'git',
    ['diff', 'HEAD', '--name-only', '--', 'packages/'],
    { encoding: 'utf-8', cwd: ROOT },
  )
  const changed = new Set<string>()
  for (const match of diff.matchAll(/^packages\/([\w-]+)\//gm)) {
    changed.add(`@tanstack/${match[1]}`)
  }
  return changed
}

async function syncModelMeta(
  provider: ModelMetaProvider,
  config: ProviderConfig,
  catalogs: {
    native: Record<ModelMetaProvider, Array<CatalogModel>>
    openrouter: Array<CatalogModel>
  },
  cutoffTimestamp: number,
): Promise<{ added: number; heldBack: number }> {
  console.log(`\nProcessing provider: ${provider}`)
  const rows = catalogs.native[provider]
  console.log(`  Found ${rows.length} modelschemas models for '${provider}'`)

  let content = await readFile(config.metaFile, 'utf-8')
  const existingIds = extractExistingModelIds(content)
  const existingConstNames = extractExistingConstNames(content)
  console.log(
    `  Existing models in file: ${existingIds.size} IDs, ${existingConstNames.size} constants`,
  )

  const { inserts, heldBack, skipped } = selectNativeInserts(
    rows,
    { ...config, provider, cutoffTimestamp },
    catalogs.openrouter,
    (nativeId) => alreadySynced(nativeId, existingIds, existingConstNames),
  )
  const skipCounts = Object.entries(skipped)
    .map(([reason, count]) => `${reason}=${count}`)
    .join(', ')
  if (skipCounts) console.log(`  Skipped: ${skipCounts}`)
  for (const rawId of heldBack) {
    console.log(`  Waiting for an OpenRouter price: ${rawId}`)
  }

  if (inserts.length === 0) {
    console.log('  No new models to add.')
    return { added: 0, heldBack: heldBack.length }
  }

  console.log(`  Adding ${inserts.length} new models:`)
  for (const { model } of inserts) {
    console.log(`    - ${model.nativeId} (${toModelConstName(model.nativeId)})`)
  }

  content = insertConstants(
    content,
    inserts.map(({ model }) => generateModelConstant(model, provider, config)),
  )
  content = applyChatModelCatalogInserts(
    content,
    config,
    inserts
      .filter(({ model, activity }) => outputsText(model, activity))
      .map(({ model }) => ({
        constName: toModelConstName(model.nativeId),
        providerOptionsEntry: providerOptionsEntryFor(model, provider, config),
        hasMaxOutputTokens: isPositive(model.maxOutput),
        acceptsCombinedToolsAndSchema: !model.nativeId.endsWith('-fast'),
      })),
  )

  await writeFile(config.metaFile, content, 'utf-8')
  console.log(`  Wrote updated file: ${config.metaFile}`)
  return { added: inserts.length, heldBack: heldBack.length }
}

async function syncElevenLabs(
  rows: Array<CatalogModel>,
  cutoffTimestamp: number,
): Promise<number> {
  console.log(`\nProcessing provider: elevenlabs`)
  let content = await readFile(ELEVENLABS.metaFile, 'utf-8')
  const existingIds = new Set(
    ELEVENLABS_ID_ARRAYS.flatMap((name) => [
      ...extractStringLiteralArrayValues(content, name),
    ]),
  )
  const byArray = selectElevenLabsInserts(rows, cutoffTimestamp, existingIds)
  const added = Object.values(byArray).flat()
  if (added.length === 0) {
    console.log('  No new models to add.')
    return 0
  }
  console.log(`  Adding ${added.length} new models:`)
  for (const id of added) console.log(`    - ${id}`)
  for (const name of ELEVENLABS_ID_ARRAYS) {
    content = addToStringLiteralArray(content, name, byArray[name])
  }
  await writeFile(ELEVENLABS.metaFile, content, 'utf-8')
  console.log(`  Wrote updated file: ${ELEVENLABS.metaFile}`)
  return added.length
}

async function main() {
  const lastRun = await readLastRunTimestamp()
  const now = Math.floor(Date.now() / 1000)
  const cutoffTimestamp = (lastRun ?? now) - MAX_MODEL_AGE_SECONDS
  const cutoffDate = new Date(cutoffTimestamp * 1000)
    .toISOString()
    .split('T')[0]
  console.log(
    `Model age cutoff: ${cutoffDate} (skipping models created before this date)`,
  )

  const catalogs = await fetchSyncCatalogs(createSyncClient())
  const counts = Object.entries(catalogs.native)
    .map(([id, rows]) => `${id}=${rows.length}`)
    .join(', ')
  console.log(
    `Fetched modelschemas catalogs: ${counts}, openrouter=${catalogs.openrouter.length}`,
  )

  const changedPackages = new Set<string>()
  let totalAdded = 0
  let totalHeldBack = 0
  for (const [provider, config] of Object.entries(PROVIDER_MAP) as Array<
    [ModelMetaProvider, ProviderConfig]
  >) {
    const { added, heldBack } = await syncModelMeta(
      provider,
      config,
      catalogs,
      cutoffTimestamp,
    )
    totalAdded += added
    totalHeldBack += heldBack
    if (added > 0) changedPackages.add(config.packageName)
  }
  const elevenLabsAdded = await syncElevenLabs(
    catalogs.native.elevenlabs,
    cutoffTimestamp,
  )
  totalAdded += elevenLabsAdded
  if (elevenLabsAdded > 0) changedPackages.add(ELEVENLABS.packageName)

  console.log(`\nDone. Added ${totalAdded} new models total.`)

  // Held-back ids still age out after 30 days. Freezing the timestamp
  // instead would stall it for good on ids OpenRouter never prices (Live
  // API models), so each run names them in its log.
  if (totalHeldBack > 0) {
    console.log(
      `${totalHeldBack} models are waiting for an OpenRouter price (listed above).`,
    )
  }
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
  const existing = (await readdir(changesetDir)).find(
    (f) => f.startsWith('sync-models') && f.endsWith('.md'),
  )
  const changesetPath = resolve(changesetDir, existing ?? 'sync-models.md')
  if (existing) {
    const existingContent = await readFile(changesetPath, 'utf-8')
    for (const match of existingContent.matchAll(/'([^']+)':\s*patch/g)) {
      changedPackages.add(match[1]!)
    }
  }
  await writeFile(
    changesetPath,
    buildChangesetContent(changedPackages),
    'utf-8',
  )
  console.log(
    `\nChangeset ${existing ? 'updated' : 'created'}: ${changesetPath}`,
  )
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
