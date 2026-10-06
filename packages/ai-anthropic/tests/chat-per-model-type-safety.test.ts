/**
 * Per-model type-safety tests for Anthropic chat() modelOptions and
 * `reasoning`.
 *
 * Positive cases: each supported (model, option) pair compiles cleanly.
 * Negative cases: each unsupported option produces a `@ts-expect-error`.
 *
 * Companion to `tools-per-model-type-safety.test.ts` which covers the
 * `tools` array; this file covers `modelOptions`. Compile-time only.
 */
import { beforeAll, describe, expectTypeOf, it } from 'vitest'
import { chat } from '@tanstack/ai'
import { anthropicText } from '../src'
import type { ModelReasoning } from '@tanstack/ai'
import type { AnthropicChatModelProviderOptionsByName } from '../src'

// Set a dummy API key so adapter construction does not throw at runtime.
// These tests only exercise compile-time type gating; no network calls are made.
beforeAll(() => {
  process.env['ANTHROPIC_API_KEY'] = 'sk-test-dummy'
})

describe('Anthropic per-model chat modelOptions gating', () => {
  describe('claude-opus-4-6 — priority tier + all option groups', () => {
    it('accepts every option group', () => {
      chat({
        adapter: anthropicText('claude-opus-4-6'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          container: null,
          context_management: null,
          mcp_servers: [],
          service_tier: 'auto',
          stop_sequences: ['STOP'],
          tool_choice: { type: 'auto' },
          top_k: 5,
        },
      })
    })

    it('rejects unknown options', () => {
      chat({
        adapter: anthropicText('claude-opus-4-6'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - 'unknownOption' does not exist
          unknownOption: true,
        },
      })
    })

    it('rejects thinking in modelOptions (chat({ reasoning }) owns it)', () => {
      chat({
        adapter: anthropicText('claude-opus-4-6'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - thinking is set with `reasoning`
          thinking: { type: 'enabled', budget_tokens: 2048 },
        },
      })
    })
  })

  describe('claude-haiku-4-5 — priority tier', () => {
    it('accepts service_tier + tools options', () => {
      chat({
        adapter: anthropicText('claude-haiku-4-5'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          service_tier: 'standard_only',
          tool_choice: { type: 'auto' },
        },
      })
    })
  })

  describe('claude-opus-4-8 — no sampling', () => {
    it('accepts the base options', () => {
      chat({
        adapter: anthropicText('claude-opus-4-8'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          service_tier: 'auto',
          stop_sequences: ['STOP'],
          tool_choice: { type: 'auto' },
          max_tokens: 2048,
        },
      })
    })

    it('rejects sampling parameters', () => {
      chat({
        adapter: anthropicText('claude-opus-4-8'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - 'temperature' is not available on claude-opus-4-8
          temperature: 0.5,
        },
      })
    })
  })

  describe('claude-sonnet-5 — no sampling', () => {
    it('rejects sampling parameters', () => {
      chat({
        adapter: anthropicText('claude-sonnet-5'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - 'temperature' is not available on claude-sonnet-5
          temperature: 0.5,
        },
      })
      chat({
        adapter: anthropicText('claude-sonnet-5'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - 'top_k' is not available on claude-sonnet-5
          top_k: 5,
        },
      })
    })
  })

  describe('claude-fable-5 — no sampling', () => {
    it('rejects sampling parameters', () => {
      chat({
        adapter: anthropicText('claude-fable-5'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - 'temperature' is not available on claude-fable-5
          temperature: 0.5,
        },
      })
      chat({
        adapter: anthropicText('claude-fable-5'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - 'top_k' is not available on claude-fable-5
          top_k: 5,
        },
      })
    })
  })

  // Thinking and effort are `chat({ reasoning })`, not provider options.
  describe('claude-sonnet-5-5 — max_tokens, no sampling', () => {
    it('accepts max_tokens and the base options', () => {
      chat({
        adapter: anthropicText('claude-sonnet-5-5'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          service_tier: 'auto',
          stop_sequences: ['STOP'],
          tool_choice: { type: 'auto' },
          max_tokens: 2048,
        },
      })
    })

    it('rejects sampling parameters', () => {
      chat({
        adapter: anthropicText('claude-sonnet-5-5'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - 'temperature' is not available on claude-sonnet-5-5
          temperature: 0.5,
        },
      })
      chat({
        adapter: anthropicText('claude-sonnet-5-5'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - 'top_k' is not available on claude-sonnet-5-5
          top_k: 5,
        },
      })
    })
  })

  describe('Model name type safety', () => {
    it('accepts any model id, such as a gateway or catalog id', () => {
      anthropicText('anthropic/claude-sonnet-4.6')
      const id: string = 'MiniMax-M2.5'
      anthropicText(id)
    })
  })
})

