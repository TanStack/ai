/**
 * Type tests for the generate function
 * These tests verify that TypeScript correctly infers types and provides autocomplete
 */

import { describe, expectTypeOf, it } from 'vitest'
import {
  BaseChatAdapter,
  BaseEmbeddingAdapter,
  BaseSummarizeAdapter,
} from '../src/adapters'
import { generate } from '../src/core/generate'
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

describe('generate() type inference', () => {
  it('should infer chat adapter return type as AsyncIterable<StreamChunk>', () => {
    const chatAdapter = new TestChatAdapter()
    const result = generate({
      adapter: chatAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
    })

    expectTypeOf(result).toMatchTypeOf<AsyncIterable<StreamChunk>>()
  })

  it('should infer embedding adapter return type as Promise<EmbeddingResult>', () => {
    const embedAdapter = new TestEmbedAdapter()
    const result = generate({
      adapter: embedAdapter,
      model: 'text-embedding-3-small',
      input: 'Hello',
    })

    expectTypeOf(result).toMatchTypeOf<Promise<EmbeddingResult>>()
  })

  it('should infer summarize adapter return type as Promise<SummarizationResult>', () => {
    const summarizeAdapter = new TestSummarizeAdapter()
    const result = generate({
      adapter: summarizeAdapter,
      model: 'summarize-v1',
      text: 'Long text to summarize',
    })

    expectTypeOf(result).toMatchTypeOf<Promise<SummarizationResult>>()
  })

  it('should enforce valid model for chat adapter', () => {
    const chatAdapter = new TestChatAdapter()

    // This should work - valid model
    generate({
      adapter: chatAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
    })

    // invalid model should error
    generate({
      adapter: chatAdapter,
      // @ts-expect-error - invalid model
      model: 'invalid-model',
      messages: [{ role: 'user', content: 'Hello' }],
    })
  })

  it('should enforce valid model for embedding adapter', () => {
    const embedAdapter = new TestEmbedAdapter()

    // This should work - valid model
    generate({
      adapter: embedAdapter,
      model: 'text-embedding-3-small',
      input: 'Hello',
    })

    // invalid model should error
    generate({
      adapter: embedAdapter,
      // @ts-expect-error - invalid model
      model: 'invalid-embedding-model',
      input: 'Hello',
    })
  })

  it('should enforce valid model for summarize adapter', () => {
    const summarizeAdapter = new TestSummarizeAdapter()

    // This should work - valid model
    generate({
      adapter: summarizeAdapter,
      model: 'summarize-v1',
      text: 'Text to summarize',
    })

    // invalid model should error
    generate({
      adapter: summarizeAdapter,
      // @ts-expect-error - invalid model
      model: 'invalid-summarize-model',
      text: 'Text to summarize',
    })
  })

  it('should enforce strict providerOptions for chat adapter', () => {
    const chatAdapter = new TestChatAdapter()

    // This should work - valid provider options
    generate({
      adapter: chatAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
      providerOptions: {
        temperature: 0.7,
        maxTokens: 100,
      },
    })

    // invalid property should error
    generate({
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
    generate({
      adapter: embedAdapter,
      model: 'text-embedding-3-small',
      input: 'Hello',
      providerOptions: {
        encodingFormat: 'float',
      },
    })

    // temperature is not valid for embedding adapter
    generate({
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
    generate({
      adapter: summarizeAdapter,
      model: 'summarize-v1',
      text: 'Text to summarize',
      providerOptions: {
        style: 'bullet-points',
      },
    })

    // invalid property should error
    generate({
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

    generate({
      adapter: embedAdapter,
      model: 'text-embedding-3-small',
      input: 'Hello',
      // @ts-expect-error - messages is not valid for embedding adapter
      messages: [{ role: 'user', content: 'Hello' }],
    })
  })

  it('should not allow chat-specific options for summarize adapter', () => {
    const summarizeAdapter = new TestSummarizeAdapter()

    generate({
      adapter: summarizeAdapter,
      model: 'summarize-v1',
      text: 'Text to summarize',
      // @ts-expect-error - messages is not valid for summarize adapter
      messages: [{ role: 'user', content: 'Hello' }],
    })
  })

  it('should not allow embedding-specific options for chat adapter', () => {
    const chatAdapter = new TestChatAdapter()

    generate({
      adapter: chatAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
      // @ts-expect-error - input is not valid for chat adapter
      input: 'Hello',
    })
  })

  it('should not allow summarize-specific options for chat adapter', () => {
    const chatAdapter = new TestChatAdapter()

    generate({
      adapter: chatAdapter,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
      // @ts-expect-error - text is not valid for chat adapter
      text: 'Text to summarize',
    })
  })
})
