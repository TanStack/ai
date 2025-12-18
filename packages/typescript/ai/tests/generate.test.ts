import { describe, expect, it, vi } from 'vitest'
import { BaseSummarizeAdapter, BaseTextAdapter, chat, summarize } from '../src/activities'
import type { StructuredOutputResult } from '../src/activities'
import type {
  ModelMessage,
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
  TextOptions,
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

  // eslint-disable-next-line @typescript-eslint/require-await
  async *chatStream(_options: TextOptions): AsyncIterable<StreamChunk> {
    for (const chunk of this.mockChunks) {
      yield chunk
    }
  }


  structuredOutput(_options: any): Promise<StructuredOutputResult<unknown>> {
    return Promise.resolve({
      data: {},
      rawText: '{}',
    })
  }
}

class MockSummarizeAdapter<
  TModel extends MockModel = 'model-a',
> extends BaseSummarizeAdapter<TModel, Record<string, unknown>> {
  readonly kind = 'summarize' as const
  readonly name = 'mock' as const

  private mockResult: SummarizationResult

  constructor(
    mockResult?: SummarizationResult,
    model: TModel = 'model-a' as TModel,
  ) {
    super({}, model)
    this.mockResult = mockResult ?? {
      id: 'test-id',
      model: model,
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
