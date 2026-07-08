/**
 * Processor test harness
 *
 * Exposes `runProcessorWithChunks` — a minimal helper that feeds an array of
 * StreamChunks through a fresh StreamProcessor, bookended with a
 * TEXT_MESSAGE_START / TEXT_MESSAGE_END / RUN_FINISHED sequence so the
 * processor has a proper assistant message to attach parts to.
 *
 * Copied from the setup pattern in `packages/ai/tests/stream-processor.test.ts`.
 */
import { StreamProcessor } from '../../src/activities/chat/stream/processor'
import { EventType } from '../../src/types'
import type { StreamChunk, UIMessage } from '../../src/types'

/**
 * A RUN_STARTED chunk. Typed factories like this keep the discriminated-union
 * literal narrow (so it's assignable to `StreamChunk` with no cast) while
 * defaulting the bookkeeping fields tests rarely care about.
 */
export function runStartedChunk(
  overrides: { runId?: string; threadId?: string } = {},
): StreamChunk {
  return {
    type: EventType.RUN_STARTED,
    timestamp: Date.now(),
    runId: overrides.runId ?? 'run-1',
    threadId: overrides.threadId ?? 'thread-1',
  }
}

/** A TEXT_MESSAGE_START chunk for an assistant message. */
export function textMessageStartChunk(messageId = 'msg-1'): StreamChunk {
  return {
    type: EventType.TEXT_MESSAGE_START,
    timestamp: Date.now(),
    messageId,
    role: 'assistant',
  }
}

/** A ui-resource CUSTOM event chunk (MCP Apps). */
export function uiResourceChunk(
  value: Extract<StreamChunk, { type: 'CUSTOM' }>['value'],
): StreamChunk {
  return {
    type: EventType.CUSTOM,
    timestamp: Date.now(),
    name: 'ui-resource',
    value,
  }
}

/**
 * Run a StreamProcessor with the given chunks and return the last assistant
 * UIMessage produced.
 *
 * The helper wraps the provided chunks with the minimal bookkeeping events
 * (RUN_STARTED, TEXT_MESSAGE_START, TEXT_MESSAGE_END, RUN_FINISHED) so that
 * an active assistant message always exists when the custom chunks are processed.
 *
 * @returns The last assistant UIMessage from the processor after the stream ends.
 */
export async function runProcessorWithChunks(
  chunks: Array<StreamChunk>,
): Promise<UIMessage> {
  const processor = new StreamProcessor()

  const envelopeChunks: Array<StreamChunk> = [
    runStartedChunk(),
    textMessageStartChunk(),
    ...chunks,
    {
      type: EventType.TEXT_MESSAGE_END,
      timestamp: Date.now(),
      messageId: 'msg-1',
    },
    {
      type: EventType.RUN_FINISHED,
      timestamp: Date.now(),
      runId: 'run-1',
      threadId: 'thread-1',
      finishReason: 'stop',
    },
  ]

  async function* streamOf(cs: Array<StreamChunk>): AsyncIterable<StreamChunk> {
    for (const c of cs) {
      yield c
    }
  }

  await processor.process(streamOf(envelopeChunks))

  const messages = processor.getMessages()
  const assistant = messages.findLast((m) => m.role === 'assistant')
  if (!assistant) {
    throw new Error(
      'runProcessorWithChunks: no assistant message produced. Messages: ' +
        JSON.stringify(messages),
    )
  }
  return assistant
}
