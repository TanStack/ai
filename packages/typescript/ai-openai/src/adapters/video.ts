import { OpenAICompatibleVideoAdapter } from '@tanstack/openai-compatible'
import { getOpenAIApiKeyFromEnv } from '../utils/client'
import {
  toApiSeconds,
  validateVideoSeconds,
  validateVideoSize,
} from '../video/video-provider-options'
import type { VideoModel } from 'openai/resources'
import type { OpenAIVideoModel } from '../model-meta'
import type {
  OpenAIVideoModelProviderOptionsByName,
  OpenAIVideoModelSizeByName,
  OpenAIVideoProviderOptions,
} from '../video/video-provider-options'
import type { VideoGenerationOptions } from '@tanstack/ai'
import type OpenAI_SDK from 'openai'
import type { OpenAIClientConfig } from '../utils/client'

/**
 * Configuration for OpenAI video adapter.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export interface OpenAIVideoConfig extends OpenAIClientConfig {}

/**
 * OpenAI Video Generation Adapter
 *
 * Tree-shakeable adapter for OpenAI video generation functionality using Sora-2.
 * Uses a jobs/polling architecture for async video generation.
 *
 * @experimental Video generation is an experimental feature and may change.
 *
 * Features:
 * - Async job-based video generation
 * - Status polling for job progress
 * - URL retrieval for completed videos
 * - Model-specific type-safe provider options
 */
export class OpenAIVideoAdapter<
  TModel extends OpenAIVideoModel,
> extends OpenAICompatibleVideoAdapter<
  TModel,
  OpenAIVideoProviderOptions,
  OpenAIVideoModelProviderOptionsByName,
  OpenAIVideoModelSizeByName
> {
  readonly name = 'openai' as const

  constructor(config: OpenAIVideoConfig, model: TModel) {
    super(config, model, 'openai')
  }

  protected override validateVideoSize(model: string, size?: string): void {
    validateVideoSize(model, size)
  }

  protected override validateVideoSeconds(
    model: string,
    seconds?: number | string,
  ): void {
    validateVideoSeconds(model, seconds)
  }

  protected override buildRequest(
    options: VideoGenerationOptions<OpenAIVideoProviderOptions>,
  ): OpenAI_SDK.Videos.VideoCreateParams {
    const { model, prompt, size, duration, modelOptions } = options

    const request: OpenAI_SDK.Videos.VideoCreateParams = {
      model: model as VideoModel,
      prompt,
    }

    // Add size/resolution
    // Supported: '1280x720', '720x1280', '1792x1024', '1024x1792'
    if (size) {
      request.size = size as OpenAI_SDK.Videos.VideoCreateParams['size']
    } else if (modelOptions?.size) {
      request.size = modelOptions.size
    }

    // Add seconds (duration)
    // Supported: '4', '8', or '12' - yes, the API wants strings
    const seconds = duration ?? modelOptions?.seconds
    if (seconds !== undefined) {
      request.seconds = toApiSeconds(seconds)
    }

    return request
  }
}

/**
 * Creates an OpenAI video adapter with an explicit API key.
 * Type resolution happens here at the call site.
 *
 * @experimental Video generation is an experimental feature and may change.
 *
 * @param model - The model name (e.g., 'sora-2')
 * @param apiKey - Your OpenAI API key
 * @param config - Optional additional configuration
 * @returns Configured OpenAI video adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createOpenaiVideo('sora-2', 'your-api-key');
 *
 * const { jobId } = await generateVideo({
 *   adapter,
 *   prompt: 'A beautiful sunset over the ocean'
 * });
 * ```
 */
export function createOpenaiVideo<TModel extends OpenAIVideoModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<OpenAIVideoConfig, 'apiKey'>,
): OpenAIVideoAdapter<TModel> {
  return new OpenAIVideoAdapter({ apiKey, ...config }, model)
}

/**
 * Creates an OpenAI video adapter with automatic API key detection from environment variables.
 * Type resolution happens here at the call site.
 *
 * Looks for `OPENAI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @experimental Video generation is an experimental feature and may change.
 *
 * @param model - The model name (e.g., 'sora-2')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured OpenAI video adapter instance with resolved types
 * @throws Error if OPENAI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses OPENAI_API_KEY from environment
 * const adapter = openaiVideo('sora-2');
 *
 * // Create a video generation job
 * const { jobId } = await generateVideo({
 *   adapter,
 *   prompt: 'A cat playing piano'
 * });
 *
 * // Poll for status
 * const status = await getVideoJobStatus({
 *   adapter,
 *   jobId
 * });
 * ```
 */
export function openaiVideo<TModel extends OpenAIVideoModel>(
  model: TModel,
  config?: Omit<OpenAIVideoConfig, 'apiKey'>,
): OpenAIVideoAdapter<TModel> {
  const apiKey = getOpenAIApiKeyFromEnv()
  return createOpenaiVideo(model, apiKey, config)
}
