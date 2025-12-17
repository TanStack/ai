import { describe, expect, it, vi } from 'vitest'
import { chat, embedding, summarize } from '../src/activities'
import {
  BaseTextAdapter,
  BaseEmbeddingAdapter,
  BaseSummarizeAdapter,
} from '../src/activities'
import type { StructuredOutputResult } from '../src/activities'
import type {
  TextOptions,
  EmbeddingOptions,
  EmbeddingResult,
  ModelMessage,
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
} from '../src'

// Mock adapters for testing

const MOCK_MODELS = ['model-a', 'model-b'] as const
type MockModel = (typeof MOCK_MODELS)[number]

class MockTextAdapter<
  TModel extends MockModel = 'model-a',
> extends BaseTextAdapter<
  TModel,
  Record<string, unknown>,
  readonly ['text', 'image', 'audio', 'video', 'document'],
  {
    text: unknown
    image: unknown
    audio: unknown
    video: unknown
    document: unknown
  }
> {
  readonly kind = 'text' as const
  readonly name = 'mock' as const

  private mockChunks: Array<StreamChunk>

  constructor(
    mockChunks: Array<StreamChunk> = [],
    model: TModel = 'model-a' as TModel,
  ) {
    super({}, model)
    this.mockChunks = mockChunks
  }

  async *chatStream(_options: TextOptions): AsyncIterable<StreamChunk> {
    for (const chunk of this.mockChunks) {
      yield chunk
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  structuredOutput(_options: any): Promise<StructuredOutputResult<unknown>> {
    return Promise.resolve({
      data: {},
      rawText: '{}',
    })
  }
}

class MockEmbeddingAdapter extends BaseEmbeddingAdapter<
  typeof MOCK_MODELS,
  Record<string, unknown>,
  (typeof MOCK_MODELS)[number]
> {
  readonly kind = 'embedding' as const
  readonly name = 'mock' as const
  readonly models = MOCK_MODELS

  private mockResult: EmbeddingResult

  constructor(
    mockResult?: EmbeddingResult,
    selectedModel: (typeof MOCK_MODELS)[number] = 'model-a',
  ) {
    super({}, selectedModel)
    this.mockResult = mockResult ?? {
      id: 'test-id',
      model: 'model-a',
      embeddings: [[0.1, 0.2, 0.3]],
      usage: { promptTokens: 10, totalTokens: 10 },
    }
  }

  createEmbeddings(_options: EmbeddingOptions): Promise<EmbeddingResult> {
    return Promise.resolve(this.mockResult)
  }
}

class MockSummarizeAdapter extends BaseSummarizeAdapter<
  typeof MOCK_MODELS,
  Record<string, unknown>,
  (typeof MOCK_MODELS)[number]
> {
  readonly kind = 'summarize' as const
  readonly name = 'mock' as const
  readonly models = MOCK_MODELS

  private mockResult: SummarizationResult

  constructor(
    mockResult?: SummarizationResult,
    selectedModel: (typeof MOCK_MODELS)[number] = 'model-a',
  ) {
    super({}, selectedModel)
    this.mockResult = mockResult ?? {
      id: 'test-id',
      model: 'model-a',
      summary: 'This is a summary.',
      usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
    }
  }

  summarize(_options: SummarizationOptions): Promise<SummarizationResult> {
    return Promise.resolve(this.mockResult)
  }
}

describe('generate function', () => {
  describe('with chat adapter', () => {
    it('should return an async iterable of StreamChunks', async () => {
      const mockChunks: Array<StreamChunk> = [
        {
          type: 'content',
          id: '1',
          model: 'model-a',
          delta: 'Hello',
          content: 'Hello',
          timestamp: Date.now(),
        },
        {
          type: 'content',
          id: '2',
          model: 'model-a',
          delta: ' world',
          content: 'Hello world',
          timestamp: Date.now(),
        },
        {
          type: 'done',
          id: '3',
          model: 'model-a',
          timestamp: Date.now(),
          finishReason: 'stop',
        },
      ]

      const adapter = new MockTextAdapter(mockChunks)
      const messages: Array<ModelMessage> = [
        { role: 'user', content: [{ type: 'text', content: 'Hi' }] },
      ]

      const result = chat({
        adapter,
        messages,
      })

      // Result should be an async iterable
      expect(result).toBeDefined()
      expect(typeof result[Symbol.asyncIterator]).toBe('function')

      // Collect all chunks
      const collected: Array<StreamChunk> = []
      for await (const chunk of result) {
        collected.push(chunk)
      }

      expect(collected).toHaveLength(3)
      expect(collected[0]?.type).toBe('content')
      expect(collected[2]?.type).toBe('done')
    })

    it('should pass options to the text adapter', async () => {
      const adapter = new MockTextAdapter([])
      const chatStreamSpy = vi.spyOn(adapter, 'chatStream')

      const messages: Array<ModelMessage> = [
        { role: 'user', content: [{ type: 'text', content: 'Test message' }] },
      ]

      // Consume the iterable to trigger the method
      const result = chat({
        adapter,
        messages,
        systemPrompts: ['Be helpful'],
        options: { temperature: 0.7 },
      })
      for await (const _ of result) {
        // Consume
      }

      expect(chatStreamSpy).toHaveBeenCalled()
    })
  })

  describe('with embedding adapter', () => {
    it('should return an EmbeddingResult', async () => {
      const expectedResult: EmbeddingResult = {
        id: 'embed-123',
        model: 'model-a',
        embeddings: [[0.5, 0.6, 0.7]],
        usage: { promptTokens: 15, totalTokens: 15 },
      }

      const adapter = new MockEmbeddingAdapter(expectedResult)

      const result = await embedding({
        adapter,
        input: ['Test text'],
      })

      expect(result).toEqual(expectedResult)
    })

    it('should pass options to the embedding adapter', async () => {
      const adapter = new MockEmbeddingAdapter()
      const createEmbeddingsSpy = vi.spyOn(adapter, 'createEmbeddings')

      await embedding({
        adapter,
        input: ['Hello', 'World'],
      })

      expect(createEmbeddingsSpy).toHaveBeenCalled()
    })
  })

  describe('with summarize adapter', () => {
    it('should return a SummarizationResult', async () => {
      const expectedResult: SummarizationResult = {
        id: 'sum-456',
        model: 'model-b',
        summary: 'A concise summary of the text.',
        usage: { promptTokens: 200, completionTokens: 30, totalTokens: 230 },
      }

      const adapter = new MockSummarizeAdapter(expectedResult, 'model-b')

      const result = await summarize({
        adapter,
        text: 'Long text to summarize...',
      })

      expect(result).toEqual(expectedResult)
    })

    it('should pass options to the summarize adapter', async () => {
      const adapter = new MockSummarizeAdapter()
      const summarizeSpy = vi.spyOn(adapter, 'summarize')

      await summarize({
        adapter,
        text: 'Some text to summarize',
        style: 'bullet-points',
        maxLength: 100,
      })

      expect(summarizeSpy).toHaveBeenCalled()
    })
  })

  describe('type safety', () => {
    it('should have proper return type inference for text adapter', () => {
      const adapter = new MockTextAdapter([])
      const messages: Array<ModelMessage> = []

      // TypeScript should infer AsyncIterable<StreamChunk>
      const result = chat({
        adapter,
        messages,
      })

      // This ensures the type is AsyncIterable, not Promise
      expect(typeof result[Symbol.asyncIterator]).toBe('function')
    })

    it('should have proper return type inference for embedding adapter', () => {
      const adapter = new MockEmbeddingAdapter()

      // TypeScript should infer Promise<EmbeddingResult>
      const result = embedding({
        adapter,
        input: ['test'],
      })

      // This ensures the type is Promise
      expect(result).toBeInstanceOf(Promise)
    })

    it('should have proper return type inference for summarize adapter', () => {
      const adapter = new MockSummarizeAdapter()

      // TypeScript should infer Promise<SummarizationResult>
      const result = summarize({
        adapter,
        text: 'test',
      })

      // This ensures the type is Promise
      expect(result).toBeInstanceOf(Promise)
    })
  })
})
