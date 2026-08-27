import { AnthropicVertex } from '@anthropic-ai/vertex-sdk'
import { createAnthropicChatWithClient } from '../adapters/text'
import { resolveAnthropicVertexOptions } from './auth'
import type { AnthropicTextAdapter } from '../adapters/text'
import type { AnthropicVertexChatModel } from '../model-meta'
import type { AnthropicVertexConfig } from './auth'

export {
  AnthropicVertexAuthError,
  resolveAnthropicVertexOptions,
  type AnthropicVertexConfig,
} from './auth'
export {
  ANTHROPIC_VERTEX_CHAT_MODELS,
  type AnthropicVertexChatModel,
} from '../model-meta'

export function anthropicVertexText<TModel extends AnthropicVertexChatModel>(
  model: TModel,
  config: AnthropicVertexConfig = {},
): AnthropicTextAdapter<TModel> {
  const client = new AnthropicVertex(resolveAnthropicVertexOptions(config))
  return createAnthropicChatWithClient(model, client)
}
