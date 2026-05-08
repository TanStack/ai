import { OpenAICompatibleImageAdapter } from '@tanstack/openai-base'
import { getOpenAIApiKeyFromEnv } from '../utils/client'
import {
  validateImageSize,
  validateNumberOfImages,
  validatePrompt,
} from '../image/image-provider-options'
import type { OpenAIImageModel } from '../model-meta'
import type {
  OpenAIImageModelProviderOptionsByName,
  OpenAIImageModelSizeByName,
  OpenAIImageProviderOptions,
} from '../image/image-provider-options'
import type { OpenAIClientConfig } from '../utils/client'

/**
 * Configuration for OpenAI image adapter
 */
export interface OpenAIImageConfig extends OpenAIClientConfig {}

/**
 * OpenAI Image Generation Adapter
 *
 * Tree-shakeable adapter for OpenAI image generation functionality.
 * Supports gpt-image-1, gpt-image-1-mini, dall-e-3, and dall-e-2 models.
 *
 * Features:
 * - Model-specific type-safe provider options
 * - Size validation per model
 * - Number of images validation
 */
export class OpenAIImageAdapter<
  TModel extends OpenAIImageModel,
> extends OpenAICompatibleImageAdapter<
  TModel,
  OpenAIImageProviderOptions,
  OpenAIImageModelProviderOptionsByName,
  OpenAIImageModelSizeByName
> {
  readonly kind = 'image' as const
  readonly name = 'openai' as const

  constructor(config: OpenAIImageConfig, model: TModel) {
    super(config, model, 'openai')
  }

  protected override validatePrompt(options: {
    prompt: string
    model: string
  }): void {
    validatePrompt(options)
  }

  protected override validateImageSize(
    model: string,
    size: string | undefined,
  ): void {
    validateImageSize(model, size)
  }

  protected override validateNumberOfImages(
    model: string,
    numberOfImages: number | undefined,
  ): void {
    validateNumberOfImages(model, numberOfImages)
  }
}

/**
 * Creates an OpenAI image adapter with explicit API key.
 * Type resolution happens here at the call site.
 *
 * @param model - The model name (e.g., 'dall-e-3', 'gpt-image-1')
 * @param apiKey - Your OpenAI API key
 * @param config - Optional additional configuration
 * @returns Configured OpenAI image adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createOpenaiImage('dall-e-3', "sk-...");
 *
 * const result = await generateImage({
 *   adapter,
 *   prompt: 'A cute baby sea otter'
 * });
 * ```
 */
export function createOpenaiImage<TModel extends OpenAIImageModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<OpenAIImageConfig, 'apiKey'>,
): OpenAIImageAdapter<TModel> {
  return new OpenAIImageAdapter({ apiKey, ...config }, model)
}

/**
 * Creates an OpenAI image adapter with automatic API key detection from environment variables.
 * Type resolution happens here at the call site.
 *
 * Looks for `OPENAI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param model - The model name (e.g., 'dall-e-3', 'gpt-image-1')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured OpenAI image adapter instance with resolved types
 * @throws Error if OPENAI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses OPENAI_API_KEY from environment
 * const adapter = openaiImage('dall-e-3');
 *
 * const result = await generateImage({
 *   adapter,
 *   prompt: 'A beautiful sunset over mountains'
 * });
 * ```
 */
export function openaiImage<TModel extends OpenAIImageModel>(
  model: TModel,
  config?: Omit<OpenAIImageConfig, 'apiKey'>,
): OpenAIImageAdapter<TModel> {
  const apiKey = getOpenAIApiKeyFromEnv()
  return createOpenaiImage(model, apiKey, config)
}
