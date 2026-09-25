import { defineByok, memoryStorage } from '../../src/byok.ts'
import { ChatClient } from '../../src/index.ts'
import { describe, expect, it } from 'vitest'

describe('client re-exports', () => {
  it('exports BYOK from the byok subpath', () => {
    expect(typeof defineByok).toBe('function')
    expect(typeof memoryStorage).toBe('function')
    const byok = defineByok({ storage: memoryStorage() })
    expect(byok).toBeDefined()
  })

  it('exports ChatClient from the package root', () => {
    expect(typeof ChatClient).toBe('function')
  })
})
