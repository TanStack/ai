/**
 * Per-model type-safety tests for chat().
 *
 * Verifies that `chat({ modelOptions })` is constrained to the selected
 * model's provider-options union. Mirrors the image generation
 * type-safety pattern in `image-per-model-type-safety.test.ts`, but for the
 * text/chat activity.
 *
 * Tests:
 * - Positive: each valid (model, option) pair compiles cleanly.
 * - Negative: each invalid (model, option) pair produces a `@ts-expect-error`.
 * - Property assertions: each model's provider options type exposes the
 *   expected fields (and not those of unrelated models).
 *
 * The tests are compile-time only — no network calls are made.
 */
import { describe, expectTypeOf, it } from 'vitest'
import { chat } from '../src'
import { BaseTextAdapter } from '../src/activities/chat/adapter'
import type { DefaultMessageMetadataByModality, StreamChunk } from '../src/types'

// ===========================
// Mock Provider Options Types
// ===========================

interface MockBaseOptions {
  /** Always-available option on every mock chat model. */
  user?: string
}

interface MockReasoningOptions {
  reasoning?: {
    effort?: 'low' | 'medium' | 'high'
  }
}

interface MockStructuredOutputOptions {
  text?: { format?: { type: 'text' | 'json_object' } }
}

interface MockToolsOptions {
  tool_choice?: 'auto' | 'none' | 'required'
  max_tool_calls?: number
}

interface MockStreamingOptions {
  stream_options?: { include_obfuscation?: boolean }
}

// ===========================
// Per-Model Provider Options
// ===========================

// Full-feature model: all five option groups.
type MockFullModelOptions = MockBaseOptions &
  MockReasoningOptions &
  MockStructuredOutputOptions &
  MockToolsOptions &
  MockStreamingOptions

// Reasoning + tools, no structured output / no streaming options.
type MockReasoningModelOptions = MockBaseOptions &
  MockReasoningOptions &
  MockToolsOptions

// Tools + streaming, no reasoning / no structured output.
type MockToolsOnlyModelOptions = MockBaseOptions &
  MockToolsOptions &
  MockStreamingOptions

// Bare-bones model: base only.
type MockBareModelOptions = MockBaseOptions

// ===========================
// Mock Type Map
// ===========================

type MockChatModelProviderOptionsByName = {
  'mock-full': MockFullModelOptions
  'mock-reasoning': MockReasoningModelOptions
  'mock-tools-only': MockToolsOnlyModelOptions
  'mock-bare': MockBareModelOptions
}

type MockChatModel = keyof MockChatModelProviderOptionsByName

type MockProviderOptionsUnion =
  MockChatModelProviderOptionsByName[MockChatModel]

// ===========================
// Mock Adapter Implementation
// ===========================

class MockTextAdapter<TModel extends MockChatModel> extends BaseTextAdapter<
  TModel,
  MockChatModelProviderOptionsByName[TModel],
  readonly ['text'],
  DefaultMessageMetadataByModality
