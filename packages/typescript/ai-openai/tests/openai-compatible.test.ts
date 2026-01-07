import { describe, expect, it, vi } from 'vitest'
import {
  OpenAICompatibleTextAdapter,
  createOpenAICompatibleProvider,
} from '../src/adapters/text-adapter'

// Mock the OpenAI client
vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      responses = {
        create: vi.fn(),
      }
    },
  }
})

describe('OpenAI-Compatible Provider Utilities', () => {
  describe('createOpenAICompatibleProvider', () => {
    it('should create a provider with the correct structure', () => {
      const provider = createOpenAICompatibleProvider(
        {
          name: 'test-provider',
          apiKey: 'test-api-key',
          baseURL: 'https://api.test.com/v1',
        },
        'test-model-1',
      )

      expect(provider.name).toBe('test-provider')
      expect(provider.model).toBe('test-model-1')
      expect(typeof provider.chatStream).toBe('function')
      expect(typeof provider.structuredOutput).toBe('function')
    })

    it('should have chatStream and structuredOutput methods', () => {
      const provider = createOpenAICompatibleProvider(
        {
          name: 'test-provider',
          apiKey: 'test-api-key',
          baseURL: 'https://api.test.com/v1',
        },
        'test-model-2',
      )

      expect(typeof provider.chatStream).toBe('function')
      expect(typeof provider.structuredOutput).toBe('function')
    })
  })

  describe('OpenAICompatibleTextAdapter', () => {
    const CUSTOM_MODELS = ['custom-a', 'custom-b'] as const

    type CustomProviderOptions = {
      'custom-a': { optionA?: boolean }
      'custom-b': { optionA?: boolean; optionB?: string }
    }

    type CustomInputModalities = {
      'custom-a': readonly ['text']
      'custom-b': readonly ['text', 'image']
    }

    it('should create adapter with custom model', () => {
      const adapter = new OpenAICompatibleTextAdapter<
        typeof CUSTOM_MODELS,
        'custom-b',
        CustomProviderOptions,
        CustomInputModalities
      >(
        {
          apiKey: 'test-key',
          baseURL: 'https://api.custom.com/v1',
          name: 'custom',
        },
        'custom-b',
      )

      expect(adapter.model).toBe('custom-b')
      expect(adapter.name).toBe('custom')
      expect(adapter.kind).toBe('text')
    })

    it('should default name to openai-compatible when not specified', () => {
      const adapter = new OpenAICompatibleTextAdapter<
        typeof CUSTOM_MODELS,
        'custom-a'
      >(
        {
          apiKey: 'test-key',
          baseURL: 'https://api.custom.com/v1',
        },
        'custom-a',
      )

      expect(adapter.name).toBe('openai-compatible')
    })
  })

  describe('Type Safety', () => {
    it('should constrain model parameter to valid models', () => {
      const TYPED_MODELS = ['model-x', 'model-y', 'model-z'] as const

      const provider = createOpenAICompatibleProvider<
        typeof TYPED_MODELS,
        'model-x'
      >(
        {
          name: 'typed-provider',
          apiKey: 'test-api-key',
          baseURL: 'https://api.typed.com/v1',
        },
        'model-x',
      )

      // Provider should have the correct model
      expect(provider.model).toBe('model-x')
    })

    it('should support uniform provider options', () => {
      const UNIFORM_MODELS = ['u1', 'u2', 'u3'] as const

      interface CommonOptions {
        debug?: boolean
        timeout?: number
      }

      // Type-level test - if this compiles, the types work
      type UniformOptions = {
        [K in (typeof UNIFORM_MODELS)[number]]: CommonOptions
      }

      const provider = createOpenAICompatibleProvider<
        typeof UNIFORM_MODELS,
        'u1',
        UniformOptions
      >(
        {
          name: 'uniform',
          apiKey: 'test-api-key',
          baseURL: 'https://api.uniform.com/v1',
        },
        'u1',
      )

      expect(provider.name).toBe('uniform')
      expect(provider.model).toBe('u1')
    })

    it('should support per-model input modalities', () => {
      const MULTI_MODELS = ['text-only', 'multimodal'] as const

      type ModalitiesByModel = {
        'text-only': readonly ['text']
        multimodal: readonly ['text', 'image', 'audio']
      }

      const provider = createOpenAICompatibleProvider<
        typeof MULTI_MODELS,
        'multimodal',
        Record<string, object>,
        ModalitiesByModel
      >(
        {
          name: 'multi',
          apiKey: 'test-api-key',
          baseURL: 'https://api.multi.com/v1',
        },
        'multimodal',
      )

      expect(provider.model).toBe('multimodal')
    })
  })

  describe('Real-world examples', () => {
    it('should work for Qwen-like provider', () => {
      const QWEN_MODELS = ['qwen-turbo', 'qwen-plus', 'qwen-max'] as const

      type QwenProviderOptions = {
        'qwen-turbo': { enable_search?: boolean }
        'qwen-plus': { enable_search?: boolean; plugins?: Array<string> }
        'qwen-max': {
          enable_search?: boolean
          plugins?: Array<string>
          reasoning_effort?: 'low' | 'medium' | 'high'
        }
      }

      type QwenInputModalities = {
        'qwen-turbo': readonly ['text']
        'qwen-plus': readonly ['text', 'image']
        'qwen-max': readonly ['text', 'image', 'audio']
      }

      const qwen = createOpenAICompatibleProvider<
        typeof QWEN_MODELS,
        'qwen-plus',
        QwenProviderOptions,
        QwenInputModalities
      >(
        {
          name: 'qwen',
          apiKey: 'test-api-key',
          baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        },
        'qwen-plus',
      )

      expect(qwen.name).toBe('qwen')
      expect(qwen.model).toBe('qwen-plus')
      expect(typeof qwen.chatStream).toBe('function')
      expect(typeof qwen.structuredOutput).toBe('function')
    })

    it('should work for Grok-like provider', () => {
      const GROK_MODELS = ['grok-1', 'grok-2', 'grok-2-mini'] as const

      const grok = createOpenAICompatibleProvider<typeof GROK_MODELS, 'grok-2'>(
        {
          name: 'grok',
          apiKey: 'test-api-key',
          baseURL: 'https://api.x.ai/v1',
        },
        'grok-2',
      )

      expect(grok.name).toBe('grok')
      expect(grok.model).toBe('grok-2')
      expect(typeof grok.chatStream).toBe('function')
      expect(typeof grok.structuredOutput).toBe('function')
    })
  })

  describe('Strict Empty Object Type Safety', () => {
    it('should reject arbitrary properties on empty metadata objects', () => {
      const QWEN_MODELS = ['qwen-turbo', 'qwen-plus', 'qwen-max'] as const

      type QwenProviderOptions = {
        'qwen-turbo': {}
        'qwen-plus': {}
        'qwen-max': { testOption?: boolean }
      }

      type QwenInputModalities = {
        'qwen-turbo': readonly ['text']
        'qwen-plus': readonly ['text', 'image']
        'qwen-max': readonly ['text', 'image', 'audio']
      }

      // Metadata with empty image object - should reject arbitrary properties
      type QwenMessageMetadata = {
        text: { tryMe: string }
        image: {} // Empty - should NOT allow any properties
        audio: {}
        video: {}
        document: {}
      }

      const qwenAdapter = createOpenAICompatibleProvider<
        typeof QWEN_MODELS,
        'qwen-plus',
        QwenProviderOptions,
        QwenInputModalities,
        QwenMessageMetadata
      >(
        {
          apiKey: 'test-key',
          baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          name: 'qwen',
        },
        'qwen-plus',
      )

      // This should compile - valid call with no metadata on image
      qwenAdapter.chatStream({
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'data',
                  value: 'base64-encoded-image-data',
                },
              },
            ],
          },
        ],
      })

      qwenAdapter.chatStream({
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'data',
                  value: 'base64-encoded-image-data',
                },
                metadata: {
                  // @ts-expect-error - image metadata is empty {}, so 'detail' property should NOT be allowed
                  detail: 'high', // This should error - empty object doesn't allow properties
                },
              },
            ],
          },
        ],
      })

      expect(qwenAdapter.model).toBe('qwen-plus')
    })

    it('should allow properties when metadata type defines them', () => {
      const QWEN_MODELS = ['qwen-turbo', 'qwen-plus', 'qwen-max'] as const

      type QwenProviderOptions = {
        'qwen-turbo': {}
        'qwen-plus': {}
        'qwen-max': { testOption?: boolean }
      }

      type QwenInputModalities = {
        'qwen-turbo': readonly ['text']
        'qwen-plus': readonly ['text', 'image']
        'qwen-max': readonly ['text', 'image', 'audio']
      }

      // Metadata with defined image properties - should allow them
      type QwenMessageMetadataWithDetail = {
        text: {}
        image: { detail?: 'auto' | 'low' | 'high' } // Has defined property
        audio: {}
        video: {}
        document: {}
      }

      const qwenAdapter = createOpenAICompatibleProvider<
        typeof QWEN_MODELS,
        'qwen-plus',
        QwenProviderOptions,
        QwenInputModalities,
        QwenMessageMetadataWithDetail
      >(
        {
          apiKey: 'test-key',
          baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          name: 'qwen',
        },
        'qwen-plus',
      )

      // This should compile - 'detail' is defined in the metadata type
      qwenAdapter.chatStream({
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'data',
                  value: 'base64-encoded-image-data',
                },
                metadata: {
                  detail: 'high', // This should work - property is defined
                },
              },
            ],
          },
        ],
      })

      qwenAdapter.chatStream({
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'data',
                  value: 'base64-encoded-image-data',
                },
                metadata: {
                  // @ts-expect-error - 'invalidProp' is not defined in metadata type
                  invalidProp: 'should error', // This should error
                },
              },
            ],
          },
        ],
      })

      expect(qwenAdapter.model).toBe('qwen-plus')
    })

    it('should reject arbitrary modelOptions on empty provider options', () => {
      const MODELS = ['model-a', 'model-b'] as const

      type ProviderOptionsByModel = {
        'model-a': {} // Empty - should NOT allow any properties
        'model-b': { customOption?: boolean }
      }

      const providerA = createOpenAICompatibleProvider<
        typeof MODELS,
        'model-a',
        ProviderOptionsByModel
      >(
        {
          apiKey: 'test-key',
          baseURL: 'https://api.test.com/v1',
          name: 'test',
        },
        'model-a',
      )

      // This should compile - no modelOptions for empty provider options
      providerA.chatStream({
        messages: [{ role: 'user', content: 'Hello' }],
      })

      providerA.chatStream({
        messages: [{ role: 'user', content: 'Hello' }],
        modelOptions: {
          // @ts-expect-error - model-a has empty provider options, so no properties allowed
          someOption: true, // This should error
        },
      })

      const providerB = createOpenAICompatibleProvider<
        typeof MODELS,
        'model-b',
        ProviderOptionsByModel
      >(
        {
          apiKey: 'test-key',
          baseURL: 'https://api.test.com/v1',
          name: 'test',
        },
        'model-b',
      )

      // This should compile - customOption is defined for model-b
      providerB.chatStream({
        messages: [{ role: 'user', content: 'Hello' }],
        modelOptions: {
          customOption: true,
        },
      })

      providerB.chatStream({
        messages: [{ role: 'user', content: 'Hello' }],
        modelOptions: {
          customOption: true,
          // @ts-expect-error - unknownOption is not defined for model-b
          unknownOption: 'should error', // This should error
        },
      })

      expect(providerA.model).toBe('model-a')
      expect(providerB.model).toBe('model-b')
    })

    it('should constrain content types based on input modalities', () => {
      const MODELS = ['text-only', 'multimodal'] as const

      type InputModalitiesByModel = {
        'text-only': readonly ['text']
        multimodal: readonly ['text', 'image']
      }

      const textOnlyProvider = createOpenAICompatibleProvider<
        typeof MODELS,
        'text-only',
        Record<string, object>,
        InputModalitiesByModel
      >(
        {
          apiKey: 'test-key',
          baseURL: 'https://api.test.com/v1',
          name: 'test',
        },
        'text-only',
      )

      // This should compile - text is allowed
      textOnlyProvider.chatStream({
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', content: 'Hello' }],
          },
        ],
      })

      textOnlyProvider.chatStream({
        messages: [
          {
            role: 'user',
            content: [
              {
                // @ts-expect-error - image is not in text-only modalities
                type: 'image',
                source: { type: 'url', value: 'https://example.com/image.png' },
              },
            ],
          },
        ],
      })

      const multimodalProvider = createOpenAICompatibleProvider<
        typeof MODELS,
        'multimodal',
        Record<string, object>,
        InputModalitiesByModel
      >(
        {
          apiKey: 'test-key',
          baseURL: 'https://api.test.com/v1',
          name: 'test',
        },
        'multimodal',
      )

      // This should compile - both text and image are allowed for multimodal
      multimodalProvider.chatStream({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', content: 'Describe this image:' },
              {
                type: 'image',
                source: { type: 'url', value: 'https://example.com/image.png' },
              },
            ],
          },
        ],
      })

      expect(textOnlyProvider.model).toBe('text-only')
      expect(multimodalProvider.model).toBe('multimodal')
    })
  })
})
