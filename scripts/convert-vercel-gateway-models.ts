/**
 * Converts Vercel AI Gateway catalog rows into packages/ai-vercel-gateway/src/model-meta.ts.
 *
 * Usage:
 *   pnpm tsx scripts/convert-vercel-gateway-models.ts
 */

import { writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { models } from './vercel-gateway.models'
import type { VercelGatewayCatalogModel } from './vercel-gateway.models'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_PATH = resolve(
  __dirname,
  '../packages/ai-vercel-gateway/src/model-meta.ts',
)

type CatalogKind =
  | 'language'
  | 'embedding'
  | 'image'
  | 'video'
  | 'reranking'
  | 'other'

const TYPE_ALIASES: Record<string, CatalogKind> = {
  language: 'language',
  chat: 'language',
  embedding: 'embedding',
  embeddings: 'embedding',
  image: 'image',
  video: 'video',
  reranking: 'reranking',
  rerank: 'reranking',
}

function classifyModel(model: VercelGatewayCatalogModel): CatalogKind {
  const type = typeof model.type === 'string' ? model.type.toLowerCase() : ''
  if (type in TYPE_ALIASES) {
    return TYPE_ALIASES[type]!
  }

  const id = model.id
  if (/embed/i.test(id)) return 'embedding'
  if (/image|dall-e|imagen|flux|seedream/i.test(id)) return 'image'
  if (/rerank/i.test(id)) return 'reranking'
  if (/video|veo|sora|seedance/i.test(id)) return 'video'
  return 'language'
}

type InputModality = 'text' | 'image' | 'audio' | 'video' | 'document'

const INPUT_MODALITY_ORDER: Array<InputModality> = [
  'text',
  'image',
  'document',
  'audio',
  'video',
]

const EXCLUDED_PARAMS = new Set(['tools', 'tool_choice'])

const PARAM_NAME_MAP: Record<string, Array<string>> = {
  max_tokens: ['max_tokens', 'max_output_tokens'],
  max_completion_tokens: ['max_completion_tokens', 'max_output_tokens'],
  temperature: ['temperature'],
  top_p: ['top_p'],
  stop: ['stop'],
  seed: ['seed'],
  frequency_penalty: ['frequency_penalty'],
  presence_penalty: ['presence_penalty'],
  reasoning: ['reasoning'],
  include_reasoning: ['include_reasoning'],
  response_format: ['response_format'],
  structured_outputs: ['structured_outputs'],
}

function formatStringArray(ids: Array<string>): string {
  if (ids.length === 0) {
    return '[] as const'
  }
  return `[\n${ids.map((id) => `  ${JSON.stringify(id)},`).join('\n')}\n] as const`
}

function mapInputModality(modality: string): InputModality | null {
  const mapping: Record<string, InputModality> = {
    text: 'text',
    image: 'image',
    audio: 'audio',
    video: 'video',
    pdf: 'document',
    file: 'document',
    document: 'document',
  }
  return mapping[modality.toLowerCase()] ?? null
}

function uniqueSorted(values: Iterable<string>): Array<string> {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}

function inputModalitiesFor(
  model: VercelGatewayCatalogModel,
): Array<InputModality> {
  const mapped = (model.modalities?.input ?? [])
    .map(mapInputModality)
    .filter((modality): modality is InputModality => modality !== null)
  if (!mapped.includes('text')) {
    mapped.unshift('text')
  }
  return INPUT_MODALITY_ORDER.filter((modality) => mapped.includes(modality))
}

function optionKeysFor(model: VercelGatewayCatalogModel): Array<string> {
  const keys = new Set<string>()
  for (const param of model.supported_parameters ?? []) {
    if (EXCLUDED_PARAMS.has(param)) continue
    const mapped = PARAM_NAME_MAP[param] ?? [param]
    for (const key of mapped) keys.add(key)
  }
  return [...keys]
}

function formatOptionType(keys: Array<string>): string {
  if (keys.length === 0) {
    return 'VercelGatewayCommonOptions'
  }
  return `VercelGatewayCommonOptions & Pick<VercelGatewayBaseOptions, ${keys
    .map((key) => `'${key}'`)
    .join(' | ')}>`
}

function formatModalitiesType(modalities: Array<InputModality>): string {
  return `readonly [${modalities.map((modality) => `'${modality}'`).join(', ')}]`
}

function convertModels(): string {
  const chat: Array<VercelGatewayCatalogModel> = []
  const embedding: Array<string> = []
  const image: Array<string> = []
  const providers = new Set<string>()
  const tags = new Set<string>()
  let video = 0
  let reranking = 0
  let other = 0

  for (const model of models) {
    if (typeof model.owned_by === 'string' && model.owned_by.length > 0) {
      providers.add(model.owned_by)
    }
    const kind = classifyModel(model)
    switch (kind) {
      case 'language':
        chat.push(model)
        for (const tag of model.tags ?? []) tags.add(tag)
        break
      case 'embedding':
        embedding.push(model.id)
        break
      case 'image':
        image.push(model.id)
        break
      case 'video':
        video += 1
        break
      case 'reranking':
        reranking += 1
        break
      default:
        other += 1
    }
  }

  chat.sort((a, b) => a.id.localeCompare(b.id))
  embedding.sort((a, b) => a.localeCompare(b))
  image.sort((a, b) => a.localeCompare(b))

  if (chat.length === 0) {
    throw new Error(
      'Vercel AI Gateway catalog produced no chat models. Refusing to overwrite model-meta.ts.',
    )
  }
  if (embedding.length === 0) {
    throw new Error(
      'Vercel AI Gateway catalog produced no embedding models. Refusing to overwrite model-meta.ts.',
    )
  }
  if (image.length === 0) {
    throw new Error(
      'Vercel AI Gateway catalog produced no image models. Refusing to overwrite model-meta.ts.',
    )
  }

  console.log(
    `Classified ${models.length} models: chat=${chat.length} embedding=${embedding.length} image=${image.length} video=${video} reranking=${reranking} other=${other}`,
  )

  const chatIds = chat.map((model) => model.id)
  const optionEntries = chat
    .map(
      (model) =>
        `  ${JSON.stringify(model.id)}: ${formatOptionType(optionKeysFor(model))}`,
    )
    .join('\n')
  const modalityEntries = chat
    .map(
      (model) =>
        `  ${JSON.stringify(model.id)}: ${formatModalitiesType(inputModalitiesFor(model))}`,
    )
    .join('\n')

  return `/**
 * This file is generated by scripts/convert-vercel-gateway-models.ts. Do not edit by hand.
 */

import type { VercelGatewayEmbeddingProviderOptions } from './embedding/embedding-provider-options'
import type {
  VercelGatewayImageProviderOptions,
  VercelGatewayImageSize,
} from './image/image-provider-options'
import type {
  VercelGatewayBaseOptions,
  VercelGatewayCommonOptions,
  VercelGatewayTextProviderOptions,
} from './text/text-provider-options'

export const VERCEL_GATEWAY_CHAT_MODELS = ${formatStringArray(chatIds)}

export type VercelGatewayChatModel = (typeof VERCEL_GATEWAY_CHAT_MODELS)[number]

export const VERCEL_GATEWAY_PROVIDERS = ${formatStringArray(uniqueSorted(providers))}

export type VercelGatewayProvider = (typeof VERCEL_GATEWAY_PROVIDERS)[number]

export const VERCEL_GATEWAY_MODEL_TAGS = ${formatStringArray(uniqueSorted(tags))}

export type VercelGatewayModelTag = (typeof VERCEL_GATEWAY_MODEL_TAGS)[number]

export const VERCEL_GATEWAY_EMBEDDING_MODELS = ${formatStringArray(embedding)}

export type VercelGatewayEmbeddingModel =
  (typeof VERCEL_GATEWAY_EMBEDDING_MODELS)[number]

export const VERCEL_GATEWAY_IMAGE_MODELS = ${formatStringArray(image)}

export type VercelGatewayImageModel =
  (typeof VERCEL_GATEWAY_IMAGE_MODELS)[number]

export type VercelGatewayChatModelProviderOptionsByName = {
${optionEntries}
}

export type VercelGatewayModelInputModalitiesByName = {
${modalityEntries}
}

export type VercelGatewayChatModelToolCapabilitiesByName = {
  [K in VercelGatewayChatModel]: readonly []
}

export type VercelGatewayEmbeddingModelProviderOptionsByName = {
  [K in VercelGatewayEmbeddingModel]: VercelGatewayEmbeddingProviderOptions
}

export type VercelGatewayEmbeddingModelInputModalitiesByName = {
  [K in VercelGatewayEmbeddingModel]: readonly ['text']
}

export type VercelGatewayImageModelProviderOptionsByName = {
  [K in VercelGatewayImageModel]: VercelGatewayImageProviderOptions
}

export type VercelGatewayImageModelSizeByName = {
  [K in VercelGatewayImageModel]: VercelGatewayImageSize
}

export type VercelGatewayImageModelInputModalitiesByName = {
  [K in VercelGatewayImageModel]: readonly []
}

export type ResolveProviderOptions<TModel extends string> =
  TModel extends keyof VercelGatewayChatModelProviderOptionsByName
    ? VercelGatewayChatModelProviderOptionsByName[TModel]
    : TModel extends VercelGatewayEmbeddingModel
      ? VercelGatewayEmbeddingProviderOptions
      : TModel extends VercelGatewayImageModel
        ? VercelGatewayImageProviderOptions
        : VercelGatewayTextProviderOptions

export type ResolveInputModalities<TModel extends string> =
  TModel extends keyof VercelGatewayModelInputModalitiesByName
    ? VercelGatewayModelInputModalitiesByName[TModel]
    : readonly ['text']
`
}

async function main() {
  const file = convertModels()
  await writeFile(OUTPUT_PATH, file, 'utf-8')
  console.log(`Model meta file written to ${OUTPUT_PATH}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
