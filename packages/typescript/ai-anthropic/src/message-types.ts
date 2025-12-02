/**
 * Anthropic-specific metadata types for multimodal content parts.
 * These types extend the base ContentPart metadata with Anthropic-specific options.
 *
 * @see https://docs.anthropic.com/claude/docs/vision
 * @see https://docs.anthropic.com/claude/docs/pdf-support
 */

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
   * The MIME type of the image.
   * Required when using base64 source type.
   *
   * @see https://docs.anthropic.com/claude/docs/vision#supported-image-types
   */
  mediaType?: AnthropicImageMediaType
}

/**
 * Supported document media types for Anthropic.
 */
export type AnthropicDocumentMediaType = 'application/pdf'

/**
 * Metadata for Anthropic document content parts (e.g., PDFs).
 */
export interface AnthropicDocumentMetadata {
  /**
   * The MIME type of the document.
   * Required for document content, typically 'application/pdf'.
   *
   * @see https://docs.anthropic.com/claude/docs/pdf-support
   */
  mediaType?: AnthropicDocumentMediaType
}

/**
 * Metadata for Anthropic audio content parts.
 * Note: Audio support in Anthropic may be limited; check current API capabilities.
 */
export interface AnthropicAudioMetadata {
  /**
   * The MIME type of the audio.
   */
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
  /**
   * The MIME type of the video.
   */
  mediaType?: 'video/mp4' | 'video/webm' | 'video/mpeg'
}

/**
 * Map of modality types to their Anthropic-specific metadata types.
 * Used for type inference when constructing multimodal messages.
 */
export interface AnthropicMessageMetadataByModality {
  image: AnthropicImageMetadata
  audio: AnthropicAudioMetadata
  video: AnthropicVideoMetadata
  document: AnthropicDocumentMetadata
}
