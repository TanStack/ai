/**
 * Script to convert OpenRouter model objects to ModelMeta format
 *
 * Usage:
 * 1. Paste your OpenRouter models array into the `models` variable below
 * 2. Run: npx ts-node scripts/convert-openrouter-models.ts
 * 3. Copy the output into your model-meta.ts file
 */

import { writeFile } from 'node:fs/promises'
import { models } from './openrouter.models'
import type { OpenRouterModel } from './openrouter.models'

type InputModality = 'text' | 'image' | 'audio' | 'video' | 'document'

function mapInputModality(modality: string): InputModality | null {
  const mapping: Record<string, InputModality> = {
    text: 'text',
    image: 'image',
    audio: 'audio',
    video: 'video',
    file: 'document',
    document: 'document',
  }
  return mapping[modality.toLowerCase()] || null
}

function convertPricing(priceStr: string, isImage: boolean = false): number {
  // OpenRouter pricing is typically per token (in dollars)
  // Convert to number
  const price = parseFloat(priceStr)
  if (isImage) {
    return isNaN(price) ? 0 : price
  }
  return finalPrice(isNaN(price) ? 0 : price)
}
function finalPrice(price: number): number {
  // Ensure price is non-negative and rounded to avoid floating-point errors
  const result = price * 1_000_000
  // Round to a reasonable number of decimal places
  return Math.round(result * 1e10) / 1e10
}
const perModelProviderOptions: Record<string, string> = {}
const perModelInputModalities: Record<string, string> = {}

const imageModels = new Set<string>([])
const chatModels = new Set<string>([])
const videoModels = new Set<string>([])

function generateChatModelsArray(): string {
  const modelIds = Array.from(chatModels)
  if (modelIds.length === 0) {
    return ''
  }
  modelIds.push(`"openrouter/auto"`)
  return `export const OPENROUTER_CHAT_MODELS = [\n${modelIds
    .map((id) => `  ${id},`)
    .join('\n')}\n] as const`
}

function generateImageModelsArray(): string {
  const modelIds = Array.from(imageModels)
  if (modelIds.length === 0) {
    return ''
  }
  return `export const OPENROUTER_IMAGE_MODELS = [\n${modelIds
    .map((id) => `  ${id},`)
    .join('\n')}\n] as const`
}

function generateVideoModelsArray(): string {
  const modelIds = Array.from(videoModels)
  if (modelIds.length === 0) {
    return ''
  }
  return `export const OPENROUTER_VIDEO_MODELS = [\n${modelIds
    .map((id) => `  ${id},`)
    .join('\n')}\n] as const`
}

function createPerModelModelOptions(): string {
  const entries = Object.entries(perModelProviderOptions).map(
    ([modelId, typeStr]) => `  [${modelId}]: ${typeStr};`,
  )
  entries.push(
    `  "openrouter/auto": OpenRouterCommonOptions & OpenRouterBaseOptions;`,
  )

  return `\nexport type OpenRouterModelOptionsByName  = {\n${entries.join(
    '\n',
  )}\n}`
}

function createPerModelInputModalities(): string {
  const entries = Object.entries(perModelInputModalities).map(
    ([modelId, modalitiesStr]) =>
      `  [${modelId}]: ReadonlyArray<${modalitiesStr}>;`,
  )

  entries.push(
    `  "openrouter/auto": ReadonlyArray<'text' | 'image' | 'audio' | 'video' | 'document'>;`,
  )
  return `\nexport type OpenRouterModelInputModalitiesByName  = {\n${entries.join(
    '\n',
  )}\n}`
}

