import { ChatStreamSummarizeAdapter } from '@tanstack/ai/adapters'
import { NEON_ANTHROPIC_MODELS } from '../model-meta'
import { getNeonTokenFromEnv } from '../utils/client'
import { buildNeonText } from './factory'
import type { InferTextProviderOptions } from '@tanstack/ai/adapters'
import type { AnyNeonTextConfig, NeonAnthropicTextAdapter } from './factory'
import type {
  NeonAnthropicModel,
  NeonChatModel,
  NeonResponsesOnlyModel,
} from '../model-meta'
import type {
  NeonResponsesProviderOptions,
  NeonTextProviderOptions,
} from '../text/text-provider-options'

export type NeonSummarizeConfig = AnyNeonTextConfig

/** The model options of the route the model runs on. */
export type NeonSummarizeProviderOptions<TModel extends NeonChatModel> =
  TModel extends NeonAnthropicModel
    ? InferTextProviderOptions<NeonAnthropicTextAdapter<TModel>>
    : TModel extends NeonResponsesOnlyModel
      ? NeonResponsesProviderOptions
      : NeonTextProviderOptions

const anthropicModels = new Set<string>(NEON_ANTHROPIC_MODELS)

/**
 * Creates a Neon AI Gateway summarize adapter with an explicit token. It runs
 * on the same route `createNeonText` picks for the model.
 */
export function createNeonSummarize<TModel extends NeonChatModel>(
  model: TModel,
  apiKey: string,
  config?: NeonSummarizeConfig,
): ChatStreamSummarizeAdapter<TModel, NeonSummarizeProviderOptions<TModel>> {
  // Claude runs on the Anthropic adapter, so `maxLength` and the default
  // temperature go where that adapter reads them.
  const name = anthropicModels.has(model) ? 'anthropic' : 'neon'
  return new ChatStreamSummarizeAdapter(
    buildNeonText(model, apiKey, config),
    model,
    name,
  )
}

/**
 * Creates a Neon AI Gateway summarize adapter with the token from
 * `NEON_AI_GATEWAY_TOKEN` and the host from `NEON_AI_GATEWAY_BASE_URL`.
 */
export function neonSummarize<TModel extends NeonChatModel>(
  model: TModel,
  config?: NeonSummarizeConfig,
): ChatStreamSummarizeAdapter<TModel, NeonSummarizeProviderOptions<TModel>> {
  return createNeonSummarize(model, getNeonTokenFromEnv(), config)
}
