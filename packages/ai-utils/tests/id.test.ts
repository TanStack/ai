import { describe, it, expect } from 'vitest'
import { generateId } from '../src/id'

describe('generateId', () => {
  it('should generate an id with the given prefix', () => {
    const id = generateId('run')
    expect(id).toMatch(/^run-\d+-[a-z0-9]+$/)
  })

  it('should generate unique ids', () => {
    const id1 = generateId('msg')
    const id2 = generateId('msg')
    expect(id1).not.toBe(id2)
  })

  it('should use the prefix exactly as given', () => {
    const id = generateId('tool_call')
    expect(id.startsWith('tool_call-')).toBe(true)
  })
})
