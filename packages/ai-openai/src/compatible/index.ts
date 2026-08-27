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

export function openaiCompatible<
  const TModels extends ReadonlyArray<CompatibleModelInput>,
>(config: OpenAICompatibleConfig<TModels>) {
  // `name`, `models`, and `api` are TanStack-level config; everything else
  // (incl. the required `apiKey` / `baseURL`) is OpenAI SDK ClientOptions.
  const {
    name = DEFAULT_NAME,
    models: _models,
    api = 'chat-completions',
    ...clientOptions
  } = config
  const client = new OpenAI(clientOptions)

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

export function openaiCompatibleText<const TModelName extends string>(
  model: TModelName,
  config: OpenAICompatibleTextConfig,
) {
  const {
    name = DEFAULT_NAME,
    api = 'chat-completions',
    ...clientOptions
  } = config
  const client = new OpenAI(clientOptions)
  if (api === 'responses') {
    return new OpenAICompatibleResponsesAdapter<TModelName>(client, model, name)
  }
  return new OpenAICompatibleChatAdapter<TModelName>(client, model, name)
}
