import { describe, expect, it } from 'vitest'
import { createLLMGatewayText } from '../src/adapters/text'

describe('LLMGatewayTextAdapter inputModalities', () => {
  it.each([
    ['gpt-5.6-terra', ['text', 'image']],
    ['deepseek-v4-pro', ['text']],
  ] as const)('reads the list of %s from model-meta', (model, expected) => {
    expect(createLLMGatewayText(model, 'test-key').inputModalities).toEqual(
      expected,
    )
  })

  // Model ids are open-ended here, so an uncurated id is a normal call.
  it('is undefined for a model id that model-meta does not list', () => {
    const adapter = createLLMGatewayText('vendor/uncurated-model', 'test-key')

    expect(adapter.inputModalities).toBeUndefined()
  })
})
