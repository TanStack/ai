import { ChatStreamSummarizeAdapter } from '@tanstack/ai/adapters'
import { GrokTextAdapter } from '../adapters/text'
import {
  resolveGrokVertexAccessToken,
  resolveGrokVertexBaseURL,
  toVertexGrokModelId,
} from './auth'
import type { TextOptions } from '@tanstack/ai'
import type { InferTextProviderOptions } from '@tanstack/ai/adapters'
import type { ResponseCreateParams } from 'openai/resources/responses/responses'
import type { GrokVertexChatModel, ResolveProviderOptions } from '../model-meta'
import type { GrokVertexConfig } from './auth'

export {
  GrokVertexAuthError,
  resolveGrokVertexAccessToken,
  resolveGrokVertexBaseURL,
  resolveGrokVertexLocation,
  resolveGrokVertexProject,
  toVertexGrokModelId,
  type GrokVertexConfig,
  type VertexAuthClient,
} from './auth'
export {
  GROK_VERTEX_CHAT_MODELS,
  type GrokVertexChatModel,
} from '../model-meta'

class GrokVertexTextAdapter<
  TModel extends GrokVertexChatModel,
> extends GrokTextAdapter<TModel> {
  protected override mapOptionsToRequest(
    options: TextOptions<ResolveProviderOptions<TModel>>,
  ): Omit<ResponseCreateParams, 'stream'> {
    const request = super.mapOptionsToRequest(options)
    return {
      ...request,
      model: toVertexGrokModelId(this.model),
    }
  }
}

/**
 * Creates a Grok chat adapter that talks to xAI Grok on Vertex AI.
 *
 * Install `google-auth-library` next to `@tanstack/ai-grok` for Application
 * Default Credentials. Or pass `authClient` or `getAccessToken`.
 */
export function grokVertexText<TModel extends GrokVertexChatModel>(
  model: TModel,
  config: GrokVertexConfig = {},
): GrokTextAdapter<TModel> {
  const baseURL = resolveGrokVertexBaseURL(config)

  return new GrokVertexTextAdapter(
    {
      apiKey: 'vertex',
      baseURL,
      defaultHeaders: config.defaultHeaders,
      fetch: async (input, init) => {
        const token = await resolveGrokVertexAccessToken(config)
        const headers = new Headers(init?.headers)
        headers.set('Authorization', `Bearer ${token}`)
        if (config.defaultHeaders) {
          for (const [key, value] of Object.entries(config.defaultHeaders)) {
            headers.set(key, value)
          }
        }
        return fetch(input, { ...init, headers })
      },
    },
    model,
  )
}

/**
 * Creates a Grok summarize adapter that talks to xAI Grok on Vertex AI.
 */
export function grokVertexSummarize<TModel extends GrokVertexChatModel>(
  model: TModel,
  config: GrokVertexConfig = {},
): ChatStreamSummarizeAdapter<
  TModel,
  InferTextProviderOptions<GrokTextAdapter<TModel>>
> {
  return new ChatStreamSummarizeAdapter(
    grokVertexText(model, config),
    model,
    'grok',
  )
}
