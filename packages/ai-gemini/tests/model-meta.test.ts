import { describe, it, expect, expectTypeOf } from 'vitest'
import { GEMINI_MODELS, GEMINI_TTS_MODELS } from '../src/model-meta'
import { createGeminiChat } from '../src'
import { createGeminiTextInteractions } from '../src/experimental'
import type {
  GeminiChatModelProviderOptionsByName,
  GeminiModelInputModalitiesByName,
} from '../src/model-meta'
import type {
  GeminiStructuredOutputOptions,
  GeminiToolConfigOptions,
  GeminiSafetyOptions,
  GeminiCommonConfigOptions,
  GeminiCachedContentOptions,
} from '../src/text/text-provider-options'
import type { GeminiMessageMetadataByModality } from '../src/message-types'
import type { AdapterReasoning } from '@tanstack/ai'
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
 */
type MakeInputModalitiesTypes<TModalities extends ReadonlyArray<Modality>> = {
  inputModalities: TModalities
  messageMetadataByModality: GeminiMessageMetadataByModality
}

/**
 * Type assertion tests for Gemini model provider options.
 *
 * These tests verify that:
 * 1. No model takes thinkingConfig in modelOptions: `chat({ reasoning })` owns
 *    it, with the levels from the generated reasoning map
 * 2. Models with structured output support have GeminiStructuredOutputOptions
 * 3. All models have base options (tool config, safety, generation config, cached content)
 *
 * Note: every current chat model (Gemini 2.5+ / 3.x) supports thinking, so
 * there is no longer a "without thinking" category — the retired 2.0 line
 * was the last one without it.
 */

// Base options that ALL chat models should have
type BaseOptions = GeminiToolConfigOptions &
  GeminiSafetyOptions &
  GeminiCommonConfigOptions &
  GeminiCachedContentOptions

