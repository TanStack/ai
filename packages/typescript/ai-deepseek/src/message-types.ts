/**
 * DeepSeek-specific metadata types for multimodal content parts.
 * These types extend the base ContentPart metadata with DeepSeek-specific options.
 *
 * DeepSeek uses an OpenAI-compatible API, so metadata types are similar to OpenAI.
 * Note: DeepSeek currently has limited multimodal support compared to other providers.
 *
 * @see https://platform.deepseek.com/api-docs
 */

/**
 * Metadata for DeepSeek image content parts.
 * Controls how the model processes and analyzes images.
 * Note: DeepSeek supports viewing/processing images but not generating them.
 */
export interface DeepSeekImageMetadata {
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
 * Metadata for DeepSeek audio content parts.
 * Specifies the audio format for proper processing.
 * Note: Audio support is currently limited in DeepSeek models.
 */
export interface DeepSeekAudioMetadata {
  /**
   * The format of the audio.
   * Supported formats: mp3, wav, flac, etc.
   * @default 'mp3'
   */
  format?: 'mp3' | 'wav' | 'flac' | 'ogg' | 'webm' | 'aac'
}

/**
 * Metadata for DeepSeek video content parts.
 * Note: Video support is currently not available in DeepSeek models.
 */
export interface DeepSeekVideoMetadata {}

/**
 * Metadata for DeepSeek document content parts.
 * Note: Direct document support may vary; PDFs often need to be converted to images.
 */
export interface DeepSeekDocumentMetadata {}

/**
 * Metadata for DeepSeek text content parts.
 * Currently no specific metadata options for text in DeepSeek.
 */
export interface DeepSeekTextMetadata {}

/**
 * Map of modality types to their DeepSeek-specific metadata types.
 * Used for type inference when constructing multimodal messages.
 */
export interface DeepSeekMessageMetadataByModality {
  text: DeepSeekTextMetadata
  image: DeepSeekImageMetadata
  audio: DeepSeekAudioMetadata
  video: DeepSeekVideoMetadata
  document: DeepSeekDocumentMetadata
}
