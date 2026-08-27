import { getLovableApiKeyFromEnv } from '../utils/client'
import { LovableTextAdapter } from './text'
import { LovableResponsesTextAdapter } from './responses-text'
import type { LovableClientConfig } from '../utils/client'
import type { LovableTextConfig } from './text'
import type { LovableResponsesTextConfig } from './responses-text'
import type { LovableModelId } from '../model-meta'

export type LovableTextApi = 'responses' | 'chat' | 'chat-completions'

/** Config for the branching factory's Responses mode (default, or api: 'responses'). */
export type LovableResponsesApiConfig = Omit<
  LovableResponsesTextConfig,
  'apiKey'
> & {
  api?: 'responses'
}

/** Config for the branching factory's Chat Completions mode (api required). */
export type LovableChatApiConfig = Omit<LovableTextConfig, 'apiKey'> & {
  api: 'chat' | 'chat-completions'
}

type AnyLovableTextAdapter<TModel extends LovableModelId> =
  | LovableResponsesTextAdapter<TModel>
  | LovableTextAdapter<TModel>

function stripApi<T extends { api?: unknown }>(config: T): Omit<T, 'api'> {
  const { api, ...rest } = config
  void api
  return rest
}

function build<TModel extends LovableModelId>(
  model: TModel,
  config: LovableClientConfig & { api?: LovableTextApi },
): AnyLovableTextAdapter<TModel> {
  if (config.api === 'chat') {
    return new LovableTextAdapter(stripApi(config), model)
  }
  if (config.api === 'chat-completions') {
    return new LovableTextAdapter(stripApi(config), model)
  }
  return new LovableResponsesTextAdapter(stripApi(config), model)
}

export function createLovableText<TModel extends LovableModelId>(
  model: TModel,
  apiKey: string,
  config?: LovableResponsesApiConfig,
): LovableResponsesTextAdapter<TModel>
export function createLovableText<TModel extends LovableModelId>(
  model: TModel,
  apiKey: string,
  config: LovableChatApiConfig,
): LovableTextAdapter<TModel>
export function createLovableText<TModel extends LovableModelId>(
  model: TModel,
  apiKey: string,
  config?: LovableResponsesApiConfig | LovableChatApiConfig,
): AnyLovableTextAdapter<TModel> {
  return build(model, { ...config, apiKey })
}

export function lovableText<TModel extends LovableModelId>(
  model: TModel,
  config?: LovableResponsesApiConfig,
): LovableResponsesTextAdapter<TModel>
export function lovableText<TModel extends LovableModelId>(
  model: TModel,
  config: LovableChatApiConfig,
): LovableTextAdapter<TModel>
export function lovableText<TModel extends LovableModelId>(
  model: TModel,
  config?: LovableResponsesApiConfig | LovableChatApiConfig,
): AnyLovableTextAdapter<TModel> {
  return build(model, {
    ...config,
    apiKey: getLovableApiKeyFromEnv(),
  })
}
