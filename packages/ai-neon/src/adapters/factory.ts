import {
  NEON_ANTHROPIC_MODELS,
  NEON_RESPONSES_MODELS,
  NEON_RESPONSES_ONLY_MODELS,
} from '../model-meta'
import {
  NEON_ROUTES,
  getNeonTokenFromEnv,
  resolveNeonHost,
} from '../utils/client'
import { NeonAnthropicTextAdapter } from './anthropic-text'
import { NeonTextAdapter } from './text'
import { NeonResponsesTextAdapter } from './responses-text'
import type { AnthropicTextConfig } from '@tanstack/ai-anthropic'
import type {
  NeonAnthropicModel,
  NeonChatModel,
  NeonResponsesModel,
  NeonResponsesOnlyModel,
} from '../model-meta'
import type { NeonTextConfig } from './text'
import type { NeonResponsesTextConfig } from './responses-text'

export type { NeonAnthropicTextAdapter } from './anthropic-text'

/**
 * Config for a Claude model. It goes to the Anthropic Messages route, so it
 * takes the Anthropic SDK's client options. `baseURL` is the branch host.
 */
export type NeonAnthropicTextConfig = Omit<
  AnthropicTextConfig,
  'apiKey' | 'auth' | 'baseURL' | 'provider'
> & { baseURL?: string; api?: never }

/** Config for the Chat Completions route, the default. */
export type NeonChatApiConfig = Omit<NeonTextConfig, 'apiKey'> & {
  api?: 'chat'
}

/** Config for the Responses route. Opt in with `api: 'responses'`. */
export type NeonResponsesApiConfig = Omit<NeonResponsesTextConfig, 'apiKey'> & {
  api: 'responses'
}

export type AnyNeonTextConfig =
  | NeonAnthropicTextConfig
  | NeonChatApiConfig
  | (Omit<NeonResponsesApiConfig, 'api'> & { api?: 'responses' })

const anthropicModels = new Set<string>(NEON_ANTHROPIC_MODELS)
const responsesOnlyModels = new Set<string>(NEON_RESPONSES_ONLY_MODELS)
const responsesModels = new Set<string>(NEON_RESPONSES_MODELS)

type ChatCompletionsModel = Exclude<
  NeonChatModel,
  NeonAnthropicModel | NeonResponsesOnlyModel
>

/** Client options for automatic routing, including a runtime model selection. */
export type NeonDefaultTextConfig<TModel extends NeonChatModel> = [
  TModel,
] extends [NeonAnthropicModel]
  ? NeonAnthropicTextConfig
  : [TModel] extends [NeonResponsesOnlyModel]
    ? Omit<NeonResponsesApiConfig, 'api'> & { api?: 'responses' }
    : [TModel] extends [ChatCompletionsModel]
      ? NeonChatApiConfig
      : Omit<NeonChatApiConfig, 'api'> & NeonAnthropicTextConfig

/** Each member of a model union keeps the adapter of its default route. */
export type NeonDefaultTextAdapter<TModel extends NeonChatModel> =
  TModel extends NeonAnthropicModel
    ? NeonAnthropicTextAdapter<TModel>
    : TModel extends NeonResponsesOnlyModel
      ? NeonResponsesTextAdapter<TModel>
      : NeonTextAdapter<TModel>

function isAnthropicModel(model: string): model is NeonAnthropicModel {
  return anthropicModels.has(model)
}

/** The adapter of any route, for callers that don't know the model's type. */
export type AnyNeonTextAdapter =
  | NeonAnthropicTextAdapter<NeonAnthropicModel>
  | NeonResponsesTextAdapter<NeonResponsesModel>
  | NeonTextAdapter<NeonChatModel>

/** The routing behind `createNeonText`, without the per-model overloads. */
export function buildNeonText(
  model: NeonChatModel,
  apiKey: string,
  config: AnyNeonTextConfig = {},
): AnyNeonTextAdapter {
  // The overloads pair each model with its SDK's options. Only the shared
  // fields are needed here; SDK-specific headers pass through the spread.
  const {
    api,
    ...rest
  }: {
    api?: 'chat' | 'responses'
    baseURL?: string
    fetch?: typeof globalThis.fetch
  } = config
  if (isAnthropicModel(model)) {
    if (api !== undefined) {
      throw new Error(`${model} uses the Anthropic Messages API; omit api.`)
    }
    return new NeonAnthropicTextAdapter(
      {
        ...rest,
        apiKey,
        baseURL: resolveNeonHost(rest.baseURL) + NEON_ROUTES.anthropic,
        auth: 'bearer',
        provider: 'neon',
      },
      model,
    )
  }
  if (api === 'chat' && responsesOnlyModels.has(model)) {
    throw new Error(
      `${model} requires the Responses API; omit api or use api: 'responses'.`,
    )
  }
  if (api === 'responses' && !responsesModels.has(model)) {
    throw new Error(`${model} does not support the Responses API.`)
  }
  if (api === 'responses' || responsesOnlyModels.has(model)) {
    // The overloads only let a Responses-capable model get here.
    return new NeonResponsesTextAdapter(
      { ...rest, apiKey },
      model as NeonResponsesModel,
    )
  }
  return new NeonTextAdapter({ ...rest, apiKey }, model)
}

/**
 * Creates a Neon AI Gateway text adapter with an explicit token. Each model
 * goes to the route that serves it best:
 * - Claude: the Anthropic Messages route, through `@tanstack/ai-anthropic`.
 * - Models only Responses serves (codex, `*-pro`): the Responses route.
 * - Everything else: the Chat Completions route. `api: 'responses'` moves a
 *   Responses-capable model to the Responses route.
 *
 * `config.baseURL` is the branch host. It defaults to
 * `NEON_AI_GATEWAY_BASE_URL`.
 */
export function createNeonText<TModel extends NeonResponsesModel>(
  model: TModel,
  apiKey: string,
  config: NeonResponsesApiConfig,
): NeonResponsesTextAdapter<TModel>
export function createNeonText<TModel extends NeonChatModel>(
  model: TModel,
  apiKey: string,
  config?: NeonDefaultTextConfig<NoInfer<TModel>>,
): NeonDefaultTextAdapter<TModel>
export function createNeonText(
  model: NeonChatModel,
  apiKey: string,
  config?: AnyNeonTextConfig,
) {
  return buildNeonText(model, apiKey, config)
}

/**
 * Creates a Neon AI Gateway text adapter with the token from
 * `NEON_AI_GATEWAY_TOKEN` and the host from `NEON_AI_GATEWAY_BASE_URL`.
 * See {@link createNeonText} for how each model is routed.
 *
 * @example
 * ```ts
 * const adapter = neonText('gemini-3-8-flash')
 * ```
 */
export function neonText<TModel extends NeonResponsesModel>(
  model: TModel,
  config: NeonResponsesApiConfig,
): NeonResponsesTextAdapter<TModel>
export function neonText<TModel extends NeonChatModel>(
  model: TModel,
  config?: NeonDefaultTextConfig<NoInfer<TModel>>,
): NeonDefaultTextAdapter<TModel>
export function neonText(model: NeonChatModel, config?: AnyNeonTextConfig) {
  return buildNeonText(model, getNeonTokenFromEnv(), config)
}
