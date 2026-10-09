import { describe, expect, it } from 'vitest'
import { createGroqText } from '../src/adapters/text'

describe('GroqTextAdapter inputModalities', () => {
  it.each([
    ['meta-llama/llama-4-scout-17b-16e-instruct', ['text', 'image']],
    ['llama-3.3-70b-versatile', ['text']],
  ] as const)('reads the list of %s from model-meta', (model, expected) => {
    expect(createGroqText(model, 'test-key').inputModalities).toEqual(expected)
  })

  it('is undefined for a model id that model-meta does not list', () => {
    // @ts-expect-error a JS caller or a cast can pass an id the types reject
    const adapter = createGroqText('unlisted-model', 'test-key')

    expect(adapter.inputModalities).toBeUndefined()
  })
})
