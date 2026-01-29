import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import { GeminiTextAdapter } from '../src/adapters/text'
import type { StreamChunk } from '@tanstack/ai'

const mocks = vi.hoisted(() => {
  return {
    constructorSpy: vi.fn<(options: { apiKey: string }) => void>(),
    generateContentStreamSpy: vi.fn(),
  }
})

vi.mock('@google/genai', async () => {
  const { constructorSpy, generateContentStreamSpy } = mocks

  const actual = await vi.importActual('@google/genai')
  class MockGoogleGenAI {
    public models = {
      generateContentStream: generateContentStreamSpy,
    }

    constructor(options: { apiKey: string }) {
      constructorSpy(options)
    }
  }

  return {
    GoogleGenAI: MockGoogleGenAI,
    Type: actual.Type,
    FinishReason: actual.FinishReason,
  }
})

const createAdapter = () =>
  new GeminiTextAdapter({ apiKey: 'test-key' }, 'gemini-2.5-pro')

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

describe('Gemini usage extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('extracts basic token usage from usageMetadata', async () => {
    const mockStream = createMockStream([
      {
        candidates: [
          {
            content: {
              parts: [{ text: 'Hello world' }],
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 50,
          totalTokenCount: 150,
        },
      },
    ])

    mocks.generateContentStreamSpy.mockResolvedValueOnce(mockStream)

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

  it('extracts cached content token count', async () => {
    const mockStream = createMockStream([
      {
        candidates: [
          {
            content: {
              parts: [{ text: 'Hello world' }],
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 50,
          totalTokenCount: 150,
          cachedContentTokenCount: 25,
        },
      },
    ])

    mocks.generateContentStreamSpy.mockResolvedValueOnce(mockStream)

    const chunks: Array<StreamChunk> = []
    for await (const chunk of chat({
      adapter: createAdapter(),
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
      chunks.push(chunk)
    }

    const doneChunk = chunks.find((c) => c.type === 'done')
    expect(doneChunk).toBeDefined()
    expect(doneChunk?.usage?.promptTokensDetails).toMatchObject({
      cachedTokens: 25,
    })
  })

  it('extracts thoughts/reasoning tokens', async () => {
    const mockStream = createMockStream([
      {
        candidates: [
          {
            content: {
              parts: [{ text: 'Hello world' }],
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 50,
          totalTokenCount: 150,
          thoughtsTokenCount: 30,
        },
      },
    ])

    mocks.generateContentStreamSpy.mockResolvedValueOnce(mockStream)

    const chunks: Array<StreamChunk> = []
    for await (const chunk of chat({
      adapter: createAdapter(),
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
      chunks.push(chunk)
    }

    const doneChunk = chunks.find((c) => c.type === 'done')
    expect(doneChunk).toBeDefined()
    expect(doneChunk?.usage?.completionTokensDetails).toMatchObject({
      reasoningTokens: 30,
    })
  })

  it('extracts modality token breakdown for prompt', async () => {
    const mockStream = createMockStream([
      {
        candidates: [
          {
            content: {
              parts: [{ text: 'Hello world' }],
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 150,
          candidatesTokenCount: 50,
          totalTokenCount: 200,
          promptTokensDetails: [
            { modality: 'TEXT', tokenCount: 100 },
            { modality: 'IMAGE', tokenCount: 50 },
          ],
        },
      },
    ])

    mocks.generateContentStreamSpy.mockResolvedValueOnce(mockStream)

    const chunks: Array<StreamChunk> = []
    for await (const chunk of chat({
      adapter: createAdapter(),
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
      chunks.push(chunk)
    }

    const doneChunk = chunks.find((c) => c.type === 'done')
    expect(doneChunk).toBeDefined()
    expect(doneChunk?.usage?.promptTokensDetails).toMatchObject({
      textTokens: 100,
      imageTokens: 50,
    })
  })

  it('extracts modality token breakdown for completion', async () => {
    const mockStream = createMockStream([
      {
        candidates: [
          {
            content: {
              parts: [{ text: 'Hello world' }],
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 80,
          totalTokenCount: 180,
          candidatesTokensDetails: [
            { modality: 'TEXT', tokenCount: 50 },
            { modality: 'AUDIO', tokenCount: 30 },
          ],
        },
      },
    ])

    mocks.generateContentStreamSpy.mockResolvedValueOnce(mockStream)

    const chunks: Array<StreamChunk> = []
    for await (const chunk of chat({
      adapter: createAdapter(),
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
      chunks.push(chunk)
    }

    const doneChunk = chunks.find((c) => c.type === 'done')
    expect(doneChunk).toBeDefined()
    expect(doneChunk?.usage?.completionTokensDetails).toMatchObject({
      textTokens: 50,
      audioTokens: 30,
    })
  })

  it('extracts provider-specific traffic type', async () => {
    const mockStream = createMockStream([
      {
        candidates: [
          {
            content: {
              parts: [{ text: 'Hello world' }],
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 50,
          totalTokenCount: 150,
          trafficType: 'ON_DEMAND',
        },
      },
    ])

    mocks.generateContentStreamSpy.mockResolvedValueOnce(mockStream)

    const chunks: Array<StreamChunk> = []
    for await (const chunk of chat({
      adapter: createAdapter(),
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
      chunks.push(chunk)
    }

    const doneChunk = chunks.find((c) => c.type === 'done')
    expect(doneChunk).toBeDefined()
    expect(doneChunk?.usage?.providerUsageDetails).toMatchObject({
      trafficType: 'ON_DEMAND',
    })
  })

  it('extracts tool use prompt token count', async () => {
    const mockStream = createMockStream([
      {
        candidates: [
          {
            content: {
              parts: [{ text: 'Hello world' }],
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 50,
          totalTokenCount: 150,
          toolUsePromptTokenCount: 20,
        },
      },
    ])

    mocks.generateContentStreamSpy.mockResolvedValueOnce(mockStream)

    const chunks: Array<StreamChunk> = []
    for await (const chunk of chat({
      adapter: createAdapter(),
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
      chunks.push(chunk)
    }

    const doneChunk = chunks.find((c) => c.type === 'done')
    expect(doneChunk).toBeDefined()
    expect(doneChunk?.usage?.providerUsageDetails).toMatchObject({
      toolUsePromptTokenCount: 20,
    })
  })

  it('handles response with no usage metadata', async () => {
    const mockStream = createMockStream([
      {
        candidates: [
          {
            content: {
              parts: [{ text: 'Hello world' }],
            },
            finishReason: 'STOP',
          },
        ],
        // No usageMetadata
      },
    ])

    mocks.generateContentStreamSpy.mockResolvedValueOnce(mockStream)

    const chunks: Array<StreamChunk> = []
    for await (const chunk of chat({
      adapter: createAdapter(),
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
      chunks.push(chunk)
    }

    const doneChunk = chunks.find((c) => c.type === 'done')
    expect(doneChunk).toBeDefined()
    // When no usageMetadata is provided, usage is undefined
    expect(doneChunk?.usage).toBeUndefined()
  })
})