describe('Gemini Model Provider Options Type Assertions', () => {
  it('registers gemini-3.8-flash with thinking, structured output, and multimodal input', () => {
    const adapter = createGeminiChat('gemini-3.8-flash', 'test-key')
    expect(GEMINI_MODELS).toContain('gemini-3.8-flash')
    expect(adapter.supportsCombinedToolsAndSchema()).toBe(true)
    expectTypeOf<
      GeminiChatModelProviderOptionsByName['gemini-3.8-flash']
    >().toEqualTypeOf<BaseOptions & GeminiStructuredOutputOptions>()
    expectTypeOf<
      GeminiModelInputModalitiesByName['gemini-3.8-flash'][number]
    >().toEqualTypeOf<'text' | 'image' | 'video' | 'audio' | 'document'>()
  })

  it('restricts gemini-3.8-flash thinking levels in both adapters', () => {
    const adapter = createGeminiChat('gemini-3.8-flash', 'test-key')
    const interactions = createGeminiTextInteractions(
      'gemini-3.8-flash',
      'test-key',
    )
    expectTypeOf<AdapterReasoning<typeof adapter>['levels']>().toEqualTypeOf<
      'low' | 'medium' | 'high'
    >()
    expectTypeOf<
      AdapterReasoning<typeof interactions>['levels']
    >().toEqualTypeOf<'low' | 'medium' | 'high'>()
  })

  describe('Models WITH thinking support', () => {
    it('gemini-3.1-pro-preview should support its options', () => {
      type Model = 'gemini-3.1-pro-preview'
      type Options = GeminiChatModelProviderOptionsByName[Model]

      // Thinking is set with `reasoning`, not modelOptions
      expectTypeOf<Options>().not.toHaveProperty('thinkingConfig')

      // Should have structured output options
      expectTypeOf<Options>().toExtend<GeminiStructuredOutputOptions>()

      // Should have base options
      expectTypeOf<Options>().toExtend<BaseOptions>()

      // Verify specific properties exist
      expectTypeOf<Options>().toHaveProperty('stopSequences')
      expectTypeOf<Options>().toHaveProperty('safetySettings')
      expectTypeOf<Options>().toHaveProperty('toolConfig')
      expectTypeOf<Options>().toHaveProperty('cachedContent')
      expectTypeOf<Options>().toHaveProperty('responseMimeType')
      expectTypeOf<Options>().toHaveProperty('responseSchema')
    })

    it('gemini-3-flash-preview should support its options', () => {
      type Model = 'gemini-3-flash-preview'
      type Options = GeminiChatModelProviderOptionsByName[Model]

      // Thinking is set with `reasoning`, not modelOptions
      expectTypeOf<Options>().not.toHaveProperty('thinkingConfig')

      // Should have structured output options
      expectTypeOf<Options>().toExtend<GeminiStructuredOutputOptions>()

      // Should have base options
      expectTypeOf<Options>().toExtend<BaseOptions>()

      // Verify specific properties exist
      expectTypeOf<Options>().toHaveProperty('stopSequences')
      expectTypeOf<Options>().toHaveProperty('safetySettings')
      expectTypeOf<Options>().toHaveProperty('toolConfig')
      expectTypeOf<Options>().toHaveProperty('cachedContent')
      expectTypeOf<Options>().toHaveProperty('responseMimeType')
      expectTypeOf<Options>().toHaveProperty('responseSchema')
    })

    it('gemini-2.5-pro should support its options', () => {
      type Model = 'gemini-2.5-pro'
      type Options = GeminiChatModelProviderOptionsByName[Model]

      // Thinking is set with `reasoning`, not modelOptions
      expectTypeOf<Options>().not.toHaveProperty('thinkingConfig')

      // Should have structured output options
      expectTypeOf<Options>().toExtend<GeminiStructuredOutputOptions>()

      // Should have base options
      expectTypeOf<Options>().toExtend<BaseOptions>()
    })

    it('gemini-2.5-flash should support its options', () => {
      type Model = 'gemini-2.5-flash'
      type Options = GeminiChatModelProviderOptionsByName[Model]

      // Thinking is set with `reasoning`, not modelOptions
      expectTypeOf<Options>().not.toHaveProperty('thinkingConfig')

      // Should have structured output options
      expectTypeOf<Options>().toExtend<GeminiStructuredOutputOptions>()

      // Should have base options
      expectTypeOf<Options>().toExtend<BaseOptions>()
    })

    it('gemini-2.5-flash-lite should support its options', () => {
      type Model = 'gemini-2.5-flash-lite'
      type Options = GeminiChatModelProviderOptionsByName[Model]

      // Thinking is set with `reasoning`, not modelOptions
      expectTypeOf<Options>().not.toHaveProperty('thinkingConfig')

      // Should have structured output options
      expectTypeOf<Options>().toExtend<GeminiStructuredOutputOptions>()

      // Should have base options
      expectTypeOf<Options>().toExtend<BaseOptions>()
    })

    it('gemini-3.1-flash-lite should support its options', () => {
      type Model = 'gemini-3.1-flash-lite'
      type Options = GeminiChatModelProviderOptionsByName[Model]

      // Thinking is set with `reasoning`, not modelOptions
      expectTypeOf<Options>().not.toHaveProperty('thinkingConfig')

      // Should have structured output options
      expectTypeOf<Options>().toExtend<GeminiStructuredOutputOptions>()

      // Should have base options
      expectTypeOf<Options>().toExtend<BaseOptions>()

      // Verify specific properties exist
      expectTypeOf<Options>().toHaveProperty('stopSequences')
      expectTypeOf<Options>().toHaveProperty('safetySettings')
      expectTypeOf<Options>().toHaveProperty('toolConfig')
      expectTypeOf<Options>().toHaveProperty('cachedContent')
      expectTypeOf<Options>().toHaveProperty('responseMimeType')
      expectTypeOf<Options>().toHaveProperty('responseSchema')
    })

    it('gemini-3.1-flash-lite-preview should support its options', () => {
      type Model = 'gemini-3.1-flash-lite-preview'
      type Options = GeminiChatModelProviderOptionsByName[Model]

      // Thinking is set with `reasoning`, not modelOptions
      expectTypeOf<Options>().not.toHaveProperty('thinkingConfig')

      // Should have structured output options
      expectTypeOf<Options>().toExtend<GeminiStructuredOutputOptions>()

      // Should have base options
      expectTypeOf<Options>().toExtend<BaseOptions>()

      // Verify specific properties exist
      expectTypeOf<Options>().toHaveProperty('stopSequences')
      expectTypeOf<Options>().toHaveProperty('safetySettings')
      expectTypeOf<Options>().toHaveProperty('toolConfig')
      expectTypeOf<Options>().toHaveProperty('cachedContent')
      expectTypeOf<Options>().toHaveProperty('responseMimeType')
      expectTypeOf<Options>().toHaveProperty('responseSchema')
    })

    it('gemini-3.5-flash should support its options', () => {
      type Model = 'gemini-3.5-flash'
      type Options = GeminiChatModelProviderOptionsByName[Model]

      // Thinking is set with `reasoning`, not modelOptions
      expectTypeOf<Options>().not.toHaveProperty('thinkingConfig')

      // Should have structured output options
      expectTypeOf<Options>().toExtend<GeminiStructuredOutputOptions>()

      // Should have base options
      expectTypeOf<Options>().toExtend<BaseOptions>()
    })

    it('gemini-3.7-flash should support its options', () => {
      type Model = 'gemini-3.7-flash'
      type Options = GeminiChatModelProviderOptionsByName[Model]

      expectTypeOf<Options>().not.toHaveProperty('thinkingConfig')
      expectTypeOf<Options>().toExtend<GeminiStructuredOutputOptions>()
      expectTypeOf<Options>().toExtend<BaseOptions>()
    })

    it('gemini-3.6-flash should support its options', () => {
      type Model = 'gemini-3.6-flash'
      type Options = GeminiChatModelProviderOptionsByName[Model]

      expectTypeOf<Options>().not.toHaveProperty('thinkingConfig')
      expectTypeOf<Options>().toExtend<GeminiStructuredOutputOptions>()
      expectTypeOf<Options>().toExtend<BaseOptions>()
    })

    it('gemini-3.5-flash-lite should support its options', () => {
      type Model = 'gemini-3.5-flash-lite'
      type Options = GeminiChatModelProviderOptionsByName[Model]

      expectTypeOf<Options>().not.toHaveProperty('thinkingConfig')
      expectTypeOf<Options>().toExtend<GeminiStructuredOutputOptions>()
      expectTypeOf<Options>().toExtend<BaseOptions>()
    })
  })

  describe('Provider options type completeness', () => {
    it('GeminiChatModelProviderOptionsByName should have entries for all chat models', () => {
      // Verify the type map has all expected model keys
      type Keys = keyof GeminiChatModelProviderOptionsByName

      expectTypeOf<'gemini-3.7-flash'>().toExtend<Keys>()
      expectTypeOf<'gemini-3.6-flash'>().toExtend<Keys>()
      expectTypeOf<'gemini-3.5-flash'>().toExtend<Keys>()
      expectTypeOf<'gemini-3.5-flash-lite'>().toExtend<Keys>()
      expectTypeOf<'gemini-3.1-pro-preview'>().toExtend<Keys>()
      expectTypeOf<'gemini-3-flash-preview'>().toExtend<Keys>()
      expectTypeOf<'gemini-3.1-flash-lite'>().toExtend<Keys>()
      expectTypeOf<'gemini-3.1-flash-lite-preview'>().toExtend<Keys>()
      expectTypeOf<'gemini-2.5-pro'>().toExtend<Keys>()
      expectTypeOf<'gemini-2.5-flash'>().toExtend<Keys>()
      expectTypeOf<'gemini-2.5-flash-lite'>().toExtend<Keys>()
    })

    it('GeminiChatModelProviderOptionsByName should NOT have entries for retired models', () => {
      type Keys = keyof GeminiChatModelProviderOptionsByName

      expectTypeOf<'gemini-3-pro-preview'>().not.toExtend<Keys>()
      expectTypeOf<'gemini-2.5-flash-preview-09-2025'>().not.toExtend<Keys>()
      expectTypeOf<'gemini-2.5-flash-lite-preview-09-2025'>().not.toExtend<Keys>()
      expectTypeOf<'gemini-2.0-flash'>().not.toExtend<Keys>()
      expectTypeOf<'gemini-2.0-flash-lite'>().not.toExtend<Keys>()
    })
  })

  describe('Detailed property type assertions', () => {
    it('thinking models take thinking through reasoning, not thinkingConfig', () => {
      type Options = GeminiChatModelProviderOptionsByName['gemini-2.5-pro']

      expectTypeOf<Options>().not.toHaveProperty('thinkingConfig')
    })

    it('structured output options should have responseMimeType and responseSchema', () => {
      type Options = GeminiChatModelProviderOptionsByName['gemini-2.5-flash']

      expectTypeOf<Options>().toHaveProperty('responseMimeType')
      expectTypeOf<Options>().toHaveProperty('responseSchema')
      expectTypeOf<Options>().toHaveProperty('responseJsonSchema')
    })

    it('all models should have safety settings', () => {
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3.7-flash']
      >().toHaveProperty('safetySettings')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3.6-flash']
      >().toHaveProperty('safetySettings')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3.5-flash']
      >().toHaveProperty('safetySettings')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3.5-flash-lite']
      >().toHaveProperty('safetySettings')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3.1-pro-preview']
      >().toHaveProperty('safetySettings')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3-flash-preview']
      >().toHaveProperty('safetySettings')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3.1-flash-lite']
      >().toHaveProperty('safetySettings')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3.1-flash-lite-preview']
      >().toHaveProperty('safetySettings')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-2.5-pro']
      >().toHaveProperty('safetySettings')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-2.5-flash']
      >().toHaveProperty('safetySettings')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-2.5-flash-lite']
      >().toHaveProperty('safetySettings')
    })

    it('all models should have tool config', () => {
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3.7-flash']
      >().toHaveProperty('toolConfig')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3.6-flash']
      >().toHaveProperty('toolConfig')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3.5-flash']
      >().toHaveProperty('toolConfig')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3.5-flash-lite']
      >().toHaveProperty('toolConfig')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3.1-pro-preview']
      >().toHaveProperty('toolConfig')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3-flash-preview']
      >().toHaveProperty('toolConfig')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3.1-flash-lite']
      >().toHaveProperty('toolConfig')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3.1-flash-lite-preview']
      >().toHaveProperty('toolConfig')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-2.5-pro']
      >().toHaveProperty('toolConfig')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-2.5-flash']
      >().toHaveProperty('toolConfig')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-2.5-flash-lite']
      >().toHaveProperty('toolConfig')
    })

    it('all models should have cached content option', () => {
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3.7-flash']
      >().toHaveProperty('cachedContent')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3.6-flash']
      >().toHaveProperty('cachedContent')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3.5-flash']
      >().toHaveProperty('cachedContent')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3.5-flash-lite']
      >().toHaveProperty('cachedContent')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3.1-pro-preview']
      >().toHaveProperty('cachedContent')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3-flash-preview']
      >().toHaveProperty('cachedContent')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3.1-flash-lite']
      >().toHaveProperty('cachedContent')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3.1-flash-lite-preview']
      >().toHaveProperty('cachedContent')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-2.5-pro']
      >().toHaveProperty('cachedContent')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-2.5-flash']
      >().toHaveProperty('cachedContent')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-2.5-flash-lite']
      >().toHaveProperty('cachedContent')
    })
  })

  describe('Type discrimination between model categories', () => {
    it('no model takes thinkingConfig in modelOptions', () => {
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3.7-flash']
      >().not.toHaveProperty('thinkingConfig')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3.6-flash']
      >().not.toHaveProperty('thinkingConfig')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3.5-flash']
      >().not.toHaveProperty('thinkingConfig')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3.5-flash-lite']
      >().not.toHaveProperty('thinkingConfig')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3.1-pro-preview']
      >().not.toHaveProperty('thinkingConfig')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3-flash-preview']
      >().not.toHaveProperty('thinkingConfig')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3.1-flash-lite']
      >().not.toHaveProperty('thinkingConfig')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3.1-flash-lite-preview']
      >().not.toHaveProperty('thinkingConfig')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-2.5-pro']
      >().not.toHaveProperty('thinkingConfig')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-2.5-flash']
      >().not.toHaveProperty('thinkingConfig')
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-2.5-flash-lite']
      >().not.toHaveProperty('thinkingConfig')
    })

    it('all models should extend GeminiStructuredOutputOptions', () => {
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3.7-flash']
      >().toExtend<GeminiStructuredOutputOptions>()
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3.6-flash']
      >().toExtend<GeminiStructuredOutputOptions>()
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3.5-flash']
      >().toExtend<GeminiStructuredOutputOptions>()
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3.5-flash-lite']
      >().toExtend<GeminiStructuredOutputOptions>()
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3.1-pro-preview']
      >().toExtend<GeminiStructuredOutputOptions>()
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3-flash-preview']
      >().toExtend<GeminiStructuredOutputOptions>()
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3.1-flash-lite']
      >().toExtend<GeminiStructuredOutputOptions>()
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-3.1-flash-lite-preview']
      >().toExtend<GeminiStructuredOutputOptions>()
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-2.5-pro']
      >().toExtend<GeminiStructuredOutputOptions>()
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-2.5-flash']
      >().toExtend<GeminiStructuredOutputOptions>()
      expectTypeOf<
        GeminiChatModelProviderOptionsByName['gemini-2.5-flash-lite']
      >().toExtend<GeminiStructuredOutputOptions>()
    })
  })
})

