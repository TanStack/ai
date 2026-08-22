import { describe, expect, it } from 'vitest'
import { EventType } from '../src/types'
import { ChatStreamSummarizeAdapter } from '../src/activities/summarize/chat-stream-summarize'
import { resolveDebugOption } from '../src/logger/resolve'
import type { ChatStreamCapable } from '../src/activities/summarize/chat-stream-summarize'
import type { StreamChunk } from '../src/types'

const logger = resolveDebugOption(false)

function textAdapter(chunks: ReadonlyArray<StreamChunk>): ChatStreamCapable {
  return {
    chatStream(): AsyncIterable<StreamChunk> {
      return (async function* () {
        for (const chunk of chunks) yield chunk
      })()
    },
  }
}

function specRunStarted(model: string): StreamChunk {
  return {
    type: EventType.RUN_STARTED,
    threadId: 'thread-1',
    runId: 'run-1',
    timestamp: 1,
    metadata: { tanstack: { model } },
  }
}

function specTextStart(model: string): StreamChunk {
  return {
    type: EventType.TEXT_MESSAGE_START,
    messageId: 'msg-1',
    role: 'assistant',
    timestamp: 1,
    metadata: { tanstack: { model } },
  }
}

function specDelta(delta: string): StreamChunk {
  return {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'msg-1',
    delta,
    timestamp: 1,
  }
}

function specRunFinished(options?: {
  model?: string
  usage?: Array<{
    model?: string
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
  }>
  leftover?: Record<string, unknown>
}): StreamChunk {
  const tanstack: Record<string, unknown> = {
    finishReason: 'stop',
  }
  if (options?.model !== undefined) tanstack.model = options.model
  if (options?.leftover !== undefined) tanstack.usage = options.leftover
  return {
    type: EventType.RUN_FINISHED,
    threadId: 'thread-1',
    runId: 'run-1',
    timestamp: 1,
    ...(options?.usage !== undefined ? { usage: options.usage } : {}),
    metadata: { tanstack },
  } as StreamChunk
}

describe('ChatStreamSummarizeAdapter — spec stream chunks', () => {
  it('accumulates summary from TEXT_MESSAGE_CONTENT.delta only', async () => {
    const adapter = new ChatStreamSummarizeAdapter(
      textAdapter([
        specRunStarted('options-model'),
        specDelta('Hello'),
        specDelta(' world'),
        specRunFinished(),
      ]),
      'options-model',
      'openai',
    )

    const result = await adapter.summarize({
      model: 'options-model',
      text: 'long text',
      logger,
    })

    expect(result.summary).toBe('Hello world')
  })

  it('reads model from metadata.tanstack on RUN_STARTED', async () => {
    const adapter = new ChatStreamSummarizeAdapter(
      textAdapter([
        specRunStarted('started-model'),
        specDelta('ok'),
        specRunFinished(),
      ]),
      'options-model',
      'openai',
    )

    const result = await adapter.summarize({
      model: 'options-model',
      text: 'long text',
      logger,
    })

    expect(result.model).toBe('started-model')
  })

  it('reads model from metadata.tanstack on TEXT_MESSAGE_START', async () => {
    const adapter = new ChatStreamSummarizeAdapter(
      textAdapter([
        specTextStart('start-model'),
        specDelta('ok'),
        specRunFinished(),
      ]),
      'options-model',
      'openai',
    )

    const result = await adapter.summarize({
      model: 'options-model',
      text: 'long text',
      logger,
    })

    expect(result.model).toBe('start-model')
  })

  it('reads model and usage from RUN_FINISHED spec usage[] + metadata.tanstack', async () => {
    const adapter = new ChatStreamSummarizeAdapter(
      textAdapter([
        specRunStarted('started-model'),
        specDelta('ok'),
        specRunFinished({
          model: 'finished-model',
          usage: [
            {
              model: 'finished-model',
              inputTokens: 10,
              outputTokens: 5,
              totalTokens: 15,
            },
          ],
          leftover: { cost: 0.02 },
        }),
      ]),
      'options-model',
      'openai',
    )

    const result = await adapter.summarize({
      model: 'options-model',
      text: 'long text',
      logger,
    })

    expect(result.model).toBe('finished-model')
    expect(result.usage).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      cost: 0.02,
    })
  })

  it('throws Error(message) from RUN_ERROR.message when nested error is absent', async () => {
    const adapter = new ChatStreamSummarizeAdapter(
      textAdapter([
        specRunStarted('options-model'),
        {
          type: EventType.RUN_ERROR,
          timestamp: 1,
          message: 'provider exploded',
          code: 'provider-error',
        },
      ]),
      'options-model',
      'openai',
    )

    await expect(
      adapter.summarize({
        model: 'options-model',
        text: 'long text',
        logger,
      }),
    ).rejects.toMatchObject({
      message: 'provider exploded',
      code: 'provider-error',
    })
  })

  it('puts model on generation:result value, not as a CUSTOM extra', async () => {
    const adapter = new ChatStreamSummarizeAdapter(
      textAdapter([
        specRunStarted('started-model'),
        specDelta('ok'),
        specRunFinished({ model: 'finished-model' }),
      ]),
      'options-model',
      'openai',
    )

    const chunks: Array<StreamChunk> = []
    for await (const chunk of adapter.summarizeStream({
      model: 'options-model',
      text: 'long text',
      logger,
    })) {
      chunks.push(chunk)
    }

    const resultChunk = chunks.find(
      (chunk) =>
        chunk.type === EventType.CUSTOM && chunk.name === 'generation:result',
    )
    expect(resultChunk).toBeDefined()
    expect(resultChunk).not.toHaveProperty('model')
    expect(resultChunk).toMatchObject({
      type: EventType.CUSTOM,
      name: 'generation:result',
      value: {
        model: 'finished-model',
        summary: 'ok',
      },
    })
  })
})
