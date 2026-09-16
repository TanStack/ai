import { describe, expect, it } from 'vitest'
import {
  BEDROCK_CHAT_MODELS,
  BEDROCK_CONVERSE_MODELS,
  BEDROCK_RESPONSES_MODELS,
} from '../src/model-meta'
import { GENERATED_BEDROCK_MODELS } from '../src/model-catalog.generated'

describe('bedrock model-meta', () => {
  it('chat catalog is non-empty and unique', () => {
    expect(BEDROCK_CHAT_MODELS.length).toBeGreaterThan(0)
    expect(new Set(BEDROCK_CHAT_MODELS).size).toBe(BEDROCK_CHAT_MODELS.length)
  })

  it('responses catalog is non-empty and unique', () => {
    expect(BEDROCK_RESPONSES_MODELS.length).toBeGreaterThan(0)
    expect(new Set(BEDROCK_RESPONSES_MODELS).size).toBe(
      BEDROCK_RESPONSES_MODELS.length,
    )
  })

  it('every responses model is also a chat model (Responses subset of Chat reach)', () => {
    const chat = new Set<string>(BEDROCK_CHAT_MODELS)
    for (const m of BEDROCK_RESPONSES_MODELS) expect(chat.has(m)).toBe(true)
  })

  it('includes the confirmed gpt-oss ids', () => {
    expect(BEDROCK_CHAT_MODELS).toContain('openai.gpt-oss-120b-1:0')
    expect(BEDROCK_RESPONSES_MODELS).toContain('openai.gpt-oss-120b-1:0')
  })

  it('includes Gemma 4 on chat/responses', () => {
    expect(BEDROCK_CHAT_MODELS).toContain('google.gemma-4-31b')
    expect(BEDROCK_RESPONSES_MODELS).toContain('google.gemma-4-31b')
    expect(BEDROCK_CONVERSE_MODELS).not.toContain('google.gemma-4-31b')
    expect(
      GENERATED_BEDROCK_MODELS.some((m) => m.id === 'google.gemma-4-31b'),
    ).toBe(true)
  })
})
