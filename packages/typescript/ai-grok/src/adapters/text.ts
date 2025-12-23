import { createOpenaiChat } from '@tanstack/ai-openai'
import type { OpenAITextConfig } from '@tanstack/ai-openai'
import type { GROK_CHAT_MODELS } from '../model-meta'

const GROK_BASE_URL = 'https://api.x.ai/v1'

/**
 * Configuration for Grok text adapter
 */
export interface GrokTextConfig extends Omit<OpenAITextConfig, 'apiKey'> {
  apiKey?: string
  baseURL?: string
}

/**
 * Alias for TextProviderOptions for external use
 */
export type { OpenAITextProviderOptions as GrokTextProviderOptions } from '@tanstack/ai-openai'

/**
 * Creates a Grok text adapter with explicit API key.
 * This is a thin wrapper around OpenAI's adapter with Grok's base URL.
 *
 * @param model - The model name (e.g., 'grok-3', 'grok-4')
 * @param apiKey - Your xAI API key
 * @param config - Optional additional configuration
 * @returns Configured Grok text adapter instance
 *
 * @example
 * ```typescript
 * const adapter = createGrokText('grok-3', "xai-...");
 * ```
 */
export function createGrokText<
  TModel extends (typeof GROK_CHAT_MODELS)[number],
>(model: TModel, apiKey: string, config?: Omit<GrokTextConfig, 'apiKey'>) {
  // Use 'as any' for model since Grok models aren't in OpenAI's type list
  // but the OpenAI-compatible API accepts any model string
  return createOpenaiChat(model as any, apiKey, {
    ...config,
    baseURL: config?.baseURL ?? GROK_BASE_URL,
  })
}

/**
 * Creates a Grok text adapter with automatic API key detection from environment variables.
 *
 * Looks for `XAI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param model - The model name (e.g., 'grok-3', 'grok-4')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Grok text adapter instance
 * @throws Error if XAI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses XAI_API_KEY from environment
 * const adapter = grokText('grok-3');
 *
 * const stream = chat({
 *   adapter,
 *   messages: [{ role: "user", content: "Hello!" }]
 * });
 * ```
 */
export function grokText<TModel extends (typeof GROK_CHAT_MODELS)[number]>(
  model: TModel,
  config?: Omit<GrokTextConfig, 'apiKey'>,
) {
  const apiKey = getGrokApiKeyFromEnv()
  return createGrokText(model, apiKey, config)
}

/**
 * Gets Grok API key from environment variables
 * @throws Error if XAI_API_KEY is not found
 */
function getGrokApiKeyFromEnv(): string {
  const env =
    typeof globalThis !== 'undefined' && (globalThis as any).window?.env
      ? (globalThis as any).window.env
      : typeof process !== 'undefined'
        ? process.env
        : undefined
  const key = env?.XAI_API_KEY

  if (!key) {
    throw new Error(
      'XAI_API_KEY is required. Please set it in your environment variables or use createGrokText with an explicit API key.',
    )
  }

  return key
}
