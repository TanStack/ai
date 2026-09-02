import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  ANTHROPIC_DEFAULT_MAX_OUTPUT_TOKENS,
  ANTHROPIC_MAX_NONSTREAMING_TOKENS,
  ANTHROPIC_MODELS,
  getAnthropicDefaultMaxTokens,
} from '../src/model-meta'
import type {
  AnthropicChatModelProviderOptionsByName,
  AnthropicModelInputModalitiesByName,
} from '../src/model-meta'
import type { AnthropicMessageMetadataByModality } from '../src/message-types'
import type {
  AnthropicAdaptiveOnlyThinkingOptions,
  AnthropicAdaptiveOrDisabledThinkingOptions,
  AnthropicAdaptiveThinkingOptions,
  AnthropicContainerOptions,
  AnthropicContextManagementOptions,
  AnthropicMCPOptions,
  AnthropicOutputConfigOptions,
  AnthropicSamplingOptions,
  AnthropicServiceTierOptions,
  AnthropicStopSequencesOptions,
  AnthropicThinkingOptions,
  AnthropicToolChoiceOptions,
} from '../src/text/text-provider-options'
import type {
  AudioPart,
  ConstrainedModelMessage,
  DocumentPart,
  ImagePart,
  Modality,
  TextPart,
  VideoPart,
} from '@tanstack/ai'

/**
 * Helper type to construct InputModalitiesTypes from modalities array and metadata.
 * This is used to properly type ConstrainedModelMessage in tests.
 */
type MakeInputModalitiesTypes<TModalities extends ReadonlyArray<Modality>> = {
  inputModalities: TModalities
  messageMetadataByModality: AnthropicMessageMetadataByModality
}

/**
 * Type assertion tests for Anthropic model provider options.
 *
 * These tests verify that:
 * 1. Pre-4.6 models expose budget-based extended thinking + sampling options
 * 2. 4.6-generation models additionally expose the adaptive thinking shape
 * 3. Opus 4.7/4.8 and the 5-generation models expose ONLY adaptive-era
 *    options (no budget_tokens, no sampling parameters)
 * 4. All models have base options (container, context management, MCP,
 *    stop sequences, tool choice) and the provider-options map covers
 *    every registered model
 */

// Base options that ALL chat models should have (sampling excluded — the
// 4.7+/5-generation models reject the sampling parameters).
type BaseOptions = AnthropicContainerOptions &
  AnthropicContextManagementOptions &
  AnthropicMCPOptions &
  AnthropicStopSequencesOptions &
  AnthropicToolChoiceOptions

type BudgetThinkingModel =
  | 'claude-opus-4-5'
  | 'claude-sonnet-4-5'
  | 'claude-haiku-4-5'
  | 'claude-opus-4-1'

type AdaptiveEraModel =
  | 'claude-opus-4-7'
  | 'claude-opus-4-8'
  | 'claude-sonnet-5'

