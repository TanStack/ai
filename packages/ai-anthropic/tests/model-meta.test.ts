import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  ANTHROPIC_DEFAULT_MAX_OUTPUT_TOKENS,
  ANTHROPIC_MAX_NONSTREAMING_TOKENS,
  getAnthropicDefaultMaxTokens,
} from '../src/model-meta'
import type {
  AnthropicChatModelProviderOptionsByName,
  AnthropicModelInputModalitiesByName,
} from '../src/model-meta'
import type { AnthropicMessageMetadataByModality } from '../src/message-types'
import type {
  AnthropicContainerOptions,
  AnthropicContextManagementOptions,
  AnthropicMCPOptions,
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
 * 1. Models with extended_thinking support have AnthropicThinkingOptions in their provider options
 * 2. Models without extended_thinking support do NOT have AnthropicThinkingOptions
 * 3. Models with priority_tier support have AnthropicServiceTierOptions in their provider options
 * 4. Models without priority_tier support do NOT have AnthropicServiceTierOptions
 * 5. All models have base options (container, context management, MCP, stop sequences, tool choice, sampling)
 */

// Base options that ALL chat models should have
type BaseOptions = AnthropicContainerOptions &
  AnthropicContextManagementOptions &
  AnthropicMCPOptions &
  AnthropicStopSequencesOptions &
  AnthropicToolChoiceOptions &
  AnthropicSamplingOptions

describe('Anthropic Model Provider Options Type Assertions', () => {
  describe('Models WITH extended_thinking support', () => {
    it('claude-sonnet-4-6 should support thinking options', () => {
      type Options =
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4-6']

      // Should have thinking options
      expectTypeOf<Options>().toExtend<AnthropicThinkingOptions>()

      // Should have service tier options (priority_tier support)
      expectTypeOf<Options>().toExtend<AnthropicServiceTierOptions>()

      // Should have base options
      expectTypeOf<Options>().toExtend<BaseOptions>()

      // Verify specific properties exist
      expectTypeOf<Options>().toHaveProperty('thinking')
      expectTypeOf<Options>().toHaveProperty('service_tier')
      expectTypeOf<Options>().toHaveProperty('container')
      expectTypeOf<Options>().toHaveProperty('context_management')
      expectTypeOf<Options>().toHaveProperty('mcp_servers')
      expectTypeOf<Options>().toHaveProperty('stop_sequences')
      expectTypeOf<Options>().toHaveProperty('tool_choice')
      expectTypeOf<Options>().toHaveProperty('top_k')
    })

    it('claude-sonnet-4-5 should support thinking options', () => {
      type Options =
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4-5']

      // Should have thinking options
      expectTypeOf<Options>().toExtend<AnthropicThinkingOptions>()

      // Should have service tier options (priority_tier support)
      expectTypeOf<Options>().toExtend<AnthropicServiceTierOptions>()

      // Should have base options
      expectTypeOf<Options>().toExtend<BaseOptions>()

      // Verify specific properties exist
      expectTypeOf<Options>().toHaveProperty('thinking')
      expectTypeOf<Options>().toHaveProperty('service_tier')
      expectTypeOf<Options>().toHaveProperty('container')
      expectTypeOf<Options>().toHaveProperty('context_management')
      expectTypeOf<Options>().toHaveProperty('mcp_servers')
      expectTypeOf<Options>().toHaveProperty('stop_sequences')
      expectTypeOf<Options>().toHaveProperty('tool_choice')
      expectTypeOf<Options>().toHaveProperty('top_k')
    })

    it('claude-haiku-4-5 should support thinking options', () => {
      type Options = AnthropicChatModelProviderOptionsByName['claude-haiku-4-5']

      expectTypeOf<Options>().toExtend<AnthropicThinkingOptions>()
      expectTypeOf<Options>().toExtend<AnthropicServiceTierOptions>()
      expectTypeOf<Options>().toExtend<BaseOptions>()
    })

    it('claude-opus-4-1 should support thinking options', () => {
      type Options = AnthropicChatModelProviderOptionsByName['claude-opus-4-1']

      expectTypeOf<Options>().toExtend<AnthropicThinkingOptions>()
      expectTypeOf<Options>().toExtend<AnthropicServiceTierOptions>()
      expectTypeOf<Options>().toExtend<BaseOptions>()
    })

    it('claude-sonnet-4 should support thinking options', () => {
      type Options = AnthropicChatModelProviderOptionsByName['claude-sonnet-4']

      expectTypeOf<Options>().toExtend<AnthropicThinkingOptions>()
      expectTypeOf<Options>().toExtend<AnthropicServiceTierOptions>()
      expectTypeOf<Options>().toExtend<BaseOptions>()
    })

    it('claude-3-7-sonnet should support thinking options', () => {
      type Options =
        AnthropicChatModelProviderOptionsByName['claude-3-7-sonnet']

      expectTypeOf<Options>().toExtend<AnthropicThinkingOptions>()
      expectTypeOf<Options>().toExtend<AnthropicServiceTierOptions>()
      expectTypeOf<Options>().toExtend<BaseOptions>()
    })

    it('claude-opus-4 should support thinking options', () => {
      type Options = AnthropicChatModelProviderOptionsByName['claude-opus-4']

      expectTypeOf<Options>().toExtend<AnthropicThinkingOptions>()
      expectTypeOf<Options>().toExtend<AnthropicServiceTierOptions>()
      expectTypeOf<Options>().toExtend<BaseOptions>()
    })

    it('claude-opus-4-5 should support thinking options', () => {
      type Options = AnthropicChatModelProviderOptionsByName['claude-opus-4-5']

      expectTypeOf<Options>().toExtend<AnthropicThinkingOptions>()
      expectTypeOf<Options>().toExtend<AnthropicServiceTierOptions>()
      expectTypeOf<Options>().toExtend<BaseOptions>()

      // Verify specific properties exist
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

  describe('Models WITHOUT extended_thinking support', () => {
    it('claude-3-5-haiku should NOT have thinking options but SHOULD have service tier', () => {
      type Options = AnthropicChatModelProviderOptionsByName['claude-3-5-haiku']

      // Should NOT have thinking options
      expectTypeOf<Options>().not.toExtend<AnthropicThinkingOptions>()

      // Should have service tier options (priority_tier support)
      expectTypeOf<Options>().toExtend<AnthropicServiceTierOptions>()

      // Should have base options
      expectTypeOf<Options>().toExtend<BaseOptions>()

      // Verify service_tier exists but thinking does not
      expectTypeOf<Options>().toHaveProperty('service_tier')
      expectTypeOf<Options>().toHaveProperty('container')
      expectTypeOf<Options>().toHaveProperty('context_management')
      expectTypeOf<Options>().toHaveProperty('mcp_servers')
      expectTypeOf<Options>().toHaveProperty('stop_sequences')
      expectTypeOf<Options>().toHaveProperty('tool_choice')
      expectTypeOf<Options>().toHaveProperty('top_k')
    })

    it('claude-3-haiku should NOT have thinking options AND NOT have service tier', () => {
      type Options = AnthropicChatModelProviderOptionsByName['claude-3-haiku']

      // Should NOT have thinking options
      expectTypeOf<Options>().not.toExtend<AnthropicThinkingOptions>()

      // Should NOT have service tier options (no priority_tier support)
      expectTypeOf<Options>().not.toExtend<AnthropicServiceTierOptions>()

      // Should have base options
      expectTypeOf<Options>().toExtend<BaseOptions>()

      // Verify base properties exist
      expectTypeOf<Options>().toHaveProperty('container')
      expectTypeOf<Options>().toHaveProperty('context_management')
      expectTypeOf<Options>().toHaveProperty('mcp_servers')
      expectTypeOf<Options>().toHaveProperty('stop_sequences')
      expectTypeOf<Options>().toHaveProperty('tool_choice')
      expectTypeOf<Options>().toHaveProperty('top_k')
    })
  })

  describe('Provider options type completeness', () => {
    it('AnthropicChatModelProviderOptionsByName should have entries for all chat models', () => {
      type Keys = keyof AnthropicChatModelProviderOptionsByName

      expectTypeOf<'claude-opus-4-5'>().toExtend<Keys>()
      expectTypeOf<'claude-sonnet-4-6'>().toExtend<Keys>()
      expectTypeOf<'claude-sonnet-4-5'>().toExtend<Keys>()
      expectTypeOf<'claude-haiku-4-5'>().toExtend<Keys>()
      expectTypeOf<'claude-opus-4-1'>().toExtend<Keys>()
      expectTypeOf<'claude-sonnet-4'>().toExtend<Keys>()
      expectTypeOf<'claude-3-7-sonnet'>().toExtend<Keys>()
      expectTypeOf<'claude-opus-4'>().toExtend<Keys>()
      expectTypeOf<'claude-3-5-haiku'>().toExtend<Keys>()
      expectTypeOf<'claude-3-haiku'>().toExtend<Keys>()
    })
  })

  describe('Detailed property type assertions', () => {
    it('all models should have container options', () => {
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-5']
      >().toHaveProperty('container')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4-6']
      >().toHaveProperty('container')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4-5']
      >().toHaveProperty('container')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-haiku-4-5']
      >().toHaveProperty('container')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-1']
      >().toHaveProperty('container')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4']
      >().toHaveProperty('container')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-7-sonnet']
      >().toHaveProperty('container')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4']
      >().toHaveProperty('container')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-5-haiku']
      >().toHaveProperty('container')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-haiku']
      >().toHaveProperty('container')
    })

    it('all models should have context management options', () => {
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-5']
      >().toHaveProperty('context_management')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4-6']
      >().toHaveProperty('context_management')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4-5']
      >().toHaveProperty('context_management')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-haiku-4-5']
      >().toHaveProperty('context_management')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-1']
      >().toHaveProperty('context_management')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4']
      >().toHaveProperty('context_management')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-7-sonnet']
      >().toHaveProperty('context_management')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4']
      >().toHaveProperty('context_management')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-5-haiku']
      >().toHaveProperty('context_management')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-haiku']
      >().toHaveProperty('context_management')
    })

    it('all models should have MCP options', () => {
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-5']
      >().toHaveProperty('mcp_servers')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4-6']
      >().toHaveProperty('mcp_servers')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4-5']
      >().toHaveProperty('mcp_servers')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-haiku-4-5']
      >().toHaveProperty('mcp_servers')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-1']
      >().toHaveProperty('mcp_servers')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4']
      >().toHaveProperty('mcp_servers')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-7-sonnet']
      >().toHaveProperty('mcp_servers')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4']
      >().toHaveProperty('mcp_servers')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-5-haiku']
      >().toHaveProperty('mcp_servers')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-haiku']
      >().toHaveProperty('mcp_servers')
    })

    it('all models should have stop sequences options', () => {
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-5']
      >().toHaveProperty('stop_sequences')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4-6']
      >().toHaveProperty('stop_sequences')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4-5']
      >().toHaveProperty('stop_sequences')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-haiku-4-5']
      >().toHaveProperty('stop_sequences')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-1']
      >().toHaveProperty('stop_sequences')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4']
      >().toHaveProperty('stop_sequences')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-7-sonnet']
      >().toHaveProperty('stop_sequences')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4']
      >().toHaveProperty('stop_sequences')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-5-haiku']
      >().toHaveProperty('stop_sequences')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-haiku']
      >().toHaveProperty('stop_sequences')
    })

    it('all models should have tool choice options', () => {
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-5']
      >().toHaveProperty('tool_choice')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4-6']
      >().toHaveProperty('tool_choice')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4-5']
      >().toHaveProperty('tool_choice')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-haiku-4-5']
      >().toHaveProperty('tool_choice')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-1']
      >().toHaveProperty('tool_choice')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4']
      >().toHaveProperty('tool_choice')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-7-sonnet']
      >().toHaveProperty('tool_choice')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4']
      >().toHaveProperty('tool_choice')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-5-haiku']
      >().toHaveProperty('tool_choice')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-haiku']
      >().toHaveProperty('tool_choice')
    })

    it('all models should have sampling options (top_k)', () => {
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-5']
      >().toHaveProperty('top_k')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4-6']
      >().toHaveProperty('top_k')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4-5']
      >().toHaveProperty('top_k')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-haiku-4-5']
      >().toHaveProperty('top_k')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-1']
      >().toHaveProperty('top_k')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4']
      >().toHaveProperty('top_k')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-7-sonnet']
      >().toHaveProperty('top_k')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4']
      >().toHaveProperty('top_k')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-5-haiku']
      >().toHaveProperty('top_k')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-haiku']
      >().toHaveProperty('top_k')
    })
  })

  describe('Type discrimination between model categories', () => {
    it('models with extended_thinking should extend AnthropicThinkingOptions', () => {
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-5']
      >().toExtend<AnthropicThinkingOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4-6']
      >().toExtend<AnthropicThinkingOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4-5']
      >().toExtend<AnthropicThinkingOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-haiku-4-5']
      >().toExtend<AnthropicThinkingOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-1']
      >().toExtend<AnthropicThinkingOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4']
      >().toExtend<AnthropicThinkingOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-7-sonnet']
      >().toExtend<AnthropicThinkingOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4']
      >().toExtend<AnthropicThinkingOptions>()
    })

    it('models without extended_thinking should NOT extend AnthropicThinkingOptions', () => {
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-5-haiku']
      >().not.toExtend<AnthropicThinkingOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-haiku']
      >().not.toExtend<AnthropicThinkingOptions>()
    })

    it('models with priority_tier should extend AnthropicServiceTierOptions', () => {
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-5']
      >().toExtend<AnthropicServiceTierOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4-6']
      >().toExtend<AnthropicServiceTierOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4-5']
      >().toExtend<AnthropicServiceTierOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-haiku-4-5']
      >().toExtend<AnthropicServiceTierOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-1']
      >().toExtend<AnthropicServiceTierOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4']
      >().toExtend<AnthropicServiceTierOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-7-sonnet']
      >().toExtend<AnthropicServiceTierOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4']
      >().toExtend<AnthropicServiceTierOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-5-haiku']
      >().toExtend<AnthropicServiceTierOptions>()
    })

    it('models without priority_tier should NOT extend AnthropicServiceTierOptions', () => {
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-haiku']
      >().not.toExtend<AnthropicServiceTierOptions>()
    })

    it('all models should extend base options', () => {
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-5']
      >().toExtend<BaseOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4-6']
      >().toExtend<BaseOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4-5']
      >().toExtend<BaseOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-haiku-4-5']
      >().toExtend<BaseOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-1']
      >().toExtend<BaseOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4']
      >().toExtend<BaseOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-7-sonnet']
      >().toExtend<BaseOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4']
      >().toExtend<BaseOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-5-haiku']
      >().toExtend<BaseOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-haiku']
      >().toExtend<BaseOptions>()
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

  describe('Claude Opus 4.5 (text + image + document)', () => {
    type Modalities = AnthropicModelInputModalitiesByName['claude-opus-4-5']
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

  describe('Claude Sonnet 4.5 (text + image + document)', () => {
    type Modalities = AnthropicModelInputModalitiesByName['claude-sonnet-4-5']
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

  describe('Claude Opus 4.1 (text + image + document)', () => {
    type Modalities = AnthropicModelInputModalitiesByName['claude-opus-4-1']
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

  describe('Claude Sonnet 4 (text + image + document)', () => {
    type Modalities = AnthropicModelInputModalitiesByName['claude-sonnet-4']
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

  describe('Claude 3.7 Sonnet (text + image + document)', () => {
    type Modalities = AnthropicModelInputModalitiesByName['claude-3-7-sonnet']
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

  describe('Claude Opus 4 (text + image + document)', () => {
    type Modalities = AnthropicModelInputModalitiesByName['claude-opus-4']
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

  describe('Claude 3.5 Haiku (text + image + document)', () => {
    type Modalities = AnthropicModelInputModalitiesByName['claude-3-5-haiku']
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

  describe('Claude 3 Haiku (text + image + document)', () => {
    type Modalities = AnthropicModelInputModalitiesByName['claude-3-haiku']
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
    expect(getAnthropicDefaultMaxTokens('claude-opus-4.8')).toBe(128_000)
    expect(getAnthropicDefaultMaxTokens('claude-opus-4-6')).toBe(128_000)
    expect(getAnthropicDefaultMaxTokens('claude-sonnet-4-6')).toBe(64_000)
    expect(getAnthropicDefaultMaxTokens('claude-3-7-sonnet')).toBe(64_000)
    expect(getAnthropicDefaultMaxTokens('claude-3-haiku')).toBe(4_000)
  })

  it('falls back to the safe constant for unknown models', () => {
    expect(ANTHROPIC_DEFAULT_MAX_OUTPUT_TOKENS).toBe(64_000)
    expect(getAnthropicDefaultMaxTokens('some-future-claude-model')).toBe(
      ANTHROPIC_DEFAULT_MAX_OUTPUT_TOKENS,
    )
  })

  it('never returns the old hard-coded 1024 floor for a known model', () => {
    expect(getAnthropicDefaultMaxTokens('claude-opus-4.8')).toBeGreaterThan(
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
      getAnthropicDefaultMaxTokens('claude-opus-4.8', { stream: false }),
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

  it('does not clamp a model whose ceiling is already below the non-streaming limit (#849)', () => {
    // claude-3-haiku's 4K ceiling is under the non-streaming limit, so the
    // non-streaming path returns the real ceiling, not the (larger) cap.
    expect(
      getAnthropicDefaultMaxTokens('claude-3-haiku', { stream: false }),
    ).toBe(4_000)
  })

  it('keeps the full ceiling for streaming requests (default) (#849)', () => {
    expect(
      getAnthropicDefaultMaxTokens('claude-opus-4.8', { stream: true }),
    ).toBe(128_000)
    // Omitting the option defaults to streaming.
    expect(getAnthropicDefaultMaxTokens('claude-opus-4.8')).toBe(128_000)
  })
})
