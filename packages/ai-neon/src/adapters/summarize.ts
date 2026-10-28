import { ChatStreamSummarizeAdapter } from '@tanstack/ai/adapters'
import { NEON_ANTHROPIC_MODELS } from '../model-meta'
import { getNeonTokenFromEnv } from '../utils/client'
import { buildNeonText } from './factory'
import type { InferTextProviderOptions } from '@tanstack/ai/adapters'
import type {
  AnyNeonTextConfig,
  NeonAnthropicTextAdapter,
  NeonDefaultTextConfig,
  NeonResponsesApiConfig,
} from './factory'
import type {
  NeonAnthropicModel,
  NeonChatModel,
  NeonResponsesModel,
  NeonResponsesOnlyModel,
} from '../model-meta'
import type {
  NeonResponsesProviderOptions,
  NeonTextProviderOptions,
} from '../text/text-provider-options'

export type NeonSummarizeConfig<TModel extends NeonChatModel = NeonChatModel> =
  | NeonDefaultTextConfig<TModel>
  | ([TModel] extends [NeonResponsesModel] ? NeonResponsesApiConfig : never)

/** The model options of the route the model runs on. */
export type NeonSummarizeProviderOptions<
  TModel extends NeonChatModel,
  TApi extends 'chat' | 'responses' | undefined = undefined,
> = TApi extends 'responses'
  ? NeonResponsesProviderOptions
  : TModel extends NeonAnthropicModel
    ? InferTextProviderOptions<NeonAnthropicTextAdapter<TModel>>
    : TModel extends NeonResponsesOnlyModel
      ? NeonResponsesProviderOptions
      : NeonTextProviderOptions

const anthropicModels = new Set<string>(NEON_ANTHROPIC_MODELS)

/** Creates a summarize adapter with the same route and options as `createNeonText`. */
export function createNeonSummarize<TModel extends NeonResponsesModel>(
  model: TModel,
  apiKey: string,
  config: NeonResponsesApiConfig,
): ChatStreamSummarizeAdapter<TModel, NeonResponsesProviderOptions>
export function createNeonSummarize<TModel extends NeonChatModel>(
  model: TModel,
  apiKey: string,
  config?: NeonDefaultTextConfig<NoInfer<TModel>>,
): ChatStreamSummarizeAdapter<TModel, NeonSummarizeProviderOptions<TModel>>
export function createNeonSummarize(
  model: NeonChatModel,
  apiKey: string,
  config?: AnyNeonTextConfig,
) {
  return buildNeonSummarize(model, apiKey, config)
}

function buildNeonSummarize(
  model: NeonChatModel,
  apiKey: string,
  config?: AnyNeonTextConfig,
): ChatStreamSummarizeAdapter<
  NeonChatModel,
  NeonSummarizeProviderOptions<NeonChatModel>
> {
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
export function neonSummarize<TModel extends NeonResponsesModel>(
  model: TModel,
  config: NeonResponsesApiConfig,
): ChatStreamSummarizeAdapter<TModel, NeonResponsesProviderOptions>
export function neonSummarize<TModel extends NeonChatModel>(
  model: TModel,
  config?: NeonDefaultTextConfig<NoInfer<TModel>>,
): ChatStreamSummarizeAdapter<TModel, NeonSummarizeProviderOptions<TModel>>
export function neonSummarize(
  model: NeonChatModel,
  config?: AnyNeonTextConfig,
) {
  return buildNeonSummarize(model, getNeonTokenFromEnv(), config)
}
