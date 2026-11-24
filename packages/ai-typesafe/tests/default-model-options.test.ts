import { describe, expect, it } from 'vitest'
import { createTypesafeDecider } from '../src/adapters/evaluate'

describe('TypeSafe defaultModelOptions', () => {
  it('evaluate adapter stores the defaults', () => {
    const adapter = createTypesafeDecider('jev-latest', 'test-key', {
      defaultModelOptions: { temperature: 0 },
    })

    expect(adapter.defaultModelOptions).toEqual({ temperature: 0 })
  })
})
