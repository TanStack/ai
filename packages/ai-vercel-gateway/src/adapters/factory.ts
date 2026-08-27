import { getVercelGatewayApiKeyFromEnv } from '../utils/client'
import { VercelGatewayTextAdapter } from './text'
import { VercelGatewayResponsesTextAdapter } from './responses-text'
import type { VercelGatewayClientConfig } from '../utils/client'
import type { VercelGatewayTextConfig } from './text'
import type { VercelGatewayResponsesTextConfig } from './responses-text'
import type { VercelGatewayChatModel } from '../model-meta'

export type VercelGatewayTextApi = 'responses' | 'chat' | 'chat-completions'

/** Config for the branching factory's Responses mode (default, or api: 'responses'). */
export type VercelGatewayResponsesApiConfig = Omit<
  VercelGatewayResponsesTextConfig,
  'apiKey'
> & {
  api?: 'responses'
}

/** Config for the branching factory's Chat Completions mode (api required). */
export type VercelGatewayChatApiConfig = Omit<
  VercelGatewayTextConfig,
  'apiKey'
> & {
  api: 'chat' | 'chat-completions'
}

type AnyVercelGatewayTextAdapter<TModel extends VercelGatewayChatModel> =
  | VercelGatewayResponsesTextAdapter<TModel>
  | VercelGatewayTextAdapter<TModel>

function stripApi<T extends { api?: unknown }>(config: T): Omit<T, 'api'> {
  const { api, ...rest } = config
  void api
  return rest
}

function build<TModel extends VercelGatewayChatModel>(
  model: TModel,
  config: VercelGatewayClientConfig & { api?: VercelGatewayTextApi },
): AnyVercelGatewayTextAdapter<TModel> {
  if (config.api === 'chat') {
    return new VercelGatewayTextAdapter(stripApi(config), model)
  }
  if (config.api === 'chat-completions') {
    return new VercelGatewayTextAdapter(stripApi(config), model)
  }
  return new VercelGatewayResponsesTextAdapter(stripApi(config), model)
}

export function createVercelGatewayText<TModel extends VercelGatewayChatModel>(
  model: TModel,
  apiKey: string,
  config?: VercelGatewayResponsesApiConfig,
): VercelGatewayResponsesTextAdapter<TModel>
export function createVercelGatewayText<TModel extends VercelGatewayChatModel>(
  model: TModel,
  apiKey: string,
  config: VercelGatewayChatApiConfig,
): VercelGatewayTextAdapter<TModel>
export function createVercelGatewayText<TModel extends VercelGatewayChatModel>(
  model: TModel,
  apiKey: string,
  config?: VercelGatewayResponsesApiConfig | VercelGatewayChatApiConfig,
): AnyVercelGatewayTextAdapter<TModel> {
  return build(model, { ...config, apiKey })
}

export function vercelGatewayText<TModel extends VercelGatewayChatModel>(
  model: TModel,
  config?: VercelGatewayResponsesApiConfig,
): VercelGatewayResponsesTextAdapter<TModel>
export function vercelGatewayText<TModel extends VercelGatewayChatModel>(
  model: TModel,
  config: VercelGatewayChatApiConfig,
): VercelGatewayTextAdapter<TModel>
export function vercelGatewayText<TModel extends VercelGatewayChatModel>(
  model: TModel,
  config?: VercelGatewayResponsesApiConfig | VercelGatewayChatApiConfig,
): AnyVercelGatewayTextAdapter<TModel> {
  return build(model, {
    ...config,
    apiKey: getVercelGatewayApiKeyFromEnv(),
  })
}
