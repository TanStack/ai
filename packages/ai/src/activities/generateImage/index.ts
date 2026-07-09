/**
 * Image Activity
 *
 * Generates images from text prompts.
 * This is a self-contained module with implementation, types, and JSDoc.
 */

import { aiEventClient } from '@tanstack/ai-event-client'
import { streamGenerationResult } from '../stream-generation-result.js'
import {
  generationIdentityFields,
  rejectEventsOnlyReplay,
} from '../generation-run'
import { resolveDebugOption } from '../../logger/resolve'
import {
  applyGenerationResultTransforms,
  createGenerationContext,
  runGenerationError,
  runGenerationFinish,
  runGenerationStart,
  runGenerationUsage,
} from '../middleware'
import { resolveMediaPrompt } from '../../utilities/media-prompt'
import type { InternalLogger } from '../../logger/internal-logger'
import type { DebugOption } from '../../logger/types'
import type { GenerationMiddleware, GenerationRunOptions } from '../middleware'
import type { ImageAdapter } from './adapter'
import type {
  ImageGenerationResult,
  MediaPrompt,
  MediaPromptFor,
  StreamChunk,
} from '../../types'

// ===========================
// Activity Kind
// ===========================

/** The adapter kind this activity handles */
export const kind = 'image' as const

// ===========================
// Type Extraction Helpers
// ===========================

/**
 * Extract model-specific provider options from an ImageAdapter via ~types.
 * If the model has specific options defined in ModelProviderOptions (and not just via index signature),
 * use those; otherwise fall back to base provider options.
 */
export type ImageProviderOptionsForModel<TAdapter, TModel extends string> =
  TAdapter extends ImageAdapter<any, infer BaseOptions, infer ModelOptions, any>
    ? string extends keyof ModelOptions
      ? // ModelOptions is Record<string, unknown> or has index signature - use BaseOptions
        BaseOptions
      : // ModelOptions has explicit keys - check if TModel is one of them
        TModel extends keyof ModelOptions
        ? ModelOptions[TModel]
        : BaseOptions
    : object

/**
 * Extract model-specific size options from an ImageAdapter via ~types.
 * If the model has specific sizes defined, use those; otherwise fall back to string.
 */
export type ImageSizeForModel<TAdapter, TModel extends string> =
  TAdapter extends ImageAdapter<any, any, any, infer SizeByName>
    ? string extends keyof SizeByName
      ? // SizeByName has index signature - fall back to string
        string
      : // SizeByName has explicit keys - check if TModel is one of them
        TModel extends keyof SizeByName
        ? SizeByName[TModel]
        : string
    : string

/**
 * Extract the prompt type a model accepts from an ImageAdapter via ~types.
 * Adapters declare a per-model input-modality map; models in the map get a
 * `prompt` narrowed to text + their supported part types (text-only models
 * accept `string | Array<TextPart>`), so unsupported media parts fail at
 * compile time. Adapters without a map fall back to the full MediaPrompt.
 */
export type ImagePromptForModel<TAdapter, TModel extends string> =
  TAdapter extends ImageAdapter<any, any, any, any, infer ModsByName>
    ? string extends keyof ModsByName
      ? // No explicit map - accept the full union
        MediaPrompt
      : TModel extends keyof ModsByName
        ? MediaPromptFor<ModsByName[TModel][number]>
        : MediaPrompt
    : MediaPrompt

// ===========================
// Activity Options Type
// ===========================

/**
 * Options for the image activity.
 * The model is extracted from the adapter's model property.
 *
 * @template TAdapter - The image adapter type
 * @template TStream - Whether to stream the output
 */
export type ImageActivityOptions<
  TAdapter extends ImageAdapter<string, any, any, any>,
  TStream extends boolean = false,