describe('Anthropic chat reasoning from the config', () => {
  const messages = [{ role: 'user' as const, content: 'hi' }]

  it('a config with reasoning takes every level, for any model id', () => {
    chat({
      adapter: anthropicText('anthropic/claude-sonnet-4.6', {
        reasoning: { budget: true },
      }),
      messages,
      reasoning: { level: 'max', budgetTokens: 4000 },
    })
    // The table gives claude-opus-4-5 only low, medium, and high.
    const reasoning: ModelReasoning = { map: { xhigh: 'xhigh' }, budget: false }
    chat({
      adapter: anthropicText('claude-opus-4-5', { reasoning }),
      messages,
      reasoning: 'xhigh',
    })
  })

  it('an id with no table and no config takes no reasoning', () => {
    chat({
      adapter: anthropicText('anthropic/claude-sonnet-4.6'),
      messages,
      // @ts-expect-error - no reasoning data for this id
      reasoning: 'high',
    })
  })

  it('reasoning: false takes no reasoning, also on a known model', () => {
    chat({
      adapter: anthropicText('claude-opus-5-5', { reasoning: false }),
      messages,
      // @ts-expect-error - the config says the model does not reason
      reasoning: 'high',
    })
  })
})

describe('Anthropic per-model chat reasoning gating', () => {
  it('budget models take a level, off, and budgetTokens', () => {
    chat({
      adapter: anthropicText('claude-haiku-4-5'),
      messages: [{ role: 'user', content: 'hi' }],
      reasoning: { level: 'low', budgetTokens: 2048, summary: true },
    })
    chat({
      adapter: anthropicText('claude-haiku-4-5'),
      messages: [{ role: 'user', content: 'hi' }],
      reasoning: 'off',
    })
  })

  it('adaptive-era models take effort levels up to max', () => {
    chat({
      adapter: anthropicText('claude-opus-4-8'),
      messages: [{ role: 'user', content: 'hi' }],
      reasoning: 'xhigh',
    })
    chat({
      adapter: anthropicText('claude-opus-4-8'),
      messages: [{ role: 'user', content: 'hi' }],
      // @ts-expect-error - claude-opus-4-8 takes no token budget
      reasoning: { level: 'high', budgetTokens: 2048 },
    })
  })

  it('budget models stop at high', () => {
    chat({
      adapter: anthropicText('claude-haiku-4-5'),
      messages: [{ role: 'user', content: 'hi' }],
      // @ts-expect-error - claude-haiku-4-5 has no max level
      reasoning: 'max',
    })
  })

  it('claude-fable-5 cannot turn thinking off', () => {
    chat({
      adapter: anthropicText('claude-fable-5'),
      messages: [{ role: 'user', content: 'hi' }],
      // @ts-expect-error - thinking cannot be disabled on claude-fable-5
      reasoning: 'off',
    })
  })
})

describe('Anthropic provider options shape assertions', () => {
  describe('claude-opus-4-6 — full feature set', () => {
    type Options = AnthropicChatModelProviderOptionsByName['claude-opus-4-6']

    it('has service_tier', () => {
      expectTypeOf<Options>().toHaveProperty('service_tier')
    })
    it('has tool_choice', () => {
      expectTypeOf<Options>().toHaveProperty('tool_choice')
    })
    it('has top_k', () => {
      expectTypeOf<Options>().toHaveProperty('top_k')
    })
    it('has container', () => {
      expectTypeOf<Options>().toHaveProperty('container')
    })
    it('has mcp_servers', () => {
      expectTypeOf<Options>().toHaveProperty('mcp_servers')
    })
    it('has no thinking', () => {
      expectTypeOf<Options>().not.toHaveProperty('thinking')
    })
  })

  describe('claude-sonnet-5 — no sampling', () => {
    type Options = AnthropicChatModelProviderOptionsByName['claude-sonnet-5']

    it('has max_tokens but NOT temperature/top_p/top_k', () => {
      expectTypeOf<Options>().toHaveProperty('max_tokens')
      expectTypeOf<Options>().not.toHaveProperty('temperature')
      expectTypeOf<Options>().not.toHaveProperty('top_p')
      expectTypeOf<Options>().not.toHaveProperty('top_k')
    })
  })

  describe('claude-fable-5 — no sampling', () => {
    type Options = AnthropicChatModelProviderOptionsByName['claude-fable-5']

    it('has max_tokens but NOT temperature/top_p/top_k', () => {
      expectTypeOf<Options>().toHaveProperty('max_tokens')
      expectTypeOf<Options>().not.toHaveProperty('temperature')
      expectTypeOf<Options>().not.toHaveProperty('top_p')
      expectTypeOf<Options>().not.toHaveProperty('top_k')
    })
  })

  describe('claude-sonnet-5-5 — no sampling, thinking from chat({ reasoning })', () => {
    type Options = AnthropicChatModelProviderOptionsByName['claude-sonnet-5-5']

    it('has no thinking or output_config provider option', () => {
      expectTypeOf<Options>().not.toHaveProperty('thinking')
      expectTypeOf<Options>().not.toHaveProperty('output_config')
    })
    it('has max_tokens but NOT temperature/top_p/top_k', () => {
      expectTypeOf<Options>().toHaveProperty('max_tokens')
      expectTypeOf<Options>().not.toHaveProperty('temperature')
      expectTypeOf<Options>().not.toHaveProperty('top_p')
      expectTypeOf<Options>().not.toHaveProperty('top_k')
    })
  })
})
