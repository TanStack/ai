import { createOpenaiSummarize } from '@tanstack/ai-openai'
import type {
  OpenAISummarizeConfig,
  OpenAISummarizeProviderOptions,
} from '@tanstack/ai-openai'
import type { GROK_CHAT_MODELS } from '../model-meta'

const GROK_BASE_URL = 'https://api.x.ai/v1'

/**
 * Configuration for Grok summarize adapter
 */
export interface GrokSummarizeConfig extends Omit<OpenAISummarizeConfig, 'apiKey'> {
  apiKey?: string
  baseURL?: string
}

/**
 * Grok-specific provider options for summarization
 */
export type GrokSummarizeProviderOptions = OpenAISummarizeProviderOptions

/** Model type for Grok summarization */
export type GrokSummarizeModel = (typeof GROK_CHAT_MODELS)[number]

/**
 * Creates a Grok summarize adapter with explicit API key.
 * This is a thin wrapper around OpenAI's adapter with Grok's base URL.
 *
 * @param model - The model name (e.g., 'grok-3', 'grok-4')
 * @param apiKey - Your xAI API key
 * @param config - Optional additional configuration
 * @returns Configured Grok summarize adapter instance
 *
 * @example
 * ```typescript
 * const adapter = createGrokSummarize('grok-3', "xai-...");
 * ```
 */
export function createGrokSummarize<TModel extends GrokSummarizeModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<GrokSummarizeConfig, 'apiKey'>,
) {
  // Use 'as any' for model since Grok models aren't in OpenAI's type list
  // but the OpenAI-compatible API accepts any model string
  return createOpenaiSummarize(model as any, apiKey, {
    ...config,
    baseURL: config?.baseURL ?? GROK_BASE_URL,
  })
}

/**
 * Creates a Grok summarize adapter with automatic API key detection from environment variables.
 *
 * Looks for `XAI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param model - The model name (e.g., 'grok-3', 'grok-4')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Grok summarize adapter instance
 * @throws Error if XAI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses XAI_API_KEY from environment
 * const adapter = grokSummarize('grok-3');
 *
 * await summarize({
 *   adapter,
 *   text: "Long article text..."
 * });
 * ```
 */
export function grokSummarize<TModel extends GrokSummarizeModel>(
  model: TModel,
  config?: Omit<GrokSummarizeConfig, 'apiKey'>,
) {
  const apiKey = getGrokApiKeyFromEnv()
  return createGrokSummarize(model, apiKey, config)
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
      'XAI_API_KEY is required. Please set it in your environment variables or use createGrokSummarize with an explicit API key.',
    )
  }

  return key
}
