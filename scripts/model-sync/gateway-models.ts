/**
 * The OpenRouter and Vercel AI Gateway model lists, in models.dev's shape, so
 * the model-catalog and reasoning generators read one format.
 */

import type { OpenRouterModel } from '../openrouter.models'
import type { VercelGatewayCatalogModel } from '../vercel-gateway.models'
import type {
  DevModel,
  ReasoningOptionEntry,
} from '../../packages/ai-models/scripts/rules'

/** A price per token (a string) as USD per 1M tokens. */
function perMillion(price: unknown): number | undefined {
  const value = typeof price === 'string' ? Number(price) : undefined
  if (value === undefined || !Number.isFinite(value) || value < 0)
    return undefined
  return Math.round(value * 1e12) / 1e6
}

const inputKind = (kind: string) => (kind === 'file' ? 'pdf' : kind)

/** An OpenRouter API model in models.dev's shape. */
export function fromOpenRouter(model: OpenRouterModel): DevModel {
  const params = model.supported_parameters ?? []
  const efforts = model.reasoning?.supported_efforts
  return {
    id: model.id,
    name: model.name,
    reasoning: params.includes('reasoning'),
    ...(efforts?.length
      ? { reasoning_options: [{ type: 'effort', values: efforts }] }
      : {}),
    temperature: params.includes('temperature'),
    modalities: {
      input: model.architecture.input_modalities.map(inputKind),
      output: model.architecture.output_modalities,
    },
    cost: {
      input: perMillion(model.pricing.prompt),
      output: perMillion(model.pricing.completion),
      cache_read: perMillion(model.pricing.input_cache_read),
      cache_write: perMillion(model.pricing.input_cache_write),
    },
    limit: {
      context: model.context_length,
      output: model.top_provider.max_completion_tokens ?? undefined,
    },
  }
}

/** A Vercel AI Gateway model in models.dev's shape. */
export function fromVercel(model: VercelGatewayCatalogModel): DevModel {
  const pricing =
    typeof model.pricing === 'object' && model.pricing !== null
      ? (model.pricing as Record<string, unknown>)
      : {}
  const options = Array.isArray(model.reasoning_options)
    ? (model.reasoning_options as ReadonlyArray<ReasoningOptionEntry>)
    : undefined
  const params = model.supported_parameters ?? []
  return {
    id: model.id,
    name: typeof model.name === 'string' ? model.name : model.id,
    reasoning:
      params.includes('reasoning') || (model.tags ?? []).includes('reasoning'),
    ...(options ? { reasoning_options: options } : {}),
    ...(typeof model.temperature === 'boolean'
      ? { temperature: model.temperature }
      : {}),
    modalities: {
      input: (model.modalities?.input ?? ['text']).map(inputKind),
      output: model.modalities?.output ?? ['text'],
    },
    cost: {
      input: perMillion(pricing.input),
      output: perMillion(pricing.output),
      cache_read: perMillion(pricing.input_cache_read),
      cache_write: perMillion(pricing.input_cache_write),
    },
    limit: {
      context:
        typeof model.context_window === 'number' ? model.context_window : 0,
      output: typeof model.max_tokens === 'number' ? model.max_tokens : 0,
    },
  }
}
