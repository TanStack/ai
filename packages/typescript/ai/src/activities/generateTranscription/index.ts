/**
 * Transcription Activity
 *
 * Transcribes audio to text using speech-to-text models.
 * This is a self-contained module with implementation, types, and JSDoc.
 */

import { aiEventClient } from '@tanstack/ai-event-client'
import { streamGenerationResult } from '../stream-generation-result.js'
import { resolveDebugOption } from '../../logger/resolve'
import type { InternalLogger } from '../../logger/internal-logger'
import type { DebugOption } from '../../logger/types'
import type { TranscriptionAdapter } from './adapter'
import type { StreamChunk, TranscriptionResult } from '../../types'

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
export type TranscriptionProviderOptions<TAdapter> =
  TAdapter extends TranscriptionAdapter<any, any>
    ? TAdapter['~types']['providerOptions']
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
  responseFormat?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt'
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
 *   language: 'en'
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
 *   responseFormat: 'verbose_json'
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
 *   adapter: openaiTranscription('whisper-1'),
 *   audio: audioFile,
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
    return streamGenerationResult(() =>
      runGenerateTranscription(options),
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
): Promise<TranscriptionResult> {
  const { adapter, stream: _stream, debug: _debug, ...rest } = options
  const model = adapter.model
  const requestId = createId('transcription')
  const startTime = Date.now()
  const logger: InternalLogger = resolveDebugOption(options.debug)
  const providerName =
    (adapter as { name?: string; provider?: string }).provider ??
    (adapter as { name?: string }).name ??
    'unknown'

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
    const result = await adapter.transcribe({ ...rest, model, logger })
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

    return result
  } catch (error) {
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
    logger.errors('generateTranscription activity failed', {
      error,
      source: 'generateTranscription',
    })
    throw error
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
