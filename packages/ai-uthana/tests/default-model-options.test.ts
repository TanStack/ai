import { describe, expect, it } from 'vitest'
import { uthana3dMotion } from '../src/adapters/motion'

describe('Uthana defaultModelOptions', () => {
  it('motion adapter stores the defaults', () => {
    const adapter = uthana3dMotion('text-to-motion-3.0', {
      apiKey: 'test-key',
      defaultModelOptions: { fps: 30 },
    })

    expect(adapter.defaultModelOptions).toEqual({ fps: 30 })
  })
})
