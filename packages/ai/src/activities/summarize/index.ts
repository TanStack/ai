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
import type { InternalLogger } from '../../logger/internal-logger'
import type { DebugOption } from '../../logger/types'
import type { GenerationMiddleware } from '../middleware/types'
import type { SummarizeAdapter } from './adapter'
import type { StreamChunk, SummarizationResult } from '../../types'

/** The adapter kind this activity handles */
export const kind = 'summarize' as const

/** Extract provider options from a SummarizeAdapter via ~types */
export type SummarizeProviderOptions<TAdapter> = TAdapter extends {
  '~types': { providerOptions: infer P extends object }
}
  ? P
  : object

export interface SummarizeActivityOptions<
  TAdapter extends SummarizeAdapter<string, object>,
  TStream extends boolean = false,
> {
  /** The summarize adapter to use (must be created with a model) */
  adapter: TAdapter & { kind: typeof kind }
  /** The text to summarize */
  text: string
  /** Maximum length of the summary (in words or characters, provider-dependent) */
  maxLength?: number
  /** Style of summary to generate */
  style?: 'bullet-points' | 'paragraph' | 'concise'
  /** Topics or aspects to focus on in the summary */
  focus?: Array<string>
  /** Provider-specific options */
  modelOptions?: SummarizeProviderOptions<TAdapter>
  runId?: string
  threadId?: string
  middleware?: Array<GenerationMiddleware>
  timeout?: number
  abortSignal?: AbortSignal
  stream?: TStream
  debug?: DebugOption
}

export type SummarizeActivityResult<TStream extends boolean> =
  TStream extends true
    ? AsyncIterable<StreamChunk>
    : Promise<SummarizationResult>

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function summarize<
  TAdapter extends SummarizeAdapter<string, object>,
  TStream extends boolean = false,
>(
  options: SummarizeActivityOptions<TAdapter, TStream>,
): SummarizeActivityResult<TStream> {
  const { stream } = options

  if (stream) {
    return runStreamingSummarize(
      options as SummarizeActivityOptions<TAdapter, true>,
    ) as SummarizeActivityResult<TStream>
  }

  return runSummarize(
    options as SummarizeActivityOptions<TAdapter, false>,
  ) as SummarizeActivityResult<TStream>
}

