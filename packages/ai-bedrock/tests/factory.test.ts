import { describe, expect, it } from 'vitest'
import { bedrockText, createBedrockText } from '../src/index'

describe('bedrockText branching', () => {
  it('defaults to the Converse adapter', () => {
    const a = bedrockText('us.anthropic.claude-haiku-4-5-20251001-v1:0', { apiKey: 'k' })
    expect(a.name).toBe('bedrock-converse')
  })
  it('api "converse" is explicit Converse', () => {
    const a = bedrockText('us.amazon.nova-pro-v1:0', { apiKey: 'k', api: 'converse' })
    expect(a.name).toBe('bedrock-converse')
  })
  it('api "chat" returns the Chat Completions adapter', () => {
    const a = bedrockText('openai.gpt-oss-120b-1:0', { apiKey: 'k', api: 'chat' })
    expect(a.name).toBe('bedrock')
  })
  it('api "responses" returns the Responses adapter', () => {
    const a = bedrockText('openai.gpt-oss-120b-1:0', { apiKey: 'k', api: 'responses' })
    expect(a.name).toBe('bedrock-responses')
  })
  it('createBedrockText defaults to Converse with an explicit key', () => {
    const a = createBedrockText('us.amazon.nova-lite-v1:0', 'k')
    expect(a.name).toBe('bedrock-converse')
  })
})
