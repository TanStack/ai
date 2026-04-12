/**
 * Syncs OpenRouter models into native provider model-meta.ts files.
 *
 * For each supported provider (OpenAI, Anthropic, Gemini, Grok), this script:
 * 1. Reads the OpenRouter model list
 * 2. Filters models matching the provider prefix
 * 3. Identifies models missing from the provider's model-meta.ts
 * 4. Generates and inserts new model constants, array entries, and type map entries
 *
 * Usage:
 *   pnpm tsx scripts/sync-provider-models.ts
 */

import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { models } from './openrouter.models'
import type { OpenRouterModel } from './openrouter.models'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ---------------------------------------------------------------------------
// Provider configuration
// ---------------------------------------------------------------------------

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
  /** The supports block template (minus input modalities, which come from OpenRouter) */
  referenceSupportsBody: string
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

const PROVIDER_MAP: Record<string, ProviderConfig> = {
  'openai/': {
    packageName: '@tanstack/ai-openai',
    metaFile: resolve(ROOT, 'packages/typescript/ai-openai/src/model-meta.ts'),
    arrayRef: '.name',
    contextField: 'context_window',
    chatArrayName: 'OPENAI_CHAT_MODELS',
    providerOptionsTypeName: 'OpenAIChatModelProviderOptionsByName',
    inputModalitiesTypeName: 'OpenAIModelInputModalitiesByName',
    validInputModalities: ['text', 'image', 'audio', 'video'],
    referenceSupportsBody: `    output: ['text'],
    endpoints: ['chat', 'chat-completions'],
    features: ['streaming', 'function_calling', 'structured_outputs', 'distillation'],
    tools: ['web_search', 'file_search', 'image_generation', 'code_interpreter', 'mcp'],`,
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
  'anthropic/': {
    packageName: '@tanstack/ai-anthropic',
    metaFile: resolve(
      ROOT,
      'packages/typescript/ai-anthropic/src/model-meta.ts',
    ),
    arrayRef: '.id',
    contextField: 'context_window',
    chatArrayName: 'ANTHROPIC_MODELS',
    providerOptionsTypeName: 'AnthropicChatModelProviderOptionsByName',
    inputModalitiesTypeName: 'AnthropicModelInputModalitiesByName',
    validInputModalities: ['text', 'image', 'audio', 'video', 'document'],
    referenceSupportsBody: `    extended_thinking: true,
    priority_tier: true,`,
    referenceSatisfies:
      'ModelMeta<AnthropicContainerOptions & AnthropicContextManagementOptions & AnthropicMCPOptions & AnthropicServiceTierOptions & AnthropicStopSequencesOptions & AnthropicThinkingOptions & AnthropicToolChoiceOptions & AnthropicSamplingOptions>',
    referenceProviderOptionsEntry:
      'AnthropicContainerOptions & AnthropicContextManagementOptions & AnthropicMCPOptions & AnthropicServiceTierOptions & AnthropicStopSequencesOptions & AnthropicThinkingOptions & AnthropicToolChoiceOptions & AnthropicSamplingOptions',
    hasBothNameAndId: true,
    providerOptionsIsMappedType: false,
    skipPatterns: [],
  },
  'google/': {
    packageName: '@tanstack/ai-gemini',
    metaFile: resolve(ROOT, 'packages/typescript/ai-gemini/src/model-meta.ts'),
    arrayRef: '.name',
    contextField: 'max_input_tokens',
    chatArrayName: 'GEMINI_MODELS',
    providerOptionsTypeName: 'GeminiChatModelProviderOptionsByName',
    inputModalitiesTypeName: 'GeminiModelInputModalitiesByName',
    validInputModalities: ['text', 'image', 'audio', 'video', 'document'],
    referenceSupportsBody: `    output: ['text'],
    capabilities: ['batch_api', 'caching', 'code_execution', 'file_search', 'function_calling', 'search_grounding', 'structured_output', 'thinking', 'url_context'],`,
    referenceSatisfies:
      'ModelMeta<GeminiToolConfigOptions & GeminiSafetyOptions & GeminiCommonConfigOptions & GeminiCachedContentOptions & GeminiStructuredOutputOptions & GeminiThinkingOptions & GeminiThinkingAdvancedOptions>',
    referenceProviderOptionsEntry:
      'GeminiToolConfigOptions & GeminiSafetyOptions & GeminiCommonConfigOptions & GeminiCachedContentOptions & GeminiStructuredOutputOptions & GeminiThinkingOptions & GeminiThinkingAdvancedOptions',
    hasBothNameAndId: false,
    providerOptionsIsMappedType: false,
    skipPatterns: [
      'gemma-', // Gemma open-source models (not Gemini API models)
    ],
  },
  'x-ai/': {
    packageName: '@tanstack/ai-grok',
    metaFile: resolve(ROOT, 'packages/typescript/ai-grok/src/model-meta.ts'),
    arrayRef: '.name',
    contextField: 'context_window',
    chatArrayName: 'GROK_CHAT_MODELS',
    providerOptionsTypeName: 'GrokChatModelProviderOptionsByName',
    inputModalitiesTypeName: 'GrokModelInputModalitiesByName',
    validInputModalities: ['text', 'image', 'audio', 'video', 'document'],
    referenceSupportsBody: `    output: ['text'],
    capabilities: ['reasoning', 'structured_outputs', 'tool_calling'],`,
    referenceSatisfies: 'ModelMeta',
    referenceProviderOptionsEntry: 'GrokProviderOptions',
    hasBothNameAndId: false,
    providerOptionsIsMappedType: true,
    skipPatterns: [],
  },
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

type InputModality = 'text' | 'image' | 'audio' | 'video' | 'document'

const MODALITY_MAP: Record<string, InputModality> = {
  text: 'text',
  image: 'image',
  audio: 'audio',
  video: 'video',
  file: 'document',
  document: 'document',
}

/**
 * Map OpenRouter input modalities to our standard modality types.
 * Same mapping as the existing convert-openrouter-models.ts script.
 */
function mapInputModalities(modalities: Array<string>): Array<InputModality> {
  const mapped = modalities
    .map((m) => MODALITY_MAP[m.toLowerCase()])
    .filter((m): m is InputModality => m !== undefined)
  // Ensure at least 'text' is present
  if (!mapped.includes('text')) {
    mapped.unshift('text')
  }
  return mapped
}

/** Strip the provider prefix from an OpenRouter model ID */
function stripPrefix(prefix: string, modelId: string): string {
  return modelId.slice(prefix.length)
}

/**
 * Convert a model ID (after prefix stripping) to a TypeScript constant name.
 * E.g. 'gpt-6' -> 'GPT_6', 'grok-4.20-multi-agent' -> 'GROK_4_20_MULTI_AGENT'
 */
function toConstName(prefix: string, modelId: string): string {
  const stripped = stripPrefix(prefix, modelId)
  return stripped
    .replace(/[-]/g, '_')
    .replace(/[.]/g, '_')
    .replace(/[:]/g, '_')
    .replace(/[/]/g, '_')
    .toUpperCase()
}

/**
 * Convert an OpenRouter price string to per-million-token pricing.
 * Same logic as the existing convert script.
 */
function convertPrice(priceStr: string | undefined): number {
  const price = parseFloat(priceStr ?? '0')
  if (isNaN(price)) return 0
  const result = price * 1_000_000
  return Math.round(result * 1e10) / 1e10
}

/**
 * Normalize a model ID for comparison.
 * Handles cases where the same model uses dots vs dashes
 * (e.g., Anthropic's 'claude-3-5-haiku' vs OpenRouter's 'claude-3.5-haiku').
 */
function normalizeId(id: string): string {
  return id.replace(/[.]/g, '-')
}

/**
 * Extract existing model IDs from a model-meta file.
 * Matches BOTH name: 'xxx' AND id: 'xxx' lines to get a complete set,
 * since providers like Anthropic use different naming between name and id.
 * Returns a normalized set for comparison purposes.
 */
function extractExistingModelIds(content: string): Set<string> {
  const ids = new Set<string>()
  // Match both name and id fields inside const blocks
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

/**
 * Extract existing constant names from a model-meta file.
 * Matches: const UPPER_CASE_NAME =
 */
function extractExistingConstNames(content: string): Set<string> {
  const names = new Set<string>()
  const regex = /^const\s+([A-Z][A-Z0-9_]+)\s*=/gm
  let match
  while ((match = regex.exec(content)) !== null) {
    names.add(match[1]!)
  }
  return names
}

/**
 * Check if an OpenRouter model outputs text (for chat model array).
 */
function outputsText(model: OpenRouterModel): boolean {
  return model.architecture.output_modalities.includes('text')
}

/**
 * Check if an OpenRouter model outputs ONLY images (no text output).
 * Image-only models are skipped entirely because image model arrays
 * require manual curation with specialized type maps (sizes, provider options).
 */
function isImageOnlyModel(model: OpenRouterModel): boolean {
  return (
    model.architecture.output_modalities.includes('image') &&
    !model.architecture.output_modalities.includes('text')
  )
}

/**
 * Non-chat model family prefixes to exclude from chat model arrays.
 * These are audio/music/video/image generation models that happen to
 * include 'text' in their output modalities but are not chat models.
 */
const NON_CHAT_MODEL_PREFIXES = [
  'lyria-', // Google music generation
  'veo-', // Google video generation
  'imagen-', // Google image generation
  'sora-', // OpenAI video generation
  'dall-e-', // OpenAI image generation
  'tts-', // Text-to-speech models
]

function isNonChatModel(strippedId: string): boolean {
  return NON_CHAT_MODEL_PREFIXES.some((p) => strippedId.startsWith(p))
}

/**
 * Check if a model should be skipped based on provider-specific patterns.
 */
function matchesSkipPattern(
  strippedId: string,
  patterns: Array<string>,
): boolean {
  return patterns.some((p) => strippedId.startsWith(p))
}

/**
 * Read the last sync run timestamp. Returns epoch seconds, or null if no previous run.
 */
async function readLastRunTimestamp(): Promise<number | null> {
  try {
    const content = await readFile(LAST_RUN_FILE, 'utf-8')
    const ts = parseInt(content.trim(), 10)
    return isNaN(ts) ? null : ts
  } catch {
    return null
  }
}

/**
 * Write the current timestamp as the last sync run.
 */
async function writeLastRunTimestamp(): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await writeFile(LAST_RUN_FILE, String(now) + '\n', 'utf-8')
}

/**
 * Check if a model is too old to sync. Models created more than 30 days
 * before the last sync run are considered deprecated/legacy and skipped.
 */
function isModelTooOld(
  model: OpenRouterModel,
  cutoffTimestamp: number,
): boolean {
  if (!model.created) return false // No date = don't skip
  return model.created < cutoffTimestamp
}

// ---------------------------------------------------------------------------
// Model constant generation
// ---------------------------------------------------------------------------

function generateModelConstant(
  model: OpenRouterModel,
  prefix: string,
  config: ProviderConfig,
): string {
  const constName = toConstName(prefix, model.id)
  const strippedId = stripPrefix(prefix, model.id)

  const inputNormal = convertPrice(model.pricing.prompt)
  const inputCached = convertPrice(model.pricing.input_cache_read)
  const outputNormal = convertPrice(model.pricing.completion)

  // Use actual input modalities from OpenRouter data, filtered to what this provider supports
  const inputModalities = mapInputModalities(
    model.architecture.input_modalities,
  ).filter((m) => config.validInputModalities.includes(m))
  const inputModalitiesStr = inputModalities.map((m) => `'${m}'`).join(', ')

  const lines: Array<string> = []
  lines.push(`const ${constName} = {`)

  // name field
  lines.push(`  name: '${strippedId}',`)

  // id field (Anthropic has both name and id, set to same value for new models)
  if (config.hasBothNameAndId) {
    lines.push(`  id: '${strippedId}',`)
  }

  // context / max_input_tokens
  if (model.context_length > 0) {
    lines.push(
      `  ${config.contextField}: ${formatNumber(model.context_length)},`,
    )
  }

  // max_output_tokens
  if (model.top_provider.max_completion_tokens) {
    lines.push(
      `  max_output_tokens: ${formatNumber(model.top_provider.max_completion_tokens)},`,
    )
  }

  // supports block (actual input modalities + reference capabilities)
  lines.push(`  supports: {`)
  lines.push(`    input: [${inputModalitiesStr}],`)
  lines.push(config.referenceSupportsBody)
  lines.push(`  },`)

  // pricing
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

  lines.push(`} as const satisfies ${config.referenceSatisfies}`)

  return lines.join('\n')
}

/**
 * Format a number with underscore separators for readability.
 * E.g. 131072 -> '131_072', 200000 -> '200_000'
 */
function formatNumber(n: number): string {
  if (n < 1000) return String(n)
  const str = String(n)
  // Insert underscores every 3 digits from the right
  const parts: Array<string> = []
  let remaining = str
  while (remaining.length > 3) {
    parts.unshift(remaining.slice(-3))
    remaining = remaining.slice(0, -3)
  }
  parts.unshift(remaining)
  return parts.join('_')
}

// ---------------------------------------------------------------------------
// File modification
// ---------------------------------------------------------------------------

/**
 * Insert new model constants before the first `export` statement.
 */
function insertConstants(content: string, constants: Array<string>): string {
  const block = '\n' + constants.join('\n\n') + '\n'
  // Find the first `\nexport ` that is not inside a comment
  const exportIndex = content.indexOf('\nexport ')
  if (exportIndex === -1) {
    // Fallback: append before end of file
    return content + block
  }
  return content.slice(0, exportIndex) + block + content.slice(exportIndex)
}

/**
 * Add entries to an array like: export const ARRAY_NAME = [ ... ] as const
 * Uses a regex with the `s` flag (dotAll) to match across newlines.
 */
function addToArray(
  content: string,
  arrayName: string,
  entries: Array<string>,
  arrayRef: string,
): string {
  // Match the array declaration: export const ARRAY_NAME = [...] as const
  // Uses [\s\S]*? (non-greedy) instead of [^\]]* to handle ] inside comments
  const pattern = new RegExp(
    `(export const ${arrayName} = \\[\\s*[\\s\\S]*?)(\\] as const)`,
  )
  const match = pattern.exec(content)
  if (!match) {
    console.warn(`  Warning: Could not find array '${arrayName}' in file`)
    return content
  }

  const newEntries = entries
    .map((constName) => `  ${constName}${arrayRef},`)
    .join('\n')
  // Use replacer function to prevent $-character interpretation in replacement string
  return content.replace(
    pattern,
    () => `${match[1]}\n${newEntries}\n${match[2]}`,
  )
}

/**
 * Add entries to a type map like:
 *   export type TypeName = {
 *     ...existing entries...
 *   }
 */
function addToTypeMap(
  content: string,
  typeName: string,
  entries: Array<string>,
): string {
  // Match: export type TypeName = { ... \n}
  const pattern = new RegExp(
    `(export type ${typeName} = \\{[\\s\\S]*?)(\\n\\})`,
  )
  const match = pattern.exec(content)
  if (!match) {
    console.warn(`  Warning: Could not find type map '${typeName}' in file`)
    return content
  }

  const newEntries = entries.join('\n')
  // Use replacer function to prevent $-character interpretation in replacement string
  return content.replace(pattern, () => `${match[1]}\n${newEntries}${match[2]}`)
}

// ---------------------------------------------------------------------------
// Git-based change detection
// ---------------------------------------------------------------------------

/**
 * Detect packages with uncommitted changes by running `git diff`.
 * This captures changes from ALL prior pipeline steps (e.g. convert-openrouter-models.ts)
 * not just the models added by this script.
 */
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
      // packages/typescript/ai-openrouter/... → @tanstack/ai-openrouter
      const match = line.match(/^packages\/typescript\/([\w-]+)\//)
      if (match) {
        changed.add(`@tanstack/${match[1]}`)
      }
    }
  } catch {
    // git not available (e.g. running outside a repo) — fall back to empty set
  }
  return changed
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  let totalAdded = 0
  const changedPackages = new Set<string>()

  // Determine age cutoff: skip models created >30 days before last run
  const lastRun = await readLastRunTimestamp()
  const now = Math.floor(Date.now() / 1000)
  const cutoffTimestamp = (lastRun ?? now) - MAX_MODEL_AGE_SECONDS
  const cutoffDate = new Date(cutoffTimestamp * 1000)
    .toISOString()
    .split('T')[0]
  console.log(
    `Model age cutoff: ${cutoffDate} (skipping models created before this date)`,
  )

  for (const [prefix, config] of Object.entries(PROVIDER_MAP)) {
    console.log(`\nProcessing provider: ${prefix}`)

    // Filter OpenRouter models for this prefix
    const providerModels = models.filter((m) => m.id.startsWith(prefix))
    console.log(
      `  Found ${providerModels.length} OpenRouter models with prefix '${prefix}'`,
    )

    // Read the provider's model-meta.ts
    let content: string
    try {
      content = await readFile(config.metaFile, 'utf-8')
    } catch {
      console.warn(`  Skipping: could not read ${config.metaFile}`)
      continue
    }

    // Extract existing model IDs (normalized) and constant names
    const existingIds = extractExistingModelIds(content)
    const existingConstNames = extractExistingConstNames(content)

    console.log(
      `  Existing models in file: ${existingIds.size} IDs, ${existingConstNames.size} constants`,
    )

    // Find new models
    const newModels: Array<{
      model: OpenRouterModel
      constName: string
      strippedId: string
    }> = []

    for (const model of providerModels) {
      const strippedId = stripPrefix(prefix, model.id)
      const constName = toConstName(prefix, model.id)

      // Skip models with ':' variants (e.g., 'anthropic/claude-3.7-sonnet:thinking')
      // These are routing variants, not separate models
      if (strippedId.includes(':')) {
        continue
      }

      // Skip non-chat model families (audio/music/video/image generation)
      if (isNonChatModel(strippedId)) {
        continue
      }

      // Skip provider-specific patterns (deprecated/legacy model families)
      if (matchesSkipPattern(strippedId, config.skipPatterns)) {
        continue
      }

      // Skip models that are too old (created >30 days before last sync)
      if (isModelTooOld(model, cutoffTimestamp)) {
        continue
      }

      // Normalize for comparison to handle dots-vs-dashes naming differences
      if (
        !existingIds.has(normalizeId(strippedId)) &&
        !existingConstNames.has(constName)
      ) {
        newModels.push({ model, constName, strippedId })
      }
    }

    if (newModels.length === 0) {
      console.log('  No new models to add.')
      continue
    }

    console.log(`  Adding ${newModels.length} new models:`)
    for (const { strippedId, constName } of newModels) {
      console.log(`    - ${strippedId} (${constName})`)
    }

    // Filter out image-only models (they need manual curation for size/provider type maps)
    const filteredModels = newModels.filter(
      ({ model }) => !isImageOnlyModel(model),
    )
    const skippedImageOnly = newModels.length - filteredModels.length
    if (skippedImageOnly > 0) {
      console.log(
        `  Skipping ${skippedImageOnly} image-only models (require manual curation)`,
      )
    }

    if (filteredModels.length === 0) {
      console.log('  No eligible models to add after filtering.')
      continue
    }

    // Generate constants
    const constants = filteredModels.map(({ model }) =>
      generateModelConstant(model, prefix, config),
    )

    // Insert constants before first export
    content = insertConstants(content, constants)

    // Filter to chat-eligible models: must output text
    const chatModels = filteredModels.filter(({ model }) => outputsText(model))

    if (chatModels.length > 0) {
      content = addToArray(
        content,
        config.chatArrayName,
        chatModels.map(({ constName }) => constName),
        config.arrayRef,
      )
    }

    // NOTE: We intentionally do NOT add models to image arrays.
    // Image model arrays have specialized type maps (sizes, provider options)
    // that require manual curation.

    // Add to provider options type map (skip for Grok - uses mapped type)
    if (!config.providerOptionsIsMappedType && chatModels.length > 0) {
      const providerOptionsEntries = chatModels.map(
        ({ constName }) =>
          `  [${constName}${config.arrayRef}]: ${config.referenceProviderOptionsEntry}`,
      )
      if (providerOptionsEntries.length > 0) {
        content = addToTypeMap(
          content,
          config.providerOptionsTypeName,
          providerOptionsEntries,
        )
      }
    }

    // Add to input modalities type map
    const modalityEntries = chatModels.map(
      ({ constName }) =>
        `  [${constName}${config.arrayRef}]: typeof ${constName}.supports.input`,
    )
    if (modalityEntries.length > 0) {
      content = addToTypeMap(
        content,
        config.inputModalitiesTypeName,
        modalityEntries,
      )
    }

    // Write the modified file
    await writeFile(config.metaFile, content, 'utf-8')
    console.log(`  Wrote updated file: ${config.metaFile}`)
    totalAdded += filteredModels.length
    changedPackages.add(config.packageName)
  }

  console.log(`\nDone. Added ${totalAdded} new models total.`)

  // Record this run's timestamp for future age-based filtering
  await writeLastRunTimestamp()

  // Detect all packages with uncommitted changes (includes changes from
  // convert-openrouter-models.ts which runs before this script)
  const allChangedPackages = detectChangedPackages()
  for (const pkg of changedPackages) {
    allChangedPackages.add(pkg)
  }

  if (allChangedPackages.size > 0) {
    await createChangeset(allChangedPackages)
  }
}

/**
 * Create or update the sync-models changeset file.
 * If one already exists, merges the package lists. Otherwise creates a new one.
 */
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

    // Merge existing packages into the set
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
  return `---\n${packageLines}\n---\n\nUpdate model metadata from OpenRouter API\n`
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
