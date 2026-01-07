/**
 * Type Safety Tests for chat() function
 *
 * These tests verify that the chat() function correctly constrains types based on:
 * 1. Model-specific provider options (modelOptions)
 * 2. Model-specific input modalities (message content types)
 * 3. Model-specific message metadata (e.g., detail for images)
 *
 * Uses @ts-expect-error to ensure TypeScript catches invalid type combinations.
 */
import { describe, expectTypeOf, it } from 'vitest'
import { BaseTextAdapter } from '../src/activities/chat/adapter'
import { chat } from '../src/activities/chat'
import type { StreamChunk, TextOptions } from '../src/types'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '../src/activities/chat/adapter'

// ===========================
// Mock Provider Options Types
// ===========================

/**
 * Base options available to ALL mock models
 */
interface MockBaseOptions {
  availableOnAllModels?: boolean
}

/**
 * Reasoning options - only available to advanced models like mock-gpt-5
 */
interface MockReasoningOptions {
  reasoning?: {
    effort?: 'none' | 'low' | 'medium' | 'high'
    summary?: 'auto' | 'detailed'
  }
}

/**
 * Structured output options - only available to advanced models
 */
interface MockStructuredOutputOptions {
  text?: {
    format?: { type: 'json_schema'; json_schema: Record<string, unknown> }
  }
}

/**
 * Tools options - only available to advanced models
 */
interface MockToolsOptions {
  tool_choice?: 'auto' | 'none' | 'required'
  parallel_tool_calls?: boolean
}

/**
 * Streaming options
 */
interface MockStreamingOptions {
  stream_options?: {
    include_obfuscation?: boolean
  }
}

// ===========================
// Mock Model Metadata
// ===========================

/**
 * Metadata for mock image content parts.
 */
interface MockImageMetadata {
  /**
   * Controls how the model processes the image.
   */
  detail?: 'auto' | 'low' | 'high'
}

/**
 * Metadata for mock audio content parts.
 */
interface MockAudioMetadata {
  format?: 'mp3' | 'wav' | 'flac'
}

/**
 * Metadata for mock text content parts - no specific options
 */
interface MockTextMetadata {}

/**
 * Metadata for mock video content parts - no specific options
 */
interface MockVideoMetadata {}

/**
 * Metadata for mock document content parts - no specific options
 */
interface MockDocumentMetadata {}

/**
 * Map of modality types to their mock-specific metadata types.
 */
interface MockMessageMetadataByModality {
  text: MockTextMetadata
  image: MockImageMetadata
  audio: MockAudioMetadata
  video: MockVideoMetadata
  document: MockDocumentMetadata
}

// ===========================
// Mock Model Definitions
// ===========================

/**
 * mock-gpt-5: Advanced model with full features
 * - Supports: text + image input
 * - Has: reasoning, structured output, tools, streaming options
 */
const MOCK_GPT_5 = {
  name: 'mock-gpt-5',
  supports: {
    input: ['text', 'image'] as const,
    output: ['text'] as const,
  },
} as const

/**
 * mock-gpt-3.5-turbo: Basic model with limited features
 * - Supports: text-only input
 * - Has: base options only (no reasoning, no structured output, no tools)
 */
const MOCK_GPT_3_5_TURBO = {
  name: 'mock-gpt-3.5-turbo',
  supports: {
    input: ['text'] as const,
    output: ['text'] as const,
  },
} as const

// ===========================
// Mock Model Types
// ===========================

/**
 * List of available mock chat models
 */
const MOCK_CHAT_MODELS = [MOCK_GPT_5.name, MOCK_GPT_3_5_TURBO.name] as const

type MockChatModel = (typeof MOCK_CHAT_MODELS)[number]

/**
 * Type map: model name -> provider options
 */
type MockChatModelProviderOptionsByName = {
  'mock-gpt-5': MockBaseOptions &
    MockReasoningOptions &
    MockStructuredOutputOptions &
    MockToolsOptions &
    MockStreamingOptions
  'mock-gpt-3.5-turbo': MockBaseOptions & MockStreamingOptions
}