function generateModelMetaString(model: OpenRouterModel): string {
  const inputModalities = model.architecture.input_modalities
    .map(mapInputModality)
    .filter((m): m is InputModality => m !== null)
  const outputModalities = model.architecture.output_modalities
    .map(mapInputModality)
    .filter((m): m is InputModality => m !== null)
  const constName = model.id
    .replaceAll('/', '-')
    .replaceAll('-', '_')
    .replaceAll('.', '_')
    .replaceAll(':', '_')
    .toUpperCase()
  // Ensure at least 'text' is present
  if (!inputModalities.includes('text')) {
    inputModalities.unshift('text')
  }
  if (outputModalities.includes('text')) {
    chatModels.add(`${constName}.id`)
  }
  if (outputModalities.includes('image')) {
    imageModels.add(`${constName}.id`)
  }
  if (outputModalities.includes('video')) {
    videoModels.add(`${constName}.id`)
  }
  const inputPrice = convertPricing(model.pricing.prompt)
  const outputPrice = convertPricing(model.pricing.completion)
  const imagePrice = convertPricing(model.pricing.image ?? '0', true)
  const inputCacheReadPrice = convertPricing(
    model.pricing.input_cache_read ?? '0',
  )
  const inputCacheWritePrice = convertPricing(
    model.pricing.input_cache_write ?? '0',
  )

  // Build the object as a formatted string
  const lines: Array<string> = []
  lines.push(`const ${constName} =  {`)
  lines.push(`    id: '${model.id}',`)
  lines.push(`    name: '${model.name.replace(/'/g, "\\'")}',`)
  lines.push(`    supports: {`)
  lines.push(
    `      input: [${inputModalities.map((m) => `'${m}'`).join(', ')}],`,
  )
  lines.push(
    `      output: [${outputModalities.map((m) => `'${m}'`).join(', ')}],`,
  )
  lines.push(
    `      supports: [${model.supported_parameters?.map((p) => `'${p}'`).join(', ') || ''}],`,
  )
  lines.push(`    },`)

  if (model.context_length) {
    lines.push(`    context_window: ${model.context_length},`)
  }

  if (model.top_provider.max_completion_tokens) {
    lines.push(
      `    max_output_tokens: ${model.top_provider.max_completion_tokens},`,
    )
  }

  lines.push(`    pricing: {`)
  lines.push(`      text: {`)
  lines.push(`        input: {`)
  lines.push(`          normal: ${inputPrice},`)
  lines.push(`          cached: ${inputCacheReadPrice + inputCacheWritePrice},`)
  lines.push(`        },`)
  lines.push(`        output: {`)
  lines.push(`          normal: ${outputPrice},`)
  lines.push(`        },`)
  lines.push(`      },`)
  lines.push(`      image: ${imagePrice},`)
  lines.push(`    },`)
  lines.push(`  } as const`)

  const supportedParams =
    model.supported_parameters
      ?.map((p) =>
        p === 'tools' || p === 'reasoning_effort' || p === 'structured_outputs'
          ? ''
          : `'${p === 'max_tokens' ? 'max_completion_tokens' : p}'`,
      )
      .filter(Boolean) ?? []
  perModelProviderOptions[`${constName}.id`] =
    supportedParams.length > 0
      ? `OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,${
          supportedParams.join(' | ') || ''
        }>`
      : 'OpenRouterCommonOptions & OpenRouterBaseOptions'
  perModelInputModalities[`${constName}.id`] = inputModalities
    .map((m) => `'${m}'`)
    .join(' | ')
  return lines.join('\n')
}

function convertModels(models: Array<OpenRouterModel>): string {
  const modelStrings = models.map(generateModelMetaString)
  return modelStrings.join('\n')
}

// ============================================================
// PASTE YOUR OPENROUTER MODELS ARRAY BELOW
// ============================================================

// ============================================================
// RUN CONVERSION
// ============================================================

console.log('// Generated ModelMeta entries:')
console.log('')
const file = `
import type { OpenRouterBaseOptions, OpenRouterCommonOptions } from './text/text-provider-options'
  
${convertModels(models)}

${createPerModelModelOptions()}

${createPerModelInputModalities()}

${generateChatModelsArray()}
${generateVideoModelsArray()}
${generateImageModelsArray()}
`
console.log(file)
writeFile('packages/typescript/ai-openrouter/src/model-meta.ts', file).then(
  () => {
    console.log(
      'Model meta file written to packages/typescript/ai-openrouter/src/model-meta.ts',
    )
  },
)
