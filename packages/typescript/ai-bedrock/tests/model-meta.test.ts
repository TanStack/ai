import { describe, it, expectTypeOf } from 'vitest'
import type {
    BedrockModelInputModalitiesByName,
} from '../src/model-meta'
import type {
    AudioPart,
    ConstrainedModelMessage,
    DocumentPart,
    ImagePart,
    TextPart,
    VideoPart,
    InputModalitiesTypes,
    DefaultMessageMetadataByModality,
} from '@tanstack/ai'

/**
 * Helper to convert raw modality array to InputModalitiesTypes
 */
type ResolveModalities<T extends ReadonlyArray<any>> = {
    inputModalities: T
    messageMetadataByModality: DefaultMessageMetadataByModality
}

/**
 * Type assertion tests for Bedrock model input modalities.
 */
describe('Bedrock Model Input Modality Type Assertions', () => {
    // Helper type for creating a user message with specific content
    type MessageWithContent<T> = { role: 'user'; content: Array<T> }

    describe('Amazon Nova Pro (text + image + video + document)', () => {
        type Modalities = ResolveModalities<BedrockModelInputModalitiesByName['amazon.nova-pro-v1:0']>
        type Message = ConstrainedModelMessage<Modalities>

        it('should allow TextPart, ImagePart, VideoPart, and DocumentPart', () => {
            expectTypeOf<MessageWithContent<TextPart>>().toExtend<Message>()
            expectTypeOf<MessageWithContent<ImagePart>>().toExtend<Message>()
            expectTypeOf<MessageWithContent<VideoPart>>().toExtend<Message>()
            expectTypeOf<MessageWithContent<DocumentPart>>().toExtend<Message>()
        })

        it('should NOT allow AudioPart', () => {
            expectTypeOf<MessageWithContent<AudioPart>>().not.toExtend<Message>()
        })
    })

    describe('Claude 4.5 Sonnet (text + image + document)', () => {
        type Modalities = ResolveModalities<BedrockModelInputModalitiesByName['anthropic.claude-sonnet-4-5-20250929-v1:0']>
        type Message = ConstrainedModelMessage<Modalities>

        it('should allow TextPart, ImagePart, and DocumentPart', () => {
            expectTypeOf<MessageWithContent<TextPart>>().toExtend<Message>()
            expectTypeOf<MessageWithContent<ImagePart>>().toExtend<Message>()
            expectTypeOf<MessageWithContent<DocumentPart>>().toExtend<Message>()
        })

        it('should NOT allow AudioPart or VideoPart', () => {
            expectTypeOf<MessageWithContent<AudioPart>>().not.toExtend<Message>()
            expectTypeOf<MessageWithContent<VideoPart>>().not.toExtend<Message>()
        })
    })
})
