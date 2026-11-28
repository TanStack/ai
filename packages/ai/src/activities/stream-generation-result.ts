/**
 * Internal helper for wrapping one-shot generation results as StreamChunk
 * async iterables. NOT exported from the package — used only by activity
 * implementations to support `stream: true`.
 */

import { EventType } from '@ag-ui/core'
import { toRunErrorPayload } from './error-payload'
import type { StreamChunk } from '../types'
import { normalizeStreamChunk } from '../utilities/normalize-stream-chunk'
import { isTanstackUsage, readErrorUsage } from '../utilities/ag-ui-usage'

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function createAsyncQueue() {
  const values: Array<string> = []
  const waiters: Array<(result: IteratorResult<string>) => void> = []
  let closed = false

  return {
    enqueue(value: string) {
      if (closed) return
      const waiter = waiters.shift()
      if (waiter) {
        waiter({ done: false, value })
      } else {
        values.push(value)
      }
    },
    close() {
      closed = true
      for (const waiter of waiters.splice(0)) {
        waiter({ done: true, value: undefined })
      }
    },
    next(): Promise<IteratorResult<string>> {
      const value = values[0]
      if (value !== undefined) {
        values.shift()
        return Promise.resolve({
          done: false,
          value,
        })
      }
      if (closed) {
        return Promise.resolve({ done: true, value: undefined })
      }
      return new Promise((resolve) => waiters.push(resolve))
    },
  }
}

/**
 * Persisted artifact refs a middleware may have attached to the result. Read
 * defensively: the result shape is activity-specific and `artifacts` is only
 * present when generation persistence is wired with an artifact + blob store.
 */
function artifactsFromResult(result: unknown): Array<unknown> | undefined {
  if (typeof result !== 'object' || result === null) return undefined
  const artifacts = (result as { artifacts?: unknown }).artifacts
  return Array.isArray(artifacts) && artifacts.length > 0
    ? artifacts
    : undefined
}

/**
 * Wrap a one-shot generation result as a StreamChunk async iterable.
 *
 * This allows non-streaming activities (image, speech, transcription, summarize)
 * to be sent over the same streaming transport as chat.
 *
 * @param generator - An async function that performs the generation and returns the result
 * @param options - The caller's threadId, plus an optional runId
 * @returns An AsyncIterable of StreamChunks with RUN_STARTED, CUSTOM(generation:result), and RUN_FINISHED events on success, or RUN_STARTED and RUN_ERROR on failure
 */
export function streamGenerationResult<TResult>(
  generator: (
    resolved: { runId: string; threadId: string },
    emitTextDelta?: (delta: string) => void,
    abortSignal?: AbortSignal,
  ) => Promise<TResult>,
  options: { runId?: string; threadId: string },
  streamOptions: { text?: boolean } = {},
): AsyncIterable<StreamChunk> {
  const runId = options.runId ?? createId('run')
  const threadId = options.threadId
  const cancellation = new AbortController()
  const textQueue = streamOptions.text ? createAsyncQueue() : undefined
  let terminal = false

  const sourceIterator = streamGenerationResultChunks(
    generator,
    { runId, threadId },
    cancellation.signal,
    textQueue,
  )
  const iterator: AsyncIterator<StreamChunk> = {
    async next() {
      const result = await sourceIterator.next()
      if (
        !result.done &&
        (result.value.type === EventType.RUN_FINISHED ||
          result.value.type === EventType.RUN_ERROR)
      ) {
        terminal = true
      }
      return result
    },
    async return() {
      if (!terminal) {
        cancellation.abort()
        textQueue?.close()
      }
      const result = await sourceIterator.return?.(undefined as never)
      terminal = true
      return result ?? { done: true, value: undefined }
    },
  }

  return { [Symbol.asyncIterator]: () => iterator }
}

async function* streamGenerationResultChunks<TResult>(
  generator: (
    resolved: { runId: string; threadId: string },
    emitTextDelta?: (delta: string) => void,
    abortSignal?: AbortSignal,
  ) => Promise<TResult>,
  resolved: { runId: string; threadId: string },
  abortSignal: AbortSignal,
  textQueue: ReturnType<typeof createAsyncQueue> | undefined,
): AsyncGenerator<StreamChunk> {
  const { runId, threadId } = resolved
  yield {
    type: EventType.RUN_STARTED,
    runId,
    threadId,
    timestamp: Date.now(),
  }

  try {
    const generation = generator(
      { runId, threadId },
      textQueue ? (delta) => textQueue.enqueue(delta) : undefined,
      abortSignal,
    ).then(
      (result) => {
        textQueue?.close()
        return { ok: true as const, result }
      },
      (error: unknown) => {
        textQueue?.close()
        return { ok: false as const, error }
      },
    )

    const messageId = textQueue ? createId('message') : undefined
    if (textQueue && messageId) {
      yield {
        type: EventType.TEXT_MESSAGE_START,
        messageId,
        role: 'assistant',
        timestamp: Date.now(),
      }

      while (true) {
        const next = await textQueue.next()
        if (next.done) break
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          delta: next.value,
          timestamp: Date.now(),
        }
      }
    }

    const outcome = await generation
    if (!outcome.ok) throw outcome.error
    const result = outcome.result

    if (textQueue && messageId) {
      yield {
        type: EventType.TEXT_MESSAGE_END,
        messageId,
        timestamp: Date.now(),
      }
    }

    // Emit persisted artifact refs before the result so the client records
    // them as the run streams.
    const artifacts = artifactsFromResult(result)
    if (artifacts) {
      yield {
        type: EventType.CUSTOM,
        name: 'generation:artifacts',
        value: artifacts,
        timestamp: Date.now(),
      }
    }

    yield {
      type: EventType.CUSTOM,
      name: 'generation:result',
      value: result as unknown,
      timestamp: Date.now(),
    }

    const usage =
      typeof result === 'object' && result !== null && 'usage' in result
        ? result.usage
        : undefined
    yield* normalizeStreamChunk({
      type: EventType.RUN_FINISHED,
      runId,
      threadId,
      finishReason: 'stop',
      timestamp: Date.now(),
      ...(isTanstackUsage(usage) ? { usage } : {}),
    })
  } catch (error: unknown) {
    const payload = toRunErrorPayload(error, 'Generation failed')
    // Omit an undefined code to satisfy the AG-UI optional code field.
    const codeFields =
      payload.code !== undefined ? { code: payload.code } : undefined
    const usage = readErrorUsage(error)
    yield* normalizeStreamChunk({
      type: EventType.RUN_ERROR,
      runId,
      threadId,
      message: payload.message,
      ...codeFields,
      timestamp: Date.now(),
      ...(usage ? { usage } : {}),
    })
  }
}
