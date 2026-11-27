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
import { chat, createChatOptions } from '@tanstack/ai'
import { openaiText } from '../src'
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
        threadId: 'thread-1',
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
        threadId: 'thread-1',
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
        threadId: 'thread-1',
        adapter: openaiText('gpt-5.2'),
        messages: [{ role: 'user', content: 'hi' }],
        // @ts-expect-error - gpt-5.2 has no `max` level
        reasoning: 'max',
      })
    })

    it('rejects unknown options', () => {
      chat({
        threadId: 'thread-1',
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
        threadId: 'thread-1',
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
        threadId: 'thread-1',
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
        threadId: 'thread-1',
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
        threadId: 'thread-1',
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
        threadId: 'thread-1',
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
        threadId: 'thread-1',
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
        threadId: 'thread-1',
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
        threadId: 'thread-1',
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
        threadId: 'thread-1',
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
        threadId: 'thread-1',
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
        threadId: 'thread-1',
        adapter: openaiText('o3'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - 'text' is not available on o3
          text: { format: { type: 'text' } },
        },
      })
    })
  })

  describe('gpt-audio — base + streaming + metadata only', () => {
    it('rejects tools options', () => {
      chat({
        threadId: 'thread-1',
        adapter: openaiText('gpt-audio'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - 'tool_choice' is not available on gpt-audio
          tool_choice: 'auto',
        },
      })
    })

    it('rejects reasoning option', () => {
      chat({
        threadId: 'thread-1',
        adapter: openaiText('gpt-audio'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - 'reasoning' is not available on gpt-audio
          reasoning: { effort: 'low' },
        },
      })
    })
  })

  describe.each(['gpt-6.1-terra', 'gpt-6.1-terra-pro'] as const)(
    '%s — reasoning none to max',
    (model) => {
      it('accepts its reasoning levels', () => {
        for (const reasoning of ['off', 'low', 'max'] as const) {
          chat({
            threadId: 'thread-1',
            adapter: openaiText(model),
            messages: [{ role: 'user', content: 'hi' }],
            reasoning,
          })
        }
      })
    },
  )

  describe('sampling options and reasoning', () => {
    const messages = [{ role: 'user' as const, content: 'hi' }]

    it('accepts temperature, top_p and top_logprobs on a reasoning model when reasoning is off', () => {
      chat({
        threadId: 'thread-1',
        adapter: openaiText('gpt-5.5'),
        messages,
        reasoning: 'off',
        modelOptions: { temperature: 0.2, top_p: 0.9, top_logprobs: 2 },
      })
      chat({
        threadId: 'thread-1',
        adapter: openaiText('gpt-5.5'),
        messages,
        reasoning: { level: 'off' },
        modelOptions: { temperature: 0.2 },
      })
    })

    it('rejects temperature on a reasoning model when reasoning is on', () => {
      chat({
        threadId: 'thread-1',
        adapter: openaiText('gpt-5.5'),
        messages,
        reasoning: 'high',
        // @ts-expect-error - the adapter drops temperature unless reasoning is 'off'
        modelOptions: { temperature: 0.2 },
      })
      chat({
        threadId: 'thread-1',
        adapter: openaiText('gpt-5.5'),
        messages,
        reasoning: { level: 'low', summary: false },
        // @ts-expect-error - the adapter drops top_p unless reasoning is 'off'
        modelOptions: { top_p: 0.9 },
      })
    })

    it('rejects temperature on a reasoning model when reasoning is not set', () => {
      chat({
        threadId: 'thread-1',
        adapter: openaiText('gpt-5.5'),
        messages,
        // @ts-expect-error - the default effort is not 'off', so the adapter drops temperature
        modelOptions: { temperature: 0.2 },
      })
    })

    it('keeps temperature on models that accept it', () => {
      chat({
        threadId: 'thread-1',
        adapter: openaiText('gpt-4.1'),
        messages,
        modelOptions: { temperature: 0.2 },
      })
      chat({
        threadId: 'thread-1',
        adapter: openaiText('gpt-5.2-chat-latest'),
        messages,
        reasoning: 'medium',
        modelOptions: { temperature: 0.2 },
      })
    })
  })

  describe('sampling options through createChatOptions', () => {
    const messages = [{ role: 'user' as const, content: 'hi' }]

    it('spreads options into chat() with the same rule', () => {
      const plain = createChatOptions({ adapter: openaiText('gpt-6.1-sol') })
      chat({ ...plain, messages, threadId: 'thread-1' })

      const off = createChatOptions({
        adapter: openaiText('gpt-5.5'),
        reasoning: 'off',
        modelOptions: { temperature: 0.2 },
      })
      chat({ ...off, messages, threadId: 'thread-1' })

      const base = createChatOptions({
        adapter: openaiText('gpt-5.5'),
        modelOptions: { max_output_tokens: 100 },
      })
      chat({ ...base, messages, threadId: 'thread-1', reasoning: 'high' })
    })

    it('rejects temperature when reasoning is not off', () => {
      createChatOptions({
        adapter: openaiText('gpt-5.5'),
        // @ts-expect-error - the adapter drops temperature unless reasoning is 'off'
        modelOptions: { temperature: 0.2 },
      })
    })
  })

  describe('service_tier', () => {
    it('accepts the known tiers and new tier names', () => {
      for (const service_tier of ['flex', 'priority', 'ultrafast'] as const) {
        chat({
          threadId: 'thread-1',
          adapter: openaiText('gpt-6-astra'),
          messages: [{ role: 'user', content: 'hi' }],
          modelOptions: { service_tier },
        })
      }
    })
  })

  describe('Model name type safety', () => {
    it('rejects unknown model names at the factory', () => {
      // @ts-expect-error - 'gpt-unknown-9000' is not a valid OpenAI chat model
      openaiText('gpt-unknown-9000')
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

  describe('gpt-audio — base + streaming + metadata only', () => {
    type Options = OpenAIChatModelProviderOptionsByName['gpt-audio']

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
        threadId: 'thread-1',
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
