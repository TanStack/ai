import { afterEach, describe, expect, it, vi } from 'vitest'
import { BedrockTextAdapter, createBedrockChat } from '../src/adapters/text'
import {
  BedrockResponsesTextAdapter,
  createBedrockResponsesText,
} from '../src/adapters/responses-text'
import { bedrockText, createBedrockText } from '../src/index'
import { BedrockTextAdapter as ChatAdapter } from '../src/adapters/text'
import { BedrockResponsesTextAdapter as RespAdapter } from '../src/adapters/responses-text'

afterEach(() => vi.unstubAllEnvs())

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
    it('returns undefined for empty-string reasoning', () => {
      expect(
        probe.read({ choices: [{ delta: { reasoning: '' } }] }),
      ).toBeUndefined()
    })
    it('returns undefined for non-array choices', () => {
      expect(probe.read({ choices: 'not-an-array' })).toBeUndefined()
    })
  })
})

describe('BedrockResponsesTextAdapter', () => {
  it('constructs with name "bedrock-responses", forces mantle baseURL', () => {
    const a = createBedrockResponsesText('openai.gpt-oss-120b', 'test-key', {
      region: 'us-east-1',
    })
    expect(a).toBeInstanceOf(BedrockResponsesTextAdapter)
    expect(a.name).toBe('bedrock-responses')
    expect(a.kind).toBe('text')
  })
})

describe('createBedrockText (branching factory)', () => {
  it('defaults to the chat adapter', () => {
    const a = createBedrockText('openai.gpt-oss-120b', 'k', {
      region: 'us-east-1',
    })
    expect(a).toBeInstanceOf(ChatAdapter)
    expect(a.name).toBe('bedrock')
  })

  it("returns the responses adapter when api: 'responses'", () => {
    const a = createBedrockText('openai.gpt-oss-120b', 'k', {
      region: 'us-east-1',
      api: 'responses',
    })
    expect(a).toBeInstanceOf(RespAdapter)
    expect(a.name).toBe('bedrock-responses')
  })

  it("explicit api: 'chat' returns the chat adapter", () => {
    const a = createBedrockText('openai.gpt-oss-120b', 'k', { api: 'chat' })
    expect(a).toBeInstanceOf(ChatAdapter)
  })
})

describe('bedrockText (env-key branching factory)', () => {
  it('reads the key from BEDROCK_API_KEY and branches on api', () => {
    vi.stubEnv('BEDROCK_API_KEY', 'env-key')
    expect(
      bedrockText('openai.gpt-oss-120b', { region: 'us-east-1' }),
    ).toBeInstanceOf(ChatAdapter)
    expect(
      bedrockText('openai.gpt-oss-120b', {
        region: 'us-east-1',
        api: 'responses',
      }),
    ).toBeInstanceOf(RespAdapter)
  })
})
