import { describe, expect, it } from 'vitest'
import { chat } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { BedrockTextAdapter } from '../src/adapters/text'
import { BedrockResponsesTextAdapter } from '../src/adapters/responses-text'
import {
  BedrockConverseTextAdapter,
  createBedrockConverse,
} from '../src/adapters/converse-text'
import type {
  ModelReasoning,
  ReasoningRequest,
  TextOptions,
} from '@tanstack/ai'
import type { BedrockConverseModelId } from '../src/adapters/converse-text'
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
  TModel extends BedrockConverseModelId,
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

describe('Bedrock Converse reasoning from the config', () => {
  const effortMap: ModelReasoning = {
    map: { off: null, minimal: null, xhigh: 'xhigh', max: 'max' },
    budget: false,
  }
  const probe = (model: string, reasoning: ModelReasoning) =>
    new ConverseProbe({ ...config, reasoning }, model)

  it('sends adaptive thinking for a Claude id that the table does not have', () => {
    expect(
      probe('anthropic.claude-fable-5', effortMap).request(on('xhigh'))
        .additionalModelRequestFields,
    ).toEqual({
      thinking: { type: 'adaptive' },
      output_config: { effort: 'xhigh' },
    })
  })

  it('sends budget thinking for a budget record', () => {
    const input = probe('global.anthropic.claude-sonnet-4-6', {
      budget: true,
    }).request(on('medium'))
    expect(input.additionalModelRequestFields).toEqual({
      thinking: { type: 'enabled', budget_tokens: 8192 },
      anthropic_beta: ['interleaved-thinking-2025-05-14'],
    })
  })

  it('sends no thinking for reasoning: false, also on a known model', () => {
    expect(
      probe('us.anthropic.claude-haiku-4-5-20251001-v1:0', false).request(
        on('high'),
      ),
    ).not.toHaveProperty('additionalModelRequestFields')
  })

  it('clamps the level with the config, not with the table', () => {
    // This config has no minimal, so minimal moves up to low.
    expect(
      probe('anthropic.claude-fable-5', effortMap).request(on('minimal'))
        .additionalModelRequestFields,
    ).toEqual({
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
    })
  })
})

describe('Bedrock Converse chat reasoning types', () => {
  const messages = [{ role: 'user' as const, content: 'hi' }]

  it('takes any model id, and every level with a reasoning config', () => {
    const id: string = 'anthropic.claude-fable-5'
    const reasoning: ModelReasoning = { budget: true }
    // Type-level only: chat() is never iterated, so no request goes out.
    chat({
      adapter: createBedrockConverse(id, 'k', { reasoning }),
      messages,
      reasoning: { level: 'max', budgetTokens: 4000 },
    })
    chat({
      adapter: createBedrockConverse(id, 'k'),
      messages,
      // @ts-expect-error - no reasoning data for this id
      reasoning: 'high',
    })
  })
})
