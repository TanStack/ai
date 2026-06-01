import OpenAI from 'openai'
import {
  OpenAICompatibleChatAdapter,
  OpenAICompatibleResponsesAdapter,
} from './adapter'
import type {
  CompatibleModelInput,
  ModelNameOf,
  OpenAICompatibleConfig,
  OpenAICompatibleTextConfig,
  ResolveCompatInput,
  ResolveCompatOptions,
  ResolveCompatTools,
} from './types'

export {
  OpenAICompatibleChatAdapter,
  OpenAICompatibleResponsesAdapter,
} from './adapter'
export type {
  CompatibleApi,
  CompatibleModelInput,
  ModelNameOf,
  OpenAICompatibleConfig,
  OpenAICompatibleTextConfig,
} from './types'

const DEFAULT_NAME = 'openai-compatible'

/**
 * Configure an OpenAI-compatible provider once, then select a model per call.
 *
 * @example
 * ```ts
 * const deepseek = openaiCompatible({
 *   name: 'deepseek',
 *   baseURL: 'https://api.deepseek.com/v1',
 *   apiKey: process.env.DEEPSEEK_KEY!,
 *   models: ['deepseek-chat', 'deepseek-reasoner'],
 * })
 * chat({ adapter: deepseek('deepseek-chat'), messages })
 * ```
 */
export function openaiCompatible<
  const TModels extends ReadonlyArray<CompatibleModelInput>,
>(config: OpenAICompatibleConfig<TModels>) {
  const {
    name = DEFAULT_NAME,
    models: _models,
    api = 'chat-completions',
    ...clientOptions
  } = config
  const client = new OpenAI({
    ...clientOptions,
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  })

  return <TModelName extends ModelNameOf<TModels>>(model: TModelName) => {
    if (api === 'responses') {
      return new OpenAICompatibleResponsesAdapter<
        TModelName,
        ResolveCompatOptions<TModels, TModelName>,
        ResolveCompatInput<TModels, TModelName>,
        ResolveCompatTools<TModels, TModelName>
      >(client, model, name)
    }
    return new OpenAICompatibleChatAdapter<
      TModelName,
      ResolveCompatOptions<TModels, TModelName>,
      ResolveCompatInput<TModels, TModelName>,
      ResolveCompatTools<TModels, TModelName>
    >(client, model, name)
  }
}

/**
 * One-shot helper: build a single-model OpenAI-compatible adapter inline.
 *
 * @example
 * ```ts
 * chat({
 *   adapter: openaiCompatibleText('deepseek-chat', {
 *     baseURL: 'https://api.deepseek.com/v1',
 *     apiKey: process.env.DEEPSEEK_KEY!,
 *   }),
 *   messages,
 * })
 * ```
 */
export function openaiCompatibleText<const TModelName extends string>(
  model: TModelName,
  config: OpenAICompatibleTextConfig,
) {
  const {
    name = DEFAULT_NAME,
    api = 'chat-completions',
    ...clientOptions
  } = config
  const client = new OpenAI({
    ...clientOptions,
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  })
  if (api === 'responses') {
    return new OpenAICompatibleResponsesAdapter<TModelName>(client, model, name)
  }
  return new OpenAICompatibleChatAdapter<TModelName>(client, model, name)
}
