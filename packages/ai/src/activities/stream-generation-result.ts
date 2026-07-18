/**
 * Internal helper for wrapping one-shot generation results as StreamChunk
 * async iterables. NOT exported from the package — used only by activity
 * implementations to support `stream: true`.
 */

import { EventType } from '@ag-ui/core'
import { toRunErrorPayload } from './error-payload'
import {
  generationIdentityFields,
  replayGenerationEvents,
} from './generation-run'
import type { GenerationRunOptions } from './middleware/types'
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
 * @param generator - Performs the generation. Receives the resolved run
 *   options — the caller's `options` plus concrete `{ runId, threadId }` — and
 *   returns the result. Not called on the replay path.
 * @param options - Optional run configuration: `runId`/`threadId` identity and
 *   an optional `replay` (persisted `events` to re-emit, or a persisted
 *   `result` to re-wrap without calling the generator).
 * @returns An AsyncIterable of StreamChunks. Live success yields RUN_STARTED,
 *   an optional CUSTOM(generation:artifacts), CUSTOM(generation:result), then
 *   RUN_FINISHED; live failure yields RUN_STARTED then RUN_ERROR. Events-based
 *   replay re-emits the persisted events, guaranteeing a terminal RUN_ERROR if
 *   the log throws mid-read or ends before a terminal event.
 */
export async function* streamGenerationResult<TResult>(
  generator: (
    options: GenerationRunOptions<TResult> & {
      runId: string
      threadId: string
    },
  ) => Promise<TResult>,
  options?: GenerationRunOptions<TResult>,
): AsyncIterable<StreamChunk> {
  if (options?.replay?.events) {
    yield* replayGenerationEvents(options.replay)
    return
  }

  const runId = options?.runId ?? createId('run')
  const threadId = options?.threadId ?? createId('thread')
  const identity = { runId, threadId }
  const resolvedOptions = { ...options, ...identity }

  yield {
    type: EventType.RUN_STARTED,
    runId,
    threadId,
    ...generationIdentityFields(resolvedOptions),
    timestamp: Date.now(),
  }

  try {
    const result =
      options?.replay && 'result' in options.replay
        ? (options.replay.result as TResult)
        : await generator(resolvedOptions)
    const artifacts = (result as { artifacts?: unknown }).artifacts

    if (Array.isArray(artifacts) && artifacts.length > 0) {
      yield {
        type: EventType.CUSTOM,
        name: 'generation:artifacts',
        value: artifacts,
        ...generationIdentityFields(resolvedOptions),
        timestamp: Date.now(),
      }
    }

    yield {
      type: EventType.CUSTOM,
      name: 'generation:result',
      value: result as unknown,
      ...generationIdentityFields(resolvedOptions),
      timestamp: Date.now(),
    }

    yield {
      type: EventType.RUN_FINISHED,
      runId,
      threadId,
      finishReason: 'stop',
      ...generationIdentityFields(resolvedOptions),
      timestamp: Date.now(),
    }
  } catch (error: unknown) {
    const payload = toRunErrorPayload(error, 'Generation failed')
    // `code` is omitted entirely when undefined so the event matches the
    // AG-UI `code?: string` shape under `exactOptionalPropertyTypes`. The
    // deprecated nested `error` form preserves the same conditional
    // structure for backward compatibility.
    const codeFields =
      payload.code !== undefined ? { code: payload.code } : undefined
    yield {
      type: EventType.RUN_ERROR,
      ...generationIdentityFields(identity),
      message: payload.message,
      ...codeFields,
      // Deprecated nested form for backward compatibility
      error: {
        message: payload.message,
        ...codeFields,
      },
      timestamp: Date.now(),
    }
  }
}
