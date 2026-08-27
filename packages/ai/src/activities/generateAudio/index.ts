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
import type { AudioAdapter } from './adapter'
import type { AudioGenerationResult, StreamChunk } from '../../types'

/** The adapter kind this activity handles */
export const kind = 'audio' as const

export type AudioProviderOptions<TAdapter> = TAdapter extends {
  '~types': { providerOptions: infer P extends object }
}
  ? P
  : object

export interface AudioActivityOptions<
  TAdapter extends AudioAdapter<string, AudioProviderOptions<TAdapter>>,
  TStream extends boolean = false,
> {
  /** The audio adapter to use (must be created with a model) */
  adapter: TAdapter & { kind: typeof kind }
  /** Text description of the desired audio */
  prompt: string
  /** Desired duration in seconds */
  duration?: number
  /** Provider-specific options for audio generation */
  modelOptions?: AudioProviderOptions<TAdapter>
  stream?: TStream
  debug?: DebugOption
  middleware?: Array<GenerationMiddleware>
  /** Stable conversation/thread id for correlating this run when persisted. */
  threadId?: string
  /** Stable run id for correlating this run when persisted. */
  runId?: string
  timeout?: number
  abortSignal?: AbortSignal
}

export type AudioActivityResult<TStream extends boolean = false> =
  TStream extends true
    ? AsyncIterable<StreamChunk>
    : Promise<AudioGenerationResult>

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function generateAudio<
  TAdapter extends AudioAdapter<string, AudioProviderOptions<TAdapter>>,
  TStream extends boolean = false,
>(
  options: AudioActivityOptions<TAdapter, TStream>,
): AudioActivityResult<TStream> {
  if (options.stream) {
    return streamGenerationResult(
      (resolved) => runGenerateAudio({ ...options, runId: resolved.runId }),
      options,
    ) as AudioActivityResult<TStream>
  }
  return runGenerateAudio(options) as AudioActivityResult<TStream>
}

async function runGenerateAudio<
  TAdapter extends AudioAdapter<string, AudioProviderOptions<TAdapter>>,
>(
  options: AudioActivityOptions<TAdapter, boolean>,
): Promise<AudioGenerationResult> {
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
  const requestId = createId('audio')
  const startTime = Date.now()
  const logger: InternalLogger = resolveDebugOption(options.debug)
  const abortControls = createActivityAbortControls({
    timeout,
    abortSignal: callerAbortSignal,
  })
  const providerName =
    (adapter as { name?: string; provider?: string }).provider ??
    (adapter as { name?: string }).name ??
    'unknown'

  const mwCtx = createGenerationContext({
    requestId,
    activity: 'audio',
    provider: adapter.name,
    model,
    modelOptions: rest.modelOptions,
    threadId,
    runId,
    artifactInputs: { prompt: rest.prompt, duration: rest.duration },
    createId,
  })

  await runGenerationStart(middleware, mwCtx)

  aiEventClient.emit('audio:request:started', {
    requestId,
    provider: adapter.name,
    model,
    prompt: rest.prompt,
    duration: rest.duration,
    modelOptions: rest.modelOptions as Record<string, unknown> | undefined,
    timestamp: startTime,
  })

  logger.request(`activity=generateAudio provider=${providerName}`, {
    provider: providerName,
    model,
  })

  try {
    const rawResult = await raceWithAbort(
      adapter.generateAudio({
        ...rest,
        model,
        logger,
        ...(abortControls.signal ? { abortSignal: abortControls.signal } : {}),
      }),
      abortControls.signal,
    )
    abortControls.clear()
    const result = await applyGenerationResultTransforms(mwCtx, rawResult)
    const elapsedMs = Date.now() - startTime

    aiEventClient.emit('audio:request:completed', {
      requestId,
      provider: adapter.name,
      model,
      audio: result.audio,
      duration: elapsedMs,
      modelOptions: rest.modelOptions as Record<string, unknown> | undefined,
      timestamp: Date.now(),
    })

    if (result.usage) {
      aiEventClient.emit('audio:usage', {
        requestId,
        model,
        usage: result.usage,
        modelOptions: rest.modelOptions as Record<string, unknown> | undefined,
        timestamp: Date.now(),
      })
    }

    logger.output(`activity=generateAudio provider=${providerName}`, {
      contentType: result.audio.contentType,
      audioDuration: result.audio.duration,
    })

    if (result.usage) await runGenerationUsage(middleware, mwCtx, result.usage)
    await runGenerationFinish(middleware, mwCtx, {
      duration: elapsedMs,
      usage: result.usage,
    })

    return result
  } catch (error) {
    abortControls.clear()
    const elapsedMs = Date.now() - startTime
    const err = error as Error
    aiEventClient.emit('audio:request:error', {
      requestId,
      provider: adapter.name,
      model,
      error: { message: err.message, name: err.name },
      duration: elapsedMs,
      modelOptions: rest.modelOptions as Record<string, unknown> | undefined,
      timestamp: Date.now(),
    })
    if (isActivityAbortError(error, abortControls.signal)) {
      await runGenerationAbort(middleware, mwCtx, {
        reason: abortReasonMessage(error, abortControls.signal),
        duration: elapsedMs,
      })
    } else {
      await runGenerationError(middleware, mwCtx, {
        error,
        duration: elapsedMs,
      })
    }
    logger.errors('generateAudio activity failed', {
      error,
      source: 'generateAudio',
    })
    throw error
  }
}

export function createAudioOptions<
  TAdapter extends AudioAdapter<string, AudioProviderOptions<TAdapter>>,
  TStream extends boolean = false,
>(
  options: AudioActivityOptions<TAdapter, TStream>,
): AudioActivityOptions<TAdapter, TStream> {
  return options
}

// Re-export adapter types
export type {
  AudioAdapter,
  AudioAdapterConfig,
  AnyAudioAdapter,
} from './adapter'
export { BaseAudioAdapter } from './adapter'
