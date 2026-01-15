/**
 * Z.AI-specific metadata types for multimodal content parts.
 * These types extend the base ContentPart metadata with Z.AI-specific options.
 * Since Z.AI is OpenAI-compatible, most types are similar to OpenAI.
 */

/**
 * Metadata for Z.AI image content parts.
 * Controls how the model processes and analyzes images.
 */
export interface ZAIImageMetadata {
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
 * Metadata for Z.AI audio content parts.
 * Specifies the audio format for proper processing.
 */
export interface ZAIAudioMetadata {
  /**
   * The format of the audio.
   * Supported formats: mp3, wav, flac, etc.
   * @default 'mp3'
   */
  format?: 'mp3' | 'wav' | 'flac' | 'ogg' | 'webm' | 'aac'
}

/**
 * Metadata for Z.AI video content parts.
 * Note: Video support in Z.AI may vary; check current API capabilities.
 */
export interface ZAIVideoMetadata {}

/**
 * Metadata for Z.AI document content parts.
 * Note: Direct document support may vary; PDFs often need to be converted to images.
 */
export interface ZAIDocumentMetadata {}

/**
 * Metadata for Z.AI text content parts.
 * Currently no specific metadata options for text in Z.AI.
 */
export interface ZAITextMetadata {}

/**
 * Map of modality types to their Z.AI-specific metadata types.
 * Used for type inference when constructing multimodal messages.
 */
export interface ZAIMessageMetadataByModality {
  text: ZAITextMetadata
  image: ZAIImageMetadata
  audio: ZAIAudioMetadata
  video: ZAIVideoMetadata
  document: ZAIDocumentMetadata
}