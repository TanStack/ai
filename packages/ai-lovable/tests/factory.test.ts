import { afterEach, describe, expect, it, vi } from 'vitest'
import { LovableTextAdapter } from '../src/adapters/text'
import { LovableResponsesTextAdapter } from '../src/adapters/responses-text'
import { createLovableText, lovableText } from '../src/adapters/factory'

describe('createLovableText (branching factory)', () => {
  it('defaults to the Responses adapter', () => {
    const adapter = createLovableText('openai/gpt-5.5', 'k')

    expect(adapter).toBeInstanceOf(LovableResponsesTextAdapter)
    expect(adapter.kind).toBe('text')
    expect(adapter.name).toBe('lovable')
    expect(adapter.model).toBe('openai/gpt-5.5')
  })

  it("returns the Responses adapter when api is 'responses'", () => {
    const adapter = createLovableText('openai/gpt-5.5', 'k', {
      api: 'responses',
    })

    expect(adapter).toBeInstanceOf(LovableResponsesTextAdapter)
  })

  it("returns the Chat Completions adapter when api is 'chat'", () => {
    const adapter = createLovableText('openai/gpt-5.5', 'k', {
      api: 'chat',
    })

    expect(adapter).toBeInstanceOf(LovableTextAdapter)
  })

  it("returns the Chat Completions adapter when api is 'chat-completions'", () => {
    const adapter = createLovableText('openai/gpt-5.5', 'k', {
      api: 'chat-completions',
    })

    expect(adapter).toBeInstanceOf(LovableTextAdapter)
  })
})

describe('lovableText (env-key branching factory)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reads LOVABLE_API_KEY and defaults to Responses', () => {
    vi.stubEnv('LOVABLE_API_KEY', 'env-key')

    expect(lovableText('openai/gpt-5.5')).toBeInstanceOf(
      LovableResponsesTextAdapter,
    )
    expect(lovableText('openai/gpt-5.5', { api: 'responses' })).toBeInstanceOf(
      LovableResponsesTextAdapter,
    )
    expect(lovableText('openai/gpt-5.5', { api: 'chat' })).toBeInstanceOf(
      LovableTextAdapter,
    )
  })
})
