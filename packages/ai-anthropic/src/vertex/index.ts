import { AnthropicVertex } from '@anthropic-ai/vertex-sdk'
import { createAnthropicChatWithClient } from '../adapters/text'
import { resolveAnthropicVertexOptions } from './auth'
import type { AnthropicTextAdapter } from '../adapters/text'
import type { AnthropicChatModel } from '../model-meta'
import type { AnthropicVertexConfig } from './auth'

export {
  AnthropicVertexAuthError,
  resolveAnthropicVertexOptions,
  type AnthropicVertexConfig,
} from './auth'

/**
 * Creates an Anthropic chat adapter that talks to Claude on Vertex AI.
 *
 * Install `@anthropic-ai/vertex-sdk` next to `@tanstack/ai-anthropic`.
 */
export function anthropicVertexText<TModel extends AnthropicChatModel>(
  model: TModel,
  config: AnthropicVertexConfig = {},
): AnthropicTextAdapter<TModel> {
  const client = new AnthropicVertex(resolveAnthropicVertexOptions(config))
  return createAnthropicChatWithClient(model, client)
}
