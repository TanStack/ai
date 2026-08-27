import { MistralTextAdapter } from '../adapters/text'
import {
  resolveMistralVertexAccessToken,
  resolveMistralVertexModelUrl,
} from './auth'
import type { MistralVertexChatModel } from '../model-meta'
import type { MistralVertexConfig } from './auth'

export {
  MistralVertexAuthError,
  resolveMistralVertexAccessToken,
  resolveMistralVertexLocation,
  resolveMistralVertexModelUrl,
  resolveMistralVertexProject,
  type MistralVertexConfig,
  type VertexAuthClient,
} from './auth'
export {
  MISTRAL_VERTEX_CHAT_MODELS,
  type MistralVertexChatModel,
} from '../model-meta'

export function mistralVertexText<TModel extends MistralVertexChatModel>(
  model: TModel,
  config: MistralVertexConfig = {},
): MistralTextAdapter<TModel> {
  const resolveRequestUrl =
    config.resolveRequestUrl ??
    ((stream: boolean) => {
      const modelUrl = resolveMistralVertexModelUrl(model, config)
      return `${modelUrl}:${stream ? 'streamRawPredict' : 'rawPredict'}`
    })

  return new MistralTextAdapter(
    {
      apiKey: 'vertex',
      getAccessToken: () => resolveMistralVertexAccessToken(config),
      resolveRequestUrl,
      requestModel: model,
      defaultHeaders: config.defaultHeaders,
    },
    model,
  )
}
