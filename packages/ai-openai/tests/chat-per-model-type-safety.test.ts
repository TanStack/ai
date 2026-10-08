/**
 * Per-model type-safety tests for OpenAI chat() modelOptions.
 *
 * Positive cases: each supported (model, option) pair compiles cleanly.
 * Negative cases: each unsupported option produces a `@ts-expect-error`.
 *
 * Companion to `tools-per-model-type-safety.test.ts` which covers the
 * `tools` array; this file covers `modelOptions`. Compile-time only.
 */
import { beforeAll, describe, expectTypeOf, it } from 'vitest'
import { chat } from '@tanstack/ai'
import { azureOpenaiText, openaiText } from '../src'
import type { ModelReasoning } from '@tanstack/ai'
import type { OpenAIChatModelProviderOptionsByName } from '../src'

// Set a dummy API key so adapter construction does not throw at runtime.
// These tests only exercise compile-time type gating; no network calls are made.
beforeAll(() => {
  process.env['OPENAI_API_KEY'] = 'sk-test-dummy'
})

describe('OpenAI per-model chat modelOptions gating', () => {
  describe('gpt-5.2 — full superset (reasoning + structured output + tools + streaming + metadata)', () => {
    it('accepts every option group', () => {
      chat({
        adapter: openaiText('gpt-5.2'),
        messages: [{ role: 'user', content: 'hi' }],
        reasoning: { level: 'medium', summary: true },
        modelOptions: {
          background: false,
          service_tier: 'auto',
          verbosity: 'medium',
          text: { format: { type: 'text' } },
          tool_choice: 'auto',
          max_tool_calls: 5,
          parallel_tool_calls: true,
          stream_options: { include_obfuscation: false },
          metadata: { request_id: 'abc' },
        },
      })
    })

    it('takes reasoning only as the chat() option, not in modelOptions', () => {
      chat({
        adapter: openaiText('gpt-5.2'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - reasoning is the top-level `reasoning` option now
          reasoning: { effort: 'low' },
        },
      })
    })

    it('rejects a level the model does not have', () => {
      chat({
        adapter: openaiText('gpt-5.2'),
        messages: [{ role: 'user', content: 'hi' }],
        // @ts-expect-error - gpt-5.2 has no `max` level
        reasoning: 'max',
      })
    })

    it('rejects unknown options', () => {
      chat({
        adapter: openaiText('gpt-5.2'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - 'unknownOption' does not exist
          unknownOption: true,
        },
      })
    })
  })

  describe('gpt-5.2-pro — reasoning + tools + streaming + metadata (NO structured output)', () => {
    it('accepts reasoning, tools, and streaming options', () => {
      chat({
        adapter: openaiText('gpt-5.2-pro'),
        messages: [{ role: 'user', content: 'hi' }],
        reasoning: 'high',
        modelOptions: {
          tool_choice: 'required',
          stream_options: { include_obfuscation: true },
          metadata: { run: '1' },
        },
      })
    })

    it('rejects structured-output `text` option', () => {
      chat({
        adapter: openaiText('gpt-5.2-pro'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - 'text' is not available on gpt-5.2-pro
          text: { format: { type: 'text' } },
        },
      })
    })
  })

  describe('gpt-4 — tools + streaming + metadata (NO reasoning, NO structured output)', () => {
    it('accepts tools + streaming + metadata', () => {
      chat({
        adapter: openaiText('gpt-4'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          tool_choice: 'auto',
          max_tool_calls: 2,
          stream_options: { include_obfuscation: false },
          metadata: { tier: 'b' },
        },
      })
    })

    it('rejects reasoning option', () => {
      chat({
        adapter: openaiText('gpt-4'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - 'reasoning' is not available on gpt-4
          reasoning: { effort: 'low' },
        },
      })
    })

    it('rejects structured-output `text` option', () => {
      chat({
        adapter: openaiText('gpt-4'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - 'text' is not available on gpt-4
          text: { format: { type: 'text' } },
        },
      })
    })
  })

  describe('gpt-3.5-turbo — tools + streaming + metadata (NO reasoning, NO structured output)', () => {
    it('accepts tools + streaming options', () => {
      chat({
        adapter: openaiText('gpt-3.5-turbo'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          tool_choice: 'auto',
          stream_options: { include_obfuscation: false },
        },
      })
    })

    it('rejects reasoning option', () => {
      chat({
        adapter: openaiText('gpt-3.5-turbo'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - 'reasoning' is not available on gpt-3.5-turbo
          reasoning: { effort: 'medium' },
        },
      })
    })
  })

  describe('o3 — reasoning + metadata (NO tools, NO streaming, NO structured output)', () => {
    it('accepts reasoning + metadata', () => {
      chat({
        adapter: openaiText('o3'),
        messages: [{ role: 'user', content: 'hi' }],
        reasoning: 'high',
        modelOptions: {
          metadata: { case: 'reasoning-only' },
        },
      })
    })

    it('rejects tools options', () => {
      chat({
        adapter: openaiText('o3'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - 'tool_choice' is not available on o3
          tool_choice: 'auto',
        },
      })
    })

    it('rejects streaming options', () => {
      chat({
        adapter: openaiText('o3'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - 'stream_options' is not available on o3
          stream_options: { include_obfuscation: true },
        },
      })
    })

    it('rejects structured-output `text` option', () => {
      chat({
        adapter: openaiText('o3'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - 'text' is not available on o3
          text: { format: { type: 'text' } },
        },
      })
    })
  })

  describe('chatgpt-4o-latest — base + streaming + metadata only', () => {
    it('rejects tools options', () => {
      chat({
        adapter: openaiText('chatgpt-4o-latest'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - 'tool_choice' is not available on chatgpt-4o-latest
          tool_choice: 'auto',
        },
      })
    })

    it('rejects reasoning option', () => {
      chat({
        adapter: openaiText('chatgpt-4o-latest'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - 'reasoning' is not available on chatgpt-4o-latest
          reasoning: { effort: 'low' },
        },
      })
    })
  })

  describe('Model name type safety', () => {
    it('accepts any model id, such as a catalog id', () => {
      openaiText('gpt-5.3-codex')
      const id: string = 'gpt-unknown-9000'
      openaiText(id)
    })
  })
})