/**
 * Type map: model name -> input modalities
 */
type MockModelInputModalitiesByName = {
  'mock-gpt-5': typeof MOCK_GPT_5.supports.input
  'mock-gpt-3.5-turbo': typeof MOCK_GPT_3_5_TURBO.supports.input
}

// ===========================
// Type Resolution Helpers
// ===========================

/**
 * Resolve provider options for a specific mock model.
 */
type ResolveProviderOptions<TModel extends string> =
  TModel extends keyof MockChatModelProviderOptionsByName
    ? MockChatModelProviderOptionsByName[TModel]
    : MockBaseOptions

/**
 * Resolve input modalities for a specific mock model.
 */
type ResolveInputModalities<TModel extends string> =
  TModel extends keyof MockModelInputModalitiesByName
    ? MockModelInputModalitiesByName[TModel]
    : readonly ['text', 'image', 'audio']

// ===========================
// Mock Adapter Implementation
// ===========================

/**
 * Mock Text Adapter - simulates OpenAI adapter structure
 */
class MockTextAdapter<TModel extends MockChatModel> extends BaseTextAdapter<
  TModel,
  ResolveProviderOptions<TModel>,
  ResolveInputModalities<TModel>,
  MockMessageMetadataByModality
> {
  readonly kind = 'text' as const
  readonly name = 'mock' as const

  constructor(model: TModel) {
    super({}, model)
  }

  /* eslint-disable @typescript-eslint/require-await */
  async *chatStream(
    _options: TextOptions<ResolveProviderOptions<TModel>>,
  ): AsyncIterable<StreamChunk> {
    yield {
      type: 'content',
      model: this.model,
      id: 'mock-id',
      timestamp: Date.now(),
      delta: 'Hello',
      content: 'Hello',
      role: 'assistant',
    }
    yield {
      type: 'done',
      model: this.model,
      id: 'mock-id',
      timestamp: Date.now(),
      finishReason: 'stop',
    }
  }
  /* eslint-enable @typescript-eslint/require-await */

  /* eslint-disable @typescript-eslint/require-await */
  async structuredOutput(
    _options: StructuredOutputOptions<ResolveProviderOptions<TModel>>,
  ): Promise<StructuredOutputResult<unknown>> {
    return { data: {}, rawText: '{}' }
  }
  /* eslint-enable @typescript-eslint/require-await */
}

/**
 * Factory function to create mock adapters with proper type inference
 */
function mockText<TModel extends MockChatModel>(
  model: TModel,
): MockTextAdapter<TModel> {
  return new MockTextAdapter(model)
}

// ===========================
// Type Safety Tests
// ===========================

