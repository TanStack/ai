import { describe, expect, it } from 'vitest'
import { lovableByok } from '../src/byok'

describe('lovableByok', () => {
  it('exports a required slug', () => {
    expect(lovableByok.id).toBe('lovable')
    expect(lovableByok.label).toBe('Lovable AI Gateway')
    expect(lovableByok.env).toContain('LOVABLE_API_KEY')
  })
})
