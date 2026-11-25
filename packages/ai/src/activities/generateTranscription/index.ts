/**
 * Transcription Activity
 *
 * Transcribes audio to text using speech-to-text models.
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
  combineAbortSignals,
  createActivityAbortControls,
  isActivityAbortError,
  raceWithAbort,
  toAbortError,
} from '../../utilities/activity-abort'
import type { InternalLogger } from '../../logger/internal-logger'
import type { DebugOption } from '../../logger/types'
import type { GenerationMiddleware } from '../middleware/types'
import type { TranscriptionAdapter } from './adapter'
import type {
  StreamChunk,
  TranscriptionResponseFormat,
  TranscriptionResult,
} from '../../types'

// ===========================
// Activity Kind
// ===========================

/** The adapter kind this activity handles */
export const kind = 'transcription' as const

// ===========================
// Type Extraction Helpers
// ===========================

/**
 * Extract provider options from a TranscriptionAdapter via ~types.
 */
export type TranscriptionProviderOptions<TAdapter> = TAdapter extends {
  '~types': { providerOptions: infer P extends object }
}
  ? P
  : object

// ===========================
// Activity Options Type
// ===========================

/**
 * Options for the transcription activity.
 * The model is extracted from the adapter's model property.
 *
 * @template TAdapter - The transcription adapter type
 * @template TStream - Whether to stream the output
 */
export interface TranscriptionActivityOptions<
  TAdapter extends TranscriptionAdapter<
    string,
    TranscriptionProviderOptions<TAdapter>
  >,
  TStream extends boolean = false,
