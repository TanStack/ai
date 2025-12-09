export {
  bedrock,
  Bedrock,
  createBedrock,
  type BedrockConfig,
  type BedrockCredentials,
} from './bedrock-adapter'
export {
  BEDROCK_EMBEDDING_MODELS,
  BEDROCK_MODEL_META,
  BEDROCK_MODELS,
} from './model-meta'
export type {
  BedrockChatModelProviderOptionsByName,
  BedrockModelInputModalitiesByName,
} from './model-meta'
export {
  getProfileGeography,
  type InferenceProfileConfig,
  type InferenceProfileGeography,
} from './bedrock-regions'
export type {
  BedrockAdditionalFieldsOptions,
  BedrockAnthropicOptions,
  BedrockAnthropicReasoningOptions,
  BedrockBaseOptions,
  BedrockPerformanceOptions,
  BedrockProviderOptions,
  BedrockReasoningEffortOptions,
  BedrockRequestMetadataOptions,
  BedrockServiceTierOptions,
  BedrockToolChoiceOptions,
} from './text/text-provider-options'
export type {
  BedrockAudioMetadata,
  BedrockDocumentFormat,
  BedrockDocumentMetadata,
  BedrockImageFormat,
  BedrockImageMetadata,
  BedrockMessageMetadataByModality,
  BedrockS3Location,
  BedrockTextMetadata,
  BedrockVideoFormat,
  BedrockVideoMetadata,
} from './message-types'

export { convertToolsToProviderFormat } from './tools/tool-converter'
