import { describe, expect, it } from 'vitest'
import {
  buildAnthropicProviderOptionsType,
  buildProviderSupportsBody,
} from './provider-supports'

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

  it('writes Groq features without copying hosted tools', () => {
    const body = buildProviderSupportsBody({
      provider: 'groq',
      inputModalities: ['text'],
      supportedParameters: ['tools', 'structured_outputs'],
    })
    expect(body).toContain("endpoints: ['chat']")
    expect(body).toContain('tools: [] as const')
    expect(body).toContain("'json_schema'")
    expect(body).not.toContain('browser_search')
  })

  it('writes BytePlus capabilities from catalog flags', () => {
    const body = buildProviderSupportsBody({
      provider: 'byteplus',
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
      supportedParameters: ['tools', 'reasoning'],
    })
    expect(body).toContain('tool_calling')
    expect(body).toContain('reasoning')
    expect(body).toContain('tools: [] as const')
    expect(body).not.toContain('structured_outputs')
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

describe('buildAnthropicProviderOptionsType', () => {
  it('uses adaptive-only thinking and no sampling when reasoning is mandatory', () => {
    const type = buildAnthropicProviderOptionsType({
      supportedParameters: [
        'max_tokens',
        'reasoning',
        'tools',
        'include_reasoning',
        'reasoning_effort',
      ],
      reasoningMandatory: true,
      hasCachedPricing: true,
    })
    expect(type).toContain('AnthropicCacheControlOptions')
    expect(type).toContain('AnthropicAdaptiveOnlyThinkingOptions')
    expect(type).toContain('AnthropicMaxTokensOptions')
    expect(type).toContain('AnthropicOutputConfigOptions')
    expect(type).not.toContain('AnthropicSamplingOptions')
    expect(type).not.toContain('AnthropicThinkingOptions &')
    expect(type).not.toContain('AnthropicAdaptiveThinkingOptions')
    expect(type).not.toContain('AnthropicAdaptiveOrDisabledThinkingOptions')
  })

  it('uses adaptive-or-disabled thinking when reasoning is listed without sampling', () => {
    const type = buildAnthropicProviderOptionsType({
      supportedParameters: ['max_tokens', 'reasoning', 'stop'],
      reasoningMandatory: false,
    })
    expect(type).toContain('AnthropicAdaptiveOrDisabledThinkingOptions')
    expect(type).toContain('AnthropicMaxTokensOptions')
    expect(type).not.toContain('AnthropicSamplingOptions')
  })

  it('keeps sampling plus budget thinking when temperature is listed and reasoning is not', () => {
    const type = buildAnthropicProviderOptionsType({
      supportedParameters: ['temperature', 'top_p', 'top_k', 'max_tokens'],
    })
    expect(type).toContain('AnthropicThinkingOptions')
    expect(type).toContain('AnthropicSamplingOptions')
    expect(type).not.toContain('AnthropicMaxTokensOptions')
    expect(type).not.toContain('AnthropicAdaptiveOnlyThinkingOptions')
  })
})