> = {
  /** The image adapter to use (must be created with a model) */
  adapter: TAdapter & { kind: typeof kind }
  /**
   * Description of the desired image(s). Either a plain string, or — for
   * models that support image-conditioned generation — an ordered array of
   * content parts interleaving text with image inputs (image-to-image,
   * reference-guided, edit, multi-reference). Media parts may carry
   * `metadata.role` (`'reference' | 'mask' | 'control' | 'character'`) to
   * disambiguate intent. The accepted part types are narrowed per model via
   * the adapter's input-modality map.
   */
  prompt: ImagePromptForModel<TAdapter, TAdapter['model']>
  /** Number of images to generate (default: 1) */
  numberOfImages?: number
  /** Image size in WIDTHxHEIGHT format (e.g., "1024x1024") */
  size?: ImageSizeForModel<TAdapter, TAdapter['model']>
  /**
   * Whether to stream the image generation result.
   * When true, returns an AsyncIterable<StreamChunk> for streaming transport.
   * When false or not provided, returns a Promise<ImageGenerationResult>.
   *
   * @default false
   */
  stream?: TStream
  /**
   * Enable debug logging. Pass `true` to enable all categories, `false` to
   * silence everything including errors, or a `DebugConfig` object for granular
   * control and/or a custom `Logger`.
   */
  debug?: DebugOption
  /**
   * Observe-only middleware notified on start, usage, success, and error. Pass
   * `otelMiddleware()` to emit OpenTelemetry spans, or implement the
   * `GenerationMiddleware` contract for a custom backend.
   */
  middleware?: Array<GenerationMiddleware>
} & GenerationRunOptions<ImageGenerationResult> &
  ({} extends ImageProviderOptionsForModel<TAdapter, TAdapter['model']>
    ? {
        /** Provider-specific options for image generation */ modelOptions?: ImageProviderOptionsForModel<
          TAdapter,
          TAdapter['model']
        >
      }
    : {
        /** Provider-specific options for image generation */ modelOptions: ImageProviderOptionsForModel<
          TAdapter,
          TAdapter['model']
        >
      })

// ===========================
// Activity Result Type
// ===========================

/**
 * Result type for the image activity.
 * - If stream is true: AsyncIterable<StreamChunk>
 * - Otherwise: Promise<ImageGenerationResult>
 */
export type ImageActivityResult<TStream extends boolean = false> =
  TStream extends true
    ? AsyncIterable<StreamChunk>
    : Promise<ImageGenerationResult>

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// ===========================
// Activity Implementation
// ===========================

/**
 * Image activity - generates images from text prompts.
 *
 * Uses AI image generation models to create images based on natural language descriptions.
 *
 * @example Generate a single image
 * ```ts
 * import { generateImage } from '@tanstack/ai'
 * import { openaiImage } from '@tanstack/ai-openai'
 *
 * const result = await generateImage({
 *   adapter: openaiImage('dall-e-3'),
 *   prompt: 'A serene mountain landscape at sunset'
 * })
 *
 * console.log(result.images[0].url)
 * ```
 *
 * @example Generate multiple images
 * ```ts
 * const result = await generateImage({
 *   adapter: openaiImage('dall-e-2'),
 *   prompt: 'A cute robot mascot',
 *   numberOfImages: 4,
 *   size: '512x512'
 * })
 *
 * result.images.forEach((image, i) => {
 *   console.log(`Image ${i + 1}: ${image.url}`)
 * })
 * ```
 *
 * @example With provider-specific options
 * ```ts
 * const result = await generateImage({
 *   adapter: openaiImage('dall-e-3'),
 *   prompt: 'A professional headshot photo',
 *   size: '1024x1024',
 *   modelOptions: {
 *     quality: 'hd',
 *     style: 'natural'
 *   }
 * })
 * ```
 */
export function generateImage<
  TAdapter extends ImageAdapter<string, any, any, any>,
  TStream extends boolean = false,
>(
  options: ImageActivityOptions<TAdapter, TStream>,
): ImageActivityResult<TStream> {
  if (options.stream) {
    return streamGenerationResult(
      (resolvedOptions) => runGenerateImage({ ...options, ...resolvedOptions }),
      options,
    ) as ImageActivityResult<TStream>
  }

  return runGenerateImage(options) as ImageActivityResult<TStream>
}

/**
 * Internal implementation of image generation (always non-streaming).
 * Contains all devtools event emission logic.
 */
async function runGenerateImage<
  TAdapter extends ImageAdapter<string, any, any, any>,
