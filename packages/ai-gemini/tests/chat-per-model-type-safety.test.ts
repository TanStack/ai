/**
 * Per-model type-safety tests for Gemini chat() modelOptions.
 *
 * Positive cases: each supported (model, option) pair compiles cleanly.
 * Negative cases: each unsupported option produces a `@ts-expect-error`.
 *
 * Companion to `tools-per-model-type-safety.test.ts` which covers the
 * `tools` array; this file covers `modelOptions`. Compile-time only.
 */
import { beforeAll, describe, expectTypeOf, it } from 'vitest'
import { chat } from '@tanstack/ai'
import { geminiText } from '../src'
import type { GeminiChatModelProviderOptionsByName } from '../src'

// Set a dummy API key so adapter construction does not throw at runtime.
// These tests only exercise compile-time type gating; no network calls are made.
beforeAll(() => {
  process.env['GOOGLE_API_KEY'] = 'sk-test-dummy'
})

describe('Gemini per-model chat modelOptions gating', () => {
  describe('gemini-3.1-pro-preview — full superset (advanced thinking + structured output)', () => {
    it('accepts every option group', () => {
      chat({
        adapter: geminiText('gemini-3.1-pro-preview'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          stopSequences: ['STOP'],
          topK: 5,
          seed: 42,
          presencePenalty: 0,
          frequencyPenalty: 0,
          responseLogprobs: false,
          cachedContent: 'cachedContents/abc',
          responseMimeType: 'application/json',
        },
      })
    })

    it('rejects thinkingConfig in modelOptions (chat({ reasoning }) owns it)', () => {
      chat({
        adapter: geminiText('gemini-3.1-pro-preview'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - thinking is set with `reasoning`
          thinkingConfig: { includeThoughts: true },
        },
      })
    })

    it('rejects unknown options', () => {
      chat({
        adapter: geminiText('gemini-3.1-pro-preview'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - 'unknownOption' does not exist
          unknownOption: true,
        },
      })
    })
  })

  describe('gemini-3.1-flash-lite-preview — structured output', () => {
    it('accepts structured-output schema', () => {
      chat({
        adapter: geminiText('gemini-3.1-flash-lite-preview'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          responseMimeType: 'application/json',
        },
      })
    })
  })

  describe('gemini-3.1-flash-lite — stable id, structured output', () => {
    it('accepts base + structured-output options', () => {
      chat({
        adapter: geminiText('gemini-3.1-flash-lite'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          stopSequences: ['STOP'],
          topK: 5,
          cachedContent: 'cachedContents/abc',
          responseMimeType: 'application/json',
        },
      })
    })
  })

  describe('cachedContent type safety', () => {
    it('rejects cachedContent without the required prefix', () => {
      chat({
        adapter: geminiText('gemini-2.5-pro'),
        messages: [{ role: 'user', content: 'hi' }],
        modelOptions: {
          // @ts-expect-error - cachedContent must use the `cachedContents/{name}` template
          cachedContent: 'not-a-cached-content-handle',
        },
      })
    })
  })

  describe('reasoning gating', () => {
    it('Gemini 3 models take their thinking levels, with no budget', () => {
      chat({
        adapter: geminiText('gemini-3.1-pro-preview'),
        messages: [{ role: 'user', content: 'hi' }],
        reasoning: 'high',
      })
      chat({
        adapter: geminiText('gemini-3.1-pro-preview'),
        messages: [{ role: 'user', content: 'hi' }],
        // @ts-expect-error - gemini-3.1-pro-preview has no minimal level
        reasoning: 'minimal',
      })
      chat({
        adapter: geminiText('gemini-3.1-pro-preview'),
        messages: [{ role: 'user', content: 'hi' }],
        // @ts-expect-error - gemini-3.1-pro-preview takes no token budget
        reasoning: { level: 'low', budgetTokens: 1024 },
      })
    })

    it('Gemini 2.5 models take off and a token budget', () => {
      chat({
        adapter: geminiText('gemini-2.5-pro'),
        messages: [{ role: 'user', content: 'hi' }],
        reasoning: { level: 'medium', budgetTokens: 4096 },
      })
      chat({
        adapter: geminiText('gemini-2.5-flash'),
        messages: [{ role: 'user', content: 'hi' }],
        reasoning: 'off',
      })
    })
  })

  describe('Model name type safety', () => {
    it('rejects unknown model names at the factory', () => {
      // @ts-expect-error - 'gemini-fake-9000' is not a valid Gemini chat model
      geminiText('gemini-fake-9000')
    })

    it('rejects retired model ids at the factory', () => {
      // @ts-expect-error - 'gemini-3-pro-preview' was retired by Google
      geminiText('gemini-3-pro-preview')
      // @ts-expect-error - 'gemini-2.0-flash' was retired by Google
      geminiText('gemini-2.0-flash')
      // @ts-expect-error - 'gemini-2.0-flash-lite' was retired by Google
      geminiText('gemini-2.0-flash-lite')
    })
  })
})

describe('Gemini provider options shape assertions', () => {
  describe('gemini-3.1-pro-preview — full feature set', () => {
    type Options =
      GeminiChatModelProviderOptionsByName['gemini-3.1-pro-preview']

    it('has no thinkingConfig', () => {
      expectTypeOf<Options>().not.toHaveProperty('thinkingConfig')
    })
    it('has responseMimeType (structured output)', () => {
      expectTypeOf<Options>().toHaveProperty('responseMimeType')
    })
    it('has toolConfig', () => {
      expectTypeOf<Options>().toHaveProperty('toolConfig')
    })
    it('has safetySettings', () => {
      expectTypeOf<Options>().toHaveProperty('safetySettings')
    })
    it('has cachedContent', () => {
      expectTypeOf<Options>().toHaveProperty('cachedContent')
    })
    it('has stopSequences', () => {
      expectTypeOf<Options>().toHaveProperty('stopSequences')
    })
  })

  describe('gemini-3.1-flash-lite-preview — structured output', () => {
    type Options =
      GeminiChatModelProviderOptionsByName['gemini-3.1-flash-lite-preview']

    it('has no thinkingConfig', () => {
      expectTypeOf<Options>().not.toHaveProperty('thinkingConfig')
    })
    it('has responseMimeType', () => {
      expectTypeOf<Options>().toHaveProperty('responseMimeType')
    })
  })

  describe('gemini-3.1-flash-lite — stable id mirrors the preview feature set', () => {
    type Options = GeminiChatModelProviderOptionsByName['gemini-3.1-flash-lite']

    it('has no thinkingConfig', () => {
      expectTypeOf<Options>().not.toHaveProperty('thinkingConfig')
    })
    it('has responseMimeType (structured output)', () => {
      expectTypeOf<Options>().toHaveProperty('responseMimeType')
    })
    it('has toolConfig', () => {
      expectTypeOf<Options>().toHaveProperty('toolConfig')
    })
    it('has cachedContent', () => {
      expectTypeOf<Options>().toHaveProperty('cachedContent')
    })
  })
})