describe('Type Safety Tests for chat() function', () => {
  describe('Provider Options (modelOptions) Type Safety', () => {
    it('should allow passing in common options', () => {
      chat({
        adapter: mockText('mock-gpt-5'),
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
      })
      chat({
        adapter: mockText('mock-gpt-3.5-turbo'),
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
      })
    })

    it('should not allow arbitrary keys in chat options', () => {
      chat({
        adapter: mockText('mock-gpt-5'),
        messages: [{ role: 'user', content: 'Hello' }],
        // @ts-expect-error - invalid chat option
        random: true,
      })
      chat({
        adapter: mockText('mock-gpt-3.5-turbo'),
        messages: [{ role: 'user', content: 'Hello' }],
        // @ts-expect-error - invalid chat option
        random: true,
      })
    })

    it('common options only accept valid keys at root level', () => {
      chat({
        adapter: mockText('mock-gpt-5'),
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
        // @ts-expect-error - invalid option at root level
        random_option: true,
      })
      chat({
        adapter: mockText('mock-gpt-3.5-turbo'),
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
        // @ts-expect-error - invalid option at root level
        random_option: true,
      })
    })
    describe('mock-gpt-5 (full featured model)', () => {
      it('should allow reasoning options', () => {
        // This should compile - mock-gpt-5 supports reasoning
        chat({
          adapter: mockText('mock-gpt-5'),
          messages: [{ role: 'user', content: 'Hello' }],
          modelOptions: {
            reasoning: {
              effort: 'high',
              summary: 'detailed',
            },
          },
        })
      })

      it('should allow tool options', () => {
        // This should compile - mock-gpt-5 supports tools
        chat({
          adapter: mockText('mock-gpt-5'),
          messages: [{ role: 'user', content: 'Hello' }],
          modelOptions: {
            tool_choice: 'auto',
            parallel_tool_calls: true,
          },
        })
      })

      it('should allow structured output options', () => {
        // This should compile - mock-gpt-5 supports structured output
        chat({
          adapter: mockText('mock-gpt-5'),
          messages: [{ role: 'user', content: 'Hello' }],
          modelOptions: {
            text: {
              format: {
                type: 'json_schema',
                json_schema: { type: 'object' },
              },
            },
          },
        })
      })

      it('should allow base options', () => {
        // This should compile - all models support base options
        chat({
          adapter: mockText('mock-gpt-5'),
          messages: [{ role: 'user', content: 'Hello' }],
          modelOptions: {
            availableOnAllModels: true,
          },
        })
      })

      it('should NOT allow unknown options', () => {
        chat({
          adapter: mockText('mock-gpt-5'),
          messages: [{ role: 'user', content: 'Hello' }],
          modelOptions: {
            // @ts-expect-error - 'unknownOption' does not exist on mock-gpt-5 provider options
            unknownOption: true,
          },
        })
      })
    })

    describe('mock-gpt-3.5-turbo (limited model)', () => {
      it('should allow base options', () => {
        // This should compile - all models support base options
        chat({
          adapter: mockText('mock-gpt-3.5-turbo'),
          messages: [{ role: 'user', content: 'Hello' }],
          modelOptions: {
            availableOnAllModels: true,
          },
        })
      })

      it('should allow streaming options', () => {
        // This should compile - mock-gpt-3.5-turbo supports streaming options
        chat({
          adapter: mockText('mock-gpt-3.5-turbo'),
          messages: [{ role: 'user', content: 'Hello' }],
          modelOptions: {
            stream_options: {
              include_obfuscation: true,
            },
          },
        })
      })

      it('should NOT allow reasoning options', () => {
        chat({
          adapter: mockText('mock-gpt-3.5-turbo'),
          messages: [{ role: 'user', content: 'Hello' }],
          modelOptions: {
            // @ts-expect-error - 'reasoning' does not exist on mock-gpt-3.5-turbo provider options
            reasoning: {
              effort: 'high',
            },
          },
        })
      })

      it('should NOT allow tool_choice option', () => {
        chat({
          adapter: mockText('mock-gpt-3.5-turbo'),
          messages: [{ role: 'user', content: 'Hello' }],
          modelOptions: {
            // @ts-expect-error - 'tool_choice' does not exist on mock-gpt-3.5-turbo provider options
            tool_choice: 'auto',
          },
        })
      })

      it('should NOT allow parallel_tool_calls option', () => {
        chat({
          adapter: mockText('mock-gpt-3.5-turbo'),
          messages: [{ role: 'user', content: 'Hello' }],
          modelOptions: {
            // @ts-expect-error - 'parallel_tool_calls' does not exist on mock-gpt-3.5-turbo provider options
            parallel_tool_calls: true,
          },
        })
      })

      it('should NOT allow text/structured output options', () => {
        chat({
          adapter: mockText('mock-gpt-3.5-turbo'),
          messages: [{ role: 'user', content: 'Hello' }],
          modelOptions: {
            // @ts-expect-error - 'text' does not exist on mock-gpt-3.5-turbo provider options
            text: {
              format: { type: 'json_schema', json_schema: {} },
            },
          },
        })
      })
    })
  })

  describe('Input Modalities Type Safety', () => {
    describe('mock-gpt-5 (text + image)', () => {
      it('should allow text content', () => {
        // This should compile - mock-gpt-5 supports text
        chat({
          adapter: mockText('mock-gpt-5'),
          messages: [{ role: 'user', content: 'Hello' }],
        })
      })

      it('should allow text content part', () => {
        // This should compile - mock-gpt-5 supports text
        chat({
          adapter: mockText('mock-gpt-5'),
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', content: 'Hello' }],
            },
          ],
        })
      })

      it('should allow image content part', () => {
        // This should compile - mock-gpt-5 supports image
        chat({
          adapter: mockText('mock-gpt-5'),
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', content: 'Describe this image:' },
                {
                  type: 'image',
                  source: {
                    type: 'url',
                    value: 'https://example.com/image.png',
                  },
                },
              ],
            },
          ],
        })
      })

      it('should allow image metadata (detail)', () => {
        // This should compile - mock-gpt-5 supports image with detail metadata
        chat({
          adapter: mockText('mock-gpt-5'),
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'url',
                    value: 'https://example.com/image.png',
                  },
                  metadata: { detail: 'high' },
                },
              ],
            },
          ],
        })
      })

      it('should NOT allow audio content part', () => {
        chat({
          adapter: mockText('mock-gpt-5'),
          messages: [
            {
              role: 'user',
              content: [
                {
                  // @ts-expect-error - mock-gpt-5 does not support audio input
                  type: 'audio',
                  source: { type: 'data', value: 'base64data' },
                },
              ],
            },
          ],
        })
      })

      it('should NOT allow video content part', () => {
        chat({
          adapter: mockText('mock-gpt-5'),
          messages: [
            {
              role: 'user',
              content: [
                {
                  // @ts-expect-error - mock-gpt-5 does not support video input
                  type: 'video',
                  source: {
                    type: 'url',
                    value: 'https://example.com/video.mp4',
                  },
                },
              ],
            },
          ],
        })
      })

      it('should NOT allow document content part', () => {
        chat({
          adapter: mockText('mock-gpt-5'),
          messages: [
            {
              role: 'user',
              content: [
                {
                  // @ts-expect-error - mock-gpt-5 does not support document input
                  type: 'document',
                  source: {
                    type: 'url',
                    value: 'https://example.com/doc.pdf',
                  },
                },
              ],
            },
          ],
        })
      })
    })

    describe('mock-gpt-3.5-turbo (text only)', () => {
      it('should allow text content', () => {
        // This should compile - mock-gpt-3.5-turbo supports text
        chat({
          adapter: mockText('mock-gpt-3.5-turbo'),
          messages: [{ role: 'user', content: 'Hello' }],
        })
      })

      it('should allow text content part', () => {
        // This should compile - mock-gpt-3.5-turbo supports text
        chat({
          adapter: mockText('mock-gpt-3.5-turbo'),
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', content: 'Hello' }],
            },
          ],
        })
      })

      it('should NOT allow image content part', () => {
        chat({
          adapter: mockText('mock-gpt-3.5-turbo'),
          messages: [
            {
              role: 'user',
              content: [
                {
                  // @ts-expect-error - mock-gpt-3.5-turbo does not support image input
                  type: 'image',
                  source: {
                    type: 'url',
                    value: 'https://example.com/image.png',
                  },
                },
              ],
            },
          ],
        })
      })

      it('should NOT allow audio content part', () => {
        chat({
          adapter: mockText('mock-gpt-3.5-turbo'),
          messages: [
            {
              role: 'user',
              content: [
                {
                  // @ts-expect-error - mock-gpt-3.5-turbo does not support audio input
                  type: 'audio',
                  source: {
                    type: 'base64',
                    value: 'base64data',
                    mediaType: 'audio/mp3',
                  },
                },
              ],
            },
          ],
        })
      })

      it('should NOT allow video content part', () => {
        chat({
          adapter: mockText('mock-gpt-3.5-turbo'),
          messages: [
            {
              role: 'user',
              content: [
                {
                  // @ts-expect-error - mock-gpt-3.5-turbo does not support video input
                  type: 'video',
                  source: {
                    type: 'url',
                    value: 'https://example.com/video.mp4',
                  },
                },
              ],
            },
          ],
        })
      })

      it('should NOT allow document content part', () => {
        chat({
          adapter: mockText('mock-gpt-3.5-turbo'),
          messages: [
            {
              role: 'user',
              content: [
                {
                  // @ts-expect-error - mock-gpt-3.5-turbo does not support document input
                  type: 'document',
                  source: {
                    type: 'url',
                    value: 'https://example.com/doc.pdf',
                  },
                },
              ],
            },
          ],
        })
      })
    })
  })

  describe('Message Metadata Type Safety', () => {
    describe('mock-gpt-5 image metadata', () => {
      it('should allow valid detail values', () => {
        // This should compile - 'auto', 'low', 'high' are valid detail values
        const _stream1 = chat({
          adapter: mockText('mock-gpt-5'),
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'url',
                    value: 'https://example.com/image.png',
                  },
                  metadata: { detail: 'auto' },
                },
              ],
            },
          ],
        })

        const _stream2 = chat({
          adapter: mockText('mock-gpt-5'),
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'url',
                    value: 'https://example.com/image.png',
                  },
                  metadata: { detail: 'low' },
                },
              ],
            },
          ],
        })

        const _stream3 = chat({
          adapter: mockText('mock-gpt-5'),
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'url',
                    value: 'https://example.com/image.png',
                  },
                  metadata: { detail: 'high' },
                },
              ],
            },
          ],
        })

        expectTypeOf(_stream1).toBeObject()
        expectTypeOf(_stream2).toBeObject()
        expectTypeOf(_stream3).toBeObject()
      })

      it('should NOT allow invalid detail values', () => {
        chat({
          adapter: mockText('mock-gpt-5'),
          messages: [
            {
              role: 'user',
              content: [
                // @ts-expect-error - 'ultra' is not a valid detail value
                {
                  type: 'image',
                  source: {
                    type: 'url',
                    value: 'https://example.com/image.png',
                  },
                  metadata: { detail: 'ultra' },
                },
              ],
            },
          ],
        })
      })

      it('should NOT allow unknown metadata properties on image', () => {
        chat({
          adapter: mockText('mock-gpt-5'),
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'url',
                    value: 'https://example.com/image.png',
                  },
                  // @ts-expect-error - 'quality' is not a valid metadata property for images
                  metadata: { quality: 'hd' },
                },
              ],
            },
          ],
        })
      })
    })

    describe('text metadata (should have no specific options)', () => {
      it('should allow text without metadata', () => {
        // This should compile - text doesn't require metadata
        chat({
          adapter: mockText('mock-gpt-5'),
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', content: 'Hello' }],
            },
          ],
        })
      })

      it('should allow text with empty metadata', () => {
        // This should compile - empty metadata is fine
        chat({
          adapter: mockText('mock-gpt-5'),
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', content: 'Hello', metadata: {} }],
            },
          ],
        })
      })
    })
  })

  describe('Model Name Type Safety', () => {
    it('should accept valid model names', () => {
      // These should compile
      const _adapter1 = mockText('mock-gpt-5')
      const _adapter2 = mockText('mock-gpt-3.5-turbo')
      expectTypeOf(_adapter1).toBeObject()
      expectTypeOf(_adapter2).toBeObject()
    })

    it('should NOT accept invalid model names', () => {
      // @ts-expect-error - 'invalid-model' is not a valid mock model name
      const _adapter = mockText('invalid-model')
    })
  })

  describe('Combined Scenarios', () => {
    it('mock-gpt-5: full featured call should work', () => {
      // This should compile - using all features available to mock-gpt-5
      chat({
        adapter: mockText('mock-gpt-5'),
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', content: 'Analyze this image:' },
              {
                type: 'image',
                source: { type: 'url', value: 'https://example.com/image.png' },
                metadata: { detail: 'high' },
              },
            ],
          },
        ],
        modelOptions: {
          reasoning: {
            effort: 'medium',
            summary: 'auto',
          },
          tool_choice: 'auto',
          parallel_tool_calls: true,
        },
        systemPrompts: ['You are a helpful assistant.'],
      })
    })

    it('mock-gpt-3.5-turbo: should error with advanced features', () => {
      chat({
        adapter: mockText('mock-gpt-3.5-turbo'),
        messages: [
          {
            role: 'user',
            content: [
              {
                // @ts-expect-error - mock-gpt-3.5-turbo doesn't support reasoning OR image input
                type: 'image',
                source: { type: 'url', value: 'https://example.com/image.png' },
              },
            ],
          },
        ],
        modelOptions: {
          // @ts-expect-error - mock-gpt-3.5-turbo doesn't support reasoning options
          reasoning: { effort: 'high' },
        },
      })
    })

    it('mock-gpt-3.5-turbo: basic call should work', () => {
      // This should compile - using only features available to mock-gpt-3.5-turbo
      chat({
        adapter: mockText('mock-gpt-3.5-turbo'),
        messages: [{ role: 'user', content: 'Hello!' }],
        modelOptions: {
          availableOnAllModels: true,
        },
        systemPrompts: ['You are a helpful assistant.'],
      })
    })
  })
})

