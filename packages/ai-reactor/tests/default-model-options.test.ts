import { describe, expect, it } from 'vitest'
import { createReactorVideo } from '../src/adapters/video'
import { createReactorWorld } from '../src/adapters/world'

describe('Reactor defaultModelOptions', () => {
  it('video adapter stores the defaults', () => {
    const adapter = createReactorVideo('helios', 'test-key', {
      defaultModelOptions: { seed: 7 },
    })

    expect(adapter.defaultModelOptions).toEqual({ seed: 7 })
  })

  it('world adapter stores the defaults', () => {
    const adapter = createReactorWorld('visko-orbis-stable', 'test-key', {
      defaultModelOptions: { audioEnabled: false },
    })

    expect(adapter.defaultModelOptions).toEqual({ audioEnabled: false })
  })
})
