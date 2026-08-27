import { aiEventClient } from '@tanstack/ai-event-client'
import { resolveDebugOption } from '../../logger/resolve'
import {
  createGenerationContext,
  runGenerationError,
  runGenerationFinish,
  runGenerationStart,
  runGenerationUsage,
} from '../middleware/run'
import { countEmbeddingInputModalities } from '../../utilities/embedding-input'
import type { InternalLogger } from '../../logger/internal-logger'
import type { DebugOption } from '../../logger/types'
import type { GenerationMiddleware } from '../middleware/types'
import type { EmbeddingAdapter } from './adapter'
import type {
  EmbeddingInputItem,
  EmbeddingInputItemFor,
  EmbeddingResult,
} from '../../types'

/** The adapter kind this activity handles */
export const kind = 'embedding' as const

export type EmbedProviderOptionsForModel<TAdapter, TModel extends string> =
  TAdapter extends EmbeddingAdapter<
    any,
    infer BaseOptions,
    infer ModelOptions,
    any
  >
    ? string extends keyof ModelOptions
      ? // ModelOptions is Record<string, unknown> or has index signature - use BaseOptions
        BaseOptions
      : // ModelOptions has explicit keys - check if TModel is one of them
        TModel extends keyof ModelOptions
        ? ModelOptions[TModel]
        : BaseOptions
    : object

export type EmbeddingInputForModel<TAdapter, TModel extends string> =
  TAdapter extends EmbeddingAdapter<any, any, any, infer ModsByName>
    ? string extends keyof ModsByName
      ? // No explicit map - accept the full union
          EmbeddingInputItem | Array<EmbeddingInputItem>
      : TModel extends keyof ModsByName
        ?
            | EmbeddingInputItemFor<ModsByName[TModel][number]>
            | Array<EmbeddingInputItemFor<ModsByName[TModel][number]>>
        : EmbeddingInputItem | Array<EmbeddingInputItem>
    : EmbeddingInputItem | Array<EmbeddingInputItem>

export type EmbedOptions<
  TAdapter extends EmbeddingAdapter<string, any, any, any>,
> = {
  /** The embedding adapter to use (must be created with a model) */
  adapter: TAdapter & { kind: typeof kind }
  input: EmbeddingInputForModel<TAdapter, TAdapter['model']>
  dimensions?: number
  debug?: DebugOption
  middleware?: Array<GenerationMiddleware>
} & ({} extends EmbedProviderOptionsForModel<TAdapter, TAdapter['model']>
  ? {
      /** Provider-specific options for embedding generation */ modelOptions?: EmbedProviderOptionsForModel<
        TAdapter,
        TAdapter['model']
      >
    }
  : {
      /** Provider-specific options for embedding generation */ modelOptions: EmbedProviderOptionsForModel<
        TAdapter,
        TAdapter['model']
      >
    })

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export async function embed<
  TAdapter extends EmbeddingAdapter<string, any, any, any>,
>(options: EmbedOptions<TAdapter>): Promise<EmbeddingResult> {
  const { adapter, middleware } = options
  const model = adapter.model
  const requestId = createId('embedding')
  const startTime = Date.now()
  const logger: InternalLogger = resolveDebugOption(options.debug)
  const modelOptions = (options as { modelOptions?: Record<string, unknown> })
    .modelOptions

  // Normalize once: adapters always receive an array of items.
  const inputItems: Array<EmbeddingInputItem> = Array.isArray(options.input)
    ? options.input
    : [options.input]
  const { textInputCount, imageInputCount } =
    countEmbeddingInputModalities(inputItems)

  const mwCtx = createGenerationContext({
    requestId,
    activity: 'embedding',
    provider: adapter.name,
    model,
    modelOptions,
    createId,
  })

  await runGenerationStart(middleware, mwCtx)

  aiEventClient.emit('embedding:request:started', {
    requestId,
    provider: adapter.name,
    model,
    inputCount: inputItems.length,
    textInputCount,
    imageInputCount,
    dimensions: options.dimensions,
    modelOptions,
    timestamp: startTime,
  })

  logger.request(`activity=embed provider=${adapter.name} model=${model}`, {
    provider: adapter.name,
    model,
  })

  try {
    const result = await adapter.createEmbeddings({
      model,
      input: inputItems,
      dimensions: options.dimensions,
      modelOptions,
      logger,
    })
    const duration = Date.now() - startTime

    aiEventClient.emit('embedding:request:completed', {
      requestId,
      provider: adapter.name,
      model,
      embeddingCount: result.embeddings.length,
      dimensions: result.embeddings[0]?.vector.length,
      duration,
      modelOptions,
      timestamp: Date.now(),
    })

    logger.output(`activity=embed count=${result.embeddings.length}`, {
      embeddingCount: result.embeddings.length,
    })

    if (result.usage) {
      aiEventClient.emit('embedding:usage', {
        requestId,
        model,
        usage: result.usage,
        timestamp: Date.now(),
      })
      await runGenerationUsage(middleware, mwCtx, result.usage)
    }
    await runGenerationFinish(middleware, mwCtx, {
      duration,
      usage: result.usage,
    })

    return result
  } catch (error) {
    const duration = Date.now() - startTime
    const err = error as Error
    aiEventClient.emit('embedding:request:error', {
      requestId,
      provider: adapter.name,
      model,
      error: { message: err.message, name: err.name },
      duration,
      modelOptions,
      timestamp: Date.now(),
    })
    await runGenerationError(middleware, mwCtx, {
      error,
      duration,
    })
    logger.errors('embed activity failed', {
      error,
      source: 'embed',
    })
    throw error
  }
}

export function createEmbedOptions<
  TAdapter extends EmbeddingAdapter<string, any, any, any>,
>(options: EmbedOptions<TAdapter>): EmbedOptions<TAdapter> {
  return options
}

// Re-export adapter types
export type {
  EmbeddingAdapter,
  EmbeddingAdapterConfig,
  AnyEmbeddingAdapter,
} from './adapter'
export { BaseEmbeddingAdapter } from './adapter'
