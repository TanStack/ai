import { describe, expect, it } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { GroqTextAdapter } from '../src/adapters/text'
import type { ReasoningRequest } from '@tanstack/ai'
import type { GROQ_CHAT_MODELS } from '../src/model-meta'

const logger = resolveDebugOption(false)

class Probe<
  TModel extends (typeof GROQ_CHAT_MODELS)[number],
> extends GroqTextAdapter<TModel> {
  request(reasoning: ReasoningRequest) {
    return this.mapOptionsToRequest({
      model: this.model,
      logger,
      messages: [{ role: 'user', content: 'hi' }],
      reasoning,
    })
  }
}

describe('Groq chat({ reasoning }) request shape', () => {
  it('gpt-oss: reasoning_effort from the level', () => {
    const adapter = new Probe({ apiKey: 'k' }, 'openai/gpt-oss-120b')
    expect(adapter.request({ level: 'medium', summary: true })).toMatchObject({
      reasoning_effort: 'medium',
    })
  })

  it('Qwen 3: default to think, none for off', () => {
    const adapter = new Probe({ apiKey: 'k' }, 'qwen/qwen3-32b')
    expect(adapter.request({ level: 'high', summary: true })).toMatchObject({
      reasoning_effort: 'default',
    })
    expect(adapter.request({ level: 'off', summary: true })).toMatchObject({
      reasoning_effort: 'none',
    })
  })
})
