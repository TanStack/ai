/**
 * Type tests for the ai function
 * These tests verify that TypeScript correctly infers types and provides autocomplete
 */

import { describe, expectTypeOf, it } from 'vitest'
import {
  BaseEmbeddingAdapter,
  BaseImageAdapter,
  BaseSummarizeAdapter,
  BaseTextAdapter,
} from '../src/activities'
import { ai } from '../src/ai'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '../src/activities'
import type {
  EmbeddingOptions,
  EmbeddingResult,
  ImageGenerationOptions,
  ImageGenerationResult,
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
  TextOptions,
} from '../src/types'

// Define test models
const TEST_CHAT_MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'] as const
const TEST_EMBED_MODELS = [
  'text-embedding-3-large',
  'text-embedding-3-small',
] as const
const TEST_SUMMARIZE_MODELS = ['summarize-v1', 'summarize-v2'] as const

// Define strict provider options for testing (without index signatures)
interface TestTextProviderOptions {
  temperature?: number
  maxTokens?: number
}

interface TestEmbedProviderOptions {
  encodingFormat?: 'float' | 'base64'
}

interface TestSummarizeProviderOptions {
  style?: 'bullet-points' | 'paragraph'
}

// Mock adapters for type testing
class TestTextAdapter extends BaseTextAdapter<
  typeof TEST_CHAT_MODELS,
  TestTextProviderOptions
> {
  readonly kind = 'text' as const
  readonly name = 'test'
  readonly models = TEST_CHAT_MODELS

  constructor() {
    super('gpt-4o', {})
  }

  async *chatStream(_options: TextOptions): AsyncIterable<StreamChunk> {
    // Mock implementation
  }

  structuredOutput(
    _options: StructuredOutputOptions<TestTextProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    return Promise.resolve({
      data: {},
      rawText: '{}',
    })
  }
}

const TEST_CHAT_MODELS_WITH_MAP = ['model-a', 'model-b'] as const

interface TestBaseProviderOptions {
  baseOnly?: boolean
}

type TestModelProviderOptionsByName = {
  'model-a': TestBaseProviderOptions & {
    foo?: number
  }
  'model-b': TestBaseProviderOptions & {
    bar?: string
  }
}

type TestModelInputModalitiesByName = {
  'model-a': readonly ['text']
  'model-b': readonly ['text']
}

class TestTextAdapterWithModelOptions extends BaseTextAdapter<
  typeof TEST_CHAT_MODELS_WITH_MAP,
  TestBaseProviderOptions,
  TestModelProviderOptionsByName,
  TestModelInputModalitiesByName
> {
  readonly kind = 'text' as const
  readonly name = 'test-with-map'
  readonly models = TEST_CHAT_MODELS_WITH_MAP

  _modelProviderOptionsByName!: TestModelProviderOptionsByName
  _modelInputModalitiesByName!: TestModelInputModalitiesByName

  constructor() {
    super('model-a', {})
  }

  async *chatStream(_options: TextOptions): AsyncIterable<StreamChunk> {
    // Mock implementation
  }

  structuredOutput(
    _options: StructuredOutputOptions<TestBaseProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    return Promise.resolve({
      data: {},
      rawText: '{}',
    })
  }
}

class TestEmbedAdapter extends BaseEmbeddingAdapter<
  typeof TEST_EMBED_MODELS,
  TestEmbedProviderOptions
> {
  readonly kind = 'embedding' as const
  readonly name = 'test'
  readonly models = TEST_EMBED_MODELS

  constructor() {
    super({})
  }

  createEmbeddings(_options: EmbeddingOptions): Promise<EmbeddingResult> {
    return Promise.resolve({
      id: 'test',
      model: 'text-embedding-3-small',
      embeddings: [[0.1, 0.2]],
      usage: { promptTokens: 1, totalTokens: 1 },
    })
  }
}

