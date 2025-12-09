export {
  Anthropic,
  createAnthropic,
  anthropic,
  type AnthropicConfig,
} from './anthropic-adapter'
export type {
  AnthropicChatModelProviderOptionsByName,
  AnthropicModelInputModalitiesByName,
} from './model-meta'
export type {
  AnthropicTextMetadata,
  AnthropicImageMetadata,
  AnthropicDocumentMetadata,
  AnthropicAudioMetadata,
  AnthropicVideoMetadata,
  AnthropicImageMediaType,
  AnthropicDocumentMediaType,
  AnthropicMessageMetadataByModality,
} from './message-types'

// Export tool conversion utilities
export { convertToolsToProviderFormat } from './tools/tool-converter'

// Export tool types
export type { AnthropicTool, CustomTool } from './tools'
