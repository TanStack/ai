/**
 * Internal helper for wrapping one-shot generation results as StreamChunk
 * async iterables. NOT exported from the package — used only by activity
 * implementations to support `stream: true`.
 */

import { EventType } from '@ag-ui/core'
import { toRunErrorPayload } from './error-payload'
import type { StreamChunk } from '../types'

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Wrap a one-shot generation result as a StreamChunk async iterable.
 *
 * This allows non-streaming activities (image, speech, transcription, summarize)
 * to be sent over the same streaming transport as chat.
 *
 * @param generator - An async function that performs the generation and returns the result
 * @param options - Optional configuration (runId, threadId)
 * @returns An AsyncIterable of StreamChunks with RUN_STARTED, CUSTOM(generation:result), and RUN_FINISHED events on success, or RUN_STARTED and RUN_ERROR on failure
 */
export async function* streamGenerationResult<TResult>(
  generator: () => Promise<TResult>,
  options?: { runId?: string; threadId?: string },
): AsyncIterable<StreamChunk> {
  const runId = options?.runId ?? createId('run')
  const threadId = options?.threadId ?? createId('thread')

  yield {
    type: EventType.RUN_STARTED,
    runId,
    threadId,
    timestamp: Date.now(),
  } as StreamChunk

  try {
    const result = await generator()

    yield {
      type: EventType.CUSTOM,
      name: 'generation:result',
      value: result as unknown,
      timestamp: Date.now(),
    } as StreamChunk

    yield {
      type: EventType.RUN_FINISHED,
      runId,
      threadId,
      finishReason: 'stop',
      timestamp: Date.now(),
    } as StreamChunk
  } catch (error: unknown) {
    const payload = toRunErrorPayload(error, 'Generation failed')
    yield {
      type: EventType.RUN_ERROR,
      runId,
      threadId,
      message: payload.message,
      code: payload.code,
      // Deprecated nested form for backward compatibility
      error: payload,
      timestamp: Date.now(),
    } as StreamChunk
  }
}
