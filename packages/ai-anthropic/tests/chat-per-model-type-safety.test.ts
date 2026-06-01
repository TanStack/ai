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

  describe('claude-3-5-haiku — priority tier WITHOUT extended thinking', () => {
    it('accepts service_tier + tool_choice + stop_sequences', () => {
      chat({
        adapter: anthropicText('claude-3-5-haiku'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          service_tier: 'auto',
          tool_choice: { type: 'auto' },
          stop_sequences: ['STOP'],
          top_k: 5,
        },
      })
    })

    it('rejects extended `thinking` option', () => {
      chat({
        adapter: anthropicText('claude-3-5-haiku'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - 'thinking' is not available on claude-3-5-haiku
          thinking: { type: 'enabled', budget_tokens: 1024 },
        },
      })
    })
  })

  describe('claude-3-haiku — neither thinking nor priority tier', () => {
    it('accepts base options (container, mcp_servers, stop_sequences, tool_choice, top_k)', () => {
      chat({
        adapter: anthropicText('claude-3-haiku'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          container: null,
          mcp_servers: [],
          stop_sequences: ['STOP'],
          tool_choice: { type: 'auto' },
          top_k: 5,
        },
      })
    })

    it('rejects extended `thinking` option', () => {
      chat({
        adapter: anthropicText('claude-3-haiku'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - 'thinking' is not available on claude-3-haiku
          thinking: { type: 'enabled', budget_tokens: 1024 },
        },
      })
    })

    it('rejects `service_tier` option', () => {
      chat({
        adapter: anthropicText('claude-3-haiku'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - 'service_tier' is not available on claude-3-haiku
          service_tier: 'auto',
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

  describe('claude-3-5-haiku — priority tier without thinking', () => {
    type Options = AnthropicChatModelProviderOptionsByName['claude-3-5-haiku']

    it('has service_tier', () => {
      expectTypeOf<Options>().toHaveProperty('service_tier')
    })
    it('has tool_choice', () => {
      expectTypeOf<Options>().toHaveProperty('tool_choice')
    })
    it('does NOT have thinking', () => {
      expectTypeOf<Options>().not.toHaveProperty('thinking')
    })
  })

  describe('claude-3-haiku — bare-bones', () => {
    type Options = AnthropicChatModelProviderOptionsByName['claude-3-haiku']

    it('has tool_choice', () => {
      expectTypeOf<Options>().toHaveProperty('tool_choice')
    })
    it('has stop_sequences', () => {
      expectTypeOf<Options>().toHaveProperty('stop_sequences')
    })
    it('does NOT have thinking', () => {
      expectTypeOf<Options>().not.toHaveProperty('thinking')
    })
    it('does NOT have service_tier', () => {
      expectTypeOf<Options>().not.toHaveProperty('service_tier')
    })
  })
})
