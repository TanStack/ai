import { describe, expect, it } from 'vitest'
import { validateTextProviderOptions } from '../src/text/text-provider-options'

describe('text provider option validation', () => {
  it('preserves pre-refactor runtime behavior for reasoning options', () => {
    expect(() =>
      validateTextProviderOptions({
        input: 'hi',
        model: 'gpt-4o',
        reasoning: { effort: 'low' },
      }),
    ).not.toThrow()

    expect(() =>
      validateTextProviderOptions({
        input: 'hi',
        model: 'gpt-5',
        reasoning: { effort: 'none' },
      }),
    ).not.toThrow()

    expect(() =>
      validateTextProviderOptions({
        input: 'hi',
        model: 'gpt-5.4',
        reasoning: { summary: 'concise' },
      }),
    ).not.toThrow()
  })

  it('still rejects incompatible conversation fields', () => {
    expect(() =>
      validateTextProviderOptions({
        input: 'hi',
        model: 'gpt-4o',
        conversation: 'conv_123',
        previous_response_id: 'resp_123',
      }),
    ).toThrow(
      "Cannot use both 'conversation' and 'previous_response_id' in the same request.",
    )
  })
})
