/**
 * Type Safety Tests for embed() function
 *
 * These tests verify that the embed() function correctly constrains types based on:
 * 1. Model-specific input modalities - text-only models reject image parts
 * 2. Model-specific provider options (modelOptions), including required options
 *
 * Uses @ts-expect-error to ensure TypeScript catches invalid type combinations.
 */
import { describe, expectTypeOf, it } from 'vitest'
import { BaseEmbeddingAdapter } from '../src/activities/embed/adapter'
import { embed } from '../src/activities/embed/index'
import type { EmbeddingOptions, EmbeddingResult } from '../src/types'

// ===========================
// Mock Provider Options Types
// ===========================

/**
 * Options for the text-only mock model (all optional).
 */
interface MockTextEmbedProviderOptions {
  /**
   * A unique identifier representing your end-user.
   */
  user?: string
}

/**
 * Options for the multimodal mock model — `inputType` is REQUIRED, which
 * makes `modelOptions` itself required at the embed() call site.
 */
interface MockMultimodalEmbedProviderOptions {
  inputType: 'search_document' | 'search_query'
  truncate?: 'NONE' | 'END'
}

type MockEmbedProviderOptions =
  | MockTextEmbedProviderOptions
  | MockMultimodalEmbedProviderOptions

// ===========================
// Mock Type Maps
// ===========================

type MockEmbeddingModelProviderOptionsByName = {
  'mock-text-embed': MockTextEmbedProviderOptions
  'mock-mm-embed': MockMultimodalEmbedProviderOptions
}

type MockEmbeddingModelInputModalitiesByName = {
  'mock-text-embed': readonly ['text']
  'mock-mm-embed': readonly ['text', 'image']
}

const MOCK_EMBEDDING_MODELS = ['mock-text-embed', 'mock-mm-embed'] as const

type MockEmbeddingModel = (typeof MOCK_EMBEDDING_MODELS)[number]

// ===========================
// Mock Adapter Implementation
// ===========================

class MockEmbeddingAdapter<
  TModel extends MockEmbeddingModel,
> extends BaseEmbeddingAdapter<
  TModel,
  MockEmbedProviderOptions,
  MockEmbeddingModelProviderOptionsByName,
  MockEmbeddingModelInputModalitiesByName
> {
  readonly name = 'mock' as const

  constructor(model: TModel) {
    super(model, {})
  }

  /* eslint-disable @typescript-eslint/require-await */
  createEmbeddings = async (
    options: EmbeddingOptions<MockEmbedProviderOptions>,
  ): Promise<EmbeddingResult> => {
    return {
      id: 'mock-id',
      model: this.model,
      embeddings: options.input.map((_, index) => ({
        vector: [0.1, 0.2],
        index,
      })),
    }
  }
  /* eslint-enable @typescript-eslint/require-await */
}

function mockEmbedding<TModel extends MockEmbeddingModel>(
  model: TModel,
): MockEmbeddingAdapter<TModel> {
  return new MockEmbeddingAdapter(model)
}

const imagePart = {
  type: 'image',
  source: { type: 'data', value: 'aGVsbG8=', mimeType: 'image/png' },
} as const

// ===========================
// Type Safety Tests
// ===========================

describe('Type Safety Tests for embed() function', () => {
  describe('Per-model input modality type safety', () => {
    it('allows string and text-part inputs on text-only models', () => {
      embed({
        adapter: mockEmbedding('mock-text-embed'),
        input: 'a red guitar',
      })

      embed({
        adapter: mockEmbedding('mock-text-embed'),
        input: { type: 'text', content: 'a red guitar' },
      })

      embed({
        adapter: mockEmbedding('mock-text-embed'),
        input: ['a red guitar', { type: 'text', content: 'a blue drum kit' }],
      })
    })

    it('rejects image parts on text-only models', () => {
      embed({
        adapter: mockEmbedding('mock-text-embed'),
        // @ts-expect-error - mock-text-embed does not accept image inputs
        input: imagePart,
      })

      embed({
        adapter: mockEmbedding('mock-text-embed'),
        // @ts-expect-error - mock-text-embed does not accept image inputs in arrays
        input: ['a red guitar', imagePart],
      })
    })

    it('rejects fused content items on text-only models', () => {
      embed({
        adapter: mockEmbedding('mock-text-embed'),
        input: [
          // @ts-expect-error - mock-text-embed does not accept fused content items
          [{ type: 'text', content: 'caption' }, imagePart],
        ],
      })
    })

    it('allows image parts and fused items on multimodal models', () => {
      embed({
        adapter: mockEmbedding('mock-mm-embed'),
        input: imagePart,
        modelOptions: { inputType: 'search_document' },
      })

      embed({
        adapter: mockEmbedding('mock-mm-embed'),
        input: [
          'a red guitar',
          imagePart,
          [{ type: 'text', content: 'caption' }, imagePart],
        ],
        modelOptions: { inputType: 'search_document' },
      })
    })
  })

  describe('Model-specific provider options type safety', () => {
    it('keeps modelOptions optional when all options are optional', () => {
      embed({
        adapter: mockEmbedding('mock-text-embed'),
        input: 'hello',
      })

      embed({
        adapter: mockEmbedding('mock-text-embed'),
        input: 'hello',
        modelOptions: { user: 'user-123' },
      })
    })

    it('requires modelOptions when the model has required options', () => {
      // @ts-expect-error - mock-mm-embed requires modelOptions.inputType
      embed({
        adapter: mockEmbedding('mock-mm-embed'),
        input: 'hello',
      })

      embed({
        adapter: mockEmbedding('mock-mm-embed'),
        input: 'hello',
        modelOptions: { inputType: 'search_query' },
      })
    })

    it('rejects options from the other model', () => {
      embed({
        adapter: mockEmbedding('mock-text-embed'),
        input: 'hello',
        modelOptions: {
          // @ts-expect-error - 'inputType' is not available on mock-text-embed
          inputType: 'search_document',
        },
      })

      embed({
        adapter: mockEmbedding('mock-mm-embed'),
        input: 'hello',
        modelOptions: {
          inputType: 'search_document',
          // @ts-expect-error - 'user' is not available on mock-mm-embed
          user: 'user-123',
        },
      })
    })

    it('rejects unknown options', () => {
      embed({
        adapter: mockEmbedding('mock-text-embed'),
        input: 'hello',
        modelOptions: {
          // @ts-expect-error - 'unknownOption' does not exist
          unknownOption: true,
        },
      })
    })
  })

  describe('Model name type safety', () => {
    it('accepts valid model names', () => {
      const _adapter1 = mockEmbedding('mock-text-embed')
      const _adapter2 = mockEmbedding('mock-mm-embed')
      expectTypeOf(_adapter1).toBeObject()
      expectTypeOf(_adapter2).toBeObject()
    })

    it('rejects invalid model names', () => {
      // @ts-expect-error - 'invalid-model' is not a valid mock embedding model name
      const _adapter = mockEmbedding('invalid-model')
    })
  })

  describe('Result type', () => {
    it('resolves to EmbeddingResult', () => {
      const result = embed({
        adapter: mockEmbedding('mock-text-embed'),
        input: 'hello',
      })
      expectTypeOf(result).resolves.toEqualTypeOf<EmbeddingResult>()
    })

    it('exposes vector and index on embeddings', async () => {
      const result = await embed({
        adapter: mockEmbedding('mock-text-embed'),
        input: 'hello',
      })
      expectTypeOf(result.embeddings[0]!.vector).toEqualTypeOf<Array<number>>()
      expectTypeOf(result.embeddings[0]!.index).toEqualTypeOf<number>()
    })
  })
})
