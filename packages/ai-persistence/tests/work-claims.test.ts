import { describe, expect, it } from 'vitest'
import { memoryPersistence } from '../src/memory'

describe('memoryPersistence() work claims', () => {
  it('provides a work claim store', () => {
    expect(memoryPersistence().stores.workClaims).toBeDefined()
  })
})
