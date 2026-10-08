import { describe, expect, it } from 'vitest'
import { MistralTextAdapter } from './adapters/text'

// Constructing the SDK client makes no network call.
const config = { apiKey: 'test-key' }

describe('Mistral text adapter inputModalities', () => {
  it('gives the input list of each known model', () => {
    expect(
      new MistralTextAdapter(config, 'mistral-large-latest').inputModalities,
    ).toEqual(['text'])
    expect(
      new MistralTextAdapter(config, 'pixtral-large-latest').inputModalities,
    ).toEqual(['text', 'image', 'document'])
  })

  it('is undefined for a model the metadata does not list', () => {
    // A catalog id, or a model id newer than this package.
    const adapter = new MistralTextAdapter(config, 'mistral-unknown-9000')

    expect(adapter.inputModalities).toBeUndefined()
  })
})
