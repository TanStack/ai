import { describe, expect, it } from 'vitest'
import { GeminiTextAdapter } from '../src/adapters/text'

// Constructing the SDK client makes no network call.
const config = { apiKey: 'test-key' }

describe('Gemini text adapter inputModalities', () => {
  it('gives the input list of each known model', () => {
    expect(
      new GeminiTextAdapter(config, 'gemini-3.1-pro-preview').inputModalities,
    ).toEqual(['text', 'image', 'audio', 'video', 'document'])
    expect(
      new GeminiTextAdapter(config, 'gemini-2.5-flash').inputModalities,
    ).toEqual(['text', 'image', 'audio', 'video'])
  })

  it('is undefined for a model the metadata does not list', () => {
    // A JS caller, or a model id newer than this package, reaches the adapter.
    // @ts-expect-error - 'gemini-unknown-9000' is not a declared model
    const adapter = new GeminiTextAdapter(config, 'gemini-unknown-9000')

    expect(adapter.inputModalities).toBeUndefined()
  })
})
