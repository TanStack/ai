import { describe, expect, it } from 'vitest'
import { createWorldLabsWorld } from '../src/adapters/world'

describe('World Labs defaultModelOptions', () => {
  it('world adapter stores the defaults', () => {
    const adapter = createWorldLabsWorld('marble-1.1', 'test-key', {
      defaultModelOptions: { seed: 7 },
    })

    expect(adapter.defaultModelOptions).toEqual({ seed: 7 })
  })
})
