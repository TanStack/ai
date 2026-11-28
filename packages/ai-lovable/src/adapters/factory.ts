import { getLovableApiKeyFromEnv } from '../utils/client'
import { LovableTextAdapter } from './text'
import { LovableResponsesTextAdapter } from './responses-text'
import type { LovableClientConfig } from '../utils/client'
import type { LovableTextConfig } from './text'
import type { LovableResponsesTextConfig } from './responses-text'
import type { LovableModelId, ResolveProviderOptions } from '../model-meta'

export type LovableTextApi = 'responses' | 'chat' | 'chat-completions'

/** Config for the branching factory's Responses mode (default, or api: 'responses'). */
export type LovableResponsesApiConfig<
  TModel extends LovableModelId = LovableModelId,
> = Omit<
  LovableResponsesTextConfig<ResolveProviderOptions<TModel>>,
  'apiKey'
> & {
  api?: 'responses'
}

/** Config for the branching factory's Chat Completions mode (api required). */
export type LovableChatApiConfig<
  TModel extends LovableModelId = LovableModelId,
> = Omit<LovableTextConfig<ResolveProviderOptions<TModel>>, 'apiKey'> & {
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
  if (config.api === 'chat' || config.api === 'chat-completions') {
    return new LovableTextAdapter(stripApi(config), model)
  }
  return new LovableResponsesTextAdapter(stripApi(config), model)
}

export function createLovableText<TModel extends LovableModelId>(
  model: TModel,
  apiKey: string,
  config?: LovableResponsesApiConfig<TModel>,
): LovableResponsesTextAdapter<TModel>
export function createLovableText<TModel extends LovableModelId>(
  model: TModel,
  apiKey: string,
  config: LovableChatApiConfig<TModel>,
): LovableTextAdapter<TModel>
export function createLovableText<TModel extends LovableModelId>(
  model: TModel,
  apiKey: string,
  config?: LovableResponsesApiConfig<TModel> | LovableChatApiConfig<TModel>,
): AnyLovableTextAdapter<TModel> {
  return build(model, { ...config, apiKey })
}

export function lovableText<TModel extends LovableModelId>(
  model: TModel,
  config?: LovableResponsesApiConfig<TModel>,
): LovableResponsesTextAdapter<TModel>
export function lovableText<TModel extends LovableModelId>(
  model: TModel,
  config: LovableChatApiConfig<TModel>,
): LovableTextAdapter<TModel>
export function lovableText<TModel extends LovableModelId>(
  model: TModel,
  config?: LovableResponsesApiConfig<TModel> | LovableChatApiConfig<TModel>,
): AnyLovableTextAdapter<TModel> {
  return build(model, {
    ...config,
    apiKey: getLovableApiKeyFromEnv(),
  })
}