describe('Provider Options Type Assertions', () => {
  describe('mock-gpt-5 should extend all option interfaces', () => {
    it('should have reasoning options', () => {
      type Options = MockChatModelProviderOptionsByName['mock-gpt-5']
      expectTypeOf<Options>().toHaveProperty('reasoning')
    })

    it('should have tool options', () => {
      type Options = MockChatModelProviderOptionsByName['mock-gpt-5']
      expectTypeOf<Options>().toHaveProperty('tool_choice')
      expectTypeOf<Options>().toHaveProperty('parallel_tool_calls')
    })

    it('should have structured output options', () => {
      type Options = MockChatModelProviderOptionsByName['mock-gpt-5']
      expectTypeOf<Options>().toHaveProperty('text')
    })

    it('should have base options', () => {
      type Options = MockChatModelProviderOptionsByName['mock-gpt-5']
      expectTypeOf<Options>().toHaveProperty('availableOnAllModels')
    })
  })

  describe('mock-gpt-3.5-turbo should only have limited options', () => {
    it('should NOT have reasoning options', () => {
      type Options = MockChatModelProviderOptionsByName['mock-gpt-3.5-turbo']
      // Reasoning should not be a property
      expectTypeOf<Options>().not.toHaveProperty('reasoning')
    })

    it('should NOT have tool options', () => {
      type Options = MockChatModelProviderOptionsByName['mock-gpt-3.5-turbo']
      expectTypeOf<Options>().not.toHaveProperty('tool_choice')
      expectTypeOf<Options>().not.toHaveProperty('parallel_tool_calls')
    })

    it('should NOT have structured output options', () => {
      type Options = MockChatModelProviderOptionsByName['mock-gpt-3.5-turbo']
      expectTypeOf<Options>().not.toHaveProperty('text')
    })

    it('should have base options', () => {
      type Options = MockChatModelProviderOptionsByName['mock-gpt-3.5-turbo']
      expectTypeOf<Options>().toHaveProperty('availableOnAllModels')
    })
  })
})

describe('Input Modalities Type Assertions', () => {
  describe('mock-gpt-5 (text + image)', () => {
    type Modalities = MockModelInputModalitiesByName['mock-gpt-5']

    it('should support text and image', () => {
      // Verify the modalities array contains exactly text and image
      expectTypeOf<Modalities>().toEqualTypeOf<readonly ['text', 'image']>()
    })
  })

  describe('mock-gpt-3.5-turbo (text only)', () => {
    type Modalities = MockModelInputModalitiesByName['mock-gpt-3.5-turbo']

    it('should only support text', () => {
      // Verify the modalities array contains only text
      expectTypeOf<Modalities>().toEqualTypeOf<readonly ['text']>()
    })
  })
})
