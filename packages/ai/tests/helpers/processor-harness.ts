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
    {
      type: EventType.RUN_STARTED,
      timestamp: Date.now(),
      runId: 'run-1',
      threadId: 'thread-1',
    } as Extract<StreamChunk, { type: 'RUN_STARTED' }>,
    {
      type: EventType.TEXT_MESSAGE_START,
      timestamp: Date.now(),
      messageId: 'msg-1',
      role: 'assistant' as const,
    } as Extract<StreamChunk, { type: 'TEXT_MESSAGE_START' }>,
    ...chunks,
    {
      type: EventType.TEXT_MESSAGE_END,
      timestamp: Date.now(),
      messageId: 'msg-1',
    } as Extract<StreamChunk, { type: 'TEXT_MESSAGE_END' }>,
    {
      type: EventType.RUN_FINISHED,
      timestamp: Date.now(),
      runId: 'run-1',
      threadId: 'thread-1',
      finishReason: 'stop' as const,
    } as Extract<StreamChunk, { type: 'RUN_FINISHED' }>,
  ]

  async function* streamOf(
    cs: Array<StreamChunk>,
  ): AsyncIterable<StreamChunk> {
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
