import { describe, expect, it } from 'vitest'
import { createBytePlusText } from '../src/adapters/text'

describe('BytePlusTextAdapter inputModalities', () => {
  it.each([
    ['seed-2-0-lite-260428', ['text', 'image', 'video', 'audio']],
    ['glm-5-2-260617', ['text']],
  ] as const)('reads the list of %s from model-meta', (model, expected) => {
    expect(createBytePlusText(model, 'ark-test-key').inputModalities).toEqual(
      expected,
    )
  })

  it('is undefined for a model id that model-meta does not list', () => {
    // @ts-expect-error a JS caller or a cast can pass an id the types reject
    const adapter = createBytePlusText('unlisted-model', 'ark-test-key')

    expect(adapter.inputModalities).toBeUndefined()
  })
})
