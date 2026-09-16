/**
 * TTS Activity
 *
 * Generates speech audio from text using text-to-speech models.
 * This is a self-contained module with implementation, types, and JSDoc.
 */

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
import type { TTSAdapter, TTSCapabilities } from './adapter'
import type { StreamChunk, TTSResult, TTSTurn } from '../../types'

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
export type TTSProviderOptions<TAdapter> = TAdapter extends {
  '~types': { providerOptions: infer P extends object }
}
  ? P
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
export type TTSActivityOptions<
  TAdapter extends TTSAdapter<string, TTSProviderOptions<TAdapter>>,
  TStream extends boolean = false,
> = TTSActivityOptionsBase<TAdapter, TStream> &
  (
    | {
        /** The text to convert to speech */
        text: string
        turns?: undefined
      }
    | {
        text?: undefined
        /**
         * Multi-voice dialogue turns, one per line of the script. Mutually
         * exclusive with `text`.
         *
         * Only adapters that declare `capabilities.maxSpeakers` accept these
         * (ElevenLabs 10 voices, Gemini 2); anything else throws before the
         * request leaves the process.
         */
        turns: Array<TTSTurn>
      }
  )

/** Shared half of {@link TTSActivityOptions} — everything except text/turns. */
interface TTSActivityOptionsBase<
  TAdapter extends TTSAdapter<string, TTSProviderOptions<TAdapter>>,
  TStream extends boolean = false,
> {
  /** The TTS adapter to use (must be created with a model) */
  adapter: TAdapter & { kind: typeof kind }
  /** The voice to use for generation */
  voice?: string
  /**
   * Ask for `alignment` (character/word timings) and `segments` (per-turn
   * spans) on the result. Only adapters that declare
   * `capabilities.timestamps` accept it — on ElevenLabs it is a different
   * endpoint, on BytePlus a different request flag, so it cannot be inferred.
   */
  timestamps?: boolean
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
  /** Stable conversation/thread id for correlating this run when persisted. */
  threadId?: string
  /** Stable run id for correlating this run when persisted. */
  runId?: string
  /**
   * Maximum duration of this activity invocation in milliseconds.
   * No SDK-wide default — choose a value suitable for the provider and job.
   * Composed with {@link abortSignal}; the first abort wins.
   */
  timeout?: number
  /**
   * Caller cancellation signal (request disconnects, job/runtime cancellation).
   * Composed with {@link timeout} into an effective signal forwarded to the
   * adapter. Request-specific — not stored on global provider client config.
   */
  abortSignal?: AbortSignal
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

/**
 * Validate the text/turns/timestamps trio against what the adapter declares,
 * and return the `text` every adapter receives.
 *
 * For a dialogue request that text is the turn scripts joined by newlines:
 * dialogue-aware adapters read `turns` and ignore it, but it keeps `text`
 * non-optional on the adapter contract and gives the devtools event and the
 * artifact inputs something truthful to show.
 */
function resolveSpeechText(
  adapter: { name: string; capabilities?: TTSCapabilities },
  input: { text?: string; turns?: Array<TTSTurn>; timestamps?: boolean },
): string {
  const { text, turns, timestamps } = input

  if (timestamps && !adapter.capabilities?.timestamps) {
    throw new Error(
      `${adapter.name} cannot return timestamps. Drop \`timestamps: true\` — the result would have no alignment to read.`,
    )
  }

  if (turns) {
    if (text !== undefined) {
      throw new Error(
        'generateSpeech() takes either `text` or `turns`, not both.',
      )
    }
    if (turns.length === 0) {
      throw new Error('generateSpeech() `turns` must not be empty.')
    }
    const maxSpeakers = adapter.capabilities?.maxSpeakers
    if (maxSpeakers === undefined) {
      throw new Error(
        `${adapter.name} cannot generate dialogue. Pass \`text\` (and \`voice\`) instead of \`turns\`.`,
      )
    }
    const speakers = new Set(turns.map((turn) => turn.voice)).size
    if (speakers > maxSpeakers) {
      throw new Error(
        `${adapter.name} accepts at most ${maxSpeakers} distinct voice${maxSpeakers === 1 ? '' : 's'} per request; received ${speakers}.`,
      )
    }
    return turns.map((turn) => turn.text).join('\n')
  }

  if (text === undefined) {
    throw new Error('generateSpeech() requires either `text` or `turns`.')
  }
  return text
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
      // Only `runId` is taken from the resolved wire identity. `threadId` stays
      // the CALLER's: `streamGenerationResult` mints one for the RUN_* chunks
      // when none was passed, and spreading that over the options would hand
      // middleware a thread id known to nobody, which persistence would then
      // file the run under. Matches `generateVideo`.
      (resolved) => runGenerateSpeech({ ...options, runId: resolved.runId }),
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
  const text = resolveSpeechText(adapter, rest)
  const requestId = createId('speech')
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
    activity: 'tts',
    provider: adapter.name,
    model,
    modelOptions: rest.modelOptions,
    artifactInputs: {
      text,
      voice: rest.voice,
      format: rest.format,
      speed: rest.speed,
    },
    threadId,
    runId,
    createId,
  })

  await runGenerationStart(middleware, mwCtx)

  aiEventClient.emit('speech:request:started', {
    requestId,
    provider: adapter.name,
    model,
    text,
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
    const rawResult = await raceWithAbort(
      adapter.generateSpeech({
        ...rest,
        text,
        model,
        logger,
        ...(abortControls.signal ? { abortSignal: abortControls.signal } : {}),
      }),
      abortControls.signal,
    )
    abortControls.clear()
    const result = await applyGenerationResultTransforms(mwCtx, rawResult)
    const duration = Date.now() - startTime

    aiEventClient.emit('speech:request:completed', {
      requestId,
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
    abortControls.clear()
    const duration = Date.now() - startTime
    const err = error as Error
    aiEventClient.emit('speech:request:error', {
      requestId,
      provider: adapter.name,
      model,
      error: { message: err.message, name: err.name },
      duration,
      modelOptions: rest.modelOptions as Record<string, unknown> | undefined,
      timestamp: Date.now(),
    })
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
export type {
  TTSAdapter,
  TTSAdapterConfig,
  TTSCapabilities,
  AnyTTSAdapter,
} from './adapter'
export { BaseTTSAdapter } from './adapter'