describe('OpenAI chat reasoning from the config', () => {
  const messages = [{ role: 'user' as const, content: 'hi' }]

  it('a config with reasoning takes every level, for any model id', () => {
    const reasoning: ModelReasoning = { budget: false }
    chat({
      adapter: openaiText('gpt-5.3-codex', { reasoning }),
      messages,
      reasoning: 'high',
    })
  })

  it('an id with no table and no config takes no reasoning', () => {
    chat({
      adapter: openaiText('gpt-5.3-codex'),
      messages,
      // @ts-expect-error - no reasoning data for this id
      reasoning: 'high',
    })
  })

  it('reasoning: false takes no reasoning', () => {
    chat({
      adapter: openaiText('gpt-5.3-codex', { reasoning: false }),
      messages,
      // @ts-expect-error - the config says the model does not reason
      reasoning: 'high',
    })
  })

  it('azureOpenaiText takes reasoning only from the config', () => {
    chat({
      adapter: azureOpenaiText('gpt-5.5', {
        resourceName: 'r',
        apiKey: 'k',
        reasoning: { budget: false },
      }),
      messages,
      reasoning: 'medium',
    })
    chat({
      adapter: azureOpenaiText('gpt-5.5', { resourceName: 'r', apiKey: 'k' }),
      messages,
      // @ts-expect-error - no reasoning data without the config
      reasoning: 'medium',
    })
  })
})

