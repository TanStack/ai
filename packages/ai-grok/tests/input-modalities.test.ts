import { describe, expect, it } from 'vitest'
import { createGrokText } from '../src/adapters/text'

describe('GrokTextAdapter inputModalities', () => {
  it.each([
    ['grok-4.7', ['text', 'image', 'document']],
    ['grok-build-0.1', ['text', 'image']],
  ] as const)('reads the list of %s from model-meta', (model, expected) => {
    expect(createGrokText(model, 'test-key').inputModalities).toEqual(expected)
  })

  it('is undefined for a model id that model-meta does not list', () => {
    // @ts-expect-error a JS caller or a cast can pass an id the types reject
    const adapter = createGrokText('unlisted-model', 'test-key')

    expect(adapter.inputModalities).toBeUndefined()
  })
})