/**
 * Gemini Model Input Modality Type Assertions
 *
 * These tests verify that ConstrainedModelMessage correctly restricts
 * content parts based on each Gemini model's supported input modalities.
 *
 * Models with full multimodal (text + image + audio + video + document):
 * - gemini-3.7-flash
 * - gemini-3.6-flash
 * - gemini-3.5-flash
 * - gemini-3.5-flash-lite
 * - gemini-3.1-pro-preview
 * - gemini-3-flash-preview
 * - gemini-3.1-flash-lite (and preview)
 * - gemini-2.5-pro
 * - gemini-2.5-flash-lite
 *
 * Models with limited multimodal (text + image + audio + video, NO document):
 * - gemini-2.5-flash
 */
describe('Gemini Model Input Modality Type Assertions', () => {
  // Helper types using provider-specific metadata.
  type GeminiTextPart = TextPart<GeminiMessageMetadataByModality['text']>
  type GeminiImagePart = ImagePart<GeminiMessageMetadataByModality['image']>
  type GeminiAudioPart = AudioPart<GeminiMessageMetadataByModality['audio']>
  type GeminiVideoPart = VideoPart<GeminiMessageMetadataByModality['video']>
  type GeminiDocumentPart = DocumentPart<
    GeminiMessageMetadataByModality['document']
  >
  type MessageWithContent<T> = { role: 'user'; content: Array<T> }

  // ===== Full Multimodal Models (text + image + audio + video + document) =====

  describe('gemini-3.1-pro-preview (full multimodal)', () => {
    type Modalities = GeminiModelInputModalitiesByName['gemini-3.1-pro-preview']
    type Message = ConstrainedModelMessage<MakeInputModalitiesTypes<Modalities>>

    it('should allow all content part types', () => {
      expectTypeOf<MessageWithContent<GeminiTextPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiImagePart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiAudioPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiVideoPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiDocumentPart>>().toExtend<Message>()
    })
  })

  describe('gemini-3-flash-preview (full multimodal)', () => {
    type Modalities = GeminiModelInputModalitiesByName['gemini-3-flash-preview']
    type Message = ConstrainedModelMessage<MakeInputModalitiesTypes<Modalities>>

    it('should allow all content part types', () => {
      expectTypeOf<MessageWithContent<GeminiTextPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiImagePart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiAudioPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiVideoPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiDocumentPart>>().toExtend<Message>()
    })
  })

  describe('gemini-2.5-pro (full multimodal)', () => {
    type Modalities = GeminiModelInputModalitiesByName['gemini-2.5-pro']
    type Message = ConstrainedModelMessage<MakeInputModalitiesTypes<Modalities>>

    it('should allow all content part types', () => {
      expectTypeOf<MessageWithContent<GeminiTextPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiImagePart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiAudioPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiVideoPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiDocumentPart>>().toExtend<Message>()
    })
  })

  describe('gemini-3.1-flash-lite (full multimodal)', () => {
    type Modalities = GeminiModelInputModalitiesByName['gemini-3.1-flash-lite']
    type Message = ConstrainedModelMessage<MakeInputModalitiesTypes<Modalities>>

    it('should allow all content part types', () => {
      expectTypeOf<MessageWithContent<GeminiTextPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiImagePart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiAudioPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiVideoPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiDocumentPart>>().toExtend<Message>()
    })
  })

  describe('gemini-3.1-flash-lite-preview (full multimodal)', () => {
    type Modalities =
      GeminiModelInputModalitiesByName['gemini-3.1-flash-lite-preview']
    type Message = ConstrainedModelMessage<MakeInputModalitiesTypes<Modalities>>

    it('should allow all content part types', () => {
      expectTypeOf<MessageWithContent<GeminiTextPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiImagePart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiAudioPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiVideoPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiDocumentPart>>().toExtend<Message>()
    })
  })

  describe('gemini-2.5-flash-lite (full multimodal)', () => {
    type Modalities = GeminiModelInputModalitiesByName['gemini-2.5-flash-lite']
    type Message = ConstrainedModelMessage<MakeInputModalitiesTypes<Modalities>>

    it('should allow all content part types', () => {
      expectTypeOf<MessageWithContent<GeminiTextPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiImagePart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiAudioPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiVideoPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiDocumentPart>>().toExtend<Message>()
    })
  })

  describe('gemini-3.5-flash (full multimodal)', () => {
    type Modalities = GeminiModelInputModalitiesByName['gemini-3.5-flash']
    type Message = ConstrainedModelMessage<MakeInputModalitiesTypes<Modalities>>

    it('should allow all content part types', () => {
      expectTypeOf<MessageWithContent<GeminiTextPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiImagePart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiAudioPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiVideoPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiDocumentPart>>().toExtend<Message>()
    })
  })

  describe('gemini-3.7-flash (full multimodal)', () => {
    type Modalities = GeminiModelInputModalitiesByName['gemini-3.7-flash']
    type Message = ConstrainedModelMessage<MakeInputModalitiesTypes<Modalities>>

    it('should allow all content part types', () => {
      expectTypeOf<MessageWithContent<GeminiTextPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiImagePart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiAudioPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiVideoPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiDocumentPart>>().toExtend<Message>()
    })
  })

  describe('gemini-3.6-flash (full multimodal)', () => {
    type Modalities = GeminiModelInputModalitiesByName['gemini-3.6-flash']
    type Message = ConstrainedModelMessage<MakeInputModalitiesTypes<Modalities>>

    it('should allow all content part types', () => {
      expectTypeOf<MessageWithContent<GeminiTextPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiImagePart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiAudioPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiVideoPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiDocumentPart>>().toExtend<Message>()
    })
  })

  describe('gemini-3.5-flash-lite (full multimodal)', () => {
    type Modalities = GeminiModelInputModalitiesByName['gemini-3.5-flash-lite']
    type Message = ConstrainedModelMessage<MakeInputModalitiesTypes<Modalities>>

    it('should allow all content part types', () => {
      expectTypeOf<MessageWithContent<GeminiTextPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiImagePart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiAudioPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiVideoPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiDocumentPart>>().toExtend<Message>()
    })
  })

  // ===== Limited Multimodal Models (text + image + audio + video, NO document) =====

  describe('gemini-2.5-flash (no document)', () => {
    type Modalities = GeminiModelInputModalitiesByName['gemini-2.5-flash']
    type Message = ConstrainedModelMessage<MakeInputModalitiesTypes<Modalities>>

    it('should allow TextPart, ImagePart, AudioPart, and VideoPart', () => {
      expectTypeOf<MessageWithContent<GeminiTextPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiImagePart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiAudioPart>>().toExtend<Message>()
      expectTypeOf<MessageWithContent<GeminiVideoPart>>().toExtend<Message>()
    })

    it('should NOT allow DocumentPart', () => {
      expectTypeOf<
        MessageWithContent<GeminiDocumentPart>
      >().not.toExtend<Message>()
    })
  })
})

describe('Gemini TTS model registry', () => {
  it('exposes the Pro TTS model under its own name (not a Flash duplicate)', () => {
    // Regression: GEMINI_2_5_PRO_TTS.name used to copy-paste the Flash
    // model name, so the "Pro" entry in GEMINI_TTS_MODELS was an
    // unreachable duplicate.
    expect(GEMINI_TTS_MODELS).toContain('gemini-2.5-pro-preview-tts')
    expect(GEMINI_TTS_MODELS).toContain('gemini-2.5-flash-preview-tts')
    expect(new Set(GEMINI_TTS_MODELS).size).toBe(GEMINI_TTS_MODELS.length)
  })
})