> {
  readonly name = 'mock' as const

  constructor(model: TModel) {
    super({}, model)
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async *chatStream(): AsyncIterable<StreamChunk> {
    // Type-only stub; never executed in these compile-time tests.
    return
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async structuredOutput() {
    return { data: undefined, rawText: '' }
  }
}

function mockText<TModel extends MockChatModel>(
  model: TModel,
): MockTextAdapter<TModel> {
  return new MockTextAdapter(model)
}

// ===========================
// Type Safety Tests
// ===========================

describe('Type Safety Tests for chat() function', () => {
  describe('Model-specific Provider Options (modelOptions) Type Safety', () => {
    describe('mock-full provider options', () => {
      it('should allow all option groups on mock-full', () => {
        chat({
          adapter: mockText('mock-full'),
          messages: [{ role: 'user', content: 'hi' }],
          modelOptions: {
            user: 'user-1',
            reasoning: { effort: 'medium' },
            text: { format: { type: 'json_object' } },
            tool_choice: 'auto',
            max_tool_calls: 5,
            stream_options: { include_obfuscation: false },
          },
        })
      })

      it('should NOT allow unknown options on mock-full', () => {
        chat({
          adapter: mockText('mock-full'),
          messages: [{ role: 'user', content: 'hi' }],
          modelOptions: {
            // @ts-expect-error - 'unknownOption' does not exist on mock-full options
            unknownOption: true,
          },
        })
      })
    })

    describe('mock-reasoning provider options', () => {
      it('should allow reasoning + tools options', () => {
        chat({
          adapter: mockText('mock-reasoning'),
          messages: [{ role: 'user', content: 'hi' }],
          modelOptions: {
            user: 'user-1',
            reasoning: { effort: 'high' },
            tool_choice: 'required',
            max_tool_calls: 3,
          },
        })
      })

      it('should NOT allow structured output options on mock-reasoning', () => {
        chat({
          adapter: mockText('mock-reasoning'),
          messages: [{ role: 'user', content: 'hi' }],
          modelOptions: {
            // @ts-expect-error - 'text' is not available on mock-reasoning
            text: { format: { type: 'json_object' } },
          },
        })
      })

      it('should NOT allow streaming options on mock-reasoning', () => {
        chat({
          adapter: mockText('mock-reasoning'),
          messages: [{ role: 'user', content: 'hi' }],
          modelOptions: {
            // @ts-expect-error - 'stream_options' is not available on mock-reasoning
            stream_options: { include_obfuscation: true },
          },
        })
      })
    })

    describe('mock-tools-only provider options', () => {
      it('should allow tools + streaming options', () => {
        chat({
          adapter: mockText('mock-tools-only'),
          messages: [{ role: 'user', content: 'hi' }],
          modelOptions: {
            user: 'user-1',
            tool_choice: 'auto',
            max_tool_calls: 2,
            stream_options: { include_obfuscation: false },
          },
        })
      })

      it('should NOT allow reasoning option on mock-tools-only', () => {
        chat({
          adapter: mockText('mock-tools-only'),
          messages: [{ role: 'user', content: 'hi' }],
          modelOptions: {
            // @ts-expect-error - 'reasoning' is not available on mock-tools-only
            reasoning: { effort: 'low' },
          },
        })
      })

      it('should NOT allow structured output option on mock-tools-only', () => {
        chat({
          adapter: mockText('mock-tools-only'),
          messages: [{ role: 'user', content: 'hi' }],
          modelOptions: {
            // @ts-expect-error - 'text' is not available on mock-tools-only
            text: { format: { type: 'text' } },
          },
        })
      })
    })

    describe('mock-bare provider options', () => {
      it('should allow only the base option', () => {
        chat({
          adapter: mockText('mock-bare'),
          messages: [{ role: 'user', content: 'hi' }],
          modelOptions: { user: 'user-1' },
        })
      })

      it('should NOT allow reasoning on mock-bare', () => {
        chat({
          adapter: mockText('mock-bare'),
          messages: [{ role: 'user', content: 'hi' }],
          modelOptions: {
            // @ts-expect-error - 'reasoning' is not available on mock-bare
            reasoning: { effort: 'low' },
          },
        })
      })

      it('should NOT allow tools options on mock-bare', () => {
        chat({
          adapter: mockText('mock-bare'),
          messages: [{ role: 'user', content: 'hi' }],
          modelOptions: {
            // @ts-expect-error - 'tool_choice' is not available on mock-bare
            tool_choice: 'auto',
          },
        })
      })

      it('should NOT allow streaming options on mock-bare', () => {
        chat({
          adapter: mockText('mock-bare'),
          messages: [{ role: 'user', content: 'hi' }],
          modelOptions: {
            // @ts-expect-error - 'stream_options' is not available on mock-bare
            stream_options: { include_obfuscation: true },
          },
        })
      })

      it('should NOT allow structured output on mock-bare', () => {
        chat({
          adapter: mockText('mock-bare'),
          messages: [{ role: 'user', content: 'hi' }],
          modelOptions: {
            // @ts-expect-error - 'text' is not available on mock-bare
            text: { format: { type: 'json_object' } },
          },
        })
      })
    })
  })

  describe('Model Name Type Safety', () => {
    it('should accept valid model names', () => {
      const _full = mockText('mock-full')
      const _reasoning = mockText('mock-reasoning')
      const _tools = mockText('mock-tools-only')
      const _bare = mockText('mock-bare')
      expectTypeOf(_full).toBeObject()
      expectTypeOf(_reasoning).toBeObject()
      expectTypeOf(_tools).toBeObject()
      expectTypeOf(_bare).toBeObject()
    })

    it('should NOT accept invalid model names', () => {
      // @ts-expect-error - 'invalid-model' is not a valid mock chat model
      const _adapter = mockText('invalid-model')
    })
  })

  describe('Cross-model option leakage guards', () => {
    it('mock-bare: should error with mock-full reasoning option', () => {
      chat({
        adapter: mockText('mock-bare'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - 'reasoning' is not available on mock-bare
          reasoning: { effort: 'high' },
        },
      })
    })

    it('mock-bare: should error with mock-full structured-output option', () => {
      chat({
        adapter: mockText('mock-bare'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - 'text' is not available on mock-bare
          text: { format: { type: 'json_object' } },
        },
      })
    })

    it('mock-reasoning: should accept reasoning but reject streaming options', () => {
      chat({
        adapter: mockText('mock-reasoning'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - 'stream_options' is not available on mock-reasoning
          stream_options: { include_obfuscation: true },
        },
      })
    })
  })
})

describe('Provider Options Type Assertions', () => {
  describe('mock-full should have all option groups', () => {
    type Options = MockChatModelProviderOptionsByName['mock-full']

    it('should have user option', () => {
      expectTypeOf<Options>().toHaveProperty('user')
    })

    it('should have reasoning option', () => {
      expectTypeOf<Options>().toHaveProperty('reasoning')
    })

    it('should have text option', () => {
      expectTypeOf<Options>().toHaveProperty('text')
    })

    it('should have tool_choice option', () => {
      expectTypeOf<Options>().toHaveProperty('tool_choice')
    })

    it('should have max_tool_calls option', () => {
      expectTypeOf<Options>().toHaveProperty('max_tool_calls')
    })

    it('should have stream_options option', () => {
      expectTypeOf<Options>().toHaveProperty('stream_options')
    })
  })

  describe('mock-reasoning should have reasoning + tools, but not structured output / streaming', () => {
    type Options = MockChatModelProviderOptionsByName['mock-reasoning']

    it('should have reasoning option', () => {
      expectTypeOf<Options>().toHaveProperty('reasoning')
    })

    it('should have tool_choice option', () => {
      expectTypeOf<Options>().toHaveProperty('tool_choice')
    })

    it('should NOT have text option', () => {
      expectTypeOf<Options>().not.toHaveProperty('text')
    })

    it('should NOT have stream_options option', () => {
      expectTypeOf<Options>().not.toHaveProperty('stream_options')
    })
  })

  describe('mock-tools-only should have tools + streaming, but not reasoning / structured output', () => {
    type Options = MockChatModelProviderOptionsByName['mock-tools-only']

    it('should have tool_choice option', () => {
      expectTypeOf<Options>().toHaveProperty('tool_choice')
    })

    it('should have stream_options option', () => {
      expectTypeOf<Options>().toHaveProperty('stream_options')
    })

    it('should NOT have reasoning option', () => {
      expectTypeOf<Options>().not.toHaveProperty('reasoning')
    })

    it('should NOT have text option', () => {
      expectTypeOf<Options>().not.toHaveProperty('text')
    })
  })

  describe('mock-bare should have only the user option', () => {
    type Options = MockChatModelProviderOptionsByName['mock-bare']

    it('should have user option', () => {
      expectTypeOf<Options>().toHaveProperty('user')
    })

    it('should NOT have reasoning option', () => {
      expectTypeOf<Options>().not.toHaveProperty('reasoning')
    })

    it('should NOT have tool_choice option', () => {
      expectTypeOf<Options>().not.toHaveProperty('tool_choice')
    })

    it('should NOT have stream_options option', () => {
      expectTypeOf<Options>().not.toHaveProperty('stream_options')
    })

    it('should NOT have text option', () => {
      expectTypeOf<Options>().not.toHaveProperty('text')
    })
  })
})

describe('Provider Options Union Equality', () => {
  it('full union should match the four model option types', () => {
    expectTypeOf<MockProviderOptionsUnion>().toEqualTypeOf<
      | MockFullModelOptions
      | MockReasoningModelOptions
      | MockToolsOnlyModelOptions
      | MockBareModelOptions
    >()
  })
})
