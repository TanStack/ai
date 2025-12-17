/**
 * Type-level tests for TextActivityOptions
 * These should fail to compile if the types are incorrect
 */

import { describe, it, expectTypeOf } from 'vitest'
import { createChatOptions } from '../src'
import type { TextAdapter } from '../src/activities/chat/adapter'

// Mock adapter for testing - simulates OpenAI adapter
type MockAdapter = TextAdapter<
  'test-model',
  { validOption: string; anotherOption?: number },
  readonly ['text', 'image'],
  { text: unknown; image: unknown; audio: unknown; video: unknown; document: unknown }
>

const mockAdapter = {
  kind: 'text' as const,
  name: 'mock',
  model: 'test-model' as const,
  _types: {
    providerOptions: {} as { validOption: string; anotherOption?: number },
    inputModalities: ['text', 'image'] as const,
    messageMetadata: {
      text: undefined as unknown,
      image: undefined as unknown,
      audio: undefined as unknown,
      video: undefined as unknown,
      document: undefined as unknown,
    },
  },
  chatStream: async function* () {},
  structuredOutput: async () => ({ data: {}, rawText: '{}' }),
} satisfies MockAdapter

describe('TextActivityOptions type checking', () => {
  it('should allow valid options', () => {
    // This should type-check successfully
    const options = createChatOptions({
      adapter: mockAdapter,
      messages: [{ role: 'user', content: 'Hello' }],
      modelOptions: {
        validOption: 'test',
        anotherOption: 42,
      },
    })

    expectTypeOf(options.adapter).toMatchTypeOf<MockAdapter>()
  })

  it('should reject invalid properties on createChatOptions', () => {
    createChatOptions({
      adapter: mockAdapter,
      messages: [{ role: 'user', content: 'Hello' }],
      // @ts-expect-error - thisIsntvalid is not a valid property
      thisIsntvalid: true,
    })
  })

  it('should reject invalid modelOptions properties', () => {
    createChatOptions({
      adapter: mockAdapter,
      messages: [{ role: 'user', content: 'Hello' }],
      modelOptions: {
        // @ts-expect-error - invalidOption is not a valid modelOption
        invalidOption: 'should error',
      },
    })
  })
})
