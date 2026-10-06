import { describe, expect, it } from 'vitest'
import { AnthropicTextAdapter } from '../src/adapters/text'

// Constructing the SDK client makes no network call.
const config = { apiKey: 'test-key' }

describe('Anthropic text adapter inputModalities', () => {
  it('gives the input list of each known model', () => {
    const expected = ['text', 'image', 'document']

    expect(
      new AnthropicTextAdapter(config, 'claude-opus-5-5').inputModalities,
    ).toEqual(expected)
    expect(
      new AnthropicTextAdapter(config, 'claude-haiku-4-5').inputModalities,
    ).toEqual(expected)
  })

  it('is undefined for a model the metadata does not list', () => {
    // A gateway or catalog id, or a model id newer than this package.
    const adapter = new AnthropicTextAdapter(config, 'claude-unknown-9000')

    expect(adapter.inputModalities).toBeUndefined()
  })
})
