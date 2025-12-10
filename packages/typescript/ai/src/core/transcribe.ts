import { aiEventClient } from '../event-client.js'
import type {
  AIAdapter,
  TranscriptionOptions,
  TranscriptionResult,
  TranscriptionStreamChunk,
} from '../types'

/**
 * Options for the transcribe function with adapter.
 */
export interface TranscribeOptions<
  TAdapter extends AIAdapter<any, any, any, any, any, any>,
  TModel extends string = string,
  TProviderOptions extends Record<string, any> = Record<string, any>,
> extends TranscriptionOptions<TModel, TProviderOptions> {
  /** The adapter instance to use for transcription */
  adapter: TAdapter
}

/**
 * Options for the transcribeStream function with adapter.
 */
export interface TranscribeStreamOptions<
  TAdapter extends AIAdapter<any, any, any, any, any, any>,
  TModel extends string = string,
  TProviderOptions extends Record<string, any> = Record<string, any>,
> extends TranscriptionOptions<TModel, TProviderOptions> {
  /** The adapter instance to use for transcription */
  adapter: TAdapter
}

/**
 * Transcribe audio to text using the specified adapter.
 *
 * @param options - Transcription options including the adapter and audio file
 * @returns Promise resolving to the transcription result
 * @throws Error if the adapter does not support transcription
 *
 * @example
 * ```typescript
 * const result = await transcribe({
 *   adapter: openai(),
 *   model: 'whisper-1',
 *   file: audioFile,
 *   language: 'en',
 * });
 *
 * console.log(result.text);
 * ```
 */
export async function transcribe<
  TAdapter extends AIAdapter<any, any, any, any, any, any> & {
    transcribe?: (
      options: TranscriptionOptions<any, any>,
    ) => Promise<TranscriptionResult>
  },
  const TModel extends string = string,
>(
  options: TranscribeOptions<TAdapter, TModel>,
): Promise<TranscriptionResult> {
  const { adapter, ...transcriptionOptions } = options

  if (!adapter.transcribe) {
    throw new Error(
      `Transcription is not supported by the ${adapter.name} adapter. ` +
        `The adapter must implement the transcribe() method.`,
    )
  }

  const requestId = createId('transcribe')
  const startTime = Date.now()

  // Emit started event
  aiEventClient.emit('transcribe:started', {
    requestId,
    model: options.model,
    provider: adapter.name,
    timestamp: startTime,
  })

  try {
    const result = await adapter.transcribe(
      transcriptionOptions as TranscriptionOptions<string, Record<string, any>>,
    )

    // Emit completed event
    aiEventClient.emit('transcribe:completed', {
      requestId,
      model: options.model,
      provider: adapter.name,
      textLength: result.text.length,
      duration: Date.now() - startTime,
      usage: result.usage,
      timestamp: Date.now(),
    })

    return result
  } catch (error) {
    // Emit error event
    aiEventClient.emit('transcribe:error', {
      requestId,
      model: options.model,
      provider: adapter.name,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now(),
    })
    throw error
  }
}

/**
 * Transcribe audio to text with streaming output.
 *
 * @param options - Transcription options including the adapter and audio file
 * @returns AsyncIterable of transcription stream chunks
 * @throws Error if the adapter does not support streaming transcription
 *
 * @example
 * ```typescript
 * const stream = transcribeStream({
 *   adapter: openai(),
 *   model: 'gpt-4o-transcribe',
 *   file: audioFile,
 *   language: 'en',
 * });
 *
 * for await (const chunk of stream) {
 *   if (chunk.type === 'transcript-delta') {
 *     process.stdout.write(chunk.delta);
 *   }
 * }
 * ```
 */
export async function* transcribeStream<
  TAdapter extends AIAdapter<any, any, any, any, any, any> & {
    transcribeStream?: (
      options: TranscriptionOptions<any, any>,
    ) => AsyncIterable<TranscriptionStreamChunk>
  },
  const TModel extends string = string,
>(
  options: TranscribeStreamOptions<TAdapter, TModel>,
): AsyncIterable<TranscriptionStreamChunk> {
  const { adapter, ...transcriptionOptions } = options

  if (!adapter.transcribeStream) {
    throw new Error(
      `Streaming transcription is not supported by the ${adapter.name} adapter. ` +
        `The adapter must implement the transcribeStream() method.`,
    )
  }

  const requestId = createId('transcribe-stream')
  const streamId = createId('stream')
  const startTime = Date.now()
  let totalChunks = 0

  // Emit started event
  aiEventClient.emit('transcribe:started', {
    requestId,
    model: options.model,
    provider: adapter.name,
    streaming: true,
    timestamp: startTime,
  })

  aiEventClient.emit('stream:started', {
    streamId,
    model: options.model,
    provider: adapter.name,
    timestamp: startTime,
  })

  try {
    for await (const chunk of adapter.transcribeStream(
      transcriptionOptions as TranscriptionOptions<string, Record<string, any>>,
    )) {
      totalChunks++

      // Track accumulated text for delta chunks
      if (chunk.type === 'transcript-delta') {
        aiEventClient.emit('stream:chunk:transcript', {
          streamId,
          delta: chunk.delta,
          text: chunk.text,
          timestamp: Date.now(),
        })
      }

      // Emit segment chunks
      if (chunk.type === 'transcript-segment') {
        aiEventClient.emit('stream:chunk:transcript-segment', {
          streamId,
          segment: chunk.segment,
          timestamp: Date.now(),
        })
      }

      // Handle done chunk
      if (chunk.type === 'transcript-done') {
        aiEventClient.emit('transcribe:completed', {
          requestId,
          model: options.model,
          provider: adapter.name,
          textLength: chunk.text.length,
          duration: Date.now() - startTime,
          usage: chunk.usage,
          timestamp: Date.now(),
        })
      }

      // Handle error chunk
      if (chunk.type === 'error') {
        aiEventClient.emit('transcribe:error', {
          requestId,
          model: options.model,
          provider: adapter.name,
          error: chunk.error.message,
          timestamp: Date.now(),
        })
      }

      yield chunk
    }

    // Emit stream ended
    aiEventClient.emit('stream:ended', {
      requestId,
      streamId,
      totalChunks,
      duration: Date.now() - startTime,
      timestamp: Date.now(),
    })
  } catch (error) {
    aiEventClient.emit('transcribe:error', {
      requestId,
      model: options.model,
      provider: adapter.name,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now(),
    })
    throw error
  }
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}