class TestSummarizeAdapter extends BaseSummarizeAdapter<
  typeof TEST_SUMMARIZE_MODELS,
  TestSummarizeProviderOptions
> {
  readonly kind = 'summarize' as const
  readonly name = 'test'
  readonly models = TEST_SUMMARIZE_MODELS

  constructor() {
    super({})
  }

  summarize(_options: SummarizationOptions): Promise<SummarizationResult> {
    return Promise.resolve({
      id: 'test',
      model: 'summarize-v1',
      summary: 'Test summary',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    })
  }
}

describe('ai() type inference', () => {
  it('should infer text adapter return type as AsyncIterable<StreamChunk>', () => {
    const textAdapter = new TestTextAdapter()
    const result = ai({
      adapter: textAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
    })

    expectTypeOf(result).toMatchTypeOf<AsyncIterable<StreamChunk>>()
  })

  it('should infer embedding adapter return type as Promise<EmbeddingResult>', () => {
    const embedAdapter = new TestEmbedAdapter()
    const result = ai({
      adapter: embedAdapter,
      model: 'text-embedding-3-small',
      input: 'Hello',
    })

    expectTypeOf(result).toMatchTypeOf<Promise<EmbeddingResult>>()
  })

  it('should infer summarize adapter return type as Promise<SummarizationResult>', () => {
    const summarizeAdapter = new TestSummarizeAdapter()
    const result = ai({
      adapter: summarizeAdapter,
      model: 'summarize-v1',
      text: 'Long text to summarize',
    })

    expectTypeOf(result).toMatchTypeOf<Promise<SummarizationResult>>()
  })

  it('should accept valid model for text adapter', () => {
    const textAdapter = new TestTextAdapter()

    ai({
      adapter: textAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
    })
  })

  it('should accept valid model for embedding adapter', () => {
    const embedAdapter = new TestEmbedAdapter()

    ai({
      adapter: embedAdapter,
      model: 'text-embedding-3-small',
      input: 'Hello',
    })
  })

  it('should accept valid model for summarize adapter', () => {
    const summarizeAdapter = new TestSummarizeAdapter()

    ai({
      adapter: summarizeAdapter,
      model: 'summarize-v1',
      text: 'Text to summarize',
    })
  })

  // providerOptions are now baked into the adapter at construction time
  // e.g., openaiText('gpt-4o', { providerOptions: { temperature: 0.7 } })
  // Tests for providerOptions type narrowing are handled in adapter factory tests
})

describe('ai() with outputSchema', () => {
  // Import zod for schema tests
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const { z } = require('zod') as typeof import('zod')

  it('should return Promise<T> when outputSchema is provided', () => {
    const textAdapter = new TestTextAdapter()

    const PersonSchema = z.object({
      name: z.string(),
      age: z.number(),
    })

    const result = ai({
      adapter: textAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Generate a person' }],
      outputSchema: PersonSchema,
    })

    // Return type should be Promise<{ name: string; age: number }>
    expectTypeOf(result).toMatchTypeOf<Promise<{ name: string; age: number }>>()
  })

  it('should return AsyncIterable<StreamChunk> when outputSchema is not provided', () => {
    const textAdapter = new TestTextAdapter()

    const result = ai({
      adapter: textAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
    })

    // Return type should be AsyncIterable<StreamChunk>
    expectTypeOf(result).toMatchTypeOf<AsyncIterable<StreamChunk>>()
  })

  it('should infer complex nested schema types', () => {
    const textAdapter = new TestTextAdapter()

    const AddressSchema = z.object({
      street: z.string(),
      city: z.string(),
      country: z.string(),
    })

    const PersonWithAddressSchema = z.object({
      name: z.string(),
      addresses: z.array(AddressSchema),
    })

    const result = ai({
      adapter: textAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Generate a person with addresses' }],
      outputSchema: PersonWithAddressSchema,
    })

    // Return type should be Promise with the correct nested structure
    expectTypeOf(result).toMatchTypeOf<
      Promise<{
        name: string
        addresses: Array<{ street: string; city: string; country: string }>
      }>
    >()
  })

  it('should infer schema with optional fields', () => {
    const textAdapter = new TestTextAdapter()

    const PersonSchema = z.object({
      name: z.string(),
      age: z.number().optional(),
      email: z.string().nullable(),
    })

    const result = ai({
      adapter: textAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Generate a person' }],
      outputSchema: PersonSchema,
    })

    expectTypeOf(result).toMatchTypeOf<
      Promise<{
        name: string
        age?: number
        email: string | null
      }>
    >()
  })

  it('should work with union types in schema', () => {
    const textAdapter = new TestTextAdapter()

    const ResponseSchema = z.discriminatedUnion('type', [
      z.object({ type: z.literal('success'), data: z.string() }),
      z.object({ type: z.literal('error'), message: z.string() }),
    ])

    const result = ai({
      adapter: textAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Generate a response' }],
      outputSchema: ResponseSchema,
    })

    expectTypeOf(result).toMatchTypeOf<
      Promise<
        { type: 'success'; data: string } | { type: 'error'; message: string }
      >
    >()
  })
})