describe('Anthropic Model Provider Options Type Assertions', () => {
  describe('Pre-4.6 models — budget-based extended thinking + sampling', () => {
    it('expose thinking, service_tier, sampling, and base options', () => {
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName[BudgetThinkingModel]
      >().toExtend<AnthropicThinkingOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName[BudgetThinkingModel]
      >().toExtend<AnthropicServiceTierOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName[BudgetThinkingModel]
      >().toExtend<AnthropicSamplingOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName[BudgetThinkingModel]
      >().toExtend<BaseOptions>()
    })

    it('expose the individual base properties', () => {
      type Options = AnthropicChatModelProviderOptionsByName['claude-opus-4-5']
      expectTypeOf<Options>().toHaveProperty('thinking')
      expectTypeOf<Options>().toHaveProperty('service_tier')
      expectTypeOf<Options>().toHaveProperty('container')
      expectTypeOf<Options>().toHaveProperty('context_management')
      expectTypeOf<Options>().toHaveProperty('mcp_servers')
      expectTypeOf<Options>().toHaveProperty('stop_sequences')
      expectTypeOf<Options>().toHaveProperty('tool_choice')
      expectTypeOf<Options>().toHaveProperty('top_k')
    })
  })

  describe('4.6-generation models — adaptive + deprecated budget thinking', () => {
    it('claude-opus-4-6 exposes the adaptive thinking union and sampling', () => {
      type Options = AnthropicChatModelProviderOptionsByName['claude-opus-4-6']
      expectTypeOf<Options>().toExtend<AnthropicAdaptiveThinkingOptions>()
      expectTypeOf<Options>().toExtend<AnthropicServiceTierOptions>()
      expectTypeOf<Options>().toExtend<AnthropicSamplingOptions>()
      expectTypeOf<Options>().toExtend<BaseOptions>()
    })

    it('claude-sonnet-4-6 exposes the adaptive thinking union and sampling', () => {
      type Options =
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4-6']
      expectTypeOf<Options>().toExtend<AnthropicAdaptiveThinkingOptions>()
      expectTypeOf<Options>().toExtend<AnthropicServiceTierOptions>()
      expectTypeOf<Options>().toExtend<AnthropicSamplingOptions>()
      expectTypeOf<Options>().toExtend<BaseOptions>()
    })
  })

  describe('Adaptive-era models (Opus 4.7/4.8, Sonnet 5) — no budget thinking, no sampling', () => {
    it('expose adaptive-or-disabled thinking, output_config, and base options', () => {
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName[AdaptiveEraModel]
      >().toExtend<AnthropicAdaptiveOrDisabledThinkingOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName[AdaptiveEraModel]
      >().toExtend<AnthropicOutputConfigOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName[AdaptiveEraModel]
      >().toExtend<BaseOptions>()
    })

    it('have max_tokens but NOT temperature/top_p/top_k', () => {
      type Options = AnthropicChatModelProviderOptionsByName[AdaptiveEraModel]
      expectTypeOf<Options>().toHaveProperty('max_tokens')
      expectTypeOf<Options>().not.toHaveProperty('temperature')
      expectTypeOf<Options>().not.toHaveProperty('top_p')
      expectTypeOf<Options>().not.toHaveProperty('top_k')
    })
  })

  describe('claude-fable-5 — thinking always on (adaptive-only)', () => {
    type Options = AnthropicChatModelProviderOptionsByName['claude-fable-5']

    it('exposes adaptive-only thinking, output_config, and base options', () => {
      expectTypeOf<Options>().toExtend<AnthropicAdaptiveOnlyThinkingOptions>()
      expectTypeOf<Options>().toExtend<AnthropicOutputConfigOptions>()
      expectTypeOf<Options>().toExtend<BaseOptions>()
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

  describe('Provider options type completeness', () => {
    it('AnthropicChatModelProviderOptionsByName should have entries for all chat models', () => {
      type Keys = keyof AnthropicChatModelProviderOptionsByName

      expectTypeOf<'claude-opus-4-6'>().toExtend<Keys>()
      expectTypeOf<'claude-opus-4-5'>().toExtend<Keys>()
      expectTypeOf<'claude-sonnet-4-6'>().toExtend<Keys>()
      expectTypeOf<'claude-sonnet-4-5'>().toExtend<Keys>()
      expectTypeOf<'claude-haiku-4-5'>().toExtend<Keys>()
      expectTypeOf<'claude-opus-4-1'>().toExtend<Keys>()
      expectTypeOf<'claude-opus-4-7'>().toExtend<Keys>()
      expectTypeOf<'claude-opus-4-8'>().toExtend<Keys>()
      expectTypeOf<'claude-fable-5'>().toExtend<Keys>()
      expectTypeOf<'claude-sonnet-5'>().toExtend<Keys>()
    })
  })
})

/**
 * Anthropic Model Input Modality Type Assertions
 *
 * These tests verify that ConstrainedModelMessage correctly restricts
 * content parts based on each Anthropic model's supported input modalities.
 *
 * All Claude models support: text, image, document
 * No Claude models support: audio, video
 */
describe('Anthropic Model Input Modality Type Assertions', () => {
  // Helper type for creating a user message with specific content.
  // Uses provider-specific metadata so that ConstrainedModelMessage extension
  // checks succeed for the modalities this provider supports.
  type AnthropicTextPart = TextPart<AnthropicMessageMetadataByModality['text']>
  type AnthropicImagePart = ImagePart<
    AnthropicMessageMetadataByModality['image']
  >
  type AnthropicAudioPart = AudioPart<
    AnthropicMessageMetadataByModality['audio']
  >
  type AnthropicVideoPart = VideoPart<
    AnthropicMessageMetadataByModality['video']
  >
  type AnthropicDocumentPart = DocumentPart<
    AnthropicMessageMetadataByModality['document']
  >
  type MessageWithContent<T> = { role: 'user'; content: Array<T> }

  it('every registered model supports text, image, and document input', () => {
    expectTypeOf<
      AnthropicModelInputModalitiesByName[keyof AnthropicModelInputModalitiesByName][number]
    >().toEqualTypeOf<'text' | 'image' | 'document'>()
  })

  describe('Claude Fable 5 (text + image + document)', () => {
    type Modalities = AnthropicModelInputModalitiesByName['claude-fable-5']
    type Message = ConstrainedModelMessage<MakeInputModalitiesTypes<Modalities>>

    it('should allow TextPart, ImagePart, and DocumentPart', () => {
      expectTypeOf<MessageWithContent<AnthropicTextPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<AnthropicImagePart>>().toExtend<Message>()
      expectTypeOf<
        MessageWithContent<AnthropicDocumentPart>
      >().toExtend<Message>()
    })

    it('should NOT allow AudioPart or VideoPart', () => {
      expectTypeOf<
        MessageWithContent<AnthropicAudioPart>
      >().not.toExtend<Message>()
      expectTypeOf<
        MessageWithContent<AnthropicVideoPart>
      >().not.toExtend<Message>()
    })
  })

  describe('Claude Sonnet 5 (text + image + document)', () => {
    type Modalities = AnthropicModelInputModalitiesByName['claude-sonnet-5']
    type Message = ConstrainedModelMessage<MakeInputModalitiesTypes<Modalities>>

    it('should allow TextPart, ImagePart, and DocumentPart', () => {
      expectTypeOf<MessageWithContent<AnthropicTextPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<AnthropicImagePart>>().toExtend<Message>()
      expectTypeOf<
        MessageWithContent<AnthropicDocumentPart>
      >().toExtend<Message>()
    })

    it('should NOT allow AudioPart or VideoPart', () => {
      expectTypeOf<
        MessageWithContent<AnthropicAudioPart>
      >().not.toExtend<Message>()
      expectTypeOf<
        MessageWithContent<AnthropicVideoPart>
      >().not.toExtend<Message>()
    })
  })

  describe('Claude Opus 4.8 (text + image + document)', () => {
    type Modalities = AnthropicModelInputModalitiesByName['claude-opus-4-8']
    type Message = ConstrainedModelMessage<MakeInputModalitiesTypes<Modalities>>

    it('should allow TextPart, ImagePart, and DocumentPart', () => {
      expectTypeOf<MessageWithContent<AnthropicTextPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<AnthropicImagePart>>().toExtend<Message>()
      expectTypeOf<
        MessageWithContent<AnthropicDocumentPart>
      >().toExtend<Message>()
    })

    it('should NOT allow AudioPart or VideoPart', () => {
      expectTypeOf<
        MessageWithContent<AnthropicAudioPart>
      >().not.toExtend<Message>()
      expectTypeOf<
        MessageWithContent<AnthropicVideoPart>
      >().not.toExtend<Message>()
    })
  })

  describe('Claude Sonnet 4.6 (text + image + document)', () => {
    type Modalities = AnthropicModelInputModalitiesByName['claude-sonnet-4-6']
    type Message = ConstrainedModelMessage<MakeInputModalitiesTypes<Modalities>>

    it('should allow TextPart, ImagePart, and DocumentPart', () => {
      expectTypeOf<MessageWithContent<AnthropicTextPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<AnthropicImagePart>>().toExtend<Message>()
      expectTypeOf<
        MessageWithContent<AnthropicDocumentPart>
      >().toExtend<Message>()
    })

    it('should NOT allow AudioPart or VideoPart', () => {
      expectTypeOf<
        MessageWithContent<AnthropicAudioPart>
      >().not.toExtend<Message>()
      expectTypeOf<
        MessageWithContent<AnthropicVideoPart>
      >().not.toExtend<Message>()
    })
  })

  describe('Claude Haiku 4.5 (text + image + document)', () => {
    type Modalities = AnthropicModelInputModalitiesByName['claude-haiku-4-5']
    type Message = ConstrainedModelMessage<MakeInputModalitiesTypes<Modalities>>

    it('should allow TextPart, ImagePart, and DocumentPart', () => {
      expectTypeOf<MessageWithContent<AnthropicTextPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<AnthropicImagePart>>().toExtend<Message>()
      expectTypeOf<
        MessageWithContent<AnthropicDocumentPart>
      >().toExtend<Message>()
    })

    it('should NOT allow AudioPart or VideoPart', () => {
      expectTypeOf<
        MessageWithContent<AnthropicAudioPart>
      >().not.toExtend<Message>()
      expectTypeOf<
        MessageWithContent<AnthropicVideoPart>
      >().not.toExtend<Message>()
    })
  })
})

describe('getAnthropicDefaultMaxTokens (#849)', () => {
  it("returns the model's max_output_tokens for known models", () => {
    expect(getAnthropicDefaultMaxTokens('claude-opus-4-8')).toBe(128_000)
    expect(getAnthropicDefaultMaxTokens('claude-opus-4-6')).toBe(128_000)
    expect(getAnthropicDefaultMaxTokens('claude-sonnet-4-6')).toBe(64_000)
    expect(getAnthropicDefaultMaxTokens('claude-sonnet-4-5')).toBe(64_000)
    expect(getAnthropicDefaultMaxTokens('claude-opus-4-5')).toBe(32_000)
  })

  it('falls back to the safe constant for unknown models', () => {
    expect(ANTHROPIC_DEFAULT_MAX_OUTPUT_TOKENS).toBe(64_000)
    expect(getAnthropicDefaultMaxTokens('some-future-claude-model')).toBe(
      ANTHROPIC_DEFAULT_MAX_OUTPUT_TOKENS,
    )
  })

  it('never returns the old hard-coded 1024 floor for a known model', () => {
    expect(getAnthropicDefaultMaxTokens('claude-opus-4-8')).toBeGreaterThan(
      1024,
    )
  })

  it('clamps the default to the non-streaming limit for non-streaming requests (#849)', () => {
    // The Anthropic SDK refuses non-streaming requests whose `max_tokens`
    // could exceed its 10-minute timeout (~21_333). The streaming path keeps
    // the full ceiling; the non-streaming (`structuredOutput`) path must clamp.
    expect(ANTHROPIC_MAX_NONSTREAMING_TOKENS).toBeLessThanOrEqual(21_333)

    // Opus 128K and Sonnet 64K both exceed the non-streaming limit → clamped.
    expect(
      getAnthropicDefaultMaxTokens('claude-opus-4-8', { stream: false }),
    ).toBe(ANTHROPIC_MAX_NONSTREAMING_TOKENS)
    expect(
      getAnthropicDefaultMaxTokens('claude-sonnet-4-6', { stream: false }),
    ).toBe(ANTHROPIC_MAX_NONSTREAMING_TOKENS)
    // Unknown model fallback (64K) is also above the limit → clamped.
    expect(
      getAnthropicDefaultMaxTokens('some-future-claude-model', {
        stream: false,
      }),
    ).toBe(ANTHROPIC_MAX_NONSTREAMING_TOKENS)
  })

  it('clamps every current model on the non-streaming path (#849)', () => {
    // Every model in today's lineup has a ceiling (32K–128K) above the
    // non-streaming limit, so all of them clamp. (The clamp is a Math.min, so
    // a future sub-21K model would keep its real ceiling instead.)
    for (const model of ANTHROPIC_MODELS) {
      expect(getAnthropicDefaultMaxTokens(model, { stream: false })).toBe(
        ANTHROPIC_MAX_NONSTREAMING_TOKENS,
      )
    }
  })

  it('keeps the full ceiling for streaming requests (default) (#849)', () => {
    expect(
      getAnthropicDefaultMaxTokens('claude-opus-4-8', { stream: true }),
    ).toBe(128_000)
    // Omitting the option defaults to streaming.
    expect(getAnthropicDefaultMaxTokens('claude-opus-4-8')).toBe(128_000)
  })
})