describe('OpenAI provider options shape assertions', () => {
  describe('gpt-5.2 — full feature set', () => {
    type Options = OpenAIChatModelProviderOptionsByName['gpt-5.2']

    it('has no reasoning (it is the chat() option now)', () => {
      expectTypeOf<Options>().not.toHaveProperty('reasoning')
    })
    it('has text (structured output)', () => {
      expectTypeOf<Options>().toHaveProperty('text')
    })
    it('has tool_choice', () => {
      expectTypeOf<Options>().toHaveProperty('tool_choice')
    })
    it('has stream_options', () => {
      expectTypeOf<Options>().toHaveProperty('stream_options')
    })
    it('has metadata', () => {
      expectTypeOf<Options>().toHaveProperty('metadata')
    })
  })

  describe('o3 — reasoning + metadata only', () => {
    type Options = OpenAIChatModelProviderOptionsByName['o3']

    it('has no reasoning (it is the chat() option now)', () => {
      expectTypeOf<Options>().not.toHaveProperty('reasoning')
    })
    it('has metadata', () => {
      expectTypeOf<Options>().toHaveProperty('metadata')
    })
    it('does NOT have tool_choice', () => {
      expectTypeOf<Options>().not.toHaveProperty('tool_choice')
    })
    it('does NOT have stream_options', () => {
      expectTypeOf<Options>().not.toHaveProperty('stream_options')
    })
    it('does NOT have text (structured output)', () => {
      expectTypeOf<Options>().not.toHaveProperty('text')
    })
  })

  describe('gpt-4 — tools + streaming + metadata (no reasoning, no structured output)', () => {
    type Options = OpenAIChatModelProviderOptionsByName['gpt-4']

    it('has tool_choice', () => {
      expectTypeOf<Options>().toHaveProperty('tool_choice')
    })
    it('has stream_options', () => {
      expectTypeOf<Options>().toHaveProperty('stream_options')
    })
    it('does NOT have reasoning', () => {
      expectTypeOf<Options>().not.toHaveProperty('reasoning')
    })
    it('does NOT have text (structured output)', () => {
      expectTypeOf<Options>().not.toHaveProperty('text')
    })
  })

  describe('chatgpt-4o-latest — base + streaming + metadata only', () => {
    type Options = OpenAIChatModelProviderOptionsByName['chatgpt-4o-latest']

    it('has stream_options', () => {
      expectTypeOf<Options>().toHaveProperty('stream_options')
    })
    it('has metadata', () => {
      expectTypeOf<Options>().toHaveProperty('metadata')
    })
    it('does NOT have reasoning', () => {
      expectTypeOf<Options>().not.toHaveProperty('reasoning')
    })
    it('does NOT have tool_choice', () => {
      expectTypeOf<Options>().not.toHaveProperty('tool_choice')
    })
    it('does NOT have text (structured output)', () => {
      expectTypeOf<Options>().not.toHaveProperty('text')
    })
  })

  describe('sampling options are available on every model regardless of feature set', () => {
    it('exposes temperature/top_p/max_output_tokens on a base model (gpt-4o)', () => {
      type Options = OpenAIChatModelProviderOptionsByName['gpt-4o']
      expectTypeOf<Options>().toHaveProperty('temperature')
      expectTypeOf<Options>().toHaveProperty('top_p')
      expectTypeOf<Options>().toHaveProperty('max_output_tokens')
    })

    it('exposes sampling options on a reasoning model (o3)', () => {
      // Reasoning models reject temperature/top_p at the API, but the type
      // surface still carries them (documented caveat) so callers tuning a
      // single backend get a uniform sampling shape.
      type Options = OpenAIChatModelProviderOptionsByName['o3']
      expectTypeOf<Options>().toHaveProperty('temperature')
      expectTypeOf<Options>().toHaveProperty('top_p')
      expectTypeOf<Options>().toHaveProperty('max_output_tokens')
    })

    it('accepts sampling options through chat() modelOptions', () => {
      chat({
        adapter: openaiText('gpt-4o'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          temperature: 0.3,
          top_p: 0.9,
          max_output_tokens: 256,
        },
      })
    })
  })
})
