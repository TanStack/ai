/**
 * Nebius Token Factory-specific metadata types for multimodal content parts.
 * These types extend the base ContentPart metadata with Nebius-specific options.
 *
 * Nebius Token Factory uses OpenAI-compatible API, so metadata follows OpenAI conventions.
 * @see https://docs.tokenfactory.nebius.com
 */

/**
 * Metadata for Nebius image content parts.
 * Controls how the model processes and analyzes images.
 */
export interface NebiusImageMetadata {
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
 * Metadata for Nebius audio content parts.
 * Placeholder for future audio support.
 */
export interface NebiusAudioMetadata {
  /**
   * The format of the audio.
   */
  format?: 'mp3' | 'wav' | 'flac' | 'ogg' | 'webm' | 'aac'
}

/**
 * Metadata for Nebius video content parts.
 * Placeholder for future video support.
 */
export interface NebiusVideoMetadata {
  /**
   * The format of the video.
   */
  format?: 'mp4' | 'webm'
}

/**
 * Metadata for Nebius document content parts.
 * Placeholder for future document support.
 */
export interface NebiusDocumentMetadata {
  /**
   * The MIME type of the document.
   */
  mediaType?: 'application/pdf'
}

/**
 * Map of modality types to their Nebius-specific metadata types.
 * Used for type inference when constructing multimodal messages.
 */
export interface NebiusMessageMetadataByModality {
  text: unknown
  image: NebiusImageMetadata
  audio: NebiusAudioMetadata
  video: NebiusVideoMetadata
  document: NebiusDocumentMetadata
}
