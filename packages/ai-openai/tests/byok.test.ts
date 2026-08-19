import { describe, expect, it } from 'vitest'
import { openaiByok } from '../src/byok'

describe('openaiByok', () => {
  it('exports a required slug', () => {
    expect(openaiByok.id).toBe('openai')
    expect(openaiByok.label).toBe('OpenAI')
    expect(openaiByok.validate?.url).toContain('api.openai.com')
  })
})
