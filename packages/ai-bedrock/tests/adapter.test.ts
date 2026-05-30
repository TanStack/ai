import { describe, expect, it } from 'vitest'
import { BedrockTextAdapter, createBedrockChat } from '../src/adapters/text'

describe('BedrockTextAdapter', () => {
  it('constructs with name "bedrock" and kind "text"', () => {
    const a = createBedrockChat('openai.gpt-oss-120b', 'test-key', {
      region: 'us-east-1',
    })
    expect(a).toBeInstanceOf(BedrockTextAdapter)
    expect(a.name).toBe('bedrock')
    expect(a.kind).toBe('text')
    expect(a.model).toBe('openai.gpt-oss-120b')
  })

  describe('extractReasoning (cast-free)', () => {
    // Access the protected hook through a tiny typed subclass — no `as` casts.
    class Probe extends BedrockTextAdapter<'openai.gpt-oss-120b'> {
      read(chunk: unknown) {
        return this.extractReasoning(chunk)
      }
    }
    const probe = new Probe({ apiKey: 'k' }, 'openai.gpt-oss-120b')

    it('reads delta.reasoning', () => {
      expect(
        probe.read({ choices: [{ delta: { reasoning: 'thinking' } }] }),
      ).toEqual({ text: 'thinking' })
    })
    it('reads delta.reasoning_content', () => {
      expect(
        probe.read({ choices: [{ delta: { reasoning_content: 'rc' } }] }),
      ).toEqual({ text: 'rc' })
    })
    it('returns undefined for unrelated chunks', () => {
      expect(
        probe.read({ choices: [{ delta: { content: 'hi' } }] }),
      ).toBeUndefined()
      expect(probe.read({})).toBeUndefined()
      expect(probe.read(null)).toBeUndefined()
    })
  })
})
