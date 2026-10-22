/**
 * Map one LLM Gateway `/v1/models` row into the fields `model-meta.ts` needs.
 * modelschemas has no `llmgateway` provider, so this catalog is the source.
 */

import type { ReasoningShape } from './reasoning-shapes.ts'

export type LlmGatewayInput = 'text' | 'image' | 'audio' | 'video' | 'document'

export type LlmGatewayFeature =
  | 'streaming'
  | 'tools'
  | 'json_object'
  | 'json_schema'
  | 'reasoning'
  | 'vision'

const INPUT_ORDER: Array<LlmGatewayInput> = [
  'text',
  'image',
  'document',
  'audio',
  'video',
]

const INPUT_ALIASES: Record<string, LlmGatewayInput> = {
  text: 'text',
  image: 'image',
  audio: 'audio',
  video: 'video',
  pdf: 'document',
  file: 'document',
  document: 'document',
}

/** `none` is the gateway's off switch. The SDK level is `off`. */
const EFFORT_LEVELS: Record<string, keyof ReasoningShape['levels']> = {
  none: 'off',
  minimal: 'minimal',
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
  max: 'max',
}

const FEATURE_ORDER: Array<LlmGatewayFeature> = [
  'streaming',
  'tools',
  'json_object',
  'json_schema',
  'reasoning',
  'vision',
]

export interface LlmGatewayCatalogRow {
  id?: unknown
  architecture?: {
    input_modalities?: unknown
    output_modalities?: unknown
  }
  pricing?: Record<string, unknown>
  context_length?: unknown
  max_output?: unknown
  supported_parameters?: unknown
  json_output?: unknown
  structured_outputs?: unknown
  providers?: unknown
}

export interface LlmGatewayModelMeta {
  id: string
  contextWindow?: number
  maxCompletionTokens?: number
  pricing: {
    input?: { normal: number; cached?: number }
    output?: { normal: number }
  }
  input: Array<LlmGatewayInput>
  features: Array<LlmGatewayFeature>
  reasoning?: ReasoningShape
}

interface ProviderRow {
  tools?: unknown
  reasoning?: unknown
  reasoning_efforts?: unknown
  vision?: unknown
  streaming?: unknown
  max_output?: unknown
}

function stringList(value: unknown): Array<string> {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function providersOf(row: LlmGatewayCatalogRow): Array<ProviderRow> {
  if (!Array.isArray(row.providers)) return []
  return row.providers.filter(
    (provider): provider is ProviderRow =>
      typeof provider === 'object' && provider !== null,
  )
}

function positiveInt(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(n) || n <= 0) return undefined
  return n
}

/** Catalog prices are USD per token. Model meta stores USD per million. */
export function pricePerMillion(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const perToken = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(perToken) || perToken <= 0) return undefined
  return Math.round(perToken * 1e6 * 1e6) / 1e6
}

function inputOf(row: LlmGatewayCatalogRow): Array<LlmGatewayInput> {
  const mapped = stringList(row.architecture?.input_modalities)
    .map((modality) => INPUT_ALIASES[modality.toLowerCase()])
    .filter((modality): modality is LlmGatewayInput => modality !== undefined)
  if (!mapped.includes('text')) mapped.unshift('text')
  return INPUT_ORDER.filter((modality) => mapped.includes(modality))
}

function reasoningOf(
  providers: Array<ProviderRow>,
): ReasoningShape | undefined {
  const efforts = providers
    .map((provider) => stringList(provider.reasoning_efforts))
    .find((list) => list.length > 0)
  if (!efforts) return undefined
  const levels: ReasoningShape['levels'] = {}
  for (const effort of efforts) {
    const level = EFFORT_LEVELS[effort.toLowerCase()]
    if (!level) continue
    levels[level] = effort.toLowerCase() === 'none' ? 'none' : level
  }
  if (Object.keys(levels).length === 0) return undefined
  return { levels, budget: false }
}

/**
 * `null` when the row is not a chat model we emit: `custom`, a `provider/`
 * id, or a model whose output is not text.
 */
export function catalogRowToMeta(
  row: LlmGatewayCatalogRow,
): LlmGatewayModelMeta | null {
  if (typeof row.id !== 'string' || row.id.length === 0) return null
  if (row.id === 'custom' || row.id.includes('/')) return null

  const outputs = stringList(row.architecture?.output_modalities)
  if (outputs.length > 0 && !outputs.includes('text')) return null

  const providers = providersOf(row)
  const params = new Set(stringList(row.supported_parameters))
  const input = inputOf(row)
  const reasoning = reasoningOf(providers)
  const flags = new Set<LlmGatewayFeature>()
  if (providers.some((provider) => provider.streaming === true)) {
    flags.add('streaming')
  }
  if (
    providers.some((provider) => provider.tools === true) ||
    params.has('tools')
  ) {
    flags.add('tools')
  }
  if (row.json_output === true) flags.add('json_object')
  if (row.structured_outputs === true) flags.add('json_schema')
  if (reasoning || providers.some((provider) => provider.reasoning === true)) {
    flags.add('reasoning')
  }
  if (
    providers.some((provider) => provider.vision === true) ||
    input.includes('image')
  ) {
    flags.add('vision')
  }

  const normal = pricePerMillion(row.pricing?.prompt)
  const cached = pricePerMillion(row.pricing?.input_cache_read)
  const output = pricePerMillion(row.pricing?.completion)
  const maxFromProvider = providers
    .map((provider) => positiveInt(provider.max_output))
    .find((value) => value !== undefined)

  return {
    id: row.id,
    contextWindow: positiveInt(row.context_length),
    maxCompletionTokens: positiveInt(row.max_output) ?? maxFromProvider,
    pricing: {
      input:
        normal === undefined
          ? undefined
          : { normal, ...(cached === undefined ? {} : { cached }) },
      output: output === undefined ? undefined : { normal: output },
    },
    input,
    features: FEATURE_ORDER.filter((feature) => flags.has(feature)),
    reasoning,
  }
}
