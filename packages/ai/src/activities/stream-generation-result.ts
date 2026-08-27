import { EventType } from '@ag-ui/core'
import { toRunErrorPayload } from './error-payload'
import type { StreamChunk } from '../types'
import { normalizeStreamChunk } from '../utilities/normalize-stream-chunk'

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function artifactsFromResult(result: unknown): Array<unknown> | undefined {
  if (typeof result !== 'object' || result === null) return undefined
  const artifacts = (result as { artifacts?: unknown }).artifacts
  return Array.isArray(artifacts) && artifacts.length > 0
    ? artifacts
    : undefined
}

export async function* streamGenerationResult<TResult>(
  generator: (resolved: {
    runId: string
    threadId: string
  }) => Promise<TResult>,
  options?: { runId?: string; threadId?: string },
): AsyncIterable<StreamChunk> {
  const runId = options?.runId ?? createId('run')
  const threadId = options?.threadId ?? createId('thread')

  yield {
    type: EventType.RUN_STARTED,
    runId,
    threadId,
    timestamp: Date.now(),
  }

  try {
    const result = await generator({ runId, threadId })

    // Emit persisted artifact refs (if a middleware attached any) before the
    // result, so the client records them as the run streams.
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

    yield* normalizeStreamChunk({
      type: EventType.RUN_FINISHED,
      runId,
      threadId,
      finishReason: 'stop',
      timestamp: Date.now(),
    })
  } catch (error: unknown) {
    const payload = toRunErrorPayload(error, 'Generation failed')
    // `code` is omitted entirely when undefined so the event matches the
    // AG-UI `code?: string` shape under `exactOptionalPropertyTypes`.
    const codeFields =
      payload.code !== undefined ? { code: payload.code } : undefined
    yield* normalizeStreamChunk({
      type: EventType.RUN_ERROR,
      runId,
      threadId,
      message: payload.message,
      ...codeFields,
      timestamp: Date.now(),
    })
  }
}
