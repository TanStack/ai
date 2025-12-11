/**
 * Type tests for the ai function
 * These tests verify that TypeScript correctly infers types and provides autocomplete
 */

import { describe, expectTypeOf, it } from 'vitest'
import {
  BaseChatAdapter,
  BaseEmbeddingAdapter,
  BaseSummarizeAdapter,
} from '../src/adapters'
import { ai } from '../src/core/generate'
import type {
  ChatOptions,
  EmbeddingOptions,
  EmbeddingResult,
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
} from '../src/types'

// Define test models
const TEST_CHAT_MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'] as const
const TEST_EMBED_MODELS = [
  'text-embedding-3-large',
  'text-embedding-3-small',
] as const
const TEST_SUMMARIZE_MODELS = ['summarize-v1', 'summarize-v2'] as const

// Define strict provider options for testing (without index signatures)
interface TestChatProviderOptions {
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
class TestChatAdapter extends BaseChatAdapter<
  typeof TEST_CHAT_MODELS,
  TestChatProviderOptions
> {
  readonly kind = 'chat' as const
  readonly name = 'test' as const
  readonly models = TEST_CHAT_MODELS

  constructor() {
    super({})
  }

  async *chatStream(_options: ChatOptions): AsyncIterable<StreamChunk> {
    // Mock implementation
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
  it('should infer chat adapter return type as AsyncIterable<StreamChunk>', () => {
    const chatAdapter = new TestChatAdapter()
    const result = ai({
      adapter: chatAdapter,
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

  it('should enforce valid model for chat adapter', () => {
    const chatAdapter = new TestChatAdapter()

    // This should work - valid model
    ai({
      adapter: chatAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
    })

    // invalid model should error
    ai({
      adapter: chatAdapter,
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

  it('should enforce strict providerOptions for chat adapter', () => {
    const chatAdapter = new TestChatAdapter()

    // This should work - valid provider options
    ai({
      adapter: chatAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
      providerOptions: {
        temperature: 0.7,
        maxTokens: 100,
      },
    })

    // invalid property should error
    ai({
      adapter: chatAdapter,
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

  it('should not allow embedding-specific options for chat adapter', () => {
    const chatAdapter = new TestChatAdapter()

    ai({
      adapter: chatAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
      // @ts-expect-error - input is not valid for chat adapter
      input: 'Hello',
    })
  })

  it('should not allow summarize-specific options for chat adapter', () => {
    const chatAdapter = new TestChatAdapter()

    ai({
      adapter: chatAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
      // @ts-expect-error - text is not valid for chat adapter
      text: 'Text to summarize',
    })
  })
})

describe('ai() with outputSchema', () => {
  // Import zod for schema tests
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const { z } = require('zod') as typeof import('zod')

  it('should return Promise<T> when outputSchema is provided', () => {
    const chatAdapter = new TestChatAdapter()

    const PersonSchema = z.object({
      name: z.string(),
      age: z.number(),
    })

    const result = ai({
      adapter: chatAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Generate a person' }],
      outputSchema: PersonSchema,
    })

    // Return type should be Promise<{ name: string; age: number }>
    expectTypeOf(result).toMatchTypeOf<Promise<{ name: string; age: number }>>()
  })

  it('should return AsyncIterable<StreamChunk> when outputSchema is not provided', () => {
    const chatAdapter = new TestChatAdapter()

    const result = ai({
      adapter: chatAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
    })

    // Return type should be AsyncIterable<StreamChunk>
    expectTypeOf(result).toMatchTypeOf<AsyncIterable<StreamChunk>>()
  })

  it('should infer complex nested schema types', () => {
    const chatAdapter = new TestChatAdapter()

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
      adapter: chatAdapter,
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
    const chatAdapter = new TestChatAdapter()

    const PersonSchema = z.object({
      name: z.string(),
      age: z.number().optional(),
      email: z.string().nullable(),
    })

    const result = ai({
      adapter: chatAdapter,
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
    const chatAdapter = new TestChatAdapter()

    const ResponseSchema = z.discriminatedUnion('type', [
      z.object({ type: z.literal('success'), data: z.string() }),
      z.object({ type: z.literal('error'), message: z.string() }),
    ])

    const result = ai({
      adapter: chatAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Generate a response' }],
      outputSchema: ResponseSchema,
    })

    expectTypeOf(result).toMatchTypeOf<
      Promise<
        | { type: 'success'; data: string }
        | { type: 'error'; message: string }
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

  it('should not allow stream option for chat adapter', () => {
    const chatAdapter = new TestChatAdapter()

    ai({
      adapter: chatAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
      // @ts-expect-error - stream is not valid for chat adapter
      stream: true,
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
