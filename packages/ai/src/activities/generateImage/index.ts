import { aiEventClient } from '@tanstack/ai-event-client'
import { streamGenerationResult } from '../stream-generation-result.js'
import { resolveDebugOption } from '../../logger/resolve'
import {
  applyGenerationResultTransforms,
  createGenerationContext,
  runGenerationAbort,
  runGenerationError,
  runGenerationFinish,
  runGenerationStart,
  runGenerationUsage,
} from '../middleware/run'
import {
  abortReasonMessage,
  createActivityAbortControls,
  isActivityAbortError,
  raceWithAbort,
} from '../../utilities/activity-abort'
import { resolveMediaPrompt } from '../../utilities/media-prompt'
import type { InternalLogger } from '../../logger/internal-logger'
import type { DebugOption } from '../../logger/types'
import type { GenerationMiddleware } from '../middleware/types'
import type { ImageAdapter } from './adapter'
import type {
  ImageGenerationResult,
  MediaPrompt,
  MediaPromptFor,
  StreamChunk,
} from '../../types'

/** The adapter kind this activity handles */
export const kind = 'image' as const

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

export type ImagePromptForModel<TAdapter, TModel extends string> =
  TAdapter extends ImageAdapter<any, any, any, any, infer ModsByName>
    ? string extends keyof ModsByName
      ? // No explicit map - accept the full union
        MediaPrompt
      : TModel extends keyof ModsByName
        ? MediaPromptFor<ModsByName[TModel][number]>
        : MediaPrompt
    : MediaPrompt

export type ImageActivityOptions<
  TAdapter extends ImageAdapter<string, any, any, any>,
  TStream extends boolean = false,
> = {
  /** The image adapter to use (must be created with a model) */
  adapter: TAdapter & { kind: typeof kind }
  prompt: ImagePromptForModel<TAdapter, TAdapter['model']>
  /** Number of images to generate (default: 1) */
  numberOfImages?: number
  /** Image size in WIDTHxHEIGHT format (e.g., "1024x1024") */
  size?: ImageSizeForModel<TAdapter, TAdapter['model']>
  stream?: TStream
  debug?: DebugOption
  middleware?: Array<GenerationMiddleware>
  /** Stable conversation/thread id for correlating this run when persisted. */
  threadId?: string
  /** Stable run id for correlating this run when persisted. */
  runId?: string
  timeout?: number
  abortSignal?: AbortSignal
} & ({} extends ImageProviderOptionsForModel<TAdapter, TAdapter['model']>
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

export type ImageActivityResult<TStream extends boolean = false> =
  TStream extends true
    ? AsyncIterable<StreamChunk>
    : Promise<ImageGenerationResult>

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function generateImage<
  TAdapter extends ImageAdapter<string, any, any, any>,
  TStream extends boolean = false,
>(
  options: ImageActivityOptions<TAdapter, TStream>,
): ImageActivityResult<TStream> {
  if (options.stream) {
    return streamGenerationResult(
      (resolved) => runGenerateImage({ ...options, runId: resolved.runId }),
      options,
    ) as ImageActivityResult<TStream>
  }

  return runGenerateImage(options) as ImageActivityResult<TStream>
}

async function runGenerateImage<
  TAdapter extends ImageAdapter<string, any, any, any>,
>(
  options: ImageActivityOptions<TAdapter, boolean>,
): Promise<ImageGenerationResult> {
  const {
    adapter,
    stream: _stream,
    debug: _debug,
    middleware,
    threadId,
    runId,
    timeout,
    abortSignal: callerAbortSignal,
    ...rest
  } = options
  const model = adapter.model
  const requestId = createId('image')
  const startTime = Date.now()
  const logger: InternalLogger = resolveDebugOption(options.debug)
  const abortControls = createActivityAbortControls({
    timeout,
    abortSignal: callerAbortSignal,
  })

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
    const rawResult = await raceWithAbort(
      adapter.generateImages({
        ...rest,
        model,
        logger,
        ...(abortControls.signal ? { abortSignal: abortControls.signal } : {}),
      }),
      abortControls.signal,
    )
    abortControls.clear()
    const result = await applyGenerationResultTransforms(mwCtx, rawResult)
    const duration = Date.now() - startTime

    aiEventClient.emit('image:request:completed', {
      requestId,
      provider: adapter.name,
      model,
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
    abortControls.clear()
    const duration = Date.now() - startTime
    if (isActivityAbortError(error, abortControls.signal)) {
      await runGenerationAbort(middleware, mwCtx, {
        reason: abortReasonMessage(error, abortControls.signal),
        duration,
      })
    } else {
      await runGenerationError(middleware, mwCtx, {
        error,
        duration,
      })
    }
    logger.errors('generateImage activity failed', {
      error,
      source: 'generateImage',
    })
    throw error
  }
}

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
