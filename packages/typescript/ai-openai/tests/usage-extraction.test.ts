import { describe, expect, it, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import { OpenAITextAdapter } from '../src/adapters/text'
import type { StreamChunk } from '@tanstack/ai'

const createAdapter = () =>
  new OpenAITextAdapter({ apiKey: 'test-key' }, 'gpt-4o-mini')

function createMockResponsesStream(
  chunks: Array<Record<string, unknown>>,
): AsyncIterable<Record<string, unknown>> {
  return {
    // eslint-disable-next-line @typescript-eslint/require-await
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk
      }
    },
  }
}

describe('OpenAI usage extraction', () => {
  it('extracts basic token usage from response.done', async () => {
    const mockStream = createMockResponsesStream([
      {
        type: 'response.created',
        response: {
          id: 'resp-123',
          model: 'gpt-4o-mini',
          status: 'in_progress',
          created_at: 1234567890,
        },
      },
      {
        type: 'response.output_text.done',
        text: 'Hello world',
      },
      {
        type: 'response.completed',
        response: {
          id: 'resp-123',
          model: 'gpt-4o-mini',
          status: 'completed',
          output: [],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
          },
        },
      },
    ])

    const responsesCreate = vi.fn().mockResolvedValueOnce(mockStream)
    const adapter = createAdapter()
    ;(adapter as any).client = {
      responses: { create: responsesCreate },
    }

    const chunks: Array<StreamChunk> = []
    for await (const chunk of chat({
      adapter,
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
      chunks.push(chunk)
    }

    const doneChunk = chunks.find((c) => c.type === 'done')
    expect(doneChunk).toBeDefined()
    expect(doneChunk?.usage).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    })
  })

  it('extracts prompt tokens details with cached tokens', async () => {
    const mockStream = createMockResponsesStream([
      {
        type: 'response.created',
        response: {
          id: 'resp-123',
          model: 'gpt-4o-mini',
          status: 'in_progress',
          created_at: 1234567890,
        },
      },
      {
        type: 'response.output_text.done',
        text: 'Hello world',
      },
      {
        type: 'response.completed',
        response: {
          id: 'resp-123',
          model: 'gpt-4o-mini',
          status: 'completed',
          output: [],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
            input_tokens_details: {
              cached_tokens: 25,
            },
          },
        },
      },
    ])

    const responsesCreate = vi.fn().mockResolvedValueOnce(mockStream)
    const adapter = createAdapter()
    ;(adapter as any).client = {
      responses: { create: responsesCreate },
    }

    const chunks: Array<StreamChunk> = []
    for await (const chunk of chat({
      adapter,
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
      chunks.push(chunk)
    }

    const doneChunk = chunks.find((c) => c.type === 'done')
    expect(doneChunk).toBeDefined()
    expect(doneChunk?.usage?.promptTokensDetails).toEqual({
      cachedTokens: 25,
    })
  })

  it('extracts completion tokens details with reasoning tokens', async () => {
    const mockStream = createMockResponsesStream([
      {
        type: 'response.created',
        response: {
          id: 'resp-123',
          model: 'gpt-4o-mini',
          status: 'in_progress',
          created_at: 1234567890,
        },
      },
      {
        type: 'response.output_text.done',
        text: 'Hello world',
      },
      {
        type: 'response.completed',
        response: {
          id: 'resp-123',
          model: 'gpt-4o-mini',
          status: 'completed',
          output: [],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
            output_tokens_details: {
              reasoning_tokens: 30,
            },
          },
        },
      },
    ])

    const responsesCreate = vi.fn().mockResolvedValueOnce(mockStream)
    const adapter = createAdapter()
    ;(adapter as any).client = {
      responses: { create: responsesCreate },
    }

    const chunks: Array<StreamChunk> = []
    for await (const chunk of chat({
      adapter,
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
      chunks.push(chunk)
    }

    const doneChunk = chunks.find((c) => c.type === 'done')
    expect(doneChunk).toBeDefined()
    expect(doneChunk?.usage?.completionTokensDetails).toEqual({
      reasoningTokens: 30,
    })
  })

  it('handles response with no usage data', async () => {
    const mockStream = createMockResponsesStream([
      {
        type: 'response.created',
        response: {
          id: 'resp-123',
          model: 'gpt-4o-mini',
          status: 'in_progress',
          created_at: 1234567890,
        },
      },
      {
        type: 'response.output_text.done',
        text: 'Hello world',
      },
      {
        type: 'response.completed',
        response: {
          id: 'resp-123',
          model: 'gpt-4o-mini',
          status: 'completed',
          output: [],
          // No usage field
        },
      },
    ])

    const responsesCreate = vi.fn().mockResolvedValueOnce(mockStream)
    const adapter = createAdapter()
    ;(adapter as any).client = {
      responses: { create: responsesCreate },
    }

    const chunks: Array<StreamChunk> = []
    for await (const chunk of chat({
      adapter,
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
      chunks.push(chunk)
    }

    const doneChunk = chunks.find((c) => c.type === 'done')
    expect(doneChunk).toBeDefined()
    expect(doneChunk?.usage).toBeUndefined()
  })

  it('omits empty prompt details when all values are zero', async () => {
    const mockStream = createMockResponsesStream([
      {
        type: 'response.created',
        response: {
          id: 'resp-123',
          model: 'gpt-4o-mini',
          status: 'in_progress',
          created_at: 1234567890,
        },
      },
      {
        type: 'response.output_text.done',
        text: 'Hello world',
      },
      {
        type: 'response.completed',
        response: {
          id: 'resp-123',
          model: 'gpt-4o-mini',
          status: 'completed',
          output: [],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
            input_tokens_details: {
              cached_tokens: 0,
              audio_tokens: 0,
            },
          },
        },
      },
    ])

    const responsesCreate = vi.fn().mockResolvedValueOnce(mockStream)
    const adapter = createAdapter()
    ;(adapter as any).client = {
      responses: { create: responsesCreate },
    }

    const chunks: Array<StreamChunk> = []
    for await (const chunk of chat({
      adapter,
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
      chunks.push(chunk)
    }

    const doneChunk = chunks.find((c) => c.type === 'done')
    expect(doneChunk).toBeDefined()
    expect(doneChunk?.usage?.promptTokensDetails).toBeUndefined()
  })
})