describe('ai() with summarize streaming', () => {
  it('should return Promise<SummarizationResult> when stream is not provided', () => {
    const summarizeAdapter = new TestSummarizeAdapter()
    const result = ai({
      adapter: summarizeAdapter,
      model: 'summarize-v1',
      text: 'Long text to summarize',
    })

    expectTypeOf(result).toMatchTypeOf<Promise<SummarizationResult>>()
  })

  it('should return Promise<SummarizationResult> when stream is false', () => {
    const summarizeAdapter = new TestSummarizeAdapter()
    const result = ai({
      adapter: summarizeAdapter,
      model: 'summarize-v1',
      text: 'Long text to summarize',
      stream: false,
    })

    expectTypeOf(result).toMatchTypeOf<Promise<SummarizationResult>>()
  })

  it('should return AsyncIterable<StreamChunk> when stream is true', () => {
    const summarizeAdapter = new TestSummarizeAdapter()
    const result = ai({
      adapter: summarizeAdapter,
      model: 'summarize-v1',
      text: 'Long text to summarize',
      stream: true,
    })

    expectTypeOf(result).toMatchTypeOf<AsyncIterable<StreamChunk>>()
  })

  it('should allow stream option for text adapter', () => {
    const textAdapter = new TestTextAdapter()

    // stream: true is valid (explicit streaming, the default)
    ai({
      adapter: textAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
      stream: true,
    })

    // stream: false is valid (non-streaming mode)
    ai({
      adapter: textAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
      stream: false,
    })
  })
})

// ===========================
// Image Adapter Test Setup
// ===========================

const TEST_IMAGE_MODELS = ['image-model-1', 'image-model-2'] as const

interface TestImageProviderOptions {
  quality?: 'standard' | 'hd'
}

type TestImageModelProviderOptionsByName = {
  'image-model-1': TestImageProviderOptions & { style?: 'vivid' | 'natural' }
  'image-model-2': TestImageProviderOptions & {
    background?: 'transparent' | 'opaque'
  }
}

type TestImageModelSizeByName = {
  'image-model-1': '256x256' | '512x512' | '1024x1024'
  'image-model-2': '1024x1024' | '1792x1024' | '1024x1792'
}

class TestImageAdapter extends BaseImageAdapter<
  typeof TEST_IMAGE_MODELS,
  TestImageProviderOptions,
  TestImageModelProviderOptionsByName,
  TestImageModelSizeByName
