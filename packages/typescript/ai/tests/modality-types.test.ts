/**
 * Type-level tests for multimodal message constraints.
 *
 * These tests verify that TypeScript correctly rejects messages
 * with content types that are not supported by the selected model.
 */

import { describe, expectTypeOf, it } from 'vitest'
import type {
  AudioPart,
  ConstrainedModelMessage,
  ContentPartForInputModalitiesTypes,
  DefaultMessageMetadataByModality,
  DocumentPart,
  ImagePart,
  Modality,
  TextPart,
  VideoPart,
} from '../src/types'

// Helper type to create InputModalitiesTypes from a modality array
type CreateInputModalitiesTypes<T extends ReadonlyArray<Modality>> = {
  inputModalities: T
  messageMetadataByModality: DefaultMessageMetadataByModality
}

// Helper types for message with specific content
type MessageWithContent<T> = { role: 'user'; content: Array<T> }

describe('Multimodal Type Constraints', () => {
  describe('ContentPartForInputModalitiesTypes', () => {
    it('should only allow TextPart for text-only modality', () => {
      type TextOnlyInput = CreateInputModalitiesTypes<readonly ['text']>
      type TextOnlyContent = ContentPartForInputModalitiesTypes<TextOnlyInput>

      expectTypeOf<TextPart>().toExtend<TextOnlyContent>()

      // These should NOT be assignable
      expectTypeOf<ImagePart>().not.toExtend<TextOnlyContent>()
      expectTypeOf<AudioPart>().not.toExtend<TextOnlyContent>()
      expectTypeOf<VideoPart>().not.toExtend<TextOnlyContent>()
      expectTypeOf<DocumentPart>().not.toExtend<TextOnlyContent>()
    })

    it('should allow TextPart and ImagePart for text|image modality', () => {
      type TextImageInput = CreateInputModalitiesTypes<
        readonly ['text', 'image']
      >
      type TextImageContent = ContentPartForInputModalitiesTypes<TextImageInput>

      expectTypeOf<TextPart>().toExtend<TextImageContent>()
      expectTypeOf<ImagePart>().toExtend<TextImageContent>()

      // These should NOT be assignable
      expectTypeOf<AudioPart>().not.toExtend<TextImageContent>()
      expectTypeOf<VideoPart>().not.toExtend<TextImageContent>()
      expectTypeOf<DocumentPart>().not.toExtend<TextImageContent>()
    })

    it('should allow TextPart, ImagePart, and AudioPart for text|image|audio modality', () => {
      type TextImageAudioInput = CreateInputModalitiesTypes<
        readonly ['text', 'image', 'audio']
      >
      type TextImageAudioContent =
        ContentPartForInputModalitiesTypes<TextImageAudioInput>

      expectTypeOf<TextPart>().toExtend<TextImageAudioContent>()
      expectTypeOf<ImagePart>().toExtend<TextImageAudioContent>()
      expectTypeOf<AudioPart>().toExtend<TextImageAudioContent>()

      // These should NOT be assignable
      expectTypeOf<VideoPart>().not.toExtend<TextImageAudioContent>()
      expectTypeOf<DocumentPart>().not.toExtend<TextImageAudioContent>()
    })

    it('should allow all content parts for full multimodal', () => {
      type FullInput = CreateInputModalitiesTypes<
        readonly ['text', 'image', 'audio', 'video', 'document']
      >
      type FullContent = ContentPartForInputModalitiesTypes<FullInput>

      expectTypeOf<TextPart>().toExtend<FullContent>()
      expectTypeOf<ImagePart>().toExtend<FullContent>()
      expectTypeOf<AudioPart>().toExtend<FullContent>()
      expectTypeOf<VideoPart>().toExtend<FullContent>()
      expectTypeOf<DocumentPart>().toExtend<FullContent>()
    })
  })

  describe('ConstrainedModelMessage for text-only models', () => {
    type TextOnlyInput = CreateInputModalitiesTypes<readonly ['text']>
    type TextOnlyMessage = ConstrainedModelMessage<TextOnlyInput>

    it('should allow string content', () => {
      expectTypeOf<{
        role: 'user'
        content: string
      }>().toExtend<TextOnlyMessage>()
    })

    it('should allow null content', () => {
      expectTypeOf<{
        role: 'assistant'
        content: null
      }>().toExtend<TextOnlyMessage>()
    })

    it('should allow TextPart array', () => {
      expectTypeOf<MessageWithContent<TextPart>>().toExtend<TextOnlyMessage>()
    })

    it('should NOT allow ImagePart for text-only models', () => {
      expectTypeOf<
        MessageWithContent<ImagePart>
      >().not.toExtend<TextOnlyMessage>()
    })

    it('should NOT allow AudioPart for text-only models', () => {
      expectTypeOf<
        MessageWithContent<AudioPart>
      >().not.toExtend<TextOnlyMessage>()
    })

    it('should NOT allow VideoPart for text-only models', () => {
      expectTypeOf<
        MessageWithContent<VideoPart>
      >().not.toExtend<TextOnlyMessage>()
    })

    it('should NOT allow DocumentPart for text-only models', () => {
      expectTypeOf<
        MessageWithContent<DocumentPart>
      >().not.toExtend<TextOnlyMessage>()
    })
  })

  describe('ConstrainedModelMessage for text+image models', () => {
    type TextImageInput = CreateInputModalitiesTypes<
      readonly ['text', 'image']
    >
    type TextImageMessage = ConstrainedModelMessage<TextImageInput>

    it('should allow TextPart', () => {
      expectTypeOf<MessageWithContent<TextPart>>().toExtend<TextImageMessage>()
    })

    it('should allow ImagePart', () => {
      expectTypeOf<MessageWithContent<ImagePart>>().toExtend<TextImageMessage>()
    })

    it('should allow mixed TextPart and ImagePart', () => {
      expectTypeOf<
        MessageWithContent<TextPart | ImagePart>
      >().toExtend<TextImageMessage>()
    })

    it('should NOT allow AudioPart for text+image models', () => {
      expectTypeOf<
        MessageWithContent<AudioPart>
      >().not.toExtend<TextImageMessage>()
    })

    it('should NOT allow VideoPart for text+image models', () => {
      expectTypeOf<
        MessageWithContent<VideoPart>
      >().not.toExtend<TextImageMessage>()
    })

    it('should NOT allow DocumentPart for text+image models', () => {
      expectTypeOf<
        MessageWithContent<DocumentPart>
      >().not.toExtend<TextImageMessage>()
    })

    it('should NOT allow mixed valid and invalid content parts', () => {
      // Array containing TextPart and VideoPart should NOT extend TextImageMessage
      expectTypeOf<
        MessageWithContent<TextPart | VideoPart>
      >().not.toExtend<TextImageMessage>()
    })
  })

  describe('ConstrainedModelMessage for text+audio models', () => {
    type TextAudioInput = CreateInputModalitiesTypes<
      readonly ['text', 'audio']
    >
    type TextAudioMessage = ConstrainedModelMessage<TextAudioInput>

    it('should allow TextPart', () => {
      expectTypeOf<MessageWithContent<TextPart>>().toExtend<TextAudioMessage>()
    })

    it('should allow AudioPart', () => {
      expectTypeOf<MessageWithContent<AudioPart>>().toExtend<TextAudioMessage>()
    })

    it('should NOT allow ImagePart for text+audio models', () => {
      expectTypeOf<
        MessageWithContent<ImagePart>
      >().not.toExtend<TextAudioMessage>()
    })

    it('should NOT allow VideoPart for text+audio models', () => {
      expectTypeOf<
        MessageWithContent<VideoPart>
      >().not.toExtend<TextAudioMessage>()
    })
  })

  describe('ConstrainedModelMessage for text+image+audio models', () => {
    type TextImageAudioInput = CreateInputModalitiesTypes<
      readonly ['text', 'image', 'audio']
    >
    type TextImageAudioMessage = ConstrainedModelMessage<TextImageAudioInput>

    it('should allow TextPart, ImagePart, and AudioPart', () => {
      expectTypeOf<
        MessageWithContent<TextPart>
      >().toExtend<TextImageAudioMessage>()
      expectTypeOf<
        MessageWithContent<ImagePart>
      >().toExtend<TextImageAudioMessage>()
      expectTypeOf<
        MessageWithContent<AudioPart>
      >().toExtend<TextImageAudioMessage>()
      expectTypeOf<
        MessageWithContent<TextPart | ImagePart | AudioPart>
      >().toExtend<TextImageAudioMessage>()
    })

    it('should NOT allow VideoPart for text+image+audio models', () => {
      expectTypeOf<
        MessageWithContent<VideoPart>
      >().not.toExtend<TextImageAudioMessage>()
    })

    it('should NOT allow DocumentPart for text+image+audio models', () => {
      expectTypeOf<
        MessageWithContent<DocumentPart>
      >().not.toExtend<TextImageAudioMessage>()
    })
  })

  describe('ConstrainedModelMessage for text+image+audio+video models', () => {
    type TextImageAudioVideoInput = CreateInputModalitiesTypes<
      readonly ['text', 'image', 'audio', 'video']
    >
    type TextImageAudioVideoMessage =
      ConstrainedModelMessage<TextImageAudioVideoInput>

    it('should allow TextPart, ImagePart, AudioPart, and VideoPart', () => {
      expectTypeOf<
        MessageWithContent<TextPart>
      >().toExtend<TextImageAudioVideoMessage>()
      expectTypeOf<
        MessageWithContent<ImagePart>
      >().toExtend<TextImageAudioVideoMessage>()
      expectTypeOf<
        MessageWithContent<AudioPart>
      >().toExtend<TextImageAudioVideoMessage>()
      expectTypeOf<
        MessageWithContent<VideoPart>
      >().toExtend<TextImageAudioVideoMessage>()
      expectTypeOf<
        MessageWithContent<TextPart | ImagePart | AudioPart | VideoPart>
      >().toExtend<TextImageAudioVideoMessage>()
    })

    it('should NOT allow DocumentPart for text+image+audio+video models', () => {
      expectTypeOf<
        MessageWithContent<DocumentPart>
      >().not.toExtend<TextImageAudioVideoMessage>()
    })
  })

  describe('ConstrainedModelMessage for full multimodal models', () => {
    type FullInput = CreateInputModalitiesTypes<
      readonly ['text', 'image', 'audio', 'video', 'document']
    >
    type FullMultimodalMessage = ConstrainedModelMessage<FullInput>

    it('should allow all content types', () => {
      expectTypeOf<
        MessageWithContent<TextPart>
      >().toExtend<FullMultimodalMessage>()
      expectTypeOf<
        MessageWithContent<ImagePart>
      >().toExtend<FullMultimodalMessage>()
      expectTypeOf<
        MessageWithContent<AudioPart>
      >().toExtend<FullMultimodalMessage>()
      expectTypeOf<
        MessageWithContent<VideoPart>
      >().toExtend<FullMultimodalMessage>()
      expectTypeOf<
        MessageWithContent<DocumentPart>
      >().toExtend<FullMultimodalMessage>()
    })

    it('should allow any combination of content types', () => {
      expectTypeOf<
        MessageWithContent<
          TextPart | ImagePart | AudioPart | VideoPart | DocumentPart
        >
      >().toExtend<FullMultimodalMessage>()
    })
  })

  describe('String and null content', () => {
    it('should always allow string content regardless of modalities', () => {
      type TextOnlyInput = CreateInputModalitiesTypes<readonly ['text']>
      type TextImageInput = CreateInputModalitiesTypes<
        readonly ['text', 'image']
      >
      type FullInput = CreateInputModalitiesTypes<
        readonly ['text', 'image', 'audio', 'video', 'document']
      >

      type TextOnlyMessage = ConstrainedModelMessage<TextOnlyInput>
      type TextImageMessage = ConstrainedModelMessage<TextImageInput>
      type FullMessage = ConstrainedModelMessage<FullInput>

      expectTypeOf<{
        role: 'user'
        content: string
      }>().toExtend<TextOnlyMessage>()
      expectTypeOf<{
        role: 'user'
        content: string
      }>().toExtend<TextImageMessage>()
      expectTypeOf<{ role: 'user'; content: string }>().toExtend<FullMessage>()
    })

    it('should always allow null content regardless of modalities', () => {
      type TextOnlyInput = CreateInputModalitiesTypes<readonly ['text']>
      type TextImageInput = CreateInputModalitiesTypes<
        readonly ['text', 'image']
      >

      type TextOnlyMessage = ConstrainedModelMessage<TextOnlyInput>
      type TextImageMessage = ConstrainedModelMessage<TextImageInput>

      expectTypeOf<{
        role: 'assistant'
        content: null
      }>().toExtend<TextOnlyMessage>()
      expectTypeOf<{
        role: 'assistant'
        content: null
      }>().toExtend<TextImageMessage>()
    })
  })
})