>(
  options: ImageActivityOptions<TAdapter, boolean>,
): Promise<ImageGenerationResult> {
  rejectEventsOnlyReplay(options.replay)

  if (options.replay && 'result' in options.replay) {
    return options.replay.result as ImageGenerationResult
  }

  const {
    adapter,
    stream: _stream,
    debug: _debug,
    middleware,
    threadId,
    runId,
    replay: _replay,
    ...rest
  } = options
  const model = adapter.model
  const requestId = createId('image')
  const startTime = Date.now()
  const logger: InternalLogger = resolveDebugOption(options.debug)
  const identity = { threadId, runId }

  const mwCtx = createGenerationContext({
    requestId,
    activity: 'image',
    provider: adapter.name,
    model,
    modelOptions: rest.modelOptions,
    threadId,
    runId,
    artifactInputs: { prompt: rest.prompt },
    createId,
  })

  await runGenerationStart(middleware, mwCtx)

  // Devtools events carry the flattened prompt text plus media-part counts —
  // the wire payload stays `prompt: string` regardless of the prompt shape.
  const resolved = resolveMediaPrompt(rest.prompt)

  aiEventClient.emit('image:request:started', {
    requestId,
    ...generationIdentityFields(identity),
    provider: adapter.name,
    model,
    prompt: resolved.text,
    numberOfImages: rest.numberOfImages,
    size: rest.size,
    ...(resolved.images.length > 0 && {
      imageInputCount: resolved.images.length,
    }),
    ...(resolved.videos.length > 0 && {
      videoInputCount: resolved.videos.length,
    }),
    ...(resolved.audios.length > 0 && {
      audioInputCount: resolved.audios.length,
    }),
    modelOptions: rest.modelOptions,
    timestamp: startTime,
  })

  logger.request(`activity=generateImage provider=${adapter.name}`, {
    provider: adapter.name,
    model,
  })

  try {
    const rawResult = await adapter.generateImages({ ...rest, model, logger })
    const result = await applyGenerationResultTransforms(mwCtx, rawResult)
    const duration = Date.now() - startTime

    aiEventClient.emit('image:request:completed', {
      requestId,
      ...generationIdentityFields(identity),
      provider: adapter.name,
      model,
      // GeneratedImage is a discriminated `{ url } | { b64Json }` union, but the
      // wire shape on the devtools event is a plain optional pair. Use
      // conditional spreads so the emitted record only sets the field actually
      // present — `exactOptionalPropertyTypes` rejects `field: undefined`
      // against `field?: string` targets.
      images: result.images.map((image) => ({
        url: image.url,
        b64Json: image.b64Json,
      })),
      duration,
      modelOptions: rest.modelOptions,
      timestamp: Date.now(),
    })

    if (result.usage) {
      aiEventClient.emit('image:usage', {
        requestId,
        ...generationIdentityFields(identity),
        model,
        usage: result.usage,
        modelOptions: rest.modelOptions,
        timestamp: Date.now(),
      })
    }

    logger.output(`activity=generateImage count=${result.images.length}`, {
      count: result.images.length,
    })

    if (result.usage) await runGenerationUsage(middleware, mwCtx, result.usage)
    await runGenerationFinish(middleware, mwCtx, {
      duration,
      usage: result.usage,
    })

    return result
  } catch (error) {
    await runGenerationError(middleware, mwCtx, {
      error,
      duration: Date.now() - startTime,
    })
    logger.errors('generateImage activity failed', {
      error,
      source: 'generateImage',
    })
    throw error
  }
}

// ===========================
// Options Factory
// ===========================

/**
 * Create typed options for the generateImage() function without executing.
 */
export function createImageOptions<
  TAdapter extends ImageAdapter<string, any, any, any>,
  TStream extends boolean = false,
>(
  options: ImageActivityOptions<TAdapter, TStream>,
): ImageActivityOptions<TAdapter, TStream> {
  return options
}

// Re-export adapter types
export type {
  ImageAdapter,
  ImageAdapterConfig,
  AnyImageAdapter,
} from './adapter'
export { BaseImageAdapter } from './adapter'
