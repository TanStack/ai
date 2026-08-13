/**
 * Per-model type-safety tests for Anthropic chat() modelOptions.
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
  describe('claude-opus-4-6 — full superset (thinking + priority tier + all option groups)', () => {
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
          thinking: { type: 'enabled', budget_tokens: 2048 },
          tool_choice: { type: 'auto' },
          top_k: 5,
        },
      })
    })

    it('accepts adaptive thinking (supported alongside the deprecated budget shape)', () => {
      chat({
        adapter: anthropicText('claude-opus-4-6'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          thinking: { type: 'adaptive', display: 'summarized' },
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
  })

  describe('claude-haiku-4-5 — thinking + priority tier', () => {
    it('accepts thinking + service_tier + tools options', () => {
      chat({
        adapter: anthropicText('claude-haiku-4-5'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          thinking: { type: 'enabled', budget_tokens: 1024 },
          service_tier: 'standard_only',
          tool_choice: { type: 'auto' },
        },
      })
    })
  })

  describe('claude-opus-4-8 — adaptive thinking, no budget_tokens, no sampling', () => {
    it('accepts adaptive thinking + output_config effort (incl. xhigh) + base options', () => {
      chat({
        adapter: anthropicText('claude-opus-4-8'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          thinking: { type: 'adaptive', display: 'summarized' },
          output_config: { effort: 'xhigh' },
          service_tier: 'auto',
          stop_sequences: ['STOP'],
          tool_choice: { type: 'auto' },
          max_tokens: 2048,
        },
      })
    })

    it('rejects manual `budget_tokens` thinking', () => {
      chat({
        adapter: anthropicText('claude-opus-4-8'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - budget_tokens thinking returns a 400 on claude-opus-4-8
          thinking: { type: 'enabled', budget_tokens: 2048 },
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

  describe('claude-sonnet-5 — adaptive thinking, no budget_tokens, no sampling', () => {
    it('accepts adaptive thinking + output_config effort (incl. xhigh) + base options', () => {
      chat({
        adapter: anthropicText('claude-sonnet-5'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          thinking: { type: 'adaptive', display: 'summarized' },
          output_config: { effort: 'xhigh' },
          service_tier: 'auto',
          stop_sequences: ['STOP'],
          tool_choice: { type: 'auto' },
          max_tokens: 2048,
        },
      })
    })

    it('accepts explicit thinking opt-out', () => {
      chat({
        adapter: anthropicText('claude-sonnet-5'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          thinking: { type: 'disabled' },
        },
      })
    })

    it('rejects manual `budget_tokens` thinking', () => {
      chat({
        adapter: anthropicText('claude-sonnet-5'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - budget_tokens thinking returns a 400 on claude-sonnet-5
          thinking: { type: 'enabled', budget_tokens: 2048 },
        },
      })
    })

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

  describe('claude-fable-5 — thinking always on (adaptive-only), no sampling', () => {
    it('accepts adaptive thinking + output_config effort (incl. xhigh) + base options', () => {
      chat({
        adapter: anthropicText('claude-fable-5'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          thinking: { type: 'adaptive', display: 'summarized' },
          output_config: { effort: 'xhigh' },
          service_tier: 'auto',
          stop_sequences: ['STOP'],
          tool_choice: { type: 'auto' },
          max_tokens: 2048,
        },
      })
    })

    it('rejects explicit thinking opt-out (400 on claude-fable-5)', () => {
      chat({
        adapter: anthropicText('claude-fable-5'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - thinking cannot be disabled on claude-fable-5
          thinking: { type: 'disabled' },
        },
      })
    })

    it('rejects manual `budget_tokens` thinking', () => {
      chat({
        adapter: anthropicText('claude-fable-5'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - budget_tokens thinking returns a 400 on claude-fable-5
          thinking: { type: 'enabled', budget_tokens: 2048 },
        },
      })
    })

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

describe('Anthropic provider options shape assertions', () => {
  describe('claude-opus-4-6 — full feature set', () => {
    type Options = AnthropicChatModelProviderOptionsByName['claude-opus-4-6']

    it('has thinking', () => {
      expectTypeOf<Options>().toHaveProperty('thinking')
    })
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
  })

  describe('claude-sonnet-5 — adaptive thinking without sampling', () => {
    type Options = AnthropicChatModelProviderOptionsByName['claude-sonnet-5']

    it('has thinking and output_config', () => {
      expectTypeOf<Options>().toHaveProperty('thinking')
      expectTypeOf<Options>().toHaveProperty('output_config')
    })
    it('has max_tokens but NOT temperature/top_p/top_k', () => {
      expectTypeOf<Options>().toHaveProperty('max_tokens')
      expectTypeOf<Options>().not.toHaveProperty('temperature')
      expectTypeOf<Options>().not.toHaveProperty('top_p')
      expectTypeOf<Options>().not.toHaveProperty('top_k')
    })
  })

  describe('claude-fable-5 — adaptive-only thinking without sampling', () => {
    type Options = AnthropicChatModelProviderOptionsByName['claude-fable-5']

    it('has thinking and output_config', () => {
      expectTypeOf<Options>().toHaveProperty('thinking')
      expectTypeOf<Options>().toHaveProperty('output_config')
    })
    it('thinking accepts only the adaptive shape', () => {
      expectTypeOf<
        NonNullable<Options['thinking']>['type']
      >().toEqualTypeOf<'adaptive'>()
    })
    it('has max_tokens but NOT temperature/top_p/top_k', () => {
      expectTypeOf<Options>().toHaveProperty('max_tokens')
      expectTypeOf<Options>().not.toHaveProperty('temperature')
      expectTypeOf<Options>().not.toHaveProperty('top_p')
      expectTypeOf<Options>().not.toHaveProperty('top_k')
    })
  })
})
