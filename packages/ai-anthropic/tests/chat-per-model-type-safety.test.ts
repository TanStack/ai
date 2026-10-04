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

  describe('Model name type safety', () => {
    it('rejects unknown model names at the factory', () => {
      // @ts-expect-error - 'claude-fake-9000' is not a valid Anthropic chat model
      anthropicText('claude-fake-9000')
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
})
