import { describe, expect, it } from 'vitest'
import {
  buildAnthropicProviderOptionsType,
  buildProviderSupportsBody,
} from './provider-supports'

describe('buildProviderSupportsBody', () => {
  it('lists the OpenAI server tools when the catalog accepts tools', () => {
    const body = buildProviderSupportsBody({
      provider: 'openai',
      inputModalities: ['text', 'image'],
      supportedParameters: ['temperature', 'tools', 'response_format'],
    })
    expect(body).toContain("'web_search'")
    expect(body).toContain("'file_search'")
    expect(body).toContain("'code_interpreter'")
    expect(body).toContain("'mcp'")
    expect(body).toContain("endpoints: ['chat', 'chat-completions']")
    expect(body).toContain('function_calling')
    expect(body).toContain('structured_outputs')
  })

  it('leaves OpenAI tools empty when the catalog has no tools param', () => {
    const body = buildProviderSupportsBody({
      provider: 'openai',
      inputModalities: ['text'],
      supportedParameters: ['temperature'],
    })
    expect(body).toContain('tools: []')
  })

  it('lists Anthropic server tools and budget-thinking flags', () => {
    const body = buildProviderSupportsBody({
      provider: 'anthropic',
      inputModalities: ['text', 'image', 'document'],
      supportedParameters: ['max_tokens', 'temperature', 'tools'],
    })
    expect(body).toContain("'web_search'")
    expect(body).toContain("'web_fetch'")
    expect(body).toContain("'code_execution'")
    expect(body).toContain("'computer_use'")
    expect(body).toContain('extended_thinking: true')
    expect(body).toContain('priority_tier: true')
    expect(body).not.toContain('adaptive_thinking')
  })

  it('marks adaptive-only Anthropic models', () => {
    const body = buildProviderSupportsBody({
      provider: 'anthropic',
      inputModalities: ['text'],
      supportedParameters: ['reasoning', 'tools'],
      reasoningMandatory: true,
    })
    expect(body).toContain('extended_thinking: false')
    expect(body).toContain('adaptive_thinking: true')
  })

  it('lists Gemini server tools', () => {
    const body = buildProviderSupportsBody({
      provider: 'gemini',
      inputModalities: ['text'],
      supportedParameters: ['tools', 'include_reasoning'],
    })
    expect(body).toContain("'code_execution'")
    expect(body).toContain("'google_search'")
    expect(body).toContain("'url_context'")
    expect(body).toContain('function_calling')
    expect(body).toContain('thinking')
  })

  it('lists Grok server tools', () => {
    const body = buildProviderSupportsBody({
      provider: 'grok',
      inputModalities: ['text', 'image'],
      supportedParameters: ['tools', 'include_reasoning'],
    })
    expect(body).toContain("'web_search'")
    expect(body).toContain("'x_search'")
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
