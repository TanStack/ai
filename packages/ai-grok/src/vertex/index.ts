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
import type {
  GrokVertexChatModel,
  ResolveInputModalities,
  ResolveProviderOptions,
} from '../model-meta'
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

const VERTEX_UNSUPPORTED_GROK_SERVER_TOOLS = new Set([
  'web_search',
  'x_search',
  'file_search',
  'mcp',
])

class GrokVertexTextAdapter<
  TModel extends GrokVertexChatModel,
> extends GrokTextAdapter<
  TModel,
  ResolveProviderOptions<TModel>,
  ResolveInputModalities<TModel>,
  readonly []
> {
  protected override mapOptionsToRequest(
    options: TextOptions<ResolveProviderOptions<TModel>>,
  ): Omit<ResponseCreateParams, 'stream'> {
    const request = super.mapOptionsToRequest(options)
    const tools = request.tools
    if (tools !== undefined) {
      for (const tool of tools) {
        if (tool === null) continue
        if (typeof tool !== 'object') continue
        if (!('type' in tool)) continue
        if (VERTEX_UNSUPPORTED_GROK_SERVER_TOOLS.has(String(tool.type))) {
          throw new Error(
            'Grok Vertex does not support xAI server tools (web_search, x_search, file_search, mcp). Use a function tool.',
          )
        }
      }
    }
    return {
      ...request,
      model: toVertexGrokModelId(this.model),
    }
  }
}

export function grokVertexText<TModel extends GrokVertexChatModel>(
  model: TModel,
  config: GrokVertexConfig = {},
): GrokTextAdapter<
  TModel,
  ResolveProviderOptions<TModel>,
  ResolveInputModalities<TModel>,
  readonly []
> {
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
          const defaultHeaders = Object.entries(config.defaultHeaders)
          for (const [key, value] of defaultHeaders) {
            headers.set(key, value)
          }
        }
        return fetch(input, { ...init, headers })
      },
    },
    model,
  )
}

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
