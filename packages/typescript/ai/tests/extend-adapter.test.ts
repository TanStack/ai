/**
 * Tests for extendAdapter utility
 *
 * Verifies that extendAdapter:
 * 1. Preserves original model type inference exactly
 * 2. Adds custom models with correct types
 * 3. Preserves factory signature (including config parameter)
 * 4. Inherits message metadata from original adapter
 */
import { describe, expect, expectTypeOf, it } from 'vitest'
import { createModel, extendAdapter } from '../src/extend-adapter'
import { BaseTextAdapter } from '../src/activities/chat/adapter'
import { chat } from '../src/activities/chat'
import type { StreamChunk, TextOptions } from '../src/types'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '../src/activities/chat/adapter'

// ===========================
// Mock Adapter Setup (mimics OpenAI adapter structure)
// ===========================

const MOCK_MODELS = ['mock-gpt-4', 'mock-gpt-3.5'] as const
type MockModel = (typeof MOCK_MODELS)[number]

interface MockBaseOptions {
  temperature?: number
  maxTokens?: number
}

interface MockAdvancedOptions extends MockBaseOptions {
  reasoning?: { effort?: 'low' | 'high' }
}

// Per-model options map (like OpenAI does)
type MockProviderOptionsByModel = {
  'mock-gpt-4': MockAdvancedOptions
  'mock-gpt-3.5': MockBaseOptions
}

// Per-model input modalities (like OpenAI does)
type MockInputModalitiesByModel = {
  'mock-gpt-4': readonly ['text', 'image']
  'mock-gpt-3.5': readonly ['text']
}

type ResolveProviderOptions<TModel extends string> =
  TModel extends keyof MockProviderOptionsByModel
    ? MockProviderOptionsByModel[TModel]
    : MockBaseOptions

type ResolveInputModalities<TModel extends string> =
  TModel extends keyof MockInputModalitiesByModel
    ? MockInputModalitiesByModel[TModel]
    : readonly ['text']

// Mock message metadata
interface MockMessageMetadataByModality {
  text: { encoding?: string }
  image: { detail?: 'auto' | 'low' | 'high' }
  audio: unknown
  video: unknown
  document: unknown
}

// Mock adapter config
interface MockAdapterConfig {
  baseURL?: string
  timeout?: number
}

/**
 * Mock Text Adapter class
 */
class MockTextAdapter<TModel extends MockModel> extends BaseTextAdapter<
  TModel,
  ResolveProviderOptions<TModel>,
  ResolveInputModalities<TModel>,
  MockMessageMetadataByModality
> {
  readonly kind = 'text' as const
  readonly name = 'mock' as const

  constructor(model: TModel, _config?: MockAdapterConfig) {
    super({}, model)
  }

  /* eslint-disable @typescript-eslint/require-await */
  async *chatStream(
    _options: TextOptions<ResolveProviderOptions<TModel>>,
  ): AsyncIterable<StreamChunk> {
    yield {
      type: 'TEXT_MESSAGE_CONTENT',
      messageId: 'mock-id',
      timestamp: Date.now(),
      delta: 'Hello',
      content: 'Hello',
      model: this.model,
    }
    yield {
      type: 'RUN_FINISHED',
      runId: 'mock-id',
      timestamp: Date.now(),
      finishReason: 'stop',
      model: this.model,
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
 * Mock adapter factory function (mimics openaiText signature)
 */
function mockText<TModel extends MockModel>(
  model: TModel,
  config?: MockAdapterConfig,
): MockTextAdapter<TModel> {
  return new MockTextAdapter(model, config)
}

// Using createModel helper - model options fall back to adapter defaults
const customModels = [
  createModel('my-fine-tuned-model', ['text', 'image']),
  createModel('local-llm', ['text']),
] as const

// ===========================
// Tests
// ===========================

describe('extendAdapter', () => {
  describe('Basic functionality', () => {
    it('should create an extended adapter factory', () => {
      const extendedMock = extendAdapter(mockText, customModels)
      expect(typeof extendedMock).toBe('function')
    })

    it('should call original factory for original models', () => {
      const extendedMock = extendAdapter(mockText, customModels)
      const adapter = extendedMock('mock-gpt-4')

      expect(adapter.name).toBe('mock')
      expect(adapter.model).toBe('mock-gpt-4')
      expect(adapter.kind).toBe('text')
    })

    it('should call original factory for custom models', () => {
      const extendedMock = extendAdapter(mockText, customModels)
      // Runtime: passes through to original factory
      // Note: This will work at runtime because original factory accepts any string
      // Type safety is enforced at compile time
      const adapter = extendedMock('my-fine-tuned-model')

      expect(adapter.name).toBe('mock')
      expect(adapter.model).toBe('my-fine-tuned-model')
    })

    it('should preserve config parameter passthrough', () => {
      const extendedMock = extendAdapter(mockText, customModels)
      const adapter = extendedMock('mock-gpt-4', {
        baseURL: 'https://custom.api.com',
      })

      expect(adapter.model).toBe('mock-gpt-4')
    })
  })

  describe('Type inference for original models', () => {
    it('should preserve original model type inference', () => {
      const extendedMock = extendAdapter(mockText, customModels)
      const adapter = extendedMock('mock-gpt-4')

      // Model type should be one of the original models (union preserved from factory return)
      expectTypeOf(adapter.model).toExtend<MockModel>()
    })

    it('should allow original models in chat()', () => {
      const extendedMock = extendAdapter(mockText, customModels)

      // This should compile without errors
      chat({
        adapter: extendedMock('mock-gpt-4'),
        messages: [{ role: 'user', content: 'Hello' }],
      })
    })
  })

  describe('Type inference for custom models', () => {
    it('should infer custom model name type', () => {
      const extendedMock = extendAdapter(mockText, customModels)
      const adapter = extendedMock('my-fine-tuned-model')

      // The adapter model type is the union of all possible models from the factory return
      // (This is expected since extendAdapter returns the factory's return type)
      expectTypeOf(adapter.model).toExtend<MockModel>()
    })

    it('should allow custom models in chat()', () => {
      const extendedMock = extendAdapter(mockText, customModels)

      // This should compile without errors
      chat({
        adapter: extendedMock('my-fine-tuned-model'),
        messages: [{ role: 'user', content: 'Hello' }],
      })

      chat({
        adapter: extendedMock('local-llm'),
        messages: [{ role: 'user', content: 'Hello' }],
      })
    })
  })

  describe('Model union type', () => {
    it('should accept both original and custom model names', () => {
      const extendedMock = extendAdapter(mockText, customModels)

      // All of these should be valid - using void to suppress unused variable warnings
      void extendedMock('mock-gpt-4')
      void extendedMock('mock-gpt-3.5')
      void extendedMock('my-fine-tuned-model')
      void extendedMock('local-llm')
    })

    it('should reject invalid model names at type level', () => {
      const extendedMock = extendAdapter(mockText, customModels)

      // Using assignment to force TypeScript to fully type-check the argument
      // @ts-expect-error - 'invalid-model' is not a valid model name
      const _invalid = extendedMock('invalid-model')
    })
  })

  describe('Empty custom models', () => {
    it('should work with empty custom models array', () => {
      const extendedMock = extendAdapter(mockText, [] as const)

      // Should still work with original models
      const adapter = extendedMock('mock-gpt-4')
      expect(adapter.model).toBe('mock-gpt-4')
    })
  })
})