> {
  /** The transcription adapter to use (must be created with a model) */
  adapter: TAdapter & { kind: typeof kind }
  /** The audio data to transcribe - can be base64 string, File, Blob, or Buffer */
  audio: string | File | Blob | ArrayBuffer
  /** The language of the audio in ISO-639-1 format (e.g., 'en') */
  language?: string
  /** An optional prompt to guide the transcription */
  prompt?: string
  /** The format of the transcription output */
  responseFormat?: TranscriptionResponseFormat
  /** Provider-specific options for transcription */
  modelOptions?: TranscriptionProviderOptions<TAdapter>
  /**
   * Whether to stream the transcription result.
   * When true, returns an AsyncIterable<StreamChunk> for streaming transport.
   * When false or not provided, returns a Promise<TranscriptionResult>.
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
  /** Stable conversation/thread id. It is the AG-UI thread id and the persistence key. */
  threadId: string
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
 * Result type for the transcription activity.
 * - If stream is true: AsyncIterable<StreamChunk>
 * - Otherwise: Promise<TranscriptionResult>
 */
export type TranscriptionActivityResult<TStream extends boolean = false> =
  TStream extends true
    ? AsyncIterable<StreamChunk>
    : Promise<TranscriptionResult>

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// ===========================
// Activity Implementation
// ===========================

/**
 * Transcription activity - converts audio to text.
 *
 * Uses AI speech-to-text models to transcribe audio content.
 *
 * @example Transcribe an audio file
 * ```ts
 * import { generateTranscription } from '@tanstack/ai'
 * import { openaiTranscription } from '@tanstack/ai-openai'
 *
 * const result = await generateTranscription({
 *   adapter: openaiTranscription('whisper-1'),
 *   audio: audioFile, // File, Blob, or base64 string
 *   language: 'en',
 *   threadId,
 * })
 *
 * console.log(result.text)
 * ```
 *
 * @example With verbose output for timestamps
 * ```ts
 * const result = await generateTranscription({
 *   adapter: openaiTranscription('whisper-1'),
 *   audio: audioFile,
 *   responseFormat: 'verbose_json',
 *   threadId,
 * })
 *
 * result.segments?.forEach(segment => {
 *   console.log(`[${segment.start}s - ${segment.end}s]: ${segment.text}`)
 * })
 * ```
 *
 * @example Streaming transcription result
 * ```ts
 * for await (const chunk of generateTranscription({
 *   adapter: openaiTranscription('gpt-transcribe'),
 *   audio: audioFile,
 *   threadId,
 *   stream: true
 * })) {
 *   console.log(chunk)
 * }
 * ```
 */
export function generateTranscription<
  TAdapter extends TranscriptionAdapter<
    string,
    TranscriptionProviderOptions<TAdapter>
  >,
  TStream extends boolean = false,
>(
  options: TranscriptionActivityOptions<TAdapter, TStream>,
): TranscriptionActivityResult<TStream> {
  if (options.stream) {
    return streamGenerationResult(
      // Only `runId` comes from the resolved wire identity. `threadId` is
      // the caller's own id.
      (resolved, emitTextDelta, streamAbortSignal) => {
        const combinedAbort = combineAbortSignals(
          options.abortSignal,
          streamAbortSignal,
        )
        return runGenerateTranscription(
          {
            ...options,
            abortSignal: combinedAbort.signal,
            runId: resolved.runId,
          },
          emitTextDelta,
        ).finally(combinedAbort.dispose)
      },
      options,
      { text: true },
    ) as TranscriptionActivityResult<TStream>
  }

  return runGenerateTranscription(
    options,
  ) as TranscriptionActivityResult<TStream>
}

/**
 * Run non-streaming transcription
 */
async function runGenerateTranscription<
  TAdapter extends TranscriptionAdapter<
    string,
    TranscriptionProviderOptions<TAdapter>
  >,
>(
  options: TranscriptionActivityOptions<TAdapter, boolean>,
  emitTextDelta?: (delta: string) => void,
): Promise<TranscriptionResult> {
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
  const requestId = createId('transcription')
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
    signal: abortControls.signal,
    activity: 'transcription',
    provider: adapter.name,
    model,
    modelOptions: rest.modelOptions,
    artifactInputs: {
      audio: rest.audio,
      language: rest.language,
      prompt: rest.prompt,
      responseFormat: rest.responseFormat,
    },
    threadId,
    runId,
    createId,
  })

  try {
    if (abortControls.signal?.aborted) {
      throw toAbortError(abortControls.signal.reason)
    }
    await raceWithAbort(
      runGenerationStart(middleware, mwCtx),
      abortControls.signal,
    )
  } catch (error: unknown) {
    abortControls.clear()
    if (isActivityAbortError(error, abortControls.signal)) {
      await runGenerationAbort(middleware, mwCtx, {
        reason: abortReasonMessage(error, abortControls.signal),
        duration: Date.now() - startTime,
      })
    }
    throw error
  }

  aiEventClient.emit('transcription:request:started', {
    requestId,
    provider: adapter.name,
    model,
    language: rest.language,
    prompt: rest.prompt,
    responseFormat: rest.responseFormat,
    modelOptions: rest.modelOptions as Record<string, unknown> | undefined,
    timestamp: startTime,
  })

  logger.request(`activity=generateTranscription provider=${providerName}`, {
    provider: providerName,
    model,
  })

  try {
    if (abortControls.signal?.aborted) {
      throw toAbortError(abortControls.signal.reason)
    }

    const transcriptionOptions = {
      ...rest,
      model,
      logger,
      ...(abortControls.signal ? { abortSignal: abortControls.signal } : {}),
    }
    const hasMiddleware = (middleware?.length ?? 0) > 0
    let emittedTextDelta = false
    const emitStreamedTextDelta = (delta: string) => {
      if (!emitTextDelta) return
      emittedTextDelta = true
      emitTextDelta(delta)
    }
    const transcription =
      emitTextDelta && adapter.transcribeStream
        ? readTranscriptionStream(
            adapter.transcribeStream(transcriptionOptions),
            hasMiddleware ? undefined : emitStreamedTextDelta,
            abortControls.signal,
          )
        : adapter.transcribe(transcriptionOptions)
    const rawResult = await raceWithAbort(transcription, abortControls.signal)
    const result = await raceWithAbort(
      applyGenerationResultTransforms(mwCtx, rawResult),
      abortControls.signal,
    )
    if (emitTextDelta && !emittedTextDelta && result.text) {
      // ponytail: emit the full result when no deltas were safe to stream.
      emitTextDelta(result.text)
    }
    const duration = Date.now() - startTime

    aiEventClient.emit('transcription:request:completed', {
      requestId,
      provider: adapter.name,
      model,
      text: result.text,
      language: result.language,
      duration,
      modelOptions: rest.modelOptions as Record<string, unknown> | undefined,
      timestamp: Date.now(),
    })

    logger.output(
      `activity=generateTranscription length=${result.text.length}`,
      { hasText: !!result.text },
    )

    if (result.usage) {
      aiEventClient.emit('transcription:usage', {
        requestId,
        model,
        usage: result.usage,
        modelOptions: rest.modelOptions as Record<string, unknown> | undefined,
        timestamp: Date.now(),
      })
      await runGenerationUsage(middleware, mwCtx, result.usage)
    }
    await runGenerationFinish(middleware, mwCtx, {
      duration,
      usage: result.usage,
    })

    abortControls.clear()
    return result
  } catch (error) {
    abortControls.clear()
    const duration = Date.now() - startTime
    const err = error as Error
    aiEventClient.emit('transcription:request:error', {
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
    logger.errors('generateTranscription activity failed', {
      error,
      source: 'generateTranscription',
    })
    throw error
  }
}

async function readTranscriptionStream(
  stream: AsyncGenerator<string, TranscriptionResult>,
  emitTextDelta: ((delta: string) => void) | undefined,
  signal?: AbortSignal,
): Promise<TranscriptionResult> {
  const iterator = stream[Symbol.asyncIterator]()
  const closeIterator = () => {
    void iterator.return?.(undefined as never).catch(() => undefined)
  }

  while (true) {
    if (signal?.aborted) {
      closeIterator()
      throw toAbortError(signal.reason)
    }

    let next: IteratorResult<string, TranscriptionResult>
    try {
      next = await raceWithAbort(iterator.next(), signal)
    } catch (error) {
      if (signal?.aborted) closeIterator()
      throw error
    }
    if (signal?.aborted) {
      closeIterator()
      throw toAbortError(signal.reason)
    }
    if (next.done) return next.value
    emitTextDelta?.(next.value)
  }
}

// ===========================
// Options Factory
// ===========================

/**
 * Create typed options for the generateTranscription() function without executing.
 */
export function createTranscriptionOptions<
  TAdapter extends TranscriptionAdapter<
    string,
    TranscriptionProviderOptions<TAdapter>
  >,
  TStream extends boolean = false,
>(
  options: TranscriptionActivityOptions<TAdapter, TStream>,
): TranscriptionActivityOptions<TAdapter, TStream> {
  return options
}

// Re-export adapter types
export type {
  TranscriptionAdapter,
  TranscriptionAdapterConfig,
  AnyTranscriptionAdapter,
} from './adapter'
export { BaseTranscriptionAdapter } from './adapter'
