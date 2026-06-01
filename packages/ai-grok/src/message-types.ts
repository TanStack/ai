/**
 * Grok-specific metadata types for multimodal content parts.
 * These types extend the base ContentPart metadata with Grok-specific options.
 *
 * Grok uses an OpenAI-compatible API, so metadata types are similar to OpenAI.
 *
 * @see https://docs.x.ai
 */

/**
 * Metadata for Grok image content parts.
 * Controls how the model processes and analyzes images.
 */
export interface GrokImageMetadata {
  /**
   * Controls how the model processes the image.
   * - 'auto': Let the model decide based on image size and content
   * - 'low': Use low resolution processing (faster, cheaper, less detail)
   * - 'high': Use high resolution processing (slower, more expensive, more detail)
   *
   * @default 'auto'
   */
  detail?: 'auto' | 'low' | 'high'
}

/**
 * Metadata for Grok audio content parts.
 * Specifies the audio format for proper processing.
 */
export interface GrokAudioMetadata {
  /**
   * The format of the audio.
   * Supported formats: mp3, wav, flac, etc.
   * @default 'mp3'
   */
  format?: 'mp3' | 'wav' | 'flac' | 'ogg' | 'webm' | 'aac'
}

/**
 * Metadata for Grok video content parts.
 * Note: Video support in Grok is limited; check current API capabilities.
 */
export interface GrokVideoMetadata {}

/**
 * Metadata for Grok document content parts.
 * Note: Direct document support may vary; PDFs often need to be converted to images.
 */
export interface GrokDocumentMetadata {}

/**
 * Metadata for Grok text content parts.
 * Currently no specific metadata options for text in Grok.
 */
export interface GrokTextMetadata {}

/**
 * Map of modality types to their Grok-specific metadata types.
 * Used for type inference when constructing multimodal messages.
 */
export interface GrokMessageMetadataByModality {
  text: GrokTextMetadata
  image: GrokImageMetadata
  audio: GrokAudioMetadata
  video: GrokVideoMetadata
  document: GrokDocumentMetadata
}
