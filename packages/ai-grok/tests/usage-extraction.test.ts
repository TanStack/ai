import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import { GrokTextAdapter } from '../src/adapters/text'
import type { StreamChunk } from '@tanstack/ai'

const mocks = vi.hoisted(() => {
  const responsesCreate = vi.fn()
  return { responsesCreate }
})

vi.mock('openai', () => {
  const { responsesCreate } = mocks

  function MockOpenAI(this: { responses: { create: typeof responsesCreate } }) {
    this.responses = {
      create: responsesCreate,
    }
  }

  return { default: MockOpenAI }
})

const createAdapter = () =>
  new GrokTextAdapter({ apiKey: 'test-key' }, 'grok-4.3')

function createMockStream(
  chunks: Array<Record<string, unknown>>,
): AsyncIterable<Record<string, unknown>> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk
      }
    },
  }
}

function responseStreamWithUsage(usage: Record<string, unknown>) {
  return createMockStream([
    {
      type: 'response.created',
      response: { id: 'resp_123', model: 'grok-4.3' },
    },
    {
      type: 'response.output_text.delta',
      delta: 'Hello world',
    },
    {
      type: 'response.completed',
      response: {
        id: 'resp_123',
        model: 'grok-4.3',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Hello world' }],
          },
        ],
        usage,
      },
    },
  ])
}

describe('Grok usage extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('extracts basic token usage from Responses API streams', async () => {
    mocks.responsesCreate.mockResolvedValueOnce(
      responseStreamWithUsage({
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 150,
      }),
    )

    const chunks: Array<StreamChunk> = []
    for await (const chunk of chat({
      adapter: createAdapter(),
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
      chunks.push(chunk)
    }

    const doneChunk = chunks.find((c) => c.type === 'RUN_FINISHED')
    expect(doneChunk).toBeDefined()
    if (doneChunk?.type === 'RUN_FINISHED') {
      expect(doneChunk.usage).toMatchObject({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      })
    }
  })

  it('extracts cached prompt and reasoning output token details', async () => {
    mocks.responsesCreate.mockResolvedValueOnce(
      responseStreamWithUsage({
        input_tokens: 100,
        output_tokens: 80,
        total_tokens: 180,
        input_tokens_details: {
          cached_tokens: 25,
        },
        output_tokens_details: {
          reasoning_tokens: 30,
        },
      }),
    )

    const chunks: Array<StreamChunk> = []
    for await (const chunk of chat({
      adapter: createAdapter(),
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
      chunks.push(chunk)
    }

    const doneChunk = chunks.find((c) => c.type === 'RUN_FINISHED')
    expect(doneChunk).toBeDefined()
    if (doneChunk?.type === 'RUN_FINISHED') {
      expect(doneChunk.usage).toMatchObject({
        promptTokens: 100,
        completionTokens: 80,
        totalTokens: 180,
        promptTokensDetails: {
          cachedTokens: 25,
        },
        completionTokensDetails: {
          reasoningTokens: 30,
        },
      })
    }
  })
})
