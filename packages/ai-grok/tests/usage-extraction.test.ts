import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import { GrokTextAdapter } from '../src/adapters/text'
import type { StreamChunk } from '@tanstack/ai'

const mocks = vi.hoisted(() => {
  const chatCompletionsCreate = vi.fn()
  return { chatCompletionsCreate }
})

// Mock the SDK using a constructor function rather than a `class` with a `chat`
// field: `useDefineForClassFields: true` emits real ES2022 class fields, and
// vitest's mock-hoister mis-rewrites a field named `chat` because that
// identifier is also a named import on line 2 (`import { chat } from
// '@tanstack/ai'`). A plain constructor function with `this.*` sidesteps it.
vi.mock('openai', () => {
  const { chatCompletionsCreate } = mocks

  function MockOpenAI(this: {
    chat: { completions: { create: typeof chatCompletionsCreate } }
  }) {
    this.chat = {
      completions: {
        create: chatCompletionsCreate,
      },
    }
  }

  return { default: MockOpenAI }
})

const createAdapter = () =>
  new GrokTextAdapter({ apiKey: 'test-key' }, 'grok-3')

function createMockStream(
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

describe('Grok usage extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('extracts basic token usage from chat completions', async () => {
    const mockStream = createMockStream([
      {
        id: 'chatcmpl-123',
        choices: [
          {
            delta: { content: 'Hello world' },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-123',
        choices: [
          {
            delta: {},
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      },
    ])

    mocks.chatCompletionsCreate.mockResolvedValueOnce(mockStream)

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

  it('extracts prompt tokens details with cached tokens', async () => {
    const mockStream = createMockStream([
      {
        id: 'chatcmpl-123',
        choices: [
          {
            delta: { content: 'Hello world' },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-123',
        choices: [
          {
            delta: {},
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          prompt_tokens_details: {
            cached_tokens: 25,
          },
        },
      },
    ])

    mocks.chatCompletionsCreate.mockResolvedValueOnce(mockStream)

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
      expect(doneChunk.usage?.promptTokensDetails).toEqual({
        cachedTokens: 25,
      })
    }
  })

  it('extracts completion tokens details with reasoning tokens', async () => {
    const mockStream = createMockStream([
      {
        id: 'chatcmpl-123',
        choices: [
          {
            delta: { content: 'Hello world' },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-123',
        choices: [
          {
            delta: {},
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          completion_tokens_details: {
            reasoning_tokens: 30,
          },
        },
      },
    ])

    mocks.chatCompletionsCreate.mockResolvedValueOnce(mockStream)

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
      expect(doneChunk.usage?.completionTokensDetails).toEqual({
        reasoningTokens: 30,
      })
    }
  })

  it('surfaces predicted-output tokens in providerUsageDetails', async () => {
    const mockStream = createMockStream([
      {
        id: 'chatcmpl-123',
        choices: [{ delta: { content: 'Hello world' }, finish_reason: null }],
      },
      {
        id: 'chatcmpl-123',
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          completion_tokens_details: {
            accepted_prediction_tokens: 20,
            rejected_prediction_tokens: 5,
          },
        },
      },
    ])

    mocks.chatCompletionsCreate.mockResolvedValueOnce(mockStream)

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
      expect(doneChunk.usage?.providerUsageDetails).toEqual({
        acceptedPredictionTokens: 20,
        rejectedPredictionTokens: 5,
      })
    }
  })

  it('extracts audio tokens in prompt details', async () => {
    const mockStream = createMockStream([
      {
        id: 'chatcmpl-123',
        choices: [
          {
            delta: { content: 'Hello world' },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-123',
        choices: [
          {
            delta: {},
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          prompt_tokens_details: {
            audio_tokens: 15,
          },
        },
      },
    ])

    mocks.chatCompletionsCreate.mockResolvedValueOnce(mockStream)

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
      expect(doneChunk.usage?.promptTokensDetails).toEqual({
        audioTokens: 15,
      })
    }
  })

  it('handles response with no usage data', async () => {
    const mockStream = createMockStream([
      {
        id: 'chatcmpl-123',
        choices: [
          {
            delta: { content: 'Hello world' },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-123',
        choices: [
          {
            delta: {},
            finish_reason: 'stop',
          },
        ],
        // No usage field
      },
    ])

    mocks.chatCompletionsCreate.mockResolvedValueOnce(mockStream)

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
      expect(doneChunk.usage).toBeUndefined()
    }
  })

  it('omits empty details when all values are zero', async () => {
    const mockStream = createMockStream([
      {
        id: 'chatcmpl-123',
        choices: [
          {
            delta: { content: 'Hello world' },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-123',
        choices: [
          {
            delta: {},
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          prompt_tokens_details: {
            cached_tokens: 0,
            audio_tokens: 0,
          },
          completion_tokens_details: {
            reasoning_tokens: 0,
          },
        },
      },
    ])

    mocks.chatCompletionsCreate.mockResolvedValueOnce(mockStream)

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
      expect(doneChunk.usage?.promptTokensDetails).toBeUndefined()
      expect(doneChunk.usage?.completionTokensDetails).toBeUndefined()
    }
  })
})
