/**
 * Internal helper for wrapping one-shot generation results as StreamChunk
 * async iterables. NOT exported from the package — used only by activity
 * implementations to support `stream: true`.
 */

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
 * @param options - Optional configuration (runId)
 * @returns An AsyncIterable of StreamChunks with RUN_STARTED, CUSTOM(generation:result), and RUN_FINISHED events
 */
export async function* streamGenerationResult<TResult>(
  generator: () => Promise<TResult>,
  options?: { runId?: string },
): AsyncIterable<StreamChunk> {
  const runId = options?.runId ?? createId('run')

  yield {
    type: 'RUN_STARTED',
    runId,
    timestamp: Date.now(),
  }

  try {
    const result = await generator()

    yield {
      type: 'CUSTOM',
      name: 'generation:result',
      value: result as unknown,
      timestamp: Date.now(),
    }

    yield {
      type: 'RUN_FINISHED',
      runId,
      finishReason: 'stop',
      timestamp: Date.now(),
    }
  } catch (error: any) {
    yield {
      type: 'RUN_ERROR',
      runId,
      error: {
        message: error.message || 'Generation failed',
        code: error.code,
      },
      timestamp: Date.now(),
    }
  }
}
