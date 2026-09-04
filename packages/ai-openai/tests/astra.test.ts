import { describe, expect, expectTypeOf, it } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { OpenAITextAdapter } from '../src/adapters/text'
import { OpenAIChatCompletionsTextAdapter } from '../src/adapters/text-chat-completions'
import { OPENAI_CHAT_MODELS } from '../src/model-meta'
import type {
  OpenAIChatModelProviderOptionsByName,
  OpenAIChatModelToolCapabilitiesByName,
  OpenAIModelInputModalitiesByName,
} from '../src/model-meta'
import type { OpenAIAstraChatCompletionsOptions } from '../src/text/text-provider-options'
import type { TextOptions } from '@tanstack/ai'

type AstraOptions = OpenAIChatModelProviderOptionsByName['gpt-6-astra']

class ResponsesAdapter extends OpenAITextAdapter<'gpt-6-astra'> {
  request(options: TextOptions<AstraOptions>) {
    return this.mapOptionsToRequest(options)
  }
}

class ChatCompletionsAdapter extends OpenAIChatCompletionsTextAdapter<'gpt-6-astra'> {
  request(options: TextOptions<OpenAIAstraChatCompletionsOptions>) {
    return this.mapOptionsToRequest(options)
  }
}

const input = {
  logger: resolveDebugOption(false),
  model: 'gpt-6-astra',
  messages: [{ role: 'user', content: 'Hello' }],
} as const

describe('GPT-6 Astra', () => {
  it('registers supported reasoning, input modalities, and provider tools', () => {
    expect(OPENAI_CHAT_MODELS).toContain('gpt-6-astra')
    expectTypeOf<
      NonNullable<AstraOptions['reasoning']>['effort']
    >().toEqualTypeOf<'low' | 'medium' | 'high' | 'xhigh' | 'max' | undefined>()
    expectTypeOf<
      OpenAIModelInputModalitiesByName['gpt-6-astra'][number]
    >().toEqualTypeOf<'text' | 'image'>()
    expectTypeOf<
      OpenAIChatModelToolCapabilitiesByName['gpt-6-astra'][number]
    >().toEqualTypeOf<
      | 'web_search'
      | 'file_search'
      | 'image_generation'
      | 'code_interpreter'
      | 'mcp'
      | 'computer_use'
      | 'shell'
      | 'apply_patch'
    >()
    expectTypeOf<AstraOptions>().not.toHaveProperty('prompt_cache_retention')
    expectTypeOf<AstraOptions>().not.toHaveProperty('top_logprobs')
  })

  it('preserves max reasoning and strips unsupported Responses parameters', () => {
    const adapter = new ResponsesAdapter({ apiKey: 'test-key' }, 'gpt-6-astra')
    const request = adapter.request({
      ...input,
      messages: [...input.messages],
      modelOptions: {
        reasoning: { effort: 'max', summary: 'auto' },
        temperature: 0.3,
        top_p: 0.8,
        max_output_tokens: 128,
      },
    })
    expect(request.reasoning).toEqual({ effort: 'max', summary: 'auto' })
    expect(request.include).toEqual(['reasoning.encrypted_content'])
    expect(request.max_output_tokens).toBe(128)
    expect(request).not.toHaveProperty('temperature')
    expect(request).not.toHaveProperty('top_p')

    // Untyped callers can still supply log-probability options.
    const modelOptions = {
      top_logprobs: 5,
      include: ['message.output_text.logprobs', 'reasoning.encrypted_content'],
    } as any
    const filtered = adapter.request({
      ...input,
      messages: [...input.messages],
      modelOptions,
    })
    expect(filtered).not.toHaveProperty('top_logprobs')
    expect(filtered.include).toEqual(['reasoning.encrypted_content'])
  })

  it('forwards native Chat Completions options and rejects tool calls', () => {
    const adapter = new ChatCompletionsAdapter(
      { apiKey: 'test-key' },
      'gpt-6-astra',
    )
    const options = {
      ...input,
      messages: [...input.messages],
      modelOptions: {
        reasoning_effort: 'max' as const,
        max_completion_tokens: 128,
      },
    }
    expect(adapter.request(options)).toMatchObject({
      model: 'gpt-6-astra',
      reasoning_effort: 'max',
      max_completion_tokens: 128,
    })
    expect(() =>
      adapter.request({
        ...options,
        tools: [{ name: 'lookup', description: 'Look up a value' }],
      }),
    ).toThrow('GPT-6 Astra tool calls require openaiText')
    expect(() =>
      adapter.request({
        ...options,
        messages: [{ role: 'tool', toolCallId: 'call_1', content: 'result' }],
      }),
    ).toThrow('GPT-6 Astra tool calls require openaiText')
  })

})
