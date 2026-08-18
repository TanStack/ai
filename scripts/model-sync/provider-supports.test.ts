import { describe, expect, it } from 'vitest'
import { buildProviderSupportsBody } from './provider-supports'

describe('buildProviderSupportsBody', () => {
  it('does not copy OpenAI computer_use or local_shell onto a new model', () => {
    const body = buildProviderSupportsBody({
      provider: 'openai',
      inputModalities: ['text', 'image'],
      supportedParameters: ['temperature', 'tools', 'response_format'],
    })
    expect(body).not.toContain('computer_use')
    expect(body).not.toContain('local_shell')
    expect(body).not.toContain('apply_patch')
    expect(body).toContain('tools: []')
    expect(body).toContain("endpoints: ['chat', 'chat-completions']")
    expect(body).toContain('function_calling')
    expect(body).toContain('structured_outputs')
  })

  it('does not invent Anthropic tools or priority_tier', () => {
    const body = buildProviderSupportsBody({
      provider: 'anthropic',
      inputModalities: ['text', 'image', 'document'],
      supportedParameters: ['max_tokens', 'tools'],
    })
    expect(body).not.toContain('web_fetch')
    expect(body).not.toContain('computer_use')
    expect(body).not.toContain('priority_tier')
    expect(body).not.toContain('extended_thinking')
    expect(body).toContain('tools: []')
  })

  it('does not invent Gemini google_search or url_context', () => {
    const body = buildProviderSupportsBody({
      provider: 'gemini',
      inputModalities: ['text'],
      supportedParameters: ['tools', 'include_reasoning'],
    })
    expect(body).not.toContain('google_search')
    expect(body).not.toContain('url_context')
    expect(body).toContain('tools: []')
    expect(body).toContain('function_calling')
    expect(body).toContain('thinking')
  })

  it('does not invent Grok x_search', () => {
    const body = buildProviderSupportsBody({
      provider: 'grok',
      inputModalities: ['text', 'image'],
      supportedParameters: ['tools', 'include_reasoning'],
    })
    expect(body).not.toContain('x_search')
    expect(body).toContain('tools: []')
    expect(body).toContain('tool_calling')
    expect(body).toContain('reasoning')
  })
})
