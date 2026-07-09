/**
 * TTS Activity
 *
 * Generates speech audio from text using text-to-speech models.
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
import type { InternalLogger } from '../../logger/internal-logger'
import type { DebugOption } from '../../logger/types'
import type { GenerationMiddleware, GenerationRunOptions } from '../middleware'
import type { TTSAdapter } from './adapter'
import type { StreamChunk, TTSResult } from '../../types'

// ===========================
// Activity Kind
// ===========================

/** The adapter kind this activity handles */
export const kind = 'tts' as const

// ===========================
// Type Extraction Helpers
// ===========================

/**
 * Extract provider options from a TTSAdapter via ~types.
 */
export type TTSProviderOptions<TAdapter> =
  TAdapter extends TTSAdapter<any, any>
    ? TAdapter['~types']['providerOptions']
    : object

// ===========================
// Activity Options Type
// ===========================

/**
 * Options for the TTS activity.
 * The model is extracted from the adapter's model property.
 *
 * @template TAdapter - The TTS adapter type
 * @template TStream - Whether to stream the output
 */
export interface TTSActivityOptions<
  TAdapter extends TTSAdapter<string, TTSProviderOptions<TAdapter>>,
  TStream extends boolean = false,
> extends GenerationRunOptions<TTSResult> {
  /** The TTS adapter to use (must be created with a model) */
  adapter: TAdapter & { kind: typeof kind }
  /** The text to convert to speech */
  text: string
  /** The voice to use for generation */
  voice?: string
  /** The output audio format */
  format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'
  /** The speed of the generated audio (0.25 to 4.0) */
  speed?: number
  /** Provider-specific options for TTS generation */
  modelOptions?: TTSProviderOptions<TAdapter>
  /**
   * Whether to stream the generation result.
   * When true, returns an AsyncIterable<StreamChunk> for streaming transport.
   * When false or not provided, returns a Promise<TTSResult>.
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
}

// ===========================
// Activity Result Type
// ===========================

/**
 * Result type for the TTS activity.
 * - If stream is true: AsyncIterable<StreamChunk>
 * - Otherwise: Promise<TTSResult>
 */
export type TTSActivityResult<TStream extends boolean = false> =
  TStream extends true ? AsyncIterable<StreamChunk> : Promise<TTSResult>

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// ===========================
// Activity Implementation
// ===========================

/**
 * TTS activity - generates speech from text.
 *
 * Uses AI text-to-speech models to create audio from natural language text.
 *
 * @example Generate speech from text
 * ```ts
 * import { generateSpeech } from '@tanstack/ai'
 * import { openaiSpeech } from '@tanstack/ai-openai'
 *
 * const result = await generateSpeech({
 *   adapter: openaiSpeech('tts-1-hd'),
 *   text: 'Hello, welcome to TanStack AI!',
 *   voice: 'nova'
 * })
 *
 * console.log(result.audio) // base64-encoded audio
 * ```
 *
 * @example With format and speed options
 * ```ts
 * const result = await generateSpeech({
 *   adapter: openaiSpeech('tts-1'),
 *   text: 'This is slower speech.',
 *   voice: 'alloy',
 *   format: 'wav',
 *   speed: 0.8
 * })
 * ```
 */
export function generateSpeech<
  TAdapter extends TTSAdapter<string, TTSProviderOptions<TAdapter>>,
  TStream extends boolean = false,
>(options: TTSActivityOptions<TAdapter, TStream>): TTSActivityResult<TStream> {
  if (options.stream) {
    return streamGenerationResult(
      (resolvedOptions) =>
        runGenerateSpeech({ ...options, ...resolvedOptions }),
      options,
    ) as TTSActivityResult<TStream>
  }
  return runGenerateSpeech(options) as TTSActivityResult<TStream>
}

/**
 * Run the core TTS generation logic (non-streaming).
 */
async function runGenerateSpeech<
  TAdapter extends TTSAdapter<string, TTSProviderOptions<TAdapter>>,
>(options: TTSActivityOptions<TAdapter, boolean>): Promise<TTSResult> {
  rejectEventsOnlyReplay(options.replay)

  if (options.replay && 'result' in options.replay) {
    return options.replay.result as TTSResult
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
  const requestId = createId('speech')
  const startTime = Date.now()
  const logger: InternalLogger = resolveDebugOption(options.debug)
  const providerName =
    (adapter as { name?: string; provider?: string }).provider ??
    (adapter as { name?: string }).name ??
    'unknown'
  const identity = { threadId, runId }

  const mwCtx = createGenerationContext({
    requestId,
    activity: 'tts',
    provider: adapter.name,
    model,
    modelOptions: rest.modelOptions,
    threadId,
    runId,
    artifactInputs: {
      text: rest.text,
      voice: rest.voice,
      format: rest.format,
      speed: rest.speed,
    },
    createId,
  })

  await runGenerationStart(middleware, mwCtx)

  aiEventClient.emit('speech:request:started', {
    requestId,
    ...generationIdentityFields(identity),
    provider: adapter.name,
    model,
    text: rest.text,
    voice: rest.voice,
    format: rest.format,
    speed: rest.speed,
    modelOptions: rest.modelOptions as Record<string, unknown> | undefined,
    timestamp: startTime,
  })

  logger.request(`activity=generateSpeech provider=${providerName}`, {
    provider: providerName,
    model,
  })

  try {
    const rawResult = await adapter.generateSpeech({ ...rest, model, logger })
    const result = await applyGenerationResultTransforms(mwCtx, rawResult)
    const duration = Date.now() - startTime

    aiEventClient.emit('speech:request:completed', {
      requestId,
      ...generationIdentityFields(identity),
      provider: adapter.name,
      model,
      audio: result.audio,
      format: result.format,
      audioDuration: result.duration,
      contentType: result.contentType,
      duration,
      modelOptions: rest.modelOptions as Record<string, unknown> | undefined,
      timestamp: Date.now(),
    })

    if (result.usage) {
      aiEventClient.emit('speech:usage', {
        requestId,
        ...generationIdentityFields(identity),
        model,
        usage: result.usage,
        modelOptions: rest.modelOptions as Record<string, unknown> | undefined,
        timestamp: Date.now(),
      })
    }

    logger.output(`activity=generateSpeech bytes=${result.audio.length}`, {
      bytes: result.audio.length,
      contentType: result.contentType,
    })

    if (result.usage) await runGenerationUsage(middleware, mwCtx, result.usage)
    await runGenerationFinish(middleware, mwCtx, {
      duration,
      usage: result.usage,
    })

    return result
  } catch (error) {
    const duration = Date.now() - startTime
    const err = error as Error
    aiEventClient.emit('speech:request:error', {
      requestId,
      ...generationIdentityFields(identity),
      provider: adapter.name,
      model,
      error: { message: err.message, name: err.name },
      duration,
      modelOptions: rest.modelOptions as Record<string, unknown> | undefined,
      timestamp: Date.now(),
    })
    await runGenerationError(middleware, mwCtx, {
      error,
      duration,
    })
    logger.errors('generateSpeech activity failed', {
      error,
      source: 'generateSpeech',
    })
    throw error
  }
}

// ===========================
// Options Factory
// ===========================

/**
 * Create typed options for the generateSpeech() function without executing.
 */
export function createSpeechOptions<
  TAdapter extends TTSAdapter<string, TTSProviderOptions<TAdapter>>,
  TStream extends boolean = false,
>(
  options: TTSActivityOptions<TAdapter, TStream>,
): TTSActivityOptions<TAdapter, TStream> {
  return options
}

// Re-export adapter types
export type { TTSAdapter, TTSAdapterConfig, AnyTTSAdapter } from './adapter'
export { BaseTTSAdapter } from './adapter'
