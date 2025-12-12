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
  readonly name = 'test' as const
  readonly models = TEST_CHAT_MODELS

  constructor() {
    super({})
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
  readonly name = 'test-with-map' as const
  readonly models = TEST_CHAT_MODELS_WITH_MAP

  _modelProviderOptionsByName!: TestModelProviderOptionsByName
  _modelInputModalitiesByName!: TestModelInputModalitiesByName

  constructor() {
    super({})
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
  readonly name = 'test' as const
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
  readonly name = 'test' as const
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

  it('should enforce valid model for text adapter', () => {
    const textAdapter = new TestTextAdapter()

    // This should work - valid model
    ai({
      adapter: textAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
    })

    // invalid model should error
    ai({
      adapter: textAdapter,
      // @ts-expect-error - invalid model
      model: 'invalid-model',
      messages: [{ role: 'user', content: 'Hello' }],
    })
  })

  it('should enforce valid model for embedding adapter', () => {
    const embedAdapter = new TestEmbedAdapter()

    // This should work - valid model
    ai({
      adapter: embedAdapter,
      model: 'text-embedding-3-small',
      input: 'Hello',
    })

    // invalid model should error
    ai({
      adapter: embedAdapter,
      // @ts-expect-error - invalid model
      model: 'invalid-embedding-model',
      input: 'Hello',
    })
  })

  it('should enforce valid model for summarize adapter', () => {
    const summarizeAdapter = new TestSummarizeAdapter()

    // This should work - valid model
    ai({
      adapter: summarizeAdapter,
      model: 'summarize-v1',
      text: 'Text to summarize',
    })

    // invalid model should error
    ai({
      adapter: summarizeAdapter,
      // @ts-expect-error - invalid model
      model: 'invalid-summarize-model',
      text: 'Text to summarize',
    })
  })

  it('should enforce strict providerOptions for text adapter', () => {
    const textAdapter = new TestTextAdapter()

    // This should work - valid provider options
    ai({
      adapter: textAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
      providerOptions: {
        temperature: 0.7,
        maxTokens: 100,
      },
    })

    // invalid property should error
    ai({
      adapter: textAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
      providerOptions: {
        temperature: 0.7,
        // @ts-expect-error - invalid property
        invalidProperty: 'should-error',
      },
    })
  })

  it('should enforce strict providerOptions for embedding adapter', () => {
    const embedAdapter = new TestEmbedAdapter()

    // This should work - valid provider options
    ai({
      adapter: embedAdapter,
      model: 'text-embedding-3-small',
      input: 'Hello',
      providerOptions: {
        encodingFormat: 'float',
      },
    })

    // temperature is not valid for embedding adapter
    ai({
      adapter: embedAdapter,
      model: 'text-embedding-3-small',
      input: 'Hello',
      providerOptions: {
        // @ts-expect-error - temperature is not valid for embedding adapter
        temperature: 0.7,
      },
    })
  })

  it('should enforce strict providerOptions for summarize adapter', () => {
    const summarizeAdapter = new TestSummarizeAdapter()

    // This should work - valid provider options
    ai({
      adapter: summarizeAdapter,
      model: 'summarize-v1',
      text: 'Text to summarize',
      providerOptions: {
        style: 'bullet-points',
      },
    })

    // invalid property should error
    ai({
      adapter: summarizeAdapter,
      model: 'summarize-v1',
      text: 'Text to summarize',
      providerOptions: {
        // @ts-expect-error - invalid property
        invalidOption: 'should-error',
      },
    })
  })

  it('should not allow chat-specific options for embedding adapter', () => {
    const embedAdapter = new TestEmbedAdapter()

    ai({
      adapter: embedAdapter,
      model: 'text-embedding-3-small',
      input: 'Hello',
      // @ts-expect-error - messages is not valid for embedding adapter
      messages: [{ role: 'user', content: 'Hello' }],
    })
  })

  it('should not allow chat-specific options for summarize adapter', () => {
    const summarizeAdapter = new TestSummarizeAdapter()

    ai({
      adapter: summarizeAdapter,
      model: 'summarize-v1',
      text: 'Text to summarize',
      // @ts-expect-error - messages is not valid for summarize adapter
      messages: [{ role: 'user', content: 'Hello' }],
    })
  })

  it('should not allow embedding-specific options for text adapter', () => {
    const textAdapter = new TestTextAdapter()

    ai({
      adapter: textAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
      // @ts-expect-error - input is not valid for chat adapter
      input: 'Hello',
    })
  })

  it('should not allow summarize-specific options for text adapter', () => {
    const textAdapter = new TestTextAdapter()

    ai({
      adapter: textAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
      // @ts-expect-error - text is not valid for chat adapter
      text: 'Text to summarize',
    })
  })

  it('should narrow providerOptions based on model (per-model map)', () => {
    const adapter = new TestTextAdapterWithModelOptions()

    // model-a should accept both baseOnly and foo
    ai({
      adapter,
      model: 'model-a',
      messages: [{ role: 'user', content: 'Hello' }],
      providerOptions: {
        baseOnly: true,
        foo: 123,
      },
    })

    // model-a should NOT accept bar (it's model-b specific)
    ai({
      adapter,
      model: 'model-a',
      messages: [{ role: 'user', content: 'Hello' }],
      providerOptions: {
        // @ts-expect-error - bar is not supported for model-a
        bar: 'nope',
      },
    })

    // model-b should accept both baseOnly and bar
    ai({
      adapter,
      model: 'model-b',
      messages: [{ role: 'user', content: 'Hello' }],
      providerOptions: {
        baseOnly: true,
        bar: 'ok',
      },
    })

    // model-b should NOT accept foo (it's model-a specific)
    ai({
      adapter,
      model: 'model-b',
      messages: [{ role: 'user', content: 'Hello' }],
      providerOptions: {
        // @ts-expect-error - foo is not supported for model-b
        foo: 123,
      },
    })
  })
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

  it('should not allow outputSchema for embedding adapter', () => {
    const embedAdapter = new TestEmbedAdapter()

    const PersonSchema = z.object({
      name: z.string(),
    })

    ai({
      adapter: embedAdapter,
      model: 'text-embedding-3-small',
      input: 'Hello',
      // @ts-expect-error - outputSchema is not valid for embedding adapter
      outputSchema: PersonSchema,
    })
  })

  it('should not allow outputSchema for summarize adapter', () => {
    const summarizeAdapter = new TestSummarizeAdapter()

    const PersonSchema = z.object({
      name: z.string(),
    })

    ai({
      adapter: summarizeAdapter,
      model: 'summarize-v1',
      text: 'Text to summarize',
      // @ts-expect-error - outputSchema is not valid for summarize adapter
      outputSchema: PersonSchema,
    })
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

  it('should not allow stream option for embedding adapter', () => {
    const embedAdapter = new TestEmbedAdapter()

    ai({
      adapter: embedAdapter,
      model: 'text-embedding-3-small',
      input: 'Hello',
      // @ts-expect-error - stream is not valid for embedding adapter
      stream: true,
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
  readonly name = 'test-image' as const
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
  readonly name = 'test-multimodal' as const
  readonly models = TEST_MULTIMODAL_MODELS

  declare _modelInputModalitiesByName: TestMultimodalInputModalitiesByName
  declare _messageMetadataByModality: TestMessageMetadataByModality

  constructor() {
    super({})
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

  it('should error on invalid provider options', () => {
    const textAdapter = new TestTextAdapter()

    ai({
      adapter: textAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
      providerOptions: {
        // @ts-expect-error - unknownOption is not valid for text adapter
        unknownOption: 'invalid',
      },
    })
  })

  it('should error on non-existing props', () => {
    const textAdapter = new TestTextAdapter()

    ai({
      adapter: textAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
      // @ts-expect-error - nonExistingProp is not a valid option
      nonExistingProp: 'should-error',
    })
  })

  it('should reject embedding-specific properties on text adapter', () => {
    const textAdapter = new TestTextAdapter()

    ai({
      adapter: textAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
      // @ts-expect-error - input is an embedding-specific property
      input: 'not allowed on text adapter',
    })

    ai({
      adapter: textAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
      // @ts-expect-error - dimensions is an embedding-specific property
      dimensions: 1024,
    })
  })

  it('should reject summarize-specific properties on text adapter', () => {
    const textAdapter = new TestTextAdapter()

    ai({
      adapter: textAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
      // @ts-expect-error - text is a summarize-specific property
      text: 'not allowed on text adapter',
    })

    ai({
      adapter: textAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
      // @ts-expect-error - maxLength is a summarize-specific property
      maxLength: 500,
    })
  })

  it('should reject image-specific properties on text adapter', () => {
    const textAdapter = new TestTextAdapter()

    ai({
      adapter: textAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
      // @ts-expect-error - prompt is an image-specific property
      prompt: 'not allowed on text adapter',
    })

    ai({
      adapter: textAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
      // @ts-expect-error - size is an image-specific property
      size: '1024x1024',
    })
  })

  it('should reject providerOptions from other adapters on text adapter', () => {
    const textAdapter = new TestTextAdapter()

    ai({
      adapter: textAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
      providerOptions: {
        // @ts-expect-error - encodingFormat is an embedding providerOption
        encodingFormat: 'float',
      },
    })

    ai({
      adapter: textAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
      providerOptions: {
        // @ts-expect-error - quality is an image providerOption
        quality: 'hd',
      },
    })
  })

  it('should change providerOptions type based on model selected', () => {
    const adapter = new TestTextAdapterWithModelOptions()

    // model-a should accept foo (and baseOnly which is shared)
    ai({
      adapter,
      model: 'model-a',
      messages: [{ role: 'user', content: 'Hello' }],
      providerOptions: {
        baseOnly: true,
        foo: 42,
      },
    })

    // model-a should NOT accept bar (model-b specific)
    ai({
      adapter,
      model: 'model-a',
      messages: [{ role: 'user', content: 'Hello' }],
      providerOptions: {
        baseOnly: true, // shared property - OK
        // @ts-expect-error - bar is not valid for model-a
        bar: 'invalid-for-model-a',
      },
    })

    // model-b should accept bar (and baseOnly which is shared)
    ai({
      adapter,
      model: 'model-b',
      messages: [{ role: 'user', content: 'Hello' }],
      providerOptions: {
        baseOnly: true,
        bar: 'valid-for-model-b',
      },
    })

    // model-b should NOT accept foo (model-a specific)
    ai({
      adapter,
      model: 'model-b',
      messages: [{ role: 'user', content: 'Hello' }],
      providerOptions: {
        baseOnly: true, // shared property - OK
        // @ts-expect-error - foo is not valid for model-b
        foo: 42,
      },
    })
  })
})

// ===========================
// Text Adapter Input Modality Constraint Tests
// ===========================

describe('ai() text adapter input modality constraints', () => {
  it('should allow text content on text-only model', () => {
    const adapter = new TestMultimodalAdapter()

    // Text content should work for text-only-model
    ai({
      adapter,
      model: 'text-only-model',
      messages: [{ role: 'user', content: 'Hello, how are you?' }],
    })

    // String content should also work
    ai({
      adapter,
      model: 'text-only-model',
      messages: [{ role: 'user', content: 'Hello' }],
    })
  })

  it('should reject image content on text-only model', () => {
    const adapter = new TestMultimodalAdapter()

    ai({
      adapter,
      model: 'text-only-model',
      messages: [
        {
          role: 'user',
          content: [
            // @ts-expect-error - image content not allowed on text-only model
            {
              type: 'image',
              source: { type: 'url', value: 'https://example.com/image.png' },
            },
          ],
        },
      ],
    })
  })

  it('should reject document content on text-only model', () => {
    const adapter = new TestMultimodalAdapter()

    ai({
      adapter,
      model: 'text-only-model',
      messages: [
        {
          role: 'user',
          content: [
            // @ts-expect-error - document content not allowed on text-only model
            {
              type: 'document',
              source: { type: 'url', value: 'https://example.com/doc.pdf' },
            },
          ],
        },
      ],
    })
  })

  it('should reject audio content on text-only model', () => {
    const adapter = new TestMultimodalAdapter()

    ai({
      adapter,
      model: 'text-only-model',
      messages: [
        {
          role: 'user',
          content: [
            // @ts-expect-error - audio content not allowed on text-only model
            {
              type: 'audio',
              source: { type: 'url', value: 'https://example.com/audio.mp3' },
            },
          ],
        },
      ],
    })
  })

  it('should allow text and image content on text-image model', () => {
    const adapter = new TestMultimodalAdapter()

    // Text content should work
    ai({
      adapter,
      model: 'text-image-model',
      messages: [{ role: 'user', content: 'Hello' }],
    })

    // Image content should work with proper metadata type
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

  it('should reject document content on text-image model', () => {
    const adapter = new TestMultimodalAdapter()

    ai({
      adapter,
      model: 'text-image-model',
      messages: [
        {
          role: 'user',
          content: [
            // @ts-expect-error - document content not allowed on text-image model
            {
              type: 'document',
              source: { type: 'url', value: 'https://example.com/doc.pdf' },
            },
          ],
        },
      ],
    })
  })

  it('should reject audio content on text-image model', () => {
    const adapter = new TestMultimodalAdapter()

    ai({
      adapter,
      model: 'text-image-model',
      messages: [
        {
          role: 'user',
          content: [
            // @ts-expect-error - audio content not allowed on text-image model
            {
              type: 'audio',
              source: { type: 'url', value: 'https://example.com/audio.mp3' },
            },
          ],
        },
      ],
    })
  })

  it('should allow all supported modalities on multimodal model', () => {
    const adapter = new TestMultimodalAdapter()

    // All supported content types should work on multimodal-model
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

  it('should reject video content on multimodal model that does not support video', () => {
    const adapter = new TestMultimodalAdapter()

    ai({
      adapter,
      model: 'multimodal-model',
      messages: [
        {
          role: 'user',
          content: [
            // @ts-expect-error - video content not allowed (multimodal-model only supports text, image, audio, document)
            {
              type: 'video',
              source: { type: 'url', value: 'https://example.com/video.mp4' },
            },
          ],
        },
      ],
    })
  })

  it('should enforce adapter-specific metadata types on content parts', () => {
    const adapter = new TestMultimodalAdapter()

    // Valid metadata for image (TestImageMetadata has altText)
    ai({
      adapter,
      model: 'text-image-model',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'url', value: 'https://example.com/image.png' },
              metadata: { altText: 'Description' },
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
      size: '512x512', // valid for image-model-1
    })

    // image-model-2 supports 1024x1024, 1792x1024, 1024x1792
    ai({
      adapter: imageAdapter,
      model: 'image-model-2',
      prompt: 'A beautiful sunset',
      size: '1792x1024', // valid for image-model-2
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

  it('should error on invalid size', () => {
    const imageAdapter = new TestImageAdapter()

    ai({
      adapter: imageAdapter,
      model: 'image-model-1',
      prompt: 'A beautiful sunset',
      // @ts-expect-error - 2048x2048 is not a valid size for image-model-1
      size: '2048x2048',
    })
  })

  it('should error when size valid for one model is used with another', () => {
    const imageAdapter = new TestImageAdapter()

    // 1792x1024 is valid for image-model-2 but NOT for image-model-1
    ai({
      adapter: imageAdapter,
      model: 'image-model-1',
      prompt: 'A beautiful sunset',
      // @ts-expect-error - 1792x1024 is not valid for image-model-1 (only image-model-2)
      size: '1792x1024',
    })

    // 256x256 is valid for image-model-1 but NOT for image-model-2
    ai({
      adapter: imageAdapter,
      model: 'image-model-2',
      prompt: 'A beautiful sunset',
      // @ts-expect-error - 256x256 is not valid for image-model-2 (only image-model-1)
      size: '256x256',
    })
  })

  it('should have model-specific provider options for image adapter', () => {
    const imageAdapter = new TestImageAdapter()

    // image-model-1 supports style option
    ai({
      adapter: imageAdapter,
      model: 'image-model-1',
      prompt: 'A beautiful sunset',
      providerOptions: {
        quality: 'hd', // shared
        style: 'vivid', // model-1 specific
      },
    })

    // image-model-1 should NOT accept background (model-2 specific)
    ai({
      adapter: imageAdapter,
      model: 'image-model-1',
      prompt: 'A beautiful sunset',
      providerOptions: {
        // @ts-expect-error - background is not valid for image-model-1
        background: 'transparent',
      },
    })

    // image-model-2 supports background option
    ai({
      adapter: imageAdapter,
      model: 'image-model-2',
      prompt: 'A beautiful sunset',
      providerOptions: {
        quality: 'hd', // shared
        background: 'transparent', // model-2 specific
      },
    })

    // image-model-2 should NOT accept style (model-1 specific)
    ai({
      adapter: imageAdapter,
      model: 'image-model-2',
      prompt: 'A beautiful sunset',
      providerOptions: {
        // @ts-expect-error - style is not valid for image-model-2
        style: 'vivid',
      },
    })
  })

  it('should reject text-specific properties on image adapter', () => {
    const imageAdapter = new TestImageAdapter()

    ai({
      adapter: imageAdapter,
      model: 'image-model-1',
      prompt: 'A beautiful sunset',
      // @ts-expect-error - messages is a text-specific property
      messages: [{ role: 'user', content: 'Hello' }],
    })

    ai({
      adapter: imageAdapter,
      model: 'image-model-1',
      prompt: 'A beautiful sunset',
      // @ts-expect-error - tools is a text-specific property
      tools: [],
    })

    ai({
      adapter: imageAdapter,
      model: 'image-model-1',
      prompt: 'A beautiful sunset',
      // @ts-expect-error - systemPrompts is a text-specific property
      systemPrompts: ['You are helpful'],
    })
  })

  it('should reject embedding-specific properties on image adapter', () => {
    const imageAdapter = new TestImageAdapter()

    ai({
      adapter: imageAdapter,
      model: 'image-model-1',
      prompt: 'A beautiful sunset',
      // @ts-expect-error - input is an embedding-specific property
      input: 'not allowed on image adapter',
    })

    ai({
      adapter: imageAdapter,
      model: 'image-model-1',
      prompt: 'A beautiful sunset',
      // @ts-expect-error - dimensions is an embedding-specific property
      dimensions: 1024,
    })
  })

  it('should reject summarize-specific properties on image adapter', () => {
    const imageAdapter = new TestImageAdapter()

    ai({
      adapter: imageAdapter,
      model: 'image-model-1',
      prompt: 'A beautiful sunset',
      // @ts-expect-error - text is a summarize-specific property
      text: 'not allowed on image adapter',
    })

    ai({
      adapter: imageAdapter,
      model: 'image-model-1',
      prompt: 'A beautiful sunset',
      // @ts-expect-error - maxLength is a summarize-specific property
      maxLength: 500,
    })

    ai({
      adapter: imageAdapter,
      model: 'image-model-1',
      prompt: 'A beautiful sunset',
      // @ts-expect-error - style (summarize) is a summarize-specific property
      style: 'bullet-points',
    })
  })

  it('should reject providerOptions from other adapters on image adapter', () => {
    const imageAdapter = new TestImageAdapter()

    ai({
      adapter: imageAdapter,
      model: 'image-model-1',
      prompt: 'A beautiful sunset',
      providerOptions: {
        // @ts-expect-error - temperature is a text providerOption
        temperature: 0.7,
      },
    })

    ai({
      adapter: imageAdapter,
      model: 'image-model-1',
      prompt: 'A beautiful sunset',
      providerOptions: {
        // @ts-expect-error - maxTokens is a text providerOption
        maxTokens: 100,
      },
    })

    ai({
      adapter: imageAdapter,
      model: 'image-model-1',
      prompt: 'A beautiful sunset',
      providerOptions: {
        // @ts-expect-error - encodingFormat is an embedding providerOption
        encodingFormat: 'float',
      },
    })
  })
})

// ===========================
// Embedding Adapter Type Tests
// ===========================

describe('ai() embedding adapter type safety', () => {
  it('should reject text-specific properties on embedding adapter', () => {
    const embedAdapter = new TestEmbedAdapter()

    ai({
      adapter: embedAdapter,
      model: 'text-embedding-3-small',
      input: 'Hello',
      // @ts-expect-error - messages is a text-specific property
      messages: [{ role: 'user', content: 'Hello' }],
    })

    ai({
      adapter: embedAdapter,
      model: 'text-embedding-3-small',
      input: 'Hello',
      // @ts-expect-error - tools is a text-specific property
      tools: [],
    })

    ai({
      adapter: embedAdapter,
      model: 'text-embedding-3-small',
      input: 'Hello',
      // @ts-expect-error - systemPrompts is a text-specific property
      systemPrompts: ['You are helpful'],
    })

    ai({
      adapter: embedAdapter,
      model: 'text-embedding-3-small',
      input: 'Hello',
      // @ts-expect-error - outputSchema is a text-specific property
      outputSchema: {},
    })
  })

  it('should reject summarize-specific properties on embedding adapter', () => {
    const embedAdapter = new TestEmbedAdapter()

    ai({
      adapter: embedAdapter,
      model: 'text-embedding-3-small',
      input: 'Hello',
      // @ts-expect-error - text is a summarize-specific property
      text: 'not allowed on embedding adapter',
    })

    ai({
      adapter: embedAdapter,
      model: 'text-embedding-3-small',
      input: 'Hello',
      // @ts-expect-error - maxLength is a summarize-specific property
      maxLength: 500,
    })

    ai({
      adapter: embedAdapter,
      model: 'text-embedding-3-small',
      input: 'Hello',
      // @ts-expect-error - style is a summarize-specific property
      style: 'bullet-points',
    })

    ai({
      adapter: embedAdapter,
      model: 'text-embedding-3-small',
      input: 'Hello',
      // @ts-expect-error - focus is a summarize-specific property
      focus: 'key points',
    })
  })

  it('should reject image-specific properties on embedding adapter', () => {
    const embedAdapter = new TestEmbedAdapter()

    ai({
      adapter: embedAdapter,
      model: 'text-embedding-3-small',
      input: 'Hello',
      // @ts-expect-error - prompt is an image-specific property
      prompt: 'not allowed on embedding adapter',
    })

    ai({
      adapter: embedAdapter,
      model: 'text-embedding-3-small',
      input: 'Hello',
      // @ts-expect-error - size is an image-specific property
      size: '1024x1024',
    })

    ai({
      adapter: embedAdapter,
      model: 'text-embedding-3-small',
      input: 'Hello',
      // @ts-expect-error - n is an image-specific property
      n: 4,
    })
  })

  it('should reject providerOptions from other adapters on embedding adapter', () => {
    const embedAdapter = new TestEmbedAdapter()

    ai({
      adapter: embedAdapter,
      model: 'text-embedding-3-small',
      input: 'Hello',
      providerOptions: {
        // @ts-expect-error - temperature is a text providerOption
        temperature: 0.7,
      },
    })

    ai({
      adapter: embedAdapter,
      model: 'text-embedding-3-small',
      input: 'Hello',
      providerOptions: {
        // @ts-expect-error - maxTokens is a text providerOption
        maxTokens: 100,
      },
    })

    ai({
      adapter: embedAdapter,
      model: 'text-embedding-3-small',
      input: 'Hello',
      providerOptions: {
        // @ts-expect-error - quality is an image providerOption
        quality: 'hd',
      },
    })
  })
})

// ===========================
// Summarize Adapter Type Tests
// ===========================

describe('ai() summarize adapter type safety', () => {
  it('should reject text-specific properties on summarize adapter', () => {
    const summarizeAdapter = new TestSummarizeAdapter()

    ai({
      adapter: summarizeAdapter,
      model: 'summarize-v1',
      text: 'Long text to summarize',
      // @ts-expect-error - messages is a text-specific property
      messages: [{ role: 'user', content: 'Hello' }],
    })

    ai({
      adapter: summarizeAdapter,
      model: 'summarize-v1',
      text: 'Long text to summarize',
      // @ts-expect-error - tools is a text-specific property
      tools: [],
    })

    ai({
      adapter: summarizeAdapter,
      model: 'summarize-v1',
      text: 'Long text to summarize',
      // @ts-expect-error - systemPrompts is a text-specific property
      systemPrompts: ['You are helpful'],
    })

    ai({
      adapter: summarizeAdapter,
      model: 'summarize-v1',
      text: 'Long text to summarize',
      // @ts-expect-error - outputSchema is a text-specific property
      outputSchema: {},
    })
  })

  it('should reject embedding-specific properties on summarize adapter', () => {
    const summarizeAdapter = new TestSummarizeAdapter()

    ai({
      adapter: summarizeAdapter,
      model: 'summarize-v1',
      text: 'Long text to summarize',
      // @ts-expect-error - input is an embedding-specific property
      input: 'not allowed on summarize adapter',
    })

    ai({
      adapter: summarizeAdapter,
      model: 'summarize-v1',
      text: 'Long text to summarize',
      // @ts-expect-error - dimensions is an embedding-specific property
      dimensions: 1024,
    })
  })

  it('should reject image-specific properties on summarize adapter', () => {
    const summarizeAdapter = new TestSummarizeAdapter()

    ai({
      adapter: summarizeAdapter,
      model: 'summarize-v1',
      text: 'Long text to summarize',
      // @ts-expect-error - prompt is an image-specific property
      prompt: 'not allowed on summarize adapter',
    })

    ai({
      adapter: summarizeAdapter,
      model: 'summarize-v1',
      text: 'Long text to summarize',
      // @ts-expect-error - size is an image-specific property
      size: '1024x1024',
    })

    ai({
      adapter: summarizeAdapter,
      model: 'summarize-v1',
      text: 'Long text to summarize',
      // @ts-expect-error - n is an image-specific property
      n: 4,
    })
  })

  it('should reject providerOptions from other adapters on summarize adapter', () => {
    const summarizeAdapter = new TestSummarizeAdapter()

    ai({
      adapter: summarizeAdapter,
      model: 'summarize-v1',
      text: 'Long text to summarize',
      providerOptions: {
        // @ts-expect-error - temperature is a text providerOption
        temperature: 0.7,
      },
    })

    ai({
      adapter: summarizeAdapter,
      model: 'summarize-v1',
      text: 'Long text to summarize',
      providerOptions: {
        // @ts-expect-error - maxTokens is a text providerOption
        maxTokens: 100,
      },
    })

    ai({
      adapter: summarizeAdapter,
      model: 'summarize-v1',
      text: 'Long text to summarize',
      providerOptions: {
        // @ts-expect-error - encodingFormat is an embedding providerOption
        encodingFormat: 'float',
      },
    })

    ai({
      adapter: summarizeAdapter,
      model: 'summarize-v1',
      text: 'Long text to summarize',
      providerOptions: {
        // @ts-expect-error - quality is an image providerOption
        quality: 'hd',
      },
    })
  })
})
