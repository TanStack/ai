/**
 * Metadata for Ollama image content parts.
 * Ollama primarily uses base64-encoded images.
 */
export interface OllamaImageMetadata {
  /**
   * Optional format hint for the image.
   * Ollama typically auto-detects the format from base64 data.
   */
  format?: 'jpeg' | 'png' | 'gif' | 'webp'
}

/**
 * Metadata for Ollama audio content parts.
 * Placeholder for future audio support.
 */
export interface OllamaAudioMetadata {
  format?: 'wav' | 'mp3' | 'ogg'
}

/**
 * Metadata for Ollama video content parts.
 * Placeholder for future video support.
 */
export interface OllamaVideoMetadata {
  format?: 'mp4' | 'webm'
}

/**
 * Metadata for Ollama document content parts.
 * Placeholder for future document support.
 */
export interface OllamaDocumentMetadata {
  /**
   * The MIME type of the document.
   */
  mediaType?: 'application/pdf'
}

/**
 * Map of modality types to their Ollama-specific metadata types.
 * Used for type inference when constructing multimodal messages.
 */
export interface OllamaMessageMetadataByModality {
  image: OllamaImageMetadata
  audio: OllamaAudioMetadata
  video: OllamaVideoMetadata
  document: OllamaDocumentMetadata
}
