import type {
  CacheControlEphemeral,
  CitationsConfigParam,
  TextCitationParam,
} from '@anthropic-ai/sdk/resources'

/**
 * Supported image media types for Anthropic.
 */
export type AnthropicImageMediaType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/gif'
  | 'image/webp'

/**
 * Metadata for Anthropic image content parts.
 */
export interface AnthropicImageMetadata {
  /**
   * @deprecated Ignored. The media type is taken from `source.mimeType`.
   */
  mediaType?: AnthropicImageMediaType
  /**
   * Cache control settings for the image content.
   */
  cache_control?: CacheControlEphemeral
}

export interface AnthropicTextMetadata {
  cache_control?: CacheControlEphemeral
  /**
   * Text citations to include with the text content.
   */
  citations?: Array<TextCitationParam>
}
/**
 * Supported document media types for Anthropic.
 */
export type AnthropicDocumentMediaType = 'application/pdf'

/**
 * Metadata for Anthropic document content parts (e.g., PDFs).
 */
export interface AnthropicDocumentMetadata {
  mediaType?: AnthropicDocumentMediaType
  cache_control?: CacheControlEphemeral

  citations?: CitationsConfigParam

  context?: string

  /**
   * The document filename. Used as the document title when `title` is absent.
   */
  filename?: string

  title?: string
}

/**
 * Metadata for Anthropic audio content parts.
 * Note: Audio support in Anthropic may be limited; check current API capabilities.
 */
export interface AnthropicAudioMetadata {
  mediaType?:
    | 'audio/mpeg'
    | 'audio/wav'
    | 'audio/ogg'
    | 'audio/webm'
    | 'audio/flac'
}

/**
 * Metadata for Anthropic video content parts.
 * Note: Video support in Anthropic may be limited; check current API capabilities.
 */
export interface AnthropicVideoMetadata {
  mediaType?: 'video/mp4' | 'video/webm' | 'video/mpeg'
}

/**
 * Map of modality types to their Anthropic-specific metadata types.
 * Used for type inference when constructing multimodal messages.
 */
export interface AnthropicMessageMetadataByModality {
  text: AnthropicTextMetadata
  image: AnthropicImageMetadata
  audio: AnthropicAudioMetadata
  video: AnthropicVideoMetadata
  document: AnthropicDocumentMetadata
}
