import { AnthropicVertex } from '@anthropic-ai/vertex-sdk'
import { AnthropicTextAdapter } from '../adapters/text'
import { resolveAnthropicVertexOptions } from './auth'
import type { AnthropicTextAdapterFor } from '../adapters/text'
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

/**
 * Creates an Anthropic chat adapter that talks to Claude on Vertex AI.
 *
 * Install `@anthropic-ai/vertex-sdk` next to `@tanstack/ai-anthropic`.
 */
export function anthropicVertexText<
  TModel extends AnthropicVertexChatModel | (string & {}),
  TConfig extends AnthropicVertexConfig = AnthropicVertexConfig,
>(model: TModel, config?: TConfig): AnthropicTextAdapterFor<TModel, TConfig> {
  const client = new AnthropicVertex(resolveAnthropicVertexOptions(config))
  return new AnthropicTextAdapter(
    { client, provider: 'google-vertex', reasoning: config?.reasoning },
    model,
  )
}
