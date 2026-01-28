import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import { createOpenRouterText } from '../src/adapters/text'
import type { Mock } from 'vitest'
import type { StreamChunk } from '@tanstack/ai'

let mockSend: Mock

vi.mock('@openrouter/sdk', () => {
  return {
    OpenRouter: class {
      chat = {
        send: (...args: Array<unknown>) => mockSend(...args),
      }
    },
  }
})

const createAdapter = () =>
  createOpenRouterText('openai/gpt-4o-mini', 'test-key')

function createAsyncIterable<T>(chunks: Array<T>): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      let index = 0
      return {
        // eslint-disable-next-line @typescript-eslint/require-await
        async next() {
          if (index < chunks.length) {
            return { value: chunks[index++]!, done: false }
          }
          return { value: undefined as T, done: true }
        },
      }
    },
  }
}

describe('OpenRouter usage extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSend = vi.fn()
  })

  it('extracts basic token usage from stream', async () => {
    const streamChunks = [
      {
        id: 'chatcmpl-123',
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            delta: { content: 'Hello world' },
            finishReason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-123',
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            delta: {},
            finishReason: 'stop',
          },
        ],
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
      },
    ]

    mockSend.mockImplementation((params) => {
      if (params.stream) {
        return Promise.resolve(createAsyncIterable(streamChunks))
      }
      return Promise.resolve({})
    })

    const chunks: Array<StreamChunk> = []
    for await (const chunk of chat({
      adapter: createAdapter(),
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
      chunks.push(chunk)
    }

    const doneChunk = chunks.find((c) => c.type === 'done')
    expect(doneChunk).toBeDefined()
    expect(doneChunk?.usage).toMatchObject({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    })
  })

  it('extracts prompt tokens details', async () => {
    const streamChunks = [
      {
        id: 'chatcmpl-123',
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            delta: { content: 'Hello world' },
            finishReason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-123',
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            delta: {},
            finishReason: 'stop',
          },
        ],
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          promptTokensDetails: {
            cachedTokens: 25,
          },
        },
      },
    ]

    mockSend.mockImplementation((params) => {
      if (params.stream) {
        return Promise.resolve(createAsyncIterable(streamChunks))
      }
      return Promise.resolve({})
    })

    const chunks: Array<StreamChunk> = []
    for await (const chunk of chat({
      adapter: createAdapter(),
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
    const streamChunks = [
      {
        id: 'chatcmpl-123',
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            delta: { content: 'Hello world' },
            finishReason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-123',
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            delta: {},
            finishReason: 'stop',
          },
        ],
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          completionTokensDetails: {
            reasoningTokens: 30,
          },
        },
      },
    ]

    mockSend.mockImplementation((params) => {
      if (params.stream) {
        return Promise.resolve(createAsyncIterable(streamChunks))
      }
      return Promise.resolve({})
    })

    const chunks: Array<StreamChunk> = []
    for await (const chunk of chat({
      adapter: createAdapter(),
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

  it('extracts completion tokens details with prediction tokens', async () => {
    const streamChunks = [
      {
        id: 'chatcmpl-123',
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            delta: { content: 'Hello world' },
            finishReason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-123',
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            delta: {},
            finishReason: 'stop',
          },
        ],
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          completionTokensDetails: {
            acceptedPredictionTokens: 20,
            rejectedPredictionTokens: 5,
          },
        },
      },
    ]

    mockSend.mockImplementation((params) => {
      if (params.stream) {
        return Promise.resolve(createAsyncIterable(streamChunks))
      }
      return Promise.resolve({})
    })

    const chunks: Array<StreamChunk> = []
    for await (const chunk of chat({
      adapter: createAdapter(),
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
      chunks.push(chunk)
    }

    const doneChunk = chunks.find((c) => c.type === 'done')
    expect(doneChunk).toBeDefined()
    // Prediction tokens are OpenRouter-specific, so they go in providerUsageDetails
    expect(doneChunk?.usage?.providerUsageDetails).toEqual({
      acceptedPredictionTokens: 20,
      rejectedPredictionTokens: 5,
    })
  })

  it('handles response with no usage data - no done chunk emitted', async () => {
    const streamChunks = [
      {
        id: 'chatcmpl-123',
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            delta: { content: 'Hello world' },
            finishReason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-123',
        model: 'openai/gpt-4o-mini',
        choices: [
          {
            delta: {},
            finishReason: 'stop',
          },
        ],
        // No usage field
      },
    ]

    mockSend.mockImplementation((params) => {
      if (params.stream) {
        return Promise.resolve(createAsyncIterable(streamChunks))
      }
      return Promise.resolve({})
    })

    const chunks: Array<StreamChunk> = []
    for await (const chunk of chat({
      adapter: createAdapter(),
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
      chunks.push(chunk)
    }

    // When usage is not provided, the adapter doesn't emit a done chunk
    const doneChunk = chunks.find((c) => c.type === 'done')
    expect(doneChunk).toBeUndefined()
  })
})
