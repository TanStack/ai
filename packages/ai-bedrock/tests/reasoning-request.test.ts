import { describe, expect, it } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { BedrockTextAdapter } from '../src/adapters/text'
import { BedrockResponsesTextAdapter } from '../src/adapters/responses-text'
import { BedrockConverseTextAdapter } from '../src/adapters/converse-text'
import type { ReasoningRequest, TextOptions } from '@tanstack/ai'
import type { BedrockConverseModels } from '../src/model-meta'
import type { BedrockConverseProviderOptions } from '../src/converse/provider-options'

const logger = resolveDebugOption(false)
const config = { apiKey: 'k', region: 'us-east-1' }

function options(
  model: string,
  reasoning: ReasoningRequest | undefined,
): TextOptions {
  return {
    model,
    logger,
    messages: [{ role: 'user', content: 'hi' }],
    ...(reasoning ? { reasoning } : {}),
  }
}

class ChatProbe extends BedrockTextAdapter<'openai.gpt-oss-120b-1:0'> {
  request(reasoning: ReasoningRequest | undefined) {
    return this.mapOptionsToRequest(options(this.model, reasoning))
  }
}

class ResponsesProbe extends BedrockResponsesTextAdapter<'openai.gpt-oss-120b-1:0'> {
  request(reasoning: ReasoningRequest | undefined) {
    return this.mapOptionsToRequest(options(this.model, reasoning))
  }
}

class ConverseProbe<
  TModel extends BedrockConverseModels,
> extends BedrockConverseTextAdapter<TModel, BedrockConverseProviderOptions> {
  request(
    reasoning: ReasoningRequest | undefined,
    modelOptions?: BedrockConverseProviderOptions,
  ) {
    return this.buildInput({
      ...options(this.model, reasoning),
      ...(modelOptions ? { modelOptions } : {}),
    })
  }
}

const on = (level: ReasoningRequest['level']): ReasoningRequest => ({
  level,
  summary: true,
})

describe('Bedrock chat({ reasoning }) request shape', () => {
  it('Chat Completions: reasoning_effort', () => {
    const adapter = new ChatProbe(config, 'openai.gpt-oss-120b-1:0')
    expect(adapter.request(on('high'))).toMatchObject({
      reasoning_effort: 'high',
    })
    expect(adapter.request(undefined)).not.toHaveProperty('reasoning_effort')
    // gpt-oss has no minimal: it clamps up to low.
    expect(adapter.request(on('minimal'))).toMatchObject({
      reasoning_effort: 'low',
    })
  })

  it('Responses: reasoning.effort and a summary', () => {
    const adapter = new ResponsesProbe(config, 'openai.gpt-oss-120b-1:0')
    expect(adapter.request(on('medium'))).toMatchObject({
      reasoning: { effort: 'medium', summary: 'auto' },
    })
    expect(adapter.request({ level: 'low', summary: false }).reasoning).toEqual(
      { effort: 'low' },
    )
  })

  it('Converse Claude: budget thinking, the beta, and room in maxTokens', () => {
    const adapter = new ConverseProbe(
      config,
      'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    )
    const input = adapter.request(on('high'), { max_completion_tokens: 4000 })
    expect(input.additionalModelRequestFields).toEqual({
      thinking: { type: 'enabled', budget_tokens: 16384 },
      anthropic_beta: ['interleaved-thinking-2025-05-14'],
    })
    expect(input.inferenceConfig?.maxTokens).toBe(17408)
    expect(
      adapter.request({ level: 'high', summary: true, budgetTokens: 2000 })
        .additionalModelRequestFields,
    ).toMatchObject({ thinking: { budget_tokens: 2000 } })
  })

  it('Converse: off, and models that are not Claude, send no thinking', () => {
    const claude = new ConverseProbe(
      config,
      'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    )
    expect(claude.request(on('off'))).not.toHaveProperty(
      'additionalModelRequestFields',
    )
    const gptOss = new ConverseProbe(config, 'openai.gpt-oss-120b-1:0')
    expect(gptOss.request(on('high'))).not.toHaveProperty(
      'additionalModelRequestFields',
    )
  })
})
