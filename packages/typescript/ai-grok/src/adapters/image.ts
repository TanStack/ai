import { createOpenaiImage } from '@tanstack/ai-openai'
import type { OpenAIImageConfig } from '@tanstack/ai-openai'
import type { GROK_IMAGE_MODELS } from '../model-meta'

const GROK_BASE_URL = 'https://api.x.ai/v1'

/**
 * Configuration for Grok image adapter
 */
export interface GrokImageConfig extends Omit<OpenAIImageConfig, 'apiKey'> {
  apiKey?: string
  baseURL?: string
}

/** Model type for Grok Image */
export type GrokImageModel = (typeof GROK_IMAGE_MODELS)[number]

/**
 * Alias for ImageProviderOptions for external use
 */
export type { OpenAIImageProviderOptions as GrokImageProviderOptions } from '@tanstack/ai-openai'

/**
 * Creates a Grok image adapter with explicit API key.
 * This is a thin wrapper around OpenAI's adapter with Grok's base URL.
 *
 * @param model - The model name (e.g., 'grok-2-image-1212')
 * @param apiKey - Your xAI API key
 * @param config - Optional additional configuration
 * @returns Configured Grok image adapter instance
 *
 * @example
 * ```typescript
 * const adapter = createGrokImage('grok-2-image-1212', "xai-...");
 *
 * const result = await generateImage({
 *   adapter,
 *   prompt: 'A cute baby sea otter'
 * });
 * ```
 */
export function createGrokImage<TModel extends GrokImageModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<GrokImageConfig, 'apiKey'>,
) {
  // Use 'as any' for model since Grok models aren't in OpenAI's type list
  // but the OpenAI-compatible API accepts any model string
  return createOpenaiImage(model as any, apiKey, {
    ...config,
    baseURL: config?.baseURL ?? GROK_BASE_URL,
  })
}

/**
 * Creates a Grok image adapter with automatic API key detection from environment variables.
 *
 * Looks for `XAI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param model - The model name (e.g., 'grok-2-image-1212')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Grok image adapter instance
 * @throws Error if XAI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses XAI_API_KEY from environment
 * const adapter = grokImage('grok-2-image-1212');
 *
 * const result = await generateImage({
 *   adapter,
 *   prompt: 'A beautiful sunset over mountains'
 * });
 * ```
 */
export function grokImage<TModel extends GrokImageModel>(
  model: TModel,
  config?: Omit<GrokImageConfig, 'apiKey'>,
) {
  const apiKey = getGrokApiKeyFromEnv()
  return createGrokImage(model, apiKey, config)
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
      'XAI_API_KEY is required. Please set it in your environment variables or use createGrokImage with an explicit API key.',
    )
  }

  return key
}