> {
  readonly kind = 'image' as const
  readonly name = 'test-image'
  readonly models = TEST_IMAGE_MODELS

  _modelProviderOptionsByName!: TestImageModelProviderOptionsByName
  _modelSizeByName!: TestImageModelSizeByName

  constructor() {
    super({})
  }

  generateImages(
    _options: ImageGenerationOptions<TestImageProviderOptions>,
  ): Promise<ImageGenerationResult> {
    return Promise.resolve({
      id: 'test',
      model: 'image-model-1',
      images: [{ url: 'https://example.com/image.png' }],
    })
  }
}

// ===========================
// Text Adapter with Different Input Modalities Per Model
// ===========================

const TEST_MULTIMODAL_MODELS = [
  'text-only-model',
  'text-image-model',
  'multimodal-model',
] as const

interface TestMultimodalProviderOptions {
  temperature?: number
}

// Define different input modalities per model
type TestMultimodalInputModalitiesByName = {
  'text-only-model': readonly ['text']
  'text-image-model': readonly ['text', 'image']
  'multimodal-model': readonly ['text', 'image', 'audio', 'document']
}

// Custom metadata types for testing
interface TestImageMetadata {
  altText?: string
}

interface TestMessageMetadataByModality {
  text: unknown
  image: TestImageMetadata
  audio: unknown
  video: unknown
  document: unknown
}

class TestMultimodalAdapter extends BaseTextAdapter<
  typeof TEST_MULTIMODAL_MODELS,
  TestMultimodalProviderOptions,
  Record<string, TestMultimodalProviderOptions>,
  TestMultimodalInputModalitiesByName,
  TestMessageMetadataByModality
> {
  readonly kind = 'text' as const
  readonly name = 'test-multimodal'
  readonly models = TEST_MULTIMODAL_MODELS

  declare _modelInputModalitiesByName: TestMultimodalInputModalitiesByName
  declare _messageMetadataByModality: TestMessageMetadataByModality

  constructor() {
    super('text-only-model', {})
  }

  async *chatStream(_options: TextOptions): AsyncIterable<StreamChunk> {
    // Mock implementation
  }

  structuredOutput(
    _options: StructuredOutputOptions<TestMultimodalProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    return Promise.resolve({
      data: {},
      rawText: '{}',
    })
  }
}

// ===========================
// Text Adapter Type Tests
// ===========================

describe('ai() text adapter type safety', () => {
  it('should return type that conforms to outputSchema type', () => {
    const textAdapter = new TestTextAdapter()
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    const { z } = require('zod') as typeof import('zod')

    const PersonSchema = z.object({
      name: z.string(),
      age: z.number(),
    })

    const result = ai({
      adapter: textAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Generate a person' }],
      outputSchema: PersonSchema,
    })

    // Return type should match the schema
    expectTypeOf(result).toExtend<Promise<{ name: string; age: number }>>()
    // Should NOT match a different type
    expectTypeOf(result).not.toExtend<Promise<{ foo: string }>>()
  })

  // providerOptions are now baked into the adapter at construction time
  // Model-specific providerOptions typing is handled by adapter factory functions
})

// ===========================
// Text Adapter Input Modality Constraint Tests
// ===========================

describe('ai() text adapter input modality constraints', () => {
  it('should allow text content on text-only model', () => {
    const adapter = new TestMultimodalAdapter()

    ai({
      adapter,
      model: 'text-only-model',
      messages: [{ role: 'user', content: 'Hello, how are you?' }],
    })
  })

  it('should allow text and image content on text-image model', () => {
    const adapter = new TestMultimodalAdapter()

    ai({
      adapter,
      model: 'text-image-model',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', content: 'What is in this image?' },
            {
              type: 'image',
              source: { type: 'url', value: 'https://example.com/image.png' },
              metadata: { altText: 'A photo' },
            },
          ],
        },
      ],
    })
  })

  it('should allow all supported modalities on multimodal model', () => {
    const adapter = new TestMultimodalAdapter()

    ai({
      adapter,
      model: 'multimodal-model',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', content: 'Analyze these files' },
            {
              type: 'image',
              source: { type: 'url', value: 'https://example.com/image.png' },
            },
            {
              type: 'audio',
              source: { type: 'url', value: 'https://example.com/audio.mp3' },
            },
            {
              type: 'document',
              source: { type: 'url', value: 'https://example.com/doc.pdf' },
            },
          ],
        },
      ],
    })
  })
})

