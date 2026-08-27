import { describe, expect, it } from 'vitest'
import {
  applySkillsSnapshot,
  createSkillsRegistryState,
} from '../src/store/skills-registry'

describe('skills-registry', () => {
  it('stores a catalog snapshot by hookId', () => {
    const state = createSkillsRegistryState()
    applySkillsSnapshot(state, {
      hookId: 'hook-1',
      catalog: [{ name: 'pirate-speak', description: 'talk like a pirate' }],
      activated: [],
      timestamp: 1,
    })
    expect(state.snapshots['hook-1']?.catalog).toEqual([
      { name: 'pirate-speak', description: 'talk like a pirate' },
    ])
  })

  it('buckets a missing hookId under _default', () => {
    const state = createSkillsRegistryState()
    applySkillsSnapshot(state, {
      catalog: [{ name: 'haiku', description: 'short poems' }],
      activated: ['haiku'],
    })
    expect(state.snapshots['_default']?.activated).toEqual(['haiku'])
  })
})
