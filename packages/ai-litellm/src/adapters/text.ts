import OpenAI from 'openai'
import { OpenAIBaseChatCompletionsTextAdapter } from '@tanstack/openai-base'
import { getLiteLLMApiKeyFromEnv, withLiteLLMDefaults } from '../utils/client'
import type { LiteLLMClientConfig } from '../utils'

/**
 * Configuration for the LiteLLM text adapter.
 */
export interface LiteLLMTextConfig extends LiteLLMClientConfig {}

/**
 * LiteLLM Text (Chat) Adapter
 *
 * Tree-shakeable adapter for LiteLLM AI gateway. LiteLLM exposes an
 * OpenAI-compatible Chat Completions endpoint, so we drive it with the
 * OpenAI SDK via a baseURL override (the same pattern as ai-groq and
 * ai-grok).
 *
 * LiteLLM supports 100+ providers (OpenAI, Anthropic, Google, Azure,
 * AWS Bedrock, Ollama, Groq, Mistral, and more) through a single proxy.
 * The model string determines the provider routing, e.g.
 * "anthropic/claude-sonnet-4-6" or "openai/gpt-4o".
 */
export class LiteLLMTextAdapter extends OpenAIBaseChatCompletionsTextAdapter<
  string,
  Record<string, any>,
  readonly [],
  Record<string, never>,
  readonly []
> {
  override readonly kind = 'text' as const
  override readonly name = 'litellm' as const

  constructor(config: LiteLLMTextConfig, model: string) {
    super(model, 'litellm', new OpenAI(withLiteLLMDefaults(config)))
  }
}

/**
 * Creates a LiteLLM text adapter with explicit API key.
 *
 * @example
 * ```typescript
 * const adapter = createLitellmText('anthropic/claude-sonnet-4-6', 'sk-...');
 * ```
 */
export function createLitellmText(
  model: string,
  apiKey: string,
  config?: Omit<LiteLLMTextConfig, 'apiKey'>,
): LiteLLMTextAdapter {
  return new LiteLLMTextAdapter({ apiKey, ...config }, model)
}

/**
 * Creates a LiteLLM text adapter with API key from `LITELLM_API_KEY`.
 *
 * @example
 * ```typescript
 * const adapter = litellmText('anthropic/claude-sonnet-4-6');
 * ```
 */
export function litellmText(
  model: string,
  config?: Omit<LiteLLMTextConfig, 'apiKey'>,
): LiteLLMTextAdapter {
  const apiKey = getLiteLLMApiKeyFromEnv()
  return createLitellmText(model, apiKey, config)
}