// ===========================
// Image Adapter Type Tests
// ===========================

describe('ai() image adapter type safety', () => {
  it('should have size determined by the model', () => {
    const imageAdapter = new TestImageAdapter()

    // image-model-1 supports 256x256, 512x512, 1024x1024
    ai({
      adapter: imageAdapter,
      model: 'image-model-1',
      prompt: 'A beautiful sunset',
      size: '512x512',
    })

    // image-model-2 supports 1024x1024, 1792x1024, 1024x1792
    ai({
      adapter: imageAdapter,
      model: 'image-model-2',
      prompt: 'A beautiful sunset',
      size: '1792x1024',
    })
  })

  it('should return ImageGenerationResult type', () => {
    const imageAdapter = new TestImageAdapter()

    const result = ai({
      adapter: imageAdapter,
      model: 'image-model-1',
      prompt: 'A beautiful sunset',
    })

    expectTypeOf(result).toExtend<Promise<ImageGenerationResult>>()
  })

  it('should have model-specific provider options for image adapter', () => {
    const imageAdapter = new TestImageAdapter()

    // image-model-1 supports style option
    ai({
      adapter: imageAdapter,
      model: 'image-model-1',
      prompt: 'A beautiful sunset',
      providerOptions: {
        quality: 'hd',
        style: 'vivid',
      },
    })

    // image-model-2 supports background option
    ai({
      adapter: imageAdapter,
      model: 'image-model-2',
      prompt: 'A beautiful sunset',
      providerOptions: {
        quality: 'hd',
        background: 'transparent',
      },
    })
  })
})

// Embedding and Summarize adapter type safety - positive tests already covered above

// ===========================
// Union of Options Type Tests (Runtime Adapter Switching)
// ===========================
// These tests verify that when dynamically selecting adapters,
// the ai() function correctly infers types.

describe('ai() with union of text adapter options (runtime switching)', () => {
  it('should return AsyncIterable<StreamChunk> with new model-in-adapter API', () => {
    // NEW API: Model is passed to adapter constructor
    const adapters = {
      adapter1: () => new TestTextAdapter(), // model is 'gpt-4o' in constructor
      adapter2: () => new TestTextAdapterWithModelOptions(), // model is 'model-a' in constructor
    }

    // Single adapter - should work
    const adapter1 = adapters.adapter1()
    const result1 = ai({
      adapter: adapter1,
      messages: [{ role: 'user' as const, content: 'Hello' }],
    })
    expectTypeOf(result1).toMatchTypeOf<AsyncIterable<StreamChunk>>()

    // Dynamic adapter selection - ai() now works with union of adapters
    // since providerOptions is baked into the adapter at construction time
    const provider: 'adapter1' | 'adapter2' = 'adapter1'
    const adapter = adapters[provider]()

    // Check what kind the adapter has
    expectTypeOf(adapter.kind).toEqualTypeOf<'text'>()

    // ai() with dynamic adapter selection returns AsyncIterable<StreamChunk>
    const result = ai({
      adapter,
      messages: [{ role: 'user' as const, content: 'Hello' }],
    })

    // ai() returns AsyncIterable<StreamChunk> for text adapters
    expectTypeOf(result).toMatchTypeOf<AsyncIterable<StreamChunk>>()
  })

  it('should work with same adapter instance and explicit messages', () => {
    const textAdapter = new TestTextAdapter()

    // With the same adapter instance, ai() should work
    const result = ai({
      adapter: textAdapter,
      messages: [{ role: 'user' as const, content: 'Hello' }],
    })

    expectTypeOf(result).toMatchTypeOf<AsyncIterable<StreamChunk>>()
  })
})
