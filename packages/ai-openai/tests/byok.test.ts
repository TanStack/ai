import { describe, expect, it } from 'vitest'
import { openaiByok } from '../src/byok'

describe('openaiByok', () => {
  it('exports a required slug', () => {
    expect(openaiByok.id).toBe('openai')
    expect(openaiByok.label).toBe('OpenAI')
    expect(openaiByok.env).toContain('OPENAI_API_KEY')
  })
})