async function runSummarize(
  options: SummarizeActivityOptions<SummarizeAdapter<string, object>, false>,
): Promise<SummarizationResult> {
  const {
    adapter,
    text,
    maxLength,
    style,
    focus,
    modelOptions,
    middleware,
    timeout,
    abortSignal: callerAbortSignal,
  } = options
  const model = adapter.model
  const requestId = createId('summarize')
  const inputLength = text.length
  const startTime = Date.now()
  const logger: InternalLogger = resolveDebugOption(options.debug)
  const abortControls = createActivityAbortControls({
    timeout,
    abortSignal: callerAbortSignal,
  })

  const mwCtx = createGenerationContext({
    requestId,
    activity: 'summarize',
    provider: adapter.name,
    model,
    modelOptions,
    threadId: options.threadId,
    runId: options.runId,
    createId,
  })

  await runGenerationStart(middleware, mwCtx)

  aiEventClient.emit('summarize:request:started', {
    requestId,
    provider: adapter.name,
    model,
    inputLength,
    timestamp: startTime,
  })

  logger.request(`activity=summarize provider=${adapter.name}`, {
    provider: adapter.name,
    model,
    inputLength,
  })

  const summarizeOptions = {
    model,
    text,
    maxLength,
    style,
    focus,
    modelOptions,
    logger,
    ...(abortControls.signal ? { abortSignal: abortControls.signal } : {}),
  }

  try {
    const rawResult = await raceWithAbort(
      adapter.summarize(summarizeOptions),
      abortControls.signal,
    )
    abortControls.clear()
    const result = await applyGenerationResultTransforms(mwCtx, rawResult)

    const duration = Date.now() - startTime
    const outputLength = result.summary.length

    aiEventClient.emit('summarize:request:completed', {
      requestId,
      provider: adapter.name,
      model,
      inputLength,
      outputLength,
      duration,
      timestamp: Date.now(),
    })

    logger.output(`activity=summarize length=${outputLength}`, {
      hasSummary: !!result.summary,
      outputLength,
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
    logger.errors('summarize activity failed', {
      error,
      source: 'summarize',
    })
    throw error
  }
}

/** Read a `usage` off a transformed result without asserting its shape. */
function usageOf(result: unknown): SummarizationResult['usage'] | undefined {
  if (typeof result !== 'object' || result === null) return undefined
  const usage = (result as { usage?: unknown }).usage
  return typeof usage === 'object' && usage !== null
    ? (usage as SummarizationResult['usage'])
    : undefined
}

async function* runStreamingSummarize(
  options: SummarizeActivityOptions<SummarizeAdapter<string, object>, true>,
): AsyncIterable<StreamChunk> {
  const {
    adapter,
    text,
    maxLength,
    style,
    focus,
    modelOptions,
    runId,
    threadId,
  } = options
  const model = adapter.model
  const logger: InternalLogger = resolveDebugOption(options.debug)

  logger.request(`activity=summarize provider=${adapter.name}`, {
    provider: adapter.name,
    model,
    stream: true,
  })

  const summarizeOptions = {
    model,
    text,
    maxLength,
    style,
    focus,
    modelOptions,
    logger,
    ...(runId !== undefined ? { runId } : {}),
    ...(threadId !== undefined ? { threadId } : {}),
  }

  // Use real streaming if the adapter supports it
  if (adapter.summarizeStream) {
    yield* runNativeSummarizeStream(
      options,
      adapter.summarizeStream(summarizeOptions),
      logger,
    )
    return
  }

  try {
    yield* streamGenerationResult(
      (resolved) =>
        runSummarize({ ...options, stream: false, runId: resolved.runId }),
      {
        ...(runId !== undefined ? { runId } : {}),
        ...(threadId !== undefined ? { threadId } : {}),
      },
    )
  } catch (error) {
    logger.errors('summarize activity failed', {
      error,
      source: 'summarize',
    })
    throw error
  }
}

async function* runNativeSummarizeStream(
  options: SummarizeActivityOptions<SummarizeAdapter<string, object>, true>,
  stream: AsyncIterable<StreamChunk>,
  logger: InternalLogger,
): AsyncIterable<StreamChunk> {
  const { adapter, middleware, modelOptions } = options
  const mwCtx = createGenerationContext({
    requestId: createId('summarize'),
    activity: 'summarize',
    provider: adapter.name,
    model: adapter.model,
    modelOptions,
    threadId: options.threadId,
    runId: options.runId,
    createId,
  })

  await runGenerationStart(middleware, mwCtx)

  const startTime = Date.now()
  // Tracks whether a terminal hook already fired, so the `finally` can report an
  // abandoned stream without double-firing. Mirrors the streaming video path.
  let settled = false
  try {
    for await (const chunk of stream) {
      const isGenerationResult =
        chunk.type === 'CUSTOM' && chunk.name === 'generation:result'
      if (isGenerationResult) {
        const result = await applyGenerationResultTransforms<unknown>(
          mwCtx,
          chunk.value,
        )
        const usage = usageOf(result)
        // Finish before yielding the terminal chunks: a consumer that stops
        // reading once it has the result must not trip the abandonment path.
        if (usage) await runGenerationUsage(middleware, mwCtx, usage)
        await runGenerationFinish(middleware, mwCtx, {
          duration: Date.now() - startTime,
          usage,
        })
        settled = true
        yield { ...chunk, value: result }
        continue
      }
      yield chunk
    }
    if (!settled) {
      await runGenerationFinish(middleware, mwCtx, {
        duration: Date.now() - startTime,
      })
      settled = true
    }
  } catch (error) {
    settled = true
    await runGenerationError(middleware, mwCtx, {
      error,
      duration: Date.now() - startTime,
    })
    logger.errors('summarize activity failed', {
      error,
      source: 'summarize',
    })
    throw error
  } finally {
    if (!settled) {
      await runGenerationAbort(middleware, mwCtx, {
        reason: 'Summarize stream abandoned before completion',
        duration: Date.now() - startTime,
      })
    }
  }
}

export function createSummarizeOptions<
  TAdapter extends SummarizeAdapter<string, object>,
  TStream extends boolean = false,
>(
  options: SummarizeActivityOptions<TAdapter, TStream>,
): SummarizeActivityOptions<TAdapter, TStream> {
  return options
}

// Re-export adapter types
export type {
  SummarizeAdapter,
  SummarizeAdapterConfig,
  AnySummarizeAdapter,
} from './adapter'
export { BaseSummarizeAdapter } from './adapter'
export {
  ChatStreamSummarizeAdapter,
  type ChatStreamCapable,
  type InferTextProviderOptions,
} from './chat-stream-summarize'
