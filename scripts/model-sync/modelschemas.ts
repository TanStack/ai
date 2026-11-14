/**
 * Reads a provider's model catalogue from modelschemas for
 * `sync-provider-models.ts`.
 *
 * `GET /v1/models?provider={id}&pricing=1` gives each model's native id
 * (`rawId`), activity, limits, modalities, capabilities and rate card.
 */

const API = 'https://modelschemas.com/v1'

interface RateCard {
  tables?: { rate?: Record<string, Record<string, number>> }
}

/** The fields of a modelschemas catalogue entry that the sync reads. */
export interface ModelSchemasModel {
  rawId: string
  activity: string | null
  sameAs: string | null
  deprecatedAt: number | null
  releasedAt: number | null
  firstSeenAt: number | null
  contextWindow: number | null
  maxOutput: number | null
  modalities: { input: Array<string>; output: Array<string> } | null
  capabilities: Record<string, boolean> | null
  reasoning: { mandatory?: boolean } | null
  pricing: RateCard | null
}

/** A chat model, in the shape the model-meta generator writes. */
export interface CatalogModel {
  id: string
  created?: number
  contextLength?: number
  maxOutput?: number
  /** USD per million tokens. `undefined` when modelschemas has no rate card. */
  pricing?: { input: number; cached: number; output: number }
  inputModalities: Array<string>
  outputModalities: Array<string>
  /** The capabilities that are `true`, named as OpenRouter names its parameters. */
  supportedParameters: Array<string>
  reasoningMandatory: boolean
}

const perMillion = (perToken = 0) =>
  Math.round(perToken * 1_000_000 * 1e10) / 1e10

/** The base-tier token prices, or `undefined` without a token rate card. */
function tokenPricing(card: RateCard | null) {
  const base = card?.tables?.rate?.base
  if (base?.input_tokens === undefined || base.output_tokens === undefined) {
    return undefined
  }
  return {
    input: perMillion(base.input_tokens),
    cached: perMillion(base.cache_read_tokens),
    output: perMillion(base.output_tokens),
  }
}

/** The current chat models of a catalogue: no aliases, no deprecated ids. */
export function chatModels(models: Array<ModelSchemasModel>) {
  return models
    .filter(
      (model) =>
        model.activity === 'chat' && !model.sameAs && !model.deprecatedAt,
    )
    .map(
      (model): CatalogModel => ({
        id: model.rawId,
        created: model.releasedAt ?? model.firstSeenAt ?? undefined,
        contextLength: model.contextWindow ?? undefined,
        maxOutput: model.maxOutput ?? undefined,
        pricing: tokenPricing(model.pricing),
        inputModalities: model.modalities?.input ?? ['text'],
        outputModalities: model.modalities?.output ?? ['text'],
        supportedParameters: Object.entries(model.capabilities ?? {})
          .filter(([, on]) => on)
          .map(([name]) => name),
        reasoningMandatory: model.reasoning?.mandatory === true,
      }),
    )
}

export async function fetchChatModels(provider: string) {
  const url = `${API}/models?provider=${encodeURIComponent(provider)}&pricing=1`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`modelschemas ${response.status} for ${url}`)
  }
  const body: { models?: Array<ModelSchemasModel> } = await response.json()
  return chatModels(body.models ?? [])
}
