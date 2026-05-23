export {
    BedrockTextAdapter,
    type BedrockTextConfig,
} from './adapters/text'

export {
    createBedrockChat,
    bedrockText,
} from './bedrock-chat'

export {
    BEDROCK_AMAZON_NOVA_PRO_V1,
    BEDROCK_AMAZON_NOVA_LITE_V1,
    BEDROCK_AMAZON_NOVA_MICRO_V1,
    BEDROCK_ANTHROPIC_CLAUDE_SONNET_4_5,
    BEDROCK_ANTHROPIC_CLAUDE_HAIKU_4_5,
    BEDROCK_CHAT_MODELS,
    type BedrockModelMeta,
    type BedrockModelId,
    type BedrockModelInputModalitiesByName,
} from './model-meta'

export type {
    BedrockMessageMetadataByModality,
    BedrockTextMetadata,
    BedrockImageMetadata,
    BedrockDocumentMetadata,
    BedrockAudioMetadata,
    BedrockVideoMetadata,
    BedrockImageMediaType,
} from './message-types'
